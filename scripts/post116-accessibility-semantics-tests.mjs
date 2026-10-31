import assert from 'node:assert/strict';
import fs from 'node:fs';

const gate = fs.readFileSync('src/components/BackendGate.tsx', 'utf8');
const controls = fs.readFileSync('src/components/NationalAccountControls.tsx', 'utf8');
const publish = fs.readFileSync('src/components/NationalPublishScreen.tsx', 'utf8');

const passwordLabel = "aria-label={showPassword ? 'Ocultar clave' : 'Mostrar clave'}";
const passwordPressed = 'aria-pressed={showPassword}';

assert.equal(
  gate.split(passwordLabel).length - 1,
  3,
  'register/login/legacy password visibility controls must all have an accessible action label',
);
assert.equal(
  gate.split(passwordPressed).length - 1,
  3,
  'register/login/legacy password visibility controls must all expose toggle state',
);

assert.match(controls, /role="switch"\s+aria-checked=\{preferences\[key\]\}/);
assert.match(
  controls,
  /aria-label=\{\`\$\{LABELS\[key\]\}: \$\{preferences\[key\] \? 'activada' : 'desactivada'\}\`\}/,
);
assert.match(controls, /aria-expanded=\{open\}/);
assert.match(controls, /aria-expanded=\{passwordOpen\}/);

assert.match(publish, /role="status"\s+aria-live="polite"\s+aria-atomic="true"/);
assert.match(publish, /aria-label="Dictar a Topi"/);
assert.match(publish, /aria-label="Agregar foto"/);
assert.match(publish, /aria-label=\{\`Quitar foto \$\{index \+ 1\}\`\}/);

assert.doesNotMatch(gate, /tabIndex=\{-1\}[^>]*showPassword/);
assert.doesNotMatch(controls, /tabIndex=\{-1\}[^>]*(?:switch|preferences)/);

// Source-only Android touch-target and accessible form-name regression.
// Does not claim the historical E21 Robo 47dp target is physically cleared.
const indexCss = fs.readFileSync('src/index.css', 'utf8');
for (const id of ['title', 'price', 'category', 'description']) {
  const target = 'tutop-publish-' + id;
  assert.match(publish, new RegExp('htmlFor="' + target + '"'));
  assert.match(publish, new RegExp('id="' + target + '"'));
  assert.equal(publish.split('id="' + target + '"').length - 1, 1,
    'each visible field must have one unambiguous ID');
}
for (const label of ['Condición del producto', 'Cantidad de unidades', 'Punto de encuentro']) {
  assert(publish.includes('aria-label="' + label + '"'),
    'advanced publish field must have a programmatic name: ' + label);
}
assert.match(indexCss, /\.publish-input \{ height:48px; min-height:48px;/);
assert.match(indexCss, /\.meeting-option \{ min-height:48px;/);
assert.match(indexCss, /\.assist-button \{ min-height:48px;/);
assert.match(indexCss, /\.topi-button \{[^\n]*min-height:48px;/);
console.log('PASS accessibility semantics: password toggles named/stateful, preferences expose switch state, disclosures expose expansion, publish live status preserved');
