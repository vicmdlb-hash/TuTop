# TuTop 0.9 — PR #6 rollback / integration checklist

PR #6 permanece en release freeze. Este documento no autoriza merge.

## Pre-integración

- [ ] Physical QA APK 20 completa en dos dispositivos Android distintos.
- [ ] Offline/reconnect sin duplicados ni pérdida de intención.
- [ ] FCM foreground/background/cold-start/deep-link con evidencia correlacionada.
- [ ] App Check observado en dos dispositivos y todavía UNENFORCED.
- [ ] Recovery real y retención legal siguen explícitamente separados del cierre técnico si continúan pendientes.
- [ ] Quality + Emulator, staging smoke y trusted maintenance verdes sobre el HEAD que se vaya a integrar.

## Rollback por dominio

| Dominio | Señal de rollback | Acción segura |
|---|---|---|
| Auth/session | ghost session, identidad cruzada, refresh loop | revertir sólo hardening de sesión al último commit verde; invalidar APK candidata |
| Marketplace | doble reserva, operación inconsistente | detener beta, conservar evidencia, volver al último checkpoint con reservation-lock tests verdes |
| Firestore Rules | permiso excesivo o flujo legítimo bloqueado | redeploy del ruleset staging previamente certificado; no tocar producción |
| Notifications | ruta errónea/duplicados | desactivar opt-in de pruebas y volver al router previamente certificado |
| Offline | replay/duplicados | deshabilitar replay afectado y conservar cola fail-closed |
| Erasure | borrado de evidencia que debía retenerse | detener apply, usar dry-run, no procesar cuentas humanas |
| Trusted maintenance | residue audit falla | detener writes trusted y resolver residuos antes de reanudar |
| App Check | dispositivos legítimos sin token | mantener UNENFORCED |
| CI auth | WIF pierde paridad | conservar/restaurar fallback `FIREBASE_TOKEN` sin exponer su valor |

## Regla de APK

Cualquier cambio en inputs empaquetados detectado por `physical-qa-candidate-drift.mjs` invalida APK 20. Contratos, tests y documentación pueden avanzar sin APK nueva únicamente cuando el drift gate confirma runtime idéntico.

## Prohibiciones de integración

No mezclar en el mismo merge: activación de cron en default branch, sustitución de auth CI, App Check enforcement, billing, Play Store, SMS/Identity Platform o producción.
