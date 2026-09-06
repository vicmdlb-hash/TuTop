# TuTop 0.9 — Android Physical QA

Este protocolo valida comportamiento físico. Los gates CI, emulator y Firebase staging **no sustituyen** estas pruebas.

## Evidencia obligatoria por dispositivo

Registrar: marca/modelo, versión Android, resolución/orientación, instalación limpia vs actualización, versión TuTop, fecha/hora y resultado PASS/FAIL por caso. En Perfil → Android Physical QA ejecutar diagnóstico y copiar el reporte sanitizado cuando exista un fallo.

## P0 — debe pasar antes de continuar

1. Instalación limpia abre sin crash ni pantalla técnica.
2. Crear cuenta con teléfono + Clave TuTop; seleccionar institución y campus.
3. Cerrar/reabrir: sesión e identidad siguen disponibles.
4. Publicar listing campus con hasta 4 fotos.
5. Publicar listing nacional: sin Paquetería debe bloquear; con Paquetería debe permitir continuar.
6. Moderar/aprobar listing en staging y comprobar que otra cuenta lo descubre.
7. Segunda cuenta: favorito → contacto → chat → oferta → contraoferta → aceptación.
8. Reserva → Punto TuTop → confirmación bilateral → listing sold_out → review/reputación.
9. Perfil seller: editar listing aprobado devuelve a pending y deja de ser público hasta re-aprobación.
10. Reinstalar app y volver a iniciar sesión: universidad/campus deben rehidratarse desde Firestore.

## Android UI / lifecycle

11. Abrir teclado en login, publicación y chat: CTA/campo activo no debe quedar inaccesible.
12. Botón Atrás Android: detalle → pantalla previa; chat → inbox; no debe cerrar la app inesperadamente.
13. Background 30 s / 5 min y volver: no duplicar mensajes/listings ni perder navegación crítica.
14. Rotar si el dispositivo lo permite: sin contenido cortado ni navegación perdida.
15. Revisar notch/status bar/navigation bar: ningún control importante debajo de safe areas.
16. Probar pantalla compacta y fuente/tamaño de pantalla grande: sin overflow horizontal crítico.

## Offline / reconnect

17. Abrir feed online, apagar Wi-Fi/datos y confirmar banner offline.
18. Intentar acción que requiere red: error comprensible, sin falso éxito.
19. Reactivar red: feed/sesión se recuperan sin reiniciar la app.
20. Interrumpir red durante publicación/chat/oferta y comprobar que no aparecen duplicados al reconectar.

## Push / FCM

21. La app NO debe pedir permiso push al primer arranque.
22. Habilitar notificaciones desde control explícito y aceptar permiso.
23. Ejecutar diagnóstico: permiso push debe indicar granted y App Check debe reportarse sin exponer token.
24. Recibir FCM con app foreground.
25. Recibir FCM con app background.
26. Recibir FCM con app terminada/cold-start.
27. Tap de mensaje abre chat correcto.
28. Tap de listing abre listing correcto.
29. Tap de transacción navega al contexto correspondiente.
30. Marcar notificación leída, cerrar/reabrir y comprobar persistencia read/unread.

## App Check

31. En APK staging verificar que puede obtener token nativo.
32. Si no hay token, capturar reporte QA antes de cualquier enforcement.
33. App Check seguirá UNENFORCED durante esta fase. No activar enforcement hasta PASS físico estable.

## Cuenta y privacidad

34. Cambiar Clave TuTop con sesión válida y comprobar login con nueva clave.
35. La app no debe fingir recuperación de clave olvidada por SMS/email todavía.
36. Solicitar eliminación y comprobar estado de solicitud; no ejecutar borrado destructivo en cuenta real de QA sin autorización explícita.

## Criterio de salida de 0.9 Physical QA

- 0 P0 abiertos.
- Flujo marketplace completo PASS en al menos 2 cuentas reales de staging.
- Instalación/reinstalación PASS.
- Offline/reconnect sin duplicación o pérdida silenciosa.
- Push foreground/background/cold-start + tap PASS en al menos un Android compatible.
- Reporte QA sin `fail` estructural (staging/V2).
- App Check token observado antes de considerar enforcement.
- Todos los bugs encontrados tienen causa raíz, fix y regresión automatizada cuando sea posible.

No autoriza `main`, producción, billing, Play Store, App Check enforcement ni alianzas oficiales.
