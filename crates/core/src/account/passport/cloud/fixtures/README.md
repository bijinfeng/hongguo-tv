# Cloud protocol fixtures

Synthetic, offline responses adapted from fixed upstream `de9712bf358dcbdf8a188e26cba711e3e5354e8a`, `core/cmd/hongguotv/cloud_test.go:17–371` and `cloud.go:304–584`. IDs are fixed protocol-test values; titles and image addresses are synthetic. No account credentials, SMS content, production account responses or private user records are included.

`library.json` covers numeric/string IDs, history milliseconds, favorite/progress seconds, season metadata, favorite-only membership and signed batch card lookup. Pagination and invalid-response variants are constructed in `tests.rs` so boundary cases remain readable. These fixtures prove protocol boundaries only, not real-account or product acceptance.
