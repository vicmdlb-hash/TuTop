import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const file = path.resolve(process.argv[2] || 'PHYSICAL_QA_CANDIDATE.generated.json');
const metadataFile = path.resolve(process.argv[3] || 'TuTop-0.9.0-beta.0-physical-qa-staging.metadata.txt');

function stop(message) {
  console.error(`DETENIDO: ${message}`);
  process.exit(2);
}

function git(...args) {
  const result = spawnSync('git', args, { encoding: 'utf8', shell: false });
  if (result.status !== 0) stop(`git ${args.join(' ')} falló`);
  return String(result.stdout || '').trim();
}

if (!fs.existsSync(file)) stop(`falta candidate manifest: ${file}`);
const candidate = JSON.parse(fs.readFileSync(file, 'utf8'));
if (candidate?.schema !== 'tutop.physical-qa-candidate.v1') stop('schema candidate inválido');
if (candidate?.physical_release_candidate !== true) stop('candidate generado no está marcado activo');
if (candidate?.candidate_status !== 'generated_exact_head_pending_repo_activation') stop('candidate_status inválido');
if (candidate?.replacement_required !== false) stop('candidate generado no debe requerir reemplazo');
if (candidate?.environment !== 'staging') stop('candidate no es staging');
if (candidate?.staging_project !== 'tutop-beta-vicmdlb-1356585881') stop('candidate apunta a proyecto incorrecto');

const head = git('rev-parse', 'HEAD');
const tree = git('rev-parse', 'HEAD^{tree}');
if (candidate.build_commit_sha !== head) stop(`candidate SHA ${candidate.build_commit_sha} != HEAD ${head}`);
if (candidate.build_tree_sha !== tree) stop('candidate tree SHA no coincide con HEAD');
if (!Number.isSafeInteger(candidate.artifact_id) || candidate.artifact_id <= 0) stop('artifact_id inválido');
if (!Number.isSafeInteger(candidate.build_run_id) || candidate.build_run_id <= 0) stop('build_run_id inválido');
if (!Number.isSafeInteger(candidate.gate_run_id) || candidate.gate_run_id <= 0) stop('gate_run_id inválido');
if (!Number.isSafeInteger(candidate.staging_smoke_run_id) || candidate.staging_smoke_run_id <= 0) stop('staging_smoke_run_id inválido');
if (!/^[a-f0-9]{64}$/.test(String(candidate.apk_sha256 || ''))) stop('apk_sha256 inválido');
if (!Number.isSafeInteger(candidate.apk_size_bytes) || candidate.apk_size_bytes <= 0) stop('apk_size_bytes inválido');

const refs = candidate.client_runtime_refs;
if (!refs || typeof refs !== 'object' || !Object.keys(refs).length) stop('client_runtime_refs faltantes');
for (const [repoPath, expected] of Object.entries(refs)) {
  const actual = git('rev-parse', `HEAD:${repoPath}`);
  if (actual !== expected) stop(`runtime ref drift ${repoPath}: expected=${expected} actual=${actual}`);
}

if (typeof candidate?.cost_cutovers?.reviews_lazy !== 'boolean') stop('reviews_lazy flag inválido');
if (typeof candidate?.cost_cutovers?.wallet_lazy !== 'boolean') stop('wallet_lazy flag inválido');
if (typeof candidate?.cost_cutovers?.favorites_visible !== 'boolean') stop('favorites_visible flag inválido');

if (!fs.existsSync(metadataFile)) stop(`falta metadata Android: ${metadataFile}`);
const metadataCheck = spawnSync(process.execPath, [
  'scripts/verify-physical-qa-candidate-metadata.mjs',
  file,
  metadataFile,
], { encoding: 'utf8', shell: false });
if (metadataCheck.status !== 0) stop(String(metadataCheck.stderr || metadataCheck.stdout || 'metadata mismatch').trim());

console.log(`PASS generated Physical QA candidate matches exact checkout and Android metadata: ${head}`);
console.log(`artifact=${candidate.artifact_id} run=${candidate.build_run_id} apk_sha256=${candidate.apk_sha256}`);
