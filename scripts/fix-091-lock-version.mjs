import fs from 'node:fs';

const expected = '0.9.1-beta.0';
const packagePath = 'package.json';
const lockPath = 'package-lock.json';

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));

if (pkg.name !== 'tutop') {
  console.error(`DETENIDO: package inesperado: ${pkg.name || '<vacío>'}`);
  process.exit(2);
}
if (pkg.version !== expected) {
  console.error(`DETENIDO: package.json debe estar en ${expected}; actual=${pkg.version || '<vacío>'}`);
  process.exit(2);
}
if (!lock.packages || !lock.packages['']) {
  console.error('DETENIDO: package-lock.json no tiene entrada raíz packages[""] esperada.');
  process.exit(2);
}
if (lock.name !== pkg.name || lock.packages[''].name !== pkg.name) {
  console.error('DETENIDO: package-lock.json no corresponde al paquete tutop.');
  process.exit(2);
}

const beforeTop = lock.version;
const beforeRoot = lock.packages[''].version;
lock.version = expected;
lock.packages[''].version = expected;

fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

if (beforeTop === expected && beforeRoot === expected) {
  console.log(`✅ package-lock ya estaba alineado con ${expected}.`);
} else {
  console.log(`✅ package-lock alineado: top=${beforeTop}→${expected}; root=${beforeRoot}→${expected}.`);
}
