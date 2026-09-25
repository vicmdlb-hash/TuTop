# TuTop 0.9 — Matriz técnica de retención y eliminación

> Estado: **borrador técnico para revisión legal/privacidad**. No sustituye asesoría jurídica ni autoriza producción.


## Snapshot técnico de ingeniería — Build121 exacto

Este snapshot identifica la evidencia que ingeniería entrega para revisión; **no constituye aprobación legal, Data Safety final, autorización de Play ni release**.

- app: `0.9.2-beta.11` / Android versionCode `90215`
- package: `mx.tutop.app`
- source SHA del APK: `579bdecd7e193b8661276f114b9d3e097792d8d6`
- artifact ID: `10835643904`
- artifact digest: `sha256:ebd4629a9d1d5c693eb635227c0d94ed2246c2bcf87a891b46cb8c2d317c54f9`
- APK SHA-256: `acd939e5aa4d078270b2fb485e9a41741638e4501cd3c3167871c9ca7bc6f6b8`
- signing cert SHA-256: `192B19F3E67ED7B69FA6862429E232B892979A6C8C97800845F6A1D1948FF79A`
- staging project: `tutop-beta-vicmdlb-1356585881`
- physical state: Device A/B, real Topi, real FCM and physical App Check siguen pendientes; este snapshot no es release candidate.
- Topi remote redaction probada por ingeniería: email, teléfono, OTP y patrones de token; **no** se afirma redacción genérica de domicilios/direcciones.
- superficies técnicas existentes: borrador `public/privacy.html`, recurso `public/delete-account.html`, matriz de borrado/retención y dossier legal.

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
