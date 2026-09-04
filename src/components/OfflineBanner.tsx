import { useEffect, useState } from 'react';
import { CloudOff, Wifi } from 'lucide-react';

export default function OfflineBanner() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [showRecovered, setShowRecovered] = useState(false);

  useEffect(() => {
    const onOffline = () => { setOnline(false); setShowRecovered(false); };
    const onOnline = () => { setOnline(true); setShowRecovered(true); window.setTimeout(() => setShowRecovered(false), 2500); };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => { window.removeEventListener('offline', onOffline); window.removeEventListener('online', onOnline); };
  }, []);

  if (online && !showRecovered) return null;
  return (
    <div className={`connection-banner ${online ? 'connection-banner-online' : ''}`} role="status">
      {online ? <Wifi className="h-3.5 w-3.5" /> : <CloudOff className="h-3.5 w-3.5" />}
      <span>{online ? 'Conexión recuperada' : 'Sin conexión · mostrando datos guardados'}</span>
    </div>
  );
}
