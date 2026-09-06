import type { PhysicalQaReport } from '../services/physicalQaTelemetry';

export type QaSeverity = 'pass' | 'warn' | 'fail';
export type QaFinding = { severity: QaSeverity; code: string; message: string };
export type QaAssessment = {
  overall: QaSeverity;
  score: number;
  findings: QaFinding[];
  next_actions: string[];
};

const weight = (severity: QaSeverity) => severity === 'fail' ? 30 : severity === 'warn' ? 10 : 0;

export function evaluatePhysicalQaReport(report: PhysicalQaReport): QaAssessment {
  const findings: QaFinding[] = [];
  for (const check of report.checks) {
    if (check.status === 'fail') findings.push({ severity: 'fail', code: `check:${check.key}`, message: `${check.label}: ${check.detail}` });
    else if (check.status === 'warn') findings.push({ severity: 'warn', code: `check:${check.key}`, message: `${check.label}: ${check.detail}` });
  }

  const globalErrors = report.events.filter((event) => event.kind === 'window_error' || event.kind === 'unhandled_rejection');
  if (globalErrors.length) findings.push({ severity: 'fail', code: 'runtime:unhandled-error', message: `Se detectaron ${globalErrors.length} errores globales/rechazos no manejados.` });

  const offline = report.events.filter((event) => event.kind === 'network_offline').length;
  const online = report.events.filter((event) => event.kind === 'network_online').length;
  if (offline > 0 && online === 0 && report.online) findings.push({ severity: 'warn', code: 'network:no-reconnect-evidence', message: 'Hubo evento offline pero no quedó evidencia de reconexión.' });

  const pushesReceived = report.events.filter((event) => event.kind === 'push_received').length;
  const pushActions = report.events.filter((event) => event.kind === 'push_action').length;
  const pushPermission = report.checks.find((check) => check.key === 'push-permission');
  if (pushPermission?.status === 'pass' && pushesReceived === 0) findings.push({ severity: 'warn', code: 'push:not-exercised', message: 'Push está autorizado, pero este reporte no contiene una notificación recibida.' });
  if (pushesReceived > 0 && pushActions === 0) findings.push({ severity: 'warn', code: 'push:no-tap-evidence', message: 'Hay recepción push, pero todavía no hay evidencia de tap/deep-link.' });

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
