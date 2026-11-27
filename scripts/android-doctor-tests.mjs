import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const doctor = fileURLToPath(new URL('./android-doctor.mjs', import.meta.url));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tutop-doctor-fixture-'));
const android = path.join(root, 'android');
const variables = path.join(android, 'variables.gradle');
const config = path.join(root, 'capacitor.config.json');

function run() {
  const result = spawnSync(process.execPath, [doctor], {
    cwd: root, encoding: 'utf8', timeout: 15000,
    env: { PATH: process.env.PATH || '' },
  });
  assert.equal(result.error, undefined, 'doctor execution should be available');
  return result;
}
try {
  fs.mkdirSync(path.join(android, '.gradle'), { recursive: true });
  fs.mkdirSync(path.join(android, 'build'), { recursive: true });
  fs.mkdirSync(path.join(android, 'feature.gradle'), { recursive: true });
  fs.writeFileSync(path.join(android, '.gradle', 'cached.gradle'), 'targetSdkVersion = 99\n');
  fs.writeFileSync(path.join(android, 'build', 'generated.gradle'), 'compileSdkVersion = 99\n');
  fs.writeFileSync(path.join(android, 'feature.gradle', 'not-a-file.txt'), 'folder with gradle suffix');
  fs.writeFileSync(variables, 'ext { compileSdkVersion = 36; targetSdkVersion = 36 }\n');
  fs.writeFileSync(config, JSON.stringify({ appId: 'mx.tutop.app' }));

  let result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Android doctor base OK\./);
  assert.doesNotMatch(result.stderr, /EISDIR/i);

  fs.writeFileSync(variables, 'ext { compileSdkVersion = 35; targetSdkVersion = 35 }\n');
  result = run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /No se detectó targetSdk 36\./);
  assert.match(result.stderr, /No se detectó compileSdk 36\./);
  assert.doesNotMatch(result.stderr, /EISDIR/i);

  fs.writeFileSync(variables, 'ext { compileSdkVersion = 36; targetSdkVersion = 36 }\n');
  fs.writeFileSync(config, JSON.stringify({ appId: 'mx.otra.app' }));
  result = run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /applicationId debe ser mx\.tutop\.app\./);
} finally {
  // Remove only the isolated temporary fixture created by this test.
  fs.rmSync(root, { recursive: true, force: true });
}
console.log('PASS Android doctor Windows EISDIR guard: ignore Gradle directories, verify real files, preserve sdk/package fail-closed');
