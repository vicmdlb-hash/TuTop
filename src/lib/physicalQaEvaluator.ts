export type QaSeverity = 'pass' | 'warn' | 'fail';
export type QaFinding = { severity: QaSeverity; code: string; message: string };
export type QaAssessment = {
  overall: QaSeverity;
  score: number;
  findings: QaFinding[];
  next_actions: string[];
};

type PhysicalQaReportLike = {
  native_runtime: boolean;
  viewport: { width: number; height: number; dpr: number };
  online: boolean;
  checks: Array<{ key: string; label: string; status: QaSeverity; detail: string }>;
  events: Array<{ at: string; kind: string; detail?: string }>;
};

const weight = (severity: QaSeverity) => severity === 'fail' ? 30 : severity === 'warn' ? 10 : 0;

function detailValue(detail: string | undefined, key: string) {
  const match = String(detail || '').match(new RegExp(`(?:^|\\s)${key}=([^\\s]+)`));
  return match?.[1] || '';
}

export function evaluatePhysicalQaReport(report: PhysicalQaReportLike): QaAssessment {
  const findings: QaFinding[] = [];
  for (const check of report.checks) {
    if (check.status === 'fail') findings.push({ severity: 'fail', code: `check:${check.key}`, message: `${check.label}: ${check.detail}` });
    else if (check.status === 'warn') findings.push({ severity: 'warn', code: `check:${check.key}`, message: `${check.label}: ${check.detail}` });
  }

  const globalErrors = report.events.filter((event) => event.kind === 'window_error' || event.kind === 'unhandled_rejection');
  if (globalErrors.length) findings.push({ severity: 'fail', code: 'runtime:unhandled-error', message: `Se detectaron ${globalErrors.length} errores globales/rechazos no manejados.` });

  const offlineEvents = report.events.filter((event) => event.kind === 'network_offline');
  const onlineEvents = report.events.filter((event) => event.kind === 'network_online');
  const offlineSequences = new Set(offlineEvents.map((event) => detailValue(event.detail, 'seq')).filter(Boolean));
  const reconnectedSequences = new Set(onlineEvents.map((event) => detailValue(event.detail, 'seq')).filter((value) => value && value !== '0'));
  const missingReconnect = [...offlineSequences].filter((sequence) => !reconnectedSequences.has(sequence));
  if (missingReconnect.length) findings.push({ severity: 'warn', code: 'network:no-reconnect-evidence', message: `Falta evidencia de reconexión para ${missingReconnect.length} corte(s) de red.` });
  if (offlineEvents.length > 0 && onlineEvents.length === 0 && report.online) findings.push({ severity: 'warn', code: 'network:legacy-no-reconnect-evidence', message: 'Hubo evento offline pero no quedó evidencia de reconexión.' });

  const received = report.events.filter((event) => event.kind === 'push_received');
  const actions = report.events.filter((event) => event.kind === 'push_action');
  const receivedCorrelations = new Set(received.map((event) => detailValue(event.detail, 'correlation')).filter((value) => value && value !== 'none' && value !== 'unavailable'));
  const actionCorrelations = new Set(actions.map((event) => detailValue(event.detail, 'correlation')).filter((value) => value && value !== 'none' && value !== 'unavailable'));
  const correlatedTaps = [...receivedCorrelations].filter((correlation) => actionCorrelations.has(correlation));
  const pushPermission = report.checks.find((check) => check.key === 'push-permission');
  if (pushPermission?.status === 'pass' && received.length === 0) findings.push({ severity: 'warn', code: 'push:not-exercised', message: 'Push está autorizado, pero este reporte no contiene una notificación recibida.' });
  if (received.length > 0 && actions.length === 0) findings.push({ severity: 'warn', code: 'push:no-tap-evidence', message: 'Hay recepción push, pero todavía no hay evidencia de tap/deep-link.' });
  if (receivedCorrelations.size > 0 && actions.length > 0 && correlatedTaps.length === 0) findings.push({ severity: 'fail', code: 'push:correlation-mismatch', message: 'Hay recepción y tap push, pero ninguna acción corresponde a la misma notificación correlacionada.' });

  const appCheck = report.checks.find((check) => check.key === 'app-check');
  if (report.native_runtime && appCheck?.status !== 'pass') findings.push({ severity: 'warn', code: 'app-check:no-physical-token', message: 'Runtime nativo sin evidencia de token App Check; enforcement debe permanecer bloqueado.' });

  if (!report.native_runtime) findings.push({ severity: 'warn', code: 'runtime:not-native', message: 'El reporte no proviene de runtime Android nativo.' });
  if (report.viewport.width < 300 || report.viewport.height < 480) findings.push({ severity: 'warn', code: 'viewport:compact', message: `Viewport compacto ${report.viewport.width}×${report.viewport.height}; revisar overflow y safe areas.` });

  const failureCount = findings.filter((item) => item.severity === 'fail').length;
  const warningCount = findings.filter((item) => item.severity === 'warn').length;
  const overall: QaSeverity = failureCount ? 'fail' : warningCount ? 'warn' : 'pass';
  const score = Math.max(0, Math.min(100, 100 - findings.reduce((sum, item) => sum + weight(item.severity), 0)));
  const nextActions = findings.slice(0, 6).map((item) => item.message);
  if (!nextActions.length) nextActions.push('Continuar con la matriz manual de 36 casos y conservar evidencia del dispositivo.');

  return { overall, score, findings, next_actions: nextActions };
}
