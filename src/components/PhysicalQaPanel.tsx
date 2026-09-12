import { useState } from 'react';
import { CheckCircle2, Clipboard, RefreshCw, Smartphone, Trash2, TriangleAlert, XCircle } from 'lucide-react';
import { evaluatePhysicalQaReport, type QaAssessment } from '../lib/physicalQaEvaluator';
import { buildPhysicalQaReport, clearQaEvents, qaEvent, type PhysicalQaReport } from '../services/physicalQaTelemetry';

function badge(status: 'pass' | 'warn' | 'fail') {
  if (status === 'pass') return <CheckCircle2 className="h-4 w-4 text-emerald-300" />;
  if (status === 'fail') return <XCircle className="h-4 w-4 text-rose-300" />;
  return <TriangleAlert className="h-4 w-4 text-amber-300" />;
}

export default function PhysicalQaPanel() {
  const [report, setReport] = useState<PhysicalQaReport | null>(null);
  const [assessment, setAssessment] = useState<QaAssessment | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true); setMessage('');
    try {
      qaEvent('qa_report_requested');
      const next = await buildPhysicalQaReport();
      const evaluated = evaluatePhysicalQaReport(next);
      setReport(next);
      setAssessment(evaluated);
      setMessage(evaluated.overall === 'fail' ? 'FAIL automático: corrige los hallazgos críticos antes de aprobar este dispositivo.' : evaluated.overall === 'warn' ? 'WARN automático: el dispositivo necesita completar evidencia física pendiente.' : 'PASS automático de diagnóstico. Aún debes completar la matriz física manual.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo generar el diagnóstico.');
    } finally { setBusy(false); }
  };

  const copy = async () => {
    if (!report || !assessment) return;
    const text = JSON.stringify({ report, assessment }, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setMessage('Reporte + evaluación QA copiados. Puedes pegarlos en este chat si aparece un bug.');
    } catch {
      setMessage('El sistema no permitió copiar automáticamente.');
    }
  };

  const clear = () => {
    clearQaEvents(); setReport(null); setAssessment(null); setMessage('Eventos QA locales limpiados.');
  };

  return (
    <section className="mx-4 mb-5 rounded-[24px] border border-cyan-300/15 bg-cyan-500/[0.04] p-4 shadow-xl shadow-black/10">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-cyan-400/10"><Smartphone className="h-5 w-5 text-cyan-200" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black tracking-wide text-white">Android Physical QA · 0.9</p>
          <p className="text-[9px] leading-4 text-slate-400">Diagnóstico local + clasificación automática, sin contraseñas, tokens ni números completos.</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button onClick={run} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-500/15 px-3 py-2.5 text-[10px] font-black text-cyan-100 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />Ejecutar diagnóstico</button>
        <button onClick={copy} disabled={!report || !assessment} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white/[0.05] px-3 py-2.5 text-[10px] font-black text-slate-200 disabled:opacity-30"><Clipboard className="h-3.5 w-3.5" />Copiar reporte</button>
      </div>

      {assessment && <div className={`mt-3 rounded-2xl border px-3 py-3 ${assessment.overall === 'fail' ? 'border-rose-400/15 bg-rose-500/[0.06]' : assessment.overall === 'warn' ? 'border-amber-400/15 bg-amber-500/[0.05]' : 'border-emerald-400/15 bg-emerald-500/[0.05]'}`}>
        <div className="flex items-center gap-2">{badge(assessment.overall)}<strong className="text-[11px] text-white">{assessment.overall.toUpperCase()} · {assessment.score}/100</strong></div>
        <div className="mt-2 space-y-1">{assessment.next_actions.slice(0, 4).map((action, index) => <p key={`${index}-${action}`} className="text-[8px] leading-4 text-slate-400">• {action}</p>)}</div>
      </div>}

      {report && <div className="mt-3 space-y-2">
        <div className="rounded-2xl border border-white/[0.06] bg-black/10 px-3 py-2 text-[9px] text-slate-400">
          <strong className="text-slate-200">{report.version}</strong> · {report.platform} · {report.viewport.width}×{report.viewport.height} · DPR {report.viewport.dpr}
        </div>
        {report.checks.map((item) => <div key={item.key} className="flex items-start gap-2 rounded-2xl border border-white/[0.05] bg-white/[0.025] px-3 py-2">
          <span className="mt-0.5">{badge(item.status)}</span>
          <div><p className="text-[10px] font-bold text-slate-100">{item.label}</p><p className="text-[9px] leading-4 text-slate-500">{item.detail}</p></div>
        </div>)}
        <p className="text-[9px] text-slate-500">Eventos locales capturados: {report.events.length}. Incluyen boot, red, visibilidad, resize, errores y evidencia push sanitizada.</p>
      </div>}

      {message && <p className="mt-3 rounded-xl bg-black/10 px-3 py-2 text-[9px] leading-4 text-slate-300">{message}</p>}
      <button onClick={clear} className="mt-3 inline-flex items-center gap-1.5 text-[9px] font-bold text-slate-500"><Trash2 className="h-3 w-3" />Limpiar eventos QA locales</button>
    </section>
  );
}