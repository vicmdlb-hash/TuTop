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

## Merge strategy

1. Do not merge PR #6 during Physical QA.
2. Treat the branch as frozen release candidate development.
3. New fixes must be P0/P1, security, QA, or release hardening only.
4. Every runtime fix requires regression + exact-HEAD CI + new APK.
5. Infrastructure activation (`main` cron, WIF replacement, App Check enforcement, Play) must be separate reversible PRs after authorization.

## Current critical invariant

A listing may remain `active` while reserved so browsing behavior does not change, but exactly one `listing_reservation_locks/{listingId}` document may exist. Transaction creation and lock creation are atomic. Cancellation/expiration must remove the lock atomically; completion makes the listing `sold_out`.
