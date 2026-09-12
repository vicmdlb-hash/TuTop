import { classifySupportQuery, supportNode, supportTreeFacts, type SupportRouteId } from '../lib/supportDecisionTree';
import { generateNativeTopiText } from './nativeTopiAI';

export type SupportAnswer = {
  text: string;
  source: 'guided' | 'firebase-ai';
  route: SupportRouteId;
};

function safeQuestion(value: string) {
  return value.replace(/\u0000/g, '').replace(/\s+/g, ' ').trim().slice(0, 900);
}

function resolveRoute(question: string, routeHint: SupportRouteId) {
  const detected = classifySupportQuery(question);
  return detected !== 'root' ? detected : routeHint;
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
  return [
    'Eres Topi Ayuda, asistente de soporte al consumidor dentro de TuTop, marketplace universitario en México.',
    'Responde en español de México, claro y breve, máximo 900 caracteres.',
    'Usa únicamente los hechos de soporte incluidos abajo y el contexto de la pregunta. Si el árbol no cubre algo, dilo claramente.',
    'No inventes políticas, reembolsos, soporte humano, garantías, alianzas, pagos, envíos, funciones o estados del backend.',
    'Nunca solicites contraseñas, códigos de verificación, tokens, claves privadas, domicilio exacto, números completos de tarjeta ni documentos completos.',
    'Si detectas fraude o riesgo, indica detener la operación y no compartir secretos.',
    'Topi explica y orienta; no ejecuta compras, publicaciones, pagos, recuperaciones de cuenta ni decisiones de moderación por el usuario.',
    `RUTA_ACTUAL=${node.title}`,
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
  return deterministicAnswer(clean, route);
}
