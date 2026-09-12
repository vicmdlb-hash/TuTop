import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { candidateExactHeadIdentityValid } from './physical-qa-candidate-drift.mjs';

const candidatePath = path.resolve(process.argv[2] || 'docs/PHYSICAL_QA_CANDIDATE_0.9.json');

function stop(message) {
  console.error(`DETENIDO: ${message}`);
  process.exit(2);
}

if (process.env.TUTOP_ALLOW_PHYSICAL_QA_TEMPLATE_REBIND !== 'exact-head') {
  stop('template rebind requiere TUTOP_ALLOW_PHYSICAL_QA_TEMPLATE_REBIND=exact-head');
}
if (!fs.existsSync(candidatePath)) stop(`falta candidate: ${candidatePath}`);
const candidate = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
if (candidate?.schema !== 'tutop.physical-qa-candidate.v1') stop('candidate schema inválido');
if (candidate?.physical_release_candidate !== true) stop('candidate no está activo');
if (candidate?.candidate_status !== 'active_exact_head') stop('candidate debe estar active_exact_head');
if (candidate?.replacement_required !== false) stop('candidate activo no puede requerir reemplazo');
if (!candidateExactHeadIdentityValid(candidate)) stop('candidate activo carece de identidad exact-head gate/staging/build válida');

const drift = spawnSync(process.execPath, ['scripts/physical-qa-candidate-drift.mjs'], { encoding: 'utf8', shell: false });
if (drift.status !== 0) stop(String(drift.stderr || drift.stdout || 'strict drift failed').trim());

const binding = {
  artifact_name: candidate.artifact_name,
  artifact_id: candidate.artifact_id,
  build_run_id: candidate.build_run_id,
  build_commit_sha: candidate.build_commit_sha,
  build_tree_sha: candidate.build_tree_sha,
  apk_sha256: candidate.apk_sha256,
  gate_run_id: candidate.gate_run_id,
  gate_commit_sha: candidate.gate_commit_sha,
  staging_smoke_run_id: candidate.staging_smoke_run_id,
  staging_smoke_commit_sha: candidate.staging_smoke_commit_sha,
};
const cases = Object.fromEntries([
  'install_boot','auth_identity','reinstall_identity','keyboard','android_back','lifecycle','safe_areas','rotation',
  'offline_reconnect','push_foreground','push_background','push_cold_start','push_deep_link','app_check_token_observed',
].map((key) => [key, 'pending']));

function deviceTemplate(slot) {
  return {
    schema: 'tutop.physical-qa-evidence.v1',
    app_version: candidate.app_version,
    environment: 'staging',
    candidate: binding,
    evidence_session_id: `PENDIENTE-DEVICE-${slot}`,
    evidence_started_at: 'PENDIENTE-ISO8601',
    evidence_completed_at: 'PENDIENTE-ISO8601',
    device: {
      slot,
      label: `PENDIENTE-DISPOSITIVO-${slot}`,
      manufacturer: 'PENDIENTE',
      model: 'PENDIENTE',
      android_version: 'PENDIENTE',
      viewport: 'PENDIENTE',
      installation: 'clean|upgrade|reinstall',
      physical: false,
    },
    required_cases: cases,
    diagnostic_report: null,
    fcm_fixture_report: null,
    app_check_evidence: null,
    screenshots: [
      { case: 'keyboard', captured_at: 'PENDIENTE-ISO8601', sha256: 'PENDIENTE-SHA256' },
      { case: 'safe_areas', captured_at: 'PENDIENTE-ISO8601', sha256: 'PENDIENTE-SHA256' },
      { case: 'rotation', captured_at: 'PENDIENTE-ISO8601', sha256: 'PENDIENTE-SHA256' },
    ],
    notes: `Template Device ${slot} regenerado desde candidato exact-head activo. Todos los campos de evidencia permanecen pendientes y deben completarse sólo con observación física real.`,
  };
}

const fcm = {
  schema: 'tutop.fcm-physical-fixture.v1',
  candidate: {
    artifact_id: candidate.artifact_id,
    build_run_id: candidate.build_run_id,
    build_tree_sha: candidate.build_tree_sha,
    apk_sha256: candidate.apk_sha256,
  },
  device_slot: 'A|B',
  evidence_session_id: 'PENDIENTE-FCM-SESSION',
  evidence_started_at: 'PENDIENTE-ISO8601',
  evidence_completed_at: 'PENDIENTE-ISO8601',
  scenarios: [
    { name: 'foreground', events: [] },
    { name: 'background', events: [] },
    { name: 'cold_start', events: [] },
    { name: 'deep_link', events: [] },
  ],
  notes: 'Template FCM regenerado desde candidato exact-head activo. No incluye evidencia, token FCM, notification ID crudo, teléfono ni payload sensible.',
};

const appCheck = {
  status: 'pending_human',
  platform: 'android',
  app_version: candidate.app_version,
  staging_project: candidate.staging_project,
  candidate_apk_sha256: candidate.apk_sha256,
  candidate_artifact_id: candidate.artifact_id,
  candidate_build_run_id: candidate.build_run_id,
  candidate_build_tree_sha: candidate.build_tree_sha,
  device_count: 0,
  devices: [
    { slot: 'A', physical: false, evidence_session_id: 'PENDIENTE-DEVICE-A', profile_fingerprint_sha256: 'PENDIENTE-SHA256-SIN-HARDWARE-ID', app_check_token_observed: false, verified_at: null },
    { slot: 'B', physical: false, evidence_session_id: 'PENDIENTE-DEVICE-B', profile_fingerprint_sha256: 'PENDIENTE-SHA256-SIN-HARDWARE-ID', app_check_token_observed: false, verified_at: null },
  ],
  app_check_token_observed: false,
  verified_at: null,
  contains_raw_token: false,
  evidence_note: 'Template App Check regenerado desde candidato exact-head activo. Completar sólo con dos sesiones físicas reales; nunca guardar token App Check ni hardware IDs crudos.',
};

const writes = [
  ['docs/PHYSICAL_QA_DEVICE_A_0.9.json', deviceTemplate('A')],
  ['docs/PHYSICAL_QA_DEVICE_B_0.9.json', deviceTemplate('B')],
  ['docs/FCM_PHYSICAL_FIXTURE_TEMPLATE_0.9.json', fcm],
  ['docs/APP_CHECK_PHYSICAL_EVIDENCE_TEMPLATE.json', appCheck],
];
for (const [file, value] of writes) fs.writeFileSync(path.resolve(file), `${JSON.stringify(value, null, 2)}\n`);

console.log(`PASS rebound Physical QA templates to active candidate artifact=${candidate.artifact_id}`);
console.log('All device/session/evidence fields remain pending/false/null; no physical evidence was synthesized.');
