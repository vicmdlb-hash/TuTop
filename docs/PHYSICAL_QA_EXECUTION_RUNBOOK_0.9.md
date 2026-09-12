# TuTop 0.9 — Physical QA execution runbook

Estado: **PHYSICAL QA BLOCKED — NEW EXACT-HEAD CANDIDATE REQUIRED**.

El candidato Android histórico quedó obsoleto por runtime drift y se conserva sólo para trazabilidad. No debe instalarse para una nueva sesión de evidencia ni puede desbloquear release.

## Candidato actual

No existe una APK Physical QA vigente para el HEAD actual.

Antes de tocar un dispositivo físico debe existir un nuevo candidato generado por la cadena obligatoria:

1. `october-01-validation.yml` verde sobre el SHA exacto.
2. `staging-v2-smoke.yml` verde sobre el mismo SHA.
3. `android-debug-apk.yml` sobre ese mismo SHA.
4. APK, SHA-256, metadata completa y `PHYSICAL_QA_CANDIDATE.generated.json` verificables.
5. El workflow Android debe haber ejecutado `verify-generated-physical-qa-candidate.mjs` antes de publicar ese generated manifest.
6. Activar el generated manifest en el repo únicamente con el activador exact-head protegido.
7. Drift gate estricto verde para el nuevo candidato canónico.
8. Regenerar templates A/B/FCM/App Check desde ese candidato activo exact-head; todos los campos de evidencia deben permanecer `pending`, `false` o `null`.

No inventar artifact ID, run ID, SHA, tamaño, timestamp ni evidencia.

## Identidad exacta obligatoria

Antes de Physical QA deben coincidir simultáneamente:

- `gate_run_id` real de October;
- `gate_commit_sha`;
- `staging_smoke_run_id` real;
- `staging_smoke_commit_sha`;
- `build_run_id` Android;
- `build_commit_sha`;
- upload `artifact_id`;
- tree SHA del build;
- APK SHA-256 y tamaño.

Regla: **`gate_commit_sha === staging_smoke_commit_sha === build_commit_sha`**. Un run ID válido de otro SHA no autoriza candidato, aunque el APK exista.

## Generación exacta y activación

El workflow Android genera automáticamente `PHYSICAL_QA_CANDIDATE.generated.json` después de subir la APK. El archivo debe incluir datos reales del mismo build:

- upload `artifact_id` devuelto por GitHub;
- `build_run_id` y run number;
- `gate_run_id` + `gate_commit_sha`;
- `staging_smoke_run_id` + `staging_smoke_commit_sha`;
- `build_commit_sha`;
- tree SHA;
- SHA-256 y tamaño de APK;
- refs Git de todos los inputs empaquetados relevantes;
- estado de cutover reviews/Wallet/favorites.

`verify-generated-physical-qa-candidate.mjs` valida además que la metadata Android coincida campo por campo con el generated candidate y que los SHA de October, staging y build sean idénticos antes de publicarlo.

El generated manifest no cambia automáticamente `docs/PHYSICAL_QA_CANDIDATE_0.9.json`. La activación debe realizarse sobre el mismo checkout exacto:

```bash
TUTOP_ALLOW_PHYSICAL_QA_CANDIDATE_ACTIVATION=exact-head \
node scripts/activate-generated-physical-qa-candidate.mjs \
  PHYSICAL_QA_CANDIDATE.generated.json \
  docs/PHYSICAL_QA_CANDIDATE_0.9.json

node scripts/physical-qa-candidate-drift.mjs
```

El activador vuelve a ejecutar `verify-generated-physical-qa-candidate.mjs`; si gate SHA, staging SHA, build SHA, tree, metadata o refs no coinciden, falla cerrado. No ejecutar este activador automáticamente desde el workflow Android.

## Regeneración segura de templates

Los templates actualmente ligados al candidato histórico son sólo trazabilidad y no deben ejecutarse. Después de activar un nuevo candidato exact-head y confirmar drift estricto verde:

```bash
TUTOP_ALLOW_PHYSICAL_QA_TEMPLATE_REBIND=exact-head \
node scripts/rebind-physical-qa-templates.mjs
```

El rebinder toma únicamente el manifest canónico `active_exact_head`, exige identidad gate/staging/build válida y actualiza bindings de:

- `PHYSICAL_QA_DEVICE_A_0.9.json`;
- `PHYSICAL_QA_DEVICE_B_0.9.json`;
- `FCM_PHYSICAL_FIXTURE_TEMPLATE_0.9.json`;
- `APP_CHECK_PHYSICAL_EVIDENCE_TEMPLATE.json`.

Los bundles A/B quedan ligados también a `gate_run_id`, `gate_commit_sha`, `staging_smoke_run_id` y `staging_smoke_commit_sha`. Al rebind debe resetear toda evidencia: `physical=false`, casos `pending`, reportes `null`, eventos FCM vacíos, App Check no observado y `device_count=0`. Esto cambia bindings del candidato, no crea evidencia física.

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

Release permanece bloqueada salvo `pass=true` sin errores y candidato `active_exact_head` con identidad triple-SHA válida.

## Rollback / candidato obsoleto

El manifest histórico puede permanecer en el repositorio con:

- `physical_release_candidate=false`;
- `candidate_status=obsolete_runtime_drift`;
- `replacement_required=true`.

Ese estado permite que el gate **prebuild** genere un reemplazo cuando existe runtime drift reconocido, pero el drift checker estricto y los validadores de evidencia deben seguir rechazándolo como candidato actual.

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
