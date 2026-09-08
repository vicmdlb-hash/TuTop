# TuTop 0.9 — V2 Cost Cutover Runbook

Estado: **PREPARADO / DESACTIVADO POR DEFECTO**.

Este runbook cubre únicamente staging/Physical QA. No autoriza producción, billing, Play Store ni merge a `main`.

## Flags

```env
VITE_TUTOP_V2_REVIEWS_LAZY_CUTOVER=false
VITE_TUTOP_V2_WALLET_LAZY_CUTOVER=false
```

Los flags sólo aceptan `true` cuando:

- `VITE_TUTOP_SCHEMA_V2=true`
- `VITE_TUTOP_ENVIRONMENT=staging`

Fuera de staging, un `true` falla cerrado.

## Qué cambia

### Reviews lazy

Con `VITE_TUTOP_V2_REVIEWS_LAZY_CUTOVER=true`:

- se eliminan del snapshot V2 las dos queries de reviews de hasta 100 documentos cada una;
- `reviews/{chatId}_{uid}` resuelve de forma puntual si el usuario ya calificó un chat;
- el submit de review no recarga el snapshot global;
- `reviewStrikeCountBackend` calcula strikes exactos de 30 días con `COUNT()`;
- la reputación pública y propia usa `/reputation/{uid}` trusted.

Prerequisito adicional: índice Firestore `reviews(evaluado_id, calificacion, fecha)` desplegado y validado.

### Wallet lazy

Con `VITE_TUTOP_V2_WALLET_LAZY_CUTOVER=true`:

- el snapshot V2 deja de cargar hasta 100 `wallet_transactions`;
- Wallet carga 12 movimientos al abrirse, con máximo 24 por petición del loader;
- saldo y prestigio siguen viniendo de `wallets/{uid}` y no dependen del historial.

## Orden obligatorio de promoción

1. Ejecutar `october-01-validation.yml` manualmente sobre el HEAD exacto.
2. Debe terminar verde: `npm run check`, readiness, typecheck, build y Firestore Emulator.
3. Ejecutar `staging-v2-smoke.yml` manualmente sobre el mismo SHA.
4. El smoke real despliega Rules/índices actuales a staging y ejecuta la validación real disponible.
5. Sólo entonces ejecutar `android-debug-apk.yml` sobre ese mismo SHA.
6. La build V2 verifica por GitHub API que existen runs exitosos de los pasos 1 y 3 sobre `GITHUB_SHA`.
7. Los inputs de cutover del workflow Android permanecen `false` por defecto; activar sólo los que hayan pasado el gate.
8. Registrar APK, SHA-256 y metadata del build.
9. Ejecutar Physical QA A+B antes de cualquier promoción adicional.

## Metadata obligatoria de APK V2

Cada candidate genera `TuTop-0.9.0-beta.0-physical-qa-staging.metadata.txt` con:

- `head_sha`
- `gate_run_id`
- `staging_smoke_run_id`
- `firebase_project`
- `version`
- `version_code`
- `reviews_lazy_cutover`
- `wallet_lazy_cutover`

La misma metadata se adjunta al prerelease junto con APK y SHA-256.

## Rollback

Rollback de costo no requiere migración destructiva:

```env
VITE_TUTOP_V2_REVIEWS_LAZY_CUTOVER=false
VITE_TUTOP_V2_WALLET_LAZY_CUTOVER=false
```

Una nueva build staging con ambos flags `false` vuelve a usar las queries legacy del snapshot. No borrar índices, reviews, wallet transactions ni datos trusted como parte del rollback.

## Presupuesto raíz esperado

Techo directo actual del snapshot V2: **565 documentos** antes de sublecturas de chat e hidratación canónica.

- reviews lazy activo: objetivo de techo raíz **365**;
- reviews + Wallet lazy activos: objetivo de techo raíz **265**.

Son techos estáticos de diseño, no métricas de facturación ni garantía de ahorro real. Las sublecturas de chats, identidad y listings canónicos se miden por separado.
