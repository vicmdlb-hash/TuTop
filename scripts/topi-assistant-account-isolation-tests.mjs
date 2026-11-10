import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { compileTypescriptFixture } from './typescript-fixture-compiler.mjs';

// Run the ACTUAL Topi UI with deferred responses and a synthetic React tree.
// No account, Android hardware, remote model or Firebase is used.
const app = fs.readFileSync('src/App.tsx', 'utf8');
assert.match(app, /<div key=\{user\.id\} className="app-shell">/,
  'all child screens must remount immediately on A→B, including profile, wallet and welcome tour');
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
const dictations = [];
let dictationStops = 0;
let unmount = () => {};
const mockSupport = {
  answerConsumerSupport: (question, route) => new Promise((resolve) => pending.push({ question, route, resolve })),
};
const module = { exports: {} };
vm.runInNewContext(js, {
  module, exports: module.exports,
  require(name) {
    if (name === 'react') return { useState, useRef, useMemo: (compute) => compute(), useEffect: (effect) => { unmount = effect() || (() => {}); } };
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'lucide-react') return {};
    if (name === '../lib/topiVoice') return { startTopiDictation: (callbacks) => { dictations.push(callbacks); return () => { dictationStops += 1; }; } };
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
assert.equal(hooks[3]?.text, 'RESPUESTA_CORRECTA',
  'synthetic React answer state must accept the latest same-route response');
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

// Late speech recognition must not append to a different route after reset.
dialog = render();
button(dialog, 'Dictar pregunta').props.onClick();
assert.equal(dictations.length, 1);
button(render(), 'Inicio').props.onClick();
assert.equal(dictationStops, 1, 'route navigation must actually STOP the microphone');
dictations[0].onText('DICTADO_DE_LA_RUTA_ANTERIOR');
dictations[0].onStatus('listening');
assert(!input(render()).props.value.includes('DICTADO_DE_LA_RUTA_ANTERIOR'),
  'old route voice callback must be ignored');

// Late speech recognition must not mutate a submitted question.
dialog = render();
button(dialog, 'Dictar pregunta').props.onClick();
assert.equal(dictations.length, 2);
input(dialog).props.onChange({ target: { value: 'Consulta recién enviada' } });
button(render(), 'Preguntar a Topi').props.onClick();
assert.equal(dictationStops, 2, 'send must STOP the microphone');
assert.equal(pending.length, 4);
dictations[1].onText('TEXTO_TARDIO_DESPUES_DE_ENVIAR');
assert(!input(render()).props.value.includes('TEXTO_TARDIO_DESPUES_DE_ENVIAR'),
  'speech completion after submit must not append to the question');
pending[3].resolve({ source: 'guided', route: 'root', text: 'Respuesta final sin mezcla' });
await Promise.resolve();
await Promise.resolve();

// Logout/UID remount must also stop active native/Web Speech capture.
dialog = render();
button(dialog, 'Dictar pregunta').props.onClick();
assert.equal(dictations.length, 3);
unmount();
assert.equal(dictationStops, 3, 'unmount must STOP the microphone');
dictations[2].onText('MALICIOUS_POST_UNMOUNT');
assert(!input(render()).props.value.includes('MALICIOUS_POST_UNMOUNT'),
  'post-unmount speech callback must be ignored');

// Code-level contract: React remount by UID drops all state when A switches to B.
assert.match(app, /<Feed key=\{user\.id\}/);
assert.match(app, /<NationalPublishScreen key=\{user\.id\}/);
console.log('PASS Topi support privacy: UID remount + stale-route/close reply drop + new same-route reply');
