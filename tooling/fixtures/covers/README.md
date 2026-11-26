# Fixture covers

Synthetic 640×914 portrait covers for local test fixtures (`calendar-fixture.mjs`,
`rankings-fixture.mjs`, `seasons-fixture.mjs`). They are neutral artwork, not catalog data: a fixture
must never ship a real title's poster, because the poster then reads as a claim about that title.

These three files were carried over from the removed HTML prototype's `assets/component-covers/`,
which is the only place they existed and had no entry in that prototype's media `sources.json`.
Their author and licence are therefore unknown. Treat them as **test-only placeholders to be
replaced**: do not publish them outside fixture responses, and replace them with freely licensed
artwork when one is picked. `home.jpg` was never present; the loader falls back to a sibling that
does, so adding one is optional.
