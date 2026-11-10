import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { compileTypescriptFixture } from './typescript-fixture-compiler.mjs';

// Run the ACTUAL Topi UI with deferred responses and a synthetic React tree.
// No account, Android hardware, remote model or Firebase is used.
const app = fs.readFileSync('src/App.tsx', 'utf8');
assert.match(app, /<TopiSupportAssistant key=\{user\.id\} \/>/,
  'floating Topi must remount on account change, dropping A private questions/answers');

const js = compileTypescriptFixture('src/components/TopiSupportAssistant.tsx')
  .replaceAll('import.meta.env', '({})');
const hooks = [];
let hookIndex = 0;
const useState = (initial) => {
  const id = hookIndex++;
  if (!(id in hooks)) hooks[id] = typeof initial === 'function' ? initial() : initial;
  return [hooks[id], (next) => {
    hooks[id] = typeof next === 'function' ? next(hooks[id]) : next;
  }];
};
const useRef = (initial) => {
  const id = hookIndex++;
  if (!(id in hooks)) hooks[id] = { current: initial };
  return hooks[id];
};
const jsx = (type, props) => ({ type, props: props || {} });
const pending = [];
const mockSupport = {
  answerConsumerSupport: (question, route) => new Promise((resolve) => pending.push({ question, route, resolve })),
};
const module = { exports: {} };
vm.runInNewContext(js, {
  module, exports: module.exports,
  require(name) {
    if (name === 'react') return { useState, useRef, useMemo: (compute) => compute() };
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'lucide-react') return {};
    if (name === '../lib/topiVoice') return { startTopiDictation: () => undefined };
    if (name === '../lib/supportDecisionTree') return {
      supportNode: (route) => ({ title: route, prompt: 'Ayuda', choices: route === 'root'
        ? [{ id: 'security', next: 'security', label: 'Seguridad' }] : [] }),
    };
    if (name === '../services/topiConsumerSupport') return mockSupport;
    if (name === './TopiMascot') return { default: () => null };
    throw new Error('Unexpected Topi module ' + name);
  },
  console,
}, { timeout: 4000 });
const Topi = module.exports.default;
const render = () => { hookIndex = 0; return Topi(); };
const collect = (tree, result = []) => {
  if (tree == null || typeof tree === 'boolean') return result;
  if (Array.isArray(tree)) {
    for (const node of tree) collect(node, result);
    return result;
  }
  if (typeof tree !== 'object') { result.push(tree); return result; }
  result.push(tree);
  collect(tree.props?.children, result);
  return result;
};
const button = (tree, name) => collect(tree).find((n) =>
  n?.type === 'button' && (n.props?.['aria-label'] === name ||
    collect(n.props?.children).some((x) => x === name)));
const input = (tree) => collect(tree).find((n) =>
  n?.type === 'input' && String(n.props?.placeholder || '').includes('Cómo publico'));
const content = (tree) => collect(tree).filter((n) => typeof n === 'string').join(' ');

button(render(), 'Abrir Topi').props.onClick();
let dialog = render();
input(dialog).props.onChange({ target: { value: 'Primera pregunta privada' } });
dialog = render();
button(dialog, 'Preguntar a Topi').props.onClick();
assert.equal(pending.length, 1);
assert.equal(pending[0].route, 'root');

// Navigate while first result is still pending; old result must be discarded.
dialog = render();
button(dialog, 'Seguridad').props.onClick();
dialog = render();
pending[0].resolve({ source: 'guided', route: 'security', text: 'RESULTADO_VIEJO' });
await Promise.resolve();
await Promise.resolve();
assert(!content(render()).includes('RESULTADO_VIEJO'), 'old route response must not appear');

// A later question on the new route must still work (busy is not wedged).
dialog = render();
input(dialog).props.onChange({ target: { value: 'Pregunta nueva y correcta' } });
dialog = render();
button(dialog, 'Preguntar a Topi').props.onClick();
assert.equal(pending.length, 2);
assert.equal(pending[1].route, 'security');
pending[1].resolve({ source: 'guided', route: 'security', text: 'RESPUESTA_CORRECTA' });
await Promise.resolve();
await Promise.resolve();
assert(content(render()).includes('RESPUESTA_CORRECTA'), 'latest same-route reply should appear');

// Closing during a pending call must not resurrect its answer on reopening.
dialog = render();
input(dialog).props.onChange({ target: { value: 'No reabrir esta respuesta' } });
dialog = render();
button(dialog, 'Preguntar a Topi').props.onClick();
assert.equal(pending.length, 3);
button(render(), 'Cerrar').props.onClick();
pending[2].resolve({ source: 'guided', route: 'security', text: 'RESPUESTA_TRAS_CIERRE' });
await Promise.resolve();
await Promise.resolve();
button(render(), 'Abrir Topi').props.onClick();
assert(!content(render()).includes('RESPUESTA_TRAS_CIERRE'), 'closing must invalidate pending response');

// Code-level contract: React remount by UID drops all state when A switches to B.
assert.match(app, /<Feed key=\{user\.id\}/);
assert.match(app, /<NationalPublishScreen key=\{user\.id\}/);
console.log('PASS Topi support privacy: UID remount + stale-route/close reply drop + new same-route reply');
