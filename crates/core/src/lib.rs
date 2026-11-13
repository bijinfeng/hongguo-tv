//! Platform-independent domain rules and anonymous catalog queries. No NSH or account state.
pub mod catalog;
pub mod media;

use serde::Serialize;
use utoipa::ToSchema;

/// Implemented capabilities, shared by every transport.
#[derive(Debug, Serialize, ToSchema)]
#[non_exhaustive]
pub struct Capabilities {
    /// Real content search is available.
    pub search: bool,
    /// Real media resolution and streaming are available.
    pub playback: bool,
    /// Persistent account and history are available.
    pub account: bool,
}

impl Default for Capabilities {
    fn default() -> Self {
        Self {
            search: true,
            playback: false,
            account: false,
        }
    }
}

/// Runtime readiness is separate from content migration progress.
#[derive(Debug, Serialize, ToSchema)]
#[non_exhaustive]
pub struct CoreStatus {
    /// Version of the wire contract.
    pub api_version: String,
    /// Build version.
    pub version: String,
    /// Available product functions.
    pub capabilities: Capabilities,
}

impl Default for CoreStatus {
    fn default() -> Self {
        Self {
            api_version: "v1".into(),
            version: env!("CARGO_PKG_VERSION").into(),
            capabilities: Capabilities::default(),
        }
    }
}
