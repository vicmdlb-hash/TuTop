# TuTop 0.9 — plantilla de revisión legal de retención

Esta tabla NO fija plazos legales. Convierte la política técnica actual en preguntas concretas para revisión jurídica antes de producción.

| Colección / dato | Finalidad técnica | Acción técnica actual | Base legal | Plazo de retención | Evento de inicio del plazo | Excepciones / litigio / fraude | Responsable de aprobar | Estado |
|---|---|---|---|---|---|---|---|---|
| `users` | Perfil y operación de cuenta | eliminar | PENDIENTE LEGAL | PENDIENTE LEGAL | solicitud válida de eliminación | PENDIENTE LEGAL | PENDIENTE LEGAL | pendiente |
| `user_private` | Datos privados de cuenta | eliminar | PENDIENTE LEGAL | PENDIENTE LEGAL | solicitud válida de eliminación | PENDIENTE LEGAL | PENDIENTE LEGAL | pendiente |
| `device_tokens` | Notificaciones push | eliminar | PENDIENTE LEGAL | PENDIENTE LEGAL | eliminación/desactivación | PENDIENTE LEGAL | PENDIENTE LEGAL | pendiente |
| `favorites` / `saved_searches` / `notification_receipts` | Preferencias de usuario | eliminar | PENDIENTE LEGAL | PENDIENTE LEGAL | solicitud válida de eliminación | PENDIENTE LEGAL | PENDIENTE LEGAL | pendiente |
| `wallets` / `wallet_transactions` | UCoins beta internos sin valor monetario | eliminar según política beta | PENDIENTE LEGAL | PENDIENTE LEGAL | solicitud válida de eliminación | PENDIENTE LEGAL | PENDIENTE LEGAL | pendiente |
| `verificationRequests` | Verificación universitaria | eliminar cuando no exista retención aplicable | PENDIENTE LEGAL | PENDIENTE LEGAL | eliminación / vencimiento evidencia | PENDIENTE LEGAL | PENDIENTE LEGAL | pendiente |
| `listings_v2` | Integridad del marketplace | retirar + anonimizar | PENDIENTE LEGAL | PENDIENTE LEGAL | solicitud válida / cierre listing | transacción/disputa asociada: PENDIENTE LEGAL | PENDIENTE LEGAL | pendiente |
| `demand_requests` | Solicitudes de compra | retirar + anonimizar | PENDIENTE LEGAL | PENDIENTE LEGAL | solicitud válida / expiración | PENDIENTE LEGAL | PENDIENTE LEGAL | pendiente |
| `transactions_v2` | Integridad transaccional y disputas | retener operacionalmente | PENDIENTE LEGAL | PENDIENTE LEGAL | finalización/cancelación/disputa | PENDIENTE LEGAL | PENDIENTE LEGAL | pendiente |
| `listing_reservation_locks` | Exclusión mutua temporal para impedir reservas dobles | retener sólo mientras sea necesario para integridad de operación; limpiar en estados terminales cuando proceda | PENDIENTE LEGAL | PENDIENTE LEGAL | creación/cierre de transacción asociada | disputa/transacción activa: PENDIENTE LEGAL | PENDIENTE LEGAL | pendiente |
| `offers` / `chats` | Evidencia de negociación | retener operacionalmente cuando corresponda | PENDIENTE LEGAL | PENDIENTE LEGAL | cierre transacción/chat | PENDIENTE LEGAL | PENDIENTE LEGAL | pendiente |
| `reviews` | Confianza del marketplace | retener operacionalmente | PENDIENTE LEGAL | PENDIENTE LEGAL | publicación/cierre cuenta | PENDIENTE LEGAL | PENDIENTE LEGAL | pendiente |
| `reports` | Seguridad, fraude y moderación | retener operacionalmente | PENDIENTE LEGAL | PENDIENTE LEGAL | cierre reporte/caso | PENDIENTE LEGAL | PENDIENTE LEGAL | pendiente |
| `audit_log` | Auditoría de acciones administrativas | retener | PENDIENTE LEGAL | PENDIENTE LEGAL | creación evento | PENDIENTE LEGAL | PENDIENTE LEGAL | pendiente |
| `account_deletion_requests` | Evidencia de cumplimiento | retener evidencia mínima | PENDIENTE LEGAL | PENDIENTE LEGAL | cierre solicitud | PENDIENTE LEGAL | PENDIENTE LEGAL | pendiente |

## Gate de producción

No convertir ningún `PENDIENTE LEGAL` en un valor inventado por ingeniería. Antes de producción, un responsable autorizado debe completar base legal, plazo, evento de cómputo, excepciones y responsable. El procesador staging actual permanece controlado y no constituye asesoría jurídica ni política productiva final.
