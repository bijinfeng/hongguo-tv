//! Fixed Passport protocols. Credentials and challenges never implement Debug or enter API DTOs.
mod client;
mod cloud;
mod crypto;
mod device;
mod phone;
mod qr;
mod sign;

pub(crate) use phone::PhoneNumber;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub(crate) use client::PassportClient;
pub(crate) use cloud::{CloudCard, CloudError, CloudFavorite, CloudHistory, CloudLibrary};

/// Only bounded, non-private categories may leave this protocol boundary.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum PassportError {
    InvalidInput,
    Configuration,
    Transport,
    Timeout,
    InvalidResponse,
    InvalidIdentity,
    MissingCredentials,
    InvalidRedirect,
    LoginRejected,
    CodeRejected,
    ChallengeExpired,
    UpstreamHttp { status: u16, retry_after: u32 },
}
impl std::fmt::Display for PassportError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.code())
    }
}
impl std::error::Error for PassportError {}
impl PassportError {
    pub(crate) fn code(self) -> &'static str {
        match self {
            Self::InvalidInput => "ACCOUNT_INVALID_INPUT",
            Self::Configuration => "ACCOUNT_CONFIGURATION_ERROR",
            Self::Transport => "ACCOUNT_CONNECTION_FAILED",
            Self::Timeout => "ACCOUNT_TIMEOUT",
            Self::InvalidResponse => "ACCOUNT_RESPONSE_INVALID",
            Self::InvalidIdentity => "ACCOUNT_IDENTITY_INVALID",
            Self::MissingCredentials => "ACCOUNT_CREDENTIAL_MISSING",
            Self::InvalidRedirect => "ACCOUNT_REDIRECT_INVALID",
            Self::LoginRejected => "ACCOUNT_LOGIN_REJECTED",
            Self::CodeRejected => "ACCOUNT_CODE_REJECTED",
            Self::ChallengeExpired => "ACCOUNT_CHALLENGE_EXPIRED",
            Self::UpstreamHttp { .. } => "ACCOUNT_UPSTREAM_HTTP",
        }
    }
    pub(crate) fn retry_after(self) -> u32 {
        match self {
            Self::UpstreamHttp { retry_after, .. } => retry_after,
            _ => 0,
        }
    }
}

/// Private on-disk credential payload. It is intentionally not a wire schema or log value.
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct PersistedSession {
    device_id: String,
    install_id: String,
    cookies: BTreeMap<String, String>,
    token: String,
    device: device::Device,
    registered: bool,
    uid: Option<String>,
}
impl PersistedSession {
    pub(crate) fn fresh() -> Result<Self, PassportError> {
        Ok(Self {
            device_id: String::new(),
            install_id: String::new(),
            cookies: BTreeMap::new(),
            token: String::new(),
            device: device::Device::new()?,
            registered: false,
            uid: None,
        })
    }
    pub(crate) fn validate(&self) -> Result<(), PassportError> {
        self.device.validate()?;
        if (self.registered && (!valid_id(&self.device_id) || !valid_id(&self.install_id)))
            || (!self.registered && (!self.device_id.is_empty() || !self.install_id.is_empty()))
            || self.cookies.len() > 64
            || self.cookies.iter().any(|(k, v)| !valid_cookie(k, v))
            || self
                .cookies
                .iter()
                .map(|(key, value)| key.len() + value.len() + 3)
                .sum::<usize>()
                > 128 * 1024
            || self.token.len() > 16384
            || !header_value(&self.token)
            || self.uid.as_deref().is_some_and(|uid| !valid_id(uid))
        {
            return Err(PassportError::InvalidResponse);
        }
        if self.uid.is_some() && (!self.registered || !self.has_credentials()) {
            return Err(PassportError::MissingCredentials);
        }
        Ok(())
    }
    pub(crate) fn validate_for_uid(&self, uid: &str) -> Result<(), PassportError> {
        self.validate()?;
        if !valid_id(uid) || self.uid.as_deref() != Some(uid) {
            return Err(PassportError::InvalidIdentity);
        }
        if !self.registered || !self.has_credentials() {
            return Err(PassportError::MissingCredentials);
        }
        Ok(())
    }
    pub(crate) fn is_registered(&self) -> bool {
        self.registered
    }
    pub(crate) fn has_credentials(&self) -> bool {
        !self.token.is_empty()
            || self.cookies.get("sessionid").is_some_and(|v| !v.is_empty())
            || self
                .cookies
                .get("sessionid_ss")
                .is_some_and(|v| !v.is_empty())
    }
    pub(crate) fn without_credentials(&self) -> Self {
        let mut next = self.clone();
        next.token.clear();
        next.uid = None;
        next.cookies.retain(|key, _| {
            matches!(
                key.as_str(),
                "store-region" | "store-region-src" | "ttreq" | "odin_tt" | "install_id"
            )
        });
        next
    }
}

pub(crate) struct VerifiedSession {
    pub(crate) uid: String,
    pub(crate) name: String,
    pub(crate) credential: PersistedSession,
}

#[derive(Clone)]
pub(crate) struct QrChallenge {
    pub(crate) image: String,
    pub(crate) expires_at: u64,
    token: String,
}
pub(crate) struct QrConfirmation {
    redirect: Option<String>,
}
pub(crate) enum QrPoll {
    Pending,
    Scanned,
    Confirmed(QrConfirmation),
    Cancelled,
    Expired,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum PhoneCodeState {
    Sent,
    Uncertain,
    Rejected,
    Limited,
}
pub(crate) struct PhoneCodeResult {
    pub(crate) state: PhoneCodeState,
    pub(crate) retry_after: u32,
    pub(crate) error: Option<PassportError>,
}
#[derive(Clone)]
pub(crate) struct PhoneChallenge {
    pub(crate) sms_number: String,
    pub(crate) sms_content: String,
    encrypt_uid: String,
    code_key: String,
    log_id: String,
}
pub(crate) enum PhoneLogin {
    Verified(VerifiedSession),
    Mfa(PhoneChallenge),
}
pub(crate) enum MfaResult {
    Pending,
    Ticket(String),
}

fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 32
        && value.bytes().all(|b| b.is_ascii_digit())
        && value.bytes().any(|b| b != b'0')
}
fn header_value(value: &str) -> bool {
    value.bytes().all(|b| b >= 32 && b != 127)
}
fn valid_cookie(name: &str, value: &str) -> bool {
    !name.is_empty()
        && name.len() <= 128
        && name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-'))
        && value.len() <= 16384
        && header_value(value)
        && !value.contains(';')
}
fn now_millis() -> Result<u64, PassportError> {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| PassportError::Configuration)
        .and_then(|d| u64::try_from(d.as_millis()).map_err(|_| PassportError::Configuration))
}

#[cfg(test)]
mod tests;

#[cfg(test)]
pub(crate) use tests::verified_fixture;
