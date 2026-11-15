use super::{HistoryChange, Library, LibraryError, LibraryStore};
use ring::rand::{SecureRandom, SystemRandom};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    panic::AssertUnwindSafe,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, OnceLock, Weak},
};
use tokio::sync::{Mutex as AsyncMutex, watch};
use utoipa::ToSchema;

/// Open a local guest write session; this is not an account or authentication session.
#[derive(Debug, Clone, Default, Deserialize, Serialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct LibraryWriteSessionRequest {
    /// Absent or empty for guests.
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
}
impl WriteSessions {
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
pub(super) fn shared_sessions(path: &Path) -> Result<Arc<WriteSessions>, LibraryError> {
    static STORES: OnceLock<Mutex<HashMap<PathBuf, Weak<WriteSessions>>>> = OnceLock::new();
    let mut stores = STORES
        .get_or_init(Mutex::default)
        .lock()
        .map_err(|_| LibraryError::Storage)?;
    stores.retain(|_, sessions| sessions.strong_count() > 0);
    if let Some(sessions) = stores.get(path).and_then(Weak::upgrade) {
        return Ok(sessions);
    }
    let sessions = Arc::new(WriteSessions::default());
    stores.insert(path.to_owned(), Arc::downgrade(&sessions));
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
        if request.owner_id.as_ref().is_some_and(|id| !id.is_empty()) {
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
        change.validate()?;
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
        session.sequence = sequence;
        session.last = Some(operation.clone());
        let connection = self.0.clone();
        let sessions = self.1.clone();
        let executing = operation.clone();
        // Registration and spawn are one synchronous critical section; no waiter owns execution.
        tokio::task::spawn_blocking(move || {
            let result = std::panic::catch_unwind(AssertUnwindSafe(|| {
                let mut connection = connection.lock().map_err(|_| LibraryError::Storage)?;
                super::store::apply(&mut connection, change)
            }))
            .unwrap_or(Err(LibraryError::Storage));
            executing.terminal.send_replace(Some(result));
            // Keep the registry discoverable if the native store reopens while this worker runs.
            drop(sessions);
        });
        Ok(operation)
    }
}

#[cfg(test)]
mod tests;
