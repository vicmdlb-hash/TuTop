import { classifySupportQuery, supportNode, supportTreeFacts, type SupportRouteId } from '../lib/supportDecisionTree';
import { generateNativeTopiText, nativeTopiAIStatus } from './nativeTopiAI';

export type SupportAnswer = {
  text: string;
  source: 'guided' | 'firebase-ai' | 'unavailable';
  route: SupportRouteId;
};

function safeQuestion(value: string) {
  return value.replace(/\u0000/g, '').replace(/\s+/g, ' ').trim().slice(0, 900);
}

function resolveRoute(question: string, routeHint: SupportRouteId) {
  const detected = classifySupportQuery(question);
  return detected !== 'root' ? detected : routeHint;
}

function physicalQaRequiresRealAI() {
  const environment = String(import.meta.env.VITE_TUTOP_ENVIRONMENT || '').trim().toLowerCase();
  const version = String(import.meta.env.VITE_TUTOP_APP_VERSION || '').trim();
  return environment === 'staging' && /^0\.9\.2-beta\./.test(version);
}

function deterministicAnswer(question: string, routeHint: SupportRouteId = 'root'): SupportAnswer {
  const route = resolveRoute(question, routeHint);
  const node = supportNode(route);
  if (node.answer) return { text: node.answer, source: 'guided', route };
  if (node.choices?.length) {
    return {
      text: `${node.prompt} Opciones: ${node.choices.map((choice) => choice.label).join(' · ')}.`,
      source: 'guided',
      route,
    };
  }
  return {
    text: 'No pude ubicar esa duda con suficiente precisión. Elige una categoría del árbol de ayuda o describe qué pantalla estabas usando y qué mensaje apareció.',
    source: 'guided',
    route: 'root',
  };
}

function aiPrompt(question: string, route: SupportRouteId) {
  const node = supportNode(route);
  const activeGuidance = node.answer || node.prompt;
  return [
    'Eres Topi Ayuda, asistente de soporte al consumidor dentro de TuTop, marketplace universitario en México.',
    'Responde en español de México, claro y breve, máximo 900 caracteres.',
    'Usa únicamente los hechos de soporte incluidos abajo y el contexto de la pregunta. Si el árbol no cubre algo, dilo claramente.',
    'No inventes políticas, reembolsos, soporte humano, garantías, alianzas, pagos, envíos, funciones o estados del backend.',
    'Nunca solicites contraseñas, códigos de verificación, tokens, claves privadas, domicilio exacto, números completos de tarjeta ni documentos completos.',
    'Si detectas fraude o riesgo, indica detener la operación y no compartir secretos.',
    'Topi explica y orienta; no ejecuta compras, publicaciones, pagos, recuperaciones de cuenta ni decisiones de moderación por el usuario.',
    `RUTA_ACTUAL=${node.title}`,
    `GUIA_DE_ESTA_RUTA=${activeGuidance}`,
    `PREGUNTA=${question}`,
    `HECHOS_TUTOP=\n${supportTreeFacts()}`,
  ].join('\n').slice(0, 12000);
}

export async function answerConsumerSupport(question: string, routeHint: SupportRouteId = 'root'): Promise<SupportAnswer> {
  const clean = safeQuestion(question);
  if (clean.length < 3) return deterministicAnswer(clean, routeHint);
  const route = resolveRoute(clean, routeHint);
  const generated = await generateNativeTopiText(aiPrompt(clean, route));
  const text = generated?.text?.replace(/^```(?:text)?\s*/i, '').replace(/\s*```$/i, '').trim().slice(0, 900);
  if (text) return { text, source: 'firebase-ai', route };

  // In the private physical-QA build a typed free-form question is an AI test.
  // Never disguise a Firebase AI failure as a successful local assistant answer.
  // The deterministic decision tree remains available through its explicit UI.
  if (physicalQaRequiresRealAI()) {
    const reason = nativeTopiAIStatus().reason;
    return {
      text: `La IA real de Topi no respondió (${reason}). Reintenta con conexión a internet. La guía local sigue disponible en las opciones, pero esta pregunta no se respondió con IA.`,
      source: 'unavailable',
      route,
    };
  }

  return deterministicAnswer(clean, route);
}