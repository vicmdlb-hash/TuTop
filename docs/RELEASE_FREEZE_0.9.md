# TuTop 0.9 — Release Freeze

> **CURRENT SUPERSESSION — BUILD118 / 2026-09-20**
>
> Current engineering authority is Build118 / PR #100 / SHA `e93ca0bb237e7fa438df5801fc627f065d9441e6`, version `0.9.2-beta.8`, Android versionCode `90212`. Physical truth remains `DEVICE_A_NOT_TESTED` in Issue #20. Firebase AI/Topi remote runtime is validated only in staging for Build118; it remains **not authorized for production release**. Production, Play, billing, merge-to-main, signing/AAB execution and feature expansion remain gated. No deliberate production Firebase project/config is versioned.

Objetivo: cerrar Android Physical QA sin aumentar superficie de regresión.

## Permitido durante el freeze
- Correcciones P0/P1 confirmadas por QA físico.
- Regresiones automatizadas para bugs reproducidos.
- Hardening de seguridad, privacidad, recovery y account erasure sin activar proveedores externos.
- Instrumentación QA y documentación operativa.
- Correcciones de build/CI/versionado necesarias para mantener el candidato reproducible.
- Release-readiness **read-only/fail-closed** que no publique, no produzca AAB por defecto y no cambie producción.

## No permitido hasta salir de Physical QA
- Nuevas features de marketplace no relacionadas con bugs.
- Topi generativo remoto **en producción**.
- Pagos, escrow, logística integrada o crypto/token.
- Producción, merge a `main`, billing, Play Store o App Check enforcement.
- AAB/signing/Play sin autorización explícita y gates de release satisfechos.
- Afirmar alianzas universitarias no verificadas.

## Criterio de salida
- 0 P0 abiertos.
- 0 P1 graves sin mitigación.
- Flujo seller/buyer completo PASS con dos cuentas staging.
- Reinstalación, offline/reconnect y Android Back PASS.
- FCM foreground/background/cold-start + tap/deep-link PASS en dispositivo real.
- App Check token observado físicamente antes de considerar enforcement.
- Recovery externo sigue bloqueado hasta disponer de canal verificado y backend trusted.

Este freeze reduce el riesgo del PR grande: desde este punto el alcance funcional queda congelado y cada cambio nuevo debe justificar un bug, seguridad, QA o release readiness.
