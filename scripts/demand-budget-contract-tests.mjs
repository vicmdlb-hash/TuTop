import fs from 'node:fs';
import assert from 'node:assert/strict';

const demand = fs.readFileSync('src/components/DemandRequestComposer.tsx', 'utf8');

assert.match(demand, /function parseOptionalBudget\(value: string\)/);
assert.match(demand, /Number\.isFinite\(parsed\) && parsed >= 0/);
assert.match(demand, /const budgetValid = parsedBudget !== null/);
assert.match(demand, /max_price_mxn: parsedBudget/);
assert.doesNotMatch(demand, /Math\.max\(0, Number\(maxPrice\)\)/);
assert.match(demand, /type="number" min="0" step="0\.01"/);
assert.match(demand, /aria-invalid=\{!budgetValid\}/);

console.log('PASS Busco optional budget is empty-or-finite and never sends NaN');
console.log('Demand budget contract: PASS');
