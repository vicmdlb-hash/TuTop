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

### Rules source vs generated Rules

`firebase/firestore.v2.rules` still contains legacy source patterns intentionally because `scripts/harden-canonical-v2-rules.mjs` transforms the generated staging Rules. The deploy/test target is `firebase/firestore.v2.generated.rules` via `firebase.v2.json`.

The hardener must:

- replace `productDoc()` with `listingDoc()`;
- migrate favorites, chat, offers, meetup and boosts to canonical listing checks;
- fail if any `productDoc(` survives.

There must be **one** canonical hardening path. A second favorites-specific hardener was removed because it conflicted with the canonical hardener order.

## Chat mutation integrity

V2 text/image send failures remove only the exact optimistic `msg-local-*` that failed. They must never restore a captured whole-chat object, because that can erase messages, unread state or other mutations received while the request was in flight.

## Merge strategy

1. Do not merge PR #6 during Physical QA.
2. Treat the branch as frozen release candidate development.
3. New fixes must be P0/P1, security, QA, cost, or release hardening only.
4. Every runtime fix requires regression + exact-HEAD CI + new APK.
5. Infrastructure activation (`main` cron, WIF replacement, App Check enforcement, Play) must be separate reversible PRs after authorization.

## Current critical invariants

- A listing may remain `active` while reserved so browsing behavior does not change, but exactly one `listing_reservation_locks/{listingId}` document may exist. Transaction creation and lock creation are atomic. Cancellation/expiration must remove the lock atomically; completion makes the listing `sold_out`.
- In schema V2, any UI field called `product_id` that points at a marketplace listing carries a `listings_v2` ID unless an explicitly legacy-only path states otherwise.
- No cost cutover becomes active before exact-HEAD static/typecheck/build/Emulator/staging gates are green.
