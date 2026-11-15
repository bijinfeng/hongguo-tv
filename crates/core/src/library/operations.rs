use super::{HistoryChange, Library, LibraryError, LibraryStore};
use ring::rand::{SecureRandom, SystemRandom};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    panic::AssertUnwindSafe,
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex, OnceLock, Weak,
        atomic::{AtomicUsize, Ordering},
    },
};
use tokio::sync::{Mutex as AsyncMutex, Notify, watch};
use utoipa::ToSchema;

/// Open a local owner-scoped write session; this is not an authentication session.
#[derive(Debug, Clone, Default, Deserialize, Serialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct LibraryWriteSessionRequest {
    /// Must match the opened owner; absent or empty only for guests.
    #[serde(default)]
    pub owner_id: Option<String>,
}

/// Issued only after the previous session is sealed and its registered work has terminated.
#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
pub struct LibraryWriteSession {
    /// Opaque 32-character lowercase hexadecimal token, local to this store lifetime.
    pub session_id: String,
}

/// Both query parameters are required; operation IDs start at 1 and are consecutive.
#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct LibraryOperationIdentity {
    /// The server-issued local write session.
    pub session_id: String,
    /// Canonical decimal integer, 1–9007199254740991, represented without number coercion.
    pub operation_id: String,
}

/// A registered operation's terminal outcome, independent of its original response delivery.
#[derive(Debug, Clone, PartialEq, Deserialize, Serialize, ToSchema)]
#[serde(tag = "status", rename_all = "lowercase")]
pub enum LibraryOperationOutcome {
    /// The durable transaction committed before this receipt was produced.
    Committed {
        /// Snapshot returned by that exact transaction, not a later GET.
        library: Library,
    },
    /// Execution ended with a sanitized failure; business retry must use a new operation ID.
    Failed {
        /// Stable core failure category.
        code: String,
        /// Sanitized recovery message.
        error: String,
    },
}

/// Only a receipt matching the captured identity proves original execution has terminated.
#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
pub struct LibraryOperation {
    /// Captured server-issued session identity.
    pub session_id: String,
    /// Captured exact operation identity.
    pub operation_id: String,
    /// Registered terminal result; transport errors are never converted to this value.
    pub outcome: LibraryOperationOutcome,
}

#[derive(Default)]
pub(super) struct WriteSessions {
    current: Mutex<Option<Session>>,
    handoff: AsyncMutex<()>,
    blocking: AtomicUsize,
    settled: Notify,
}
impl WriteSessions {
    pub(super) fn begin_blocking(self: &Arc<Self>) -> Result<BlockingCall, LibraryError> {
        self.blocking
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |count| {
                count.checked_add(1)
            })
            .map_err(|_| LibraryError::Storage)?;
        Ok(BlockingCall(self.clone()))
    }

    async fn wait_blocking(&self) {
        loop {
            let settled = self.settled.notified();
            tokio::pin!(settled);
            settled.as_mut().enable();
            if self.blocking.load(Ordering::Acquire) == 0 {
                return;
            }
            settled.await;
        }
    }

    pub(super) async fn wait_registered(&self) -> Result<(), LibraryError> {
        let operation = self
            .current
            .lock()
            .map_err(|_| LibraryError::Storage)?
            .as_ref()
            .and_then(|session| session.last.clone());
        if let Some(operation) = operation {
            // Reads wait for known original execution, including a failed terminal transaction.
            let _ = operation.wait().await;
        }
        Ok(())
    }
}
pub(super) struct BlockingCall(Arc<WriteSessions>);
impl Drop for BlockingCall {
    fn drop(&mut self) {
        if self.0.blocking.fetch_sub(1, Ordering::AcqRel) == 1 {
            self.0.settled.notify_waiters();
        }
    }
}
pub(super) fn shared_sessions(
    path: &Path,
    owner: &str,
) -> Result<Arc<WriteSessions>, LibraryError> {
    type StoreIdentity = (PathBuf, String);
    static STORES: OnceLock<Mutex<HashMap<StoreIdentity, Weak<WriteSessions>>>> = OnceLock::new();
    let mut stores = STORES
        .get_or_init(Mutex::default)
        .lock()
        .map_err(|_| LibraryError::Storage)?;
    stores.retain(|_, sessions| sessions.strong_count() > 0);
    let identity = (path.to_owned(), owner.to_owned());
    if let Some(sessions) = stores.get(&identity).and_then(Weak::upgrade) {
        return Ok(sessions);
    }
    let sessions = Arc::new(WriteSessions::default());
    stores.insert(identity, Arc::downgrade(&sessions));
    Ok(sessions)
}
struct Session {
    id: String,
    sealed: bool,
    sequence: u64,
    last: Option<Arc<Operation>>,
}
struct Operation {
    payload: Vec<u8>,
    terminal: watch::Sender<Option<Result<Library, LibraryError>>>,
}
impl Operation {
    async fn wait(&self) -> Result<Library, LibraryError> {
        let mut receiver = self.terminal.subscribe();
        loop {
            let result = receiver.borrow().clone();
            if let Some(result) = result {
                return result;
            }
            receiver
                .changed()
                .await
                .map_err(|_| LibraryError::Storage)?;
        }
    }
}

impl LibraryStore {
    /// Seal the former session before waiting; cancellation cannot reopen it or cancel its work.
    pub async fn write_session(
        &self,
        request: LibraryWriteSessionRequest,
    ) -> Result<LibraryWriteSession, LibraryError> {
        if request.owner_id.as_deref().unwrap_or_default() != self.2 {
            return Err(LibraryError::OwnerChanged);
        }
        let _handoff = self.1.handoff.lock().await;
        let previous = {
            let mut current = self.1.current.lock().map_err(|_| LibraryError::Storage)?;
            current.as_mut().and_then(|session| {
                session.sealed = true;
                session.last.clone()
            })
        };
        if let Some(previous) = previous {
            // A failed terminal transaction is also finished and cannot write later.
            let _ = previous.wait().await;
        }
        self.run(|_| Ok(())).await?;
        let mut nonce = [0_u8; 16];
        SystemRandom::new()
            .fill(&mut nonce)
            .map_err(|_| LibraryError::Storage)?;
        let id: String = nonce.iter().map(|byte| format!("{byte:02x}")).collect();
        *self.1.current.lock().map_err(|_| LibraryError::Storage)? = Some(Session {
            id: id.clone(),
            sealed: false,
            sequence: 0,
            last: None,
        });
        Ok(LibraryWriteSession { session_id: id })
    }

    /// Seal prior tokens and wait for admitted work before an authenticated owner switch.
    /// Cancellation leaves the old session sealed and never cancels an accepted transaction.
    pub async fn invalidate_write_sessions(&self) -> Result<(), LibraryError> {
        let _handoff = self.1.handoff.lock().await;
        let previous = {
            let mut current = self.1.current.lock().map_err(|_| LibraryError::Storage)?;
            current.as_mut().and_then(|session| {
                session.sealed = true;
                session.last.clone()
            })
        };
        if let Some(previous) = previous {
            let _ = previous.wait().await;
        }
        self.1.wait_blocking().await;
        *self.1.current.lock().map_err(|_| LibraryError::Storage)? = None;
        Ok(())
    }

    /// Start once, or wait for the identical original operation. Dropping the waiter cannot abort it.
    pub async fn apply_operation(
        &self,
        identity: LibraryOperationIdentity,
        change: HistoryChange,
    ) -> Result<LibraryOperation, LibraryError> {
        let operation = self.register_operation(&identity, change)?;
        let outcome = match operation.wait().await {
            Ok(library) => LibraryOperationOutcome::Committed { library },
            Err(error) => LibraryOperationOutcome::Failed {
                code: error.code().into(),
                error: error.to_string(),
            },
        };
        Ok(LibraryOperation {
            session_id: identity.session_id,
            operation_id: identity.operation_id,
            outcome,
        })
    }

    fn register_operation(
        &self,
        identity: &LibraryOperationIdentity,
        change: HistoryChange,
    ) -> Result<Arc<Operation>, LibraryError> {
        let sequence = identity
            .operation_id
            .parse::<u64>()
            .map_err(|_| LibraryError::InvalidInput)?;
        if sequence == 0
            || sequence > 9_007_199_254_740_991
            || sequence.to_string() != identity.operation_id
            || identity.session_id.len() != 32
            || !identity
                .session_id
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        {
            return Err(LibraryError::InvalidInput);
        }
        change.validate(&self.2)?;
        let payload = serde_json::to_vec(&change).map_err(|_| LibraryError::InvalidInput)?;
        let mut current = self.1.current.lock().map_err(|_| LibraryError::Storage)?;
        let session = current
            .as_mut()
            .filter(|session| session.id == identity.session_id && !session.sealed)
            .ok_or(LibraryError::SessionExpired)?;
        if sequence == session.sequence {
            let operation = session
                .last
                .as_ref()
                .ok_or(LibraryError::OperationSequence)?;
            if operation.payload != payload {
                return Err(LibraryError::OperationConflict);
            }
            return Ok(operation.clone());
        }
        if sequence != session.sequence + 1 {
            return Err(LibraryError::OperationSequence);
        }
        if session
            .last
            .as_ref()
            .is_some_and(|last| last.terminal.borrow().is_none())
        {
            return Err(LibraryError::OperationPending);
        }
        let (terminal, _) = watch::channel(None);
        let operation = Arc::new(Operation { payload, terminal });
        let admission = self.1.begin_blocking()?;
        session.sequence = sequence;
        session.last = Some(operation.clone());
        let connection = self.0.clone();
        let owner = self.2.clone();
        let executing = operation.clone();
        // Registration and spawn are one synchronous critical section; no waiter owns execution.
        tokio::task::spawn_blocking(move || {
            // Keep the registry discoverable until this admitted worker has actually exited.
            let _admission = admission;
            let result = std::panic::catch_unwind(AssertUnwindSafe(|| {
                let mut connection = connection.lock().map_err(|_| LibraryError::Storage)?;
                super::store::apply(&mut connection, change, &owner)
            }))
            .unwrap_or(Err(LibraryError::Storage));
            executing.terminal.send_replace(Some(result));
        });
        Ok(operation)
    }
}

#[cfg(test)]
mod tests;
