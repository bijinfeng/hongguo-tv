//! Verified account attempts and owner-scoped local sessions. Credentials never cross DTOs.
pub(crate) mod passport;
mod persistence;
mod service;

pub use service::AccountService;
pub use service::follow::{
    FollowItem, FollowMutationRequest, FollowMutationResult, FollowQuery, FollowSnapshot,
};
pub use service::notifications::{
    NotificationItem, NotificationKind, NotificationMarkReadRequest, NotificationQuery,
    NotificationSnapshot,
};
pub use service::reservation::{
    ReservationItem, ReservationMutationRequest, ReservationMutationResult, ReservationQuery,
    ReservationSnapshot, ReservationTarget,
};

use crate::library::Library;
use serde::{Deserialize, Serialize};
use std::{error::Error, fmt};
use utoipa::ToSchema;

/// Public account identity; no session credentials or upstream response objects.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct AccountProfile {
    /// Verified nonzero decimal identity, kept as a string.
    pub uid: String,
    /// Display name, bounded by the core.
    pub name: String,
}

/// Input method for the current attempt.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum LoginMethod {
    /// Official website QR login.
    Qr,
    /// Passport phone and SMS login.
    Phone,
}

/// A bounded user-visible attempt phase, independent of upstream status spelling.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum LoginState {
    /// Waiting for a QR scan or an existing code.
    Pending,
    /// Scanned; the phone must confirm.
    Scanned,
    /// Completing confirmed login.
    Processing,
    /// Upstream confirmed dispatch of the code.
    CodeSent,
    /// Dispatch outcome is unknown; do not resend automatically.
    Uncertain,
    /// Additional user-sent SMS verification is required.
    Mfa,
    /// Attempt deadline passed.
    Expired,
    /// Explicitly cancelled or superseded.
    Cancelled,
    /// Recoverable attempt failure.
    Failed,
}

/// Safe presentation of an attempt. IDs are local and contain no upstream token.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct AccountLogin {
    /// Random local attempt identity.
    pub id: String,
    /// Selected login method.
    pub method: LoginMethod,
    /// Current phase.
    pub state: LoginState,
    /// Fixed expiration in Unix milliseconds.
    pub expires_at: u64,
    /// Validated bounded PNG data URL for QR login.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub image: Option<String>,
    /// Masked phone number, never the submitted number.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub phone: Option<String>,
    /// Remaining resend cooldown in seconds.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub retry_after: Option<u32>,
    /// Upstream destination the user must text during additional verification.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub sms_number: Option<String>,
    /// Upstream SMS content; only present while this challenge is active.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub sms_content: Option<String>,
    /// Optional validated QR image of the user-sent SMS instruction.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub sms_image: Option<String>,
    /// Sanitized recovery copy, without upstream payloads.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub error: Option<String>,
}

/// Authoritative local account state. Local recovery does not assert remote session validity.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct Account {
    /// Whether a verified session is stored locally.
    pub logged_in: bool,
    /// Empty for guests; otherwise the verified profile UID.
    pub owner_id: String,
    /// Opaque scope generation; changes on restart and every committed owner transition.
    pub owner_epoch: String,
    /// Verified display identity.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub profile: Option<AccountProfile>,
    /// Whether the host attached the real QR service.
    pub qr_login_available: bool,
    /// Whether the host attached the real Passport phone service.
    pub phone_login_available: bool,
    /// Cloud synchronization state, independent of local login success.
    #[serde(default)]
    #[schema(required = true)]
    pub sync: AccountSyncStatus,
    /// Eligible guest history counts; absent until successfully computed for this scope.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub guest_history: Option<GuestHistoryStatus>,
    /// Active or terminal attempt, until replaced or cancelled.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub login: Option<AccountLogin>,
    /// Sanitized local recovery failure.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub error: Option<String>,
}

/// One serialized synchronization phase for the current account scope.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum AccountSyncState {
    /// Local-only operation; no cloud success or availability is implied.
    #[default]
    Local,
    /// No work is currently waiting.
    Idle,
    /// Durable work is waiting for synchronization.
    Pending,
    /// A bounded synchronization round is running.
    Syncing,
    /// A round failed; records and pending work remain available.
    Error,
}

/// Safe synchronization summary without credentials or upstream responses.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct AccountSyncStatus {
    /// Current phase.
    pub state: AccountSyncState,
    /// Number of durable pending operations.
    pub pending: u32,
    /// Unix milliseconds of the last fully committed successful round.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub last_sync: Option<i64>,
    /// Safe recovery message; never raw remote or storage diagnostics.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub error: Option<String>,
}

/// Counts read from this application's guest library for the current account scope.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct GuestHistoryStatus {
    /// Total guest history records before eligibility checks.
    pub total: u64,
    /// Valid newer records eligible for explicit import.
    pub available: u64,
}

/// Counts belonging to one confirmed import result, never reconstructed after a lost response.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct GuestHistoryImportResult {
    /// Records committed by this import.
    pub imported: u64,
    /// Eligible records still remaining after that commit.
    pub remaining: u64,
}

/// Explicit user intent; sensitive inputs are never debug formatted or persisted.
#[derive(Clone, Serialize, Deserialize, ToSchema)]
#[serde(tag = "action", rename_all = "snake_case", deny_unknown_fields)]
pub enum AccountCommand {
    /// Obtain a new official login QR.
    QrStart {},
    /// Poll the exact locally issued QR attempt.
    QrPoll {
        /// Local attempt identity.
        id: String,
    },
    /// Cancel an exact attempt; cannot cancel a replacement.
    Cancel {
        /// Local attempt identity.
        id: String,
    },
    /// Prepare a phone attempt, optionally sending a code on explicit user action.
    PhoneStart {
        /// A supported calling code, for example +86.
        country_code: String,
        /// User-entered local phone number.
        phone: String,
        /// True only when the user selected the send-code action.
        send_code: bool,
    },
    /// Submit the entered code to this phone attempt.
    PhoneLogin {
        /// Local attempt identity.
        id: String,
        /// A four-to-eight digit code. Never persisted.
        code: String,
    },
    /// Check whether the user-sent SMS challenge has completed.
    PhoneVerify {
        /// Local attempt identity.
        id: String,
    },
    /// Reliably clear credentials and restore the guest library.
    Logout {},
    /// Wake the account's existing synchronization worker.
    Sync {},
    /// Explicitly import eligible guest viewing history into this account.
    ImportGuestHistory {},
}

/// Owner precondition prevents an old page from changing a different active account.
#[derive(Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct AccountCommandRequest {
    /// Expected current owner, empty for guests.
    pub owner_id: String,
    /// Exact scope generation from the current account snapshot.
    pub owner_epoch: String,
    /// Explicit account command.
    pub command: AccountCommand,
}

/// One coherent account/library snapshot, also used after a lost command response.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct AccountCommandResult {
    /// Current durable account.
    pub account: Account,
    /// Committed snapshot of its local library.
    pub library: Library,
    /// Present only for a confirmed import; reconciliation does not invent its counts.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub import_history: Option<GuestHistoryImportResult>,
}

/// Sanitized transport-independent account failures.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AccountError {
    /// The command contract exists but its behavior has not been connected.
    NotImplemented,
    /// Request does not meet the account contract.
    InvalidInput,
    /// Attempt was cancelled, replaced or expired.
    AttemptExpired,
    /// Another request is still using this attempt.
    Busy,
    /// A polling or resend cooldown is still active.
    Limited,
    /// Active library owner changed.
    OwnerChanged,
    /// Failed private session persistence.
    Storage,
    /// Existing session is invalid and must be preserved for diagnosis.
    InvalidSession,
    /// Upstream account transport or response failed.
    Upstream,
    /// Credentials or verified identity do not match.
    IdentityMismatch,
    /// Old-owner history could not be committed safely.
    Library,
    /// Explicit import cannot fit any new progress in the durable cloud queue.
    LibrarySyncQueueFull,
    /// Follow reads and writes require the current authenticated account.
    FollowLoginRequired,
    /// A bounded follow pull could not establish complete membership.
    FollowIncomplete,
    /// Upstream definitively rejected the requested follow operation.
    FollowRejected,
    /// Follow transport or a required local step is unavailable.
    FollowUnavailable,
    /// A dispatched mutation has no reliable acknowledgement; read before retrying.
    FollowUncertain,
    /// Another explicit follow mutation is still admitted.
    FollowBusy,
    /// Reservation reads and writes require an authenticated account.
    ReservationLoginRequired,
    /// Complete reservation membership could not be established.
    ReservationIncomplete,
    /// Upstream definitively rejected the reservation operation.
    ReservationRejected,
    /// Reservation transport or local persistence is unavailable.
    ReservationUnavailable,
    /// A dispatched reservation write has no reliable acknowledgement.
    ReservationUncertain,
    /// Another online account mutation is still admitted.
    ReservationBusy,
    /// Update notifications require an authenticated account.
    NotificationLoginRequired,
    /// A complete follow or reservation source could not be read.
    NotificationIncomplete,
    /// Notification storage or its source transport is unavailable.
    NotificationUnavailable,
    /// Notification read request is malformed or names an invalid item.
    NotificationInvalidRead,
}
impl AccountError {
    /// Stable code without upstream response data.
    pub fn code(self) -> &'static str {
        match self {
            Self::NotImplemented => "ACCOUNT_NOT_IMPLEMENTED",
            Self::InvalidInput => "ACCOUNT_REQUEST_INVALID",
            Self::AttemptExpired => "ACCOUNT_ATTEMPT_EXPIRED",
            Self::Busy => "ACCOUNT_ATTEMPT_BUSY",
            Self::Limited => "ACCOUNT_RATE_LIMITED",
            Self::OwnerChanged => "ACCOUNT_OWNER_CHANGED",
            Self::Storage => "ACCOUNT_STORAGE_UNAVAILABLE",
            Self::InvalidSession => "ACCOUNT_SESSION_INVALID",
            Self::Upstream => "ACCOUNT_UPSTREAM_UNAVAILABLE",
            Self::IdentityMismatch => "ACCOUNT_IDENTITY_MISMATCH",
            Self::Library => "ACCOUNT_LIBRARY_UNAVAILABLE",
            Self::LibrarySyncQueueFull => "LIBRARY_SYNC_QUEUE_FULL",
            Self::FollowLoginRequired => "ACCOUNT_FOLLOW_LOGIN_REQUIRED",
            Self::FollowIncomplete => "ACCOUNT_FOLLOW_INCOMPLETE",
            Self::FollowRejected => "ACCOUNT_FOLLOW_REJECTED",
            Self::FollowUnavailable => "ACCOUNT_FOLLOW_UNAVAILABLE",
            Self::FollowUncertain => "ACCOUNT_FOLLOW_UNCERTAIN",
            Self::FollowBusy => "ACCOUNT_FOLLOW_BUSY",
            Self::ReservationLoginRequired => "ACCOUNT_RESERVATION_LOGIN_REQUIRED",
            Self::ReservationIncomplete => "ACCOUNT_RESERVATION_INCOMPLETE",
            Self::ReservationRejected => "ACCOUNT_RESERVATION_REJECTED",
            Self::ReservationUnavailable => "ACCOUNT_RESERVATION_UNAVAILABLE",
            Self::ReservationUncertain => "ACCOUNT_RESERVATION_UNCERTAIN",
            Self::ReservationBusy => "ACCOUNT_RESERVATION_BUSY",
            Self::NotificationLoginRequired => "ACCOUNT_NOTIFICATION_LOGIN_REQUIRED",
            Self::NotificationIncomplete => "ACCOUNT_NOTIFICATION_INCOMPLETE",
            Self::NotificationUnavailable => "ACCOUNT_NOTIFICATION_UNAVAILABLE",
            Self::NotificationInvalidRead => "ACCOUNT_NOTIFICATION_INVALID_READ",
        }
    }
}
impl fmt::Display for AccountError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::NotImplemented => "此账号操作尚未开放",
            Self::InvalidInput => "账号参数无效，请检查后重试",
            Self::AttemptExpired => "登录已过期或取消，请重新登录",
            Self::Busy => "登录操作尚未结束，请稍候",
            Self::Limited => "请求过于频繁，请稍后重试",
            Self::OwnerChanged => "账号已变化，请重新读取",
            Self::Storage => "账号保存失败，请检查磁盘与目录权限后重试",
            Self::InvalidSession => "已保存的账号数据不兼容或损坏，原文件已保留",
            Self::Upstream => "登录服务暂不可用，请稍后重试",
            Self::IdentityMismatch => "登录身份未能确认，请重新登录",
            Self::Library => "观看记录尚未准备好，请先重试保存或读取",
            Self::LibrarySyncQueueFull => "待同步记录已满，请先同步后重试",
            Self::FollowLoginRequired => "登录后查看和操作追更",
            Self::FollowIncomplete => "追更列表未能完整读取，请刷新重试",
            Self::FollowRejected => "追更操作未被接受，请刷新状态后重试",
            Self::FollowUnavailable => "追更服务暂不可用，请稍后重试",
            Self::FollowUncertain => "追更结果待确认，请先刷新状态",
            Self::FollowBusy => "追更操作尚未结束，请稍候",
            Self::ReservationLoginRequired => "登录后查看和操作预约",
            Self::ReservationIncomplete => "预约列表未能完整读取，请刷新重试",
            Self::ReservationRejected => "预约操作未被接受，请刷新状态后重试",
            Self::ReservationUnavailable => "预约服务暂不可用，请稍后重试",
            Self::ReservationUncertain => "预约结果待确认，请先刷新状态",
            Self::ReservationBusy => "账号操作尚未结束，请稍候",
            Self::NotificationLoginRequired => "登录后查看更新提醒",
            Self::NotificationIncomplete => "更新提醒来源未能完整读取，请刷新重试",
            Self::NotificationUnavailable => "更新提醒暂不可用，请稍后重试",
            Self::NotificationInvalidRead => "更新提醒操作无效，请刷新后重试",
        })
    }
}
impl Error for AccountError {}
