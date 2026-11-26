# Spec Delta

## Purpose

Remove the Web client as a product while keeping every guest-history behavior unchanged. Only the acceptance host named in the shared-verification scenario changes: the same tests now run from `apps/harness` instead of a shipping Web entry.

## MODIFIED Requirements

### Requirement: Compatible transport and generated contracts

Library GET/POST SHALL use generated Rust DTOs and the existing envelope. Exact Host/Origin checks, JSON requirements and the 32 KiB request limit SHALL remain enforced. Responses SHALL disable caching and capability reporting SHALL distinguish available guest history from unavailable account/playback.

#### Scenario: Shared clients and offline verification

- **WHEN** the harness, desktop and TV run their shared behavior tests with local data
- **THEN** existing history semantics remain compatible, generated contracts have no drift, and tests need neither Go nor live accounts
