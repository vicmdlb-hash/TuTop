# TuTop 0.9 — dossier de decisión legal de retención

Estado: **PENDIENTE REVISIÓN LEGAL**. Este dossier no fija plazos, bases legales, jurisdicción ni excepciones. Ingeniería sólo prepara las preguntas y la evidencia técnica para una decisión autorizada.

## Registro de decisión obligatorio

- Jurisdicción aplicable: **PENDIENTE LEGAL**
- ID / referencia de decisión: **PENDIENTE LEGAL**
- Referencia de evidencia técnica revisada: **PENDIENTE LEGAL**
- Responsable/aprobador: **PENDIENTE LEGAL**
- Fecha de aprobación: **PENDIENTE LEGAL**
- Fecha de entrada en vigor: **PENDIENTE LEGAL**

## Decisiones obligatorias antes de producción

| Grupo de datos | Acción técnica actual | Pregunta que debe resolver revisión legal | Base legal | Plazo | Evento inicial | Excepciones | Aprobador | Estado |
|---|---|---|---|---|---|---|---|---|
| Perfil público/privado (`users`, `user_private`) | eliminar | ¿Qué datos deben desaparecer al cerrar cuenta y cuáles requieren conservación mínima? | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | pendiente |
| Push/preferencias (`device_tokens`, `notification_receipts`, `saved_searches`, `favorites`) | eliminar | ¿Existe alguna obligación o interés legítimo que impida eliminación inmediata? | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | pendiente |
| Verificación universitaria | eliminar/purgar evidencia | ¿Qué evidencia mínima puede conservarse tras aprobar/rechazar y con qué finalidad? | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | pendiente |
| Listings/demand | retirar + anonimizar | ¿Qué campos deben conservarse para disputas, fraude o cumplimiento? | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | pendiente |
| Ofertas/chats | retención operacional cuando corresponda | ¿Qué parte de negociación constituye evidencia necesaria y qué parte debe anonimizarse? | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | pendiente |
| Transacciones/reviews | retención operacional | ¿Qué evidencia transaccional/reputacional debe sobrevivir al borrado de cuenta? | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | pendiente |
| Reservation locks | cleanup terminal trusted | ¿Existe alguna razón legal para conservar un lock técnico después de quedar terminal? | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | pendiente |
| Reportes/auditoría | retener evidencia mínima | ¿Qué evidencia de seguridad, fraude y acciones administrativas requiere conservación? | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | pendiente |
| Solicitudes de borrado | retener evidencia mínima | ¿Qué comprobante mínimo de cumplimiento debe conservarse y por cuánto tiempo? | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | pendiente |
| `notification_outbox` (destinatario y contenido) | pendiente de clasificación individual | ¿Qué contenido, identificadores y estado de envío deben purgarse o retenerse, y cómo evitar envíos tras solicitar borrado? | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | pendiente |
| `age_proofs_v2` (prueba de edad) | revocación propuesta, no acreditada en backend | ¿Cómo minimizar, revocar y acreditar el tratamiento de pruebas de edad de menores y adultos? | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | pendiente |
| `guardian_grants_v2` (tutela) | revocación propuesta, no acreditada en backend | ¿Qué consentimiento o historial mínimo debe conservarse al retirar una tutela y bajo qué controles? | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | pendiente |
| `adult_actions_v2` (acciones de tutor) | revocación propuesta, no acreditada en backend | ¿Qué autorizaciones deben invalidarse y qué evidencia puede mantenerse sin conservar datos innecesarios? | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | pendiente |
| `chats/*/messages`, `chats/*/reads`, `chats/*/confirmations` | inventario residual técnico, no borrado acreditado | ¿Cuál es la separación correcta entre texto personal, lectura y evidencia probatoria bajo retención mínima? | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | pendiente |
| `moderation_cases` (moderación de usuarios) | consulta técnica existente, inventario incompleto | ¿Cómo tratar referencias del denunciante y denunciado, evidencia sensible y plazos de conservación? | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | pendiente |
| UCoins internos | eliminar según política beta | ¿Qué registros de puntos internos deben conservarse para integridad/abuso, recordando que no son dinero ni cripto? | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | PENDIENTE LEGAL | pendiente |

## Paquete que ingeniería debe entregar al revisor

- Matriz técnica `RETENTION_ERASURE_MATRIX_0.9.md`.
- Plantilla `LEGAL_RETENTION_REVIEW_TEMPLATE_0.9.md`.
- Flujo de account erasure y evidencia del smoke sintético staging.
- Lista de colecciones y clasificación `delete / withdraw-anonymize / operational-retain`.
- Snapshot/version exacta del esquema y Rules revisados.
- Confirmación de que producción, billing y proveedores reales de recovery siguen fuera de alcance.

## Gate

No reemplazar `PENDIENTE LEGAL` por una duración, base jurídica, jurisdicción o excepción inferida por ingeniería. Una decisión sólo se considera cerrada cuando un responsable autorizado completa todos los campos, identifica la evidencia revisada y deja trazabilidad de aprobación y vigencia.

## Evidencia normativa contrastada: alcance infantil, cuenta y datos (R158)

**Corte CDMX: 21-nov-2026. Estado: EVALUACIÓN TÉCNICA / PENDIENTE LEGAL Y DE CLASIFICACIÓN PLAY.** Fuentes oficiales verificadas en este corte. Esta sección no modifica la audiencia objetivo elegida por el propietario ni autoriza publicar, desplegar, activar Firebase, conceder accesos o borrar cuentas.

| Decisión requerida | Evidencia técnica disponible | Evidencia adicional obligatoria | Estado |
|---|---|---|---|
| Identificar si TuTop tiene como función principal chatear con desconocidos, chat aleatorio/anónimo, o si el chat es incidental a compraventa identificada | PR123: publicaciones, ofertas, chats entre participantes y correo verificado previsto; la autenticación no acredita por sí sola ausencia de anonimato | Flujos de onboarding, descubrimiento, chat, contacto entre desconocidos y clasificación de contenido; dictamen del responsable de políticas y revisión legal | PENDIENTE CLASIFICACIÓN; no inferir prohibición ni exención |
| Audiencia de menores de 13 y adolescentes prevista por propietario | El borrador public/privacy.html mantiene todas las edades; guardian-demo usa pruebas sintéticas aisladas, no backend aprobado | Evaluación real de edad, tutores, revocación, consentimientos, interacción con desconocidos, UGC, denuncias y moderación; decisión de elegibilidad Play | PENDIENTE LEGAL Y SEGURIDAD; no acceso real de menores |
| Requisitos Google Play Families y Age-Restricted | Normas distinguen apps cuyo propósito principal es chat con desconocidos/anonimato, y funciones accesorias | Evaluar la categoría por funcionamiento real, no marketing; si aplica restricción, implementar bloqueo de menores correspondiente | PENDIENTE; no cambiar audiencia unilateralmente |
| Solicitud de borrado dentro de app y en web externa | Código para public/delete-account.html e iniciación autenticada; es borrador sin disponibilidad pública ni eficacia acreditadas | URL pública funcional, flujo real probado, ejecución trusted, eliminación completa y retención aprobada | PENDIENTE; freeze o pending nunca equivalen a borrado concluido |
| Declaraciones Data Safety y aviso de privacidad | Inventario técnico de Auth, chat, cámara, ubicación aproximada opt-in, notificaciones, verificación, potenciales terceros de voz y menores | Contrastarlo con APK exacta, flujos reales, SDK y backend; identidad legal/canal ARCO y aprobación final | PENDIENTE; no rellenar Play automáticamente |
| Plazos y excepciones de datos conservados | Matriz técnica RETENTION_ERASURE_MATRIX_0.9.md, procesador staging apply bloqueado por falta de freeze atómico | Responsable legal, base jurídica, plazo, inicio del cómputo, excepciones y prueba de borrado sin residuos | PENDIENTE LEGAL; no inventar plazos |

**Fuentes oficiales (no son un dictamen de cumplimiento):**
- Families: https://support.google.com/googleplay/android-developer/answer/9893335?hl=es-419
- Age-Restricted Content and Functionality: https://support.google.com/googleplay/android-developer/answer/16302250?hl=en
- Anuncio de restricciones con fecha de efectividad 26-ago-2026: https://support.google.com/googleplay/android-developer/answer/17134731
- User Data / eliminación de cuenta y Data Safety: https://support.google.com/googleplay/android-developer/answer/10144311?hl=en
- Requisitos del recurso web de eliminación: https://support.google.com/googleplay/android-developer/answer/13327111?hl=en-en
- Ley mexicana de protección de datos en posesión de particulares (texto oficial para revisión jurídica; sin determinar plazos): https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf

**Semáforo de autorización:** E1 sigue OPEN sin evidencia de clasificación/edad/revisión legal. E2 permanece HOLD hasta congelamiento atómico backend comprobado y prueba con cuenta sintética expresamente aprobada; es incorrecto derivar borrado completo de estados pending/completed sin evidencia residual. D1 proveedor FID independiente. **NO RELEASE**.
