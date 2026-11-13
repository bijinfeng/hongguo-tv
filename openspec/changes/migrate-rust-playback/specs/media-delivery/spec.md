# Spec Delta

## Purpose

Deliver validated playback media through the application's own service with reliable seeking, bounded resource use and explicit expiration. Prevent upstream URLs or filesystem paths from becoming user-controlled media proxy inputs.

## ADDED Requirements

### Requirement: Media resources use opaque local identities

The service SHALL issue opaque media handles bound to one prepared episode and representation. Requests MUST NOT accept arbitrary upstream URLs or filesystem paths. Unknown, malformed or expired handles MUST fail without disclosing secrets or opening unrelated resources.

#### Scenario: A handle is tampered with

- **WHEN** a media request contains an unknown handle, traversal path or upstream URL
- **THEN** it fails without network access to the supplied target or access outside the media store

#### Scenario: The service restarts

- **WHEN** a player reuses an expired handle or a handle from an earlier service instance
- **THEN** it receives an explicit unavailable response and can resolve the selected episode again

### Requirement: Range and HEAD describe the same representation

Media GET and HEAD SHALL expose the prepared representation's media type, byte length and range capability. Single satisfiable byte ranges SHALL return 206 with correct Content-Range and Content-Length; malformed or unsatisfiable ranges SHALL return 416 with the total length. HEAD MUST return no body.

#### Scenario: Native player seeks

- **WHEN** a player requests a valid closed, open-ended or suffix byte range
- **THEN** it receives exactly those bytes with consistent 206 headers

#### Scenario: Range is invalid

- **WHEN** a request uses a multipart, overflowing, reversed or out-of-bounds range
- **THEN** the response is 416 with `Content-Range: bytes */<length>` and no media body

#### Scenario: Player probes media

- **WHEN** HEAD requests the same handle and range as GET
- **THEN** status and representation headers agree with GET and HEAD transfers no media bytes

### Requirement: Incremental reads preserve media identity

Range delivery SHALL keep one stable media representation across reads. It MUST validate upstream status, requested offsets, lengths and validators before accepting data. An upstream representation change MUST NOT silently combine bytes from different versions.

#### Scenario: Upstream changes during seeking

- **WHEN** the origin changes its validator or returns inconsistent Content-Range
- **THEN** the current representation is invalidated and the player receives a recoverable failure instead of mixed media bytes

#### Scenario: Upstream ignores Range

- **WHEN** an origin sends an entire large resource for a small range request
- **THEN** the service stops the invalid incremental read and either uses a separately bounded full-file preparation path or reports a preparation failure

### Requirement: Media work is bounded and cancelable

Preparation and delivery SHALL enforce deadlines, concurrency, memory, file-size and cache limits. Disconnects and cancellation SHALL stop owned pending work and release permits and temporary files. In-use resources MUST remain valid until their current read finishes; eviction MUST NOT remove unrelated history or legacy data.

#### Scenario: A resource exceeds limits

- **WHEN** declared or received media bytes exceed the configured limit
- **THEN** preparation fails before publishing the resource and removes partial files

#### Scenario: A client stops reading

- **WHEN** a streaming client disconnects during a slow upstream read
- **THEN** the associated read is canceled and its resources are released within a bounded interval

#### Scenario: Cache pressure occurs

- **WHEN** prepared resources reach the configured capacity
- **THEN** the service evicts only eligible inactive resources or rejects new work with an explicit recoverable error

### Requirement: Media transport retains development origin policy

Media routes SHALL enforce the same explicit listener and origin policy as the JSON API. Allowed browser clients SHALL be able to read seek-related headers. Media responses and errors MUST NOT expose signed origins, content keys or local paths, and MUST NOT be cached as public shared content.

#### Scenario: Cross-origin media request

- **WHEN** a disallowed browser origin requests a valid media handle
- **THEN** the service rejects it before media delivery

#### Scenario: Allowed browser seeks

- **WHEN** the configured browser origin reads partial media
- **THEN** it can inspect Content-Range, Accept-Ranges and Content-Length without broad wildcard CORS
