# TuTop 0.9 — Physical QA execution runbook

Estado: **PHYSICAL QA BLOCKED — NEW EXACT-HEAD CANDIDATE REQUIRED**.

El candidato Android histórico quedó obsoleto por runtime drift y se conserva sólo para trazabilidad. No debe instalarse para una nueva sesión de evidencia ni puede desbloquear release.

## Candidato actual

No existe una APK Physical QA vigente para el HEAD actual.

Antes de tocar un dispositivo físico debe existir un nuevo candidato generado por la cadena obligatoria:

1. `october-01-validation.yml` verde sobre el SHA exacto.
2. `staging-v2-smoke.yml` verde sobre el mismo SHA.
3. `android-debug-apk.yml` sobre ese mismo SHA.
4. APK, SHA-256 y metadata de build verificables.
5. `docs/PHYSICAL_QA_CANDIDATE_0.9.json` actualizado únicamente con datos reales del nuevo build y `physical_release_candidate=true`.
6. Drift gate estricto verde para ese nuevo candidato.

No inventar artifact ID, run ID, SHA, tamaño, timestamp ni evidencia.

## Guardrails

- PR #6 debe seguir abierto/no fusionado y `main` debe permanecer intacto.
- Firebase: staging únicamente.
- App Check permanece `UNENFORCED`.
- No billing, Play Store, SMS, Identity Platform ni producción.
- No registrar password, OTP, ID token, refresh token, token FCM, token App Check, teléfono ni hardware ID crudo.
- Device A y Device B deben ser dispositivos/perfiles físicos distintos y usar `evidence_session_id` distintos.
- Evidencia final: menos de 24 h; cada sesión: máximo 6 h.

## Secuencia A+B

Ejecutar el mismo candidato exacto en Device A y Device B y validar:

- instalación y boot sin crash;
- autenticación staging e identidad universitaria/campus;
- publicación, favorito, chat, oferta/contraoferta, aceptación y reserva;
- bloqueo de doble reserva y self-offer;
- confirmación bilateral y cierre canónico de listing;
- keyboard, Android Back, lifecycle, safe areas y rotation;
- offline → reconnect sin falso éxito, duplicado ni replay stale;
- FCM foreground/background/cold-start/deep-link;
- App Check observado sin guardar token;
- diagnóstico Android nativo y fresco.

Casos obligatorios:

`install_boot`, `auth_identity`, `reinstall_identity`, `keyboard`, `android_back`, `lifecycle`, `safe_areas`, `rotation`, `offline_reconnect`, `push_foreground`, `push_background`, `push_cold_start`, `push_deep_link`, `app_check_token_observed`.

Todos deben quedar `pass`; `warn`, `pending` o `not_applicable` mantienen release bloqueada.

## Evidencia visual

Cada dispositivo requiere capturas independientes para:

- `keyboard`;
- `safe_areas`;
- `rotation`.

Registrar SHA-256 y `captured_at` dentro de la sesión. No reutilizar hashes entre Device A y B.

## FCM

Usar fixture independiente por dispositivo. No reutilizar correlaciones entre escenarios ni entre dispositivos.

Validar:

- foreground;
- background;
- cold start;
- deep link.

Payload inválido, duplicate receive/tap, target mismatch, acción huérfana o correlación reutilizada = FAIL.

## App Check

Registrar únicamente que fue observado en ambos dispositivos. Nunca copiar el token. App Check continúa `UNENFORCED` aunque A+B pasen.

## Validación automática final

Sobre copias privadas de evidencia real:

```bash
node scripts/fcm-physical-fixture-validator.mjs <fcm-a.json>
node scripts/fcm-physical-fixture-validator.mjs <fcm-b.json>
node --experimental-strip-types scripts/physical-qa-two-device-gate.mjs <device-a.json> <device-b.json> --json
```

Release permanece bloqueada salvo `pass=true` sin errores.

## Rollback / candidato obsoleto

El manifest histórico puede permanecer en el repositorio con:

- `physical_release_candidate=false`;
- `candidate_status=obsolete_runtime_drift`;
- `replacement_required=true`.

Ese estado permite que el gate **prebuild** genere un reemplazo, pero el drift checker estricto y los validadores de evidencia deben seguir rechazándolo como candidato actual.

## Lo que Physical QA no autoriza

Incluso con A+B verdes, esta prueba por sí sola no autoriza:

- merge de PR #6;
- producción;
- Play Store;
- billing;
- SMS/Identity Platform;
- App Check enforcement;
- alianzas universitarias.

Recovery sigue `provider=disabled`; Android Keystore/AES-GCM real sigue pendiente; revisión legal de retención sigue pendiente.
