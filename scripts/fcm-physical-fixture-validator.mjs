import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REQUIRED = new Set(['foreground', 'background', 'cold_start', 'deep_link']);
const ALLOWED_EVENT_KINDS = new Set(['app_foreground', 'app_background', 'app_boot', 'push_received', 'push_action', 'route_opened', 'push_invalid_payload']);
const FORBIDDEN_KEYS = new Set(['token', 'fcm_token', 'notification_id', 'raw_notification_id', 'phone', 'idToken', 'refreshToken']);
const SAFE_CORRELATION = /^[a-z0-9_-]{6,80}$/i;
const MAX_SESSION_MS = 6 * 60 * 60_000;
const MAX_EVIDENCE_AGE_MS = 24 * 60 * 60_000;
const CLOCK_SKEW_MS = 5 * 60_000;

function scan(value, errors, pathParts = []) {
  if (Array.isArray(value)) return value.forEach((item, index) => scan(item, errors, [...pathParts, String(index)]));
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) errors.push(`campo sensible prohibido: ${[...pathParts, key].join('.')}`);
    scan(child, errors, [...pathParts, key]);
  }
}

function placeholder(value) {
  return !String(value || '').trim() || /PENDIENTE|TODO|TBD/i.test(String(value));
}

function validateWindow(fixture, now, errors) {
  const started = Date.parse(String(fixture?.evidence_started_at || ''));
  const completed = Date.parse(String(fixture?.evidence_completed_at || ''));
  if (!Number.isFinite(started)) errors.push('evidence_started_at ISO-8601 real requerido');
  if (!Number.isFinite(completed)) errors.push('evidence_completed_at ISO-8601 real requerido');
  if (!Number.isFinite(started) || !Number.isFinite(completed)) return null;
  const duration = completed - started;
  if (duration <= 0) errors.push('la sesión FCM debe terminar después de iniciar');
  if (duration > MAX_SESSION_MS) errors.push('la sesión FCM excede 6 horas');
  if (completed > now + CLOCK_SKEW_MS) errors.push('evidencia FCM completada en el futuro');
  if (now - completed > MAX_EVIDENCE_AGE_MS) errors.push('evidencia FCM supera 24 horas de antigüedad');
  return Math.max(0, duration);
}

export function validateFcmPhysicalFixture(fixture, candidate, now = Date.now()) {
  const errors = [];
  if (fixture?.schema !== 'tutop.fcm-physical-fixture.v1') errors.push('schema inválido');
  for (const field of ['artifact_id','build_run_id','build_tree_sha','apk_sha256']) {
    if (fixture?.candidate?.[field] !== candidate?.[field]) errors.push(`candidate.${field} no coincide con APK vigente`);
  }
  if (!['A','B'].includes(fixture?.device_slot)) errors.push('device_slot debe ser A o B');
  if (placeholder(fixture?.evidence_session_id)) errors.push('evidence_session_id real requerido');
  const sessionDurationMs = validateWindow(fixture, now, errors);
  scan(fixture, errors);
  const scenarios = Array.isArray(fixture?.scenarios) ? fixture.scenarios : [];
  const names = scenarios.map((scenario) => scenario?.name);
  for (const name of REQUIRED) if (!names.includes(name)) errors.push(`falta escenario ${name}`);
  if (new Set(names).size !== names.length) errors.push('escenarios duplicados');
  const correlationsAcrossScenarios = new Map();

  for (const scenario of scenarios) {
    const name = scenario?.name;
    if (!REQUIRED.has(name)) { errors.push(`escenario desconocido ${String(name)}`); continue; }
    const events = Array.isArray(scenario?.events) ? scenario.events : [];
    if (!events.length) { errors.push(`${name}: sin eventos`); continue; }
    let previous = -Infinity;
    for (const event of events) {
      if (!ALLOWED_EVENT_KINDS.has(event?.kind)) errors.push(`${name}: kind desconocido ${String(event?.kind)}`);
      if (!Number.isFinite(event?.at_ms)) errors.push(`${name}: at_ms inválido`);
      else {
        if (event.at_ms < 0) errors.push(`${name}: at_ms no puede ser negativo`);
        if (event.at_ms < previous) errors.push(`${name}: eventos fuera de orden temporal`);
        previous = event.at_ms;
        if (Number.isFinite(sessionDurationMs) && event.at_ms > sessionDurationMs) errors.push(`${name}: evento fuera de la ventana de evidencia`);
      }
      if (event?.kind === 'push_invalid_payload') errors.push(`${name}: payload inválido observado`);
    }
    const received = events.filter((event) => event.kind === 'push_received');
    const actions = events.filter((event) => event.kind === 'push_action');
    if (!received.length) errors.push(`${name}: falta push_received`);
    const receiveCorrelations = received.map((event) => String(event.correlation || ''));
    if (receiveCorrelations.some((value) => !SAFE_CORRELATION.test(value))) errors.push(`${name}: correlación de recepción inválida`);
    if (new Set(receiveCorrelations).size !== receiveCorrelations.length) errors.push(`${name}: recepción duplicada para la misma correlación`);
    for (const receive of received) {
      if (!String(receive.target || '').trim()) errors.push(`${name}: recepción sin destino lógico`);
      const correlation = String(receive.correlation || '');
      if (SAFE_CORRELATION.test(correlation)) {
        const prior = correlationsAcrossScenarios.get(correlation);
        if (prior && prior !== name) errors.push(`${name}: correlación reutilizada desde escenario ${prior}`);
        else correlationsAcrossScenarios.set(correlation, name);
      }
    }
    const actionCorrelations = actions.map((event) => String(event.correlation || ''));
    if (actionCorrelations.some((value) => !SAFE_CORRELATION.test(value))) errors.push(`${name}: correlación de acción inválida`);
    if (new Set(actionCorrelations).size !== actionCorrelations.length) errors.push(`${name}: acción duplicada para la misma correlación`);
    if (name !== 'foreground' && !actions.length) errors.push(`${name}: falta push_action`);
    for (const action of actions) {
      const correlation = String(action.correlation || '');
      const receive = received.find((event) => String(event.correlation || '') === correlation);
      if (!receive) errors.push(`${name}: acción huérfana sin recepción correlacionada`);
      else {
        if (Number.isFinite(action.at_ms) && Number.isFinite(receive.at_ms) && action.at_ms < receive.at_ms) errors.push(`${name}: push_action ocurrió antes de push_received`);
        if (String(action.target || '') !== String(receive.target || '')) errors.push(`${name}: destino de acción no coincide con recepción`);
      }
      if (!String(action.target || '').trim()) errors.push(`${name}: acción sin destino lógico`);
    }
    if (name === 'foreground' && !events.some((event) => event.kind === 'app_foreground')) errors.push('foreground: falta app_foreground');
    if (name === 'background' && !events.some((event) => event.kind === 'app_background')) errors.push('background: falta app_background');
    if (name === 'cold_start') {
      const boots = events.filter((event) => event.kind === 'app_boot');
      if (boots.length !== 1) errors.push(`cold_start: se requiere exactamente un app_boot, observados ${boots.length}`);
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
