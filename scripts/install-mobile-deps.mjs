import { spawnSync } from 'node:child_process';

// Spark / zero-investment Android stack. Firebase access is via HTTPS REST from the web layer,
// so no Firebase native plugin or google-services.json is required for this phase.
const packages = [
  '@capacitor/core@8.5.1', '@capacitor/android@8.5.1', '@capacitor/app@8.5.1',
  '@capacitor/camera@8.5.1', '@capacitor/haptics@8.5.1', '@capacitor/keyboard@8.5.1',
  '@capacitor/network@8.5.1', '@capacitor/preferences@8.5.1', '@capacitor/share@8.5.1',
  '@capacitor/status-bar@8.5.1',
];
const devPackages = ['@capacitor/cli@8.5.1', '@capacitor/assets@3.0.5'];
function run(args) {
  const result = spawnSync('npm', args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('Instalando stack Android Spark/cero inversión. No se instalan Firebase native plugins ni servicios Blaze.');
run(['install', '--save', '--no-audit', '--no-fund', ...packages]);
run(['install', '--save-dev', '--no-audit', '--no-fund', ...devPackages]);
