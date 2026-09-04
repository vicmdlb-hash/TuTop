import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = process.cwd();
const packagePath = path.join(root, 'node_modules', 'typescript', 'package.json');
let typescriptVersion = '';
try {
  typescriptVersion = JSON.parse(fs.readFileSync(packagePath, 'utf8')).version || '';
} catch {
  // If TypeScript is not installed, the dedicated typecheck step will report that clearly.
}

const major = Number.parseInt(typescriptVersion.split('.')[0] || '0', 10);
if (major >= 7) {
  console.log(`Syntax/transpile: TypeScript ${typescriptVersion} usa el compilador nativo y no expone la API JS legacy.`);
  console.log('Syntax/transpile: delegado al paso dedicado `npm run typecheck` de CI.');
  process.exit(0);
}

const require = createRequire(import.meta.url);
let ts;
try {
  ts = require('typescript');
  ts = ts?.default || ts;
} catch (error) {
  console.error(`No se pudo cargar la API JS de TypeScript: ${error.message}`);
  process.exit(1);
}

if (!ts?.transpileModule || !ts?.ScriptTarget || !ts?.ModuleKind || !ts?.DiagnosticCategory) {
  console.log('Syntax/transpile: la API JS instalada no ofrece transpileModule/enums legacy; delegado a `npm run typecheck`.');
  process.exit(0);
}

const roots = ['src', 'functions/src'];
const files = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx|mts|cts)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) files.push(full);
  }
}
roots.forEach((dir) => walk(path.join(root, dir)));

let failures = 0;
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const isTsx = file.endsWith('.tsx');
  const result = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      ...(isTsx ? { jsx: ts.JsxEmit.ReactJSX } : {}),
      isolatedModules: true,
    },
    reportDiagnostics: true,
    fileName: file,
  });
  const diagnostics = (result.diagnostics || []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  if (diagnostics.length) {
    failures += diagnostics.length;
    console.error(`\n${path.relative(root, file)}`);
    for (const diagnostic of diagnostics) console.error(`  TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`);
  }
}
console.log(`Syntax/transpile: ${files.length} archivos, ${failures} errores.`);
process.exit(failures ? 1 : 0);
