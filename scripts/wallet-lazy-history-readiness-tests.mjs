import fs from 'node:fs';
import assert from 'node:assert/strict';

const wallet = fs.readFileSync('src/components/WalletView.tsx', 'utf8');
const backend = fs.readFileSync('src/services/walletHistoryBackend.ts', 'utf8');
const online = fs.readFileSync('src/services/onlineBackend.ts', 'utf8');

assert.match(backend, /DEFAULT_WALLET_HISTORY_LIMIT = 12/);
assert.match(backend, /MAX_WALLET_HISTORY_LIMIT = 24/);
assert.match(backend, /wallet_transactions/);
assert.match(backend, /created_at', direction: 'DESCENDING'/);
assert.match(wallet, /transactions\.length \? transactions : lazyTransactions/);
assert.match(wallet, /if \(transactions\.length \|\| historyState !== 'idle'\) return/);
assert.match(wallet, /walletHistoryBackend\.load\(WALLET_HISTORY_INITIAL_LIMIT\)/);
assert.match(wallet, /history\.slice\(0, 8\)/);

// Deliberate migration guard: until the monolithic snapshot query is removed,
// Wallet must prefer snapshot transactions so this readiness layer adds zero
// duplicate reads. Once the query is removed, update this contract in the same
// change and lower the global snapshot budget accordingly.
assert.match(online, /client\.runQuery<any>\('wallet_transactions',[\s\S]*?100\)/);

console.log('PASS Wallet lazy loader is capped to 12 initial / 24 maximum rows');
console.log('PASS Wallet does not issue a lazy query while snapshot transactions are present');
console.log('PASS current snapshot still owns wallet history; 100→12 saving is PREPARED, not yet claimed active');
console.log('Wallet lazy history readiness contract: PASS');
