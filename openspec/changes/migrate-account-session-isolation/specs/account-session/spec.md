# Account session

## Purpose

通过真实红果扫码、手机号及必要验证流程建立可恢复的本机会话，使用户能够可靠地区分等待、确认、失败和已登录状态，并保护登录材料不进入公开响应、日志或其他账号的数据。

## ADDED Requirements

### Requirement: Verified login identity

The system SHALL publish a signed-in account only after Passport credentials and a consistent nonzero UID are verified; anonymous API success MUST NOT count as login.

#### Scenario: Missing credentials or mismatched UID

- **WHEN** the upstream response reports success without usable credentials or with conflicting identities
- **THEN** login fails without replacing the current account or library

### Requirement: Bounded cancellable login attempts

The system SHALL support QR and phone attempts with local opaque identities, bounded expiry, cancellation and stale-result rejection. QR secrets and internal tickets MUST remain in the core.

#### Scenario: Refresh supersedes an attempt

- **WHEN** an old attempt completes after refresh, backgrounding, leaving, switching method or cancellation
- **THEN** it cannot sign in or replace the new attempt

### Requirement: Phone recovery and additional verification

The system SHALL support the reference country codes, truthful SMS delivery states and cooldown, existing App codes, and upstream SMS verification challenges. Sending codes or SMS MUST require the corresponding user action.

#### Scenario: Delivery is uncertain

- **WHEN** a submitted send-code request times out without a definitive response
- **THEN** the UI reports uncertainty, retains the cooldown, and does not automatically resend

### Requirement: Durable session and reliable logout

The system SHALL atomically persist validated sessions with private filesystem permissions and publish account changes only after persistence succeeds. Logout SHALL clear credentials before publishing the guest account; corrupt files MUST be preserved and reported.

#### Scenario: Session save fails

- **WHEN** session persistence or deletion cannot complete
- **THEN** the current account remains active and no false login or logout is reported

### Requirement: Real-flow acceptance

The system SHALL use authorized real login, restart and logout flows for functional acceptance; synthetic states, protocol vectors and loopback tests SHALL only prove their stated boundaries.

#### Scenario: Offline tests pass

- **WHEN** all synthetic account tests pass without a real authorized login
- **THEN** account functionality remains pending real-flow acceptance
