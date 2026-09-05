import fs from 'node:fs';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, Timestamp, writeBatch, doc, setDoc, updateDoc, getDoc, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { adminPatchDocument, adminDeleteDocument, adminDeleteTestUsers } from './staging-v2-admin.mjs';

const projectId = String(process.env.TUTOP_FIREBASE_PROJECT_ID || '').trim();
const configPath = String(process.env.TUTOP_STAGING_WEB_CONFIG_PATH || '.tutop-staging-web-config.json').trim();
const REQUIRED = 'tutop-beta-vicmdlb-1356585881';
if (projectId !== REQUIRED && process.env.TUTOP_ALLOW_ALTERNATE_STAGING !== '1') throw new Error(`Smoke fijado a ${REQUIRED}.`);
if (!fs.existsSync(configPath)) throw new Error(`Falta ${configPath}.`);
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
if (firebaseConfig.projectId !== projectId) throw new Error('Config Firebase no corresponde al staging objetivo.');

const run = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const password = `Smoke-${run}-TuTop!A9`;
const listingId = `smoke-listing-${run}`;
const offerId = `smoke-offer-${run}`;
const counterId = `smoke-counter-${run}`;
const txId = `tx-${counterId}`;
const pointId = 'uatx-riberena-cafeteria';
const docsToClean = [];
const uidsToClean = [];
let sellerApp;
let buyerApp;

function ok(label) { console.log(`✅ ${label}`); }

async function bootstrap(db, uid, name, phone) {
  const now = Timestamp.now();
  const welcome = `welcome-${uid}`;
  const batch = writeBatch(db);
  batch.set(doc(db, 'users', uid), {
    uid, nombre: name, facultad: 'Campus Ribereña', esta_verificado: false,
    country_code: 'MX', state_code: 'TLAX', city_id: 'tlaxcala', city_name: 'Tlaxcala',
    institution_id: 'uatx', institution_name: 'Universidad Autónoma de Tlaxcala',
    campus_id: 'uatx-riberena', campus_name: 'Campus Ribereña', verification_level: 0, verification_badge: 'Cuenta TuTop',
    created_at: now, updated_at: now,
  });
  batch.set(doc(db, 'user_private', uid), { uid, telefono: phone, created_at: now, auth_mode: 'phone_password_beta' });
  batch.set(doc(db, 'wallets', uid), { owner_uid: uid, balance: 10, prestige: 0, welcome_granted: true, last_op_id: welcome, updated_at: now });
  batch.set(doc(db, 'wallet_transactions', welcome), { user_id: uid, type: 'income', description: 'Bono de bienvenida', amount: 10, operation_id: welcome, created_at: now });
  await batch.commit();
  docsToClean.push(`wallet_transactions/${welcome}`, `wallets/${uid}`, `user_private/${uid}`, `users/${uid}`);
}

try {
  sellerApp = initializeApp(firebaseConfig, `smoke-seller-${run}`);
  buyerApp = initializeApp(firebaseConfig, `smoke-buyer-${run}`);
  const sellerAuth = getAuth(sellerApp); const buyerAuth = getAuth(buyerApp);
  const sellerDb = getFirestore(sellerApp); const buyerDb = getFirestore(buyerApp);
  const seller = (await createUserWithEmailAndPassword(sellerAuth, `smoke-seller-${run}@tutop.test`, password)).user;
  const buyer = (await createUserWithEmailAndPassword(buyerAuth, `smoke-buyer-${run}@tutop.test`, password)).user;
  uidsToClean.push(seller.uid, buyer.uid);
  ok('registro real de vendedor y comprador');

  await bootstrap(sellerDb, seller.uid, 'Seller Smoke', '+5212461000001');
  await bootstrap(buyerDb, buyer.uid, 'Buyer Smoke', '+5212461000002');
  ok('identidad UATx/Campus Ribereña + wallet por Security Rules');

  const created = Timestamp.now();
  await setDoc(doc(sellerDb, 'listings_v2', listingId), {
    schema_version: 2, seller_id: seller.uid, institution_id: 'uatx', campus_id: 'uatx-riberena', city_id: 'tlaxcala',
    category_id: 'material-escolar', title: 'Calculadora Casio smoke V2', description: 'Prueba temporal E2E.',
    attributes: { brand: 'Casio', model: 'fx-991' }, price_mxn: 500, negotiable: true, quantity: 1, condition: 'Buen estado',
    delivery_methods: ['campus_meetup'], meeting_point_ids: [pointId], shipping_available: false,
    photo_urls: ['data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"></svg>'],
    status: 'active', moderation_status: 'pending', visibility_scope: 'campus', published_at: created, created_at: created, updated_at: created,
  });
  docsToClean.push(`listings_v2/${listingId}`);
  ok('publicación directa en listings_v2');

  await adminPatchDocument(`listings_v2/${listingId}`, { moderation_status: 'approved', updated_at: new Date() });
  ok('moderación trusted aprobó el listing');

  const search = query(collection(buyerDb, 'listings_v2'), where('status', '==', 'active'), where('moderation_status', '==', 'approved'), where('campus_id', '==', 'uatx-riberena'), orderBy('updated_at', 'desc'), limit(10));
  const found = await getDocs(search);
  assert(found.docs.some((item) => item.id === listingId), 'búsqueda por campus no encontró el listing');
  ok('búsqueda real por campus');

  const chatId = `chat-${buyer.uid}-${listingId}`;
  const chatTime = Timestamp.now();
  await setDoc(doc(buyerDb, 'chats', chatId), {
    product_id: listingId, producto_id: listingId, buyer_id: buyer.uid, comprador_id: buyer.uid,
    seller_id: seller.uid, vendedor_id: seller.uid, participants: [buyer.uid, seller.uid], nombre_otro_usuario: 'Seller Smoke',
    last_message: 'Quiero negociar', last_message_at: chatTime, created_at: chatTime, updated_at: chatTime,
  });
  docsToClean.push(`chats/${chatId}`);
  ok('chat real creado');

  const offerTime = Timestamp.now();
  const first = writeBatch(buyerDb);
  first.set(doc(buyerDb, 'offers', offerId), { listing_id: listingId, chat_id: chatId, buyer_id: buyer.uid, seller_id: seller.uid, created_by: buyer.uid, amount_mxn: 450, status: 'pending', expires_at: Timestamp.fromMillis(Date.now() + 86400000), created_at: offerTime, updated_at: offerTime });
  first.update(doc(buyerDb, 'chats', chatId), { current_offer_id: offerId, updated_at: offerTime });
  await first.commit(); docsToClean.push(`offers/${offerId}`);
  ok('oferta $450 atómica');

  const counterTime = Timestamp.now();
  const counter = writeBatch(sellerDb);
  counter.set(doc(sellerDb, 'offers', counterId), { listing_id: listingId, chat_id: chatId, buyer_id: buyer.uid, seller_id: seller.uid, created_by: seller.uid, amount_mxn: 475, status: 'pending', parent_offer_id: offerId, expires_at: Timestamp.fromMillis(Date.now() + 86400000), created_at: counterTime, updated_at: counterTime });
  counter.update(doc(sellerDb, 'offers', offerId), { status: 'countered', counter_offer_id: counterId, updated_at: counterTime });
  counter.update(doc(sellerDb, 'chats', chatId), { current_offer_id: counterId, updated_at: counterTime });
  await counter.commit(); docsToClean.push(`offers/${counterId}`);
  ok('contraoferta $475 atómica');

  await updateDoc(doc(buyerDb, 'offers', counterId), { status: 'accepted', updated_at: Timestamp.now() });
  ok('contraoferta aceptada');

  const txTime = Timestamp.now();
  const reserve = writeBatch(sellerDb);
  reserve.set(doc(sellerDb, 'transactions_v2', txId), { listing_id: listingId, chat_id: chatId, buyer_id: buyer.uid, seller_id: seller.uid, accepted_offer_id: counterId, agreed_amount_mxn: 475, status: 'reserved', reservation_expires_at: Timestamp.fromMillis(Date.now() + 7200000), created_at: txTime, updated_at: txTime });
  reserve.update(doc(sellerDb, 'chats', chatId), { transaction_id: txId, current_offer_id: counterId, updated_at: txTime });
  await reserve.commit(); docsToClean.push(`transactions_v2/${txId}`);
  assert.equal((await getDoc(doc(sellerDb, 'listings_v2', listingId))).data()?.status, 'active');
  ok('reserva vive en transaction; listing sigue active');

  await updateDoc(doc(buyerDb, 'transactions_v2', txId), { status: 'meetup_scheduled', meeting_point_id: pointId, meetup_at: Timestamp.fromMillis(Date.now() + 3600000), updated_at: Timestamp.now() });
  ok('encuentro en Punto TuTop programado');
  const buyerConfirmed = Timestamp.now();
  await updateDoc(doc(buyerDb, 'transactions_v2', txId), { status: 'meetup_scheduled', buyer_confirmed_at: buyerConfirmed, updated_at: buyerConfirmed });
  ok('comprador confirmó');

  const sellerConfirmed = Timestamp.now();
  const complete = writeBatch(sellerDb);
  complete.update(doc(sellerDb, 'transactions_v2', txId), { status: 'completed', seller_confirmed_at: sellerConfirmed, updated_at: sellerConfirmed });
  complete.update(doc(sellerDb, 'listings_v2', listingId), { status: 'sold_out', updated_at: sellerConfirmed });
  await complete.commit();
  assert.equal((await getDoc(doc(sellerDb, 'transactions_v2', txId))).data()?.status, 'completed');
  assert.equal((await getDoc(doc(sellerDb, 'listings_v2', listingId))).data()?.status, 'sold_out');
  ok('confirmación bilateral completó tx + sold_out atómicamente');

  const reviewId = `${chatId}_${buyer.uid}`;
  await setDoc(doc(buyerDb, 'reviews', reviewId), { chat_id: chatId, evaluador_id: buyer.uid, evaluado_id: seller.uid, calificacion: 'positive', comentario: 'Operación smoke confirmada', fecha: Timestamp.now() });
  docsToClean.push(`reviews/${reviewId}`);
  ok('reseña post-operación aceptada');

  let blocked = false;
  try { await setDoc(doc(sellerDb, 'reputation', seller.uid), { subject_uid: seller.uid, fabricated_score: 999, updated_at: Timestamp.now() }); } catch { blocked = true; }
  assert(blocked, 'usuario pudo falsificar reputation');
  ok('reputación cliente falsificada bloqueada');

  await adminPatchDocument(`reputation/${seller.uid}`, { subject_uid: seller.uid, completed_transactions: 1, completed_as_seller: 1, completed_as_buyer: 0, seller_review_count: 1, seller_positive_count: 1, seller_positive_rate: 100, buyer_review_count: 0, buyer_positive_count: 0, buyer_positive_rate: null, cancellations: 0, no_shows: 0, reports_upheld: 0, updated_at: new Date() });
  docsToClean.push(`reputation/${seller.uid}`);
  const reputation = await getDoc(doc(buyerDb, 'reputation', seller.uid));
  assert.equal(reputation.data()?.completed_transactions, 1); assert.equal(reputation.data()?.seller_positive_rate, 100);
  ok('reputación trusted visible');

  console.log('\n🎯 TUTOP V2 REAL FIREBASE SMOKE: PASS');
  console.log('auth → red → listing → search → chat → offer → counter → reserve → meetup → bilateral completion → review → reputation');
} finally {
  try { if (sellerApp) await signOut(getAuth(sellerApp)); } catch {}
  try { if (buyerApp) await signOut(getAuth(buyerApp)); } catch {}
  for (const path of [...docsToClean].reverse()) { try { await adminDeleteDocument(path); } catch (error) { console.warn(`cleanup ${path}: ${String(error).slice(0, 160)}`); } }
  try { await adminDeleteTestUsers(uidsToClean); } catch (error) { console.warn(`cleanup Auth: ${String(error).slice(0, 200)}`); }
  try { if (sellerApp) await deleteApp(sellerApp); } catch {}
  try { if (buyerApp) await deleteApp(buyerApp); } catch {}
  try { fs.rmSync(configPath, { force: true }); } catch {}
  console.log('🧹 Cleanup smoke completado.');
}
