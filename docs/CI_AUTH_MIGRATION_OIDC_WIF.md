# TuTop CI auth — migración segura a OIDC/WIF/ADC

Estado actual: `FIREBASE_TOKEN` sigue operativo como fallback. **No retirarlo** hasta que un flujo short-lived haya pasado los mismos gates de staging varias veces.

## Objetivo

Sustituir gradualmente la credencial refresh-token de Firebase CLI por credenciales de corta duración emitidas mediante OIDC/Workload Identity Federation, sin introducir archivos JSON persistentes ni romper staging.

## Orden de migración

1. Crear en Google Cloud un Workload Identity Pool/Provider restringido al repositorio y rama autorizados.
2. Asociar una service account con el mínimo IAM necesario para Firestore/Auth/App Check staging.
3. Configurar GitHub OIDC (`id-token: write`) y acción de autenticación para obtener access token temporal.
4. Entregar ese token al código existente mediante `TUTOP_FIREBASE_ACCESS_TOKEN`.
5. Ejecutar en paralelo los mismos gates actuales: Rules deploy, catálogo, smoke E2E, account-erasure sintético y App Check UNENFORCED.
6. Repetir varias ejecuciones exitosas y verificar expiración/renovación.
7. Sólo entonces retirar `FIREBASE_TOKEN` del workflow; conservar rollback documentado durante la transición.

## Reglas

- Nunca versionar service-account JSON, claves privadas, refresh tokens o access tokens.
- `scripts/firebase-ci-auth.mjs` ya prioriza `TUTOP_FIREBASE_ACCESS_TOKEN` sobre `FIREBASE_TOKEN`.
- `scripts/ci-auth-readiness.mjs` distingue estado actual, short-lived listo y credenciales WIF presentes pero todavía no cableadas.
- La migración no autoriza producción ni amplía permisos.
- El proyecto histórico `tutop-3a4f7` continúa bloqueado para V2.

## Gate de aceptación

OIDC/WIF se considera validado sólo cuando el mismo HEAD pasa sin `FIREBASE_TOKEN`:

- Quality/Rules;
- deploy Firestore staging;
- catálogo 31/31;
- marketplace E2E de dos usuarios;
- erasure destructivo sobre cuenta sintética;
- trusted maintenance;
- App Check `UNENFORCED`.

Hasta entonces el estado es **PREPARED, NOT MIGRATED**.
