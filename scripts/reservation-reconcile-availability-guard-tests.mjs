import assert from 'node:assert/strict';
import fs from 'node:fs';
// Source-only check: NEVER run credential-bearing staging reconciliation.
const source = fs.readFileSync('scripts/reconcile-v2-reservations.mjs', 'utf8');
const applyStart = source.indexOf('let applied = 0;');
const terminalStart = source.indexOf('let cleanedLocks = 0;', applyStart);
assert(applyStart > 0 && terminalStart > applyStart);
const writes = source.slice(applyStart, terminalStart);
const expiry = writes.slice(writes.indexOf("if (plan.kind === 'expire_reserved')"), writes.indexOf("} else if (plan.kind === 'repair_completed_listing')"));
const terminal = source.slice(terminalStart);
for (const value of ["if (apply && allow !== 'staging-v2')", "const historicalProject = 'tutop-3a4f7'", "__updateTime: row.document.updateTime || null", 'trusted_snapshot_guard_failed', 'currentDocument: { updateTime: expectedUpdateTime }', 'lock?.transaction_id === transaction.id']) assert(source.includes(value), 'missing critical source guard: ' + value);
for (const value of ["status: 'expired'", "availability_status: 'available'", 'plan.transaction_update_time', 'plan.listing_update_time', 'plan.lock_update_time']) assert(expiry.includes(value), 'expiration must atomically handle ' + value);
for (const value of ['lockPlan.release_availability', "availability_status: 'available'", 'lockPlan.listing_update_time', 'lockPlan.lock_update_time', 'status: lockPlan.transaction_status']) assert(terminal.includes(value), 'terminal cleanup must protect ' + value);
assert(!terminal.includes('writes: [deleteWrite('), 'no unconditional terminal lock deletion');
assert(!source.includes('verifyWrite(') && !source.includes('verify:'), 'Firestore REST Write does not support verify');
console.log('PASS source-only reservation reconciliation: atomic availability release and snapshot-conditioned terminal cleanup; no Firebase calls');
