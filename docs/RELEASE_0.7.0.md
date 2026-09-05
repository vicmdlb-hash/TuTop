# TuTop 0.7.0 beta — Product polish

## Experiencia visible
- Onboarding TuTop sin pantallas técnicas ni menciones de Firebase para usuarios.
- Configuración online integrada en la APK; una instalación nueva va directo a crear cuenta/entrar.
- Publicación manual primero: fotos, título, precio, cantidad, categoría, descripción y entrega.
- Categorías canónicas y selección manual; Topi solo sugiere cuando el usuario lo pide.
- Topi híbrido sin costo con sugerencia de categoría, mejora de descripción, orientación de precio usando publicaciones comparables y revisión del anuncio.
- Adaptador opcional `VITE_TUTOP_AI_ENDPOINT` para conectar un proveedor de IA mediante proxy sin exponer secretos en la APK.
- Hasta 4 fotos por producto, vista previa y galería en detalle.
- Edición de título, precio, cantidad, categoría, descripción y punto de entrega desde Perfil.
- Pausar, reactivar y marcar productos como vendidos.
- Búsqueda, categorías, filtros por precio y ordenamiento.
- Envío de imágenes comprimidas en chat.
- Sonidos sintéticos y vibración opcionales para acciones principales.
- Copys y errores reescritos con voz TuTop.
- Nuevo icono adaptativo y splash.

## Datos y seguridad
- Catálogo canónico `catalog/marketplace` auto-sembrado de forma idempotente.
- Reglas actualizadas para categorías, múltiples imágenes, inventario y fotos en chat.
- UCoins continúan como puntos cerrados sin valor monetario fijo.
- Cloud Functions, Cloud Storage y SMS real siguen fuera de la ruta Spark.
- La configuración web pública de Firebase se integra en runtime; no se incluyen service accounts ni claves privadas.

## Compatibilidad
- Se conserva lectura de la categoría heredada `Apuntes & Guías`, normalizada en UI a `Libros & Apuntes`.
- Los productos antiguos sin `stock` se interpretan como cantidad 1.

## Pendientes deliberados
- Recuperación de cuenta con canal verificado: requiere definir un mecanismo seguro (SMS real o correo verificable); no se implementa una recuperación insegura.
- IA externa: el adaptador está listo, pero la beta funciona sin depender de cuotas de terceros.
- Google Play/release firmado: aplazado hasta que se autorice el gasto correspondiente.
- Token/meme coin: solo idea futura; no forma parte de UCoins ni de esta beta.
