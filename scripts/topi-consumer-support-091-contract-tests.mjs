import assert from 'node:assert/strict';
import fs from 'node:fs';

const tree = fs.readFileSync('src/lib/supportDecisionTree.ts', 'utf8');
const service = fs.readFileSync('src/services/topiConsumerSupport.ts', 'utf8');
const ui = fs.readFileSync('src/components/TopiSupportAssistant.tsx', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const voice = fs.readFileSync('src/lib/topiVoice.ts', 'utf8');

for (const route of ['Cuenta y perfil', 'Publicar con Topi', 'Comprar o vender', 'Mensajes y avisos', 'UCoins', 'Ubicación, cámara o micrófono', 'Seguridad', 'Problema técnico']) {
  assert.match(tree, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

assert.match(tree, /classifySupportQuery/);
assert.match(tree, /supportTreeFacts/);
assert.match(tree, /No compartas contraseñas, códigos ni capturas con datos sensibles/);
assert.match(tree, /TuTop no opera una paquetería propia/);
assert.match(tree, /la beta de pruebas debe informar indisponibilidad sin fingir una respuesta de IA real/);
assert.doesNotMatch(tree, /Si la IA remota no está disponible, TuTop usa su asistente local/);
assert.match(tree, /No son dinero, criptomoneda ni saldo retirable/);
assert.match(tree, /ubicación aproximada/i);
assert.match(tree, /no necesita ubicación en segundo plano/i);

assert.match(service, /generateNativeTopiText/);
assert.match(service, /source: 'guided' \| 'firebase-ai'/);
assert.match(service, /No inventes políticas, reembolsos, soporte humano, garantías/);
assert.match(service, /Nunca solicites contraseñas, códigos de verificación, tokens/);
assert.match(service, /deterministicAnswer/);
assert.match(service, /redactTopiRemoteText/);
assert.match(service, /privacyRedactions/);
assert.match(service, /privacy_redaction_count/);
assert.match(service, /aiPrompt\(remoteQuestion, route\)/);

assert.match(ui, /Pregúntale a Topi/);
assert.match(ui, /Tu amigo para resolver dudas y usar TuTop/);
assert.match(ui, /Escribe o dicta tu pregunta/);
assert.match(ui, /startTopiDictation/);
assert.match(ui, /Firebase AI real, tu pregunta se procesa remotamente/);
assert.match(ui, /omitió datos de contacto o códigos sensibles detectados/);
assert.match(ui, /answerConsumerSupport/);
assert.doesNotMatch(ui, /Árbol de decisiones \+ IA/);
assert.doesNotMatch(ui, /Soporte guiado/);
assert.doesNotMatch(ui, /Ruta guiada/);
assert.doesNotMatch(ui, /tokens ni domicilio exacto/);
assert.match(voice, /TuTopVoice/);
assert.match(app, /TopiSupportAssistant/);
assert.match(app, /!activeChatId && <TopiSupportAssistant \/>/);

console.log('✅ TuTop 0.9.1 consumer Topi support + native voice + AI fallback contracts PASS');
