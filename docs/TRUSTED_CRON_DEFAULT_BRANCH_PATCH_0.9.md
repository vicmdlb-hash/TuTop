# TuTop 0.9 — patch aislado para activar trusted maintenance cron

## Estado actual

`.github/workflows/v2-trusted-maintenance.yml` ya declara una cadencia conservadora de **cada 6 horas**:

```yaml
schedule:
  - cron: "17 */6 * * *"
```

GitHub ejecuta `schedule` únicamente desde la rama por defecto. Mientras `main` no contenga este workflow, el cron NO está activo automáticamente.

La reducción desde una frecuencia horaria evita que mantenimiento staging consuma por sí solo una fracción desproporcionada del presupuesto mensual de GitHub Actions. El workflow tampoco se dispara en cada pull request; `workflow_dispatch` queda disponible para validaciones puntuales.

## Patch futuro exacto

Cuando exista autorización explícita para tocar `main`, el cambio mínimo debe ser **añadir a `main` el archivo actual `.github/workflows/v2-trusted-maintenance.yml` sin alterar su lógica staging**. No requiere cambiar scripts de marketplace ni cliente Android.

Antes de aplicar:

1. Confirmar que `main` sigue estable y que el workflow no existe allí.
2. Confirmar credential válida para staging.
3. Confirmar `TUTOP_FIREBASE_PROJECT_ID=tutop-beta-vicmdlb-1356585881`.
4. Mantener `cancel-in-progress: false`.
5. Mantener la cadencia de cada 6 horas salvo evidencia operativa que justifique otra frecuencia.
6. Ejecutar primero `workflow_dispatch` desde la rama candidata y verificar PASS.
7. Aplicar el archivo como PR aislado de infraestructura, nunca mezclado con features.

## Rollback

Si el cron produce comportamiento inesperado, el rollback es eliminar/deshabilitar únicamente ese workflow en `main`; los scripts y datos staging permanecen intactos. No modificar Rules, Auth, App Check ni cliente Android como parte del rollback.

## Estado de esta fase

**NO APLICAR AHORA.** Este documento sólo deja el diff operativo preparado. `main` continúa fuera de alcance durante Physical QA 0.9.
