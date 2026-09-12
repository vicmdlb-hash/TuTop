# TuTop 0.9 — implementación correcta de recuperación de cuenta

## Estado

**PREPARADO / PROVIDER DESHABILITADO.** Este documento no activa recuperación ni autoriza SMS, billing, Identity Platform o producción.

## Problema actual

El login beta deriva una identidad técnica de Firebase Auth a partir del teléfono. Ese alias técnico no es un correo de contacto verificado y por tanto no debe usarse para enviar enlaces reales de recuperación.

## Ruta recomendada

1. **Correo verificado** como canal primario.
   - añadir `recovery_email` únicamente en documento privado del usuario;
   - guardar `recovery_email_verified_at` y nunca inferir verificación por dominio o por texto escrito;
   - iniciar verificación desde sesión autenticada;
   - el enlace/código debe expirar y ser de un solo uso;
   - respuestas públicas deben ser neutrales para evitar enumeración de cuentas.
2. **Códigos de recuperación** como respaldo.
   - generar códigos aleatorios de alta entropía;
   - mostrar una sola vez al usuario;
   - almacenar únicamente hash + metadata mínima;
   - cada código se consume una sola vez;
   - regenerar invalida todos los códigos anteriores.
3. **SMS no forma parte de 0.9.** Sólo podría evaluarse posteriormente con autorización explícita de billing, privacidad y riesgo SIM-swap.

## Modelo privado propuesto

`user_private/{uid}`:

- `recovery_email`: string normalizado, privado;
- `recovery_email_verified_at`: timestamp | null;
- `recovery_email_pending`: string | null;
- `recovery_verification_expires_at`: timestamp | null;
- `recovery_generation`: integer monotónico;
- `recovery_updated_at`: timestamp.

`recovery_credentials/{uid}/codes/{codeId}`:

- `hash`;
- `generation`;
- `created_at`;
- `expires_at` opcional según decisión legal/seguridad validada;
- `used_at` nullable.

No almacenar código crudo, OTP, password, Firebase ID token o refresh token.

## Flujo de verificación de correo

1. Usuario autenticado agrega/cambia correo privado.
2. Backend confiable crea challenge aleatorio y registra sólo hash/TTL.
3. Se envía prueba de posesión al correo.
4. Usuario presenta challenge.
5. Comparación timing-safe + máximo de intentos + cooldown.
6. Si coincide: promover `recovery_email_pending` a `recovery_email`, escribir `verified_at` y rotar generation/challenge.

## Flujo de recuperación

1. Usuario proporciona canal de recuperación.
2. Respuesta de UI siempre genérica: no confirmar si existe la cuenta.
3. Backend confiable comprueba correo verificado y rate limits.
4. Emite challenge/enlace de un solo uso.
5. Tras validación, autoriza cambio de credencial mediante ruta administrativa segura.
6. Revoca sesiones previas cuando la plataforma lo permita de forma segura.
7. Registra evento de seguridad privacy-safe, sin secretos.

## Controles obligatorios antes de activar

- anti-enumeración;
- TTL corto definido por ingeniería de seguridad, no por texto legal inventado;
- máximo de intentos;
- cooldown por cuenta/canal/IP cuando aplique;
- replay prevention;
- rate limiting;
- invalidación al cambiar correo/password;
- challenge hash, nunca challenge crudo persistente;
- auditoría privacy-safe;
- pruebas de cuenta inexistente, expiración, replay, colisión, múltiples solicitudes y takeover.

## Gate para implementación real

Recovery permanece `provider=disabled` hasta que existan simultáneamente:

1. un correo real proporcionado por el usuario;
2. evidencia de posesión/verificación;
3. backend confiable capaz de emitir/consumir challenges;
4. reglas Firestore privadas revisadas;
5. tests de abuso verdes;
6. decisión de privacidad/legal necesaria para retención, sin inventar plazos.

## No hacer

- no reutilizar `<telefono>@auth.tutop.local` como correo de recuperación;
- no mandar OTP por SMS en 0.9;
- no guardar OTP/códigos en texto plano;
- no revelar “ese teléfono/correo está registrado”;
- no activar un provider sólo para marcar el pendiente como completado.
