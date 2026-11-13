# Spec Delta

## Purpose

提供不依赖页面布局、账号凭据或旧 Go 运行时的目录查询能力，使 Web、桌面与 TV 能通过稳定的数据契约读取官网搜索结果和剧集详情，并以可重复的离线样本验证兼容性与错误边界。

## ADDED Requirements

### Requirement: Anonymous paginated search

The system SHALL trim search terms, accept 1–80 Unicode characters and offsets 0–100000, and query the anonymous website source. Responses SHALL contain items, has_more, next_offset and source=web. Continuations SHALL keep website page semantics; unsupported sources SHALL fail explicitly.

#### Scenario: Normalized website page
- **WHEN** a page contains duplicate series, numeric 19-digit IDs, actor rows and invalid IDs
- **THEN** results contain only unique valid drama rows with exact string IDs, and next_offset equals the consumed page number

#### Scenario: Empty or final page
- **WHEN** rows are empty or the current page reaches totalPages
- **THEN** items is an array and has_more is false even if the upstream flag is true

#### Scenario: Invalid query or pagination
- **WHEN** the term is empty/overlong, offset is malformed/out of range, source is unsupported, or page metadata mismatches
- **THEN** input errors return a stable validation code without a request, while invalid upstream metadata returns a stable upstream-data error

### Requirement: Detail and episode identity

The system SHALL accept nonzero decimal series IDs of 1–32 digits, parse website router data without evaluating JavaScript, and verify the returned series ID. It SHALL retain current shared DTO fields and produce ordered episodes with exact string video IDs and accessible/locked semantics matching the fixed reference.

#### Scenario: Restricted episodes
- **WHEN** detail contains five video IDs and accessible_episode_cnt=3
- **THEN** episodes have one-based indexes and only the last two are locked

#### Scenario: Missing access count and malformed detail
- **WHEN** access count is absent/zero or larger than the video list
- **THEN** all listed episodes are accessible, matching reference behavior
- **AND** a missing/mismatched seriesDetail or truncated router JSON fails rather than returning an empty success

#### Scenario: Unsupported content family
- **WHEN** detail requests a creator-album content type
- **THEN** the request fails explicitly instead of being treated as an ordinary drama

### Requirement: Bounded isolated transport

Directory requests SHALL use a fixed production website origin without account credentials or redirects. Search bodies SHALL be bounded to 4 MiB and detail bodies to 12 MiB; each attempt SHALL time out within five seconds and the operation within twelve seconds. At most one retry SHALL occur for transport/read/5xx failures; dropping the query future SHALL cancel its work.

#### Scenario: Verification challenge and malformed response
- **WHEN** the website returns a verification-required 403, redirect, malformed JSON or oversized body
- **THEN** the system returns a stable sanitized error and does not retry or expose the response body, cookies or requested URL

#### Scenario: Transient failure or cancellation
- **WHEN** a transient attempt fails
- **THEN** at most one retry uses the same encoded query and page
- **AND** dropping a pending operation prevents retries and releases the pending response

### Requirement: HTTP and generated contract compatibility

The existing search/detail routes SHALL call the same reusable Rust catalog service available to future native adapters. Their success/error envelopes and schema SHALL be generated from Rust. Host/Origin, request-body and method restrictions SHALL remain intact, and unimplemented playback/account/storage capabilities SHALL remain unavailable.

#### Scenario: Directory route behavior
- **WHEN** a caller requests search or detail through an allowed authority/origin
- **THEN** it receives generated directory DTOs or a stable error envelope; wrong authority/origin is rejected before upstream access

#### Scenario: Honest capabilities and generation
- **WHEN** status and generated contracts are inspected
- **THEN** search support is true, playback/account remain false, search/detail schemas are present, and TypeScript imports use generated directory types

### Requirement: Offline compatibility evidence

Default directory tests SHALL run without Go, external network, live accounts or media. Synthetic fixtures SHALL identify the fixed reference SHA and source behaviors, and include expected normalized output. Real website checks SHALL remain opt-in and report their own outcome separately from fixture results.

#### Scenario: Deterministic fixture regression
- **WHEN** default tests run in an offline environment
- **THEN** successful, empty, malformed, mismatch, pagination, timeout, cancellation and retry cases are tested against local data or a loopback fixture server
