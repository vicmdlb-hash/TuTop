import fs from 'node:fs';

const path = 'scripts/staging-v2-e2e-smoke.mjs';
let text = fs.readFileSync(path, 'utf8');
const from = `  complete.update(doc(sellerDb, 'transactions_v2', txId), { status: 'completed', seller_confirmed_at: sellerConfirmed, updated_at: sellerConfirmed });\n  complete.update(doc(sellerDb, 'listings_v2', listingId), { status: 'sold_out', updated_at: sellerConfirmed });\n  await complete.commit();\n  assert.equal((await getDoc(doc(sellerDb, 'transactions_v2', txId))).data()?.status, 'completed');\n  assert.equal((await getDoc(doc(sellerDb, 'listings_v2', listingId))).data()?.status, 'sold_out');\n  ok('confirmación bilateral completó tx + sold_out atómicamente');`;
const to = `  complete.update(doc(sellerDb, 'transactions_v2', txId), { status: 'completed', seller_confirmed_at: sellerConfirmed, updated_at: sellerConfirmed });\n  complete.update(doc(sellerDb, 'listings_v2', listingId), { status: 'sold_out', updated_at: sellerConfirmed });\n  complete.delete(doc(sellerDb, 'listing_reservation_locks', listingId));\n  await complete.commit();\n  assert.equal((await getDoc(doc(sellerDb, 'transactions_v2', txId))).data()?.status, 'completed');\n  assert.equal((await getDoc(doc(sellerDb, 'listings_v2', listingId))).data()?.status, 'sold_out');\n  assert.equal((await getDoc(doc(sellerDb, 'listing_reservation_locks', listingId))).exists(), false);\n  ok('confirmación bilateral completó tx + sold_out y liberó reservation lock atómicamente');`;
const count = text.split(from).length - 1;
if (count !== 1) throw new Error(`completion lock cleanup expected 1 occurrence, found ${count}`);
text = text.replace(from, to);
fs.writeFileSync(path, text);
console.log('Completion lock cleanup applied to staging smoke.');
