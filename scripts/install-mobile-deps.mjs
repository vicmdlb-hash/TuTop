import { spawnSync } from 'node:child_process';

// Spark / zero-investment Android stack.
// TuTop currently does not import native Capacitor plugins from /src, so the APK build only
// needs the Capacitor runtime/platform plus the local CLI and asset generator.
// Keeping this minimal avoids pinning plugin package versions that do not share the
// @capacitor/core release number (for example @capacitor/app 8.5.1 does not exist).
const packages = [
  '@capacitor/core@8.5.1',
  '@capacitor/android@8.5.1',
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

console.log('Instalando stack Android mínimo Spark/cero inversión.');
console.log('No se instalan Firebase native plugins, servicios Blaze ni plugins Capacitor no usados.');
run(['install', '--save-exact', '--no-audit', '--no-fund', ...packages]);
run(['install', '--save-dev', '--save-exact', '--no-audit', '--no-fund', ...devPackages]);
