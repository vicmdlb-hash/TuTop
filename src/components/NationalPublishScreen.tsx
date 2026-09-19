import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Camera, CheckCircle2, ChevronDown, Images, Loader2, MapPin, Mic, Plus, ShieldCheck, Sparkles, Video, X } from 'lucide-react';
import { compressImageForFirestore } from '../lib/imageCompression';
import { categorySafetyRequirements } from '../lib/marketplaceGovernance';
import { getCachedApproxLocation, locationAttributes, nearbyLocationPermission, requestApproxLocation, type ApproxLocation } from '../lib/nearbyMarketplace';
import { nationalFieldsFor, normalizeNationalAttributes } from '../lib/nationalListingFields';
import type { CanonicalListingV2, ListingDeliveryMethod } from '../lib/listingSchemaV2';
import { smartPriceFromTuTop } from '../lib/smartPricing';
import { startTopiDictation } from '../lib/topiVoice';
import { isForbiddenProductText, MARKETPLACE_CATEGORIES } from '../lib/productAssistant';
import { defaultScopeForCategory, safeMeetingPointsFor, VISIBILITY_SCOPES } from '../lib/universityNetwork';
import { canonicalListingsBackend } from '../services/canonicalListingsBackend';
import { askTopi } from '../services/assistantProvider';
import { firebaseMediaStorage, mediaStorageEnabled, userFacingMediaError, validateListingVideo } from '../services/firebaseMediaStorage';
import { recordDiagnostic } from '../services/localDiagnostics';
import { isNativeDeviceRuntime, nativePhotoToImageFile, pickNativePhoto, takeNativePhoto } from '../services/nativeDeviceCapabilities';
import { nativeTopiAIStatus } from '../services/nativeTopiAI';
import { verifiedEmailBetaAuth } from '../services/verifiedEmailBetaAuth';
import { useAppStore } from '../store/useAppStore';
import type { ListingVisibilityScope, Product, ProductCategory } from '../types';
import TopiMascot from './TopiMascot';

const FALLBACK_IMAGE = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#111827"/><text x="450" y="310" text-anchor="middle" fill="#c4b5fd" font-size="42" font-family="Arial">TuTop</text></svg>')}`;
const PUBLISH_DRAFT_PREFIX = 'tutop.publish.draft.v1.';

type PublishDraft = {
  assistantText?: string;
  title?: string;
  description?: string;
  price?: string;
  quantity?: string;
  category?: ProductCategory | '';
  condition?: string;
  negotiable?: boolean;
  scope?: ListingVisibilityScope;
  deliveryMethods?: ListingDeliveryMethod[];
  meetingPointId?: string;
  attributes?: Record<string, string | number | boolean>;
  images?: string[];
};

function readPublishDraft(uid: string): PublishDraft | null {
  if (!uid || typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(`${PUBLISH_DRAFT_PREFIX}${uid}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as PublishDraft : null;
  } catch { return null; }
}

function writePublishDraft(uid: string, draft: PublishDraft) {
  if (!uid || typeof sessionStorage === 'undefined') return;
  try { sessionStorage.setItem(`${PUBLISH_DRAFT_PREFIX}${uid}`, JSON.stringify(draft)); } catch { /* best effort local draft */ }
}

function clearPublishDraft(uid: string) {
  if (!uid || typeof sessionStorage === 'undefined') return;
  try { sessionStorage.removeItem(`${PUBLISH_DRAFT_PREFIX}${uid}`); } catch { /* best effort */ }
}
const DELIVERY: Array<{ id: ListingDeliveryMethod; label: string }> = [
  { id: 'campus_meetup', label: 'Encuentro en campus' },
  { id: 'pickup', label: 'Recoger con vendedor' },
  { id: 'local_delivery', label: 'Entrega local acordada' },
  { id: 'shipping', label: 'Envío externo acordado' },
];

function slug(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function aiFailureLabel(reason: ReturnType<typeof nativeTopiAIStatus>['reason']) {
  if (reason === 'app-check-unavailable') return 'no pudimos verificar esta sesión';
  if (reason === 'plugin-missing') return 'la función de IA no está disponible en este dispositivo';
  if (reason === 'request-failed') return 'el servicio de IA no respondió';
  if (reason === 'empty-response') return 'el servicio de IA respondió sin contenido utilizable';
  if (reason === 'disabled') return 'la función de IA no está disponible en esta versión';
  if (reason === 'not-native') return 'esta función sólo está disponible en la app móvil';
  return 'no pudimos confirmar una respuesta del servicio de IA';
}

function videoErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || '');
  if (raw === 'El video debe ser MP4, WebM o MOV.' || raw === 'El archivo de video está vacío.' || raw === 'El video debe pesar menos de 50 MB.') return raw;
  return userFacingMediaError(error);
}

function publicationFailureCode(raw: string) {
  if (/Missing or insufficient permissions|PERMISSION_DENIED/i.test(raw)) return 'publish_permission_denied';
  if (/RESOURCE_EXHAUSTED|rate.?limit|too many/i.test(raw)) return 'publish_rate_limited';
  if (/MEDIA_STORAGE_/.test(raw)) return 'publish_media_failed';
  if (raw.startsWith('LISTING_PRICE_INVALID')) return 'publish_price_invalid';
  if (raw.startsWith('LISTING_QUANTITY_INVALID')) return 'publish_quantity_invalid';
  if (raw.startsWith('PROHIBITED_LISTING:')) return 'publish_prohibited';
  if (raw.startsWith('PRIVATE_FIELD_EXPOSED:')) return 'publish_private_field_blocked';
  return 'publish_unknown_failed';
}

export default function NationalPublishScreen() {
  const user = useAppStore((state) => state.user);
  const products = useAppStore((state) => state.products);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const nativeDevice = isNativeDeviceRuntime();
  const videoInfraEnabled = mediaStorageEnabled();
  const initialDraft = useMemo(() => readPublishDraft(user.id), [user.id]);

  const [assistantText, setAssistantText] = useState(initialDraft?.assistantText || '');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [title, setTitle] = useState(initialDraft?.title || '');
  const [description, setDescription] = useState(initialDraft?.description || '');
  const [price, setPrice] = useState(initialDraft?.price || '');
  const [quantity, setQuantity] = useState(initialDraft?.quantity || '1');
  const [category, setCategory] = useState<ProductCategory | ''>(initialDraft?.category || '');
  const [condition, setCondition] = useState(initialDraft?.condition || 'Buen estado');
  const [negotiable, setNegotiable] = useState(Boolean(initialDraft?.negotiable));
  const [scope, setScope] = useState<ListingVisibilityScope>(initialDraft?.scope || 'campus');
  const [deliveryMethods, setDeliveryMethods] = useState<ListingDeliveryMethod[]>(initialDraft?.deliveryMethods?.length ? initialDraft.deliveryMethods : ['campus_meetup']);
  const [meetingPointId, setMeetingPointId] = useState(initialDraft?.meetingPointId || '');
  const [attributes, setAttributes] = useState<Record<string, string | number | boolean>>(initialDraft?.attributes || {});
  const [images, setImages] = useState<string[]>(initialDraft?.images?.slice(0, 4) || []);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [topiBusy, setTopiBusy] = useState(false);
  const [topiSource, setTopiSource] = useState<'local' | 'topi-endpoint' | null>(null);
  const [topiProvider, setTopiProvider] = useState<'firebase-ai-logic' | 'private-endpoint' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'listening'>('idle');
  const [approxLocation, setApproxLocation] = useState<ApproxLocation | null>(() => getCachedApproxLocation());

  const institutionId = user.institution_id || user.university?.institution_id || '';
  const campusId = user.campus_id || user.university?.campus_id || '';
  const cityId = user.university?.city_id;
  const fields = useMemo(() => nationalFieldsFor(category || undefined), [category]);
  const safePoints = useMemo(() => safeMeetingPointsFor(campusId, institutionId), [campusId, institutionId]);
  const normalizedAttributes = useMemo(() => normalizeNationalAttributes(fields, attributes), [fields, attributes]);
  const required = useMemo(() => categorySafetyRequirements(category || undefined).required, [category]);
  const missing = required.filter((key) => normalizedAttributes[key] === undefined || normalizedAttributes[key] === null || normalizedAttributes[key] === '');
  const parsedPrice = Number(price);
  const parsedQuantity = Number(quantity);
  const hasValidPrice = price.trim() !== '' && Number.isFinite(parsedPrice) && parsedPrice > 0 && parsedPrice <= 1_000_000;
  const hasValidQuantity = quantity.trim() !== '' && Number.isInteger(parsedQuantity) && parsedQuantity >= 1 && parsedQuantity <= 99;
  const shippingAvailable = deliveryMethods.includes('shipping');
  const prohibitedDraft = isForbiddenProductText(`${title} ${description}`);
  const publishIssues: string[] = [];
  if (!institutionId || !campusId) publishIssues.push('universidad/campus');
  if (!title.trim()) publishIssues.push('título');
  if (!category) publishIssues.push('categoría');
  if (!hasValidPrice) publishIssues.push('precio entre $0.01 y $1,000,000');
  if (!hasValidQuantity) publishIssues.push('cantidad entera entre 1 y 99');
  if (!deliveryMethods.length) publishIssues.push('forma de entrega');
  if (prohibitedDraft) publishIssues.push('artículo o servicio no permitido');
  if (missing.length) publishIssues.push(`${missing.length} dato${missing.length === 1 ? '' : 's'} obligatorio${missing.length === 1 ? '' : 's'}`);
  if (videoFile && !videoInfraEnabled) publishIssues.push('video no disponible en esta beta');
  const readyToPublish = publishIssues.length === 0;

  const pricingTarget = useMemo<Product | null>(() => {
    if (!category) return null;
    return {
      id: 'pricing-draft', vendedor_id: user.id, vendedor_nombre: user.nombre, titulo: title || category,
      descripcion: description, precio_mxn: Number(price || 0), categoria: category, facultad: user.facultad,
      marca: typeof normalizedAttributes.brand === 'string' ? normalizedAttributes.brand : undefined,
      modelo: typeof normalizedAttributes.model === 'string' ? normalizedAttributes.model : undefined,
      attributes: normalizedAttributes, institution_id: institutionId || undefined, campus_id: campusId || undefined,
      city_id: cityId, visibility_scope: scope, punto_encuentro: 'Coordinar por Chat', imagen_url: FALLBACK_IMAGE,
      estado: 'Activo', es_top: false, jerarquia_top: 0, likes: 0, fecha_creacion: new Date().toISOString(),
    };
  }, [category, user.id, user.nombre, user.facultad, title, description, price, normalizedAttributes, institutionId, campusId, cityId, scope]);
  const pricing = useMemo(() => pricingTarget ? smartPriceFromTuTop(pricingTarget, products) : null, [pricingTarget, products]);

  useEffect(() => {
    writePublishDraft(user.id, {
      assistantText, title, description, price, quantity, category, condition, negotiable, scope,
      deliveryMethods, meetingPointId, attributes, images,
    });
  }, [user.id, assistantText, title, description, price, quantity, category, condition, negotiable, scope, deliveryMethods, meetingPointId, attributes, images]);

  const applyTopi = async () => {
    const text = assistantText.trim();
    if (text.length < 3) return setMessage('Cuéntale a Topi qué quieres vender en una frase.');
    if (isForbiddenProductText(text)) return setMessage('Ese tipo de artículo o servicio no está permitido en TuTop. No se creó ningún borrador.');

    setTopiBusy(true);
    setMessage(null);
    try {
      const result = await askTopi('compose', {
        prompt: text,
        products,
        draft: {
          titulo: title || undefined,
          descripcion: description || undefined,
          precio_mxn: hasValidPrice ? parsedPrice : undefined,
          categoria: category || undefined,
          precio_negociable: negotiable,
          visibility_scope: scope,
        },
      });
      const suggestion = result.compose;
      if (!suggestion) return setMessage('Topi no encontró datos seguros para completar. Puedes seguir manualmente.');

      if (suggestion.title) setTitle(suggestion.title);
      if (suggestion.price && suggestion.price > 0) setPrice(String(suggestion.price));
      if (suggestion.description) setDescription(suggestion.description);
      if (suggestion.category) {
        if (suggestion.category !== category) setAttributes({});
        setCategory(suggestion.category);
      }
      if (suggestion.condition) setCondition(suggestion.condition);
      if (suggestion.negotiable !== undefined) setNegotiable(suggestion.negotiable);
      if (suggestion.visibilityScope) setScope(suggestion.visibilityScope);
      else if (suggestion.category) setScope(defaultScopeForCategory(suggestion.category));
      if (suggestion.deliveryMethods?.length) setDeliveryMethods(suggestion.deliveryMethods);

      setTopiSource(result.source);
      setTopiProvider(result.provider || null);
      if (result.provider === 'firebase-ai-logic') setMessage('Topi IA real (Firebase AI) completó el borrador. Revisa los datos antes de publicar.');
      else if (result.provider === 'private-endpoint') setMessage('Topi conectado completó el borrador mediante el endpoint privado. Revisa los datos antes de publicar.');
      else setMessage('Topi usó la guía local. Esta respuesta no se presenta como Firebase AI.');
    } catch (error) {
      setTopiSource(null);
      setTopiProvider(null);
      const status = nativeTopiAIStatus();
      const raw = error instanceof Error ? error.message : String(error);
      if (raw.startsWith('TOPI_REAL_AI_UNAVAILABLE:')) {
        setMessage(`La IA real de Topi no respondió: ${aiFailureLabel(status.reason)}. Reintenta; esta beta no sustituye ese fallo con un asistente local silencioso.`);
      } else {
        setMessage(`Topi no pudo completar el borrador: ${aiFailureLabel(status.reason)}.`);
      }
    } finally {
      setTopiBusy(false);
    }
  };

  const startVoice = () => {
    startTopiDictation({
      onText: (text) => setAssistantText((current) => `${current}${current ? ' ' : ''}${text}`.slice(0, 700)),
      onStatus: (status) => {
        setVoiceStatus(status === 'listening' ? 'listening' : 'idle');
        if (status === 'unsupported') setMessage('El dictado por voz no está disponible en este dispositivo. Puedes seguir escribiendo.');
        if (status === 'error') setMessage('No pudimos reconocer la voz. Habla después de que el micrófono se active y vuelve a intentarlo.');
      },
    });
  };

  const refreshLocation = async () => {
    setMessage('Obteniendo una ubicación aproximada…');
    const location = await requestApproxLocation({ requestPermission: true, timeoutMs: 15_000, maximumAgeMs: 10 * 60_000 });
    setApproxLocation(location);
    if (location) {
      setMessage('Ubicación aproximada activada. TuTop guardará sólo precisión cercana a 1 km, nunca tu domicilio exacto.');
      return;
    }
    const permission = await nearbyLocationPermission();
    if (permission === 'denied') setMessage('Android tiene bloqueada la ubicación para TuTop. Activa ubicación aproximada para la app y vuelve a intentarlo.');
    else if (permission === 'unavailable') setMessage('No pudimos obtener ubicación del dispositivo. Comprueba que los servicios de ubicación de Android estén encendidos.');
    else setMessage('Android concedió el permiso, pero todavía no entregó una posición. Tu anuncio seguirá funcionando por campus y ciudad; vuelve a intentar ubicación en unos segundos.');
  };

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setMessage(null);
    try {
      const next: string[] = [];
      for (const file of Array.from(files).slice(0, Math.max(0, 4 - images.length))) {
        next.push(await compressImageForFirestore(file, { maxDimension: 960, maxBytes: 82_000 }));
      }
      setImages((current) => [...current, ...next].slice(0, 4));
      setMessage(`${next.length} foto${next.length === 1 ? '' : 's'} lista${next.length === 1 ? '' : 's'} para el anuncio.`);
    } catch {
      recordDiagnostic('media', 'photo_processing_failed', { source: 'picker' });
      setMessage('No pudimos procesar una de las fotos. Prueba con otra imagen.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const addNativePhoto = async (source: 'camera' | 'photos') => {
    if (busy || images.length >= 4) return;
    setBusy(true);
    setMessage(source === 'camera' ? 'Abriendo cámara…' : 'Abriendo tus fotos…');
    try {
      const selected = source === 'camera' ? await takeNativePhoto() : await pickNativePhoto();
      if (!selected) {
        setMessage(source === 'camera' ? 'Cámara cerrada sin tomar foto.' : 'Selector cerrado sin elegir foto.');
        return;
      }
      const file = await nativePhotoToImageFile(selected, `tutop-${source}-${Date.now()}.jpg`);
      const compressed = await compressImageForFirestore(file, { maxDimension: 960, maxBytes: 82_000 });
      setImages((current) => [...current, compressed].slice(0, 4));
      setMessage(source === 'camera' ? 'Foto de cámara agregada.' : 'Foto de galería agregada.');
    } catch {
      recordDiagnostic('media', 'photo_processing_failed', { source });
      setMessage('No pudimos procesar la foto. Prueba de nuevo o elige otra imagen.');
    } finally {
      setBusy(false);
    }
  };

  const selectVideo = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    try {
      validateListingVideo(file);
      if (!videoInfraEnabled) {
        setVideoFile(null);
        setMessage('Los videos todavía no están disponibles en esta beta. Puedes publicar el anuncio con fotos.');
        return;
      }
      setVideoFile(file);
      setMessage(`Video listo: ${file.name} · ${(file.size / (1024 * 1024)).toFixed(1)} MB.`);
    } catch (error) {
      setVideoFile(null);
      setMessage(videoErrorMessage(error));
    } finally {
      if (videoRef.current) videoRef.current.value = '';
    }
  };

  const toggleDelivery = (method: ListingDeliveryMethod) => {
    setDeliveryMethods((current) => current.includes(method) ? current.filter((item) => item !== method) : [...current, method]);
  };

  const publish = async () => {
    setMessage(null);
    if (!institutionId || !campusId) return setMessage('Primero selecciona tu universidad y campus.');
    if (!title.trim() || !category || !hasValidPrice) return setMessage('Completa título, categoría y un precio entre $0.01 y $1,000,000.');
    if (!hasValidQuantity) return setMessage('La cantidad debe ser un número entero entre 1 y 99.');
    if (prohibitedDraft) return setMessage('Ese artículo o servicio no está permitido en TuTop. Revisa el título y la descripción.');
    if (!deliveryMethods.length) return setMessage('Selecciona al menos una forma de entrega.');
    if (missing.length) {
      setAdvancedOpen(true);
      return setMessage('Completa los campos obligatorios marcados con * antes de publicar.');
    }
    if (videoFile && !videoInfraEnabled) return setMessage('Los videos todavía no están disponibles en esta beta. Puedes publicar el anuncio con fotos.');

    setBusy(true);
    let uploadedVideoUri: string | null = null;
    try {
      let verification;
      try {
        verification = await verifiedEmailBetaAuth.refreshVerificationStatus();
      } catch (error) {
        recordDiagnostic('publication', 'publish_identity_refresh_failed');
        const reason = error instanceof Error ? error.message : String(error);
        setMessage(`No pudimos actualizar tu sesión de verificación (${reason}). Cierra sesión, vuelve a entrar y reintenta.`);
        return;
      }
      if (!verification.emailVerified) {
        recordDiagnostic('publication', 'publish_email_not_verified');
        setMessage('Esta beta necesita que confirmes el correo de la cuenta antes de publicar. Abre el enlace de verificación y vuelve a tocar Publicar; TuTop actualizará la sesión automáticamente.');
        return;
      }

      const location = approxLocation || await requestApproxLocation({ requestPermission: true, timeoutMs: 15_000 });
      if (location && !approxLocation) setApproxLocation(location);

      if (videoFile) {
        const uploaded = await firebaseMediaStorage.uploadListingVideo(videoFile, user.id);
        uploadedVideoUri = uploaded.uri;
      }

      const now = new Date().toISOString();
      const listing: CanonicalListingV2 = {
        schema_version: 2,
        seller_id: user.id,
        institution_id: institutionId,
        campus_id: campusId,
        city_id: cityId,
        faculty_id: user.faculty_id || user.university?.faculty_id,
        career_id: user.career_id || user.university?.career_id,
        category_id: slug(category),
        title: title.trim().slice(0, 120),
        description: description.trim().slice(0, 3000),
        attributes: { ...normalizedAttributes, ...locationAttributes(location) },
        price_mxn: Math.round(parsedPrice * 100) / 100,
        negotiable,
        quantity: parsedQuantity,
        condition,
        delivery_methods: deliveryMethods,
        meeting_point_ids: meetingPointId ? [meetingPointId] : [],
        shipping_available: shippingAvailable,
        photo_urls: images.length ? images : [FALLBACK_IMAGE],
        ...(uploadedVideoUri ? { video_urls: [uploadedVideoUri] } : {}),
        status: 'active',
        moderation_status: 'pending',
        visibility_scope: scope,
        published_at: now,
        created_at: now,
        updated_at: now,
      };

      // canonicalListingsBackend.create is wrapped by the V2 identity hydration
      // bridge. That bridge is the single publication authority: it validates
      // institution/campus documents, their relationship, reconciles the profile,
      // re-reads it, then writes listings_v2. No UI catch-and-continue path remains.
      await canonicalListingsBackend.create(listing, category);
      uploadedVideoUri = null;
      clearPublishDraft(user.id);

      let refreshedFeed = true;
      try {
        const refreshed = await canonicalListingsBackend.loadMarketplaceProducts({ campusId, institutionId, cityId, limitPerScope: 30 });
        useAppStore.setState({ products: refreshed });
      } catch {
        refreshedFeed = false;
      }

      setMessage(refreshedFeed
        ? 'Publicación creada y enviada a revisión. TuTop no gestiona envíos; cualquier entrega se acuerda directamente entre las personas.'
        : 'Publicación creada y enviada a revisión. El feed tardará en refrescarse; no vuelvas a publicarla para evitar duplicados.');
      window.setTimeout(() => setActiveTab('feed'), refreshedFeed ? 850 : 1500);
    } catch (error) {
      if (uploadedVideoUri) await firebaseMediaStorage.delete(uploadedVideoUri).catch(() => undefined);
      const raw = error instanceof Error ? error.message : String(error);
      const failureCode = publicationFailureCode(raw);
      recordDiagnostic('publication', failureCode);
      if (failureCode === 'publish_permission_denied') {
        setMessage('Una validación de seguridad rechazó la publicación. El anuncio no se creó. Código: PUBLISH_PERMISSION_DENIED.');
      } else if (failureCode === 'publish_price_invalid') {
        setMessage('El precio debe estar entre $0.01 y $1,000,000.');
      } else if (failureCode === 'publish_quantity_invalid') {
        setMessage('La cantidad debe ser un número entero entre 1 y 99.');
      } else if (failureCode === 'publish_rate_limited') {
        setMessage('Alcanzaste temporalmente el límite de publicaciones de seguridad. Espera antes de volver a intentar.');
      } else if (failureCode === 'publish_media_failed') {
        setMessage(videoErrorMessage(error));
      } else if (failureCode === 'publish_prohibited') {
        setMessage('Ese artículo no está permitido en TuTop.');
      } else if (failureCode === 'publish_private_field_blocked') {
        setMessage('Hay información privada que no debe publicarse. Revisa el anuncio y vuelve a intentarlo.');
      } else {
        setMessage('No pudimos publicar el anuncio en este momento. Revisa tu conexión e inténtalo de nuevo.');
      }
    } finally {
      setBusy(false);
    }
  };

  const aiChip = topiProvider === 'firebase-ai-logic'
    ? { label: 'Firebase AI real', className: 'bg-emerald-500/10 text-emerald-300' }
    : topiProvider === 'private-endpoint'
      ? { label: 'IA conectada', className: 'bg-sky-500/10 text-sky-300' }
      : topiSource === 'local'
        ? { label: 'Guía local', className: 'bg-amber-500/10 text-amber-200' }
        : null;

  return <div className="publish-screen pb-[calc(82px+env(safe-area-inset-bottom))]">
    <header className="publish-header pt-safe">
      <button onClick={() => setActiveTab('feed')} className="icon-button-lg" aria-label="Volver al inicio"><ArrowLeft className="h-5 w-5" /></button>
      <div><h1 className="text-lg font-black">Publica fácil con Topi</h1><p className="text-[10px] text-slate-500">Topi entiende TuTop: venta local, campus y acuerdos directos.</p></div>
    </header>

    <main className="page-pad space-y-3 pt-3">
      <section className="publish-card border-violet-400/15 bg-violet-500/[0.05]">
        <div className="flex items-center gap-3">
          <TopiMascot className="h-12 w-12 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><strong className="text-xs">Topi te ayuda a publicar</strong>{aiChip && <span className={`rounded-full px-2 py-0.5 text-[8px] font-black ${aiChip.className}`}>{aiChip.label}</span>}</div>
            <p className="mt-0.5 text-[9px] text-slate-500">Escribe o dicta una frase. Firebase AI real se identifica explícitamente; si falla en esta beta, TuTop lo muestra como fallo y no lo disfraza con un asistente local.</p>
          </div>
        </div>
        <div className="relative mt-3">
          <textarea className="publish-textarea pr-12" rows={3} value={assistantText} onChange={(e) => setAssistantText(e.target.value.slice(0, 700))} placeholder="Ej. Vendo audífonos Sony como nuevos, $2,500 negociables, entrego cerca de Campus Ribereña." />
          <button type="button" onClick={startVoice} className={`absolute bottom-2 right-2 grid h-9 w-9 place-items-center rounded-xl ${voiceStatus === 'listening' ? 'bg-fuchsia-500 text-white' : 'bg-white/[0.06] text-violet-200'}`} aria-label="Dictar a Topi"><Mic className="h-4 w-4" /></button>
        </div>
        <button disabled={topiBusy} type="button" onClick={() => void applyTopi()} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 text-xs font-black text-white disabled:opacity-60">{topiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{topiBusy ? 'Topi está preparando…' : 'Topi, prepara mi anuncio'}</button>
        <p className="mt-2 text-[8px] leading-4 text-slate-600">Topi no recibe fotos, tokens ni ubicación exacta. La IA nunca publica por ti: sólo propone y tú confirmas.</p>
      </section>

      <section className="publish-card">
        <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-emerald-300" /><div className="min-w-0 flex-1"><strong className="text-xs">Cercanía para compradores</strong><p className="mt-1 text-[9px] text-slate-500">{approxLocation ? 'Ubicación aproximada activa (~1 km). Nunca se publica tu domicilio exacto.' : 'Actívala para aparecer en filtros de 5, 10, 25 y 50 km.'}</p></div><button type="button" onClick={() => void refreshLocation()} className="rounded-xl bg-emerald-500/10 px-3 py-2 text-[9px] font-bold text-emerald-200">{approxLocation ? 'Actualizar' : 'Activar'}</button></div>
      </section>

      <section className="publish-card"><strong className="text-xs">{user.university?.institution_name || institutionId || 'Elige tu universidad'}</strong><p className="mt-1 text-[9px] text-slate-500">{user.university?.campus_name || campusId || 'Falta campus'}{user.university?.career_name ? ` · ${user.university.career_name}` : ''}</p></section>

      <section className="publish-card">
        <div className="flex items-center justify-between gap-2">
          <div><p className="eyebrow">FOTOS</p><p className="mt-1 text-[8px] text-slate-600">Máximo 4 · TuTop comprime antes de guardar.</p></div>
          <div className="flex gap-2">
            {nativeDevice ? <>
              <button disabled={busy || images.length >= 4} type="button" onClick={() => void addNativePhoto('camera')} className="inline-flex items-center gap-1 rounded-lg bg-violet-500/10 px-2 py-1.5 text-[9px] font-bold text-violet-200 disabled:opacity-40"><Camera className="h-3.5 w-3.5" />Cámara</button>
              <button disabled={busy || images.length >= 4} type="button" onClick={() => void addNativePhoto('photos')} className="inline-flex items-center gap-1 rounded-lg bg-white/[0.05] px-2 py-1.5 text-[9px] font-bold text-slate-300 disabled:opacity-40"><Images className="h-3.5 w-3.5" />Galería</button>
            </> : <button disabled={busy || images.length >= 4} type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1 rounded-lg bg-violet-500/10 px-2 py-1.5 text-[9px] font-bold text-violet-200 disabled:opacity-40"><Images className="h-3.5 w-3.5" />Elegir fotos</button>}
          </div>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {images.map((image, index) => <div key={index} className="publish-photo relative"><img src={image} alt={`Foto ${index + 1}`} /><button type="button" aria-label={`Quitar foto ${index + 1}`} onClick={() => setImages((current) => current.filter((_, i) => i !== index))}><X /></button></div>)}
          {images.length < 4 && <button type="button" aria-label="Agregar foto" onClick={() => nativeDevice ? void addNativePhoto('photos') : fileRef.current?.click()} className="publish-photo-add"><Plus /><small>Agregar</small></button>}
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => void addPhotos(event.target.files)} />
      </section>

      <section className="publish-card">
        <div className="flex items-center gap-2"><Video className="h-4 w-4 text-violet-300" /><div className="min-w-0 flex-1"><strong className="text-xs">Video del producto</strong><p className="mt-1 text-[8px] text-slate-600">Máximo 1 · MP4/WebM/MOV · menos de 50 MB.</p></div></div>
        {videoInfraEnabled ? <>
          <button type="button" disabled={busy} onClick={() => videoRef.current?.click()} className="mt-3 w-full rounded-xl bg-violet-500/10 px-3 py-2.5 text-[9px] font-bold text-violet-200 disabled:opacity-40">{videoFile ? `Cambiar · ${videoFile.name}` : 'Elegir video'}</button>
          {videoFile && <div className="mt-2 flex items-center justify-between rounded-xl bg-white/[0.03] p-2.5 text-[9px] text-slate-300"><span className="truncate">{videoFile.name} · {(videoFile.size / (1024 * 1024)).toFixed(1)} MB</span><button type="button" aria-label="Quitar video del anuncio" onClick={() => setVideoFile(null)} className="ml-2 text-rose-300">Quitar</button></div>}
        </> : <div className="mt-3 rounded-xl border border-amber-400/10 bg-amber-500/[0.04] p-3 text-[9px] leading-4 text-amber-100/75">Los videos todavía no están disponibles en esta beta. Puedes publicar tu anuncio con fotos.</div>}
        <input ref={videoRef} type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden" onChange={(event) => selectVideo(event.target.files)} />
      </section>

      <section className="publish-card"><p className="eyebrow">REVISA LO ESENCIAL</p><label className="publish-label">Título</label><input className="publish-input" value={title} onChange={(e) => setTitle(e.target.value.slice(0, 120))} placeholder="¿Qué vendes?" /><label className="publish-label">Precio</label><input className="publish-input" type="number" min="0.01" step="0.01" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Precio en MXN" /><label className="publish-label">Categoría</label><select className="publish-input" value={category} onChange={(e) => { const next = e.target.value as ProductCategory; setCategory(next); setAttributes({}); if (next) setScope(defaultScopeForCategory(next)); }}><option value="">Selecciona</option>{MARKETPLACE_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select><label className="publish-label">Descripción</label><textarea className="publish-textarea" rows={3} maxLength={3000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Lo más importante del producto." /><p className="mt-1 text-right text-[8px] text-slate-600">{description.length.toLocaleString('es-MX')} / 3,000</p></section>

      {required.length > 0 && <section className="publish-card"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-300" /><strong className="text-xs">Datos necesarios para {category}</strong></div><p className="mt-1 text-[9px] text-slate-500">Sólo pedimos estos datos porque esta categoría necesita información adicional para publicarse con seguridad.</p><div className="mt-3 grid grid-cols-2 gap-2">{fields.filter((field) => field.required).map((field) => <label key={field.key} className="text-[9px] text-slate-500">{field.label} *{field.kind === 'boolean' ? <input className="ml-2" type="checkbox" checked={Boolean(attributes[field.key])} onChange={(e) => setAttributes((current) => ({ ...current, [field.key]: e.target.checked }))} /> : <input className="publish-input mt-1" type={field.kind === 'number' ? 'number' : 'text'} value={String(attributes[field.key] ?? '')} onChange={(e) => setAttributes((current) => ({ ...current, [field.key]: e.target.value.slice(0, 300) }))} placeholder={field.placeholder} />}</label>)}</div></section>}

      <button type="button" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen((open) => !open)} className="flex w-full items-center justify-between rounded-2xl border border-white/[0.06] bg-white/[0.025] px-4 py-3 text-left"><span><strong className="block text-xs">Más opciones</strong><small className="mt-0.5 block text-[9px] text-slate-500">Condición, cantidad, alcance, entrega y datos opcionales.</small></span><ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} /></button>

      {advancedOpen && <>
        <section className="publish-card"><p className="eyebrow">DETALLES</p><div className="mt-2 grid grid-cols-2 gap-2"><select className="publish-input" value={condition} onChange={(e) => setCondition(e.target.value)}><option>Nuevo</option><option>Como nuevo</option><option>Buen estado</option><option>Uso visible</option><option>Para reparar</option><option>No aplica</option></select><input className="publish-input" type="number" min="1" max="99" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Cantidad" /></div><label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={negotiable} onChange={(e) => setNegotiable(e.target.checked)} />Precio negociable</label>{fields.some((field) => !field.required) && <div className="mt-3 grid grid-cols-2 gap-2">{fields.filter((field) => !field.required).map((field) => <label key={field.key} className="text-[9px] text-slate-500">{field.label}{field.kind === 'boolean' ? <input className="ml-2" type="checkbox" checked={Boolean(attributes[field.key])} onChange={(e) => setAttributes((current) => ({ ...current, [field.key]: e.target.checked }))} /> : <input className="publish-input mt-1" type={field.kind === 'number' ? 'number' : 'text'} value={String(attributes[field.key] ?? '')} onChange={(e) => setAttributes((current) => ({ ...current, [field.key]: e.target.value.slice(0, 300) }))} placeholder={field.placeholder} />}</label>)}</div>}{category === 'Cuartos & Renta' && <p className="mt-2 text-[9px] text-amber-200/70">Nunca publiques la dirección exacta; sólo zona aproximada.</p>}</section>

        <section className="publish-card"><p className="eyebrow">ALCANCE Y ENTREGA</p><div className="mt-2 grid gap-2">{VISIBILITY_SCOPES.map((item) => <button key={item.id} type="button" onClick={() => setScope(item.id)} className={`rounded-xl p-3 text-left ${scope === item.id ? 'bg-violet-500/10 ring-1 ring-violet-400/20' : 'bg-white/[0.02]'}`}><strong className="text-[10px]">{item.label}</strong><p className="text-[9px] text-slate-600">{item.hint}</p></button>)}</div><div className="mt-3 flex flex-wrap gap-2">{DELIVERY.map((item) => <button key={item.id} type="button" onClick={() => toggleDelivery(item.id)} className={`filter-chip ${deliveryMethods.includes(item.id) ? 'filter-chip-active' : ''}`}>{item.label}</button>)}</div><p className="mt-2 rounded-xl bg-sky-500/[0.05] px-3 py-2 text-[9px] text-sky-200/80"><strong>TuTop no hace envíos.</strong> Si vendedor y comprador acuerdan mensajería o paquetería, se coordina directamente entre ellos.</p>{safePoints.length > 0 && <select className="publish-input mt-3" value={meetingPointId} onChange={(e) => setMeetingPointId(e.target.value)}><option value="">Punto a coordinar</option>{safePoints.map((point) => <option key={point.id} value={point.id}>{point.name}</option>)}</select>}</section>
      </>}

      {category && <section className="publish-card"><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-violet-300" /><strong className="text-xs">Precio inteligente</strong></div>{pricing ? <><p className="mt-2 text-[10px] leading-5 text-slate-400">{pricing.sample_size} comparables · mediana ${pricing.median_mxn.toLocaleString('es-MX')} · vender rápido ${pricing.sell_fast_mxn.toLocaleString('es-MX')} · recomendado <strong className="text-violet-200">${pricing.recommended_mxn.toLocaleString('es-MX')}</strong> · probar alto ${pricing.try_high_mxn.toLocaleString('es-MX')}</p><button type="button" onClick={() => setPrice(String(pricing.recommended_mxn))} className="mt-2 rounded-xl bg-violet-500/10 px-3 py-2 text-[10px] font-bold text-violet-200">Usar precio recomendado</button></> : <p className="mt-2 text-[9px] text-slate-500">Aún no hay suficientes comparables reales. Topi no inventará un precio.</p>}</section>}

      <section className={`publish-card ${readyToPublish ? 'border-emerald-400/20 bg-emerald-500/[0.05]' : 'border-amber-400/15 bg-amber-500/[0.04]'}`}><div className="flex items-center gap-2"><CheckCircle2 className={`h-4 w-4 ${readyToPublish ? 'text-emerald-300' : 'text-amber-300'}`} /><strong className="text-xs">{readyToPublish ? 'Listo para publicar' : 'Completa lo mínimo'}</strong></div><p className="mt-1 text-[9px] text-slate-400">{readyToPublish ? 'Tu anuncio tiene lo necesario. Los campos avanzados siguen siendo opcionales salvo los marcados con *.' : `Falta: ${publishIssues.join(' · ')}`}</p></section>
      {message && <div role="status" aria-live="polite" aria-atomic="true" className="rounded-2xl bg-white/[0.04] p-3 text-xs leading-5 text-slate-300">{message}</div>}
      <button disabled={busy || !readyToPublish} onClick={() => void publish()} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 py-4 text-sm font-black disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{busy ? 'Publicando…' : readyToPublish ? 'Publicar en TuTop' : 'Completa lo mínimo para publicar'}</button>
    </main>
  </div>;
}