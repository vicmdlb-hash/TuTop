# TuTop Firestore v2 — red universitaria nacional

Esta especificación sustituye gradualmente el modelo centrado en `facultad` sin romper documentos 0.7/0.8 existentes.

## Principios de migración

1. Mantener campos legacy durante la transición (`facultad`, estados actuales y descripción serializada).
2. Añadir IDs canónicos, nunca depender del nombre visible como llave.
3. Separar identidad pública, datos privados y verificación.
4. Separar anuncio, oferta y transacción.
5. No almacenar direcciones exactas en documentos públicos.
6. No considerar una insignia de verificación como garantía de seguridad.
7. Evitar persistir imágenes de credencial indefinidamente; conservar resultado y metadatos mínimos tras la revisión conforme a la política de retención.

## Colecciones geográficas y académicas

### `institutions/{institutionId}`

- `name`
- `short_name`
- `country_code = "MX"`
- `state_code`
- `state_name`
- `city_name`
- `domains[]`
- `active`
- `created_at`
- `updated_at`

### `campuses/{campusId}`

- `institution_id`
- `name`
- `state_code`
- `city_id`
- `city_name`
- `zone_id?`
- `geo?` (cuando exista backend adecuado)
- `active`

### `faculties/{facultyId}`

- `institution_id`
- `campus_id?`
- `name`
- `active`

### `careers/{careerId}`

- `institution_id`
- `faculty_id?`
- `name`
- `active`

### `institution_domains/{domainId}`

- `institution_id`
- `domain`
- `status = verified | pending | disabled`

### `approved_meeting_points/{pointId}`

- `campus_id`
- `name`
- `description?`
- `kind`
- `is_tutop_safe_point`
- `active`

## Identidad y privacidad

### `public_profiles/{uid}`

- `uid`
- `display_name`
- `avatar_url?`
- `institution_id?`
- `campus_id?`
- `faculty_id?`
- `career_id?`
- `verification_level`
- `verification_badge`
- `seller_level`
- `reputation_summary`
- `created_at`
- `updated_at`

### `private_accounts/{uid}`

- `uid`
- `phone`
- `email?`
- `institutional_email?`
- `notification_preferences`
- `created_at`
- `updated_at`

Nunca exponer esta colección mediante lectura pública.

### `verifications/{uid}`

- `uid`
- `level`
- `method = phone | institutional_email | student_id | history`
- `institution_id?`
- `status = pending | approved | rejected | expired`
- `reviewed_by?`
- `reviewed_at?`
- `evidence_expires_at?`
- `evidence_deleted_at?`
- `created_at`
- `updated_at`

La evidencia sensible debe vivir separada y tener una política explícita de eliminación.

## Marketplace

### `listings/{listingId}`

- `seller_id`
- `seller_name_snapshot`
- `country_code = "MX"`
- `state_code`
- `city_id`
- `institution_id`
- `campus_id`
- `faculty_id?`
- `career_id?`
- `category_id`
- `subcategory_id?`
- `title`
- `description`
- `attributes {}`
- `price_mxn`
- `negotiable`
- `quantity`
- `condition`
- `delivery_methods[]`
- `meeting_point_ids[]`
- `shipping_available`
- `photos[]`
- `listing_kind = offer | wanted`
- `status = draft | active | paused | sold_out | archived`
- `moderation_status = pending | approved | review | rejected`
- `visibility_scope = campus | institution | university-zone | city | national`
- `published_at`
- `updated_at`

### `offers/{offerId}`

- `listing_id`
- `chat_id`
- `buyer_id`
- `seller_id`
- `amount_mxn`
- `status = pending | accepted | rejected | countered | withdrawn | expired`
- `parent_offer_id?`
- `counter_offer_id?`
- `expires_at?`
- `created_at`
- `updated_at`

Regla esencial: sólo comprador y vendedor pueden leer. El comprador crea/retira; el vendedor acepta/rechaza/contraoferta. Una oferta terminal no puede reabrirse.

### `transactions/{transactionId}`

- `listing_id`
- `chat_id`
- `buyer_id`
- `seller_id`
- `accepted_offer_id?`
- `agreed_amount_mxn?`
- `status = interest | offer_sent | countered | accepted | reserved | meetup_scheduled | completed | cancelled | expired | no_show | disputed`
- `reservation_expires_at?`
- `meeting_point_id?`
- `meetup_at?`
- `buyer_confirmed_at?`
- `seller_confirmed_at?`
- `created_at`
- `updated_at`

La confirmación bilateral es obligatoria antes de habilitar reseña de operación completada.

### `demand_requests/{requestId}`

- `buyer_id`
- `title`
- `description?`
- `category_id?`
- `max_price_mxn?`
- `needed_by?`
- `institution_id?`
- `campus_id?`
- `city_id?`
- `visibility_scope`
- `status = active | matched | fulfilled | paused | expired`
- `created_at`
- `updated_at`

### `saved_searches/{searchId}`

- `owner_uid`
- `query`
- `category_id?`
- `max_price_mxn?`
- `institution_id?`
- `campus_id?`
- `visibility_scope`
- `notifications_enabled`
- `last_match_at?`
- `created_at`
- `updated_at`

## Chat y eventos

### `chats/{chatId}`

Mantener participantes, producto/listing y metadatos de último mensaje.

### `chats/{chatId}/messages/{messageId}`

- `sender_id`
- `text?`
- `image_url?`
- `event_type? = offer | offer_accepted | offer_rejected | counter_offer | reservation | meetup | completion | safety`
- `related_offer_id?`
- `related_transaction_id?`
- `created_at`

Los eventos de transacción no sustituyen los documentos canónicos de `offers`/`transactions`; sólo los representan en conversación.

## Confianza y moderación

### `reputation/{uid}`

- `completed_transactions`
- `seller_rating`
- `buyer_rating`
- `punctuality_rate`
- `median_response_minutes`
- `cancellations`
- `no_shows`
- `reports_upheld`
- `score`
- `updated_at`

### `reports/{reportId}`

- `created_by`
- `target_type`
- `target_id`
- `reason_code`
- `description?`
- `priority`
- `status`
- `institution_id?`
- `created_at`
- `updated_at`

### `moderation_cases/{caseId}`

- `queue = credentials | listings | users | chats | fraud | prohibited | appeals | urgent`
- `target_type`
- `target_id`
- `institution_id?`
- `assigned_to?`
- `priority`
- `status`
- `evidence_refs[]`
- `resolution?`
- `created_at`
- `updated_at`

### `audit_log/{eventId}`

Inmutable. Cada cambio administrativo debe registrar actor, acción, objetivo, alcance, motivo y fecha.

## Roles

Roles previstos:

- `super_admin`
- `trust_safety`
- `moderator`
- `institution_moderator`
- `verification_reviewer`
- `support`

Los roles regionales o institucionales requieren `scope_institution_ids[]` y nunca deben obtener acceso global por defecto.

## Analítica

Los eventos deben excluir PII y contenido de mensajes. Métricas prioritarias:

- activation
- publish_started / publish_completed
- search / search_zero_results
- listing_view
- favorite
- chat_started
- offer_created / accepted / rejected / countered
- reservation_created / expired
- meetup_scheduled
- transaction_completed
- transaction_cancelled
- no_show
- report_created / upheld
- saved_search_created / matched

## Compatibilidad 0.8 → 0.8.5

Durante la migración:

- `users` continúa legible como perfil legacy.
- `products` continúa legible mientras se introduce `listings`.
- `facultad` se deriva de `career_name || faculty_name` cuando exista identidad nacional.
- los anuncios legacy sin IDs se consideran `visibility_scope = campus` dentro del contexto UATx legacy.
- ofertas de texto actuales siguen mostrándose, pero no se consideran objetos estructurados hasta su migración explícita.
