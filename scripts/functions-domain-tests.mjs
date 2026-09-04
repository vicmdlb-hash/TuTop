import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let ts;
try { ts = require('typescript'); }
catch { ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js'); }
const source = fs.readFileSync(path.resolve('functions/src/domain.ts'), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const temp = path.join(os.tmpdir(), `tutop-functions-domain-${process.pid}.cjs`);
fs.writeFileSync(temp, js);
const domain = require(temp);

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
test('niveles de vendedor server-side', () => { assert.equal(domain.sellerLevel(0), 'Novato'); assert.equal(domain.sellerLevel(50), 'Pro'); assert.equal(domain.sellerLevel(200), 'Leyenda'); });
test('semana ISO de septiembre 2026', () => assert.equal(domain.weekKey(new Date('2026-09-03T18:00:00Z')), '2026-W36'));
test('semana ISO cruza año correctamente', () => assert.equal(domain.weekKey(new Date('2025-12-29T18:00:00Z')), '2026-W01'));
test('ranking id es estable y normalizado', () => assert.equal(domain.rankingId('2026-W36', 'Turismo Internacional', 'Apuntes & Guías'), '2026-W36__turismo-internacional__apuntes-guias'));
test('moderación básica server-side', () => { assert.equal(domain.FORBIDDEN.test('vendo una pistola'), true); domain.FORBIDDEN.lastIndex = 0; assert.equal(domain.FORBIDDEN.test('vendo apuntes de inglés'), false); });

let failures = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (error) { failures += 1; console.error(`FAIL ${name}: ${error.message}`); }
}
fs.rmSync(temp, { force: true });
console.log(`Functions domain tests: ${tests.length - failures}/${tests.length} PASS.`);
process.exit(failures ? 1 : 0);
