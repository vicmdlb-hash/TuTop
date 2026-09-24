const EXPECTED_PROJECT = 'tutop-beta-vicmdlb-1356585881';
const status = document.getElementById('status');
const returnLink = document.getElementById('return-link');

function setStatus(message, tone = '') {
  status.textContent = message;
  if (tone) status.dataset.tone = tone;
}

function friendlyAuthError(code) {
  if (/EXPIRED_OOB_CODE/i.test(code)) return 'Este enlace ya venció. Vuelve a TuTop y solicita un correo de verificación nuevo.';
  if (/INVALID_OOB_CODE/i.test(code)) return 'Este enlace ya fue usado, venció o no es válido. Vuelve a TuTop y solicita uno nuevo.';
  if (/USER_DISABLED/i.test(code)) return 'Esta cuenta está deshabilitada y necesita revisión.';
  if (/EMAIL_NOT_FOUND|USER_NOT_FOUND/i.test(code)) return 'La cuenta asociada a este enlace ya no está disponible.';
  return 'No pudimos confirmar este enlace. Vuelve a TuTop, solicita uno nuevo e inténtalo otra vez.';
}

async function readJson(response) {
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!response.ok) throw new Error(String(data?.error?.message || data?.error?.status || `HTTP_${response.status}`));
  return data;
}

async function main() {
  const params = new URLSearchParams(location.search);
  const mode = String(params.get('mode') || '');
  const oobCode = String(params.get('oobCode') || '').trim();
  const continueUrl = String(params.get('continueUrl') || '').trim();

  if (mode !== 'verifyEmail' || !oobCode) {
    setStatus('Este enlace no contiene una solicitud válida de verificación de correo TuTop.', 'error');
    return;
  }

  try {
    const configResponse = await fetch('/tutop-web-config.json', { cache: 'no-store' });
    const config = await readJson(configResponse);
    if (config.projectId !== EXPECTED_PROJECT || !config.apiKey) throw new Error('TUTOP_AUTH_ACTION_CONFIG_MISMATCH');

    const verifyResponse = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${encodeURIComponent(config.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oobCode }),
      },
    );
    const verified = await readJson(verifyResponse);
    if (!verified?.localId || !verified?.email) throw new Error('EMAIL_VERIFICATION_RESPONSE_INCOMPLETE');

    setStatus(`Correo verificado correctamente para ${verified.email}. Ya puedes volver a TuTop; la app comprobará el estado automáticamente.`, 'success');
    returnLink.hidden = false;
    if (continueUrl) {
      try {
        const target = new URL(continueUrl, location.origin);
        // Never turn a Firebase email action into an open redirect. Until an
        // explicit mobile deep-link allowlist exists, only same-origin returns
        // are accepted; every other value falls back to TuTop root.
        if (target.origin === location.origin) returnLink.href = target.toString();
      } catch { /* keep safe root fallback */ }
    }
  } catch (error) {
    setStatus(friendlyAuthError(error instanceof Error ? error.message : String(error)), 'error');
    returnLink.hidden = false;
  }
}

void main();
