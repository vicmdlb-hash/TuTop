import assert from 'node:assert/strict';
import fs from 'node:fs';
import {isCurrentBackendHydration,isLiveAccountSnapshot} from '../src/lib/backendHydrationIdentity.ts';
const A='synthetic-a', B='synthetic-b';
assert.equal(isCurrentBackendHydration(A,A,A,3,3),true);
for(const [expected,live,snapshot,startEpoch,currentEpoch] of [
 [A,B,A,3,3],[A,A,B,3,3],[A,null,A,3,3],[A,A,A,3,4],
 ['',A,A,3,3],[A,A,undefined,3,3],[A,A,A,-1,0],
]) assert.equal(isCurrentBackendHydration(expected,live,snapshot,startEpoch,currentEpoch),false);
// Real shared UID predicate: bootstrap A is allowed with A's live token;
// A's completed request must never overwrite B or resurrect signed-out A.
assert.equal(isLiveAccountSnapshot('',A,A),true);
assert.equal(isLiveAccountSnapshot(A,A,A),true);
for(const [storeUid,sessionUid,snapshotUid] of [
  [B,B,A], [B,A,A], [A,B,B], [A,A,B],
  ['',null,A], ['',undefined,A], [A,null,A],
  ['',A,B], ['',A,''], ['', '',A],
]) assert.equal(isLiveAccountSnapshot(storeUid,sessionUid,snapshotUid),false,
  'stale or unauthenticated snapshot must not overwrite another account');
const appStore = fs.readFileSync('src/store/useAppStore.ts','utf8');
assert(appStore.includes("import { isLiveAccountSnapshot } from '../lib/backendHydrationIdentity';"));
assert(appStore.includes('if (!isLiveAccountSnapshot(state.user.id, onlineBackend.session?.uid, snapshot.user.id)) return state;'));
// Every optimistic rollback has an originating account; late A failures
// cannot mutate the B view for a shared listing/chat on one device.
for (const [start,end] of [
  ['  updateProduct: (id, updates) => {','  removeProduct:'],
  ['  sendMessage: (chatId, text) => {','  sendImageMessage:'],
  ['  sendImageMessage: (chatId, imageUrl) => {','  markChatRead:'],
  ['  markChatRead: (chatId) => {','  confirmDelivery:'],
]) {
  const section = appStore.split(start)[1]?.split(end)[0];
  assert(section, `missing mutation ${start}`);
  assert(section.includes('const actorUid = '), `missing actor snapshot ${start}`);
  assert(section.includes('if (get().user.id !== actorUid) return;'), `unguarded late error ${start}`);
  assert(section.indexOf('if (get().user.id !== actorUid) return;') < section.indexOf('reportSyncError(set, error);'),
    `late error must not render into another account ${start}`);
}
// The legacy/base store is used outside the V2 connected bridge.
// A failed old send must remove only its message, not restore the prior chat object.
for(const [start,end] of [
  ['  sendMessage: (chatId, text) => {','  sendImageMessage:'],
  ['  sendImageMessage: (chatId, imageUrl) => {','  markChatRead:'],
]) {
  const section=appStore.split(start)[1]?.split(end)[0];
  assert(section?.includes('chat.comprador_id !== actorUid && chat.vendedor_id !== actorUid'));
  assert(section.includes('mensajes: item.mensajes.filter((candidate) => candidate.id !== message.id)'));
  assert(!section.includes('item.id === chatId ? chat : item'), 'whole-chat rollback can lose later messages');
}
// An old failed mark-read must not replace the chat object or newer messages.
const markRead=appStore.split('  markChatRead: (chatId) => {')[1]?.split('  confirmDelivery:')[0];
assert(markRead);
assert(markRead.includes('const mutationKey = `${actorUid}:${chatId}`;'));
assert(markRead.includes('chatReadMutationVersion.get(mutationKey) !== version'));
assert(markRead.includes('{ ...chat, sin_leer: before.sin_leer }'));
assert(!markRead.includes('chat.id === chatId ? before : chat'), 'whole-chat read rollback discards new messages');
// Confirmation failures must not resurrect an older chat object or another account.
const confirm=appStore.split('  confirmDelivery: (chatId) => {')[1]?.split('  submitReview:')[0];
assert(confirm?.includes('const actorUid = state.user.id;'));
assert(confirm.includes('chat.comprador_id !== actorUid && chat.vendedor_id !== actorUid'));
assert(confirm.includes('if (get().user.id !== actorUid) return;'));
assert(confirm.includes('item.confirmaciones_entrega === confirmations'));
assert(confirm.includes('entrega_confirmada: chat.entrega_confirmada'));
assert(!confirm.includes('item.id === chatId ? chat : item'), 'failed confirmation must preserve later chat messages');
// Reviews must be participant-only and stale A errors must never affect B.
const review=appStore.split('  submitReview: (chatId, calificacion, comentario) => {')[1]?.split('  bidProduct:')[0];
assert(review?.includes('const actorUid = state.user.id;'));
assert(review.includes('chat.comprador_id !== actorUid && chat.vendedor_id !== actorUid'));
assert(review.includes('if (get().user.id !== actorUid) return;'));
assert(review.includes('current.reviews.filter((item) => item.id !== review.id)'));
// Creating a product/chat in A cannot display its async error or rollback B.
for(const [start,end] of [
  ['  addProduct: (product) => {','  publishProduct:'],
  ['  addChat: (chat) => {','  updateChat:'],
  ['  contactProduct: (productId) => {','  openChat:'],
]) {
  const section=appStore.split(start)[1]?.split(end)[0];
  assert(section?.includes('const actorUid = '), `actor missing ${start}`);
  assert(section.includes('if (get().user.id !== actorUid) return;'), `late A callback is unsafe: ${start}`);
}
const addChat=appStore.split('  addChat: (chat) => {')[1]?.split('  updateChat:')[0];
assert(addChat.includes('chat.comprador_id !== actorUid && chat.vendedor_id !== actorUid'));
const contact=appStore.split('  contactProduct: (productId) => {')[1]?.split('  openChat:')[0];
assert(contact.includes('if (!actorUid || !product || product.vendedor_id === actorUid'));
// Failed product mutations must never roll back a newer edit on the same listing.
const productEdit=appStore.split('  updateProduct: (id, updates) => {')[1]?.split('  removeProduct:')[0];
assert(appStore.includes('const productMutationVersion = new Map<string, number>();'));
assert(productEdit?.includes('const mutationKey = `${actorUid}:${id}`;'));
assert(productEdit.includes('productMutationVersion.set(mutationKey, version)'));
assert(productEdit.includes('if (get().user.id !== actorUid) return;'));
assert(productEdit.includes('if (productMutationVersion.get(mutationKey) !== version) return;'));
assert(productEdit.indexOf('productMutationVersion.get(mutationKey) !== version') < productEdit.indexOf('if (before) set('));
// Late publish/bid responses may settle, but must not show A's error on B.
for(const [start,end] of [
  ['  publishProduct: async (product, bidAmount = 0) => {','  updateProduct:'],
  ['  bidProduct: async (productId, amount) => {','  toggleFavorite:'],
]) {
  const section=appStore.split(start)[1]?.split(end)[0];
  assert(section?.includes('const actorUid = '), `missing actor ${start}`);
  assert(section.includes('if (get().user.id === actorUid) reportSyncError(set, error);'), `late error after session switch ${start}`);
  assert(section.includes('return get().user.id === actorUid;'), `late success after session switch ${start}`);
}
// A's successful callback may resolve after B signs in. Prevent the callback
// from loading (and then applying) B's snapshot, even if hydrateOnline itself
// checks that the returned snapshot belongs to the current session.
for(const [start,end] of [
  ['  publishProduct: async (product, bidAmount = 0) => {','  updateProduct:'],
  ['  sendMessage: (chatId, text) => {','  sendImageMessage:'],
  ['  sendImageMessage: (chatId, imageUrl) => {','  markChatRead:'],
  ['  confirmDelivery: (chatId) => {','  submitReview:'],
  ['  submitReview: (chatId, calificacion, comentario) => {','  bidProduct:'],
  ['  bidProduct: async (productId, amount) => {','  toggleFavorite:'],
]) {
  const section=appStore.split(start)[1]?.split(end)[0];
  assert(section, `missing async reload ${start}`);
  const reload=section.indexOf('const snapshot = await onlineBackend.loadSnapshot();');
  const hydrate=section.indexOf('get().hydrateOnline(snapshot);',reload);
  assert(reload>=0 && hydrate>reload, `missing guarded reload ${start}`);
  assert(section.lastIndexOf('if (get().user.id !== actorUid)',reload)>=0, `old account can reload B ${start}`);
  assert(section.slice(reload,hydrate).includes('if (get().user.id !== actorUid) return'), `old account can hydrate B ${start}`);
}
const source=fs.readFileSync('src/components/BackendGate.tsx','utf8');
assert.match(source,/const expectedEpoch = authEpoch\.current/);
assert.match(source,/const snapshot = await onlineBackend\.loadSnapshot\(\);[\s\S]*if \(!stillCurrent\(snapshot\.user\.id\)\) return;[\s\S]*hydrateOnline\(snapshot\)/);
assert.match(source,/const verified = await verifiedEmailBetaAuth\.refreshVerificationStatus\(\);\s*if \(!stillCurrent\(expectedUid\)\) return;/);
assert.match(source,/authEpoch\.current \+= 1;[\s\S]*const currentUid/);
assert.match(source,/syncQueued\.current = true/);
assert.match(source,/syncQueued\.current = false;[\s\S]*Promise\.resolve\(\)\.then\(\(\) => sync\(true\)\)/);
console.log('PASS stale Firebase snapshot A cannot hydrate UI for B or after logout; queued B retry is not silently dropped');
