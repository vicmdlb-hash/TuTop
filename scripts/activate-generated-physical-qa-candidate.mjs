import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const source = path.resolve(process.argv[2] || 'PHYSICAL_QA_CANDIDATE.generated.json');
const destination = path.resolve(process.argv[3] || 'docs/PHYSICAL_QA_CANDIDATE_0.9.json');

function stop(message) {
  console.error(`DETENIDO: ${message}`);
  process.exit(2);
}

if (process.env.TUTOP_ALLOW_PHYSICAL_QA_CANDIDATE_ACTIVATION !== 'exact-head') {
  stop('candidate activation requiere TUTOP_ALLOW_PHYSICAL_QA_CANDIDATE_ACTIVATION=exact-head');
}
if (!fs.existsSync(source)) stop(`falta candidate generado: ${source}`);

const verification = spawnSync(process.execPath, ['scripts/verify-generated-physical-qa-candidate.mjs', source], {
  encoding: 'utf8',
  shell: false,
});
if (verification.status !== 0) stop(String(verification.stderr || verification.stdout || 'candidate verification failed').trim());

const candidate = JSON.parse(fs.readFileSync(source, 'utf8'));
if (candidate.candidate_status !== 'generated_exact_head_pending_repo_activation') stop('candidate generado tiene status inesperado');
if (candidate.physical_release_candidate !== true) stop('candidate generado no está activo');

const activated = {
  ...candidate,
  candidate_status: 'active_exact_head',
  physical_release_candidate: true,
  replacement_required: false,
  activated_at: new Date().toISOString(),
  notes: 'Activated from a verified exact-head generated Android candidate. Physical QA may begin only while the strict runtime drift gate remains green.',
};

fs.writeFileSync(destination, `${JSON.stringify(activated, null, 2)}\n`);
console.log(`PASS activated exact-head Physical QA candidate: ${destination}`);
console.log(`artifact=${activated.artifact_id} build_sha=${activated.build_commit_sha} apk_sha256=${activated.apk_sha256}`);
