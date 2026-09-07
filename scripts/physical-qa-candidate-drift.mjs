import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const MANIFEST_PATH = path.resolve('docs/PHYSICAL_QA_CANDIDATE_0.9.json');

export function loadPhysicalQaCandidateManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) throw new Error('PHYSICAL_QA_CANDIDATE_MANIFEST_MISSING');
  const candidate = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  if (candidate?.schema !== 'tutop.physical-qa-candidate.v1') throw new Error('PHYSICAL_QA_CANDIDATE_SCHEMA_INVALID');
  if (!candidate?.client_runtime_refs || typeof candidate.client_runtime_refs !== 'object') throw new Error('PHYSICAL_QA_RUNTIME_REFS_MISSING');
  return candidate;
}

export function evaluateCandidateRuntimeDrift(candidate, resolveRef) {
  const mismatches = [];
  for (const [repoPath, expectedSha] of Object.entries(candidate.client_runtime_refs || {})) {
    let actualSha = null;
    try { actualSha = resolveRef(repoPath); }
    catch (error) {
      mismatches.push({ path: repoPath, expected_sha: expectedSha, actual_sha: null, reason: 'missing_or_unresolvable' });
      continue;
    }
    if (actualSha !== expectedSha) {
      mismatches.push({ path: repoPath, expected_sha: expectedSha, actual_sha: actualSha, reason: 'changed' });
    }
  }
  return {
    fresh: mismatches.length === 0,
    artifact_id: candidate.artifact_id,
    apk_sha256: candidate.apk_sha256,
    mismatches,
  };
}

function resolveGitObject(repoPath) {
  const result = spawnSync('git', ['rev-parse', `HEAD:${repoPath}`], { encoding: 'utf8', shell: false });
  if (result.status !== 0) throw new Error(String(result.stderr || 'git rev-parse failed').trim());
  return String(result.stdout || '').trim();
}

export function verifyCurrentCandidateRuntime() {
  const candidate = loadPhysicalQaCandidateManifest();
  return evaluateCandidateRuntimeDrift(candidate, resolveGitObject);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const result = verifyCurrentCandidateRuntime();
  if (!result.fresh) {
    console.error(`DETENIDO: APK candidate ${result.artifact_id} quedó obsoleta por drift de runtime`);
    for (const mismatch of result.mismatches) {
      console.error(`DRIFT ${mismatch.path} expected=${mismatch.expected_sha} actual=${mismatch.actual_sha || 'MISSING'}`);
    }
    process.exit(2);
  }
  console.log(`PASS physical QA candidate runtime unchanged: artifact=${result.artifact_id} apk_sha256=${result.apk_sha256}`);
}
