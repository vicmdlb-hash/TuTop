import { useState } from 'react';
import { CheckCircle2, Clipboard, RefreshCw, Smartphone, Trash2, TriangleAlert, XCircle } from 'lucide-react';
import { buildPhysicalQaReport, clearQaEvents, qaEvent, type PhysicalQaReport } from '../services/physicalQaTelemetry';

function badge(status: 'pass' | 'warn' | 'fail') {
  if (status === 'pass') return <CheckCircle2 className="h-4 w-4 text-emerald-300" />;
  if (status === 'fail') return <XCircle className="h-4 w-4 text-rose-300" />;
  return <TriangleAlert className="h-4 w-4 text-amber-300" />;
}

export default function PhysicalQaPanel() {
  const [report, setReport] = useState<PhysicalQaReport | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true); setMessage('');
    try {
      qaEvent('qa_report_requested');
      const next = await buildPhysicalQaReport();
      setReport(next);
      setMessage(next.checks.some((item) => item.status === 'fail') ? 'Hay fallas que revisar antes de considerar este dispositivo aprobado.' : 'Diagnóstico generado. Los WARN requieren prueba física o permiso explícito.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo generar el diagnóstico.');
    } finally { setBusy(false); }
  };

  const copy = async () => {
    if (!report) return;
    const text = JSON.stringify(report, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setMessage('Reporte QA copiado. Puedes pegarlo en este chat si aparece un bug.');
    } catch {
      setMessage('El sistema no permitió copiar automáticamente.');
    }
  };

  const clear = () => {
    clearQaEvents(); setReport(null); setMessage('Eventos QA locales limpiados.');
  };

  return (
    <section className="mx-4 mb-5 rounded-[24px] border border-cyan-300/15 bg-cyan-500/[0.04] p-4 shadow-xl shadow-black/10">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-cyan-400/10"><Smartphone className="h-5 w-5 text-cyan-200" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black tracking-wide text-white">Android Physical QA · 0.9</p>
          <p className="text-[9px] leading-4 text-slate-400">Diagnóstico local sin contraseñas, tokens ni números completos.</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button onClick={run} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-500/15 px-3 py-2.5 text-[10px] font-black text-cyan-100 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />Ejecutar diagnóstico</button>
        <button onClick={copy} disabled={!report} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white/[0.05] px-3 py-2.5 text-[10px] font-black text-slate-200 disabled:opacity-30"><Clipboard className="h-3.5 w-3.5" />Copiar reporte</button>
      </div>

      {report && <div className="mt-3 space-y-2">
        <div className="rounded-2xl border border-white/[0.06] bg-black/10 px-3 py-2 text-[9px] text-slate-400">
          <strong className="text-slate-200">{report.version}</strong> · {report.platform} · {report.viewport.width}×{report.viewport.height} · DPR {report.viewport.dpr}
        </div>
        {report.checks.map((item) => <div key={item.key} className="flex items-start gap-2 rounded-2xl border border-white/[0.05] bg-white/[0.025] px-3 py-2">
          <span className="mt-0.5">{badge(item.status)}</span>
          <div><p className="text-[10px] font-bold text-slate-100">{item.label}</p><p className="text-[9px] leading-4 text-slate-500">{item.detail}</p></div>
        </div>)}
        <p className="text-[9px] text-slate-500">Eventos locales capturados: {report.events.length}. Incluyen boot, online/offline, cambios de visibilidad, resize y errores globales sanitizados.</p>
      </div>}

      {message && <p className="mt-3 rounded-xl bg-black/10 px-3 py-2 text-[9px] leading-4 text-slate-300">{message}</p>}
      <button onClick={clear} className="mt-3 inline-flex items-center gap-1.5 text-[9px] font-bold text-slate-500"><Trash2 className="h-3 w-3" />Limpiar eventos QA locales</button>
    </section>
  );
}
