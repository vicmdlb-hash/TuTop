# TuTop 0.9 — Technical Feature Freeze

Estado: **ACTIVE** hasta completar el primer Physical QA A+B sobre un candidato Android exact-head válido.

## Permitido

- corrección de bugs e inconsistencias verificables;
- seguridad y privacidad;
- reducción de lecturas/costo sin degradar exactitud;
- observabilidad y diagnóstico;
- contratos estáticos, Emulator fixtures y gates;
- preparación de rollback;
- correcciones necesarias para typecheck/build/Android/Physical QA.

## No permitido durante el freeze

- nuevas features de producto no requeridas para estabilización;
- nuevos proveedores pagados o IA remota;
- billing, Play Store, SMS, Identity Platform o producción;
- App Check enforcement;
- crypto/UCoins monetizables;
- alianzas universitarias inventadas;
- merge de PR #6 a `main` sin autorización explícita.

## Regla de aceptación

Todo commit nuevo debe satisfacer al menos una de estas categorías:

`BUG_FIX | SECURITY | COST_REDUCTION | OBSERVABILITY | GATE | PHYSICAL_QA_BLOCKER`

Si no puede clasificarse claramente en una de ellas, se difiere hasta después de Physical QA.

## Estado de cutovers

- reviews lazy: preparado, default `false`;
- Wallet lazy: preparado, default `false`;
- visible favorites: preparado, default `false`;
- activación sólo en staging después de gates reales correspondientes.

Este freeze no declara el código validado: typecheck/build/Emulator/Android reales siguen pendientes mientras no exista runner disponible.
