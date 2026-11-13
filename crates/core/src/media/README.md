# Media preparation

`MediaStore` consumes only a core model `Representation`. It never accepts a client-provided URL or path. An explicit loopback constructor rewrites every fixture request to that single origin; redirect, proxy and automatic retry are disabled.

Preparation validates MP4 metadata, ordinary AVC/HEVC and sample tables. Whole-sample CENC CTR with 8/16-byte IVs is supported for an authorized model carrying a valid content key. Subsample encryption, other schemes and vendor bytevc2 are rejected. Patching preserves file offsets. These checks do not prove that a decoder can display the sample; actual host playback is a separate acceptance step.

Strong ETag, exact 206 offsets and lengths allow incremental reads. Weak/missing validators, ignored ranges and late metadata use a separate streamed temporary file. Changed versions invalidate the current handle. Response bodies are never collected into a complete in-memory file.

Budgets per store: 16 MiB initialization, 512 KiB read blocks, two concurrent preparations, 512 MiB per file and total retained cache, 24 handles, 15 minutes idle. Individual HTTP work has a 12-second timeout; preparation has a 90-second deadline. Capacity and storage errors are explicit. Dropping preparation cancels owned HTTP work and drops the partial file and budget. Active read leases preserve resources after handle release; new chunks are refused after service close.

Each instance uses an app-owned `media/nsh-<random>` directory with private directory/file permissions on Unix. An instance lock protects live directories; a registry lock serializes initialization with stale reclamation. Only matching unlocked instance directories are reclaimed. History, legacy and unrelated paths are never imported or deleted. A weak background janitor expires idle handles without an incoming request. Closing clears handles; dropping the last resource removes its files and instance directory. Process crashes are reclaimed on next initialization. Windows cleanup is implemented but remains unverified on a real Windows host.

Tests use synthetic MP4 metadata and public NIST AES vectors, not copyrighted media captures or live credentials. HTTP routes and actual binary assembly belong to the next implementation batch.
