# TuTop — START HERE · CERO INVERSIÓN

## Decisiones confirmadas
- package Android: `mx.tutop.app`
- no Google Play Console por ahora
- no billing / no Blaze
- Firebase deseado: sí, pero en plan Spark
- MiTuTop Admin debe mostrar sólo Firebase real

## Única acción humana pendiente para tener backend online
Crear gratuitamente un proyecto en Firebase Console con la cuenta Google del propietario. No hace falta tarjeta.

Después:
1. registrar una app Web y copiar `firebaseConfig`;
2. activar Authentication > Email/Password;
3. crear Firestore en modo producción;
4. publicar `firebase/firestore.rules` e índices;
5. abrir TuTop y pegar `firebaseConfig`;
6. crear la primera cuenta;
7. crear manualmente `admins/{UID}` con `active=true` para habilitar MiTuTop Admin.

Guía exacta: `docs/FIREBASE_SPARK_5_MINUTOS.md`.

## Qué NO activar todavía
- Google Play Console;
- Cloud Billing/Blaze;
- Cloud Functions;
- Cloud Storage for Firebase;
- SMS real.

## Admin real
Usa `/admin` dentro de la app o abre `preview/MiTuTop_Admin_Online.html`. Ambos esperan Firebase real; ya no existe un modo demo como fuente de datos.

## APK
Google Play no es requisito para generar APK. El código Android está preparado para Capacitor, pero el entorno de este handoff no incluye Android SDK ni puede aceptar licencias Google por el usuario. Lee `docs/APK_ZERO_COST_STATUS.md`.
