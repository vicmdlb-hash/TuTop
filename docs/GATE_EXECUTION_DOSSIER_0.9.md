# TuTop 0.9 — Gate Execution Dossier

Estado: **RUNTIME FREEZE CANDIDATE / NOT VALIDATED**.

Este documento define cómo usar los próximos minutos de GitHub Actions sin romper la cadena exact-SHA ni repetir runners innecesariamente.

## Regla cero

El SHA que se despacha en October se convierte en el único candidato de esa ronda.

Si cualquier reparación cambia el HEAD, **toda evidencia anterior deja de autorizar promoción del nuevo HEAD**. Se vuelve a empezar desde October sobre el SHA nuevo.

No fusionar `main`, no producción, no Play Store, no billing, no SMS/Identity Platform y no App Check enforcement.

## Antes del primer runner

Confirmar:

- PR #6 abierto y no fusionado;
- rama `feat/tutop-0.8-p0`;
- working HEAD definitivo de la ronda;
- feature freeze vigente;
- `runtime_validated=false`;
- no candidato Physical QA vigente;
- reviews/Wallet/favorites cutovers `false` por defecto;
- no editar ni ejecutar `one-shot-085-hardened.yml` ni `provision-firebase-staging-v2.yml`;
- no disparar Quality/Firestore/CI-auth por rutina: son diagnósticos opcionales, no prerequisitos de promoción.

## Paso 1 — October consolidated gate

Workflow: `.github/workflows/october-01-validation.yml`.

Debe ejecutarse una sola vez sobre el HEAD seleccionado y demostrar en el mismo runner:

1. `npm ci`;
2. `npm run check`;
3. GitHub/beta/V2 staging readiness;
4. typecheck;
5. web build con reviews + Wallet + favorites cutovers compilados en `true`;
6. `v2:rules:prepare`;
7. Firestore Emulator completo, incluyendo transaction locks, completion bilateral, unread COUNT, review strike COUNT, favorites membership y contracts de account/governance/notifications.

### Si October falla

**STOP. No ejecutar staging, Android ni otro workflow para “ver si pasa”.**

Identificar el primer error causal, corregir únicamente el P0/P1/integración/gate, asumir que el SHA cambió y volver a empezar desde October. No gastar runners paralelos para diagnosticar la misma falla salvo que el log no permita aislarla.

## Paso 2 — Staging same-SHA

Workflow: `.github/workflows/staging-v2-smoke.yml`.

Sólo puede comenzar si existe `october-01-validation.yml` exitoso sobre **el mismo `GITHUB_SHA`**. Staging puede entonces desplegar Rules/índices V2, verificar catálogo, preparar Auth/configs, ejecutar smoke real de dos usuarios, borrado de cuenta controlado y mantener App Check `UNENFORCED`.

### Si staging falla

**STOP. No construir APK.** Si la reparación cambia código/config versionado, el SHA cambia y la ronda vuelve a October. Si la causa es configuración externa no versionada, corregirla y repetir staging sobre el mismo SHA antes de continuar.

## Paso 3 — Selección de cutovers para Android

La primera APK Physical QA debe aislar riesgo:

1. baseline reviews=false, Wallet=false, favorites=false;
2. después de baseline Android verde, probar cutovers incrementalmente;
3. no declarar `565→365→265→65` como ahorro activo hasta observarlo realmente.

October compila los tres flags en `true` para detectar incompatibilidades, pero eso no obliga a activarlos en la primera APK.

## Paso 4 — Android exact-SHA

Workflow: `.github/workflows/android-debug-apk.yml`.

Debe verificar October same-SHA + staging same-SHA, config staging-only, gates/typecheck, APK no vacía, SHA-256, metadata con IDs de gate/staging y los 3 cutovers, generated candidate y verificación checkout ↔ metadata ↔ candidate.

## Paso 5 — Activación del candidato

```bash
TUTOP_ALLOW_PHYSICAL_QA_CANDIDATE_ACTIVATION=exact-head \
node scripts/activate-generated-physical-qa-candidate.mjs \
  PHYSICAL_QA_CANDIDATE.generated.json \
  docs/PHYSICAL_QA_CANDIDATE_0.9.json

node scripts/physical-qa-candidate-drift.mjs
```

Sólo continuar si el drift estricto pasa.

## Paso 6 — Rebind de templates

```bash
TUTOP_ALLOW_PHYSICAL_QA_TEMPLATE_REBIND=exact-head \
node scripts/rebind-physical-qa-templates.mjs
```

Esto sólo cambia bindings y debe dejar toda evidencia en `pending`, `false` o `null`.

## Paso 7 — Physical QA A+B

Usar el mismo APK exacto en dos dispositivos/perfiles físicos independientes y validar install/boot, auth/identity, publicación/feed/favorite/chat, oferta/contraoferta/reserva, seller-second y buyer-second completion, terminal states, offline/reconnect, keyboard/back/lifecycle/safe areas/rotation, FCM y App Check observado sin guardar token. `warn`, `pending` o `not_applicable` mantienen release bloqueada.

## Workflows secundarios durante el freeze

### Diagnóstico opcional, manual-only

- `quality.yml`
- `firestore-v2-security.yml`
- `ci-auth-parallel-validation.yml`

No son autoridad de promoción y no deben ejecutarse por rutina si October ya cubre la señal necesaria.

### Mutación staging controlada

Trusted maintenance sólo puede mutar staging después de **October + staging green sobre el mismo SHA**. `v2-trusted-maintenance.yml` verifica ambos runs antes de cualquier `--apply`. No sustituye staging smoke ni autoriza APK.

### Cuarentena — no editar / no ejecutar

- `one-shot-085-hardened.yml`
- `provision-firebase-staging-v2.yml`

Ambos conservan triggers históricos sobre cambios a su propio archivo. Durante el outage/freeze, editarlos puede gastar un runner automáticamente. No forman parte de la cadena de promoción 0.9.

## Política de minutos

- Un failure causal por runner.
- Reparar antes de reintentar.
- No lanzar Quality + Firestore + October en paralelo para la misma señal.
- No construir Android si staging no está green same-SHA.
- No ejecutar trusted maintenance como prueba.
- No generar APK sólo para ver si compila.

## Criterio de salida del freeze

`runtime_validated` sólo puede cambiar cuando exista evidencia real del mismo SHA de October green, staging green, Android green, APK/candidate exactos y Physical QA A+B green.

Hasta entonces: **RUNTIME FREEZE CANDIDATE / NOT VALIDATED**.
