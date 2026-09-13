import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const RUNTIME_PATHS = [
  'src',
  'public',
  'assets',
  'config',
  'capacitor.config.json',
  'index.html',
  'package.json',
  'package-lock.json',
  'postcss.config.js',
  'tailwind.config.js',
  'tsconfig.json',
  'tsconfig.node.json',
  'vite.config.ts',
];

function stop(message) {
  console.error(`DETENIDO: ${message}`);
  process.exit(2);
}

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) stop(`falta ${name}`);
  return value;
}

function git(...args) {
  const result = spawnSync('git', args, { encoding: 'utf8', shell: false });
  if (result.status !== 0) stop(`git ${args.join(' ')} falló: ${String(result.stderr || '').trim()}`);
  return String(result.stdout || '').trim();
}

function parseSha256File(file) {
  if (!fs.existsSync(file)) stop(`falta checksum: ${file}`);
  const match = fs.readFileSync(file, 'utf8').match(/^([a-f0-9]{64})\s+/i);
  if (!match) stop('checksum APK inválido');
  return match[1].toLowerCase();
}

const version = String(process.env.TUTOP_BETA_VERSION || '0.9.1-beta.0').trim();
const versionMatch = version.match(/^0\.9\.(1|2)-beta\.\d+$/);
if (!versionMatch) stop(`versión beta TuTop inválida: ${version}`);
const minor = versionMatch[1];
const artifactStem = `TuTop-${version}-physical-qa-staging`;
const apkPath = path.resolve(process.env.TUTOP_APK_PATH || `${artifactStem}.apk`);
const checksumPath = path.resolve(process.env.TUTOP_APK_SHA256_PATH || `${apkPath}.sha256`);
const outputPath = path.resolve(process.env.TUTOP_CANDIDATE_OUTPUT_PATH || `PHYSICAL_QA_CANDIDATE_0.9.${minor}.generated.json`);
if (!fs.existsSync(apkPath)) stop(`falta APK: ${apkPath}`);

const headSha = required('GITHUB_SHA');
if (!/^[a-f0-9]{40}$/i.test(headSha)) stop('GITHUB_SHA inválido');
const resolvedHead = git('rev-parse', 'HEAD');
if (resolvedHead !== headSha) stop(`HEAD ${resolvedHead} no coincide con GITHUB_SHA ${headSha}`);

const artifactId = Number(required('TUTOP_UPLOAD_ARTIFACT_ID'));
const buildRunId = Number(required('GITHUB_RUN_ID'));
const runNumber = Number(required('GITHUB_RUN_NUMBER'));
if (!Number.isSafeInteger(artifactId) || artifactId <= 0) stop('artifact ID inválido');
if (!Number.isSafeInteger(buildRunId) || buildRunId <= 0) stop('build run ID inválido');
if (!Number.isSafeInteger(runNumber) || runNumber <= 0) stop('run number inválido');

const gateRunId = Number(required('TUTOP_VALIDATED_GATE_RUN_ID'));
const stagingRunId = Number(required('TUTOP_VALIDATED_STAGING_RUN_ID'));
const gateCommitSha = required('TUTOP_VALIDATED_GATE_SHA');
const stagingSmokeCommitSha = required('TUTOP_VALIDATED_STAGING_SHA');
if (!Number.isSafeInteger(gateRunId) || gateRunId <= 0) stop('gate run ID inválido');
if (!Number.isSafeInteger(stagingRunId) || stagingRunId <= 0) stop('staging run ID inválido');
if (!/^[a-f0-9]{40}$/i.test(gateCommitSha)) stop('gate SHA inválido');
if (!/^[a-f0-9]{40}$/i.test(stagingSmokeCommitSha)) stop('staging smoke SHA inválido');
if (gateCommitSha !== headSha) stop(`gate SHA ${gateCommitSha} no coincide con build SHA ${headSha}`);
if (stagingSmokeCommitSha !== headSha) stop(`staging smoke SHA ${stagingSmokeCommitSha} no coincide con build SHA ${headSha}`);

const apkSha256 = parseSha256File(checksumPath);
const apkSizeBytes = fs.statSync(apkPath).size;
if (!Number.isSafeInteger(apkSizeBytes) || apkSizeBytes <= 0) stop('tamaño APK inválido');

const clientRuntimeRefs = Object.fromEntries(RUNTIME_PATHS.map((repoPath) => [repoPath, git('rev-parse', `HEAD:${repoPath}`)]));
const buildTreeSha = git('rev-parse', 'HEAD^{tree}');
const stagingProject = String(process.env.TUTOP_FIREBASE_PROJECT_ID || '').trim();
if (stagingProject !== 'tutop-beta-vicmdlb-1356585881') stop(`staging project inválido: ${stagingProject}`);

const reviewsCutover = String(process.env.VITE_TUTOP_V2_REVIEWS_LAZY_CUTOVER || 'false') === 'true';
const walletCutover = String(process.env.VITE_TUTOP_V2_WALLET_LAZY_CUTOVER || 'false') === 'true';
const favoritesCutover = String(process.env.VITE_TUTOP_V2_FAVORITES_VISIBLE_CUTOVER || 'false') === 'true';

const candidate = {
  schema: 'tutop.physical-qa-candidate.v1',
  app_version: version,
  environment: 'staging',
  application_id: String(process.env.TUTOP_ANDROID_PACKAGE_NAME || 'mx.tutop.app'),
  staging_project: stagingProject,
  artifact_name: `${artifactStem}-${runNumber}`,
  artifact_id: artifactId,
  build_run_id: buildRunId,
  build_run_number: runNumber,
  gate_run_id: gateRunId,
  gate_commit_sha: gateCommitSha,
  staging_smoke_run_id: stagingRunId,
  staging_smoke_commit_sha: stagingSmokeCommitSha,
  build_commit_sha: headSha,
  build_tree_sha: buildTreeSha,
  apk_sha256: apkSha256,
  apk_size_bytes: apkSizeBytes,
  client_runtime_refs: clientRuntimeRefs,
  cost_cutovers: {
    reviews_lazy: reviewsCutover,
    wallet_lazy: walletCutover,
    favorites_visible: favoritesCutover,
  },
  physical_release_candidate: true,
  candidate_status: 'generated_exact_head_pending_repo_activation',
  replacement_required: false,
  generated_at: new Date().toISOString(),
  notes: `Generated from exact TuTop ${version} staging sources after same-SHA static and real-staging gates. This is a private Physical QA candidate, not production/Play readiness.`,
};

fs.writeFileSync(outputPath, `${JSON.stringify(candidate, null, 2)}\n`);
console.log(`PASS generated TuTop ${version} Physical QA candidate artifact: ${outputPath}`);
console.log(`head=${headSha} artifact=${artifactId} run=${buildRunId} apk_sha256=${apkSha256} size=${apkSizeBytes}`);
