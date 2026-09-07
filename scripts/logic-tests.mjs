import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

// TypeScript 7 no longer ships the legacy JavaScript compiler API. Node 22 can
// execute erasable TypeScript directly, so the smoke test re-runs itself with
// type stripping enabled and imports the real source module.
if (process.env.TUTOP_NODE_TS_STRIP !== '1') {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', fileURLToPath(import.meta.url)], {
    stdio: 'inherit',
    env: { ...process.env, TUTOP_NODE_TS_STRIP: '1', NODE_NO_WARNINGS: '1' },
  });
  process.exit(result.status ?? 1);
}

const sourceUrl = pathToFileURL(path.resolve('src/lib/productAssistant.ts')).href;
const publishSourceUrl = pathToFileURL(path.resolve('src/lib/publishAssistant.ts')).href;
const logic = await import(`${sourceUrl}?t=${Date.now()}`);
const publishLogic = await import(`${publishSourceUrl}?t=${Date.now()}`);

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
test('Topi detecta condición y negociación', () => {
  assert.equal(publishLogic.detectListingCondition('Audífonos como nuevos, casi sin uso'), 'Como nuevo');
  assert.equal(publishLogic.detectListingCondition('Laptop no enciende, para reparar'), 'Para reparar');
  assert.equal(publishLogic.detectNegotiableIntent('Precio negociable, escucho ofertas'), true);
  assert.equal(publishLogic.detectNegotiableIntent('Precio fijo'), false);
});
test('Topi detecta entrega y alcance', () => {
  assert.deepEqual(publishLogic.detectDeliveryIntent('Entrego en Campus Ribereña'), ['campus_meetup']);
  assert.deepEqual(publishLogic.detectDeliveryIntent('Hago envío nacional por paquetería'), ['shipping']);
  assert.equal(publishLogic.detectVisibilityIntent('Envío a todo México'), 'national');
  assert.equal(publishLogic.detectVisibilityIntent('Entrego en campus'), 'campus');
});
test('niveles PP', () => { assert.equal(logic.sellerLevelFor(49), 'Novato'); assert.equal(logic.sellerLevelFor(50), 'Pro'); assert.equal(logic.sellerLevelFor(200), 'Leyenda'); });
test('confiabilidad acotada', () => { assert.equal(logic.reliabilityFor(0), 98); assert.ok(logic.reliabilityFor(3) >= 0); });

let failures = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (error) { failures += 1; console.error(`FAIL ${name}: ${error.message}`); }
}
console.log(`Logic smoke tests: ${tests.length - failures}/${tests.length} PASS.`);
process.exit(failures ? 1 : 0);
