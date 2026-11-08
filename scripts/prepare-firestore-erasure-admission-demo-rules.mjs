// DEMO ONLY: evaluate owner and counterparty admission freeze in the emulator.
// NEVER deploy or replace firebase/firestore.v2.generated.rules or live Rules.
import fs from 'node:fs';

const required = 'demo-tutop-post120-rules';
if (process.env.GCLOUD_PROJECT !== required || process.env.FIREBASE_PROJECT_ID !== required) {
  throw new Error('ERASURE_FREEZE_DEMO_ONLY_PROJECT_REQUIRED');
}
const input = 'firebase/firestore.v2.generated.rules';
const output = 'firebase/firestore.v2.erasure-freeze-demo.rules';
let rules = fs.readFileSync(input, 'utf8');

function requireOnce(value, label) {
  const count = rules.split(value).length - 1;
  if (count !== 1) throw new Error('ERASURE_FREEZE_DEMO_MARKER_DRIFT:' + label + ':' + count);
}
const notSuspended = /^    function notSuspended\(\) \{[^\n]+\}$/m;
const original = rules.match(notSuspended);
if (!original || !original[0].includes('request.auth.uid')) {
  throw new Error('ERASURE_FREEZE_DEMO_NOT_SUSPENDED_DRIFT');
}
const helper = String.raw`
    // Idempotent client admission check: an existing request is closed to
    // commerce unless trusted support explicitly marked it rejected.
    // A missing field/status fails closed instead of assuming healthy.
    function erasureAdmissionAllows(uid) {
      let target = /databases/$(database)/documents/account_deletion_requests/$(uid);
      return uid is string && uid.size() > 0
        && (!exists(target) || get(target).data.status == 'rejected');
    }
`;
rules = rules.replace(original[0], helper + original[0].replace(
  /; \}$/, ' && erasureAdmissionAllows(request.auth.uid); }',
));

// Wrap EVERY alternative of a write verb in the scope. Treat unguarded
// secondary update rules as a hard error, not as an authorized bypass.
function guardAllAlternatives(section, verb, guard, label) {
  const token = 'allow ' + verb + ': if ';
  let cursor = 0, out = '', count = 0;
  while (true) {
    const at = section.indexOf(token, cursor);
    if (at < 0) break;
    const predicateAt = at + token.length;
    const terminator = section.indexOf(';', predicateAt);
    if (terminator < 0) throw new Error('ERASURE_FREEZE_DEMO_NO_TERMINATOR:' + label);
    out += section.slice(cursor, predicateAt)
      + '(' + section.slice(predicateAt, terminator) + ') && (' + guard + ');';
    cursor = terminator + 1;
    count += 1;
  }
  if (count < 1 || count > 6) throw new Error('ERASURE_FREEZE_DEMO_WRITE_DRIFT:' + label + ':' + count);
  return out + section.slice(cursor);
}

// Parent match rules exclude nested matches; all update/create alternatives
// are protected by wrapping the WHOLE predicate, including any OR branches.
function guardRoot(collection, verb, guard) {
  const start = '    match /' + collection + '/{';
  const begin = rules.indexOf(start);
  if (begin < 0 || rules.indexOf(start, begin + start.length) >= 0)
    throw new Error('ERASURE_FREEZE_DEMO_ROOT_DRIFT:' + collection);
  const nextTop = rules.indexOf('\n    match /', begin + start.length);
  if (nextTop < 0) throw new Error('ERASURE_FREEZE_DEMO_ROOT_END:' + collection);
  const nested = rules.indexOf('\n      match /', begin + start.length);
  const end = nested >= 0 && nested < nextTop ? nested : nextTop;
  const old = rules.slice(begin, end);
  const updated = guardAllAlternatives(old, verb, guard, collection + ':' + verb);
  rules = rules.slice(0, begin) + updated + rules.slice(end);
}

function guardNested(nestedCollection, verb, guard) {
  const start = '      match /' + nestedCollection + '/{';
  const begin = rules.indexOf(start);
  if (begin < 0 || rules.indexOf(start, begin + start.length) >= 0)
    throw new Error('ERASURE_FREEZE_DEMO_NESTED_DRIFT:' + nestedCollection);
  // The last child collection (reads) ends at the next root match.
  const nextNested = rules.indexOf('\n      match /', begin + start.length);
  const nextRoot = rules.indexOf('\n    match /', begin + start.length);
  const end = nextNested >= 0 && (nextRoot < 0 || nextNested < nextRoot)
    ? nextNested : nextRoot;
  if (end < 0) throw new Error('ERASURE_FREEZE_DEMO_NESTED_END:' + nestedCollection);
  const old = rules.slice(begin, end);
  const updated = guardAllAlternatives(old, verb, guard, nestedCollection + ':' + verb);
  rules = rules.slice(0, begin) + updated + rules.slice(end);
}
const pair = (data) => 'erasureAdmissionAllows(' + data + '.buyer_id) && erasureAdmissionAllows(' + data + '.seller_id)';
for (const collection of ['chats', 'offers', 'transactions_v2']) {
  guardRoot(collection, 'create', pair('request.resource.data'));
  guardRoot(collection, 'update', pair('resource.data'));
}
for (const child of ['messages', 'confirmations', 'reads']) {
  guardNested(child, child === 'reads' ? 'create, update' : 'create', pair('chatDoc(chatId).data'));
}
for (const collection of ['wallet_transactions', 'bids']) {
  guardRoot(collection, 'create', 'erasureAdmissionAllows(request.auth.uid)');
}
const originalApply = fs.readFileSync('scripts/process-account-erasure.mjs', 'utf8');
if (!originalApply.includes("if (apply) throw new Error('ACCOUNT_ERASURE_ADMISSION_FREEZE_NOT_VERIFIED')"))
  throw new Error('ERASURE_APPLY_MUST_REMAIN_BLOCKED');
fs.writeFileSync(output, rules);
console.log('PASS demo-only erasure admission candidate generated; trusted writers still unverified and apply remains frozen');
