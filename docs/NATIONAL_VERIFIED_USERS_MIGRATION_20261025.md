# TuTop — migración a usuarios verificados de todo México
**Estado:** DISEÑO CONFIRMADO / IMPLEMENTACIÓN BLOQUEADA / NO DESPLEGADO. Fuente de decisiones: propietario, 25/oct/2026; SSOT Google Doc `1ps48HuyBmRm3HHHK1ByEDkD2dPKubzerOny9Ztv3mkk`. No se autoriza un launch ni se presume que email verificado comprueba identidad civil.

## Destino aprobado
- Personas de todo México, con cuenta verificada; la institución y campus son OPCIONALES, no condiciones de elegibilidad.
- Un único moderador inicial legítimo (propietario), aprobación previa de anuncios, reportes/bloqueo/apelación y controles de edad.
- Menores aspiracionales: menos de 13 sin chat directo; compartir datos personales por menores de 18 requiere intervención adulta verificable; los permisos de tutores pueden retirarse inmediatamente.
- La primera publicación puede posponer acceso a menores si no existe backend de guardianes aprobado y una pantalla neutral de edad segura; no equivale a autorización de activar bypass.
- Vendedores y compradores liquidan sus compraventas directamente fuera de TuTop; no custodiar ni transferir fondos de compraventa.
- Subasta de mayor visibilidad de anuncios es POSTERIOR, inactiva y sin cobros. Revisar Play Billing, Families y claridad de anuncios.
- Topi generativa opcional para lanzamiento; control remoto no aprobado, voz deseada, alternativas gratuitas evaluables.
- Todas las mutaciones reales, QA Android, Play y firma aún requieren evidencia específica.

## Bloqueos concretos detectados (HEAD `1f9a3868` / source audit)
1. `src/components/BackendGate.tsx`: obliga a elegir universidad/campus para crear cuenta; contiene listas institucionales. Migrar a formulario de país/estado opcional + verificación de cuenta acordada + edad neutral.
2. `src/services/v2OnboardingRecovery.ts`: claves `pending-university-identity`, `V2_REGISTRATION_IDENTITY_REQUIRED` y relectura exacta de campus; reemplazar por identidad no institucional, manteniendo atomicidad y UID.
3. `src/components/NationalPublishScreen.tsx`: muestra error de universidad/campus y construye datos ligados a ambos. Cambiar guardia por cuenta verificada, edad/capacidades, moderación previa y localización consentida.
4. `src/services/nationalBackend.ts`: `updateUniversityIdentity()` fuerza institución. Volverlo opcional o retirarlo solo después de migración y validación de clientes antiguos.
5. `src/lib/universityNetwork.ts`: etiquetas de insignias universitarias, filtros, puntos de encuentro campus. Preservar registros históricos, pero no usarlos como puerta obligatoria para nuevos ciudadanos.
6. `firebase/firestore.v2.rules` y `scripts/prepare-firestore-v2-rules.mjs`: auditar todas las reglas de acceso, validación de `institution_id`, `campus_id`, ciudad/nación, moderación y decisiones guardianes. NO eliminar seguridad con `allow read, write: if true` ni permitir contenido no moderado.
7. `public/terms.html`, `public/privacy.html`: sólo borradores de fuente, NO aprobación jurídica ni URL externa operativa.
8. Reconciliar datos `users`, `user_private`, `listings_v2`, `products`, `institution_domains`, `campuses` sin forzar migración destructiva de perfiles antiguos.

## Secuencia de implementación segura
A. Decidir grado de verificación: correo autenticado vs teléfono confirmado vs identidad real (no equipararlos). Documentar edad neutral y protección contra falsificación. No coleccionar identificación oficial sin justificación legal y mecanismo aprobado.
B. Añadir schema compatible con instituciones opcionales; mantener cuentas UATx/BUAP/UNAM históricas y permisos actuales. No falsificar campus para usuarios no universitarios.
C. Reescribir registro, reconstrucción de sesión y publicación con fail-closed para usuario sin verificación y menor sin capacidad aprobada.
D. Mapear y probar Rules y lector de feed nacional con dos cuentas sintéticas de distintas localidades, un no verificado, un menor y un bloqueado; la publicación debe permanecer `pending` hasta moderación real y no debe ser visible en Nearby/Explore antes de aprobación.
E. Probar seguridad de ubicación/entrega opcional sin publicar domicilio exacto; recomendar puntos seguros; bloquear intercambios riesgosos de menores.
F. Probar logout/login A-B, roles/moderación, App Check/Auth, privacidad/erasure y fallos de red; afirmar PASS solamente en emuladores con evidencia y staging real autorizado.
G. Crear UNA candidata Android exact HEAD solamente tras pasar todos los controles, y ejecutar R6 A/B físico; no reusar Build120/121.

## Puertas de lanzamiento
- `config/tutop-national-product-direction.json` es SOLO intención; `status=OWNER_DECISION_NOT_DEPLOYED`.
- `scripts/national-product-direction-tests.mjs` debe revelar restricciones heredadas hasta que sean reemplazadas y entonces actualizar prueba a evidencias reales.
- Antes de cambiar `productionPublishingAllowed=false`: identidad verificada, menores/guardianes efectivos, moderación real, aviso legal y QA exacta + aprobación humana.
- Referencias: https://support.google.com/googleplay/android-developer/answer/9893335 y https://support.google.com/googleplay/android-developer/answer/9858738. Consulta asesoría jurídica para exacta aplicación.
