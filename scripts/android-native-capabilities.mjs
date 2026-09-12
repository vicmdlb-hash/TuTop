import fs from 'node:fs';
import path from 'node:path';

const manifestPath = path.resolve('android/app/src/main/AndroidManifest.xml');

function stop(message) {
  console.error(`DETENIDO: ${message}`);
  process.exit(2);
}

if (!fs.existsSync(manifestPath)) stop('AndroidManifest.xml no existe; ejecuta después de cap sync.');
let manifest = fs.readFileSync(manifestPath, 'utf8');

const permissions = [
  '<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
  '<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />',
  '<uses-permission android:name="android.permission.CAMERA" />',
  '<uses-permission android:name="android.permission.RECORD_AUDIO" />',
];

const manifestMarker = '<manifest';
const markerIndex = manifest.indexOf(manifestMarker);
const manifestOpenEnd = markerIndex >= 0 ? manifest.indexOf('>', markerIndex) : -1;
if (manifestOpenEnd < 0) stop('no pude localizar apertura <manifest>.');

const missing = permissions.filter((permission) => !manifest.includes(permission));
if (missing.length) {
  manifest = `${manifest.slice(0, manifestOpenEnd + 1)}\n    ${missing.join('\n    ')}${manifest.slice(manifestOpenEnd + 1)}`;
}

// TuTop requests these capabilities just-in-time from the relevant UI. We do
// not request background location and we do not add storage permissions.
if (manifest.includes('ACCESS_BACKGROUND_LOCATION')) stop('TuTop no debe declarar ubicación en segundo plano.');
if (manifest.includes('READ_EXTERNAL_STORAGE') || manifest.includes('WRITE_EXTERNAL_STORAGE')) {
  stop('TuTop no debe recuperar permisos legacy de almacenamiento.');
}

fs.writeFileSync(manifestPath, manifest);
console.log('✅ Android capabilities 0.9.1: coarse/fine location, camera and microphone declared; no background location/storage permissions.');
