export interface FirebaseRuntimeConfig {
  apiKey: string;
  projectId: string;
  authDomain?: string;
  appId?: string;
  storageBucket?: string;
}

const STORAGE_KEY = 'tutop.firebase.config.v1';
const HISTORICAL_PROJECT_ID = 'tutop-3a4f7';
const STAGING_PROJECT_ID = 'tutop-beta-vicmdlb-1356585881';

// Stable V1 keeps its historical backend until an explicit release migration.
// V2 is forbidden from using this config by assertRuntimeEnvironment().
const BUILT_IN_CONFIG: FirebaseRuntimeConfig = {
  apiKey: 'AIzaSyDWEv_N_CMwtvPzbPQ7-6zajJfOf06WR7A',
  authDomain: 'tutop-3a4f7.firebaseapp.com',
  projectId: HISTORICAL_PROJECT_ID,
  appId: '1:418411650162:web:5e435d81fb1e7880a9b6eb',
  storageBucket: 'tutop-3a4f7.appspot.com',
};

function envConfig(): FirebaseRuntimeConfig | null {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY?.trim();
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim();
  if (!apiKey || !projectId) return null;
  return {
    apiKey,
    projectId,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim() || undefined,
    appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim() || undefined,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET?.trim() || undefined,
  };
}

function storedConfig(): FirebaseRuntimeConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FirebaseRuntimeConfig>;
    if (!parsed.apiKey?.trim() || !parsed.projectId?.trim()) return null;
    return {
      apiKey: parsed.apiKey.trim(),
      projectId: parsed.projectId.trim(),
      authDomain: parsed.authDomain?.trim() || undefined,
      appId: parsed.appId?.trim() || undefined,
      storageBucket: parsed.storageBucket?.trim() || undefined,
    };
  } catch {
    return null;
  }
}

function v2Enabled() {
  return String(import.meta.env.VITE_TUTOP_SCHEMA_V2 || '').toLowerCase() === 'true';
}

function expectedEnvironment() {
  return String(import.meta.env.VITE_TUTOP_ENVIRONMENT || '').trim().toLowerCase();
}

export function assertRuntimeEnvironment(config: FirebaseRuntimeConfig) {
  if (!v2Enabled()) return config;
  if (config.projectId === HISTORICAL_PROJECT_ID) throw new Error('V2_LEGACY_FIREBASE_BLOCKED');

  const environment = expectedEnvironment();
  if (environment === 'staging' && config.projectId !== STAGING_PROJECT_ID) throw new Error('V2_STAGING_PROJECT_MISMATCH');
  if (environment === 'production' && /(beta|staging|stage|dev|test|sandbox)/i.test(config.projectId)) throw new Error('V2_PRODUCTION_PROJECT_MISMATCH');
  if (environment && !['development', 'staging', 'production'].includes(environment)) throw new Error('INVALID_TUTOP_ENVIRONMENT');
  return config;
}

export function getFirebaseConfig(): FirebaseRuntimeConfig {
  return assertRuntimeEnvironment(envConfig() || storedConfig() || BUILT_IN_CONFIG);
}

// Kept for admin/development overrides. Normal users never see this flow.
export function saveFirebaseConfig(config: FirebaseRuntimeConfig) {
  const clean: FirebaseRuntimeConfig = {
    apiKey: config.apiKey.trim(),
    projectId: config.projectId.trim(),
    authDomain: config.authDomain?.trim() || undefined,
    appId: config.appId?.trim() || undefined,
    storageBucket: config.storageBucket?.trim() || undefined,
  };
  if (!clean.apiKey || !clean.projectId) throw new Error('Configuración incompleta.');
  assertRuntimeEnvironment(clean);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
}

export function clearFirebaseConfig() {
  localStorage.removeItem(STORAGE_KEY);
}

export function parseFirebaseConfig(input: string): FirebaseRuntimeConfig {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('Configuración vacía.');
  let candidate = trimmed;
  const objectStart = candidate.indexOf('{');
  const objectEnd = candidate.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) candidate = candidate.slice(objectStart, objectEnd + 1);
  candidate = candidate
    .replace(/([,{]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
    .replace(/'/g, '"')
    .replace(/,\s*}/g, '}');

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    throw new Error('No pude leer esa configuración.');
  }
  const apiKey = String(parsed.apiKey || '').trim();
  const projectId = String(parsed.projectId || '').trim();
  if (!apiKey || !projectId) throw new Error('Configuración incompleta.');
  return assertRuntimeEnvironment({
    apiKey,
    projectId,
    authDomain: parsed.authDomain ? String(parsed.authDomain) : undefined,
    appId: parsed.appId ? String(parsed.appId) : undefined,
    storageBucket: parsed.storageBucket ? String(parsed.storageBucket) : undefined,
  });
}