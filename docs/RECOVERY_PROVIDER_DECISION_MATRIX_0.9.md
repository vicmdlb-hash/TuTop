# TuTop 0.9 — Recovery Provider Decision Matrix

No provider is enabled by this document. Runtime remains `disabled` until a verified channel and cost/legal decision exist.

| Option | Identity strength | Cost/ops | Privacy | Abuse controls required | Firebase impact | Recommendation |
|---|---|---|---|---|---|---|
| Verified email | Medium–High if address ownership is confirmed | Low | Requires storing verified email | anti-enumeration, TTL, 3-attempt cap, replay prevention, resend cooldown, per-identifier issuance/fanout limit | Can use verified email flow or secure backend | Best low-cost first option if university/personal email verification is available |
| Verified SMS | High for control of current phone number, not civil identity | Variable/paid at scale | Phone metadata processed by provider | SIM-swap awareness, anti-enumeration, resend cooldown, rate/fanout limits, provider abuse controls | May require Firebase phone auth/Identity Platform/billing depending architecture | Do not activate in 0.9 without explicit cost/provider decision |
| Recovery codes | High if issued after an already-verified session and stored safely | Very low | Minimal external data | one-time hashes, rotation, secure display, no plaintext storage, replay prevention | Can be implemented server-side without SMS | Strong secondary recovery method, not ideal as sole recovery for general users |

## Required invariant for every provider

- Generic responses: never reveal whether an account exists.
- Challenge TTL: 10 minutes maximum in current contract.
- Maximum 3 verification attempts per challenge.
- Replay must fail after first successful consumption.
- Enforce issuance cooldown and a bounded number of simultaneously active challenges per identifier.
- Server-side or trusted verification; never trust a client-only boolean.
- Recovery must be auditable without logging identifiers, secret codes or tokens.
- Existing authenticated password-change flow remains separate from forgotten-password recovery.
- SMS, if ever selected, requires explicit SIM-swap/rate-limit/cost/privacy review before enabling billing or Identity Platform.

## Current decision

`provider = disabled`

Preferred evaluation order: **verified email → recovery codes as secondary → SMS only after cost/privacy/billing review**.
