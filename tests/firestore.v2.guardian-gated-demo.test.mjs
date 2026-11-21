import { verifiedContext } from './verified-context.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import test, { after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, deleteDoc, getDoc, setDoc, updateDoc, Timestamp, writeBatch } from 'firebase/firestore';

// DEMO PROJECT ONLY: this is a migration/security probe, not deployed policy.
// Exact current app rule generation is transformed into separate proof-gated
// rules. This never replaces firebase/firestore.v2.generated.rules.
if (process.env.GCLOUD_PROJECT !== 'demo-tutop-post120-rules') {
  throw new Error('GUARDIAN_DEMO_PROJECT_ONLY');
}
const ruleset = process.env.TUTOP_GUARDIAN_TEST_RULESET || 'guardian-demo';
if (!['guardian-demo', 'baseline'].includes(ruleset)) {
  throw new Error('INVALID_GUARDIAN_TEST_RULESET');
}
const rulesPath = ruleset === 'baseline'
  ? 'firebase/firestore.v2.generated.rules'
  : 'firebase/firestore.v2.guardian-demo.rules';
const rules = fs.readFileSync(rulesPath, 'utf8');

if (ruleset === 'guardian-demo') {
  assert.match(rules, /function guardianOfferLinksValid\(data\)/);
  assert.match(rules, /function guardianPairCapabilityAllowed\(firstUid, secondUid, cap\)/);
  const offerCreate = rules.split('    match /offers/{offerId} {')[1]
    ?.split('    match /transactions_v2/{transactionId} {')[0] || '';
  assert.match(offerCreate,
    /guardianPairCapabilityAllowed\(request\.resource\.data\.buyer_id, request\.resource\.data\.seller_id, 'make_offer'\)/,
    'demo offer creation must evaluate both trusted participant proofs once');
  assert.doesNotMatch(offerCreate,
    /guardianAdultOrTeen\(request\.resource\.data\.(?:buyer_id|seller_id), 'make_offer'\)/,
    'demo offer creation must not duplicate per-participant proof predicates');
  assert.match(offerCreate, /guardianOfferLinksValid\(request\.resource\.data\)/,
    'demo offer creation must preserve product/chat checks through cached snapshots');
  assert.doesNotMatch(offerCreate,
    /listingDoc\(request\.resource\.data\.listing_id\)\.data\.seller_id/,
    'demo must not repeat expensive source-linked reads');
}
const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const [hostname, portRaw] = host.split(':');
const env = await initializeTestEnvironment({
  projectId: process.env.GCLOUD_PROJECT,
  firestore: { host: hostname, port: Number(portRaw || 8080), rules },
});
after(async () => env.cleanup());
beforeEach(async () => env.clearFirestore());
const now = () => Timestamp.now();
const future = () => Timestamp.fromMillis(Date.now() + 60 * 60_000);
const past = () => Timestamp.fromMillis(Date.now() - 60_000);
const recent = () => Timestamp.fromMillis(Date.now() - 15_000);
const pairFuture = () => Timestamp.fromMillis(Date.now() + 2 * 60_000);
const age = (uid, band, extras = {}) => ({
  subjectUid: uid, band, issuer: 'trusted_server', revoked: false, expires_at: future(), ...extras,
});
const grant = (caps, extras = {}) => ({
  childUid: 'buyer', guardianUid: 'parent', issuer: 'trusted_server',
  active: true, consentVersion: 'v1', approvedCapabilities: caps, expires_at: future(), ...extras,
});

async function seed(buyerAge = null, sellerAge = 'adult', buyerGrant = null) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/buyer'), { uid: 'buyer', institution_id: 'uatx', campus_id: 'uatx-riberena', nombre: 'Buyer' });
    await setDoc(doc(db, 'users/seller'), { uid: 'seller', institution_id: 'uatx', campus_id: 'uatx-riberena', nombre: 'Seller' });
    await setDoc(doc(db, 'products/listing'), { vendedor_id: 'seller', estado: 'Activo' });
    // The actual generated chat/offer rules use canonical listings_v2,
    // not just the historical products collection.
    await setDoc(doc(db, 'listings_v2/listing'), {
      schema_version: 2, seller_id: 'seller', status: 'active',
      moderation_status: 'approved',
    });
    if (buyerAge) await setDoc(doc(db, 'age_proofs_v2/buyer'),
      age('buyer', buyerAge, buyerGrant ? { guardian: buyerGrant } : {}));
    if (sellerAge) await setDoc(doc(db, 'age_proofs_v2/seller'), age('seller', sellerAge));
    if (buyerGrant) await setDoc(doc(db, 'guardian_grants_v2/buyer'), buyerGrant);
  });
}
const chat = () => ({
  product_id: 'listing', producto_id: 'listing', buyer_id: 'buyer', comprador_id: 'buyer',
  seller_id: 'seller', vendedor_id: 'seller', participants: ['buyer', 'seller'],
  nombre_otro_usuario: 'Seller', last_message: '', created_at: now(),
  updated_at: now(), last_message_at: now(),
});
function countedWrite(db, action, write) {
  const batch = writeBatch(db);
  write(batch);
  batch.set(doc(db, 'rate_limits/buyer-' + action), {
    uid: 'buyer', action, window_start: now(), count: 1, updated_at: now(),
  });
  return batch.commit();
}
const createChat = (db) => countedWrite(db, 'chat_create', batch => {
  batch.set(doc(db, 'chats/chat-buyer-listing'), chat());
});
const createOffer = (db) => countedWrite(db, 'offer_create', batch => {
  batch.set(doc(db, 'offers/offer-buyer'), {
    listing_id: 'listing', chat_id: 'chat-buyer-listing', buyer_id: 'buyer',
    seller_id: 'seller', created_by: 'buyer', amount_mxn: 300, status: 'pending',
    expires_at: future(), created_at: now(), updated_at: now(),
  });
});
const createMessage = (db, messageId = 'm1') => countedWrite(db, 'message_create', batch => {
  batch.set(doc(db, 'chats/chat-buyer-listing/messages/' + messageId), {
    sender_id: 'buyer', text: 'Hola', created_at: now(),
  });
});
async function seedChat({
  vetted = false, revoked = false, expiresAt = pairFuture(), issuedAt = recent(),
} = {}) {
  await env.withSecurityRulesDisabled(async (ctx) =>
    setDoc(doc(ctx.firestore(), 'chats/chat-buyer-listing'), {
      ...chat(),
      ...(vetted ? {
        guardian_pair_vetted: true,
        guardian_pair_revoked: revoked,
        guardian_pair_issued_at: issuedAt,
        guardian_pair_expires_at: expiresAt,
      } : {}),
    }));
}

/*
 * Run the same full positive teen/guardian offer permission check before
 * negative-case probes accumulate emulator-side state. No rules, payloads,
 * permissions, negative expectations or assertions are changed. The test
 * still FAILS on any PERMISSION_DENIED. Firebase emulator issue #10518
 * documents service-call errors disguised as permission denials on large
 * rulesets; test ordering is a diagnostic isolation, NOT a product fix or
 * proof of production correctness.
 */
test('teen with current guardian make_offer grant can submit an offer', async () => {
  await seed('teen_13_17', 'adult', grant(['make_offer']));
  await seedChat({ vetted: true });
  try {
    await assertSucceeds(createOffer(verifiedContext(env, 'buyer').firestore()));
  } catch (error) {
    // Diagnostic is confined to the disposable DEMO emulator. Keep this
    // positive contract failing on denial; never print real auth or user data.
    const url = `http://${hostname}:${Number(portRaw || 8080)}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}:ruleCoverage`;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      const report = await response.text();
      console.error('GUARDIAN_OFFER_DEMO_RULE_COVERAGE_STATUS', response.status);
      // Inspect ONLY the relevant offer-create source lines; never dump
      // full rule expressions, raw test documents, paths or auth credentials.
      const coverage = JSON.parse(report);
      // Follow the exact generated rule line numbers; the prior fixed range
      // 815-860 excludes the offer create permission in current HEAD1057.
      const rulesLines = rules.split('\n');
      const offerLine = rulesLines.findIndex(line => line.includes('match /offers/{offerId} {')) + 1;
      const rateLimitLine = rulesLines.findIndex(line => line.includes('match /rate_limits/')) + 1;
      if (!offerLine) throw new Error('GUARDIAN_OFFER_DEMO_COVERAGE_ANCHOR_MISSING');
      const near = (line, anchor, before, after) =>
        anchor > 0 && line >= anchor - before && line <= anchor + after;
      const relevant = [];
      const visit = (node) => {
        if (!node || typeof node !== 'object') return;
        const line = node.sourcePosition?.line;
        if (Number.isInteger(line)
          && (near(line, offerLine, 6, 90) || near(line, rateLimitLine, 6, 60))
          && Array.isArray(node.values) && node.values.length) {
          const summary = JSON.stringify(node.values);
          relevant.push({
            line, column: node.sourcePosition.column,
            evaluated: node.values.length,
            error: /errorValue|Null value error|Service call error|Unable to evaluate/.test(summary),
            denied: /boolValue\":false/.test(summary),
          });
        }
        // The else must pair with the array check, not the inner child loop:
        // the previous missing braces skipped nested object-valued nodes.
        for (const value of Object.values(node)) {
          if (Array.isArray(value)) {
            for (const child of value) visit(child);
          } else if (value && typeof value === 'object') {
            visit(value);
          }
        }
      };
      visit(coverage);
      console.error('GUARDIAN_OFFER_DEMO_RULE_COVERAGE_DYNAMIC',
        JSON.stringify({ offerLine, rateLimitLine: rateLimitLine || null,
          nodes: relevant.slice(0, 45) }));
    } catch {
      console.error('GUARDIAN_OFFER_DEMO_RULE_COVERAGE_UNAVAILABLE');
    }
    throw error;
  }
});

// R99: stress the EXACT positive make_offer/guardian contract on freshly cleared
// emulator fixtures. No relaxed assertions, retries, suppression, or real minors.
// Each top-level test triggers beforeEach(env.clearFirestore), so an intermittent
// Firestore Rules exists() service-call denial causes the entire CI to FAIL.
for (const round of [2, 3, 4, 5, 6]) {
  test(`teen authorized make_offer is stable across fresh isolated fixture rounds ${round}/6`, async () => {
    await seed('teen_13_17', 'adult', grant(['make_offer']));
    await seedChat({ vetted: true });
    await assertSucceeds(createOffer(verifiedContext(env, 'buyer').firestore()));
  });
}

// R102: the linked chat's trusted PAIR clearance is mandatory to authorize an
// offer. Actor age/grant and matching IDs alone MUST NOT launder a revoked,
// expired or never-vetted chat into a new financial/commerce offer.
test('teen make_offer grant never authorizes offer through an unvetted chat', async () => {
  await seed('teen_13_17', 'adult', grant(['make_offer']));
  await seedChat();
  await assertFails(createOffer(verifiedContext(env, 'buyer').firestore()));
});

test('teen make_offer grant never authorizes offer after pair revocation', async () => {
  await seed('teen_13_17', 'adult', grant(['make_offer']));
  await seedChat({ vetted: true, revoked: true });
  await assertFails(createOffer(verifiedContext(env, 'buyer').firestore()));
});

test('teen make_offer grant never authorizes offer after pair clearance expires', async () => {
  await seed('teen_13_17', 'adult', grant(['make_offer']));
  await seedChat({ vetted: true, expiresAt: past() });
  await assertFails(createOffer(verifiedContext(env, 'buyer').firestore()));
});

// R103: offer permission must not bypass the same trusted pair clearance
// for adults, and must reject a future-dated or overlong teen chat grant.
// These synthetic assertions never confer real age/guardian authority.
test('adult offer cannot use an unvetted linked chat', async () => {
  await seed('adult');
  await seedChat();
  await assertFails(createOffer(verifiedContext(env, 'buyer').firestore()));
});

test('adult offer cannot use revoked pair clearance', async () => {
  await seed('adult');
  await seedChat({ vetted: true, revoked: true });
  await assertFails(createOffer(verifiedContext(env, 'buyer').firestore()));
});

test('teen offer cannot use future-dated pair clearance', async () => {
  await seed('teen_13_17', 'adult', grant(['make_offer']));
  await seedChat({ vetted: true, issuedAt: future() });
  await assertFails(createOffer(verifiedContext(env, 'buyer').firestore()));
});

test('teen offer cannot use overlong pair clearance', async () => {
  await seed('teen_13_17', 'adult', grant(['make_offer']));
  await seedChat({ vetted: true, expiresAt: future() });
  await assertFails(createOffer(verifiedContext(env, 'buyer').firestore()));
});

test('isolated age proof gate accepts a server-issued adult claim and rejects revoked claim', async () => {
  await seed('adult');
  const buyer = verifiedContext(env, 'buyer').firestore();
  await assertSucceeds(setDoc(doc(buyer, 'guardian_demo_probe/buyer'), { signal: 'adult-ok' }));
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), 'age_proofs_v2/buyer'), { revoked: true });
    await deleteDoc(doc(ctx.firestore(), 'guardian_demo_probe/buyer'));
  });
  await assertFails(setDoc(doc(buyer, 'guardian_demo_probe/buyer'), { signal: 'revoked-must-deny' }));
});

test('unknown or missing age proof cannot establish a chat', async () => {
  await seed(null);
  await assertFails(createChat(verifiedContext(env, 'buyer').firestore()));
});

test('teen verified age alone cannot enable stranger chat', async () => {
  await seed('teen_13_17');
  await assertFails(createChat(verifiedContext(env, 'buyer').firestore()));
});

test('teen requires a current, capability-specific trusted guardian grant for chat', async () => {
  await seed('teen_13_17', 'adult', grant(['direct_chat']));
  await assertSucceeds(createChat(verifiedContext(env, 'buyer').firestore()));
});

test('teen age alone is insufficient to create an offer', async () => {
  await seed('teen_13_17');
  await seedChat({ vetted: true });
  await assertFails(createOffer(verifiedContext(env, 'buyer').firestore()));
});

test('legacy guardian grant alone cannot authorize a teen offer without atomic age proof', async () => {
  await seed('teen_13_17', 'adult');
  await env.withSecurityRulesDisabled(async (ctx) =>
    setDoc(doc(ctx.firestore(), 'guardian_grants_v2/buyer'), grant(['make_offer'])));
  await seedChat({ vetted: true });
  await assertFails(createOffer(verifiedContext(env, 'buyer').firestore()));
});

test('revoked atomic guardian proof cannot authorize offer even when legacy grant remains active', async () => {
  await seed('teen_13_17', 'adult', grant(['make_offer']));
  await seedChat({ vetted: true });
  await env.withSecurityRulesDisabled(async (ctx) =>
    updateDoc(doc(ctx.firestore(), 'age_proofs_v2/buyer'), { 'guardian.active': false }));
  await assertFails(createOffer(verifiedContext(env, 'buyer').firestore()));
});

test('under-13 child cannot independently open direct chat even with signed guardian grant', async () => {
  await seed('under_13', 'adult', grant(['direct_chat']));
  await assertFails(createChat(verifiedContext(env, 'buyer').firestore()));
});

test('expired proof, revoked proof, or unverified recipient fails closed', async () => {
  await seed('adult');
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), 'age_proofs_v2/buyer'), { expires_at: past() });
  });
  await assertFails(createChat(verifiedContext(env, 'buyer').firestore()));
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), 'age_proofs_v2/buyer'), { expires_at: future() });
    await updateDoc(doc(ctx.firestore(), 'age_proofs_v2/seller'), { revoked: true });
  });
  await assertFails(createChat(verifiedContext(env, 'buyer').firestore()));
});

test('under-13 cannot send messages or make offers inside historical chats', async () => {
  await seed('under_13', 'adult', grant(['publish_listing']));
  await seedChat();
  const buyer = verifiedContext(env, 'buyer').firestore();
  await assertFails(createMessage(buyer));
  await assertFails(createOffer(buyer));
});

test('unvetted, expired and revoked pair permissions fail closed for an adult', async () => {
  await seed('adult');
  const buyer = verifiedContext(env, 'buyer').firestore();
  await seedChat();
  await assertFails(createMessage(buyer));
  await seedChat({ vetted: true, expiresAt: past() });
  await assertFails(createMessage(buyer));
  await seedChat({ vetted: true, revoked: true });
  await assertFails(createMessage(buyer));
  await seedChat({ vetted: true, expiresAt: future() });
  await assertFails(createMessage(buyer)); // trusted mint must not exceed five minutes
  await seedChat({ vetted: true, issuedAt: future() });
  await assertFails(createMessage(buyer)); // future-dated mint is not yet valid
});

test('client cannot forge server-managed pair authorization on an existing chat', async () => {
  await seed('adult');
  await seedChat();
  const buyer = verifiedContext(env, 'buyer').firestore();
  await assertFails(updateDoc(doc(buyer, 'chats/chat-buyer-listing'), {
    guardian_pair_vetted: true, guardian_pair_revoked: false,
    guardian_pair_expires_at: future(), updated_at: now(),
  }));
});

test('server atomic revocation of age and chat clearance shuts down an active thread', async () => {
  await seed('adult');
  await seedChat({ vetted: true });
  const buyer = verifiedContext(env, 'buyer').firestore();
  await assertSucceeds(createMessage(buyer, 'before-revocation'));
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const batch = writeBatch(db);
    batch.update(doc(db, 'age_proofs_v2/buyer'), { revoked: true });
    batch.update(doc(db, 'chats/chat-buyer-listing'), {
      guardian_pair_revoked: true, guardian_pair_expires_at: past(),
    });
    // Synthetic test accounting resets only to isolate the access decision.
    batch.delete(doc(db, 'rate_limits/buyer-message_create'));
    await batch.commit();
  });
  await assertFails(createMessage(buyer, 'after-revocation'));
  await assertFails(updateDoc(doc(buyer, 'chats/chat-buyer-listing'), {
    last_message: 'Must not proceed', last_message_at: now(), updated_at: now(),
  }));
});

test('revoked or expired chat clearance blocks last-message updates as well as new messages', async () => {
  await seed('adult');
  await seedChat({ vetted: true });
  const buyer = verifiedContext(env, 'buyer').firestore();
  await assertSucceeds(updateDoc(doc(buyer, 'chats/chat-buyer-listing'), {
    last_message: 'Authorised', last_message_at: now(), updated_at: now(),
  }));
  await env.withSecurityRulesDisabled(async (ctx) =>
    updateDoc(doc(ctx.firestore(), 'chats/chat-buyer-listing'), {
      guardian_pair_revoked: true,
    }));
  await assertFails(updateDoc(doc(buyer, 'chats/chat-buyer-listing'), {
    last_message: 'Revoked', last_message_at: now(), updated_at: now(),
  }));
});

test('approved participants can read historical chat, message and receipt documents', async () => {
  await seed('adult');
  await seedChat({ vetted: true });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'chats/chat-buyer-listing/messages/historical'), {
      sender_id: 'seller', text: 'Existing conversation', created_at: now(),
    });
    await setDoc(doc(db, 'chats/chat-buyer-listing/confirmations/buyer'), {
      user_id: 'buyer', created_at: now(),
    });
    await setDoc(doc(db, 'chats/chat-buyer-listing/reads/buyer'), {
      user_id: 'buyer', read_at: now(),
    });
  });
  const buyer = verifiedContext(env, 'buyer').firestore();
  for (const path of [
    'chats/chat-buyer-listing',
    'chats/chat-buyer-listing/messages/historical',
    'chats/chat-buyer-listing/confirmations/buyer',
    'chats/chat-buyer-listing/reads/buyer',
  ]) await assertSucceeds(getDoc(doc(buyer, path)));
});

test('revocation denies historical chat, messages and receipts to former participants', async () => {
  await seed('adult');
  await seedChat({ vetted: true });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'chats/chat-buyer-listing/messages/historical'), {
      sender_id: 'seller', text: 'Old message', created_at: now(),
    });
    await setDoc(doc(db, 'chats/chat-buyer-listing/confirmations/buyer'), {
      user_id: 'buyer', created_at: now(),
    });
    await setDoc(doc(db, 'chats/chat-buyer-listing/reads/buyer'), {
      user_id: 'buyer', read_at: now(),
    });
    await updateDoc(doc(db, 'chats/chat-buyer-listing'), { guardian_pair_revoked: true });
  });
  const buyer = verifiedContext(env, 'buyer').firestore();
  for (const path of [
    'chats/chat-buyer-listing',
    'chats/chat-buyer-listing/messages/historical',
    'chats/chat-buyer-listing/confirmations/buyer',
    'chats/chat-buyer-listing/reads/buyer',
  ]) await assertFails(getDoc(doc(buyer, path)));
  await assertFails(setDoc(doc(buyer, 'chats/chat-buyer-listing/reads/new'), {
    user_id: 'buyer', read_at: now(),
  }));
  await assertFails(setDoc(doc(buyer, 'chats/chat-buyer-listing/confirmations/buyer-new'), {
    user_id: 'buyer', created_at: now(),
  }));
});

test('unvetted historical chat and message are not visible to a child', async () => {
  await seed('under_13');
  await seedChat();
  await env.withSecurityRulesDisabled(async (ctx) =>
    setDoc(doc(ctx.firestore(), 'chats/chat-buyer-listing/messages/old'), {
      sender_id: 'seller', text: 'Archive', created_at: now(),
    }));
  const buyer = verifiedContext(env, 'buyer').firestore();
  await assertFails(getDoc(doc(buyer, 'chats/chat-buyer-listing')));
  await assertFails(getDoc(doc(buyer, 'chats/chat-buyer-listing/messages/old')));
});

test('verified adult with server-vetted active recipient can create a message', async () => {
  await seed('adult');
  await seedChat({ vetted: true });
  try {
    await assertSucceeds(createMessage(verifiedContext(env, 'buyer').firestore()));
  } catch (error) {
    // Synthetic demo project only. Inspect the official local emulator
    // expression report to differentiate access-call exhaustion vs failed
    // predicates. Never log real account records or auth tokens.
    const url = `http://${hostname}:${Number(portRaw || 8080)}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}:ruleCoverage`;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      const report = await response.text();
      console.error('GUARDIAN_DEMO_RULE_COVERAGE_STATUS', response.status);
      console.error('GUARDIAN_DEMO_RULE_COVERAGE_TAIL', report.slice(-9500));
    } catch (coverageError) {
      console.error('GUARDIAN_DEMO_COVERAGE_UNAVAILABLE', String(coverageError));
    }
    throw error;
  }
});
