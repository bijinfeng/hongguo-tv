# Spec Delta

## Purpose

将真实剧集详情中的演员与相关推荐接入完整浏览流程，使用户能在保持当前季和返回来源的同时进入演员作品或相关短剧；空数据、失败及不支持内容均明确处理，不以演示内容填补真实服务缺口。

## ADDED Requirements

### Requirement: Complete details preserve summary and transport boundaries

The system SHALL return actors and related drama summaries in complete details through both transports, while keeping ordinary summaries and persisted history free of detail extensions and reviews.

#### Scenario: Complete detail response

- **WHEN** a valid series detail is requested through HTTP or native transport
- **THEN** both return the same verified series identity, episodes, actors and related works, including explicit empty arrays
- **AND** existing summary fields remain compatible and browsing writes no history or media resources

### Requirement: Extract grounded bounded data without script execution

The system SHALL parse inline and deferred JSON from the fixed upstream detail format without executing scripts, reject oversized or mismatched responses, preserve exact decimal identities, and deduplicate valid actors and related works in upstream order.

#### Scenario: Deferred recommendation payload

- **WHEN** inline recommendations are empty and an eligible deferred recommendations entry exists
- **THEN** its JSON data is read without executing script contents, excluding the current series and duplicate related identities

#### Scenario: Actor identity is absent

- **WHEN** an actor has a valid display name but no usable actor ID
- **THEN** the name can be shown without an actionable works link

### Requirement: Complete detail ownership follows the current season

The system SHALL distinguish supplied episodes from complete metadata, retain usable supplied episodes while reading missing metadata, cache completed empty metadata, and reject late writes after selection, source, hidden, background or disposal ownership changes.

#### Scenario: Supplied episodes lack extensions

- **WHEN** the selected series already has valid episodes but lacks complete metadata
- **THEN** its episodes remain usable while missing metadata is read once and failures remain retryable

#### Scenario: Complete supplied detail or cached empty arrays

- **WHEN** a complete verified detail is supplied or was previously loaded
- **THEN** returning to that identity reuses it without another detail request

#### Scenario: Old season finishes late

- **WHEN** a request completes after switching season or losing its owner
- **THEN** its extensions neither appear for the new selection nor seed its cache

### Requirement: Detail discovery matches the shared layout and supports return

The system SHALL show actors followed by related works after episodes, hide each empty section, expose every valid item without silent truncation, and restore the exact source when returning from works or another detail, while respecting newer user focus intent.

#### Scenario: Actor and related browsing

- **WHEN** a user activates an identified actor or related work by pointer, keyboard or TV navigation
- **THEN** the corresponding existing destination opens with exact identity and returning restores that item and browsing position
- **AND** stale, hidden or background actions do not navigate

#### Scenario: Empty or long data

- **WHEN** extensions are empty, or contain many items and long names
- **THEN** empty sections are hidden and all valid entries remain reachable with readable labels and visible focus

### Requirement: Acceptance is based on real data and formal entry flows

The feature SHALL be accepted through actual user flows in the formal application entry against current real anonymous data. Synthetic datasets SHALL only supplement boundary and regression checks, and MUST NOT independently establish feature or MVP acceptance. Missing real data or unavailable services SHALL remain explicitly unaccepted.

#### Scenario: Only synthetic checks pass

- **WHEN** synthetic state and graphical host checks pass but the corresponding real production flow has not been observed
- **THEN** the feature remains implemented pending real acceptance
- **AND** the records distinguish real data, synthetic boundaries, engineering gates and platform coverage
