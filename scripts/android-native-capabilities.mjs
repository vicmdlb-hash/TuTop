import fs from 'node:fs';
import path from 'node:path';

const manifestPath = path.resolve('android/app/src/main/AndroidManifest.xml');

function stop(message) {
  console.error(`DETENIDO: ${message}`);
  process.exit(2);
}

if (!fs.existsSync(manifestPath)) stop('AndroidManifest.xml no existe; ejecuta después de cap sync.');
let manifest = fs.readFileSync(manifestPath, 'utf8');

// TuTop 0.9.2 only needs approximate foreground location and microphone on tap.
// Capacitor Camera 8 uses system camera/photo-picker activities, so no legacy
// CAMERA/storage permission is requested while saveToGallery=false.
const permissions = [
  '<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
  '<uses-permission android:name="android.permission.RECORD_AUDIO" />',
];

const manifestMarker = '<manifest';
const markerIndex = manifest.indexOf(manifestMarker);
let manifestOpenEnd = markerIndex >= 0 ? manifest.indexOf('>', markerIndex) : -1;
if (manifestOpenEnd < 0) stop('no pude localizar apertura <manifest>.');

// tools:ignore is intentionally used only for the Play-services Photo Picker
// backport metadata service. That service is discovered by Play services at
// runtime and is not linked as an app class, so Android lint otherwise reports
// a false-positive MissingClass.
let manifestOpen = manifest.slice(markerIndex, manifestOpenEnd + 1);
if (!manifestOpen.includes('xmlns:tools=')) {
  manifestOpen = manifestOpen.replace('<manifest', '<manifest xmlns:tools="http://schemas.android.com/tools"');
  manifest = `${manifest.slice(0, markerIndex)}${manifestOpen}${manifest.slice(manifestOpenEnd + 1)}`;
  manifestOpenEnd = markerIndex + manifestOpen.length - 1;
}

const missing = permissions.filter((permission) => !manifest.includes(permission));
if (missing.length) {
  manifest = `${manifest.slice(0, manifestOpenEnd + 1)}\n    ${missing.join('\n    ')}${manifest.slice(manifestOpenEnd + 1)}`;
}

manifest = manifest
  .replace(/\s*<uses-permission android:name="android\.permission\.ACCESS_FINE_LOCATION"\s*\/>/g, '')
  .replace(/\s*<uses-permission android:name="android\.permission\.CAMERA"\s*\/>/g, '');

const appStart = manifest.indexOf('<application');
let appEnd = appStart >= 0 ? manifest.indexOf('>', appStart) : -1;
if (appEnd < 0) stop('no pude localizar <application> en AndroidManifest.xml.');
let applicationOpen = manifest.slice(appStart, appEnd + 1);
if (/android:allowBackup="[^"]*"/.test(applicationOpen)) applicationOpen = applicationOpen.replace(/android:allowBackup="[^"]*"/, 'android:allowBackup="false"');
else applicationOpen = applicationOpen.replace('<application', '<application android:allowBackup="false"');
if (/android:usesCleartextTraffic="[^"]*"/.test(applicationOpen)) applicationOpen = applicationOpen.replace(/android:usesCleartextTraffic="[^"]*"/, 'android:usesCleartextTraffic="false"');
else applicationOpen = applicationOpen.replace('<application', '<application android:usesCleartextTraffic="false"');
manifest = `${manifest.slice(0, appStart)}${applicationOpen}${manifest.slice(appEnd + 1)}`;

// Android 11/12 devices without the modular Photo Picker can request the
// backported picker through Google Play services. Newer devices ignore it.
if (!manifest.includes('photopicker_activity:0:required')) {
  appEnd = manifest.indexOf('>', manifest.indexOf('<application'));
  const photoPickerBackport = `
        <service
            android:name="com.google.android.gms.metadata.ModuleDependencies"
            android:enabled="false"
            android:exported="false"
            tools:ignore="MissingClass">
            <intent-filter>
                <action android:name="com.google.android.gms.metadata.MODULE_DEPENDENCIES" />
            </intent-filter>
            <meta-data android:name="photopicker_activity:0:required" android:value="" />
        </service>`;
  manifest = `${manifest.slice(0, appEnd + 1)}${photoPickerBackport}${manifest.slice(appEnd + 1)}`;
}

if (manifest.includes('ACCESS_FINE_LOCATION')) stop('TuTop 0.9.2 no debe pedir ubicación precisa.');
if (manifest.includes('ACCESS_BACKGROUND_LOCATION')) stop('TuTop no debe declarar ubicación en segundo plano.');
if (manifest.includes('android.permission.CAMERA')) stop('Capacitor Camera 8 no necesita permiso CAMERA para el flujo de actividad del sistema.');
if (manifest.includes('READ_EXTERNAL_STORAGE') || manifest.includes('WRITE_EXTERNAL_STORAGE')) stop('TuTop no debe recuperar permisos legacy de almacenamiento.');
if (!manifest.includes('android.permission.ACCESS_COARSE_LOCATION')) stop('falta permiso de ubicación aproximada.');
if (!manifest.includes('android.permission.RECORD_AUDIO')) stop('falta permiso de micrófono bajo demanda.');
if (!manifest.includes('photopicker_activity:0:required')) stop('falta backport del Photo Picker para Android compatible.');
if (!manifest.includes('xmlns:tools="http://schemas.android.com/tools"')) stop('falta namespace tools requerido por el Photo Picker backport.');
if (!manifest.includes('tools:ignore="MissingClass"')) stop('falta supresión acotada de MissingClass para el Photo Picker backport.');
if (!manifest.includes('android:allowBackup="false"')) stop('allowBackup debe quedar desactivado.');
if (!manifest.includes('android:usesCleartextTraffic="false"')) stop('cleartext traffic debe quedar desactivado.');

fs.writeFileSync(manifestPath, manifest);
console.log('✅ Android 0.9.2: coarse location + mic bajo demanda + camera/photo picker sin permisos legacy + backport Photo Picker.');
