# Seguridad de TuTop

TuTop está en beta privada y en modo **cero inversión**. El backend activo usa Firebase Authentication + Cloud Firestore en Spark y reglas de seguridad cliente-servidor. No se deben activar servicios con facturación ni subir secretos al repositorio.

## Nunca subir al repositorio

- contraseñas, cookies o tokens de sesión;
- cuentas de servicio JSON;
- llaves privadas, `.jks` o `.keystore`;
- credenciales de Google Play;
- datos personales reales de estudiantes usados para pruebas.

La `firebaseConfig` web pública puede configurarse en runtime; no sustituye a las Security Rules y no debe tratarse como una credencial administrativa.

## Reportar una vulnerabilidad

Durante la beta privada, registra el hallazgo como issue privado si GitHub lo permite o comunícalo directamente al propietario del repositorio. No publiques datos personales ni un exploit funcional contra usuarios reales.

## Gates obligatorios

Antes de integrar cambios sensibles deben pasar `npm run check`, `npm run github:ready`, `npm run beta:ready`, `npm run typecheck` y `npm run build`. Los cambios de Firestore Rules deben pasar además las pruebas de reglas en emulador mediante GitHub Actions.
