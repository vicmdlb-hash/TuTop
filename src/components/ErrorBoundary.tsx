import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props { children: ReactNode }
interface State { hasError: boolean; message?: string }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('TuTop UI error', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <main className="grid min-h-screen place-items-center bg-[#050a13] px-6 text-white">
        <section className="w-full max-w-sm rounded-3xl border border-red-400/20 bg-[#0d1624] p-6 text-center shadow-2xl">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-red-500/10 text-red-300"><AlertTriangle /></div>
          <h1 className="mt-4 text-xl font-black">TuTop tuvo un problema</h1>
          <p className="mt-2 text-sm text-slate-400">La aplicación no pudo completar esta vista. Tus datos permanecen en Firebase; recarga y, si se repite, conserva este error para QA.</p>
          {this.state.message && <code className="mt-4 block max-h-24 overflow-auto rounded-xl bg-black/25 p-3 text-left text-[10px] text-slate-400">{this.state.message}</code>}
          <button onClick={() => window.location.reload()} className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-bold"><RotateCcw className="h-4 w-4" />Recargar</button>
        </section>
      </main>
    );
  }
}
