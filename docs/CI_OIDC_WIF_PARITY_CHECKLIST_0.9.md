# TuTop 0.9 — checklist de paridad OIDC/WIF

Estado: **PREPARED, NOT MIGRATED**. `FIREBASE_TOKEN` permanece como fallback funcional y no debe retirarse en este checkpoint.

## Paridad requerida

| Gate | Fallback actual | OIDC/WIF shadow | Criterio para declarar paridad |
|---|---|---|---|
| Firestore Rules staging | operativo | pendiente de intercambio real | mismo HEAD y mismo ruleset desplegado |
| Catálogo canónico | operativo | pendiente | validación completa sin overwrite |
| Marketplace E2E dos usuarios | operativo | pendiente | mismo smoke PASS |
| Account erasure sintético | operativo | pendiente | mismo apply gate y Auth delete last |
| Trusted maintenance | operativo | pendiente | reconciliation + residue audit PASS |
| App Check | monitoring only | pendiente | debe continuar UNENFORCED |

## Secuencia reversible

1. Mantener `FIREBASE_TOKEN` intacto.
2. Configurar WIF externo con repo/rama/entorno restringidos y mínimo IAM.
3. Obtener credencial temporal mediante OIDC sin persistir claves JSON.
4. Alimentar exclusivamente `TUTOP_FIREBASE_ACCESS_TOKEN` en una ejecución shadow/manual.
5. Ejecutar todos los gates de la tabla sobre el mismo HEAD.
6. Repetir paridad suficiente para observar expiración/renovación sin fallos.
7. Sólo con autorización explícita, retirar el fallback en un PR aislado y reversible.

## Fail closed

- Falta metadata externa: estado `BLOCKED_EXTERNAL_SETUP`, no simular éxito.
- Token temporal no intercambiado: estado `OIDC_ASSERTION_ONLY`, no declarar migración.
- Cualquier diferencia de permisos/gates: conservar fallback y detener migración.
- Nunca imprimir assertion, access token, refresh token o credenciales de service account.
