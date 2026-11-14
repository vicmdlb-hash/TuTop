// Source-only WebView 83 syntax gate, run AFTER the Vite production build.
// Build121's blank screen was caused by ||= / &&= / ??= in vendor JS.
// This does not claim that a signed APK or physical WebView smoke has passed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('dist');
if (!fs.existsSync(root) || !fs.statSync(root).isDirectory())
  throw new Error('WEBVIEW83_DIST_MISSING');

function listJavaScriptFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listJavaScriptFiles(full));
    else if (entry.isFile() && /\.(?:js|mjs)$/.test(entry.name)) files.push(full);
  }
  return files;
}

const scripts = listJavaScriptFiles(root);
assert(scripts.length > 0, 'WEBVIEW83_PRODUCTION_JS_MISSING');
const offenders = [];
for (const file of scripts) {
  const content = fs.readFileSync(file, 'utf8');
  for (const assignment of ['||=', '&&=', '??=']) {
    const matches = content.split(assignment).length - 1;
    if (matches) offenders.push({ path: path.relative(root, file), assignment, count: matches });
  }
}
if (offenders.length) {
  // Never log snippets, user data or vendor source, just deterministic counts.
  const detail = offenders.map(x => `${x.path}:${x.assignment}:${x.count}`).join(',');
  throw new Error(`WEBVIEW83_LOGICAL_ASSIGNMENT_REMAINING:${detail}`);
}
console.log(`PASS WebView83 JS syntax gate: ${scripts.length} production scripts checked, zero logical assignments; physical Android QA still required`);
