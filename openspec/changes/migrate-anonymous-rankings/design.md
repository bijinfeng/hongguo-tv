# Design

## Context

See proposal.md. Fixed lists.go::RankList uses the existing signed anonymous bookmall GET, data.cell_view.cell_data and recursive cell_selector. Catalog already shares body-bounded anonymous transport and public drama/actor summaries; HTTP/native have one strict query pattern. No production ranking consumer exists.

## Goals / Non-Goals

Keep ranking state ephemeral and stateless in Rust until the later page owner chooses selectors and continuation. This core slice introduces no visual controls, persistent state, account interactions or alternate signature stack. Radar and full series/creator-album relationships remain separate tracked MVP work; unsupported summaries are filtered rather than marked playable.

## Decisions

- Reuse anonymous_catalog with the fixed cell/change/v endpoint, tab26 at offset0 and tab18 otherwise. A distinct RankQuery constructs exact signed params; no endpoint or credential injection. Opaque selector/session strings are bounded and control-free, preserving dynamic IDs rather than hardcoding today's menu.
- RankItem is a tagged drama/actor union, retaining public rank/heat labels when supplied. ActorSummary is reused, with no fabricated actor- prefixed series ID. First occurrence wins within each identity namespace; output follows upstream cell order, videos before actors as in the reference.
- Dynamic RankOption/RankPanel retain IDs, labels, selected and nested order with per-array and shared total/depth budgets. Malformed containers fail; unsupported/malformed records are filtered. Reuse existing drama summary and image policy instead of a second normalization path.
- Cursor fields come from data, or wholly from cell_view when data.next_offset is absent, matching the reference shape switch. Missing terminal offset may be0; continuing pages must advance and remain <=100000. Never turn a stalled cursor into a fabricated terminal page or derive progress from filtered card counts.
- HTTP/native use the same RankParams and query constructor. Generated schemas/types and contract tests make actors safe for downstream pages and agents. Default tests stay offline; the explicit anonymous probe prints aggregate counts only.

## Risks / Trade-offs

- Dynamic selector changes -> bounded opaque IDs and tree, no menu allowlist.
- Unsupported creator albums/series relationships -> retain as tracked work, never coerce into playable drama.
- Explicit anonymous shape reads observed742–757 selector nodes per first page; keep the complete tree under a finite2048 budget, with synthetic acceptance above750 and rejection past2048.
- Large or pathological payloads -> 4MiB response, <=128 per array, <=1024 content records, <=2048 selector nodes, <=8 nesting.
- Selector-dependent state races -> core remains stateless; later shared UI must fence by complete selection and source identity.

## Migration Plan

Add protocol fixtures and parser/query tests, transport and HTTP/native parity/cancellation, then codegen and full verify. Independently review functional implementation and approved UI scope. Append actual validation and update the ledger, commit only this core slice. No push, archive or release; rollback is a slice revert without storage changes.
