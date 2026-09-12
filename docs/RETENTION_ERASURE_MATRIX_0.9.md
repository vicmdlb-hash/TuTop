# TuTop 0.9 — Matriz técnica de retención y eliminación

> Estado: **borrador técnico para revisión legal/privacidad**. No sustituye asesoría jurídica ni autoriza producción.

| Colección | Finalidad técnica | Acción al eliminar cuenta | Motivo técnico | Plazo productivo final |
|---|---|---|---|---|
| `users` | Perfil principal | Eliminar | Retirar identidad activa | PENDIENTE LEGAL |
| `user_private` | PII privada | Eliminar | Dato personal directo | PENDIENTE LEGAL |
| `notification_preferences` | Preferencias | Eliminar | Ya no necesarias | PENDIENTE LEGAL |
| `device_tokens` | Push | Eliminar | Revocar dispositivo | Inmediato técnico |
| `notification_receipts` | Estado leído/no leído | Eliminar | Preferencia personal | PENDIENTE LEGAL |
| `favorites` | Favoritos | Eliminar | Preferencia personal | PENDIENTE LEGAL |
| `saved_searches` | Búsquedas guardadas | Eliminar | Preferencia personal | PENDIENTE LEGAL |
| `wallets` | UCoins beta | Eliminar | No son dinero ni saldo retirable | PENDIENTE LEGAL |
| `wallet_transactions` | Ledger UCoins beta | Eliminar | Sin valor monetario | PENDIENTE LEGAL |
| `verificationRequests` | Evidencia privada de verificación | Eliminar | PII sensible operacional | PENDIENTE LEGAL |
| `publicVerifications` | Badge público | Eliminar | Cuenta deja de existir | PENDIENTE LEGAL |
| `reputation` | Agregado de reputación | Eliminar | Perfil agregado de cuenta | PENDIENTE LEGAL |
| `moderationStatus` | Estado de moderación | Eliminar | Cuenta inactiva | PENDIENTE LEGAL |
| `listings_v2` | Publicaciones | Retirar/anonimizar | Conservar referencias de operaciones | PENDIENTE LEGAL |
| `demand_requests` | Solicitudes Busco | Retirar/anonimizar | Evitar contenido activo huérfano | PENDIENTE LEGAL |
| `account_deletion_requests` | Evidencia de cumplimiento | Retener operacionalmente | Auditoría del proceso de borrado | PENDIENTE LEGAL |
| `transactions_v2` | Operaciones marketplace | Retener operacionalmente | Disputas, fraude, integridad | PENDIENTE LEGAL |
| `listing_reservation_locks` | Exclusión mutua de reserva por listing | Retener mientras la operación asociada siga activa/disputada; limpiar al terminar cuando proceda | Evita reservas dobles y preserva integridad transaccional | PENDIENTE LEGAL |
| `offers` | Negociación | Retener operacionalmente | Evidencia de operación | PENDIENTE LEGAL |
| `chats` | Conversación transaccional | Retener operacionalmente | Puede contener evidencia de disputa | PENDIENTE LEGAL |
| `reviews` | Reputación post-operación | Retener operacionalmente | Evidencia de transacción/confianza | PENDIENTE LEGAL |
| `reports` | Seguridad/moderación | Retener operacionalmente | Fraude, seguridad y enforcement | PENDIENTE LEGAL |
| `audit_log` | Auditoría administrativa | Retener operacionalmente | Trazabilidad de acciones trusted | PENDIENTE LEGAL |

## Reglas de salida

- Ningún plazo `PENDIENTE LEGAL` puede convertirse en política pública sin revisión humana especializada.
- El procesador staging puede validar **qué** se elimina/retira/retiene, pero no decide por sí solo **cuánto tiempo** debe conservarse evidencia operacional en producción.
- `listing_reservation_locks` es un artefacto de integridad, no una nueva fuente de identidad: debe mantenerse alineado con su `transactions_v2` asociada y limpiarse al llegar a estados terminales cuando sea seguro hacerlo.
- Nunca almacenar tokens App Check, claves, OTP o contraseñas como evidencia de cumplimiento.
- Toda automatización productiva futura deberá ser idempotente, auditable y capaz de generar un reporte de residuos por UID.
