import fs from 'node:fs';

const path = 'firebase/firestore.v2.generated.rules';
if (!fs.existsSync(path)) {
  console.error(`DETENIDO: falta ${path}; ejecuta prepare-firestore-v2-rules primero.`);
  process.exit(2);
}

let rules = fs.readFileSync(path, 'utf8');
const legacyOnly = "        && exists(/databases/$(database)/documents/products/$(request.resource.data.product_id))";
const canonicalAware = `        && (
          exists(/databases/$(database)/documents/products/$(request.resource.data.product_id))
          || exists(/databases/$(database)/documents/listings_v2/$(request.resource.data.product_id))
        )`;
const occurrences = rules.split(legacyOnly).length - 1;
if (occurrences !== 1) {
  console.error(`DETENIDO: se esperaba exactamente una regla legacy de target favorito y se encontraron ${occurrences}.`);
  process.exit(2);
}
rules = rules.replace(legacyOnly, canonicalAware);
fs.writeFileSync(path, rules);
console.log('✅ Favorites V2 Rules endurecidas: target válido puede existir en products o listings_v2.');
