import { spawnSync } from 'node:child_process';

const project = String(process.env.TUTOP_FIREBASE_PROJECT_ID || '').trim();
if (!project) {
  console.error('Falta TUTOP_FIREBASE_PROJECT_ID. Usa un proyecto Firebase dedicado a beta/staging.');
  process.exit(2);
}
if (process.env.TUTOP_ALLOW_FIREBASE_DEPLOY !== 'staging') {
  console.error('DETENIDO: define TUTOP_ALLOW_FIREBASE_DEPLOY=staging solo después de verificar el project ID.');
  process.exit(2);
}
if (/prod(uction)?/i.test(project) && process.env.TUTOP_ALLOW_PRODUCTION_FIREBASE !== '1') {
  console.error('DETENIDO: el project ID parece producción. Esta automatización es para staging/beta.');
  process.exit(2);
}

const isWindows = process.platform === 'win32';
const run = (command, args) => {
  console.log(`\n> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'inherit', shell: isWindows, env: process.env });
  if (result.status !== 0) process.exit(result.status || 1);
};

run('npm', ['run', 'check']);
run('npm', ['run', 'functions:build']);
run('npm', ['run', 'build']);
run('npx', ['firebase-tools', 'deploy', '--project', project, '--only', 'firestore:rules,firestore:indexes,storage,functions,hosting']);
console.log(`\n✅ Firebase staging desplegado en ${project}. Verifica Auth, App Check y URLs de Hosting antes de distribuir la beta.`);
