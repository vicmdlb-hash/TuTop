import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Activity, AlertTriangle, BadgeCheck, BarChart3, Bell, Boxes, CheckCircle2, ChevronRight, CircleDollarSign, Gauge, RefreshCw, Search, ShieldAlert, ShieldCheck, Store, Users, WalletCards, XCircle } from 'lucide-react';
import { onlineBackend } from '../services/onlineBackend';
import { useAppStore } from '../store/useAppStore';

type AdminSection = 'overview' | 'products' | 'users' | 'moderation' | 'system';
type AdminDoc = { id: string; data: Record<string, any> };

export default function AdminDashboard() {
  const { user, products, chats, reviews, transactions, notifications, isAdmin } = useAppStore();
  const [section, setSection] = useState<AdminSection>('overview');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<AdminDoc[]>([]);
  const [reports, setReports] = useState<AdminDoc[]>([]);
  const [verifications, setVerifications] = useState<AdminDoc[]>([]);
  const [wallets, setWallets] = useState<AdminDoc[]>([]);
  const [bids, setBids] = useState<AdminDoc[]>([]);
  const [allReviews, setAllReviews] = useState<AdminDoc[]>([]);
  const [moderationStatuses, setModerationStatuses] = useState<AdminDoc[]>([]);

  useEffect(() => {
    document.title = 'MiTuTop Admin';
    let robots = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    if (!robots) { robots = document.createElement('meta'); robots.name = 'robots'; document.head.appendChild(robots); }
    robots.content = 'noindex,nofollow,noarchive,nosnippet';
    return () => { document.title = 'TuTop'; };
  }, []);

  const refresh = async () => {
    if (!isAdmin) { setLoading(false); return; }
    try {
      setLoading(true); setError(null);
      const [userDocs, reportDocs, verificationDocs, walletDocs, bidDocs, reviewDocs, statusDocs] = await Promise.all([
        onlineBackend.listAdminCollection('users', 300),
        onlineBackend.listAdminCollection('reports', 300),
        onlineBackend.listAdminCollection('verificationRequests', 300),
        onlineBackend.listAdminCollection('wallets', 300),
        onlineBackend.listAdminCollection('bids', 500),
        onlineBackend.listAdminCollection('reviews', 500),
        onlineBackend.listAdminCollection('moderationStatus', 300),
      ]);
      setUsers(userDocs as AdminDoc[]);
      setReports(reportDocs as AdminDoc[]);
      setVerifications(verificationDocs as AdminDoc[]);
      setWallets(walletDocs as AdminDoc[]);
      setBids(bidDocs as AdminDoc[]);
      setAllReviews(reviewDocs as AdminDoc[]);
      setModerationStatuses(statusDocs as AdminDoc[]);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
    } finally { setLoading(false); }
  };

  useEffect(() => { void refresh(); }, [isAdmin]);

  if (!isAdmin) return <AdminLocked uid={user.id} />;

  const activeReports = reports.filter((doc) => doc.data.status === 'open');
  const pendingVerification = verifications.filter((doc) => doc.data.status === 'pending');
  const stats = {
    active: products.filter((item) => item.estado === 'Activo').length,
    sold: products.filter((item) => item.estado === 'Vendido').length,
    top: products.filter((item) => item.es_top).length,
    publishedValue: products.filter((item) => item.estado === 'Activo').reduce((sum, item) => sum + item.precio_mxn, 0),
    unread: chats.reduce((sum, chat) => sum + Number(chat.sin_leer || 0), 0),
    rating: reviews.length ? Math.round((reviews.filter((item) => item.calificacion === 'positive').length / reviews.length) * 100) : 100,
    walletFlow: transactions.reduce((sum, item) => sum + Math.abs(item.amount), 0),
  };
  const filteredProducts = products.filter((product) => `${product.titulo} ${product.vendedor_nombre} ${product.categoria}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px]">
        <aside className="hidden w-[250px] shrink-0 border-r border-white/[0.07] bg-[#090e18] p-5 lg:flex lg:flex-col">
          <Brand />
          <nav className="mt-8 space-y-1.5">
            <SideButton icon={<Gauge />} label="Resumen" active={section === 'overview'} onClick={() => setSection('overview')} />
            <SideButton icon={<Boxes />} label="Productos" active={section === 'products'} onClick={() => setSection('products')} count={products.length} />
            <SideButton icon={<Users />} label="Usuarios" active={section === 'users'} onClick={() => setSection('users')} count={users.length} />
            <SideButton icon={<ShieldAlert />} label="Moderación" active={section === 'moderation'} onClick={() => setSection('moderation')} count={activeReports.length + pendingVerification.length} />
            <SideButton icon={<Activity />} label="Sistema" active={section === 'system'} onClick={() => setSection('system')} />
          </nav>
          <div className="mt-auto rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.05] p-4"><div className="flex items-center gap-2 text-sm font-semibold text-emerald-200"><ShieldCheck className="h-4 w-4" /> Admin Firestore</div><p className="mt-2 text-xs leading-5 text-slate-500">El acceso depende de <code className="text-slate-400">admins/{user.id}</code>. No hay datos demo.</p></div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#070b12]/90 px-4 py-4 backdrop-blur-xl sm:px-7"><div className="flex items-center gap-3"><div className="lg:hidden"><Brand compact /></div><div className="ml-auto flex items-center gap-2"><span className="hidden rounded-full border border-emerald-400/15 bg-emerald-400/[0.07] px-3 py-1.5 text-xs font-semibold text-emerald-300 sm:inline-flex">● Firebase online</span><button onClick={() => void refresh()} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.035] text-slate-400" aria-label="Actualizar"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button><button onClick={() => setSection('moderation')} className="relative grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.035] text-slate-400" aria-label="Abrir moderación"><Bell className="h-4 w-4" />{activeReports.length + pendingVerification.length > 0 && <span className="absolute -right-1 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[8px] font-black text-white">{Math.min(99, activeReports.length + pendingVerification.length)}</span>}</button><div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-sm font-black text-white">{user.nombre.slice(0,2).toUpperCase()}</div></div></div><div className="mt-3 flex gap-2 overflow-x-auto lg:hidden">{([['overview','Resumen'],['products','Productos'],['users','Usuarios'],['moderation','Moderación'],['system','Sistema']] as const).map(([key,label]) => <button key={key} onClick={() => setSection(key)} className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-bold ${section === key ? 'bg-violet-500 text-white' : 'bg-white/[0.04] text-slate-400'}`}>{label}</button>)}</div></header>

          {error && <div className="mx-4 mt-4 rounded-2xl border border-rose-400/15 bg-rose-400/[0.05] p-4 text-sm text-rose-200 sm:mx-7"><strong>Error al consultar Firestore:</strong> {error}</div>}
          <div className="p-4 sm:p-7">
            {section === 'overview' && <Overview stats={stats} products={products} chats={chats} user={user} notificationsCount={notifications.length} usersCount={users.length} reportsCount={activeReports.length} />}
            {section === 'products' && <ProductsSection products={filteredProducts} query={query} setQuery={setQuery} />}
            {section === 'users' && <UsersSection users={users} wallets={wallets} reviews={allReviews} statuses={moderationStatuses} onRefresh={refresh} />}
            {section === 'moderation' && <ModerationSection reports={reports} verifications={verifications} onRefresh={refresh} />}
            {section === 'system' && <SystemSection userId={user.id} bids={bids.length} loading={loading} />}
          </div>
        </main>
      </div>
    </div>
  );
}

function AdminLocked({ uid }: { uid: string }) {
  return <div className="grid min-h-screen place-items-center bg-[#060a13] px-6 text-white"><div className="w-full max-w-xl rounded-[28px] border border-white/10 bg-[#0c1320] p-7 shadow-2xl"><div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-300"><ShieldCheck className="h-6 w-6" /></div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">MiTuTop Admin</p><h1 className="mt-2 text-2xl font-black">Panel privado bloqueado</h1><p className="mt-3 text-sm leading-6 text-slate-400">La sesión ya está conectada a Firebase, pero este usuario no está marcado como administrador. Para darte acceso sin pagar Functions, crea manualmente este documento una sola vez en Firestore:</p><div className="mt-5 rounded-2xl bg-[#070b12] p-4 font-mono text-xs leading-6 text-slate-300">Colección: <b>admins</b><br/>Documento: <b>{uid || 'TU_UID'}</b><br/>Campo: <b>active = true</b></div><p className="mt-4 text-xs text-slate-500">Después recarga <code>/admin</code>. Las reglas sólo permitirán leer datos administrativos si ese documento existe.</p><a href="/" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-black">Volver a TuTop <ChevronRight className="h-4 w-4" /></a></div></div>;
}

function Brand({ compact = false }: { compact?: boolean }) { return <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-[14px] bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 font-black text-white shadow-lg shadow-violet-950/30">T</div>{!compact && <div><div className="text-xl font-black tracking-[-0.04em]">Mi<span className="text-violet-400">TuTop</span></div><div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">Admin Firebase</div></div>}</div>; }

function SideButton({ icon, label, active, onClick, count }: { icon: ReactNode; label: string; active: boolean; onClick: () => void; count?: number }) { return <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${active ? 'bg-violet-500 text-white' : 'text-slate-500 hover:bg-white/[0.04] hover:text-slate-200'}`}><span className="[&>svg]:h-[18px] [&>svg]:w-[18px]">{icon}</span>{label}{typeof count === 'number' && <span className="ml-auto text-xs opacity-70">{count}</span>}</button>; }

function Overview({ stats, products, chats, user, notificationsCount, usersCount, reportsCount }: { stats: Record<string, number>; products: ReturnType<typeof useAppStore.getState>['products']; chats: ReturnType<typeof useAppStore.getState>['chats']; user: ReturnType<typeof useAppStore.getState>['user']; notificationsCount: number; usersCount: number; reportsCount: number }) {
  const topProducts = [...products].filter((item) => item.es_top).sort((a,b) => a.jerarquia_top-b.jerarquia_top);
  return <><PageTitle eyebrow="Centro de control" title={`Hola, ${user.nombre}`} subtitle="Datos reales del proyecto Firebase conectado a TuTop."/><div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={<Users/>} label="Usuarios" value={String(usersCount)} note="Documentos reales" accent="blue"/><Metric icon={<Store/>} label="Productos activos" value={String(stats.active)} note={`${stats.top} en Top semanal`} accent="violet"/><Metric icon={<CircleDollarSign/>} label="Valor publicado" value={money(stats.publishedValue)} note="Inventario · no ventas" accent="emerald"/><Metric icon={<ShieldAlert/>} label="Reportes abiertos" value={String(reportsCount)} note={`${notificationsCount} señales en tu sesión`} accent="amber"/></div><div className="mt-5 grid gap-5 xl:grid-cols-[1.15fr_.85fr]"><Panel title="Top semanal" subtitle="Calculado con las pujas guardadas en Firestore">{topProducts.length ? <div className="space-y-3">{topProducts.slice(0,3).map((product) => <div key={product.id} className="flex items-center gap-3"><img src={product.imagen_url} className="h-12 w-12 rounded-xl object-cover"/><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">#{product.jerarquia_top} {product.titulo}</p><p className="text-xs text-slate-600">{product.vendedor_nombre}</p></div><strong className="text-xs text-amber-300">{product.puja_ucoins} UC</strong></div>)}</div> : <EmptyText text="Aún no hay pujas esta semana."/>}</Panel><Panel title="Actividad de tu sesión" subtitle="Datos disponibles para el administrador"><Health label="Conversaciones" value={String(chats.length)} ok/><Health label="Mensajes pendientes" value={String(stats.unread)} ok={stats.unread===0}/><Health label="Confiabilidad" value={`${stats.rating}%`} ok={stats.rating>=80}/><Health label="Flujo Wallet observado" value={`${stats.walletFlow} UC`} ok/></Panel></div></>;
}

function ProductsSection({ products, query, setQuery }: { products: ReturnType<typeof useAppStore.getState>['products']; query: string; setQuery: (value:string)=>void }) { return <><PageTitle eyebrow="Marketplace" title="Productos" subtitle="Publicaciones sincronizadas desde Cloud Firestore."/><div className="mt-5 flex items-center gap-2 rounded-2xl border border-white/[0.07] bg-[#0b111c] px-3"><Search className="h-4 w-4 text-slate-600"/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Buscar título, vendedor o categoría" className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-700"/></div><div className="mt-4 overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0b111c]"><div className="divide-y divide-white/[0.05]">{products.length ? products.map((product)=><div key={product.id} className="grid grid-cols-[54px_1fr_auto] gap-3 p-3.5 sm:grid-cols-[54px_1fr_130px_110px] sm:items-center"><img src={product.imagen_url} alt="" className="h-[54px] w-[54px] rounded-xl object-cover"/><div className="min-w-0"><p className="truncate text-sm font-bold">{product.titulo}</p><p className="mt-1 truncate text-xs text-slate-600">{product.vendedor_nombre} · {product.categoria}</p></div><div className="hidden text-sm font-black text-emerald-300 sm:block">{money(product.precio_mxn)}</div><StatusPill value={product.estado}/></div>) : <EmptyText text="Firestore aún no tiene productos."/>}</div></div></>; }

function UsersSection({ users, wallets, reviews, statuses, onRefresh }: { users: AdminDoc[]; wallets: AdminDoc[]; reviews: AdminDoc[]; statuses: AdminDoc[]; onRefresh: ()=>Promise<void> }) {
  const walletMap = new Map(wallets.map((wallet)=>[wallet.id,wallet.data]));
  const statusMap = new Map(statuses.map((status)=>[status.id,status.data]));
  const cutoff = Date.now() - 30 * 86400000;
  const strikesFor = (uid:string) => reviews.filter((review)=>review.data.evaluado_id===uid && review.data.calificacion==='negative' && Date.parse(String(review.data.fecha||0))>=cutoff).length;
  const [busy,setBusy]=useState<string|null>(null);
  const toggle = async(uid:string,suspend:boolean,strikes:number)=>{try{setBusy(uid); const reason=suspend?`Revisión administrativa: ${strikes} reporte(s) negativo(s) en 30 días.`:''; await onlineBackend.adminSetSuspension(uid,suspend,reason); await onRefresh();}finally{setBusy(null)}};
  return <><PageTitle eyebrow="Comunidad" title="Usuarios" subtitle="Perfiles reales. 3 negativos en 30 días se marcan para revisión; el administrador puede suspender sin Cloud Functions."/><div className="mt-5 overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0b111c]"><div className="divide-y divide-white/[0.05]">{users.length ? users.map((doc)=>{const wallet=walletMap.get(doc.id)||{}; const strikes=strikesFor(doc.id); const suspended=statusMap.get(doc.id)?.suspended===true; return <div key={doc.id} className="flex flex-wrap items-center gap-3 p-4"><div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-500/10 text-sm font-black text-violet-300">{String(doc.data.nombre||'E').slice(0,2).toUpperCase()}</div><div className="min-w-[180px] flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-bold">{doc.data.nombre||'Estudiante'}</p>{suspended&&<span className="rounded-full bg-rose-500/10 px-2 py-1 text-[9px] font-black text-rose-300">SUSPENDIDO</span>}{strikes>=3&&!suspended&&<span className="rounded-full bg-amber-500/10 px-2 py-1 text-[9px] font-black text-amber-300">REVISAR</span>}</div><p className="text-xs text-slate-600">{doc.data.facultad||'Sin facultad'} · UID {doc.id.slice(0,8)}…</p><p className={`mt-1 text-[10px] font-bold ${strikes>=3?'text-amber-300':'text-slate-600'}`}>{strikes} negativos · últimos 30 días</p></div><div className="text-right"><p className="text-xs font-black text-amber-300">{wallet.balance??0} UC</p><p className="text-[10px] text-slate-600">{wallet.prestige??0} PP</p></div><button disabled={busy===doc.id} onClick={()=>void toggle(doc.id,!suspended,strikes)} className={`rounded-xl px-3 py-2 text-[10px] font-black ${suspended?'bg-emerald-500/10 text-emerald-300':'bg-rose-500/10 text-rose-300'}`}>{busy===doc.id?'…':suspended?'Reactivar':'Suspender'}</button></div>}) : <EmptyText text="Aún no hay usuarios registrados."/>}</div></div></>;
}

function ModerationSection({ reports, verifications, onRefresh }: { reports: AdminDoc[]; verifications: AdminDoc[]; onRefresh: ()=>Promise<void> }) {
  const [busy, setBusy] = useState<string|null>(null);
  const act = async (key:string, fn:()=>Promise<void>) => { try { setBusy(key); await fn(); await onRefresh(); } finally { setBusy(null); } };
  const pending=verifications.filter((doc)=>doc.data.status==='pending'); const open=reports.filter((doc)=>doc.data.status==='open');
  return <><PageTitle eyebrow="Confianza y seguridad" title="Moderación" subtitle="Colas reales de Firestore para reportes y verificación estudiantil."/><div className="mt-6 grid gap-5 xl:grid-cols-2"><Panel title={`Verificaciones pendientes (${pending.length})`} subtitle="La evidencia está guardada como imagen comprimida dentro del documento privado">{pending.length ? <div className="space-y-3">{pending.map((doc)=><div key={doc.id} className="rounded-2xl border border-white/[0.06] bg-[#080d16] p-3">{doc.data.image_data && <img src={doc.data.image_data} alt="Credencial" className="mb-3 max-h-48 w-full rounded-xl object-contain bg-black/20"/>}<p className="text-xs text-slate-500">UID {doc.id}</p><div className="mt-3 grid grid-cols-2 gap-2"><button disabled={busy===doc.id} onClick={()=>void act(doc.id,()=>onlineBackend.adminApproveVerification(doc.id,true))} className="rounded-xl bg-emerald-500/10 py-2 text-xs font-bold text-emerald-300"><CheckCircle2 className="mr-1 inline h-4 w-4"/>Aprobar</button><button disabled={busy===doc.id} onClick={()=>void act(doc.id,()=>onlineBackend.adminApproveVerification(doc.id,false))} className="rounded-xl bg-rose-500/10 py-2 text-xs font-bold text-rose-300"><XCircle className="mr-1 inline h-4 w-4"/>Rechazar</button></div></div>)}</div> : <EmptyText text="No hay verificaciones pendientes."/>}</Panel><Panel title={`Reportes abiertos (${open.length})`} subtitle="Reportes enviados por estudiantes">{open.length ? <div className="space-y-3">{open.map((doc)=><div key={doc.id} className="rounded-2xl border border-white/[0.06] bg-[#080d16] p-3"><div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-300"/><p className="text-xs font-bold">{doc.data.target_type} · {doc.data.target_id}</p></div><p className="mt-2 text-xs leading-5 text-slate-500">{doc.data.reason}</p><div className="mt-3 grid grid-cols-2 gap-2"><button onClick={()=>void act(doc.id,()=>onlineBackend.adminResolveReport(doc.id,'resolved'))} className="rounded-xl bg-violet-500/10 py-2 text-xs font-bold text-violet-300">Resolver</button><button onClick={()=>void act(doc.id,()=>onlineBackend.adminResolveReport(doc.id,'dismissed'))} className="rounded-xl bg-white/[0.04] py-2 text-xs font-bold text-slate-400">Descartar</button></div></div>)}</div> : <EmptyText text="No hay reportes abiertos."/>}</Panel></div><div className="mt-5 rounded-2xl border border-sky-400/15 bg-sky-400/[0.04] p-4 text-xs leading-5 text-sky-100/60"><ShieldAlert className="mr-2 inline h-4 w-4 text-sky-300"/>La beta Spark evita Cloud Functions de pago. Las acciones de admin están protegidas por reglas que consultan <code>admins/&lt;uid&gt;</code>.</div></>;
}

function SystemSection({ userId, bids, loading }: { userId:string; bids:number; loading:boolean }) {
  const checks = [['Firestore REST','Conectado',true],['Auth número + clave beta','Conectado',true],['Panel admin','Protegido por rules',true],['Fotos','Firestore comprimido',true],['Pujas y Wallet','Transacción + rules',true],['SMS real','Requiere facturación',false],['Cloud Storage','Requiere Blaze',false],['Cloud Functions','Requiere Blaze',false],['APK debug','Workflow GitHub listo',true],['Google Play','No requerido en beta',true]] as const;
  return <><PageTitle eyebrow="Infraestructura" title="Estado del sistema" subtitle="Qué funciona hoy sin inversión y qué queda deliberadamente aplazado."/><div className="mt-6 grid gap-5 xl:grid-cols-[1fr_.8fr]"><Panel title="Checklist técnico" subtitle={loading?'Actualizando…':'Proyecto Firebase conectado'}><div className="divide-y divide-white/[0.05]">{checks.map(([label,value,ok])=><div key={label} className="flex items-center gap-3 py-3"><div className={`grid h-8 w-8 place-items-center rounded-lg ${ok?'bg-emerald-400/10 text-emerald-300':'bg-amber-400/10 text-amber-300'}`}>{ok?<CheckCircle2 className="h-4 w-4"/>:<AlertTriangle className="h-4 w-4"/>}</div><span className="flex-1 text-sm font-semibold">{label}</span><span className={`text-xs font-semibold ${ok?'text-emerald-300':'text-amber-300'}`}>{value}</span></div>)}</div></Panel><div className="space-y-5"><Panel title="Administrador" subtitle="UID actual"><div className="rounded-xl bg-[#070b12] p-3 font-mono text-xs text-slate-400 break-all">{userId}</div></Panel><Panel title="Subasta" subtitle="Bids visibles por admin"><div className="flex items-center gap-3"><WalletCards className="h-8 w-8 text-amber-300"/><div><strong className="text-2xl">{bids}</strong><p className="text-xs text-slate-600">documentos de puja</p></div></div></Panel></div></div></>;
}

function PageTitle({eyebrow,title,subtitle}:{eyebrow:string;title:string;subtitle:string}){return <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-400">{eyebrow}</p><h1 className="mt-2 text-2xl font-black tracking-[-0.035em] sm:text-3xl">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{subtitle}</p></div>}
function Metric({icon,label,value,note,accent}:{icon:ReactNode;label:string;value:string;note:string;accent:'violet'|'emerald'|'blue'|'amber'}){const a={violet:'bg-violet-500/10 text-violet-300',emerald:'bg-emerald-400/10 text-emerald-300',blue:'bg-sky-400/10 text-sky-300',amber:'bg-amber-400/10 text-amber-300'};return <div className="rounded-2xl border border-white/[0.07] bg-[#0b111c] p-4"><div className="flex items-center justify-between"><div className={`grid h-10 w-10 place-items-center rounded-xl ${a[accent]} [&>svg]:h-5 [&>svg]:w-5`}>{icon}</div><BarChart3 className="h-4 w-4 text-slate-800"/></div><p className="mt-5 text-xs font-semibold text-slate-600">{label}</p><p className="mt-1 text-2xl font-black">{value}</p><p className="mt-1 text-xs text-slate-600">{note}</p></div>}
function Panel({title,subtitle,children}:{title:string;subtitle?:string;children:ReactNode}){return <section className="rounded-2xl border border-white/[0.07] bg-[#0b111c] p-4 sm:p-5"><div className="mb-4"><h2 className="text-sm font-black">{title}</h2>{subtitle&&<p className="mt-1 text-xs text-slate-600">{subtitle}</p>}</div>{children}</section>}
function Health({label,value,ok}:{label:string;value:string;ok:boolean}){return <div className="flex items-center gap-3 py-1.5"><span className={`h-2 w-2 rounded-full ${ok?'bg-emerald-400':'bg-amber-400'}`}/><span className="flex-1 text-sm text-slate-400">{label}</span><span className={`text-xs font-bold ${ok?'text-slate-200':'text-amber-300'}`}>{value}</span></div>}
function StatusPill({value}:{value:string}){const active=value==='Activo';const sold=value==='Vendido';return <span className={`self-start rounded-full px-2.5 py-1 text-[11px] font-bold sm:self-auto ${active?'bg-emerald-400/10 text-emerald-300':sold?'bg-sky-400/10 text-sky-300':'bg-amber-400/10 text-amber-300'}`}>{value}</span>}
function EmptyText({text}:{text:string}){return <div className="rounded-xl border border-dashed border-white/[0.08] p-5 text-center text-xs text-slate-600">{text}</div>}
function money(value:number){return new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(value)}
