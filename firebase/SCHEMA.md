# TuTop — esquema Firestore propuesto para beta

## `users/{uid}` (privado)
Server-owned: `saldo_ucoins`, `puntos_prestigio`, `nivel_vendedor`, `esta_verificado`, `strikes`, `suspended_until`, `push_tokens`.
Cliente puede editar únicamente nombre/facultad/avatar vía reglas; alta inicial y borrado pasan por Functions.

## `products/{productId}`
`vendedor_id`, `vendedor_nombre`, `vendedor_verificado`, `titulo`, `descripcion`, `precio_mxn`, `categoria`, `facultad`, `punto_encuentro`, `image_path`, `estado`, `es_top`, `jerarquia_top`, `fecha_creacion`, `updated_at`.
Escrituras solo por Functions para impedir falsificar Top, vendedor o moderación.

## `chats/{chatId}` + `messages/{messageId}`
Chat determinista `productId__buyerId__sellerId`; contiene `participants`, `delivery_status`, `delivery_confirmations`, `last_read_by`. Mensajes: `sender_id`, `text`, `created_at`.

## `walletLedgers/{id}`
Ledger append-only de servidor: `user_id`, `amount`, `type`, `description`, `operation_id`, `created_at`.

## `bids/{week__product__uid}`
Acumulado server-side por semana/producto/vendedor: `amount_total`, `first_bid_at`, `semana`, `facultad`, `categoria`.

## `weeklyRankings/{week__faculty__category}`
`positions[0..2]` con `product_id`, `rank`, `amount_ucoins`, `first_bid_at`. Se reconstruye ignorando productos pausados/vendidos/borrados.

## `reviews/{chatId__evaluatorUid}`
Una calificación por participante/entrega. `calificacion` positive/negative. Los strikes se recalculan con negativas de los últimos 30 días.

## `idempotency/{uid__operationId}`
Evita doble gasto por retry/doble tap. `firebase/firestore.indexes.json` ya declara TTL sobre `expires_at` para que estos registros temporales se limpien automáticamente.

## Otras colecciones
- `users/{uid}/notifications`: notificaciones in-app server-generated.
- `verificationRequests/{uid}`: evidencia privada + estado de revisión. `adminReviewVerification` exige custom claim `admin`, actualiza usuario/productos y elimina la imagen sensible después de la decisión.
- `reports/{id}`: moderación.
- `accountDeletionRequests/{phoneHash}`: solicitud web externa pendiente de verificación de identidad; guarda hash SHA-256 determinista y últimos 4 dígitos, no el teléfono completo.
