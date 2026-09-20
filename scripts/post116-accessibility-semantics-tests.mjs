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

console.log('PASS accessibility semantics: password toggles named/stateful, preferences expose switch state, disclosures expose expansion, publish live status preserved');
