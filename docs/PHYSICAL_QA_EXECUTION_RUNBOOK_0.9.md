# TuTop 0.9 — Physical QA execution runbook

Estado: **READY FOR REAL DEVICE EXECUTION — NOT YET PHYSICALLY VALIDATED**.

Este runbook consolida la ejecución física de TuTop 0.9. No sustituye evidencia real, no autoriza producción y no permite convertir placeholders en PASS sin observar el caso en un dispositivo Android físico.

## Candidato exacto

Toda la sesión debe usar exclusivamente:

- APK: `TuTop-0.9.0-beta.0-physical-qa-staging-20`
- Artifact ID: `10002986519`
- Build run: `34078588228`
- Build commit: `43326a9633fd841f95b8ea8f61af5699cc2c9383`
- Build tree: `d1d90343806871479d1685783d1c1e5db1b5c341`
- APK SHA-256: `57005fd59b0026645c8b7fe02cbc36a3876e93ba287ae9c6cd2cc323a567e493`
- Firebase staging: `tutop-beta-vicmdlb-1356585881`

Si cambia cualquier input empaquetado del cliente o el drift gate deja de pasar, detener Physical QA y generar nuevo candidato antes de producir evidencia.

## Guardrails antes de tocar un dispositivo

- PR #6 debe seguir abierto/no fusionado y `main` debe permanecer como rollback estable.
- App Check debe permanecer `UNENFORCED`.
- No activar billing, Play Store, SMS ni Identity Platform.
- No usar cuentas humanas para account-erasure destructivo.
- No registrar password, OTP, `idToken`, `refreshToken`, token FCM, token App Check, notification ID crudo, teléfono ni hardware ID.
- Device A y Device B deben ser dispositivos/perfiles físicos distintos, con `evidence_session_id` distintos.
- Cada sesión debe durar como máximo 6 horas y la evidencia final debe tener menos de 24 horas.

## Archivos de trabajo

Crear copias privadas de los templates, nunca convertir los templates del repo en evidencia:

- `docs/PHYSICAL_QA_DEVICE_A_0.9.json`
- `docs/PHYSICAL_QA_DEVICE_B_0.9.json`
- `docs/FCM_PHYSICAL_FIXTURE_TEMPLATE_0.9.json` — una copia independiente por dispositivo.
- `docs/APP_CHECK_PHYSICAL_EVIDENCE_TEMPLATE.json` — completar sólo después de observar App Check en A y B.

Los templates originales deben continuar con `physical=false`, casos `pending` y placeholders.

## Secuencia obligatoria — ejecutar en A y B

### 1. Inicio de sesión de evidencia

1. Confirmar que se instaló APK20 exacta.
2. Generar un `evidence_session_id` nuevo y no reutilizable para el dispositivo.
3. Registrar `evidence_started_at` real ISO-8601.
4. Registrar marca, modelo, Android y viewport sin hardware IDs.
5. Marcar `device.physical=true` únicamente en la copia privada de evidencia real.

### 2. Install / boot / auth / identity

Validar y marcar PASS sólo si se observa:

- instalación/boot sin crash o pantalla técnica;
- autenticación real de staging;
- identidad institucional/campus correcta;
- cierre/reapertura conserva sesión e identidad cuando corresponde;
- reinstalación + nuevo login rehidrata institución/campus desde backend.

Casos: `install_boot`, `auth_identity`, `reinstall_identity`.

### 3. Marketplace crítico

Usar al menos dos cuentas reales de QA/staging y comprobar:

- publicar listing;
- favorito;
- chat;
- oferta/contraoferta;
- aceptación;
- reserva;
- intento competidor no crea segunda reserva activa;
- confirmación bilateral;
- `completed + sold_out` autoritativo;
- seller no puede comprarse su propio listing;
- listing vendido no acepta nueva oferta.

Cualquier falso éxito offline, duplicado o segunda reserva activa es FAIL/P0.

### 4. Keyboard / Back / lifecycle / safe areas / rotation

Validar:

- teclado no tapa CTA/campo activo;
- botón Atrás vuelve al contexto esperado y no cierra la app inesperadamente;
- background/foreground no duplica acciones ni pierde estado crítico;
- notch/status/navigation bar no obstruyen controles;
- rotación, cuando está disponible, no rompe formulario/navegación.

Casos: `keyboard`, `android_back`, `lifecycle`, `safe_areas`, `rotation`.

Capturas obligatorias por dispositivo:

- `keyboard`;
- `safe_areas`;
- `rotation`.

Cada captura requiere SHA-256 del archivo y `captured_at` dentro de la sesión. Ningún SHA puede repetirse dentro del bundle ni entre A/B.

### 5. Offline → reconnect

Ejecutar esta secuencia física:

1. Online: cargar feed y confirmar estado usable.
2. Desconectar Wi-Fi/datos.
3. Confirmar estado offline visible.
4. Intentar una acción de red y verificar que no muestre éxito falso.
5. Probar una intención offline permitida como favorito y cambiar la intención antes del reconnect.
6. Reconectar.
7. Confirmar intención final única, sin duplicados ni replay de estado intermedio.
8. Volver a offline, provocar retry diferido, reconectar y verificar que una intención nueva pueda sustituir trabajo stale/exhausted.
9. Confirmar pares `network_offline seq=N` → `network_online seq=N` en diagnóstico.

Caso: `offline_reconnect`.

FAIL si aparece cualquiera de: éxito falso, acción duplicada, intención final incorrecta, sesión fantasma o reconnect que exige reinstalar/reiniciar para recuperarse.

### 6. FCM físico por dispositivo

Crear una copia independiente del fixture FCM para A y otra para B. Deben compartir candidato APK, pero NO `evidence_session_id` ni correlaciones.

Ejecutar:

- `foreground`: `app_foreground` + `push_received`;
- `background`: `app_background` + `push_received` + `push_action`;
- `cold_start`: exactamente un `app_boot`, `push_received`, `push_action` con `launch=cold_start`;
- `deep_link`: `push_received` + `push_action` + `route_opened` posterior con misma correlación/destino.

Reglas fail-closed:

- `at_ms` relativo al inicio y dentro de la sesión;
- correlación sanitizada, nunca notification ID crudo;
- no duplicate receive/tap;
- no acción huérfana;
- no target mismatch;
- no acción antes de recepción;
- no reutilizar correlación entre escenarios;
- no reutilizar ninguna correlación entre Device A y Device B;
- payload inválido = FAIL.

Casos: `push_foreground`, `push_background`, `push_cold_start`, `push_deep_link`.

### 7. App Check / Play Integrity observado

En cada dispositivo:

1. Ejecutar diagnóstico con APK20 staging.
2. Confirmar únicamente que App Check fue observado.
3. Registrar `observed=true`, slot, misma sesión, timestamp real y SHA de APK candidata.
4. No copiar token.
5. Para el resumen A/B usar fingerprint sanitizado SHA-256 de perfil no basado en hardware ID crudo.

Caso: `app_check_token_observed`.

App Check continúa `UNENFORCED` incluso si A+B pasan.

### 8. Diagnóstico y cierre

En cada dispositivo:

`Perfil → Android Physical QA 0.9 → Ejecutar diagnóstico → Copiar reporte`

Antes de cerrar:

- `diagnostic_report.platform=android`;
- `native_runtime=true`;
- `generated_at` dentro de la sesión;
- eventos ordenados y dentro de la sesión;
- todos los `required_cases` obligatorios = `pass`;
- `evidence_completed_at` real posterior al inicio;
- no secretos ni identificadores sensibles.

## Validación automática final

Sobre copias privadas reales:

```bash
node scripts/fcm-physical-fixture-validator.mjs <fcm-a.json>
node scripts/fcm-physical-fixture-validator.mjs <fcm-b.json>
node --experimental-strip-types scripts/physical-qa-two-device-gate.mjs <device-a.json> <device-b.json> --json
```

Release sigue bloqueada salvo que el gate combinado devuelva `pass=true` sin errores.

## Qué NO desbloquea este runbook

Aunque A+B den PASS, este documento por sí solo NO autoriza:

- merge de PR #6;
- producción;
- publicación Play Store;
- billing;
- SMS/Identity Platform;
- App Check enforcement;
- afirmar alianzas universitarias.

## Externos que permanecen separados de Physical QA

### Recovery

Estado: `provider=disabled`.

Orden de evaluación: verified email → recovery codes secundarios → SMS sólo tras decisión explícita de coste/privacidad/billing/SIM-swap. No simular canal real.

### Legal retention

Estado: `PENDIENTE REVISIÓN LEGAL`.

No inventar jurisdicción, base legal, plazo, evento inicial, excepción ni aprobador. Ingeniería sólo entrega dossier técnico.

### OIDC/WIF

Estado: `PREPARED, NOT MIGRATED`.

`FIREBASE_TOKEN` permanece fallback hasta paridad cloud real sobre mismo HEAD/gates, observando emisión/expiración/renovación de credencial temporal sin registrar secretos.

### Trusted cron

Estado: `NO APLICAR AHORA`.

El schedule no está activo automáticamente mientras el workflow no exista en la default branch. Su futura activación debe ser PR de infraestructura aislado y autorizado.

## Criterio de cierre de sesión Physical QA

Sólo declarar la sesión completa cuando:

- Device A PASS;
- Device B PASS;
- gate combinado PASS;
- evidencia ligada a APK20 exacta;
- screenshots A/B independientes;
- FCM A/B independiente;
- App Check observado en A+B sin tokens;
- 0 required cases en WARN/FAIL/PENDING/NOT_APPLICABLE;
- 0 P0 abierto.

Hasta entonces el estado correcto es: **PHYSICAL QA PENDING / RELEASE BLOCKED**.
