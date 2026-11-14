//! Thin Desktop mixed assembly; shared native use cases live in native-bridge.
mod updates;

use nsh_core::prelude::*;

/// Core exports used by the Desktop entry.
#[native_module("hongguo-desktop/native")]
fn native(registry: &mut Registry) {
    hongguo_native_bridge::register(registry);
    registry.module::<updates::DesktopUpdateReceipt>();
}
