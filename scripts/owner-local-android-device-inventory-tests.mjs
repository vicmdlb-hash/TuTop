import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  collectOwnerDeviceInventory as collect,
  parseConnectedDeviceState as devices,
  parsePackageListing as packages,
  parseInstalledVersionCode as version,
} from './owner-local-android-device-inventory.mjs';

const ack = {TUTOP_OWNER_DEVICE_INVENTORY_ACK:'READ_ONLY_PHONE_METADATA'};
const listed = 'List of devices attached\nSENSITIVE_TEST_SERIAL\tdevice product:fake model:private\n';
const packageOk = 'package:mx.tutop.app\n';
const dump = 'Package [other.app] (abc):\n  versionCode=999999\nPackage [mx.tutop.app] (def):\n  userId=10323\n  versionCode=90215 minSdk=24 targetSdk=36\n  versionName=0.9.2-beta.11\n';
const expectedQueries = [
  ['devices'],
  ['shell','pm','list','packages','mx.tutop.app'],
  ['shell','dumpsys','package','mx.tutop.app'],
];
function fakeRunner(outputs, calls) {
  return (binary, args, options) => {
    assert.equal(binary,'adb');
    assert.deepEqual(args,expectedQueries[calls.length]);
    assert.equal(options.shell,false);
    calls.push(args);
    return {status:0,stdout:outputs[calls.length-1]};
  };
}
assert.equal(devices(listed),'ONE_DEVICE_READY');
assert.equal(devices('List of devices attached\n'),'NO_CONNECTED_DEVICE');
assert.equal(devices('List of devices attached\nSERIAL\tunauthorized\n'),'DEVICE_NOT_AUTHORIZED_OR_READY');
assert.equal(devices('List of devices attached\nSERIAL\toffline\n'),'DEVICE_NOT_AUTHORIZED_OR_READY');
assert.equal(devices('List of devices attached\nSERIAL\tdevice\nOTHER\tdevice\n'),'MULTIPLE_OR_UNREADY_DEVICES');
assert.equal(devices('serial device\n'),'ADB_DEVICE_LIST_UNKNOWN');
assert.equal(packages(packageOk),'present');
assert.equal(packages(''),'absent_claim_only');
assert.equal(packages('package:mx.tutop.app.beta\n'),'unknown');
assert.equal(packages('error: no devices\n'),'unknown');
assert.equal(version(dump),90215);
assert.equal(version('Package [other.app] (abc):\n  versionCode=90215'),null);
assert.equal(version('Package [mx.tutop.app] (abc):\n  versionCode=0'),null);
assert.equal(version('Package [mx.tutop.app] (abc):\n  versionCode=90215\n  versionCode=90216'),null);
assert.equal(version('Package [mx.tutop.app] (abc):\n  versionCode=90215\nPackage [mx.tutop.app] (def):\n  versionCode=90216'),null);
let calls=[];
const never=()=>{throw Error('must not call adb');};
assert.equal(collect({argv:[],env:ack,run:never}).status,'OWNER_READ_ONLY_ACK_REQUIRED');
assert.equal(collect({argv:['--owner-read-only'],env:{},run:never}).status,'OWNER_READ_ONLY_ACK_REQUIRED');
const good=collect({argv:['--owner-read-only'],env:ack,run:fakeRunner([listed,packageOk,dump],calls)});
assert.equal(good.status,'INSTALLED_VERSION_OBSERVED_REQUIRES_CERT_AND_OWNER_REVIEW');
assert.equal(good.installed_version_code,90215);
assert.equal(good.certificate_verified,false);
assert.equal(good.current_apk_verified,false);
assert.equal(good.install_authorized,false);
assert.equal(good.physical_r6_passed,false);
assert.equal(good.phone_data_modified,false);
assert.deepEqual(calls,expectedQueries);
assert(!JSON.stringify(good).includes('SENSITIVE_TEST_SERIAL'));
assert(!JSON.stringify(good).includes('0.9.2-beta.11'));
calls=[];
const absent=collect({argv:['--owner-read-only'],env:ack,run:fakeRunner([listed,''],calls)});
assert.equal(absent.status,'NOT_INSTALLED_CLAIM_REQUIRES_OWNER_CONFIRMATION');
assert.equal(calls.length,2);
assert.equal(collect({argv:['--owner-read-only'],env:ack,run:()=>({status:1,stdout:'serial/password/private'})}).status,'ADB_UNAVAILABLE_OR_QUERY_FAILED');
assert(!JSON.stringify(collect({argv:['--owner-read-only'],env:ack,run:()=>({status:1,stdout:'serial/password/private'})})).includes('password'));
const code=fs.readFileSync('scripts/owner-local-android-device-inventory.mjs','utf8');
assert.doesNotMatch(code, /['"](?:install|uninstall|clear|pull|push|root|reboot|grant|delete|forward)['"]/);
assert.doesNotMatch(code, /writeFileSync|unlinkSync|rmSync|https?:\/\/|firebase:deploy/);
const cli=spawnSync(process.execPath,['scripts/owner-local-android-device-inventory.mjs'],{
  encoding:'utf8',env:{PATH:process.env.PATH||''},timeout:15000,
});
assert.equal(cli.status,0);
assert.equal(JSON.parse(cli.stdout).status,'OWNER_READ_ONLY_ACK_REQUIRED');
assert.equal(cli.stderr,'');
console.log('PASS 2-device owner-local Android read-only inventory contract: no adb without ACK, no serial disclosure, unknown/version fail closed');
