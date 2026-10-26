import assert from 'node:assert/strict';
import fs from 'node:fs';
import { safeMeetingPointsFor } from '../src/lib/universityNetwork.ts';

const card = fs.readFileSync('src/components/TransactionReservationCard.tsx', 'utf8');
assert.doesNotMatch(card, /localStorage|tutop\.university-identity\.v1|readIdentity\(/,
  'shared-device unscoped identity must never drive meeting point suggestions');
assert.match(card, /const user = useAppStore\(\(state\) => state\.user\)/);
assert.match(card, /currentUserId && user\.id === currentUserId/);
assert.match(card, /currentAccount \? safeMeetingPointsFor\(campusId, institutionId\)/);
assert.match(card, /\[currentAccount, campusId, institutionId\]/,
  'changing accounts must recalculate meeting-point recommendations');
assert.match(card, /setTransaction\(null\)/);
assert.match(card, /setSelectedPointId\(''\)/);
assert.match(card, /\[chatId, currentUserId, currentAccount\]/,
  'account switch must invalidate any async transaction load');
assert.match(card, /value\.chat_id !== chatId/);
assert.match(card, /value\.buyer_id !== currentUserId && value\.seller_id !== currentUserId/);
assert.match(card, /transactionHint\.buyer_id !== currentUserId && transactionHint\.seller_id !== currentUserId/);
assert.match(card, /!currentAccount \|\| !transaction \|\| transaction\.chat_id !== chatId \|\| \(!isSeller && !isBuyer\)/,
  'render must fail closed when transaction is not for the active authenticated account');
const campusA = safeMeetingPointsFor('uatx-riberena', 'uatx');
const campusB = safeMeetingPointsFor('buap-cu', 'buap');
assert(campusA.length > 0 && campusB.length > 0);
assert(campusA.every(point => point.campus_id === 'uatx-riberena'));
assert(campusB.every(point => point.campus_id === 'buap-cu'));
assert(!campusA.some(point => campusB.some(other => other.id === point.id)),
  'one university must not inherit another university meeting-point recommendations');
assert.deepEqual(safeMeetingPointsFor(undefined, undefined), [],
  'anonymous/stale identity must have zero campus suggestions');
console.log('PASS transaction card never uses unscoped campus history; account/chat changes invalidate stale state; catalogs isolated');
