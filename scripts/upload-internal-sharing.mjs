import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base64url = (input) => Buffer.from(input).toString('base64url');

async function getAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = serviceAccount.token_uri || 'https://oauth2.googleapis.com/token';
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claims}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(serviceAccount.private_key).toString('base64url');
  const assertion = `${unsigned}.${signature}`;

  const response = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`OAuth falló (${response.status}). Revisa permisos de la cuenta de servicio.`);
  const payload = await response.json();
  if (!payload.access_token) throw new Error('OAuth no devolvió access_token.');
  return payload.access_token;
}


function assertPaidReleaseAuthorized() {
  const projectPath = path.resolve('config/project.json');
  if (!fs.existsSync(projectPath)) throw new Error('Falta config/project.json.');
  const project = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
  if (project.zeroInvestmentMode === true || project.billingAllowed !== true || project.productionPublishingAllowed !== true) {
    throw new Error('BLOQUEADO: TuTop sigue en modo cero inversión. No se permite Google Play/flujo pagado hasta autorización explícita y cambio de config/project.json.');
  }
}

export async function uploadInternalSharing(aabPath) {
  assertPaidReleaseAuthorized();
  const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME;
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!packageName) throw new Error('Falta GOOGLE_PLAY_PACKAGE_NAME.');
  if (!credentialsPath) throw new Error('Falta GOOGLE_APPLICATION_CREDENTIALS.');
  if (!path.isAbsolute(credentialsPath)) throw new Error('GOOGLE_APPLICATION_CREDENTIALS debe ser una ruta absoluta local.');
  if (!fs.existsSync(credentialsPath)) throw new Error('No existe la credencial indicada por GOOGLE_APPLICATION_CREDENTIALS.');
  if (!fs.existsSync(aabPath)) throw new Error(`No existe el AAB: ${aabPath}`);

  const serviceAccount = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  if (!serviceAccount.client_email || !serviceAccount.private_key) throw new Error('El JSON no parece ser una cuenta de servicio válida.');

  const accessToken = await getAccessToken(serviceAccount);
  const body = fs.readFileSync(aabPath);
  const endpoint = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/internalappsharing/${encodeURIComponent(packageName)}/artifacts/bundle?uploadType=media`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/octet-stream',
      'content-length': String(body.length),
    },
    body,
    signal: AbortSignal.timeout(180000),
  });
  if (!response.ok) {
    const text = await response.text();
    const safeSnippet = text.slice(0, 1200).replace(/"access_token"\s*:\s*"[^"]+"/gi, '"access_token":"[REDACTED]"');
    throw new Error(`Google Play rechazó el AAB (${response.status}): ${safeSnippet}`);
  }
  const result = await response.json();
  if (!result.downloadUrl) throw new Error('Google Play respondió sin downloadUrl.');

  fs.mkdirSync(path.resolve('release'), { recursive: true });
  fs.writeFileSync(path.resolve('release/internal-sharing-result.json'), JSON.stringify(result, null, 2) + '\n');
  fs.writeFileSync(path.resolve('release/TUTOP_INSTALL_LINK.txt'), `${result.downloadUrl}\n`);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const aabPath = process.argv[2];
  if (!aabPath) {
    console.error('Uso: node scripts/upload-internal-sharing.mjs <ruta-al-aab>');
    process.exit(2);
  }
  uploadInternalSharing(aabPath).then((result) => {
    console.log('\n✅ TuTop subida a Internal App Sharing');
    console.log(`Google Play: ${result.downloadUrl}`);
    console.log(`SHA256: ${result.sha256 || 'n/d'}`);
    console.log(`Certificate: ${result.certificateFingerprint || 'n/d'}`);
  }).catch((error) => {
    console.error(`\n❌ ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
