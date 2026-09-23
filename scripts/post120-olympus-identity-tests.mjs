import assert from 'node:assert/strict';
import fs from 'node:fs';
import { OLYMPUS_PLANS, OLYMPUS_REPUTATION, TUTOP_PODIUM, podiumForRank, reputationInputsAreEarnedOnly } from '../src/lib/olympusIdentity.ts';

assert.equal(TUTOP_PODIUM[1].label,'Oro');
assert.equal(TUTOP_PODIUM[2].label,'Plata');
assert.equal(TUTOP_PODIUM[3].label,'Bronce');
assert.equal(podiumForRank(4).medal,'none');

assert.deepEqual(OLYMPUS_REPUTATION.map(x=>x.tier),['Iniciado','Héroe','Semidiós','Olímpico']);
assert.ok(OLYMPUS_REPUTATION.every(x=>x.source==='earned_only'));
assert.ok(OLYMPUS_PLANS.every(x=>x.trustEffect===false));
assert.deepEqual(OLYMPUS_PLANS.filter(x=>x.paid).map(x=>x.plan),['Hermes','Atenea','Zeus']);

const normalized=reputationInputsAreEarnedOnly({completedTransactions:3.9,positiveReviewRate:120,cancellations:-2,noShows:1,upheldReports:0});
assert.deepEqual(normalized,{completedTransactions:3,positiveReviewRate:100,cancellations:0,noShows:1,upheldReports:0});

const source=fs.readFileSync('src/lib/olympusIdentity.ts','utf8');
for(const forbidden of ['price','subscriptionAmount','walletBalance','ucoinsBalance','paidBoost']) assert.ok(!source.includes(forbidden));
const spec=fs.readFileSync('docs/olympus-product-model.md','utf8');
assert.match(spec,/pagar nunca convierte/i);
assert.match(spec,/no hay billing/i);

console.log('PASS podium, earned reputation and paid plan are three independent axes');
console.log('PASS no plan can modify trust or reputation by contract');
