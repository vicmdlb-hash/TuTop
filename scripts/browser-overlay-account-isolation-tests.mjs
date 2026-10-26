import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

// Run the production navigation bridge with a fake shared browser history,
// not a hand-copied implementation. No browser, Firebase or PII is accessed.
let state = {
  user: { id: 'alice' }, selectedProductId: null, activeChatId: null,
  openProduct(id) { state.selectedProductId = id; },
  closeProduct() { state.selectedProductId = null; },
  openChat(id) { state.activeChatId = id; },
  closeChat() { state.activeChatId = null; },
  contactProduct() { return 'chat-synthetic'; },
};
const callbacks = new Set();
const store = {
  getState: () => state,
  setState: (patch) => Object.assign(state, patch),
  subscribe: (cb) => { callbacks.add(cb); return () => callbacks.delete(cb); },
};
const nav = {
  state: {},
  pushCount: 0,
  replaceCount: 0,
  backCount: 0,
  pushState(next) { this.pushCount++; this.state = next; },
  replaceState(next) { this.replaceCount++; this.state = next; },
  back() { this.backCount++; },
};
const win = { location: { href: 'https://example.test/app' } };
const telemetry = [];
const source = fs.readFileSync('src/services/navigationHistoryBridge.ts', 'utf8')
  .replace(/^import .*;\n/gm, '');
const js = stripTypeScriptTypes(source).replace(/^export /gm, '');
const bridge = new Function('useAppStore','qaEvent','history','window',
  js + '; return { handleTutopPopState };'
)(store,(kind,id)=>telemetry.push({kind,id}),nav,win);
function changeUser(id) {
  const previous = { ...state, user: { ...state.user } };
  state = { ...state, user: { id }, selectedProductId: null, activeChatId: null };
  for (const callback of callbacks) callback(state, previous);
}
state.openProduct('alice-private-listing');
assert.equal(nav.state.tutopOverlay.ownerUid,'alice');
assert.equal(nav.state.tutopOverlay.id,'alice-private-listing');
const oldEntry = structuredClone(nav.state);
changeUser('bob');
assert.equal(nav.state.tutopOverlay,undefined,
  'A -> B must remove current stale overlay from browser state immediately');
state.openProduct('bob-listing');
assert.equal(nav.state.tutopOverlay.ownerUid,'bob');
assert.equal(nav.state.tutopOverlay.id,'bob-listing');
const bobEntry=structuredClone(nav.state);
state.closeProduct();
assert.equal(nav.backCount,1,'same-owner overlay still uses browser Back');
changeUser('alice');
assert.equal(nav.state.tutopOverlay,undefined,
  'B -> A must remove B history marker');
nav.state=oldEntry;
changeUser('bob');
assert.equal(nav.state.tutopOverlay,undefined,'stale A marker scrubbed after switch');
nav.state=oldEntry;
bridge.handleTutopPopState();
assert.equal(nav.state.tutopOverlay,undefined,'Back navigation must scrub resurrected A state');
nav.state=bobEntry;
state.openProduct('bob-next');
assert.equal(nav.state.tutopOverlay.ownerUid,'bob','new B overlay overwrites old data');
changeUser('');
const before=nav.pushCount;
state.openProduct('unauthenticated-item');
assert.equal(nav.pushCount,before,'signed-out app cannot persist private overlay');
assert.equal(nav.state.tutopOverlay,undefined,'signout must remove browser overlay');
assert.equal(callbacks.size,1,'single scoped subscription should be installed');
console.log('PASS shared browser navigation state: A->B, B->A, back replay, logout and owned overlays');
