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

## R105 — Diseño de ensayo de borrado con identidad desechable (19 nov 2026 CDMX)
<!-- TUTOP_OWNER1_R105_20261119_DISPOSABLE_ERASURE_PLAN_NO_APPLY -->

**AUTORIZADO: DISEÑAR, NO EJECUTAR BORRADO REAL.** No usar ninguna de las dos cuentas de correo verificadas existentes hasta establecer su titularidad legítima. No crear una cuenta `smoke`, no sembrar datos en Firebase y no activar `--apply` en staging por el hecho de contar con este diseño. El script histórico `scripts/staging-account-erasure-smoke.mjs` tiene un STOP incondicional justificado: las admisiones de chat/oferta requieren congelamiento atómico comprobado; no retirarlo para forzar verde.

**Secuencia diseñada para aprobación posterior:**

1. Inventario de precondiciones: proyecto staging exacto, políticas legales y retenciones revisadas, revisión de seguridad independiente del congelamiento de nuevas ofertas/chats/transacciones, alcance de datos y rollback de sólo recursos sintéticos. Comprobar que no se reutilizan cuentas, dispositivos o mensajes personales.
2. Crear una cuenta **nueva, explícitamente desechable y aislada** sólo mediante una ejecución posterior específica y aprobada, con correo controlado por su responsable y sin datos reales de menores. Etiquetar su UID como prueba restringida; su secreto no se registra en logs.
3. Sembrar exclusivamente documentos sintéticos previstos: perfil privado, token FCM ficticio, preferencias, publicaciones/solicitudes, ofertas, reservas/bloqueos, chat y sus subcolecciones `messages`, `reads`, `confirmations`, favoritos, historial de notificaciones y referencias cruzadas. Disponer de una segunda cuenta de control sólo si una autorización posterior cubre su seguridad y titularidad.
4. Validar en seco un inventario completo y paginado, registrar un manifiesto previo **sin identificadores personales**, comprobar que cualquier transacción/reserva activa bloquea el borrado y que toda nueva admisión queda cerrada por una barrera confiable del servidor.
5. Tras revisión independiente de la transacción atómica de bloqueo, autorización expresa de esa operación destructiva y decisión jurídica sobre excepciones, ejecutar la eliminación **sólo** sobre la identidad desechable. Comprobar Auth, referencias a UID, subcolecciones, tokens, Storage y estados de solicitud (pending/processing/completed), sin permitir que UI marque `completed` sin atestación de procesador y manifiesto de residuos verificado.
6. Exigir evidencia de idempotencia/reintento, ausencia de residuos personales, conservación legal aprobada y ausencia de impactos sobre cuentas no participantes. Reportar fallos como **FAIL/BLOCKED**, nunca inventar limpieza. Preservar evidencia técnica, sin borrar cuentas originales.

**Condición actual:** ninguna ejecución destructiva ni envío de datos, no se confirma proceso real de borrado, no hay política legal aprobada ni alcance firmado; `RELEASE=false`. Este dossier continúa en estado **PENDIENTE REVISIÓN LEGAL**.


## R113 — Scope ACK for disposable-account erasure protocol (19 Nov 2026 CDMX)
<!-- TUTOP_OWNER1_R113_20261119_DISPOSABLE_ERASURE_PREPARATION_ONLY_OWNER_ACK -->

**Owner's explicit authority on 19 November 2026 is ONLY to prepare the protocol.**
No staging account creation, account deletion, UI deletion request, Firebase writes, admin privilege changes, queue processing, retention decision, server `--apply` invocation, public URL change or real account testing is authorized by this ACK. The two pre-existing verified-email accounts are excluded entirely; their legitimate ownership remains unproven. Continue to apply the R105 fail-closed design and leave `scripts/staging-account-erasure-smoke.mjs` STOP intact.

**Pre-execution review checklist; each item is a separate gate:**

- **Identity boundary:** personally verified, deliberately created and disposable staging account belonging to an authorized tester; verify non-reuse of either existing verified account and exclude all minors/real chats/transactions. No account exists by virtue of this document.
- **Environment boundary:** independently verify staging project, release SHA, isolated rules, server freeze admission and functional web + in-app *request* resources. Viewer access to a web page is not proof of account deletion.
- **Inventory boundary:** enumerate anticipated Auth, Firestore documents and nested subcollections, Storage objects, FCM/device tokens, moderation references, notification outbox, reservation locks and cross-account edges. A dry run may inspect only authorized synthetic data after its own approval; no real user records or production.
- **Race boundary:** server-side atomic freeze must reject new chats, offers, reservations and incoming notification jobs once the erasure begins; test convergence and idempotent retries, including child collections and paginated inventory.
- **Legal boundary:** controller identity, publicly authorized ARCO email and each retention exception must be decided by an authorized human reviewer before any destructive step. Do not invent deadlines, retention periods or legal bases.
- **Final destructive authorization:** requires a *new* explicit instruction naming the isolated disposable test account and the precise scope. Preparation does not grant an `--apply` or manual deletion approval.
- **Post-run evidence only after authorization:** validate independently all expected deletions/retentions and residuals; never set a request to `completed` on the basis of a client response or synthetic CI. Protect evidence and user-owned original data.

The owner also permits future **private staging QA** on two disconnected devices without remote AI, but that is *not* consent to erase an account or seed a live backend. The first moderator, audience (18+ vs all ages with minor features blocked), legal controller and ARCO mailbox all remain unresolved. **STATUS: PROTOCOL PREPARED / NO REAL BORRADO / NO LEGAL APPROVAL / NO RELEASE.**
