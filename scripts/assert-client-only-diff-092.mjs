import { spawnSync } from 'node:child_process';

const [baseArg, headArg] = process.argv.slice(2);
const base = String(baseArg || process.env.TUTOP_VALIDATED_BASE_SHA || '').trim();
const head = String(headArg || process.env.GITHUB_SHA || '').trim();

function stop(message, paths = []) {
  console.error(`DETENIDO: ${message}`);
  for (const path of paths) console.error(`- ${path}`);
  process.exit(43);
}

function git(...args) {
  const result = spawnSync('git', args, { encoding: 'utf8', shell: false });
  if (result.status !== 0) stop(`git ${args.join(' ')} falló: ${String(result.stderr || '').trim()}`);
  return String(result.stdout || '').trim();
}

if (!/^[a-f0-9]{40}$/i.test(base)) stop('TUTOP_VALIDATED_BASE_SHA inválido o faltante.');
if (!/^[a-f0-9]{40}$/i.test(head)) stop('GITHUB_SHA/HEAD inválido o faltante.');
git('cat-file', '-e', `${base}^{commit}`);
git('cat-file', '-e', `${head}^{commit}`);

const changed = git('diff', '--name-only', `${base}...${head}`)
  .split(/\r?\n/)
  .map((value) => value.trim())
  .filter(Boolean);

console.log(`Cambios desde base validada ${base}:`);
for (const path of changed) console.log(`- ${path}`);

const sensitiveExact = new Set([
  '.firebaserc',
  'firebase.json',
  'firestore.rules',
  'firestore.indexes.json',
]);
const sensitivePrefixes = ['firebase/', 'functions/'];
const sensitiveScript = /^scripts\/(?:prepare-firestore|harden-.*rules|optimize-.*rules|deploy-firebase|configure-app-check-staging|firebase-ai-staging-provision|prepare-staging-v2-auth|prepare-staging-android-app|staging-(?:v2-e2e|topi-ai-runtime|account-erasure|index-readiness)-smoke|staging-freeze-guard)\.mjs$/;

const backendSensitive = changed.filter((path) =>
  sensitiveExact.has(path)
  || sensitivePrefixes.some((prefix) => path.startsWith(prefix))
  || sensitiveScript.test(path),
);

if (backendSensitive.length) {
  stop('el cliente 0.9.2 ya no puede heredar evidencia de backend porque cambió una superficie backend/reglas/deploy sensible.', backendSensitive);
}

console.log('✅ Backend, reglas y scripts de mutación remota permanecen sin cambios desde la base 0.9.2 validada.');
console.log('✅ El diff actual puede reconstruirse como candidato cliente/nativo sin fingir una revalidación del backend.');
