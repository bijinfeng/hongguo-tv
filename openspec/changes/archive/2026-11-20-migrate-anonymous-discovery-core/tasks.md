# Tasks

## 1. Anonymous protocol and discovery domain

- [x] 1.1 Port the fixed public-plan Medusa profile with only matching shared primitives, pin/provenance its deterministic vectors and all four AESV3 branches, and pass protocol plus existing playback signing/identity tests without new dependencies or changing playback headers.
- [x] 1.2 Add typed allowlisted discovery parsing and a bounded independent anonymous service under CatalogClient; test exact IDs, keyword-only suggestions, mixed boards, budgets, signed request privacy, coalescing/cache, cancellation/retry and sanitized failure bounds, and document a Rust-only explicit live probe.

## 2. Shared transport and verification

- [x] 2.1 Expose the strict read-only HTTP/native route and generated contracts; prove matching success/error and pre-network rejection of parameters/bodies with isolated transport tests, regenerate/check OpenAPI and preserve existing routes.
- [x] 2.2 Run full pnpm verify plus strict OpenSpec/codegen checks, perform the documented anonymous Rust probe and record its exact result/limits, resolve independent function and UI-scope reviews, update validation/ledger/roadmap, preserve parallel work and commit only this slice locally without push/archive/publish. Keep the consuming UI, C3.2 and security/release tasks open.
