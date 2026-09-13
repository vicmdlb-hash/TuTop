import { spawnSync } from 'node:child_process';

// Android-only stack. These packages are installed after the web build in CI so the
// normal Vite/typecheck dependency surface remains small. The app talks to native
// plugins through Capacitor.registerPlugin(); no provider secret is embedded in Vite.
const mobilePackages = [
  '@capacitor/core@8.5.1',
  '@capacitor/android@8.5.1',
  '@capacitor/geolocation@8.2.2',
  '@capacitor/camera@8.2.4',
  '@capacitor-firebase/messaging@8.5.1',
  '@capacitor-firebase/app-check@8.5.0',
  'firebase@12.18.0',
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

const ephemeralInstall = ['install', '--no-save', '--package-lock=false', '--no-audit', '--no-fund'];

console.log('Instalando stack Android TuTop 0.9.1: Capacitor + ubicación + cámara + FCM + App Check.');
console.log('Instalación efímera de una sola transacción: package.json y package-lock.json permanecen intactos.');
console.log('No se instalan Cloud Functions, Cloud Storage ni servicios Blaze.');
run([...ephemeralInstall, ...mobilePackages]);
