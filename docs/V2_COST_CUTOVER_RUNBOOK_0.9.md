# TuTop 0.9 — V2 Cost Cutover Runbook

Estado: **PREPARADO / DESACTIVADO POR DEFECTO**.

Este runbook cubre únicamente staging/Physical QA. No autoriza producción, billing, Play Store ni merge a `main`.

## Flags

```env
VITE_TUTOP_V2_REVIEWS_LAZY_CUTOVER=false
VITE_TUTOP_V2_WALLET_LAZY_CUTOVER=false
VITE_TUTOP_V2_FAVORITES_VISIBLE_CUTOVER=false
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

### Favorites visible

Con `VITE_TUTOP_V2_FAVORITES_VISIBLE_CUTOVER=true`:

- el snapshot V2 deja de cargar la query global de hasta 200 favoritos del usuario;
- sólo se resuelve membership para los listings V2 actualmente hidratados;
- el alcance visible queda limitado a 120 IDs, consistente con cuatro scopes de 30 listings;
- Firestore usa `uid == auth.uid` + `product_id IN [...]` en lotes de máximo 30 IDs;
- App Check se reenvía cuando está disponible;
- cache de membership: 30 s;
- toggle optimista, rollback y hydration comparten versión por producto para impedir que una lectura vieja restaure un corazón anterior.

Prerequisitos adicionales:

- índice Firestore `favorites(uid, product_id)` declarado, desplegado y validado;
- fixture `tests/firestore.v2.favorite-membership.test.mjs` verde en Emulator;
- el fixture debe comprobar subset exacto, ausencia de falsos favoritos y rechazo de consultas de otro usuario o sin filtro de ownership.

## Orden obligatorio de promoción

1. Ejecutar `october-01-validation.yml` manualmente sobre el HEAD exacto.
2. Debe terminar verde: `npm run check`, readiness, typecheck, build y Firestore Emulator.
3. El gate compila los tres cutovers en `true` para demostrar que las rutas alternativas compilan, pero eso no activa por sí solo una APK distribuible.
4. Ejecutar `staging-v2-smoke.yml` manualmente sobre el mismo SHA.
5. El smoke real despliega Rules/índices actuales a staging y ejecuta la validación real disponible.
6. Sólo entonces ejecutar `android-debug-apk.yml` sobre ese mismo SHA.
7. La build V2 verifica por GitHub API que existen runs exitosos de los pasos 1 y 4 sobre `GITHUB_SHA`.
8. Los tres inputs de cutover del workflow Android permanecen `false` por defecto; activar únicamente los que hayan pasado gate e índices reales.
9. Registrar APK, SHA-256 y metadata del build.
10. Ejecutar Physical QA A+B antes de cualquier promoción adicional.

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
- `favorites_visible_cutover`

El generated candidate replica esos tres flags bajo `cost_cutovers`. El verificador exige coincidencia campo por campo antes de publicar el prerelease.

## Rollback

Rollback de costo no requiere migración destructiva:

```env
VITE_TUTOP_V2_REVIEWS_LAZY_CUTOVER=false
VITE_TUTOP_V2_WALLET_LAZY_CUTOVER=false
VITE_TUTOP_V2_FAVORITES_VISIBLE_CUTOVER=false
```

Una nueva build staging con los tres flags `false` vuelve a usar las queries legacy del snapshot. No borrar índices, reviews, wallet transactions, favorites ni datos trusted como parte del rollback.

## Presupuesto raíz esperado

Techo directo actual del snapshot V2: **565 documentos** antes de sublecturas de chat e hidratación canónica.

- reviews lazy activo: objetivo de techo raíz **365**;
- reviews + Wallet lazy activos: objetivo de techo raíz **265**;
- reviews + Wallet + favorites visible activos: objetivo de techo raíz **65**.

El objetivo **65** sólo representa el snapshot raíz: 60 chats + 5 documentos singleton. No incluye lecturas de membership visible de favorites, sublecturas de chats, identidad ni listings canónicos. Favorites visible queda separado y acotado a máximo 120 listings, consultados en lotes `IN` de hasta 30.

Estos valores son techos estáticos de diseño, no métricas de facturación ni garantía de ahorro real. Ningún objetivo debe presentarse como ahorro activo hasta que el flag correspondiente pase typecheck, build, Emulator, índices staging y prueba real sobre el mismo SHA.
