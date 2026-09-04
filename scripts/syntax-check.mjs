import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let ts;
try { ts = require('typescript'); }
catch { ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js'); }

const root = process.cwd();
const roots = ['src', 'functions/src', 'scripts'];
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
