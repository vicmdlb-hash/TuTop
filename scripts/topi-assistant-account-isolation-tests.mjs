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
const submittedAiReports = [];
let currentUid = 'synthetic-user';
let reportNonceSequence = 0;
let switchUidDuringPrompt = false;
let promptReason = 'Esta respuesta es imprecisa';
let dictationStops = 0;
let unmount = () => {};
const mockSupport = {
  answerConsumerSupport: (question, route) => new Promise((resolve, reject) => pending.push({ question, route, resolve, reject })),
};
const module = { exports: {} };
vm.runInNewContext(js, {
  module, exports: module.exports,
  require(name) {
    if (name === 'react') return { useState, useRef, useMemo: (compute) => compute(), useEffect: (effect) => { unmount = effect() || (() => {}); } };
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'lucide-react') return {};
    if (name === '../lib/topiPrivacy') return {
      redactTopiRemoteText: (value) => ({ text: value, redactions: String(value).includes('@') ? ['email'] : [] }),
    };
    if (name === '../lib/topiVoice') return { startTopiDictation: (callbacks) => { dictations.push(callbacks); return () => { dictationStops += 1; }; } };
    if (name === '../lib/supportDecisionTree') return {
      supportNode: (route) => ({ title: route, prompt: 'Ayuda', choices: route === 'root'
        ? [{ id: 'security', next: 'security', label: 'Seguridad' }] : [] }),
    };
    if (name === '../services/onlineBackend') return { onlineBackend: { submitReport: async (...args) => { submittedAiReports.push(args); return 'synthetic-report'; } } };
    if (name === '../store/useAppStore') return { useAppStore: { getState: () => ({ user: { id: currentUid } }) } };
    if (name === '../services/topiConsumerSupport') return mockSupport;
    if (name === './TopiMascot') return { default: () => null };
    throw new Error('Unexpected Topi module ' + name);
  },
  console,
  crypto: { randomUUID: () => '00000000-0000-4000-8000-' + String(++reportNonceSequence).padStart(12, '0') },
  window: { prompt: () => {
    if (switchUidDuringPrompt) currentUid = 'synthetic-other';
    return promptReason;
  } },
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
// Source focus guard + rendered touch-target contract, not physical TalkBack proof.
assert.match(fs.readFileSync('src/components/TopiSupportAssistant.tsx', 'utf8'),
  /if \(open\) inputRef\.current\?\.focus\(\)/,
  'the support dialog must focus its input when opened');
for (const label of ['Cerrar', 'Dictar pregunta', 'Preguntar a Topi']) {
  assert.match(String(button(dialog, label)?.props.className), /h-12 w-12/,
    label + ' must provide a 48px touch target');
}
assert.match(String(input(dialog)?.props.className), /min-h-12/,
  'support input must provide a 48px minimum touch target');
input(dialog).props.onChange({ target: { value: 'Primera pregunta privada' } });
dialog = render();
button(dialog, 'Preguntar a Topi').props.onClick();
// Same render/same tick, before busy is committed, must not send again.
button(dialog, 'Preguntar a Topi').props.onClick();
assert.equal(pending.length, 1, 'Topi must suppress double taps before the React busy render');
assert.equal(pending[0].route, 'root');

// Navigate while first result is still pending; old result must be discarded.
dialog = render();
button(dialog, 'Seguridad').props.onClick();
dialog = render();
pending[0].resolve({ source: 'guided', route: 'security', text: 'RESULTADO_VIEJO' });
await Promise.resolve();
await Promise.resolve();
await new Promise((resolve) => setImmediate(resolve));
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
await new Promise((resolve) => setImmediate(resolve));
assert.equal(hooks[3]?.text, 'RESPUESTA_CORRECTA',
  'synthetic React answer state must accept the latest same-route response');
assert(content(render()).includes('RESPUESTA_CORRECTA'), 'latest same-route reply should appear');

// A closed support dialog must not preserve previously rendered private content.
button(render(), 'Cerrar').props.onClick();
button(render(), 'Abrir Topi').props.onClick();
assert(!content(render()).includes('RESPUESTA_CORRECTA'),
  'previous private reply must disappear after close and reopen');
assert.equal(input(render()).props.value, '',
  'previous typed private question must disappear after close and reopen');

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
await new Promise((resolve) => setImmediate(resolve));
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
await new Promise((resolve) => setImmediate(resolve));

// Failed remote support must settle without unhandled rejection or raw error leakage.
dialog = render();
input(dialog).props.onChange({ target: { value: 'Pregunta que falla por red' } });
button(render(), 'Preguntar a Topi').props.onClick();
assert.equal(pending.length, 5);
pending[4].reject(new Error('TOPI_SECRET_SUPERPRIVATE_TOKEN_DO_NOT_SHOW'));
await Promise.resolve();
await Promise.resolve();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(hooks[3]?.source, 'unavailable',
  'a rejected remote answer must be unavailable rather than pretend a successful AI response');
assert(content(render()).includes('No pudimos responder en este momento'),
  'show a generic actionable message after a rejected request');
assert(!content(render()).includes('TOPI_SECRET_SUPERPRIVATE_TOKEN_DO_NOT_SHOW'),
  'raw provider exception text must never render');

// Closing before a rejected response settles must not overwrite another answer.
dialog = render();
input(dialog).props.onChange({ target: { value: 'Pregunta obsoleta después de cerrar' } });
button(render(), 'Preguntar a Topi').props.onClick();
assert.equal(pending.length, 6);
button(render(), 'Cerrar').props.onClick();
pending[5].reject(new Error('SENSITIVE_URI_OR_TOKEN'));
await Promise.resolve();
await Promise.resolve();
await new Promise((resolve) => setImmediate(resolve));
button(render(), 'Abrir Topi').props.onClick();
assert(!content(render()).includes('SENSITIVE_URI_OR_TOKEN'),
  'late rejected answer must not leak a provider error after dialog closure');

// Reporting must be available ONLY on a true AI provider answer, and a change
// of account while prompting must prevent the old answer from being reported.
dialog = render();
input(dialog).props.onChange({ target: { value: 'Pregunta con respuesta generada' } });
button(render(), 'Preguntar a Topi').props.onClick();
assert.equal(pending.length, 7);
pending[6].resolve({ source: 'firebase-ai', route: 'root', text: 'RESPUESTA_AI_SINTETICA' });
await Promise.resolve();
await Promise.resolve();
await new Promise((resolve) => setImmediate(resolve));
assert(button(render(), 'Reportar respuesta de IA'));
switchUidDuringPrompt = true;
button(render(), 'Reportar respuesta de IA').props.onClick();
assert.equal(submittedAiReports.length, 0, 'report must fail closed if UID changes in prompt');
switchUidDuringPrompt = false;
currentUid = 'synthetic-user';
// The real privacy utility is independently tested; the component must not
// call submitReport if its sanitizer rejects personal data in the reason.
promptReason = 'Contáctame en privada@example.com para denunciar';
button(render(), 'Reportar respuesta de IA').props.onClick();
assert.equal(submittedAiReports.length, 0, 'sensitive report reason must not reach backend');
assert(content(render()).includes('El motivo incluye datos sensibles'),
  'show a useful correction without rendering the pasted private data');
promptReason = 'Esta respuesta es imprecisa';
dialog = render();
button(dialog, 'Reportar respuesta de IA').props.onClick();
button(dialog, 'Reportar respuesta de IA').props.onClick();
assert.equal(submittedAiReports.length, 1, 'same-tick duplicate AI reports must be suppressed');
assert.equal(submittedAiReports[0][0], 'ai_response');
assert.equal(submittedAiReports[0][1], 'topi-firebase-ai:root:00000000-0000-4000-8000-000000000001');
assert.equal(submittedAiReports[0][2], 'Esta respuesta es imprecisa');
assert(!submittedAiReports[0].join(' ').includes('RESPUESTA_AI_SINTETICA'),
  'the full provider answer must not be silently uploaded');
await Promise.resolve();
await Promise.resolve();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(hooks[6], 'Reporte de respuesta de IA enviado para revisión.');
assert(content(render()).includes('Reporte de respuesta de IA enviado'),
  'only an explicit submitted AI report can show success');

// A separate generated answer gets a distinct opaque ID. A pending second
// request must instantly hide the previous report button, not accept stale UX.
dialog = render();
input(dialog).props.onChange({ target: { value: 'Segunda respuesta generada' } });
button(render(), 'Preguntar a Topi').props.onClick();
assert.equal(pending.length, 8);
assert(!button(render(), 'Reportar respuesta de IA'),
  'old generated answer must not be reportable during the next request');
pending[7].resolve({ source: 'firebase-ai', route: 'root', text: 'OTRA_RESPUESTA_PRIVADA' });
await Promise.resolve();
await Promise.resolve();
await new Promise((resolve) => setImmediate(resolve));
button(render(), 'Reportar respuesta de IA').props.onClick();
assert.equal(submittedAiReports.length, 2);
assert.equal(submittedAiReports[1][1], 'topi-firebase-ai:root:00000000-0000-4000-8000-000000000002');
assert.notEqual(submittedAiReports[0][1], submittedAiReports[1][1],
  'different provider answers cannot share a moderation target');
assert(!submittedAiReports[1].join(' ').includes('OTRA_RESPUESTA_PRIVADA'));

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
