import assert from 'node:assert/strict';
import fs from 'node:fs';
import { topiDraftResultIsCurrent } from '../src/lib/topiDraftResultGate.ts';

const a = { uid: 'synthetic-A', serial: 10, draftVersion: 'title=old' };
assert.equal(topiDraftResultIsCurrent(a, { ...a }), true, 'unchanged owner+draft+request may apply');
assert.equal(topiDraftResultIsCurrent(a, { ...a, uid: 'synthetic-B' }), false, 'A must not write into B');
assert.equal(topiDraftResultIsCurrent(a, { ...a, serial: 11 }), false, 'older Topi request must not win');
assert.equal(topiDraftResultIsCurrent(a, { ...a, draftVersion: 'title=new' }), false, 'manual title edit overrides remote result');
assert.equal(topiDraftResultIsCurrent(a, { ...a, draftVersion: 'category=changed' }), false, 'manual category edit overrides remote result');
assert.equal(topiDraftResultIsCurrent({ ...a, uid: '' }, { ...a, uid: '' }), false, 'anonymous owner fails closed');
assert.equal(topiDraftResultIsCurrent({ ...a, serial: 0 }, { ...a, serial: 0 }), false, 'empty generation fails closed');
assert.equal(topiDraftResultIsCurrent({ ...a, serial: Number.NaN }, { ...a, serial: Number.NaN }), false, 'NaN generation fails closed');
assert.equal(topiDraftResultIsCurrent({ ...a, serial: 10 }, { ...a, serial: 9 }), false, 'old result not accepted after A->B->A epoch increase');

const component = fs.readFileSync('src/components/NationalPublishScreen.tsx', 'utf8');
assert.match(component, /const topiRequestSerial = useRef\(0\)/);
assert.match(component, /const topiDraftVersion = useMemo\(\(\) => JSON\.stringify\(\[/);
assert.match(component, /topiDraftVersionRef\.current = topiDraftVersion/);
assert.match(component, /const requestSerial = \+\+topiRequestSerial\.current/);
assert.match(component, /const isCurrentRequest = \(\) => topiDraftResultIsCurrent/);
assert.match(component, /const result = await askTopi\('compose'/);
assert.match(component, /if \(!isCurrentRequest\(\)\) return;\s*const suggestion = result\.compose/);
assert.match(component, /catch \(error\) \{\s*if \(!isCurrentRequest\(\)\) return/);
assert.match(component, /useEffect\(\(\) => \(\) => \{ topiRequestSerial\.current \+= 1; \}, \[user\.id\]\)/);
assert.match(component, /topiRequestSerial\.current === requestSerial &&/);
assert.match(component, /useAppStore\.getState\(\)\.user\.id === requestUid/);
console.log('PASS Topi delayed publish compose: manual edits/owner/serial fail closed and UI checks before apply');
