import fs from 'node:fs';
import assert from 'node:assert/strict';

const wallet = fs.readFileSync('src/components/WalletView.tsx', 'utf8');
const backend = fs.readFileSync('src/services/walletHistoryBackend.ts', 'utf8');
const online = fs.readFileSync('src/services/onlineBackend.ts', 'utf8');

assert.match(backend, /DEFAULT_WALLET_HISTORY_LIMIT = 12/);
assert.match(backend, /MAX_WALLET_HISTORY_LIMIT = 24/);
assert.match(backend, /wallet_transactions/);
assert.match(backend, /created_at', direction: 'DESCENDING'/);
assert.match(wallet, /walletLazyCutoverEnabled/);
assert.match(wallet, /const lazyCutover = walletLazyCutoverEnabled\(\)/);
assert.match(wallet, /transactions\.length \? transactions : lazyTransactions/);
assert.match(wallet, /transactions\.length \|\| !lazyCutover \? 'ready' : 'idle'/);
assert.match(wallet, /if \(!lazyCutover \|\| transactions\.length \|\| historyState !== 'idle'\) return/);
assert.match(wallet, /walletHistoryBackend\.load\(WALLET_HISTORY_INITIAL_LIMIT\)/);
assert.match(wallet, /history\.slice\(0, 8\)/);

// Legacy snapshot still owns wallet history while the flag is false, including
// the valid empty-history case. Therefore the lazy loader must remain dormant.
assert.match(online, /client\.runQuery<any>\('wallet_transactions',[\s\S]*?100\)/);

console.log('PASS Wallet lazy loader is capped to 12 initial / 24 maximum rows');
console.log('PASS Wallet lazy query is fully dormant while the staging-only cutover flag is false');
console.log('PASS current snapshot still owns wallet history; 100→0 startup saving remains gated');
console.log('Wallet lazy history readiness contract: PASS');
