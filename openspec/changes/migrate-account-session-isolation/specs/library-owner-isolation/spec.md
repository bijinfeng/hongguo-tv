# Library owner isolation

## Purpose

使游客和每个已验证账号保留独立的本机观看记录，登录、退出和切换账号时不丢弃已有记录，并阻止旧请求、检查点和写入回执跨越账号边界影响新会话。

## ADDED Requirements

### Requirement: Independent owner storage

The system SHALL keep guest and each authenticated account library independent, validate persistent owner identity on open, and never choose an account library solely from a caller-supplied owner.

#### Scenario: Logout restores guest records

- **WHEN** an account with its own history logs out
- **THEN** the unchanged guest library becomes active and the account history remains available for a later login

#### Scenario: Database belongs to another owner

- **WHEN** a database is opened as a different account or a guest database is presented as an account library
- **THEN** opening fails without rewriting its owner or records

### Requirement: Ordered owner transition

The system SHALL finish admitted old-owner checkpoints before switching, invalidate old write sessions including account A-to-B-to-A transitions, and publish account and library coherently. Unresolved writes MUST prevent an unsafe switch.

#### Scenario: Late old response

- **WHEN** an old read or receipt arrives after account switching
- **THEN** it cannot overwrite the active snapshot or dispatch into the new owner

#### Scenario: Return to the same account

- **WHEN** the user switches away from account A and later returns to A
- **THEN** the old A write session cannot execute and a new session is required
