/** Owner-initiated, local-only, read-only Android package inventory.
 * No install/uninstall/clear/pull, no account access, no user data extraction.
 * Prints no serials, paths, Android ID, package dumps or private certificates.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PACKAGE = 'mx.tutop.app';
const ACK = 'READ_ONLY_PHONE_METADATA';
const SCHEMA = 'tutop.owner-device-inventory.v1';
function output(status, versionCode = null) {
  return {
    schema: SCHEMA,
    status,
    package: PACKAGE,
    installed_version_code: versionCode,
    certificate_verified: false,
    current_apk_verified: false,
    install_authorized: false,
    physical_r6_passed: false,
    phone_data_modified: false,
  };
}

// Only the "List of devices attached" header and states matter.
// Ignore device serials and any optional product/transport descriptors.
export function parseConnectedDeviceState(raw) {
  if (typeof raw !== 'string') return 'ADB_DEVICE_LIST_UNKNOWN';
  const lines = raw.replace(/\r/g, '').split('\n').map(x => x.trim()).filter(Boolean);
  if (lines.shift() !== 'List of devices attached') return 'ADB_DEVICE_LIST_UNKNOWN';
  const entries = lines.filter(x => !x.startsWith('* daemon ') && !x.startsWith('adb server '));
  if (!entries.length) return 'NO_CONNECTED_DEVICE';
  const matches = entries.map(x => x.match(/^\S+\s+(device|unauthorized|offline|recovery|sideload|bootloader)(?:\s|$)/));
  if (matches.some(x => !x)) return 'ADB_DEVICE_LIST_UNKNOWN';
  if (entries.length !== 1) return 'MULTIPLE_OR_UNREADY_DEVICES';
  return matches[0][1] === 'device' ? 'ONE_DEVICE_READY' : 'DEVICE_NOT_AUTHORIZED_OR_READY';
}

export function parsePackageListing(raw) {
  if (typeof raw !== 'string') return 'unknown';
  const lines = raw.replace(/\r/g, '').split('\n').map(x => x.trim()).filter(Boolean);
  if (!lines.length) return 'absent_claim_only';
  if (!lines.every(x => /^package:[a-zA-Z0-9_.]+$/.test(x))) return 'unknown';
  return lines.includes('package:' + PACKAGE) ? 'present' : 'unknown';
}

export function parseInstalledVersionCode(raw) {
  if (typeof raw !== 'string') return null;
  const lines = raw.replace(/\r/g, '').split('\n');
  const starts = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*Package \[mx\.tutop\.app\](?:\s|$)/.test(lines[i])) starts.push(i);
  }
  if (starts.length !== 1) return null;
  const codes = [];
  for (let i = starts[0] + 1; i < lines.length && i <= starts[0] + 100; i++) {
    if (/^\s*Package \[/.test(lines[i])) break;
    const match = lines[i].match(/^\s*versionCode=(\d{1,10})(?:\s|$)/);
    if (match) {
      const value = Number(match[1]);
      if (Number.isSafeInteger(value) && value > 0) codes.push(value);
    }
  }
  return codes.length === 1 ? codes[0] : null;
}

/** Tool execution is opt-in, exactly one authorized device and three read-only commands. */
export function collectOwnerDeviceInventory({
  argv = [],
  env = {},
  run = spawnSync,
} = {}) {
  if (argv.length !== 1 || argv[0] !== '--owner-read-only'
      || env.TUTOP_OWNER_DEVICE_INVENTORY_ACK !== ACK) {
    return output('OWNER_READ_ONLY_ACK_REQUIRED');
  }
  const safeRun = args => {
    const r = run('adb', args, {
      encoding: 'utf8', windowsHide: true, shell: false,
      timeout: 25000, maxBuffer: 2 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (r.error || r.status !== 0 || typeof r.stdout !== 'string') {
      throw Error('ADB_QUERY_NOT_CONFIRMED');
    }
    return r.stdout;
  };
  try {
    const state = parseConnectedDeviceState(safeRun(['devices']));
    if (state !== 'ONE_DEVICE_READY') return output(state);
    const installed = parsePackageListing(safeRun(['shell', 'pm', 'list', 'packages', PACKAGE]));
    if (installed === 'absent_claim_only') return output('NOT_INSTALLED_CLAIM_REQUIRES_OWNER_CONFIRMATION');
    if (installed !== 'present') return output('PACKAGE_INVENTORY_UNKNOWN');
    const version = parseInstalledVersionCode(safeRun(['shell', 'dumpsys', 'package', PACKAGE]));
    if (version === null) return output('INSTALLED_VERSION_UNKNOWN');
    return output('INSTALLED_VERSION_OBSERVED_REQUIRES_CERT_AND_OWNER_REVIEW', version);
  } catch {
    // Never print raw device output, adb serial, host paths or tool errors.
    return output('ADB_UNAVAILABLE_OR_QUERY_FAILED');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log(JSON.stringify(collectOwnerDeviceInventory({
    argv: process.argv.slice(2),
    env: process.env,
  })));
}
