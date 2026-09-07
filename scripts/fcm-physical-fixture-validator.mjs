import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REQUIRED = new Set(['foreground', 'background', 'cold_start', 'deep_link']);
const FORBIDDEN_KEYS = new Set(['token', 'fcm_token', 'notification_id', 'raw_notification_id', 'phone', 'idToken', 'refreshToken']);

function scan(value, errors, pathParts = []) {
  if (Array.isArray(value)) return value.forEach((item, index) => scan(item, errors, [...pathParts, String(index)]));
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) errors.push(`campo sensible prohibido: ${[...pathParts, key].join('.')}`);
    scan(child, errors, [...pathParts, key]);
  }
}

export function validateFcmPhysicalFixture(fixture, candidate) {
  const errors = [];
  if (fixture?.schema !== 'tutop.fcm-physical-fixture.v1') errors.push('schema inválido');
  for (const field of ['artifact_id','build_run_id','build_tree_sha','apk_sha256']) {
    if (fixture?.candidate?.[field] !== candidate?.[field]) errors.push(`candidate.${field} no coincide con APK vigente`);
  }
  if (!['A','B'].includes(fixture?.device_slot)) errors.push('device_slot debe ser A o B');
  scan(fixture, errors);
  const scenarios = Array.isArray(fixture?.scenarios) ? fixture.scenarios : [];
  const names = scenarios.map((scenario) => scenario?.name);
  for (const name of REQUIRED) if (!names.includes(name)) errors.push(`falta escenario ${name}`);
  if (new Set(names).size !== names.length) errors.push('escenarios duplicados');

  for (const scenario of scenarios) {
    const name = scenario?.name;
    if (!REQUIRED.has(name)) { errors.push(`escenario desconocido ${String(name)}`); continue; }
    const events = Array.isArray(scenario?.events) ? scenario.events : [];
    if (!events.length) { errors.push(`${name}: sin eventos`); continue; }
    let previous = -Infinity;
    for (const event of events) {
      if (!Number.isFinite(event?.at_ms)) errors.push(`${name}: at_ms inválido`);
      else if (event.at_ms < previous) errors.push(`${name}: eventos fuera de orden temporal`);
      else previous = event.at_ms;
      if (event?.kind === 'push_invalid_payload') errors.push(`${name}: payload inválido observado`);
    }
    const received = events.filter((event) => event.kind === 'push_received');
    const actions = events.filter((event) => event.kind === 'push_action');
    if (!received.length) errors.push(`${name}: falta push_received`);
    const receiveCorrelations = received.map((event) => String(event.correlation || ''));
    if (receiveCorrelations.some((value) => !value || value === 'none' || value === 'unavailable')) errors.push(`${name}: correlación de recepción inválida`);
    if (new Set(receiveCorrelations).size !== receiveCorrelations.length) errors.push(`${name}: recepción duplicada para la misma correlación`);
    if (name !== 'foreground' && !actions.length) errors.push(`${name}: falta push_action`);
    for (const action of actions) {
      const correlation = String(action.correlation || '');
      const receive = received.find((event) => String(event.correlation || '') === correlation);
      if (!receive) errors.push(`${name}: acción huérfana sin recepción correlacionada`);
      else if (Number.isFinite(action.at_ms) && Number.isFinite(receive.at_ms) && action.at_ms < receive.at_ms) errors.push(`${name}: push_action ocurrió antes de push_received`);
      if (!String(action.target || '').trim()) errors.push(`${name}: acción sin destino lógico`);
    }
    if (name === 'foreground' && !events.some((event) => event.kind === 'app_foreground')) errors.push('foreground: falta app_foreground');
    if (name === 'background' && !events.some((event) => event.kind === 'app_background')) errors.push('background: falta app_background');
    if (name === 'cold_start') {
      if (!events.some((event) => event.kind === 'app_boot')) errors.push('cold_start: falta app_boot');
      if (!actions.some((event) => event.launch === 'cold_start')) errors.push('cold_start: falta acción marcada launch=cold_start');
    }
    if (name === 'deep_link') {
      for (const action of actions) {
        const routed = events.some((event) => event.kind === 'route_opened' && event.correlation === action.correlation && event.target === action.target && event.at_ms >= action.at_ms);
        if (!routed) errors.push('deep_link: falta route_opened correlacionado después del tap');
      }
    }
  }
  return { pass: errors.length === 0, errors };
}

function main() {
  const file = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
  if (!file) { console.error('Uso: node scripts/fcm-physical-fixture-validator.mjs <fixture.json>'); process.exit(2); }
  const fixture = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  const candidate = JSON.parse(fs.readFileSync('docs/PHYSICAL_QA_CANDIDATE_0.9.json', 'utf8'));
  const result = validateFcmPhysicalFixture(fixture, candidate);
  console.log(JSON.stringify(result, null, 2));
  if (!result.pass) process.exitCode = 2;
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main();
