# TuTop — borrador de ficha Google Play (México)
**DRAFT NO PUBLICAR** | 25/oct/2026 | Fuente: decisiones del propietario. No afirma funciones desplegadas, licencia, seguridad infantil, App Check o R6.

## Nombre propuesto
TuTop

## Descripción breve propuesta
Compra y vende en México: comunidad verificada y anuncios moderados.

## Descripción larga propuesta (futura; ajustar a funciones realmente probadas)
TuTop busca conectar a personas de todo México para descubrir, publicar y encontrar artículos y servicios permitidos dentro de una comunidad más segura.

- Explora publicaciones organizadas por ubicación y preferencias cuando su funcionamiento haya sido verificado.
- Crea anuncios con fotografías y detalles claros. Las publicaciones deben revisarse antes de hacerse visibles.
- Comunícate y acuerda con otras personas la compraventa o el intercambio, con recomendaciones para reunirse en lugares seguros.
- Utiliza funciones de reporte, bloqueo y revisión de contenido según el alcance de la versión aprobada.
- La compra y el pago del producto se acuerdan entre las personas fuera de TuTop; TuTop no recibe pagos ni garantiza transacciones entre usuarios.

**Decisión de audiencia del 05-nov-2026:** TuTop se proyecta para todas las edades, incluidos menores de 13 y adolescentes. Esta ficha sigue en estado NO PUBLICAR hasta que estén realmente implementados y verificados los controles de edad, tutela, revocación, moderación, avisos de seguridad, bloqueo, privacidad, clasificación de contenido y seguridad de los datos. No se presentará una beta exclusiva para adultos como decisión vigente ni se declarará apta para menores por tener sólo pruebas sintéticas.

Topi puede ayudar con funciones guiadas y de voz si están validadas. No anunciar IA generativa mientras el proveedor/modelo y las pruebas permanezcan pendientes.

Las promociones pagadas de anuncios mediante subastas son una opción futura, NO disponible ni facturable en la versión actualmente preparada. Antes de incluirla habrá que revisar facturación, publicidad para menores y política Play.

## No publicable aún
- Capturas reales del APK aprobado, no imágenes de prototipo ni capturas de Build120/121.
- Versión, icono, tamaño, SHA y firma del AAB actual; cadena de custodia en Play Console.
- Dirección web pública y verificable de privacidad y eliminación de cuenta.
- Contacto público legal/de privacidad que el propietario autorice.
- Formularios Data Safety, audiencia, clasificación IARC, Families, permisos y acceso para revisores; datos exactos del runtime, no afirmaciones inferidas.
- Estado de cuenta Play Console, verificación de desarrollador y posible requisito de pruebas cerradas.
- Marcar todo anuncio remunerado futuro como contenido promocionado y revisar política específica de Google Play.
- Ninguna tarifa o beneficio premium debe figurar como disponible hasta la autorización de cobro y comprobación de cumplimiento.

## Referencias
- https://support.google.com/googleplay/android-developer/answer/9893335
- https://support.google.com/googleplay/android-developer/answer/9858738
- https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf

## Revalidación de obligaciones Google Play · 08-nov-2026 (solo documentación)

- **Android API objetivo 36:** Desde el 31/ago/2026, Google Play exige API 36+ para apps nuevas y actualizaciones móviles estándar. `scripts/android-bootstrap.mjs` fija `compileSdkVersion=36` y `targetSdkVersion=36` sobre el proyecto Android generado, pero esto **no demuestra un AAB válido** ni firma Play. Fuente oficial: https://support.google.com/googleplay/android-developer/answer/11926878?hl=es-419
- **Eliminación de cuenta real:** Google Play requiere una vía clara dentro de la app **y una página web externa**, y eliminación de datos vinculados, no solo status `pending` o suspensión. Ya hay fuente `public/delete-account.html` + `public/delete-account.js`, pero NO hay prueba de URL pública accesible, flujo productivo completo ni aprobación legal. Mantener NO PUBLICAR. Política: https://support.google.com/googleplay/android-developer/answer/10144311
- **Menores y contenido social:** La audiencia proyectada incluye menores; deben existir advertencias de interacción, control adulto de funciones sociales, acción adulta para intercambio de información personal y disclosures de clasificación de contenido. Pruebas de emulador NO prueban que el runtime desplegado lo cumpla. Además, las apps cuyo propósito principal sea chat anónimo o aleatorio no pueden dirigirse a niños. Referencias: https://support.google.com/googleplay/android-developer/answer/9893335 y https://developer.android.com/distribute/play-policies
- **Privacidad:** `public/privacy.html` se identifica expresamente como borrador no aprobado; aún faltan identidad y domicilio final del responsable, canal autorizado, plazos/retención y política accesible en URL pública verificable. No convertir el borrador en declaración de cumplimiento.
- **Evidencia física:** Los hashes de Build120 son históricos, `docs/PHYSICAL_QA_CANDIDATE_0.9.json` marca `obsolete_physical_fail`. R6 0/2. Seguir `docs/NEXT_CANDIDATE_SIGNING_BINDING.md`, no presentar Build120 ni capturas antiguas a Play.

El presente anexo es un preflight editorial de fuentes vivas; **NO es una autorización de release ni una certificación de cumplimiento**.
