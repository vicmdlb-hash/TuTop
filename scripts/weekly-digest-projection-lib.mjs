import crypto from 'node:crypto';

const DAY=24*60*60_000;

export function previousUtcWeek(now=Date.now()) {
  const current=new Date(now);
  const day=current.getUTCDay();
  const daysSinceMonday=(day+6)%7;
  const thisMonday=Date.UTC(current.getUTCFullYear(),current.getUTCMonth(),current.getUTCDate()-daysSinceMonday);
  const start=thisMonday-7*DAY;
  const end=thisMonday;
  return {start,end,startIso:new Date(start).toISOString(),endIso:new Date(end).toISOString()};
}

function stableId(uid,startIso){
  return crypto.createHash('sha256').update(['weekly-digest',uid,startIso].join(':')).digest('hex').slice(0,40);
}

const LABELS={
  new_message:'mensajes',
  offer_received:'ofertas recibidas',
  offer_accepted:'ofertas aceptadas',
  counter_offer:'contraofertas',
  reservation_expiring:'reservas por vencer',
  meetup_reminder:'recordatorios de encuentro',
  saved_search_match:'coincidencias de búsqueda',
  favorite_price_drop:'bajadas de precio',
  saved_item_available:'favoritos disponibles',
  followed_seller_new_listing:'publicaciones de vendedores seguidos',
  listing_saved_count:'guardados de tus publicaciones',
};

export function projectWeeklyDigests({events=[],preferencesByUid=new Map(),now=Date.now()}){
  const period=previousUtcWeek(now);
  const byUser=new Map();
  for(const event of events){
    const uid=String(event.recipient_uid||'').trim();
    const kind=String(event.kind||'').trim();
    const at=Date.parse(String(event.source_event_at||event.created_at||''));
    if(!uid||!kind||kind==='weekly_digest'||!Number.isFinite(at)||at<period.start||at>=period.end)continue;
    const list=byUser.get(uid)||[];
    list.push(event);
    byUser.set(uid,list);
  }

  const projected=[];
  for(const [uid,userEvents] of byUser){
    const preferences=preferencesByUid.get(uid)||{};
    if(preferences.weekly_digest!==true)continue;
    const counts={};
    for(const event of userEvents)counts[event.kind]=(counts[event.kind]||0)+1;
    const highlights=Object.entries(counts)
      .sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0])))
      .slice(0,4)
      .map(([kind,count])=>`${count} ${LABELS[kind]||kind}`);
    projected.push({
      id:stableId(uid,period.startIso),
      recipient_uid:uid,
      kind:'weekly_digest',
      title:'Tu resumen semanal de TuTop',
      body:`TuTop registró ${userEvents.length} actividades la semana pasada${highlights.length?`: ${highlights.join(' · ')}`:''}.`,
      period_start:period.startIso,
      period_end:period.endIso,
      status:'pending',
      attempts:0,
      source_event_at:period.endIso,
    });
  }
  return projected.sort((a,b)=>a.recipient_uid.localeCompare(b.recipient_uid));
}
