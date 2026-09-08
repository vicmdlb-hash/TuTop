import fs from 'node:fs';
import path from 'node:path';

const candidatePath = path.resolve(process.argv[2] || 'PHYSICAL_QA_CANDIDATE.generated.json');
const metadataPath = path.resolve(process.argv[3] || 'TuTop-0.9.0-beta.0-physical-qa-staging.metadata.txt');

function stop(message) {
  console.error(`DETENIDO: ${message}`);
  process.exit(2);
}

if (!fs.existsSync(candidatePath)) stop(`falta candidate: ${candidatePath}`);
if (!fs.existsSync(metadataPath)) stop(`falta metadata: ${metadataPath}`);
const candidate = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
const metadata = Object.fromEntries(fs.readFileSync(metadataPath, 'utf8')
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => {
    const index = line.indexOf('=');
    if (index <= 0) stop(`línea metadata inválida: ${line}`);
    return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
  }));

const exact = [
  ['head_sha', candidate.build_commit_sha],
  ['gate_run_id', candidate.gate_run_id],
  ['staging_smoke_run_id', candidate.staging_smoke_run_id],
  ['firebase_project', candidate.staging_project],
  ['version', candidate.app_version],
  ['artifact_id', candidate.artifact_id],
  ['build_run_id', candidate.build_run_id],
  ['build_run_number', candidate.build_run_number],
  ['build_tree_sha', candidate.build_tree_sha],
  ['apk_sha256', candidate.apk_sha256],
  ['apk_size_bytes', candidate.apk_size_bytes],
  ['reviews_lazy_cutover', candidate?.cost_cutovers?.reviews_lazy],
  ['wallet_lazy_cutover', candidate?.cost_cutovers?.wallet_lazy],
  ['favorites_visible_cutover', candidate?.cost_cutovers?.favorites_visible],
];

for (const [field, expected] of exact) {
  if (!(field in metadata)) stop(`metadata.${field} faltante`);
  if (String(metadata[field]) !== String(expected)) stop(`metadata.${field}=${metadata[field]} != candidate=${expected}`);
}

if (!/^[a-f0-9]{40}$/.test(metadata.head_sha || '')) stop('metadata.head_sha inválido');
if (!/^[a-f0-9]{40}$/.test(metadata.build_tree_sha || '')) stop('metadata.build_tree_sha inválido');
if (!/^[a-f0-9]{64}$/.test(metadata.apk_sha256 || '')) stop('metadata.apk_sha256 inválido');
if (!['true', 'false'].includes(metadata.reviews_lazy_cutover)) stop('reviews_lazy_cutover inválido');
if (!['true', 'false'].includes(metadata.wallet_lazy_cutover)) stop('wallet_lazy_cutover inválido');
if (!['true', 'false'].includes(metadata.favorites_visible_cutover)) stop('favorites_visible_cutover inválido');

console.log('PASS Android metadata matches generated Physical QA candidate field by field');
console.log(`head=${metadata.head_sha} artifact=${metadata.artifact_id} apk_sha256=${metadata.apk_sha256}`);
