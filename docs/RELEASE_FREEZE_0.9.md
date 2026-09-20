# TuTop 0.9 — Release Freeze

> **CURRENT SUPERSESSION — CANDIDATE117 / 2026-09-20**
>
> The historical freeze rules below remain useful unless superseded here. Current engineering authority is build117 / PR #97 / SHA `a578a214f17f3a0ddb7c0d8c6039866f0252c015`; Device A remains NOT_TESTED. Firebase AI/Topi remote runtime has now been validated only in staging as part of Candidate117, so the older blanket line “Topi generativo remoto” in the historical freeze is no longer the current staging rule. It remains **not authorized for production release by this document**. Production, Play, billing, merge-to-main and additional feature expansion remain gated. No deliberate production Firebase project/config is versioned yet.


Objetivo: cerrar Android Physical QA sin aumentar superficie de regresión.

## Permitido durante el freeze
- Correcciones P0/P1 confirmadas por QA físico.
- Regresiones automatizadas para bugs reproducidos.
- Hardening de seguridad, privacidad, recovery y account erasure sin activar proveedores externos.
- Instrumentación QA y documentación operativa.
- Correcciones de build/CI/versionado necesarias para mantener el candidato reproducible.

## No permitido hasta salir de Physical QA
- Nuevas features de marketplace no relacionadas con bugs.
- Topi generativo remoto.
- Pagos, escrow, logística integrada o crypto/token.
- Producción, merge a `main`, billing, Play Store o App Check enforcement.
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
