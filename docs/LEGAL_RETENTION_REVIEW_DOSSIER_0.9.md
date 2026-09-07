# TuTop 0.9 — dossier de decisión legal de retención

Estado: **PENDIENTE REVISIÓN LEGAL**. Este dossier no fija plazos, bases legales ni excepciones. Ingeniería sólo prepara las preguntas y la evidencia técnica para una decisión autorizada.

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
- Confirmación de que producción, billing y proveedores reales de recovery siguen fuera de alcance.

## Gate

No reemplazar `PENDIENTE LEGAL` por una duración, base jurídica o excepción inferida por ingeniería. Una decisión sólo se considera cerrada cuando un responsable autorizado completa todos los campos y deja trazabilidad de aprobación.
