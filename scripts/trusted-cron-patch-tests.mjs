import fs from 'node:fs';
import assert from 'node:assert/strict';

const workflow = fs.readFileSync('.github/workflows/v2-trusted-maintenance.yml', 'utf8');
const doc = fs.readFileSync('docs/TRUSTED_CRON_DEFAULT_BRANCH_PATCH_0.9.md', 'utf8');
assert.match(workflow, /cron: "17 \* \* \* \*"/);
assert.match(workflow, /tutop-beta-vicmdlb-1356585881/);
assert.match(doc, /GitHub ejecuta `schedule` únicamente desde la rama por defecto/);
assert.match(doc, /PR aislado de infraestructura/);
assert.match(doc, /NO APLICAR AHORA/);
assert.match(doc, /main continúa fuera de alcance/);
assert.doesNotMatch(doc, /activar producción|App Check enforcement|billing/i);
console.log('PASS current workflow declares hourly staging cron');
console.log('PASS activation plan correctly requires default branch');
console.log('PASS plan is documentation-only and does not authorize main changes');
console.log('Trusted cron patch contract: PASS');
