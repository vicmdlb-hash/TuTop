import fs from 'node:fs';

const path = 'firebase/firestore.v2.generated.rules';
let rules = fs.readFileSync(path, 'utf8');

const shippingRequirement = "        && (request.resource.data.visibility_scope != 'national' || request.resource.data.shipping_available == true)\n";
const count = rules.split(shippingRequirement).length - 1;
if (count !== 2) {
  console.error(`DETENIDO: shipping mandate esperaba exactamente 2 coincidencias y encontró ${count}.`);
  process.exit(2);
}
rules = rules.split(shippingRequirement).join('');

// Approximate coordinates live inside the already-authorized attributes map as
// approx_latitude/approx_longitude. This keeps the canonical schema stable and
// avoids exposing exact device coordinates or adding another Firestore index.
fs.writeFileSync(path, rules);
console.log('✅ Rules 0.9.1: alcance nacional ya no exige paquetería de TuTop; cercanía permanece dentro de attributes.');
