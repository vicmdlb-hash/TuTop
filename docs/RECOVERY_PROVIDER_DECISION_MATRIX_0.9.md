# TuTop 0.9 — Recovery Provider Decision Matrix

No provider is enabled by this document. Runtime remains `disabled` until a verified channel and cost/legal decision exist.

| Option | Identity strength | Cost/ops | Privacy | Abuse controls required | Firebase impact | Recommendation |
|---|---|---|---|---|---|---|
| Verified email | Medium–High if address ownership is confirmed | Low | Requires storing verified email | enumeration resistance, TTL, 3-attempt cap, replay prevention | Can use verified email flow or secure backend | Best low-cost first option if university/personal email verification is available |
| Verified SMS | High for control of current phone number, not civil identity | Variable/paid at scale | Phone metadata processed by provider | SIM-swap awareness, rate limits, anti-enumeration, resend cooldown | May require Firebase phone auth/Identity Platform/billing depending architecture | Do not activate in 0.9 without explicit cost/provider decision |
| Recovery codes | High if issued after an already-verified session and stored safely | Very low | Minimal external data | one-time hashes, rotation, secure display, no plaintext storage | Can be implemented server-side without SMS | Strong secondary recovery method, not ideal as sole recovery for general users |

## Required invariant for every provider

- Generic responses: never reveal whether an account exists.
- Challenge TTL: 10 minutes maximum in current contract.
- Maximum 3 verification attempts per challenge.
- Replay must fail after first successful consumption.
- Server-side or trusted verification; never trust a client-only boolean.
- Recovery must be auditable without logging secret codes/tokens.
- Existing authenticated password-change flow remains separate from forgotten-password recovery.

## Current decision

`provider = disabled`

Preferred evaluation order: **verified email → recovery codes as secondary → SMS only after cost/privacy/billing review**.
