import assert from 'node:assert/strict';
import fs from 'node:fs';

const card = fs.readFileSync('src/components/ProductCard.tsx','utf8');
const detail = fs.readFileSync('src/components/ProductDetail.tsx','utf8');
const feed = fs.readFileSync('src/components/Feed.tsx','utf8');

assert.match(card, /product\.moderation_status === 'pending' \? 'En revisión'/);
assert.match(card, /product\.moderation_status === 'rejected' \? 'Rechazada'/);
assert.match(detail, /En revisión · aún no visible para otros/);
assert.match(detail, /product\.moderation_status !== 'approved'/);
assert.doesNotMatch(detail, /product\.estado === 'Activo' \? 'Disponible' : product\.estado/);

assert.match(feed, /const myPublicProducts = mySellerProducts\.filter\(\(product\) => product\.moderation_status === 'approved'\)/);
assert.match(feed, /const myPendingProducts = mySellerProducts\.filter/);
assert.match(feed, /publicación visible/);
assert.match(feed, /en revisión/);
assert.match(feed, /todavía no son visibles para otros usuarios/);
assert.equal(feed.includes('myActiveProducts.length'), false);

console.log('PASS seller moderation truth: pending/rejected/review never masquerade as audience-public active listings');
