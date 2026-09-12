export type SupportRouteId =
  | 'root'
  | 'account'
  | 'account-login'
  | 'account-profile'
  | 'account-recovery'
  | 'publish'
  | 'publish-ai'
  | 'publish-photos'
  | 'publish-blocked'
  | 'trade'
  | 'trade-offer'
  | 'trade-reservation'
  | 'trade-delivery'
  | 'messages'
  | 'messages-send'
  | 'messages-notifications'
  | 'ucoins'
  | 'ucoins-meaning'
  | 'ucoins-balance'
  | 'permissions'
  | 'permissions-location'
  | 'permissions-camera'
  | 'permissions-mic'
  | 'safety'
  | 'safety-scam'
  | 'safety-privacy'
  | 'safety-prohibited'
  | 'technical'
  | 'technical-offline'
  | 'technical-sync'
  | 'technical-update';

export type SupportChoice = {
  id: string;
  label: string;
  next: SupportRouteId;
};

export type SupportNode = {
  id: SupportRouteId;
  title: string;
  prompt: string;
  answer?: string;
  choices?: SupportChoice[];
  priority?: 'normal' | 'safety';
};

export const SUPPORT_TREE: Record<SupportRouteId, SupportNode> = {
  root: {
    id: 'root',
    title: '¿Con qué necesitas ayuda?',
    prompt: 'Elige el tema más parecido. Topi te llevará por una ruta corta y, si no basta, podrás escribir tu duda.',
    choices: [
      { id: 'account', label: 'Cuenta y perfil', next: 'account' },
      { id: 'publish', label: 'Publicar con Topi', next: 'publish' },
      { id: 'trade', label: 'Comprar o vender', next: 'trade' },
      { id: 'messages', label: 'Mensajes y avisos', next: 'messages' },
      { id: 'ucoins', label: 'UCoins', next: 'ucoins' },
      { id: 'permissions', label: 'Ubicación, cámara o micrófono', next: 'permissions' },
      { id: 'safety', label: 'Seguridad o posible fraude', next: 'safety' },
      { id: 'technical', label: 'La app falla o no sincroniza', next: 'technical' },
    ],
  },
  account: {
    id: 'account',
    title: 'Cuenta y perfil',
    prompt: '¿Qué parte de tu cuenta te está causando problema?',
    choices: [
      { id: 'login', label: 'No puedo entrar', next: 'account-login' },
      { id: 'profile', label: 'Datos de perfil o universidad', next: 'account-profile' },
      { id: 'recovery', label: 'Recuperar acceso', next: 'account-recovery' },
    ],
  },
  'account-login': {
    id: 'account-login',
    title: 'No puedo entrar',
    prompt: 'Prueba esta ruta en orden.',
    answer: '1) Confirma que tienes conexión. 2) Cierra y vuelve a abrir TuTop. 3) Intenta iniciar sesión nuevamente. 4) Si el error continúa, no borres datos ni compartas códigos: usa Topi Ayuda para describir el mensaje exacto que aparece.',
  },
  'account-profile': {
    id: 'account-profile',
    title: 'Perfil o universidad',
    prompt: 'Tu identidad universitaria controla campus, cercanía y alcance.',
    answer: 'En Perfil revisa institución, campus y, cuando aplique, facultad/carrera. Si cambias de campus, vuelve a revisar “Cerca de ti” y tus publicaciones antes de continuar.',
  },
  'account-recovery': {
    id: 'account-recovery',
    title: 'Recuperar acceso',
    prompt: 'La beta actual no debe prometer una recuperación que el backend todavía no haya habilitado.',
    answer: 'No compartas contraseñas, códigos ni capturas con datos sensibles. Si la opción de recuperación no aparece o está deshabilitada en tu beta, describe a Topi qué ves; la app debe indicarte el estado real en vez de inventar un canal de recuperación.',
  },
  publish: {
    id: 'publish',
    title: 'Publicar con Topi',
    prompt: '¿En qué parte se atoró tu anuncio?',
    choices: [
      { id: 'ai', label: 'Topi no entendió mi producto', next: 'publish-ai' },
      { id: 'photos', label: 'Cámara o galería', next: 'publish-photos' },
      { id: 'blocked', label: 'No me deja publicar', next: 'publish-blocked' },
    ],
  },
  'publish-ai': {
    id: 'publish-ai',
    title: 'Topi no entendió el producto',
    prompt: 'Topi funciona mejor con una frase concreta.',
    answer: 'Escribe producto + estado + precio si lo sabes + dónde prefieres entregar. Ejemplo: “Vendo calculadora Casio usada, $350, entrego en mi campus”. Topi propone; tú siempre revisas antes de publicar. Si la IA remota no está disponible, TuTop usa su asistente local.',
  },
  'publish-photos': {
    id: 'publish-photos',
    title: 'Fotos',
    prompt: 'TuTop separa Cámara y Galería.',
    answer: 'Puedes tomar una foto o elegirla de la galería. TuTop comprime las imágenes y admite hasta 4 por anuncio. Si una foto falla, prueba otra imagen y revisa el permiso mostrado por Android; no hace falta conceder almacenamiento legacy.',
  },
  'publish-blocked': {
    id: 'publish-blocked',
    title: 'No me deja publicar',
    prompt: 'La publicación se bloquea si faltan datos necesarios o el artículo no cumple las reglas.',
    answer: 'Revisa título, categoría, precio mayor a $0, universidad/campus, forma de entrega y cualquier dato obligatorio de la categoría. Los artículos prohibidos no se publican. Topi no debe inventar datos faltantes para saltarse el bloqueo.',
  },
  trade: {
    id: 'trade',
    title: 'Comprar o vender',
    prompt: '¿Qué parte del acuerdo necesitas revisar?',
    choices: [
      { id: 'offer', label: 'Oferta o contraoferta', next: 'trade-offer' },
      { id: 'reservation', label: 'Reserva o cierre', next: 'trade-reservation' },
      { id: 'delivery', label: 'Entrega o envío', next: 'trade-delivery' },
    ],
  },
  'trade-offer': {
    id: 'trade-offer',
    title: 'Oferta o contraoferta',
    prompt: 'Las ofertas deben corresponder a una publicación activa y al usuario correcto.',
    answer: 'Confirma producto, precio y contraparte antes de aceptar. Si una oferta cambió, venció o ya no está pendiente, no fuerces el flujo: vuelve al anuncio o al chat y genera una acción nueva.',
  },
  'trade-reservation': {
    id: 'trade-reservation',
    title: 'Reserva o cierre',
    prompt: 'TuTop evita que una misma publicación se cierre dos veces.',
    answer: 'Una reserva puede bloquear temporalmente el artículo mientras se completa el acuerdo. No marques una operación como terminada si todavía hay una disputa o si la otra parte no confirmó lo necesario.',
  },
  'trade-delivery': {
    id: 'trade-delivery',
    title: 'Entrega o envío',
    prompt: 'TuTop no opera una paquetería propia.',
    answer: 'Prioriza campus o lugares públicos. Si comprador y vendedor acuerdan mensajería o paquetería externa, esa coordinación es entre ambos. Nunca pagues una “tarifa TuTop de envío” porque TuTop no gestiona ese servicio.',
    priority: 'safety',
  },
  messages: {
    id: 'messages',
    title: 'Mensajes y avisos',
    prompt: '¿Qué está pasando?',
    choices: [
      { id: 'send', label: 'Un mensaje no sale o no carga', next: 'messages-send' },
      { id: 'notifications', label: 'No recibo avisos', next: 'messages-notifications' },
    ],
  },
  'messages-send': {
    id: 'messages-send',
    title: 'Mensajes que no sincronizan',
    prompt: 'La app intenta evitar mensajes duplicados durante reconexiones.',
    answer: 'Revisa conexión y vuelve a abrir la conversación. Evita tocar “Enviar” muchas veces si ves que la red está inestable. Si sigue igual, escribe a Topi el error exacto y si ocurrió conectado, sin conexión o al reconectar.',
  },
  'messages-notifications': {
    id: 'messages-notifications',
    title: 'Notificaciones',
    prompt: 'Los avisos requieren permiso del sistema y registro del dispositivo.',
    answer: 'En Perfil > Permisos revisa notificaciones. Si están denegadas, Android puede requerir habilitarlas desde ajustes del sistema. TuTop no debe volver a pedirlas silenciosamente sin tu acción.',
  },
  ucoins: {
    id: 'ucoins',
    title: 'UCoins',
    prompt: '¿Qué quieres saber?',
    choices: [
      { id: 'meaning', label: 'Qué son', next: 'ucoins-meaning' },
      { id: 'balance', label: 'Saldo o movimiento', next: 'ucoins-balance' },
    ],
  },
  'ucoins-meaning': {
    id: 'ucoins-meaning',
    title: 'Qué son los UCoins',
    prompt: 'UCoins son puntos internos de TuTop.',
    answer: 'No son dinero, criptomoneda ni saldo retirable. Sirven únicamente dentro de las funciones que TuTop habilite. Si alguien ofrece comprarlos o retirarlos como efectivo, no continúes ese acuerdo.',
    priority: 'safety',
  },
  'ucoins-balance': {
    id: 'ucoins-balance',
    title: 'Saldo o movimiento de UCoins',
    prompt: 'No adivines ni corrijas manualmente un saldo.',
    answer: 'Actualiza la vista Wallet y revisa el historial disponible. Si el saldo sigue sin coincidir, describe a Topi el movimiento y la hora aproximada, pero no compartas tokens, contraseñas ni datos de pago.',
  },
  permissions: {
    id: 'permissions',
    title: 'Ubicación, cámara o micrófono',
    prompt: 'TuTop pide permisos sólo cuando una función los necesita.',
    choices: [
      { id: 'location', label: 'Ubicación', next: 'permissions-location' },
      { id: 'camera', label: 'Cámara / galería', next: 'permissions-camera' },
      { id: 'mic', label: 'Micrófono / dictado', next: 'permissions-mic' },
    ],
  },
  'permissions-location': {
    id: 'permissions-location',
    title: 'Ubicación',
    prompt: 'TuTop usa ubicación aproximada para “Cerca de ti”.',
    answer: 'Activa ubicación cuando quieras usar cercanía. La app trabaja con precisión aproximada y guarda coordenadas reducidas para descubrimiento; no necesita ubicación en segundo plano ni tu domicilio exacto. Si la rechazas, TuTop puede seguir usando campus/ciudad.',
  },
  'permissions-camera': {
    id: 'permissions-camera',
    title: 'Cámara y galería',
    prompt: 'La cámara se abre sólo cuando tú eliges esa acción.',
    answer: 'Usa Cámara para tomar una foto o Galería para elegir una existente. La app no necesita permisos legacy de almacenamiento. Si Android cancela la actividad, vuelve a intentar desde el botón correspondiente.',
  },
  'permissions-mic': {
    id: 'permissions-mic',
    title: 'Micrófono',
    prompt: 'El micrófono sólo se usa para dictarle texto a Topi.',
    answer: 'El dictado convierte voz a texto cuando el dispositivo lo permite. TuTop no necesita conservar bytes de audio para esta función. Si niegas el permiso, puedes seguir escribiendo normalmente.',
  },
  safety: {
    id: 'safety',
    title: 'Seguridad',
    prompt: 'Si algo parece sospechoso, no continúes el intercambio hasta revisarlo.',
    choices: [
      { id: 'scam', label: 'Me piden dinero/códigos fuera de TuTop', next: 'safety-scam' },
      { id: 'privacy', label: 'Compartí o me piden datos privados', next: 'safety-privacy' },
      { id: 'prohibited', label: 'Vi un artículo sospechoso/prohibido', next: 'safety-prohibited' },
    ],
    priority: 'safety',
  },
  'safety-scam': {
    id: 'safety-scam',
    title: 'Posible fraude',
    prompt: 'Detén la operación mientras verificas.',
    answer: 'No compartas códigos de verificación, contraseñas ni hagas pagos por supuestas tarifas de TuTop. Conserva la conversación y los datos visibles del anuncio. Si existe una opción de reportar/bloquear en esa pantalla, úsala; si no, describe el caso a Topi sin incluir secretos.',
    priority: 'safety',
  },
  'safety-privacy': {
    id: 'safety-privacy',
    title: 'Privacidad',
    prompt: 'Reduce la información sensible compartida.',
    answer: 'No envíes domicilio exacto, contraseñas, códigos, tokens ni documentos completos por chat. Para encuentros usa campus o lugares públicos. Si ya compartiste un secreto de acceso, cambia o revoca ese secreto desde el servicio correspondiente.',
    priority: 'safety',
  },
  'safety-prohibited': {
    id: 'safety-prohibited',
    title: 'Artículo sospechoso o prohibido',
    prompt: 'No intentes completar la operación.',
    answer: 'Sal del acuerdo y evita mover la conversación a canales externos sólo para saltar reglas. Conserva la información necesaria para identificar el anuncio y usa las herramientas de moderación disponibles en la app.',
    priority: 'safety',
  },
  technical: {
    id: 'technical',
    title: 'Problema técnico',
    prompt: '¿Qué comportamiento ves?',
    choices: [
      { id: 'offline', label: 'Sin conexión / reconexión', next: 'technical-offline' },
      { id: 'sync', label: 'Datos que no actualizan', next: 'technical-sync' },
      { id: 'update', label: 'Después de actualizar', next: 'technical-update' },
    ],
  },
  'technical-offline': {
    id: 'technical-offline',
    title: 'Sin conexión',
    prompt: 'TuTop debe degradarse sin duplicar acciones.',
    answer: 'Comprueba tu red y vuelve a abrir la pantalla. No repitas rápidamente pagos internos, mensajes u ofertas durante una reconexión. Cuando vuelva internet, espera a que la app sincronice antes de repetir la acción.',
  },
  'technical-sync': {
    id: 'technical-sync',
    title: 'Datos que no actualizan',
    prompt: 'Primero distingue visualización de escritura.',
    answer: 'Actualiza la pantalla y revisa si otras secciones cargan. Si sólo falla una función, dile a Topi cuál, qué estabas haciendo y el texto del error. No borres almacenamiento de la app mientras haya una operación importante pendiente.',
  },
  'technical-update': {
    id: 'technical-update',
    title: 'Problema después de actualizar',
    prompt: 'Una beta nueva debe poder identificarse por versión.',
    answer: 'Reinicia TuTop y confirma la versión instalada. Si el problema empezó justo tras actualizar, indica a Topi la pantalla, el paso que falla y si el error se repite. Eso permite separar un problema de datos de una regresión de la nueva beta.',
  },
};

const ROUTE_KEYWORDS: Array<{ route: SupportRouteId; words: string[] }> = [
  { route: 'safety', words: ['fraude', 'estafa', 'codigo', 'contraseña', 'password', 'pago raro', 'sospechoso'] },
  { route: 'permissions-location', words: ['ubicacion', 'ubicación', 'gps', 'cerca de ti', 'distancia', 'kilometro', 'kilómetro'] },
  { route: 'permissions-camera', words: ['camara', 'cámara', 'foto', 'galeria', 'galería', 'imagen'] },
  { route: 'permissions-mic', words: ['microfono', 'micrófono', 'dictado', 'voz'] },
  { route: 'publish', words: ['publicar', 'anuncio', 'vender', 'topi', 'descripcion', 'descripción', 'categoria', 'categoría'] },
  { route: 'trade', words: ['oferta', 'contraoferta', 'reserva', 'comprar', 'venta', 'entrega', 'envio', 'envío'] },
  { route: 'messages', words: ['mensaje', 'chat', 'notificacion', 'notificación', 'aviso'] },
  { route: 'ucoins', words: ['ucoin', 'ucoins', 'wallet', 'saldo'] },
  { route: 'account', words: ['cuenta', 'perfil', 'entrar', 'login', 'sesion', 'sesión', 'universidad', 'campus'] },
  { route: 'technical', words: ['error', 'falla', 'bug', 'crash', 'sincroniza', 'offline', 'conexión', 'conexion', 'actualizar'] },
];

function normalize(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function classifySupportQuery(query: string): SupportRouteId {
  const text = normalize(query);
  let best: { route: SupportRouteId; score: number } = { route: 'root', score: 0 };
  for (const entry of ROUTE_KEYWORDS) {
    const score = entry.words.reduce((sum, word) => sum + (text.includes(normalize(word)) ? 1 : 0), 0);
    if (score > best.score) best = { route: entry.route, score };
  }
  return best.route;
}

export function supportNode(id: SupportRouteId) {
  return SUPPORT_TREE[id] || SUPPORT_TREE.root;
}

export function supportTreeFacts() {
  return Object.values(SUPPORT_TREE)
    .filter((node) => node.answer)
    .map((node) => `${node.title}: ${node.answer}`)
    .join('\n')
    .slice(0, 9000);
}
