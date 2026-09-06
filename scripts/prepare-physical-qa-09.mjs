import fs from 'node:fs';

const VERSION = '0.9.0-beta.0';
const CODE = 90000;

function json(path, mutate) {
  const data = JSON.parse(fs.readFileSync(path, 'utf8'));
  mutate(data);
  fs.writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}
function text(path, replacements) {
  let value = fs.readFileSync(path, 'utf8');
  for (const [from, to] of replacements) {
    if (!value.includes(from)) throw new Error(`${path}: falta marcador ${from}`);
    value = value.split(from).join(to);
  }
  fs.writeFileSync(path, value);
}

json('package.json', (x) => { x.version = VERSION; });
json('package-lock.json', (x) => { x.version = VERSION; if (x.packages?.['']) x.packages[''].version = VERSION; });
json('config/project.json', (x) => { x.currentBetaVersion = VERSION; });

text('scripts/beta-ready.mjs', [["const expectedBeta = '0.8.5-beta.0';", `const expectedBeta = '${VERSION}';`]]);
text('scripts/configure-android-beta-version.mjs', [
  ["'0.8.5-beta.0'", `'${VERSION}'`],
  ["/^0\\.8\\.5-beta\\.\\d+$/", "/^0\\.9\\.0-beta\\.\\d+$/"],
  ['versionCode < 80500 || versionCode > 80599', 'versionCode < 90000 || versionCode > 90099'],
  ['rango 0.8.5 beta', 'rango 0.9 beta'],
  ['|| 80500', `|| ${CODE}`],
]);
text('scripts/install-mobile-deps.mjs', [['TuTop 0.8.5', 'TuTop 0.9 Physical QA']]);
text('src/services/nativeFirebaseSecurity.ts', [["'0.8.5-beta.0'", `'${VERSION}'`]]);
text('scripts/physical-qa-regression-tests.mjs', [
  ["0\\.8\\.5-beta\\.0", "0\\.9\\.0-beta\\.0"],
  ["'0.8.5-beta.0'", `'${VERSION}'`],
]);

console.log(`Prepared TuTop ${VERSION} / Android ${CODE}.`);
