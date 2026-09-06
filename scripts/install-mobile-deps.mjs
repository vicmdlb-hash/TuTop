import { spawnSync } from 'node:child_process';

// Android-only stack. These packages are installed after the web build in CI so the
// normal Vite/typecheck dependency surface remains small. The app talks to the native
// plugins through Capacitor.registerPlugin(), therefore no Firebase private credential
// or Blaze-only service is embedded in the web bundle.
const packages = [
  '@capacitor/core@8.5.1',
  '@capacitor/android@8.5.1',
  '@capacitor-firebase/messaging@8.5.1',
  '@capacitor-firebase/app-check@8.5.0',
  'firebase@12.18.0',
];

const devPackages = [
  '@capacitor/cli@8.5.1',
  '@capacitor/assets@3.0.5',
];

function run(args) {
  const result = spawnSync('npm', args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log('Instalando stack Android TuTop 0.8.5: Capacitor + FCM + App Check.');
console.log('No se instalan Cloud Functions, Cloud Storage ni servicios Blaze.');
run(['install', '--save-exact', '--no-audit', '--no-fund', ...packages]);
run(['install', '--save-dev', '--save-exact', '--no-audit', '--no-fund', ...devPackages]);
