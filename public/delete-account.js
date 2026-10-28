import { trustedWebDeletionStatus } from './deletion-completion-proof.js';
import { deletionJsonRequest } from './deletion-request-timeout.js';

const CONFIG_URL = '/tutop-web-config.json';
const AUTH_BASE = 'https://identitytoolkit.googleapis.com/v1';
const FIRESTORE_BASE = 'https://firestore.googleapis.com/v1';

const state = {
  config: null,
  session: null,
  busy: false,
};

const byId = (id) => document.getElementById(id);
const loginForm = byId('login-form');
const emailInput = byId('email');
const passwordInput = byId('password');
const loginButton = byId('login-button');
const logoutButton = byId('logout-button');
const requestButton = byId('request-delete-button');
const confirmInput = byId('confirm-delete');
const accountPanel = byId('account-panel');
const accountEmail = byId('account-email');
const statusBox = byId('status');

function setStatus(message, tone = 'neutral') {
  statusBox.textContent = message;
  statusBox.dataset.tone = tone;
}

function setBusy(busy) {
  state.busy = Boolean(busy);
  loginButton.disabled = state.busy;
  requestButton.disabled = state.busy || !state.session || !confirmInput.checked;
  logoutButton.disabled = state.busy || !state.session;
  confirmInput.disabled = state.busy;
}

function clearSession() {
  state.session = null;
  // Do not leave the previous owner's email visible on a shared device.
  emailInput.value = '';
  passwordInput.value = '';
  accountEmail.textContent = '';
  accountPanel.hidden = true;
  loginForm.hidden = false;
  confirmInput.checked = false;
  setBusy(false);
}

async function loadConfig() {
  const { data: config } = await deletionJsonRequest(CONFIG_URL, {
    method: 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (!config?.apiKey || !config?.projectId || !config?.appId) throw new Error('WEB_CONFIG_INCOMPLETE');
  state.config = {
    apiKey: String(config.apiKey),
    projectId: String(config.projectId),
    appId: String(config.appId),
    authDomain: String(config.authDomain || ''),
    environment: String(config.environment || ''),
  };
}

async function authRequest(endpoint, body) {
  if (!state.config?.apiKey) throw new Error('WEB_CONFIG_NOT_READY');
  const { data } = await deletionJsonRequest(`${AUTH_BASE}/${endpoint}?key=${encodeURIComponent(state.config.apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return data;
}

async function signIn(email, password) {
  const signed = await authRequest('accounts:signInWithPassword', {
    email,
    password,
    returnSecureToken: true,
  });
  const uid = String(signed.localId || '');
  const idToken = String(signed.idToken || '');
  if (!uid || !idToken) throw new Error('AUTH_SESSION_INCOMPLETE');

  let canonicalEmail = String(signed.email || email);
  try {
    const lookup = await authRequest('accounts:lookup', { idToken });
    const user = lookup?.users?.[0];
    if (user?.localId && String(user.localId) !== uid) throw new Error('AUTH_UID_MISMATCH');
    if (user?.email) canonicalEmail = String(user.email);
  } catch (error) {
    if (error instanceof Error && error.message === 'AUTH_UID_MISMATCH') throw error;
  }

  state.session = { uid, idToken, email: canonicalEmail };
}

function authHeaders() {
  if (!state.session?.idToken) throw new Error('AUTH_REQUIRED');
  return {
    Authorization: `Bearer ${state.session.idToken}`,
    'Content-Type': 'application/json',
  };
}

function requestDocumentUrl() {
  if (!state.config?.projectId || !state.session?.uid) throw new Error('REQUEST_CONTEXT_MISSING');
  return `${FIRESTORE_BASE}/projects/${encodeURIComponent(state.config.projectId)}/databases/(default)/documents/account_deletion_requests/${encodeURIComponent(state.session.uid)}`;
}

function decodeStatus(document) {
  return trustedWebDeletionStatus(document);
}

async function readDeletionRequest() {
  const { status, data } = await deletionJsonRequest(requestDocumentUrl(), {
    method: 'GET',
    headers: authHeaders(),
    cache: 'no-store',
  }, { acceptNotFound: true });
  return status === 404 ? null : data;
}

async function createDeletionRequest() {
  const projectId = state.config?.projectId;
  const uid = state.session?.uid;
  if (!projectId || !uid) throw new Error('REQUEST_CONTEXT_MISSING');

  const name = `projects/${projectId}/databases/(default)/documents/account_deletion_requests/${uid}`;
  try {
    await deletionJsonRequest(
    `${FIRESTORE_BASE}/projects/${encodeURIComponent(projectId)}/databases/(default)/documents:commit`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        writes: [{
          update: {
            name,
            fields: {
              uid: { stringValue: uid },
              status: { stringValue: 'pending' },
            },
          },
          updateTransforms: [
            { fieldPath: 'requested_at', setToServerValue: 'REQUEST_TIME' },
            { fieldPath: 'updated_at', setToServerValue: 'REQUEST_TIME' },
          ],
          currentDocument: { exists: false },
        }],
      }),
    },
    );
  } catch (error) {
    // A timeout may mean the server committed the request. Read first; never
    // replay a non-idempotent write automatically or declare it unregistered.
    const existing = await readDeletionRequest().catch(() => null);
    if (existing) return existing;
    throw error;
  }
  return readDeletionRequest();
}

function statusMessage(status) {
  if (status === 'pending') return 'Solicitud registrada. Estado: pendiente. Solicitar no significa que la cuenta ya esté eliminada.';
  if (status === 'processing') return 'Tu solicitud está en procesamiento. La eliminación todavía no se declara completada.';
  if (status === 'completed') return 'El registro contiene evidencia de finalización del proceso confiable. Esto no sustituye la comprobación independiente de Firebase Authentication.';
  if (status === 'completion-unverified') return 'El registro indica completada, pero faltan evidencias verificables del procesamiento. La eliminación no puede darse por confirmada desde este recurso.';
  if (status === 'rejected') return 'La solicitud aparece como rechazada. No se ha declarado una eliminación completada.';
  return 'Existe una solicitud, pero su estado no puede mostrarse de forma confiable. No se ha declarado una eliminación completada.';
}

async function refreshRequestStatus() {
  const existing = await readDeletionRequest();
  if (!existing) {
    setStatus('No hay una solicitud de eliminación registrada para esta cuenta.', 'neutral');
    return null;
  }
  const status = decodeStatus(existing);
  setStatus(statusMessage(status), status === 'completed' ? 'success' : 'neutral');
  return existing;
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (state.busy) return;
  setBusy(true);
  setStatus('Validando tu cuenta TuTop…');
  try {
    if (!state.config) await loadConfig();
    await signIn(emailInput.value.trim(), passwordInput.value);
    passwordInput.value = '';
    accountEmail.textContent = state.session.email;
    loginForm.hidden = true;
    accountPanel.hidden = false;
    try {
      await refreshRequestStatus();
    } catch {
      // A Firestore outage after successful Auth is not a sign-in failure.
      // Keep the authenticated session available for a fresh status read.
      setStatus('La sesión se inició, pero no pudimos consultar el estado de eliminación. Vuelve a consultar antes de intentar registrar una solicitud.', 'error');
    }
  } catch {
    clearSession();
    setStatus('No pudimos autenticar esta cuenta. Revisa tus datos o inténtalo de nuevo más tarde.', 'error');
  } finally {
    setBusy(false);
  }
});

confirmInput.addEventListener('change', () => setBusy(state.busy));

requestButton.addEventListener('click', async () => {
  if (state.busy || !state.session || !confirmInput.checked) return;
  setBusy(true);
  setStatus('Registrando tu solicitud…');
  try {
    const existing = await readDeletionRequest();
    const document = existing || await createDeletionRequest();
    const status = decodeStatus(document);
    // A recorded request is successful, but unknown/unverified completion is not.
    const tone = status === 'completion-unverified' ? 'error'
      : status === 'pending' || status === 'completed' ? 'success' : 'neutral';
    setStatus(statusMessage(status), tone);
  } catch {
    setStatus('No pudimos confirmar si se registró la solicitud. Consulta su estado antes de volver a intentar. Esta pantalla no marca eliminaciones como completadas.', 'error');
  } finally {
    setBusy(false);
  }
});

logoutButton.addEventListener('click', () => {
  clearSession();
  setStatus('Sesión web cerrada.');
});

loadConfig()
  .then(() => setStatus('Inicia sesión con tu cuenta TuTop para consultar o solicitar la eliminación.'))
  .catch(() => {
    setStatus('Este recurso todavía no tiene una configuración de release válida. No se puede iniciar una solicitud.', 'error');
    loginButton.disabled = true;
  });
