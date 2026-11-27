const EXPECTED_PROJECT = 'tutop-beta-vicmdlb-1356585881';
const status = document.getElementById('status');
const title = document.getElementById('action-title');
const copy = document.getElementById('action-copy');
const returnLink = document.getElementById('return-link');
const resetForm = document.getElementById('reset-form');
const newPassword = document.getElementById('new-password');
const confirmPassword = document.getElementById('confirm-password');
const resetButton = document.getElementById('reset-button');

function setStatus(message, tone = '') {
  status.textContent = message;
  status.dataset.tone = tone;
}

function friendlyAuthError(code, mode = '') {
  if (/FIREBASE_REQUEST_TIMEOUT/.test(code)) return mode === 'resetPassword'
    ? 'La conexión agotó su tiempo. No pudimos confirmar si Firebase cambió tu clave. Comprueba el acceso con la nueva clave antes de solicitar otro enlace.'
    : 'La conexión agotó su tiempo. No pudimos confirmar la acción; revisa el estado de tu cuenta antes de solicitar otro enlace.';
  if (/EXPIRED_OOB_CODE/i.test(code)) return 'Este enlace ya venció. Vuelve a TuTop y solicita un correo nuevo.';
  if (/INVALID_OOB_CODE/i.test(code)) return 'Este enlace ya fue usado, venció o no es válido. Vuelve a TuTop y solicita uno nuevo.';
  if (/WEAK_PASSWORD|PASSWORD_DOES_NOT_MEET_REQUIREMENTS/i.test(code)) return 'La nueva Clave TuTop no cumple los requisitos. Usa al menos 8 caracteres.';
  if (/USER_DISABLED/i.test(code)) return 'Esta cuenta está deshabilitada y necesita revisión.';
  if (/EMAIL_NOT_FOUND|USER_NOT_FOUND/i.test(code)) return 'La cuenta asociada a este enlace ya no está disponible.';
  if (mode === 'resetPassword') return 'No pudimos completar el cambio de clave. Solicita un enlace nuevo desde TuTop.';
  return 'No pudimos confirmar este enlace. Vuelve a TuTop, solicita uno nuevo e inténtalo otra vez.';
}

async function readJson(response) {
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!response.ok) throw new Error(String(data?.error?.message || data?.error?.status || `HTTP_${response.status}`));
  return data;
}

// A stalled Firebase request must not leave email verification or recovery
// frozen forever. Never automatically replay one-time out-of-band actions.
async function boundedJsonRequest(url, options = {}, timeoutMs = 15_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return await readJson(response);
  } catch (error) {
    if (controller.signal.aborted) throw new Error('FIREBASE_REQUEST_TIMEOUT');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function safeReturnTarget(continueUrl) {
  if (!continueUrl) return '/';
  try {
    const target = new URL(continueUrl, location.origin);
    return target.origin === location.origin ? target.toString() : '/';
  } catch {
    return '/';
  }
}

function enableReturn(continueUrl) {
  returnLink.href = safeReturnTarget(continueUrl);
  returnLink.hidden = false;
}

async function identityPost(endpoint, apiKey, body) {
  return boundedJsonRequest(
    `https://identitytoolkit.googleapis.com/v1/${endpoint}?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
}

async function handleVerifyEmail(apiKey, oobCode, continueUrl) {
  title.textContent = 'Verificar correo TuTop';
  copy.textContent = 'Confirmaremos el código de verificación directamente con Firebase. No necesitas escribir tu contraseña.';
  const verified = await identityPost('accounts:update', apiKey, { oobCode });
  if (!verified?.localId || !verified?.email) throw new Error('EMAIL_VERIFICATION_RESPONSE_INCOMPLETE');
  setStatus(`Correo verificado correctamente para ${verified.email}. TuTop comprobará el estado al volver.`, 'success');
  enableReturn(continueUrl);
}

async function handleRecoverEmail(apiKey, oobCode, continueUrl) {
  title.textContent = 'Proteger correo de TuTop';
  copy.textContent = 'Aplicaremos el código de Firebase para revertir un cambio de correo solicitado anteriormente.';
  const recovered = await identityPost('accounts:update', apiKey, { oobCode });
  if (!recovered?.localId && !recovered?.email) throw new Error('RECOVER_EMAIL_RESPONSE_INCOMPLETE');
  setStatus('El cambio de correo fue revertido. Por seguridad, vuelve a TuTop y revisa tu acceso.', 'success');
  enableReturn(continueUrl);
}

async function handleResetPassword(apiKey, oobCode, continueUrl) {
  title.textContent = 'Cambiar Clave TuTop';
  copy.textContent = 'Primero comprobamos el enlace de Firebase. Tu nueva clave se envía directamente a Firebase y no se guarda en este navegador.';
  const checked = await identityPost('accounts:resetPassword', apiKey, { oobCode });
  if (checked?.requestType && checked.requestType !== 'PASSWORD_RESET') throw new Error('PASSWORD_RESET_TYPE_MISMATCH');
  if (!checked?.email) throw new Error('PASSWORD_RESET_RESPONSE_INCOMPLETE');

  setStatus(`Enlace válido para ${checked.email}. Escribe una nueva Clave TuTop.`);
  resetForm.hidden = false;

  // Keep the listener across validation/remote failures. Do not consume a
  // valid one-time recovery link merely because two typed passwords differ.
  let resetBusy = false;
  let resetCompleted = false;
  resetForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (resetBusy || resetCompleted) return;
    const password = String(newPassword.value || '');
    const confirmation = String(confirmPassword.value || '');
    if (password.length < 8) {
      setStatus('La nueva Clave TuTop necesita al menos 8 caracteres.', 'error');
      return;
    }
    if (password !== confirmation) {
      setStatus('Las dos claves no coinciden.', 'error');
      return;
    }

    resetBusy = true;
    resetButton.disabled = true;
    try {
      const changed = await identityPost('accounts:resetPassword', apiKey, { oobCode, newPassword: password });
      if (changed?.requestType && changed.requestType !== 'PASSWORD_RESET') throw new Error('PASSWORD_RESET_TYPE_MISMATCH');
      resetCompleted = true;
      newPassword.value = '';
      confirmPassword.value = '';
      resetForm.hidden = true;
      setStatus('Clave TuTop actualizada. Ya puedes volver e iniciar sesión con tu nueva clave.', 'success');
      enableReturn(continueUrl);
    } catch (error) {
      setStatus(friendlyAuthError(error instanceof Error ? error.message : String(error), 'resetPassword'), 'error');
    } finally {
      resetBusy = false;
      resetButton.disabled = resetCompleted;
    }
  });
}

async function main() {
  const params = new URLSearchParams(location.search);
  const mode = String(params.get('mode') || '');
  const oobCode = String(params.get('oobCode') || '').trim();
  const continueUrl = String(params.get('continueUrl') || '').trim();

  if (!['verifyEmail', 'recoverEmail', 'resetPassword'].includes(mode) || oobCode.length < 8 || oobCode.length > 4096) {
    setStatus('Este enlace no contiene una acción válida de cuenta TuTop.', 'error');
    enableReturn('');
    return;
  }

  try {
    const config = await boundedJsonRequest('/tutop-web-config.json', { cache: 'no-store' });
    if (config.projectId !== EXPECTED_PROJECT || !config.apiKey) throw new Error('TUTOP_AUTH_ACTION_CONFIG_MISMATCH');

    if (mode === 'verifyEmail') await handleVerifyEmail(config.apiKey, oobCode, continueUrl);
    else if (mode === 'recoverEmail') await handleRecoverEmail(config.apiKey, oobCode, continueUrl);
    else await handleResetPassword(config.apiKey, oobCode, continueUrl);
  } catch (error) {
    setStatus(friendlyAuthError(error instanceof Error ? error.message : String(error), mode), 'error');
    enableReturn(continueUrl);
  }
}

void main();
