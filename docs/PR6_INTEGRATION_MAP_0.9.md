# TuTop 0.9 — PR #6 Integration Map

Release freeze: no new product features until Physical QA closes P0/P1 issues.

## Domains

| Domain | Critical paths | Integration risk | Exit condition |
|---|---|---|---|
| Android/runtime | `src/App.tsx`, native Firebase, navigation history, Physical QA | High | physical QA evidence on 2 Android profiles |
| Marketplace listings | canonical listings, publish, feed, moderation | High | canonical V2 only; seller edit→pending regression green |
| Transactions | offers, `canonicalTransactionsBackend`, reservation locks, meetup/completion | Critical | one active reservation lock per listing; emulator + staging smoke green |
| Firebase Rules | base rules + hardeners + generated rules | Critical | generated Rules compile and abuse/concurrency tests pass |
| Auth/recovery | Firebase REST, recovery orchestrator/adapters | High | current auth stable; recovery provider remains disabled until verified channel exists |
| Notifications | FCM token, router, receipts, Physical QA correlation | High | foreground/background/cold-start physical evidence |
| Offline/idempotency | offline queue, reconnect chaos tests | High | synthetic chaos green + physical reconnect without duplicates |
| Privacy/erasure | erasure planner/processor, retention matrix | Critical | synthetic destructive staging smoke + legal review pending clearly separated |
| Trusted maintenance | outcomes/reputation/credentials/push | High | terminal transactions clean reservation locks; trusted run green |
| CI/release | Quality, smoke, Android build, OIDC shadow | Medium | exact-HEAD gates green; FIREBASE_TOKEN retained until WIF parity |
| University network | catalog/identity/onboarding | Medium | reinstall/login rehydrates institution+campus physically |

## Canonical listing ID matrix

Schema V2 treats `listings_v2/{listingId}` as the authoritative listing identity. UI may keep the historical field name `product_id`/`producto_id` for compatibility, but its value is the canonical listing ID.

| Operation | Runtime/source | Authoritative lookup/write | Status |
|---|---|---|---|
| Publish | `NationalPublishScreen` → `canonicalListingsBackend.create` | `listings_v2/{id}` | Canonical |
| Feed hydration | `V2ListingsHydrator` / `canonicalListingsBackend` | `listings_v2` | Canonical |
| Seller edit/status | `canonicalStoreBridge` | `listings_v2/{id}` | Canonical |
| Favorite write | `onlineBackend.toggleFavorite` + generated V2 Rules | `favorites/{uid}_{listingId}`; target must be active+approved `listings_v2/{listingId}` | Canonical-only V2 |
| Favorite read | `visibleFavoritesBackend` | `favorites` membership by `uid + product_id IN [...]` | Canonical ID carried in `product_id` |
| Chat create | `rateLimitedOnlineBridge.createChat` | chat stores canonical ID in `product_id`/`producto_id`; Rules resolve `listingDoc()` | Canonical |
| Product/chat report scope | `rateLimitedOnlineBridge.institutionForTarget` | `listings_v2/{id}` | Canonical |
| Offer create/counter | `canonicalOffersBackend` | `listings_v2/{listingId}` | Canonical |
| Reservation/transaction | `canonicalTransactionsBackend` | `transactions_v2` + `listing_reservation_locks`; listing checks/close use `listings_v2` | Canonical |
| Meetup campus | generated V2 Rules | meeting point campus compared with `listingDoc(listingId).campus_id` | Canonical |
| Boost authorization | generated V2 Rules | bid `product_id` is authorized against `listingDoc(product_id)` | Canonical ID carried in legacy field name |
| Saved-search matching | `v2-trusted-maintenance` | queries `listings_v2` | Canonical |
| Notification deep link | outbox `listing_id` → UI `product_id` | value remains canonical listing ID | Canonical |
| Moderation | `scopedAdminBackend` | `listings_v2` | Canonical |
| Reviews | generated V2 Rules | completed `transactions_v2` linked by chat | Canonical transaction path |

## V2 delivery completion authority

`transactions_v2` is the **only authoritative delivery-completion state in schema V2**.

- `TransactionReservationCard` performs V2 confirmation through `nationalBackend.confirmDelivery(transaction)`.
- `buyer_confirmed_at`, `seller_confirmed_at` and `status=completed` are authoritative.
- **Whichever participant confirms second must atomically write both `transactions_v2.status=completed` and `listings_v2.status=sold_out` in the same commit.**
- Seller-second completion uses normal seller listing authority.
- Buyer-second completion receives only a narrow generated-Rule exception: `active→sold_out`, exact current reservation lock, exact buyer/seller pair, completed transaction, both timestamps, and `buyer_confirmed_at == transaction.updated_at == listing.updated_at`. It does not grant generic listing edit authority.
- The completed reservation lock intentionally survives client completion and is cleaned by trusted reconciliation.
- `TransactionReservationCard` no longer exposes a manual “Sincronizar publicación como Vendido” step; successful completion already guarantees the canonical close.
- `ChatConversation` receives the canonical transaction state and projects it into `entrega_confirmada`, `entrega_estado` and `confirmaciones_entrega` **in local Zustand state only** for UI/review compatibility.
- V2 must never write `chats/{chatId}/confirmations/{uid}` as completion authority.
- The old store `confirmDelivery(chatId)` / chat-confirmation subcollection remains V1-only compatibility behavior.
- A transaction created while the chat is already open is passed to `TransactionReservationCard` through `transactionHint`; no polling or duplicate transaction read is needed to display it.
- Review UI is unlocked only after the canonical transaction becomes `completed`. Generated Rules independently require the linked `transactions_v2` document to be completed and contain both confirmation timestamps.
- `reservationReconciliationPlan(...repair_completed_listing...)` remains only a historical/drift safety net; it is not normal completion flow.

This prevents either a legacy chat confirmation or confirmer ordering from leaving UI, transaction and listing state inconsistent.

## Terminal state authority matrix

| Canonical transaction state | Who materializes it | Reservation lock | Listing state | Reputation meaning |
|---|---|---|---|---|
| `completed` | second delivery confirmer, client atomic commit | retained until trusted cleanup | `sold_out` atomically | completed transaction |
| `cancelled` unilateral | participant via canonical backend | deleted atomically | remains `active` | penalizes `outcome_actor_id` |
| `cancelled` mutual | trusted maintenance after both requests | deleted atomically | remains `active` | explicitly excluded from cancellation penalty |
| `expired` | seller after deadline or trusted reconciliation | deleted atomically | remains `active` | no completed credit; no cancellation actor penalty |
| `disputed` | either participant | deliberately retained | remains `active` but reservation stays locked | not counted as completed/terminal reputation outcome yet |
| `no_show` | trusted maintenance only after an upheld outcome claim | deleted by trusted commit | remains `active` | penalizes accused `outcome_actor_id` |

Rules/contract implications:

- clients may create a **no-show claim**, but cannot self-declare `transactions_v2.status=no_show`;
- dispute intentionally freezes the reservation instead of releasing it;
- cancellation/expiration are invalid if their lock is not removed in the same authorized transition;
- reputation snapshots consume canonical `transactions_v2` terminal evidence, not chat/store presentation state;
- `v2-terminal-state-authority-tests.mjs` freezes these semantics.

### Deferred UI exposure during feature freeze

`canonicalTransactionsBackend` and `nationalBackendCanonicalBridge` already expose `cancelTransaction`, `requestMutualCancellation` and `claimNoShow`. `TransactionReservationCard` does not yet expose dedicated controls for every one of these paths. This is an explicit **integration/UI debt**, not permission to fall back to legacy methods. During the current freeze, any future controls must call the canonical bridge and pass exact-HEAD typecheck/Emulator/staging gates before promotion.

## Legacy `onlineBackend` reachability classification

The monolithic backend remains for V1 compatibility. It must not be deleted merely because V2 bridges override selected methods.

### `LEGACY_ONLY_SAFE`

- `Chatbot` + store `publishProduct` → `onlineBackend.createProduct`: App renders `NationalPublishScreen` instead when schema V2 is enabled.
- legacy `onlineBackend.updateProduct`: V2 store mutation is replaced by `canonicalStoreBridge`.
- legacy `onlineBackend.createChat`, `sendMessage`, `submitReport`: V2 behavior is replaced by `rateLimitedOnlineBridge`.
- legacy chat `confirmDelivery` subcollection flow: V2 ChatConversation no longer invokes it.

### `V2_REACHABLE_REQUIRES_BRIDGE_OR_CANONICAL_RULES`

- `onlineBackend.loadSnapshot`: transitional root snapshot only; V2 bridges remove legacy products/bids, lean chat reads and cost-cutover collections.
- `onlineBackend.toggleFavorite`: still writes the deterministic favorite document; V2 Rules require a canonical active+approved listing and the visible-membership bridge protects mutation races.
- `onlineBackend.submitReview`: called by `v2StoreReviewMutationBridge`; review creation is guarded by completed canonical transaction Rules.
- `onlineBackend.markChatRead`: shared read-marker behavior; does not determine transaction completion.
- shared auth/profile/wallet primitives remain reachable where their collection semantics are not listing-legacy dependent.

`nationalBackend.ts` also still contains older products-based transaction implementations for compatibility/type surface. In schema V2, `nationalBackendCanonicalBridge` must override every sensitive transaction/terminal method to `canonicalTransactionsBackend`; those legacy methods are not V2 authority.

Any future V2 call into an unclassified legacy method is a release-blocking integration regression until classified or bridged.

### Rules source vs generated Rules

`firebase/firestore.v2.rules` still contains legacy source patterns intentionally because `scripts/harden-canonical-v2-rules.mjs` transforms the generated staging Rules. The deploy/test target is `firebase/firestore.v2.generated.rules` via `firebase.v2.json`.

The hardener must:

- replace `productDoc()` with `listingDoc()` and add atomic completion helpers;
- migrate favorites, chat, offers, meetup and boosts to canonical listing checks;
- require `sold_out` for both buyer-second and seller-second completion;
- fail if any `productDoc(` survives.

There must be **one** canonical hardening path. A second favorites-specific hardener was removed because it conflicted with the canonical hardener order.

## Rules composition order

`v2:rules:prepare` is order-sensitive and is frozen by `v2-rules-composition-contract-tests.mjs`:

1. base generator;
2. canonical listing conversion;
3. runtime collections/rate-limit/cancellation rules;
4. listing rate-limit expression optimization;
5. account-operation transitions;
6. notification receipts;
7. reservation-lock hardening.

Later hardeners consume markers created by earlier steps. Marker drift must stop the preparation rather than silently skipping a transformation.

## Chat mutation integrity

V2 text/image send failures remove only the exact optimistic `msg-local-*` that failed. They must never restore a captured whole-chat object, because that can erase messages, unread state or other mutations received while the request was in flight.

## Merge strategy

1. Do not merge PR #6 during Physical QA.
2. Treat the branch as frozen release candidate development.
3. New fixes must be P0/P1, security, QA, cost, or release hardening only.
4. Every runtime fix requires regression + exact-HEAD CI + new APK.
5. Infrastructure activation (`main` cron, WIF replacement, App Check enforcement, Play) must be separate reversible PRs after authorization.

## Current critical invariants

- A listing may remain `active` while reserved so browsing behavior does not change, but exactly one `listing_reservation_locks/{listingId}` document may exist.
- Transaction creation and lock creation are atomic.
- Cancellation/expiration must remove the lock atomically; dispute retains it deliberately; completion makes the listing `sold_out` atomically no matter who confirms second.
- `no_show` is trusted-only after an upheld claim; clients cannot self-declare it.
- In schema V2, any UI field called `product_id` that points at a marketplace listing carries a `listings_v2` ID unless an explicitly legacy-only path states otherwise.
- In schema V2, `transactions_v2` is the sole delivery/terminal-state authority; legacy chat confirmations and legacy `products` transaction writes are compatibility-only.
- No cost cutover becomes active before exact-HEAD static/typecheck/build/Emulator/staging gates are green.
