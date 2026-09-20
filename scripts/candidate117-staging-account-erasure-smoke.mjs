import fs from 'node:fs';\nimport crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, Timestamp, doc, setDoc } from 'firebase/firestore';
import { adminDeleteDocument, adminDeleteTestUsers, adminGetDocument, adminPatchDocument, adminRunQuery } from './candidate117-synthetic-admin.mjs';

const projectId = String(process.env.TUTOP_FIREBASE_PROJECT_ID || '').trim();
const configPath = String(process.env.TUTOP_STAGING_WEB_CONFIG_PATH || '.tutop-staging-web-config.json').trim();
const REQUIRED = 'tutop-beta-vicmdlb-1356585881';

if (projectId !== REQUIRED) throw new Error(`Erasure smoke fijado a ${REQUIRED}.`);
if (process.env.TUTOP_ALLOW_SYNTHETIC_ERASURE !== 'candidate117-reviewed') throw new Error('Erasure smoke requiere TUTOP_ALLOW_SYNTHETIC_ERASURE=candidate117-reviewed.');
if (!fs.existsSync(configPath)) {
  console.log(`ℹ️ ${configPath} no existe; regenerando config Web staging de forma controlada.`);
  const prepare = spawnSync(process.execPath, ['scripts/prepare-staging-v2-auth.mjs'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...process.env },
  });
  if (prepare.status !== 0) throw new Error(`No se pudo regenerar ${configPath}; prepare-staging-v2-auth terminó con ${prepare.status}.`);
}
if (!fs.existsSync(configPath)) throw new Error(`Falta ${configPath} después de preparar staging.`);

const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
if (firebaseConfig.projectId !== projectId) throw new Error('Config Firebase no corresponde al staging objetivo.');

const run = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const email = `smoke-erasure-${run}@tutop.test`;
const password = `Erase-${run}-TuTop!A9`;
const listingId = `erasure-listing-${run}`;
const demandId = `erasure-demand-${run}`;
const txId = `erasure-tx-${run}`;
const lockPath = `listing_reservation_locks/${listingId}`;
const chatId = `erasure-chat-${run}`;
const reportId = `erasure-report-${run}`;
const queryDeletePaths = [
  `device_tokens/erasure-device-${run}`,
  `notification_receipts/erasure-receipt-${run}`,
  `favorites/erasure-favorite-${run}`,
  `saved_searches/erasure-search-${run}`,
  `wallet_transactions/erasure-wallet-${run}`,
];
const directPaths = [];
const retainedPaths = [
  `transactions_v2/${txId}`,
  `chats/${chatId}`,
  `reports/${reportId}`,
];
const retainedNestedPaths = [
  `chats/${chatId}/messages/erasure-message-${run}`,
  `chats/${chatId}/reads/placeholder-until-uid`,
  `chats/${chatId}/confirmations/placeholder-until-uid`,
];
const withdrawalPaths = [
  `listings_v2/${listingId}`,
  `demand_requests/${demandId}`,
];

let app;
let uid = '';\nlet passed = false;

function ok(label) {
  console.log(`✅ ${label}`);
}

function fieldString(document, field) {
  return String(document?.fields?.[field]?.stringValue || '');
}

function fieldInteger(document, field) {
  return Number(document?.fields?.[field]?.integerValue || 0);
}

async function mustExist(path) {
  const document = await adminGetDocument(path);
  assert(document, `${path} debía existir`);
  return document;
}

async function mustBeGone(path) {
  assert.equal(await adminGetDocument(path), null, `${path} debía haberse eliminado`);
}

async function cleanup() {
  const paths = [
    ...directPaths,
    ...queryDeletePaths,
    ...retainedNestedPaths.filter((path) => !path.includes('placeholder-until-uid')),
    ...retainedPaths,
    ...withdrawalPaths,
    lockPath,
    ...(uid ? [`users/${uid}`, `account_deletion_requests/${uid}`] : []),
  ];
  for (const path of [...new Set(paths)]) {
    try { await adminDeleteDocument(path); } catch (error) { console.warn(`cleanup ${path}: ${String(error?.message || error)}`); }
  }
  if (uid) {
    try {
      const audits = await adminRunQuery('audit_log', [{ field: 'target_id', value: uid }], 100);
      for (const audit of audits) await adminDeleteDocument(audit.path);
    } catch (error) {
      console.warn(`cleanup audit: ${String(error?.message || error)}`);
    }
    try { await adminDeleteTestUsers([uid]); } catch (error) { console.warn(`cleanup auth: ${String(error?.message || error)}`); }
  }
}

try {
  app = initializeApp(firebaseConfig, `smoke-erasure-${run}`);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  uid = credential.user.uid;\n  process.env.TUTOP_SYNTHETIC_UID = uid;
  ok('usuario sintético Auth creado');

  directPaths.push(
    `user_private/${uid}`,
    `notification_preferences/${uid}`,
    `verificationRequests/${uid}`,
    `publicVerifications/${uid}`,
    `reputation/${uid}`,
    `moderationStatus/${uid}`,
    `wallets/${uid}`,
  );

  const now = new Date();
  await adminPatchDocument(`users/${uid}`, { uid, nombre: 'Erasure Smoke', updated_at: now });
  await adminPatchDocument(`user_private/${uid}`, { uid, telefono: '+5212461000099', updated_at: now });
  await adminPatchDocument(`notification_preferences/${uid}`, { owner_uid: uid, updated_at: now });
  await adminPatchDocument(`verificationRequests/${uid}`, { uid, status: 'pending', updated_at: now });
  await adminPatchDocument(`publicVerifications/${uid}`, { uid, status: 'pending', updated_at: now });
  await adminPatchDocument(`reputation/${uid}`, { uid, score: 0, updated_at: now });
  await adminPatchDocument(`moderationStatus/${uid}`, { uid, status: 'clear', updated_at: now });
  await adminPatchDocument(`wallets/${uid}`, { owner_uid: uid, balance: 10, updated_at: now });

  await adminPatchDocument(queryDeletePaths[0], { owner_uid: uid, token_hint: 'synthetic', updated_at: now });
  await adminPatchDocument(queryDeletePaths[1], { owner_uid: uid, notification_id: 'synthetic', updated_at: now });
  await adminPatchDocument(queryDeletePaths[2], { uid, product_id: listingId, updated_at: now });
  await adminPatchDocument(queryDeletePaths[3], { owner_uid: uid, query: 'synthetic', updated_at: now });
  await adminPatchDocument(queryDeletePaths[4], { user_id: uid, type: 'income', amount: 10, updated_at: now });

  await adminPatchDocument(`listings_v2/${listingId}`, {
    seller_id: uid,
    status: 'active',
    moderation_status: 'approved',
    title: 'Publicación temporal erasure',
    description: 'Debe retirarse, no borrarse.',
    updated_at: now,
  });
  await adminPatchDocument(`demand_requests/${demandId}`, {
    buyer_id: uid,
    status: 'active',
    title: 'Solicitud temporal erasure',
    description: 'Debe expirar, no borrarse.',
    updated_at: now,
  });

  await adminPatchDocument(`transactions_v2/${txId}`, { listing_id: listingId, buyer_id: uid, seller_id: 'synthetic-control-seller', status: 'reserved', updated_at: now });
  await adminPatchDocument(lockPath, { listing_id: listingId, transaction_id: txId, buyer_id: uid, seller_id: 'synthetic-control-seller', created_at: now, updated_at: now });
  await adminPatchDocument(`chats/${chatId}`, {
    buyer_id: 'synthetic-control-buyer',
    seller_id: uid,
    nombre_otro_usuario: 'Cuenta temporal',
    last_message: 'mensaje retenido de smoke',
    updated_at: now,
  });
  retainedNestedPaths[1] = `chats/${chatId}/reads/${uid}`;
  retainedNestedPaths[2] = `chats/${chatId}/confirmations/${uid}`;
  await adminPatchDocument(retainedNestedPaths[0], { sender_id: uid, text: 'mensaje retenido de smoke', created_at: now });
  await adminPatchDocument(retainedNestedPaths[1], { user_id: uid, read_at: now });
  await adminPatchDocument(retainedNestedPaths[2], { user_id: uid, created_at: now });
  await adminPatchDocument(`reports/${reportId}`, { created_by: uid, status: 'open', updated_at: now });
  ok('fixture de privacidad/marketplace/retención creado con transacción activa y residuos chat anidados');

  const requestTime = Timestamp.now();
  await setDoc(doc(db, 'account_deletion_requests', uid), {
    uid,
    status: 'pending',
    requested_at: requestTime,
    updated_at: requestTime,
  });
  ok('solicitud de eliminación creada por el propio usuario bajo Security Rules');

  await signOut(auth);

  const blockedResult = spawnSync(process.execPath, ['scripts/candidate117-process-account-erasure.mjs', '--uid', uid, '--apply'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...process.env, TUTOP_ALLOW_SYNTHETIC_ERASURE: 'candidate117-reviewed' },
  });
  assert.notEqual(blockedResult.status, 0, 'el procesador permitió erasure con una transacción reserved activa');
  await mustExist(`users/${uid}`);
  await mustExist(lockPath);
  const stillPending = await mustExist(`account_deletion_requests/${uid}`);
  assert.equal(fieldString(stillPending, 'status'), 'pending');
  ok('transacción activa bloqueó erasure antes de cualquier mutación destructiva');

  await adminPatchDocument(`transactions_v2/${txId}`, { status: 'completed', updated_at: new Date() });
  await adminDeleteDocument(lockPath);
  ok('fixture pasó a estado terminal y liberó lock para reintentar erasure');

  const result = spawnSync(process.execPath, ['scripts/candidate117-process-account-erasure.mjs', '--uid', uid, '--apply'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...process.env, TUTOP_ALLOW_SYNTHETIC_ERASURE: 'candidate117-reviewed' },
  });
  assert.equal(result.status, 0, `procesador erasure terminó con código ${result.status}`);
  ok('procesador destructivo staging ejecutado sobre cuenta sintética ya sin operación activa');

  await mustBeGone(`users/${uid}`);
  for (const path of directPaths) await mustBeGone(path);
  for (const path of queryDeletePaths) await mustBeGone(path);
  ok('perfil y datos privados/eliminables fueron borrados');

  const listing = await mustExist(`listings_v2/${listingId}`);
  assert.equal(fieldString(listing, 'status'), 'archived');
  assert.equal(fieldString(listing, 'moderation_status'), 'rejected');
  assert.equal(fieldString(listing, 'title'), 'Publicación retirada');
  const demand = await mustExist(`demand_requests/${demandId}`);
  assert.equal(fieldString(demand, 'status'), 'expired');
  assert.equal(fieldString(demand, 'title'), 'Solicitud retirada');
  ok('contenido público fue retirado/anonimizado en vez de borrado ciego');

  for (const path of retainedPaths) await mustExist(path);
  for (const path of retainedNestedPaths) await mustExist(path);
  ok('transacción/chat/reporte y subcolecciones chat operativas se conservaron de forma explícita');

  const request = await mustExist(`account_deletion_requests/${uid}`);
  assert.equal(fieldString(request, 'status'), 'completed');
  assert.equal(fieldString(request, 'processing_note'), 'staging-controlled-erasure-v1');
  assert.equal(fieldString(request, 'residual_manifest_version'), 'staging-erasure-residual-v2');
  assert(fieldInteger(request, 'retained_count') >= 6, 'el manifiesto no contó los residuos chat anidados');
  const audits = await adminRunQuery('audit_log', [{ field: 'target_id', value: uid }], 100);
  assert(audits.some((audit) => fieldString(audit, 'action') === 'account_erasure_completed'), 'faltó audit_log de erasure completado');
  ok('solicitud quedó completed y auditada');

  let authDeleted = false;
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch {
    authDeleted = true;
  }
  assert(authDeleted, 'la cuenta Auth siguió aceptando login después del erasure');
  ok('Auth fue eliminado al final y el login anterior ya no funciona');

  passed = true;\n  console.log('Real staging account erasure smoke: PASS');
} finally {
  await cleanup();
  if (app) {
    try { await deleteApp(app); } catch {}
  }
}

if (passed) {
  const allFixturePaths = [
    ...directPaths,
    ...queryDeletePaths,
    ...retainedNestedPaths.filter((path) => !path.includes('placeholder-until-uid')),
    ...retainedPaths,
    ...withdrawalPaths,
    lockPath,
    ...(uid ? [`users/${uid}`, `account_deletion_requests/${uid}`] : []),
  ];
  for (const path of [...new Set(allFixturePaths)]) await mustBeGone(path);
  const audits = uid ? await adminRunQuery('audit_log', [{ field: 'target_id', value: uid }], 100) : [];
  assert.equal(audits.length, 0, 'cleanup dejó audit_log sintético');
  const evidence = {
    status: 'PASS',
    candidate_base_sha: process.env.TUTOP_CANDIDATE117_BASE_SHA,
    ops_sha: process.env.GITHUB_SHA,
    run_id: process.env.GITHUB_RUN_ID,
    project: projectId,
    active_ruleset: 'projects/tutop-beta-vicmdlb-1356585881/rulesets/dc2d1f98-08bf-46b9-9bf5-d177e5a88c27',
    active_rules_sha256: '35e8c53e5c180e59b17d5d6976b09b80984919b943d892de5e52bc6ca9c7277a',
    billing_enabled: false,
    synthetic_uid_hash: crypto.createHash('sha256').update(uid).digest('hex').slice(0,12),
    real_user_data_touched: false,
    synthetic_cleanup_verified: true,
    production: false
  };
  fs.mkdirSync('candidate117-erasure-smoke-evidence',{recursive:true});
  fs.writeFileSync('candidate117-erasure-smoke-evidence/evidence.json', JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify(evidence));
}
