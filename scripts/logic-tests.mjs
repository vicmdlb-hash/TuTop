import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let ts;
try { ts = require('typescript'); }
catch { ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js'); }
const source = fs.readFileSync(path.resolve('src/lib/productAssistant.ts'), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const temp = path.join(os.tmpdir(), `tutop-product-assistant-${process.pid}.cjs`);
fs.writeFileSync(temp, js);
const logic = require(temp);

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('extrae frase completa', () => {
  const result = logic.parseProductMessage('Vendo brownies a 25 pesos, entrego en cafetería', {}, 'Turismo Internacional');
  assert.equal(result.data.precio_mxn, 25);
  assert.equal(result.data.categoria, 'Postres');
  assert.equal(result.data.punto_encuentro, 'Cafetería Central');
  assert.equal(result.data.facultad, 'Turismo Internacional');
  assert.equal(result.complete, true);
});

test('pregunta solo precio si falta', () => {
  const result = logic.parseProductMessage('Sudadera Nike talla M', {}, 'Turismo Internacional');
  assert.equal(result.data.titulo, 'Sudadera Nike talla M');
  assert.equal(result.data.categoria, 'Ropa & Accesorios');
  assert.equal(result.needs, 'precio_mxn');
});

test('bloquea armas', () => {
  const result = logic.parseProductMessage('Vendo una pistola en 3000 pesos', {}, 'Turismo Internacional');
  assert.equal(result.blocked, true);
});

test('bloquea alcohol y vapeo', () => {
  assert.equal(logic.parseProductMessage('Vendo tequila barato', {}, 'Turismo Internacional').blocked, true);
  assert.equal(logic.parseProductMessage('Vendo vape con nicotina', {}, 'Turismo Internacional').blocked, true);
});

test('bloquea medicamentos controlados', () => {
  assert.equal(logic.parseProductMessage('Vendo clonazepam', {}, 'Turismo Internacional').blocked, true);
});

test('bloquea cuentas y fraude académico', () => {
  assert.equal(logic.parseProductMessage('Vendo cuenta de Netflix', {}, 'Turismo Internacional').blocked, true);
  assert.equal(logic.parseProductMessage('Vendo respuestas del examen', {}, 'Turismo Internacional').blocked, true);
});

test('permite apuntes y tutorías legítimas', () => {
  assert.notEqual(logic.parseProductMessage('Vendo apuntes de derecho en 40 pesos, entrego en salón', {}, 'Turismo Internacional').blocked, true);
  assert.notEqual(logic.parseProductMessage('Ofrezco tutoría de inglés en 100 pesos, coordinamos por chat', {}, 'Turismo Internacional').blocked, true);
});

test('detecta punto de encuentro', () => assert.equal(logic.detectMeetingPoint('en la entrada principal'), 'Puerta Principal'));
test('niveles PP', () => { assert.equal(logic.sellerLevelFor(49), 'Novato'); assert.equal(logic.sellerLevelFor(50), 'Pro'); assert.equal(logic.sellerLevelFor(200), 'Leyenda'); });
test('confiabilidad acotada', () => { assert.equal(logic.reliabilityFor(0), 98); assert.ok(logic.reliabilityFor(3) >= 0); });

let failures = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (error) { failures += 1; console.error(`FAIL ${name}: ${error.message}`); }
}
fs.rmSync(temp, { force: true });
console.log(`Logic smoke tests: ${tests.length - failures}/${tests.length} PASS.`);
process.exit(failures ? 1 : 0);
