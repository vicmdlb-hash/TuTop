# TuTop 0.6.2-beta.0 — ONLINE / SPARK / CERO INVERSIÓN

Este árbol ya no usa seeds/demo como fuente de verdad. La app espera un proyecto Firebase real y queda vacía si Firestore está vacío.

**Prueba web:** `npm ci && npm run dev` → pega Firebase Web config en pantalla.

**Checks sin dependencias completas:** `npm run check`.

**Panel privado:** `/admin` o `preview/MiTuTop_Admin_Online.html`.

**Firebase activo:** `firebase.json` (sin Functions/Storage).

**Fase de pago preservada, no activa:** `firebase.blaze.json`, `firebase/firestore.blaze.rules`, `firebase/storage.blaze.rules`, `/functions`.

Lee en orden:
1. `docs/FIREBASE_SPARK_5_MINUTOS.md`
2. `docs/ZERO_COST_FIREBASE_ARCHITECTURE.md`
3. `docs/APK_ZERO_COST_STATUS.md`
4. `docs/CODEX_2026-09-06_ZERO_COST.md`
