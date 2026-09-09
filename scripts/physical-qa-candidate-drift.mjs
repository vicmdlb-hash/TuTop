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

export function candidateExactHeadIdentityValid(candidate) {
  const buildSha = String(candidate?.build_commit_sha || '');
  const gateSha = String(candidate?.gate_commit_sha || '');
  const stagingSha = String(candidate?.staging_smoke_commit_sha || '');
  return /^[a-f0-9]{40}$/.test(buildSha)
    && gateSha === buildSha
    && stagingSha === buildSha
    && Number.isSafeInteger(candidate?.gate_run_id) && candidate.gate_run_id > 0
    && Number.isSafeInteger(candidate?.staging_smoke_run_id) && candidate.staging_smoke_run_id > 0
    && Number.isSafeInteger(candidate?.build_run_id) && candidate.build_run_id > 0
    && Number.isSafeInteger(candidate?.artifact_id) && candidate.artifact_id > 0;
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
  const identityValid = candidateExactHeadIdentityValid(candidate);
  const active = candidate.physical_release_candidate === true;
  return {
    fresh: mismatches.length === 0 && (!active || identityValid),
    runtime_refs_fresh: mismatches.length === 0,
    identity_valid: identityValid,
    physical_release_candidate: active,
    candidate_status: String(candidate.candidate_status || ''),
    replacement_required: candidate.replacement_required === true,
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

export function evaluatePrebuildCandidateState(candidate, drift) {
  const activeExactHead = drift.fresh
    && drift.identity_valid === true
    && candidate.physical_release_candidate === true
    && candidate.candidate_status === 'active_exact_head'
    && candidate.replacement_required === false;
  if (activeExactHead) {
    return { pass: true, reason: 'current_candidate_still_fresh' };
  }
  const explicitlyObsolete = candidate.physical_release_candidate === false
    && candidate.candidate_status === 'obsolete_runtime_drift'
    && candidate.replacement_required === true;
  if (!drift.runtime_refs_fresh && explicitlyObsolete) {
    return { pass: true, reason: 'obsolete_candidate_acknowledged_replacement_required' };
  }
  return { pass: false, reason: 'candidate_state_inconsistent_with_runtime_drift' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const candidate = loadPhysicalQaCandidateManifest();
  const result = verifyCurrentCandidateRuntime();
  const prebuild = process.argv.includes('--prebuild');

  if (prebuild) {
    const state = evaluatePrebuildCandidateState(candidate, result);
    if (!state.pass) {
      console.error(`DETENIDO: estado de candidato Physical QA inconsistente (${state.reason}).`);
      process.exit(2);
    }
    if (candidate.physical_release_candidate === true) {
      console.log(`PASS prebuild: current exact-head Physical QA candidate remains fresh: artifact=${result.artifact_id}`);
    } else {
      console.log(`PASS prebuild: historical candidate ${result.artifact_id} is explicitly obsolete; replacement build is required and allowed.`);
    }
    process.exit(0);
  }

  const reusable = result.fresh
    && result.identity_valid === true
    && candidate.physical_release_candidate === true
    && candidate.candidate_status === 'active_exact_head'
    && candidate.replacement_required === false;
  if (!reusable) {
    console.error(`DETENIDO: APK candidate ${result.artifact_id} no es reutilizable para Physical QA actual.`);
    if (!result.identity_valid) console.error('DRIFT candidate exact-head identity invalid: gate/staging/build SHA or run identity mismatch.');
    for (const mismatch of result.mismatches) {
      console.error(`DRIFT ${mismatch.path} expected=${mismatch.expected_sha} actual=${mismatch.actual_sha || 'MISSING'}`);
    }
    process.exit(2);
  }
  console.log(`PASS physical QA candidate runtime and exact-head gate identity unchanged: artifact=${result.artifact_id} apk_sha256=${result.apk_sha256}`);
}
