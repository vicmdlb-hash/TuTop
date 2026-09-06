import fs from 'node:fs';

function replaceOnce(path, from, to, label) {
  let text = fs.readFileSync(path, 'utf8');
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 occurrence, found ${count}`);
  text = text.replace(from, to);
  fs.writeFileSync(path, text);
}

replaceOnce(
  'src/components/BackendGate.tsx',
  "import { CAMPUSES, INSTITUTIONS, identityFor } from '../lib/universityNetwork';",
  "import { CAMPUSES, INSTITUTIONS } from '../lib/universityNetwork';",
  'BackendGate remove direct identity helper',
);
replaceOnce(
  'src/components/BackendGate.tsx',
  "import { nationalBackend, nationalSchemaEnabled } from '../services/nationalBackend';",
  "import { nationalSchemaEnabled } from '../services/nationalBackend';",
  'BackendGate remove direct national backend import',
);
replaceOnce(
  'src/components/BackendGate.tsx',
  "import { onlineBackend } from '../services/onlineBackend';",
  "import { onlineBackend } from '../services/onlineBackend';\nimport { completePendingUniversityIdentity, rememberPendingUniversityIdentity } from '../services/v2OnboardingRecovery';",
  'BackendGate onboarding import',
);
replaceOnce(
  'src/components/BackendGate.tsx',
  "      hydrateOnline(snapshot);\n      setAuthenticated(true);",
  "      hydrateOnline(snapshot);\n      if (nationalSchemaEnabled()) void completePendingUniversityIdentity().catch(() => false);\n      setAuthenticated(true);",
  'BackendGate onboarding recovery sync',
);
replaceOnce(
  'src/components/BackendGate.tsx',
  "        await onlineBackend.register(phone, password, { nombre: name, facultad: legacyAdapter });\n        if (nationalSchemaEnabled()) {\n          await nationalBackend.updateUniversityIdentity(identityFor(institutionId, campusId), legacyAdapter);\n        }",
  "        if (nationalSchemaEnabled()) {\n          rememberPendingUniversityIdentity({ phone, institution_id: institutionId, campus_id: campusId, legacy_adapter: legacyAdapter });\n        }\n        await onlineBackend.register(phone, password, { nombre: name, facultad: legacyAdapter });\n        if (nationalSchemaEnabled()) {\n          await completePendingUniversityIdentity().catch(() => false);\n        }",
  'BackendGate idempotent onboarding',
);

replaceOnce(
  'src/components/NationalPublishScreen.tsx',
  "  const [shipping, setShipping] = useState(false);\n",
  '',
  'publish remove duplicate shipping state',
);
replaceOnce(
  'src/components/NationalPublishScreen.tsx',
  "  const toggleDelivery = (method: ListingDeliveryMethod) => {\n    setDeliveryMethods((current) => current.includes(method) ? current.filter((item) => item !== method) : [...current, method]);\n    if (method === 'shipping' && !deliveryMethods.includes('shipping')) setShipping(true);\n  };",
  "  const toggleDelivery = (method: ListingDeliveryMethod) => {\n    setDeliveryMethods((current) => current.includes(method) ? current.filter((item) => item !== method) : [...current, method]);\n  };",
  'publish shipping toggle',
);
replaceOnce(
  'src/components/NationalPublishScreen.tsx',
  "    if (scope === 'national' && !shipping) return setMessage('Todo México requiere envío disponible.');",
  "    const shippingAvailable = deliveryMethods.includes('shipping');\n    if (scope === 'national' && !shippingAvailable) return setMessage('Todo México requiere seleccionar Paquetería.');",
  'publish national shipping validation',
);
replaceOnce(
  'src/components/NationalPublishScreen.tsx',
  "        meeting_point_ids: meetingPointId ? [meetingPointId] : [], shipping_available: shipping,",
  "        meeting_point_ids: meetingPointId ? [meetingPointId] : [], shipping_available: shippingAvailable,",
  'publish canonical shipping value',
);
replaceOnce(
  'src/components/NationalPublishScreen.tsx',
  "<textarea className=\"publish-textarea\" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder=\"Lo más importante del producto.\" />",
  "<textarea className=\"publish-textarea\" rows={3} maxLength={3000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder=\"Lo más importante del producto.\" /><p className=\"mt-1 text-right text-[8px] text-slate-600\">{description.length.toLocaleString('es-MX')} / 3,000</p>",
  'publish description max length',
);
replaceOnce(
  'src/components/NationalPublishScreen.tsx',
  "{scope === 'national' && <label className=\"mt-2 flex items-center gap-2 text-xs\"><input type=\"checkbox\" checked={shipping} onChange={(e) => setShipping(e.target.checked)} />Disponible para envío</label>}",
  "{scope === 'national' && <p className=\"mt-2 rounded-xl bg-sky-500/[0.05] px-3 py-2 text-[9px] text-sky-200/80\">Para Todo México, selecciona <strong>Paquetería</strong> como forma de entrega.</p>}",
  'publish duplicate shipping checkbox',
);

console.log('Runtime consistency codemod applied.');
