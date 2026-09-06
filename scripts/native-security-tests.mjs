import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const pass = (name, condition) => {
  if (!condition) throw new Error(`FAIL ${name}`);
  console.log(`PASS ${name}`);
};

const deps = read('scripts/install-mobile-deps.mjs');
const bootstrap = read('scripts/android-bootstrap.mjs');
const nativeSecurity = read('src/services/nativeFirebaseSecurity.ts');
const nativeAppCheck = read('src/services/nativeAppCheckToken.ts');
const rest = read('src/services/firebaseRest.ts');
const runtime = read('src/services/runtimeConfig.ts');
const appCheckStaging = read('scripts/configure-app-check-staging.mjs');

pass('Android build pins compatible native Firebase plugins',
  deps.includes("'@capacitor-firebase/messaging@8.5.1'")
  && deps.includes("'@capacitor-firebase/app-check@8.5.0'")
  && deps.includes("'firebase@12.18.0'"));

pass('V2 Android requires validated google-services and blocks historical Firebase',
  bootstrap.includes('V2 Android requiere google-services.json')
  && bootstrap.includes("const historicalProject = 'tutop-3a4f7'")
  && bootstrap.includes('V2 Android no puede usar el proyecto Firebase histórico'));

pass('FCM auto initialization is disabled until explicit user opt-in',
  bootstrap.includes('firebase_messaging_auto_init_enabled')
  && bootstrap.includes('android:value="false"'));

const initializeStart = nativeSecurity.indexOf('export async function initializeNativeFirebaseSecurity');
const enableStart = nativeSecurity.indexOf('export async function enableNativePushNotifications');
const initializeBody = nativeSecurity.slice(initializeStart, enableStart);
pass('native initialization never requests notification permission',
  initializeStart >= 0 && enableStart > initializeStart && !initializeBody.includes('requestPermissions'));
pass('notification permission request exists only in explicit enable flow',
  nativeSecurity.slice(enableStart).includes('requestPermissions'));

pass('native App Check uses auto refresh and never enables debug provider in app code',
  nativeAppCheck.includes('isTokenAutoRefreshEnabled: true')
  && nativeAppCheck.includes('setTokenAutoRefreshEnabled')
  && !nativeAppCheck.includes('debugToken: true'));

pass('Firebase REST attaches App Check to protected calls',
  rest.includes("'X-Firebase-AppCheck'")
  && rest.includes('getNativeAppCheckToken(false)')
  && rest.includes('identitytoolkit.googleapis.com')
  && rest.includes('firestore.googleapis.com'));

pass('V2 runtime hard-blocks legacy Firebase and pins staging project',
  runtime.includes("const HISTORICAL_PROJECT_ID = 'tutop-3a4f7'")
  && runtime.includes("const STAGING_PROJECT_ID = 'tutop-beta-vicmdlb-1356585881'")
  && runtime.includes('V2_LEGACY_FIREBASE_BLOCKED')
  && runtime.includes('V2_STAGING_PROJECT_MISMATCH'));

pass('App Check enforcement still requires explicit client-ready guard',
  appCheckStaging.includes('TUTOP_ALLOW_APP_CHECK_ENFORCEMENT')
  && appCheckStaging.includes('staging-v2-client-ready'));

console.log('Native Firebase security contracts: PASS');
