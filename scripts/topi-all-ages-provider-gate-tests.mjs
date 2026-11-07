import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { topiRemoteProviderAudienceGate } from '../src/lib/topiAllAgesProviderGate.ts';
import { redactTopiRemoteText } from '../src/lib/topiPrivacy.ts';

// Current TuTop audience explicitly includes under13, 13–17 and adults.
// A successful App Check token, staging environment flag or user-declared
// age does NOT confer consent or contractual eligibility to Gemini Developer API.
for (const claimedConfig of [
  {}, { approved: true }, { ageBand: 'adult' }, { allAges: true },
  { appCheckToken: 'synthetic-not-a-secret', firebaseEnabled: true },
]) {
  const decision = topiRemoteProviderAudienceGate(claimedConfig);
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'audience-provider-not-approved');
  assert.equal(decision.upstreamVerified, false);
  assert.equal(decision.allAgesReleaseApproved, false);
  assert(Object.isFrozen(decision), 'gate must not be mutable at runtime');
}
const assistant = fs.readFileSync('src/services/assistantProvider.ts', 'utf8');
const configured = assistant.slice(assistant.indexOf('async function askConfiguredTopi('), assistant.indexOf('export async function askTopi('));
const configuredGuard = configured.indexOf('if (!topiRemoteProviderAudienceGate().allowed) return null;');
const configuredEndpoint = configured.indexOf('const endpoint = topiEndpoint();');
const configuredFetch = configured.indexOf('await fetch(endpoint,');
assert(configuredGuard >= 0 && configuredEndpoint > configuredGuard && configuredFetch > configuredEndpoint,
  'configured HTTPS Topi must fail closed before selecting or calling an endpoint');
const source = fs.readFileSync('src/services/nativeTopiAI.ts', 'utf8');
const support = fs.readFileSync('src/services/topiConsumerSupport.ts', 'utf8');
const start = source.indexOf('export async function generateNativeTopiText(');
assert(start >= 0);
const generate = source.slice(start);
const gate = generate.indexOf('if (!topiRemoteProviderAudienceGate().allowed)');
const getPlugin = generate.indexOf('const ai = plugin();');
const getToken = generate.indexOf('getNativeAppCheckToken(false)');
const invokeRemote = generate.indexOf('ai.generate(');
assert(gate >= 0 && getPlugin > gate && getToken > gate && invokeRemote > gate,
  'native bridge must fail closed before acquiring plugin/tokens and invoking remote provider');
const nativeAvail = source.slice(source.indexOf('export function nativeTopiAIAvailable()'),
  source.indexOf('export function nativeTopiAIStatus()'));
assert.match(nativeAvail, /topiRemoteProviderAudienceGate\(\)\.allowed/);
const nativeStatus = source.slice(source.indexOf('export function nativeTopiAIStatus()'),
  source.indexOf('function timeout'));
assert.match(nativeStatus, /audience-provider-not-approved/);
assert.match(support, /reason === 'audience-provider-not-approved'/);
assert.match(support, /su proveedor aún no está aprobado para todas las edades/);
assert.match(support, /source: 'unavailable'/);
assert(!source.includes('topiRemoteProviderAudienceGate().allowed ||'),
  'a client feature flag must not bypass the compliance gate');
// Current privacy behavior: test it directly rather than running the
// historical PR84 source-shape contract, whose unrelated Nearby TS aliases
// have since been superseded. None of these strings is a real credential.
const syntheticKeys = [
  'AIza' + 'a'.repeat(35),
  'sk-' + 'b'.repeat(24),
  'sk-proj-' + 'c'.repeat(36),
];
for (const key of syntheticKeys) {
  const result = redactTopiRemoteText('Clave copiada: ' + key);
  assert.equal(result.text?.includes(key), false);
  assert(result.redactions.includes('token'));
}
const email = redactTopiRemoteText('Escribe a vendedor@example.com');
assert(!email.text?.includes('vendedor@example.com'));
assert(email.redactions.includes('email'));
const product = 'Vendo iPhone 13 128GB, batería 88%';
assert.equal(redactTopiRemoteText(product).text, product);
console.log('PASS Topi privacy redaction synthetic API keys, email, and product-fact preservation');
// Exercise the actual beta entrypoints with synthetic collaborators. A guided
// session must not even attempt native AI, endpoint, token or network access.
function loadGuidedEntrypoint(source, marker, exportName, env, mocks) {
  const index = source.indexOf(marker);
  assert(index >= 0, 'missing guided beta entrypoint: ' + exportName);
  const functionSource = source.slice(index).replace(/^export /, '').replaceAll('import.meta.env', 'ENV');
  const js = stripTypeScriptTypes(functionSource);
  return new Function('ENV', ...Object.keys(mocks), js + ';return ' + exportName + ';')(env, ...Object.values(mocks));
}
const guidedEnv = { VITE_TUTOP_ENVIRONMENT: 'staging', VITE_TUTOP_TOPI_GUIDED_BETA: 'true' };
let remoteCalls = 0;
const blockedRemote = async () => { remoteCalls++; throw new Error('REMOTE_CALL_FORBIDDEN_IN_GUIDED_BETA'); };
const askLocal = loadGuidedEntrypoint(assistant, 'export async function askTopi(', 'askTopi', guidedEnv, {
  localTopi: () => ({ source: 'local', compose: { title: 'Libro de prueba' } }),
  askNativeFirebaseTopi: blockedRemote,
  askConfiguredTopi: blockedRemote,
  physicalQaRequiresRealAI: () => true,
  nativeTopiAIStatus: () => ({ reason: 'audience-provider-not-approved' }),
});
const localResult = await askLocal('compose', { prompt: 'Libro de prueba', draft: {}, products: [] });
assert.equal(localResult.source, 'local');
assert.equal(localResult.compose.title, 'Libro de prueba');
assert.equal(remoteCalls, 0, 'guided publishing must not call any remote provider');
const supportEntry = loadGuidedEntrypoint(support, 'export async function answerConsumerSupport(', 'answerConsumerSupport', guidedEnv, {
  safeQuestion: (value) => String(value).trim(),
  resolveRoute: () => 'root',
  deterministicAnswer: (_question, route) => ({ text: 'Guía local', source: 'guided', route }),
  generateNativeTopiText: blockedRemote,
  redactTopiRemoteText: () => { throw new Error('REMOTE_REDACTION_PATH_FORBIDDEN'); },
});
const guidedAnswer = await supportEntry('¿Cómo publico mi libro?');
assert.equal(guidedAnswer.source, 'guided');
assert.equal(remoteCalls, 0, 'guided support must not attempt remote AI');
assert.match(assistant, /VITE_TUTOP_TOPI_GUIDED_BETA/);
assert.match(support, /VITE_TUTOP_TOPI_GUIDED_BETA/);
const publishUi = fs.readFileSync('src/components/NationalPublishScreen.tsx','utf8');
const supportUi = fs.readFileSync('src/components/TopiSupportAssistant.tsx','utf8');
assert.match(publishUi, /Beta guiada: Topi organiza datos mediante reglas locales/);
assert.match(supportUi, /Guía local de reglas. No es IA generativa/);
console.log('PASS approved Topi guided beta: local publishing and local support, zero remote attempts and honest UI');

console.log('PASS Topi mixed-age remote Gemini provider gate: no client feature/env/App Check bypass, honest UX; local model is NOT implemented');
