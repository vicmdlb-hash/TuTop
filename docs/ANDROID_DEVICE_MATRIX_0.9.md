# TuTop 0.9 — matriz mínima multi-dispositivo

Los dispositivos concretos son placeholders hasta ejecutar QA físico. No cuentan como PASS por sí solos.

| Slot | Perfil requerido | Estado | Evidencia mínima |
|---|---|---|---|
| A | Android principal, pantalla ~6–6.8", Android 13+ | PENDIENTE FÍSICO | instalación limpia, 36 casos, reporte Physical QA |
| B | Android distinto al A, versión/resolución/DPR diferente | PENDIENTE FÍSICO | instalación/reinstalación, UI, offline, Back, lifecycle |
| C opcional | Pantalla compacta o fuente/tamaño de pantalla grande | PENDIENTE FÍSICO | overflow, teclado, safe areas, navegación |

## Cobertura obligatoria

- Al menos 2 dispositivos/perfiles distintos antes de closed beta.
- Al menos un dispositivo debe ejecutar FCM foreground/background/cold-start y tap correlacionado.
- Al menos un dispositivo debe observar App Check token sin copiarlo ni almacenarlo.
- Ambos deben probar pérdida/reconexión de red.
- Una prueba de reinstalación debe confirmar rehidratación de institución/campus desde Firestore.

## Registro por slot

Completar manualmente sólo con evidencia real:

- Marca/modelo: `PENDIENTE`
- Android: `PENDIENTE`
- Resolución/DPR: `PENDIENTE`
- TuTop version + APK SHA: `PENDIENTE`
- Instalación limpia: `PENDIENTE`
- Reinstalación: `PENDIENTE`
- P0 PASS/FAIL: `PENDIENTE`
- FCM: `PENDIENTE`
- App Check observado: `PENDIENTE`
- Bugs encontrados: `PENDIENTE`

Ningún placeholder puede convertirse automáticamente en evidencia física.
