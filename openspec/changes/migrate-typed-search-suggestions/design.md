# Design

## Context

See proposal.md. Fixed upstream `hongguo_client.go::SearchSuggestions` calls `/incent_resource/suggestion` with app_id8662, count10 and query. It normalizes short_play_name, short_play_actor and common_query, preserving 19-digit IDs. Existing Rust CatalogClient owns an anonymous no-cookie/no-proxy/no-redirect website client, bounded fetch and cancellation by dropping futures. It has no suggestion method. HTTP/native parsers already reject unknown/duplicate query fields, and OpenAPI generates app DTOs.

## Goals / Non-Goals

**Goals:** Implement the fixed website protocol with stable typed DTOs and tighter trust boundaries, reuse existing transport behavior, and verify exact identities and cancellation without Go or accounts.

**Non-Goals:** No UI, actor works endpoint, UI debounce, history writes, persistent cache or suggestion analytics. These remain distinct pending work, not omitted MVP requirements. No changes to current search/discovery behavior or rollout status.

## Decisions

1. Add SuggestionQuery: trim, allow empty, cap100 Unicode characters and reject remaining control characters. Do not reuse paged SearchQuery (requires nonempty/max80) or local-history normalization (different limits). Empty is a local empty result; nonempty requests use the existing anonymous website client with fixed app_id/count. Use 256KiB response cap and existing two-attempt/12s total bounds; no cache of private typed terms and no discovery device registration.
2. Preserve legacy envelope fields kind/key/name/actor_id/meta/drama, using a closed serialized kind enum and generated TS types. Unknown kind becomes common_query and cannot carry nested drama/actor metadata. Only short_play_name with valid nonzero decimal video_data series ID and supported content_type1/7/1004 (or absent) gets a bounded Drama summary; never use keyword as fallback ID. Actor IDs remain strings and never become Drama. Dedupe by kind and semantic identity (series/actor/name), retaining first upstream order.
3. Parse the direct suggest_list envelope strictly, require an array, reject trailing JSON and explicit nonzero code. Scan at most128 rows, emit at most10. Names/fallback display_words are plain, control-free, max100 characters; title fallback is suggestion name. Reuse discovery's HTTPS image-host allowlist in the owning parse helper. Summaries omit detail episodes/intro, metadata accepts at most3 bounded categories, one bounded upstream heat label and positive episode count; no fabricated rank/heat. Invalid optional fields are omitted.
4. Add strict only-q HTTP/native request structs and common core validation; reject nonempty HTTP GET body and all native bodies. Existing method/origin/media-only boundaries remain, including Axum's automatic HEAD and existing CORS preflight; native None/Some expresses GET/POST only, not every HTTP method. Generate and commit OpenAPI/TS instead of maintaining compatibility DTOs by hand.
5. Offline inputs/expected fixtures derive from the pinned upstream test shape with synthetic text/URLs. Core tests cover numeric precision, fallback/duplicates/bounds/malformed data, actual request URL/privacy/limits/retry/cancel. Native tests compare the same fixtures and failure categories with HTTP and exercise cancellation/closure. Live anonymous availability, if probed, is explicit and logs counts only; no UI completion claim.

## Risks / Trade-offs

- Website schema drift → strict envelopes fail honestly, malformed rows do not create bogus details; no broad recursive parser.
- Actor names without valid IDs → retain nonplayable actor suggestion; the later UI must not pretend actor works are available before that migration.
- Tight summary bounds can omit optional metadata → preserve the usable name/action and document fixed limits rather than importing arbitrary upstream payloads.
- Query privacy → no caches/logged terms/account service coupling; cancellation tests inspect sockets and native ownership.
- Later UI consumption → suggestion names permit100 characters, while current ordinary search/history permit80. The UI slice must reconcile these limits and activation semantics, without silently truncating terms, submitting opaque keys or pretending actor works are migrated.

## Migration Plan

Add parser/client and fixtures, expose HTTP/native plus codegen, run targeted and full validation, independent function/UI-scope reviews, then append evidence and commit this slice locally. No push/archive/publish. The following UI change consumes the generated contract and gets its own host matrix and reviews. Rollback removes this additive endpoint without touching persisted history.
