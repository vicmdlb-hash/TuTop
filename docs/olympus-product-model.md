# TuTop — modelo Olimpo (source-only)

## Regla central

TuTop separa tres conceptos que no deben mezclarse:

1. **Podio semanal** — Top 1 Oro, Top 2 Plata, Top 3 Bronce. Es competencia temporal de publicaciones.
2. **Reputación ganada** — Iniciado, Héroe, Semidiós, Olímpico. Sólo puede provenir de hechos confiables del marketplace.
3. **Plan comercial** — Gratis, Hermes, Atenea, Zeus. Puede dar herramientas, capacidad, UCoins promocionales o visibilidad claramente etiquetada, pero **no aumenta confianza, reputación ni verificación**.

## Invariantes

- pagar nunca convierte a una cuenta en “más confiable”;
- un plan premium no cambia reseñas, completed_transactions, no_shows, reports_upheld ni verification;
- “Top 1/2/3” no es reputación permanente;
- “Estudiante verificado” no es un plan;
- cualquier placement pagado debe indicarse como promocionado;
- los umbrales de reputación no se activan en este cambio: requieren primero una especificación sobre métricas trusted y aceptación del producto;
- no hay billing, cobro, suscripción, entitlement ni producción en esta rama.

## Lenguaje visible recomendado

Ejemplo combinado:
`Top 1 · Oro | Reputación: Héroe | Plan: Atenea`

Esto hace explícito qué se ganó, qué es temporal y qué se contrató.
