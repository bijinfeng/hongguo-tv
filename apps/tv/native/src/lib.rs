//! The Android TV T0 mixed-host probe.
//!
//! This crate is deliberately small. It proves the fixed NSH mixed boundary
//! and its owner-scoped task lifetime without pretending to be the migrated
//! content core.

use std::time::Duration;

use nsh_core::prelude::*;

/// The exports used by the TV T0 host probe.
#[native_module("hongguo-tv/native")]
fn native(registry: &mut Registry) {
    registry
        .register::<T0Task>()
        .module::<T0Probe>()
        .class::<T0Session>();
}

/// The owner-scoped asynchronous task probe events.
#[derive(Debug, Clone, PartialEq, Event)]
pub enum T0TaskEvent {
    /// The task completed before its owner was released.
    Complete,
}

/// A small component that demonstrates async cancellation on owner release.
#[component]
pub fn T0Task(cx: Scope<T0TaskEvent>) -> impl IntoElement {
    let task = spawn(async move {
        timer(Duration::from_millis(500)).await;
        cx.emit(T0TaskEvent::Complete);
    });
    cleanup(move || drop(task));
    view().child(text("t0-running").text_color(move || nsh_base::theme().foreground))
}

/// Small, deterministic calls used to verify the TSX → Rust → TSX boundary.
#[module]
pub struct T0Probe;

#[module]
impl T0Probe {
    /// Returns a stable marker from Rust.
    pub fn ping() -> String {
        "tv-t0-rust".to_owned()
    }
}

/// A disposable native object used to verify release semantics.
#[class]
#[derive(Default)]
pub struct T0Session;

#[class]
impl T0Session {
    /// Creates a new disposable probe session.
    pub fn new() -> Self {
        Self
    }

    /// Returns a marker while the session is alive.
    pub fn state(&self) -> String {
        "alive".to_owned()
    }
}
