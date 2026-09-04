import { spawnSync } from 'node:child_process';
const packages = [
  'firebase@12.18.0',
  '@capacitor/core@^8.5.1', '@capacitor/android@^8.5.1', '@capacitor/app@^8.5.1', '@capacitor/camera@^8.5.1',
  '@capacitor/haptics@^8.5.1', '@capacitor/keyboard@^8.5.1', '@capacitor/network@^8.5.1', '@capacitor/preferences@^8.5.1',
  '@capacitor/share@^8.5.1', '@capacitor/status-bar@^8.5.1',
  '@capacitor-firebase/authentication@^8.5.0', '@capacitor-firebase/messaging@^8.5.0', '@capacitor-firebase/app-check@^8.5.0',
];
const devPackages = ['@capacitor/cli@^8.5.1', '@capacitor/assets@^3.0.5', '@firebase/rules-unit-testing'];
function run(args) {
  const result = spawnSync('npm', args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('Instalando stack móvil/Firebase compatible con Capacitor 8. Revisa patch versions al ejecutar.');
run(['install', '--save', ...packages]);
run(['install', '--save-dev', ...devPackages]);
