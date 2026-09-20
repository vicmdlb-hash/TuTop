# TuTop 0.9 — dossier de decisión legal de retención

Estado: **PENDIENTE REVISIÓN LEGAL**. Este dossier no fija plazos, bases legales, jurisdicción ni excepciones. Ingeniería sólo prepara las preguntas y la evidencia técnica para una decisión autorizada.

## Paquete técnico actual para revisión — Build118 / Candidate118

Esta sección únicamente identifica evidencia técnica vigente. **No fija plazos, bases legales, jurisdicción, excepciones ni conclusiones jurídicas.**

### Autoridad técnica
- Build Android vigente: **Build118 / PR #100 / SHA `e93ca0bb237e7fa438df5801fc627f065d9441e6` / `0.9.2-beta.8` / versionCode `90212`**.
- Build118 run `35526553288` = **SUCCESS**.
- Rules activas de staging y Rules generadas por Build118: SHA-256 `35e8c53e5c180e59b17d5d6976b09b80984919b943d892de5e52bc6ca9c7277a`, igualdad exacta probada.
- Estado físico: **DEVICE_A_NOT_TESTED**; CI no equivale a aceptación física.

### Eliminación de cuenta
- Candidate118 / PR #103 implementa un recurso web autenticado propio para solicitar/consultar eliminación sin abrir ni reinstalar Android.
- El flujo usa la misma identidad Firebase, deriva el UID desde Auth y reutiliza `account_deletion_requests/{uid}`.
- El navegador sólo puede crear una solicitud `pending` o consultar su estado; no ejecuta erasure destructivo ni puede declarar `completed`.
- Security Rules prueban aislamiento owner-only y niegan lectura cruzada/complete desde cliente.
- Play/Data Safety preflight `35535904461` = **SUCCESS** y Hosting prepare/no-deploy `35535904470` = **SUCCESS**.
- Firebase Hosting **no está desplegado** para esta candidata; la política de privacidad continúa marcada **NO legalmente aprobada** y el deploy está cerrado por ese gate.
- El mailbox de soporte/privacidad permanece sólo como fallback; no se publica automáticamente correo personal ni Firebase `noreply`.

### Erasure y evidencia residual
- Los contratos de software cubren `delete / withdraw-anonymize / operational-retain`, bloqueo por operación marketplace activa, Auth eliminado al final, attestation trusted y manifiesto residual.
- Auditoría live read-only `35535470621` = **SUCCESS / mutations=0** y observó:
  - `account_deletion_requests=0`;
  - `listings_v2=0`;
  - `admins=0`;
  - `device_tokens=0`.
- Por tanto hoy no existe un sujeto auténtico de staging para ejecutar un apply de erasure, moderación o FCM E2E.
- El smoke sintético destructivo no debe forzarse saltando el gate SPEND/billing sólo para obtener un PASS.
- Ingeniería no interpreta ausencia de sujeto como aceptación legal ni como prueba destructiva de producción.

### Firebase AI / Topi
- Auditoría primaria read-only `35535825476` = **SUCCESS / mutations=0**.
- Firebase AI Logic ConfigService respondió HTTP 200 pero no devolvió `telemetryConfig`; el valor normalizado es `UNSPECIFIED`, no un `NONE` inventado.
- Cloud Logging: 0 exclusiones activas y 0 entradas `firebasevertexai.googleapis.com/Model` en las 48h revisadas.
- La evidencia es consistente con **Firebase AI Monitoring no observado/configurado explícitamente** en staging.
- Esto no decide tratamiento, base, conservación o rol del proveedor Gemini fuera de Firebase AI Monitoring; esas cuestiones siguen **PENDIENTE LEGAL** / revisión Data Safety.

### Bloqueos expresamente fuera de alcance de ingeniería
- Jurisdicción aplicable: **PENDIENTE LEGAL**.
- Base jurídica por grupo de datos: **PENDIENTE LEGAL**.
- Plazos de conservación: **PENDIENTE LEGAL**.
- Evento de inicio de cada plazo: **PENDIENTE LEGAL**.
- Excepciones por disputa/fraude/seguridad/cumplimiento: **PENDIENTE LEGAL**.
- Identidad del aprobador y fecha de vigencia: **PENDIENTE LEGAL**.
- Producción Firebase, billing, signing/AAB y Play continúan bloqueados.

## Baseline normativo mexicano para revisión

> **Nota de alcance:** esta sección resume requisitos normativos oficiales para orientar la revisión. No sustituye asesoría jurídica ni decide por sí sola qué excepción, base, plazo o relación jurídica aplica a cada dato de TuTop.

Fuente primaria de referencia: **Ley Federal de Protección de Datos Personales en Posesión de los Particulares**, nueva ley publicada DOF 20-03-2025; la Cámara de Diputados reporta reforma más reciente DOF 14-11-2025.

### Requisitos que el revisor debe mapear a TuTop

- **Finalidad y minimización:** el tratamiento debe limitarse a las finalidades del aviso; para datos sensibles debe buscarse que el periodo de tratamiento sea el mínimo indispensable.
- **Supresión y bloqueo:** cuando los datos dejan de ser necesarios para las finalidades que motivaron el tratamiento deben suprimirse, previo bloqueo cuando corresponda y una vez concluido el periodo de conservación aplicable.
- **Aviso de privacidad integral:** debe definir al menos:
  - identidad y domicilio del responsable;
  - datos personales tratados e identificación de datos sensibles;
  - finalidades del tratamiento;
  - opciones/medios para limitar uso o divulgación;
  - mecanismos, medios y procedimientos para ejercer derechos ARCO;
  - procedimiento para comunicar cambios al aviso.
- **Seguridad:** deben existir medidas administrativas, técnicas y físicas acordes con riesgo, consecuencias, sensibilidad y tecnología.
- **Cancelación:** la persona titular puede solicitar cancelación; la ley prevé bloqueo previo a supresión y permite conservación exclusivamente para responsabilidades nacidas del tratamiento durante el periodo aplicable.
- **Excepciones a cancelación:** existen supuestos legales específicos (por ejemplo, datos necesarios para desarrollar/cumplir determinadas relaciones u obligaciones o por disposición legal). **El revisor debe decidir si alguno aplica a cada grupo de TuTop; ingeniería no lo presume.**
- **ARCO:** debe existir persona/departamento responsable de tramitar solicitudes. La ley establece un plazo máximo de **20 días** para comunicar la determinación y, si procede, hacerla efectiva dentro de los **15 días** siguientes; la ampliación prevista por la ley debe revisarse caso por caso.
- **Dato contractual específico:** la ley contiene una regla de **72 meses** para datos relativos al incumplimiento de obligaciones contractuales. No debe trasladarse automáticamente a chats, transacciones, reportes u otros datos de TuTop; el revisor debe determinar primero si un dato concreto entra realmente en ese supuesto.

### Preguntas legales ya identificadas para TuTop

1. ¿Quién será jurídicamente el **responsable** del tratamiento y qué domicilio debe aparecer en el aviso?
2. ¿Qué datos de verificación universitaria califican como **sensibles** o requieren protección reforzada?
3. Para `transactions_v2`, `offers`, `chats`, `reports` y `audit_log`, ¿qué información corresponde bloquear/retener por responsabilidades y cuál debe anonimizarse o suprimirse?
4. ¿Qué relación jurídica —si existe— funda cada tratamiento y qué plazo de prescripción aplicable determina el bloqueo?
5. ¿Algún dato de TuTop es realmente “relativo al incumplimiento de obligaciones contractuales” para efectos de la regla específica de 72 meses?
6. ¿Qué terceros/proveedores deben recibir notificación de rectificación/cancelación cuando continúan tratando datos transmitidos por TuTop?
7. ¿Quién será la persona/departamento encargado de ARCO y cuál será el canal verificable para cumplir los plazos legales?
8. ¿Cómo se documentarán excepciones parciales de cancelación sin convertir una excepción específica en retención generalizada?
9. ¿Cómo debe describirse el tratamiento por Firebase Auth, Firestore, FCM, App Check, Firebase AI Logic/Gemini y reconocimiento de voz en el aviso final y en Data Safety?

Referencias oficiales:
- Diario Oficial de la Federación, Decreto/LFPDPPP, 20-03-2025.
- Cámara de Diputados, texto vigente de LFPDPPP, última reforma reportada 14-11-2025.
- Orden Jurídico Nacional, texto vigente LFPDPPP, artículos 10, 12, 14-20 y 21-36.

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
