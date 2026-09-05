# TuTop 0.8.0 beta — P0 de experiencia

TuTop 0.8 inicia la transición de beta funcional a producto cotidiano, manteniendo el principio de cero inversión y sin romper la base estable de 0.7.0.

## Objetivo

Comprar y vender debe sentirse rápido por defecto y detallado solo cuando la persona lo necesita. Topi ayuda, pero nunca toma control de una publicación.

## Incluido en este P0

### Primera experiencia
- Registro dividido en pasos cortos.
- Mostrar/ocultar Clave TuTop e indicador simple de fortaleza.
- Facultad explicada como personalización de comunidad.
- Verificación estudiantil separada y opcional.
- Mensajes de error humanos; sin lenguaje técnico visible.
- Tutorial opcional de 3 pantallas para usuarios nuevos.
- Explicación breve de TuTop y de Topi.
- Selección opcional de intereses guardada localmente.
- El tutorial puede saltarse y no vuelve a mostrarse después de completarse.

### Publicar
- Dos modos: **Publicación rápida** y **Más detalles**.
- Borrador automático en el dispositivo.
- Indicador de calidad/completitud de publicación.
- Datos esenciales primero: fotos, título, precio, cantidad, categoría y coordinación de entrega.
- Reordenamiento de fotos y selección implícita de portada mediante el primer lugar.
- Detalles opcionales: condición, marca, modelo, talla/medida, color, precio negociable, métodos de entrega, referencia pública, horario, disponibilidad y etiquetas.
- Formulario adaptativo según categoría. Electrónica, ropa, libros/apuntes, comida/postres, servicios, transporte, cuartos/renta, eventos y arte muestran atributos propios.
- Vista previa antes de publicar.
- Topi permanece opcional para categoría, descripción, precio y revisión.
- Topi nunca publica automáticamente.

### Compatibilidad de datos
El backend Spark desplegado en 0.7.0 permite un conjunto estricto de campos, categorías, puntos de encuentro y hasta cuatro imágenes. Para no romper cuentas ni reglas en producción, este P0 conserva ese contrato. Los nuevos detalles opcionales y adaptativos se serializan de forma legible dentro de la descripción del anuncio. La ampliación física del esquema se hará como migración independiente después de sus pruebas de reglas.

### Feed / comprador
- Modos **Para ti** y **Ver todo**.
- Priorización local basada en favoritos, productos vistos e intereses disponibles, sin IA paga.
- Bloque de **Vistos recientemente**.
- Historial de búsqueda local.
- Búsqueda sobre título, descripción, detalles, categoría, vendedor y facultad.
- Filtro de publicaciones guardadas.
- Filtro de vendedores verificados.
- Filtro de precio negociable.
- Filtro de anuncios con entrega definida.
- Orden por recientes, popularidad y precio.
- Contador de resultados y contador de filtros activos.
- Estado vacío con recuperación rápida de filtros.
- Las tarjetas muestran de forma visual si el precio es negociable y si la entrega ya está definida.

### Experiencia de vendedor
- El Feed detecta si la persona tiene publicaciones activas y muestra un bloque **Modo vendedor**.
- Resume publicaciones activas y mensajes pendientes.
- Acceso directo a crear otra publicación.
- Perfil conserva gestión, edición, pausa, reactivación y marcado como vendido.
- Mensajes separa claramente conversaciones de compra y venta.
- El vendedor ve cuántas conversaciones de venta tiene y cuántas requieren respuesta.

### Ficha de producto
- Descripción limpia separada de los metadatos técnicos del anuncio.
- Chips de estado y precio negociable.
- Fecha relativa de actualización/publicación.
- Detalles estructurados visibles en tarjetas.
- Resumen de entrega y cantidad disponible.
- Productos similares de la misma categoría.
- Historial local para alimentar “Vistos recientemente”.
- Topi para comprador con preguntas rápidas relevantes.
- Acción **Hacer oferta** desde la propia ficha.
- Recordatorio de seguridad para encuentros en lugares públicos.

### Mensajes / negociación
- Bandeja separada por **Compras** y **Ventas**.
- Contadores de compras, ventas y conversaciones de venta pendientes por responder.
- Cada conversación indica el rol actual y el estado de la entrega.
- Respuestas rápidas distintas para comprador y vendedor.
- Acción **Hacer oferta** para comprador.
- TuTop reconoce visualmente mensajes de oferta y resalta el monto.
- El vendedor puede **Aceptar**, **Rechazar** o **Contraofertar** desde controles claros.
- Aceptar o rechazar genera una respuesta explícita dentro del chat; no realiza pagos ni reserva automáticamente el producto.
- Confirmación de entrega usa lenguaje distinto según rol: recibido para comprador y entregado para vendedor.
- Se conserva envío de fotos, reportes, confirmación bilateral de entrega y calificación.
- Se muestra recordatorio de encuentro seguro sin publicar domicilios exactos.

## Conservado de 0.7.0
- Firebase Spark / cero inversión.
- `mx.tutop.app`.
- Firestore Security Rules estrictas.
- UCoins y Top semanal actuales.
- Verificación privada de credencial.
- Moderación y panel de administración existentes.
- Actualización de APK sobre la instalación anterior.

## Límites deliberados de este bloque
- Se mantienen máximo 4 imágenes hasta migrar reglas y presupuesto de documento de Firestore de forma segura.
- Las categorías nuevas del catálogo maestro todavía no se activan en producción si las reglas actuales no las aceptan.
- Aceptar/rechazar/contraofertar todavía se representa como mensajes estructurados por la UI, no como una entidad de oferta persistente con máquina de estados en Firestore.
- Todavía no existe reserva transaccional automática.
- No se expone domicilio exacto públicamente.

## No se presenta como terminado todavía
Quedan para siguientes bloques de 0.8/0.9: varios borradores simultáneos, migración segura del catálogo ampliado y puntos de entrega, ofertas/reservas persistentes, notificaciones push, IA externa para Topi, análisis real de fotografías, publicación por cámara/voz, solicitudes “Busco…”, reputación avanzada, Puntos TuTop, offline ampliado y release de Play Store.

## Criterio de salida
Antes de integrar a `main`, la rama debe pasar:
- `npm run check`
- `npm run github:ready`
- `npm run beta:ready`
- `npm run typecheck`
- `npm run build`

La 0.7.0 en `main` se mantiene intacta hasta que este gate termine en verde.
