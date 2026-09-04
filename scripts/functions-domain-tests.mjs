import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

if (process.env.TUTOP_NODE_TS_STRIP !== '1') {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', fileURLToPath(import.meta.url)], {
    stdio: 'inherit',
    env: { ...process.env, TUTOP_NODE_TS_STRIP: '1', NODE_NO_WARNINGS: '1' },
  });
  process.exit(result.status ?? 1);
}

const sourceUrl = pathToFileURL(path.resolve('functions/src/domain.ts')).href;
const domain = await import(`${sourceUrl}?t=${Date.now()}`);

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
console.log(`Functions domain tests: ${tests.length - failures}/${tests.length} PASS.`);
process.exit(failures ? 1 : 0);
