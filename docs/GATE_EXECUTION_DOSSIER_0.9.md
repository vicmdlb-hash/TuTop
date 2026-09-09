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
7. Firestore Emulator completo, incluyendo:
   - Rules/atomicidad base;
   - transaction locks;
   - seller-second y buyer-second completion;
   - unread COUNT;
   - review strike COUNT;
   - favorites membership;
   - account/governance/notification contracts.

### Si October falla

**STOP. No ejecutar staging, Android ni otro workflow para “ver si pasa”.**

Acción:

1. identificar el primer error causal;
2. corregir sólo ese P0/P1/integración/gate;
3. revalidar que el HEAD cambió;
4. considerar inválida para promoción toda evidencia del SHA anterior;
5. volver a ejecutar October sobre el nuevo SHA.

No gastar runners paralelos para diagnosticar la misma falla salvo que el log de October no permita aislarla.

## Paso 2 — Staging same-SHA

Workflow: `.github/workflows/staging-v2-smoke.yml`.

Sólo puede comenzar si GitHub encuentra `october-01-validation.yml` exitoso sobre **el mismo `GITHUB_SHA`**.

Staging puede entonces:

- desplegar Rules e índices V2 al proyecto staging;
- verificar/sembrar catálogo canónico sin overwrite;
- preparar Auth base y configs staging;
- ejecutar smoke real de dos usuarios;
- ejecutar borrado de cuenta controlado;
- mantener App Check `UNENFORCED`.

### Si staging falla

**STOP. No construir APK.**

Si la reparación cambia código/config versionado, el SHA cambia y la ronda vuelve a October.

Si la causa es exclusivamente configuración externa no versionada, corregir esa configuración sin afirmar que el runtime quedó validado hasta repetir el smoke exitoso sobre el mismo SHA.

## Paso 3 — Selección de cutovers para Android

La primera APK Physical QA debe favorecer aislamiento de riesgo.

Orden recomendado:

1. APK baseline con reviews=false, Wallet=false, favorites=false;
2. sólo después de baseline Android verde, probar cutovers en staging de forma incremental;
3. no declarar `565→365→265→65` como ahorro activo hasta observar el comportamiento real correspondiente.

October compila los tres flags en `true` para detectar incompatibilidades de código, pero eso **no obliga** a activarlos todos en la primera APK.

## Paso 4 — Android exact-SHA

Workflow: `.github/workflows/android-debug-apk.yml` en rama V2.

Debe verificar automáticamente:

- October exitoso same-SHA;
- staging smoke exitoso same-SHA;
- staging-only Firebase config;
- typecheck/gates antes de build;
- APK existente y no vacía;
- SHA-256;
- metadata con SHA, gate run ID, staging run ID y 3 cutovers;
- `PHYSICAL_QA_CANDIDATE.generated.json`;
- verificación generated candidate ↔ checkout ↔ metadata.

Ninguna APK de otro SHA puede heredarse como candidata.

## Paso 5 — Activación del candidato

El workflow Android **no** activa el manifest canónico automáticamente.

Sobre el checkout exacto del build:

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

Esto sólo cambia bindings. Debe dejar toda evidencia en `pending`, `false` o `null`.

## Paso 7 — Physical QA A+B

Ejecutar el mismo APK exacto en dos dispositivos/perfiles físicos independientes.

Obligatorio validar:

- install/boot;
- auth/identity;
- publicación/feed/favorite/chat;
- oferta/contraoferta/reserva;
- seller-second y buyer-second completion;
- cancel/expire/dispute y rutas aplicables;
- offline/reconnect;
- keyboard/back/lifecycle/safe areas/rotation;
- FCM foreground/background/cold-start/deep-link;
- App Check observado sin guardar token.

`warn`, `pending` o `not_applicable` mantienen release bloqueada.

## Workflows secundarios durante el freeze

### Diagnóstico opcional, manual-only

- `quality.yml`
- `firestore-v2-security.yml`
- `ci-auth-parallel-validation.yml`

No son autoridad de promoción y no deben ejecutarse por rutina si October ya cubre la señal necesaria.

### Mutación staging controlada

`v2-trusted-maintenance.yml` sólo puede mutar staging después de October green sobre el mismo SHA. No sustituye staging smoke ni autoriza APK.

### Cuarentena — no editar / no ejecutar

- `one-shot-085-hardened.yml`
- `provision-firebase-staging-v2.yml`

Ambos conservan triggers históricos sobre cambios a su propio archivo. Durante el outage/freeze, editarlos puede gastar un runner automáticamente. No forman parte de la cadena de promoción 0.9.

## Política de minutos

- Un failure causal por runner.
- Reparar antes de reintentar.
- No lanzar Quality + Firestore + October en paralelo para obtener la misma señal.
- No construir Android si staging no está green same-SHA.
- No ejecutar trusted maintenance como “prueba”.
- No generar APK sólo para ver si compila: October + staging son prerequisitos.

## Criterio de salida del freeze

`runtime_validated` puede considerarse listo para cambiar únicamente cuando exista evidencia real del mismo SHA de:

- October green;
- staging green;
- Android build green;
- APK/candidate exactos;
- Physical QA A+B green.

Hasta entonces el estado correcto sigue siendo **RUNTIME FREEZE CANDIDATE / NOT VALIDATED**.
