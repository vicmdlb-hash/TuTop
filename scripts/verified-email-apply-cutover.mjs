import fs from 'node:fs';
import crypto from 'node:crypto';
import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';
import { promoteVerifiedRules, STAGING } from './verified-email-atomic-cutover.mjs';

if (!process.argv.includes('--apply')) throw new Error('EXPLICIT_APPLY_REQUIRED');
if (process.env.GITHUB_REF_NAME !== 'fix/tutop-staging-promotion-snapshot') throw new Error('CUTOVER_BRANCH_REQUIRED');
if (process.env.TUTOP_CUTOVER_DEVICE_INSTALLED !== 'true') throw new Error('DEVICE_INSTALL_CONFIRMATION_REQUIRED');
if (process.env.TUTOP_CUTOVER_EXCLUSIVE_WINDOW !== 'true') throw new Error('EXCLUSIVE_WINDOW_REQUIRED');
const actionId = String(process.env.TUTOP_CUTOVER_ACTION_ID || '').trim();
if (!/^[A-Za-z0-9._:-]{8,100}$/.test(actionId)) throw new Error('VALID_ACTION_ID_REQUIRED');

const source = fs.readFileSync('firebase/firestore.v2.generated.rules','utf8').replace(/\r\n/g,'\n');
const testedHash = 'b903644ebb5b28b3aef4ab38131a8a79d86c7d3c0e552868601fbf4a69fdf572';
const actualHash = crypto.createHash('sha256').update(source).digest('hex');
if (actualHash !== testedHash) throw new Error('RULES_DIFFERS_FROM_73_PASS_EMULATOR_SOURCE');

const snapshot = JSON.parse(fs.readFileSync('staging-promotion-snapshot/read-only-preflight.json','utf8'));
const expectedRuleset = snapshot?.current_rules?.ruleset_name;
if (!expectedRuleset) throw new Error('FRESH_RELEASE_SNAPSHOT_REQUIRED');

const token = await firebaseCiAccessToken();
const releaseName = 'projects/' + STAGING + '/releases/cloud.firestore';
let candidateName = '';

async function request(url, { method='GET', body } = {}) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new Error('CUTOVER_HTTP_' + res.status);
  return res.json();
}

const api = {
  billing: () => request('https://cloudbilling.googleapis.com/v1/projects/' + STAGING + '/billingInfo'),
  release: () => request('https://firebaserules.googleapis.com/v1/' + releaseName),
  ruleset: (name) => request('https://firebaserules.googleapis.com/v1/' + name),
  createRuleset: async (content) => {
    const created = await request('https://firebaserules.googleapis.com/v1/projects/' + STAGING + '/rulesets', {
      method: 'POST',
      body: { source: { files: [{ name: 'firestore.rules', content }] } },
    });
    candidateName = created.name;
    return created;
  },
  patch: (rulesetName) => request('https://firebaserules.googleapis.com/v1/' + releaseName, {
    method: 'PATCH',
    body: { release: { name: releaseName, rulesetName }, updateMask: 'rulesetName' },
  }),
  verify: async () => {
    const release = await request('https://firebaserules.googleapis.com/v1/' + releaseName);
    if (!candidateName || release.rulesetName !== candidateName) throw new Error('CUTOVER_VERIFY_RELEASE_MISMATCH');
    const ruleset = await request('https://firebaserules.googleapis.com/v1/' + candidateName);
    const deployedSource = String(ruleset?.source?.files?.find((file) => file.name === 'firestore.rules')?.content || '').replace(/\r\n/g,'\n');
    if (crypto.createHash('sha256').update(deployedSource).digest('hex') !== testedHash) throw new Error('CUTOVER_VERIFY_SOURCE_HASH_MISMATCH');
  },
};

const records = [];
const result = await promoteVerifiedRules({
  api,
  project: process.env.TUTOP_FIREBASE_PROJECT_ID,
  source,
  expectedRuleset,
  apply: true,
  deviceInstalled: true,
  exclusiveWindow: true,
  validated: true,
  record: (value) => records.push(value),
});

fs.mkdirSync('staging-promotion-snapshot', { recursive: true });
fs.writeFileSync('staging-promotion-snapshot/applied-cutover.json', JSON.stringify({
  action_id: actionId,
  result,
  rules_sha256: testedHash,
  candidate_source_sha: '9dfbe008b70f60cc88b03961aac1e15455f2aebb',
  tool_source_sha: process.env.GITHUB_SHA,
  device_installed_confirmed: true,
  exclusive_window_confirmed: true,
  spend: 0,
  records,
}, null, 2) + '\n');
console.log(JSON.stringify({ status: result.status, action_id: actionId, candidate: result.candidate, rollback: result.rollback }));
