use super::{
    Account, AccountCommand, AccountCommandRequest, AccountCommandResult, AccountError,
    AccountLogin, AccountProfile, AccountSyncStatus, GuestHistoryStatus, LoginMethod, LoginState,
    passport::{
        MfaResult, PassportClient, PassportError, PersistedSession, PhoneChallenge, PhoneCodeState,
        PhoneLogin, PhoneNumber, QrChallenge, QrPoll, VerifiedSession,
    },
    persistence::{SavedSession, SessionStore},
};
use crate::library::{
    HistoryChange, Library, LibraryError, LibraryOperation, LibraryOperationIdentity,
    LibraryOperationOutcome, LibraryStore, LibraryWriteSession, LibraryWriteSessionRequest,
};
use crate::watch_statistics::{
    WatchStatisticsAppendResult, WatchStatisticsBatch, WatchStatisticsError, WatchStatisticsScope,
    WatchStatisticsService, WatchStatisticsSnapshot,
};
use ring::rand::{SecureRandom, SystemRandom};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tokio::sync::{Mutex, OwnedMutexGuard};

#[path = "follow.rs"]
pub(super) mod follow;
#[path = "notifications.rs"]
pub(super) mod notifications;
#[path = "online.rs"]
mod online;
#[path = "reservation.rs"]
pub(super) mod reservation;
#[path = "sync.rs"]
mod sync;

/// One local account coordinator shared by HTTP or native transports, never a public multiuser manager.
#[derive(Clone)]
pub struct AccountService {
    state: Arc<Mutex<State>>,
    storage: SessionStore,
    directory: PathBuf,
    statistics: WatchStatisticsService,
    sync: Arc<sync::SyncRuntime>,
    online: Arc<online::OnlineRuntime>,
}
struct State {
    saved: Option<SavedSession>,
    device: Option<PersistedSession>,
    guest: LibraryStore,
    library: LibraryStore,
    attempt: Option<Attempt>,
    cooldowns: HashMap<String, Instant>,
    legacy_guest: bool,
    epoch: String,
    sync_view: AccountSyncStatus,
    syncing: bool,
    sync_error: Option<String>,
    guest_history: Option<GuestHistoryStatus>,
}
struct Attempt {
    view: AccountLogin,
    alive: Arc<AtomicBool>,
    deadline: Instant,
    next_poll: Instant,
    cooldown_key: Option<String>,
    work: Arc<Mutex<AttemptWork>>,
}
struct AttemptWork {
    client: PassportClient,
    qr: Option<QrChallenge>,
    phone: Option<PhoneNumber>,
    mfa: Option<PhoneChallenge>,
    code: Option<String>,
}
struct CancelOnDrop(Arc<AtomicBool>, bool);
impl Drop for CancelOnDrop {
    fn drop(&mut self) {
        if self.1 {
            self.0.store(false, Ordering::Release);
        }
    }
}

impl State {
    fn owner(&self) -> &str {
        self.saved.as_ref().map_or("", |s| s.profile.uid.as_str())
    }
    fn expire(&mut self) {
        if let Some(attempt) = &mut self.attempt {
            let state = if !attempt.alive.load(Ordering::Acquire) {
                Some(LoginState::Cancelled)
            } else if Instant::now() >= attempt.deadline {
                Some(LoginState::Expired)
            } else {
                None
            };
            if let Some(state) = state {
                attempt.alive.store(false, Ordering::Release);
                // Expiry is retained once reached, including after future snapshots.
                if attempt.view.state != LoginState::Expired {
                    attempt.view.state = state;
                }
                attempt.view.image = None;
                attempt.view.sms_content = None;
                attempt.view.sms_number = None;
                attempt.view.sms_image = None;
            }
        }
        self.cooldowns
            .retain(|_, deadline| *deadline > Instant::now());
    }
    fn account(&self) -> Account {
        let mut login = self.attempt.as_ref().map(|attempt| attempt.view.clone());
        if let Some(view) = &mut login {
            view.retry_after = self
                .attempt
                .as_ref()
                .and_then(|a| a.cooldown_key.as_ref())
                .and_then(|key| self.cooldowns.get(key))
                .map(|deadline| remaining(*deadline));
        }
        Account {
            logged_in: self.saved.is_some(),
            owner_id: self.owner().to_owned(),
            owner_epoch: self.epoch.clone(),
            profile: self.saved.as_ref().map(|s| s.profile.clone()),
            qr_login_available: true,
            phone_login_available: true,
            sync: self.sync_view.clone(),
            guest_history: self.guest_history.clone(),
            login,
            error: None,
        }
    }
    fn check_owner(&self, owner: &str) -> Result<(), AccountError> {
        if owner == self.owner() {
            Ok(())
        } else {
            Err(AccountError::OwnerChanged)
        }
    }
    fn check_scope(&self, owner: &str, epoch: &str) -> Result<(), AccountError> {
        self.check_owner(owner)?;
        if epoch == self.epoch {
            Ok(())
        } else {
            Err(AccountError::OwnerChanged)
        }
    }
    fn check_attempt(&mut self, id: &str) -> Result<&mut Attempt, AccountError> {
        self.expire();
        self.attempt
            .as_mut()
            .filter(|a| a.view.id == id && a.alive.load(Ordering::Acquire))
            .ok_or(AccountError::AttemptExpired)
    }
}

impl AccountService {
    /// Open only this application's explicit data directory; never imports legacy credentials.
    pub async fn open(directory: &Path, guest: LibraryStore) -> Result<Self, AccountError> {
        let (storage, saved, device) = SessionStore::open(directory).await?;
        let statistics = WatchStatisticsService::open(directory.join("watch-statistics.sqlite3"))
            .await
            .map_err(|_| AccountError::Storage)?;
        if guest
            .snapshot()
            .await
            .map_err(|_| AccountError::Library)?
            .owner_id
            .as_deref()
            .is_some_and(|owner| !owner.is_empty())
        {
            return Err(AccountError::Library);
        }
        let legacy_guest = saved.is_none();
        let library = match &saved {
            Some(saved) => LibraryStore::open_for_owner(
                directory
                    .join("accounts")
                    .join(format!("{}.sqlite3", saved.profile.uid)),
                saved.profile.uid.clone(),
            )
            .await
            .map_err(|_| AccountError::Library)?,
            None => guest.clone(),
        };
        library
            .snapshot()
            .await
            .map_err(|_| AccountError::Library)?;
        Ok(Self {
            state: Arc::new(Mutex::new(State {
                saved,
                device,
                guest,
                library,
                attempt: None,
                cooldowns: HashMap::new(),
                legacy_guest,
                epoch: random_id()?,
                sync_view: AccountSyncStatus::default(),
                syncing: false,
                sync_error: None,
                guest_history: None,
            })),
            storage,
            directory: directory.to_owned(),
            statistics,
            sync: Arc::new(sync::SyncRuntime::default()),
            online: Arc::new(online::OnlineRuntime::default()),
        })
    }

    /// Configure a loopback-only upstream for transport integration tests.
    #[cfg(feature = "test-support")]
    pub fn configure_loopback_for_tests(&self, origin: &str) {
        *self.online.fixture.lock().expect("follow fixture") = Some(origin.to_owned());
    }

    /// Install a deterministic verified owner for transport integration tests.
    #[cfg(feature = "test-support")]
    pub async fn install_loopback_account_for_tests(&self, uid: &str) -> Result<(), AccountError> {
        let verified = super::passport::synthetic_verified_fixture(uid);
        let saved = SavedSession {
            profile: AccountProfile {
                uid: verified.uid,
                name: verified.name,
            },
            credential: verified.credential,
        };
        let library = LibraryStore::open_for_owner(
            self.directory
                .join("accounts")
                .join(format!("{uid}.sqlite3")),
            uid.to_owned(),
        )
        .await
        .map_err(|_| AccountError::Library)?;
        self.commit(self.state.clone().lock_owned().await, Some(saved), library)
            .await
    }
    /// Read statistics only for the active owner and epoch. The scope lock is held
    /// through the storage operation so an owner transition cannot overtake it.
    pub async fn watch_statistics_snapshot(
        &self,
        owner_id: &str,
        owner_epoch: &str,
        as_of_day: &str,
    ) -> Result<WatchStatisticsSnapshot, WatchStatisticsError> {
        let _state = self.state.lock().await;
        _state
            .check_scope(owner_id, owner_epoch)
            .map_err(|_| WatchStatisticsError::OwnerChanged)?;
        self.statistics
            .snapshot(
                &WatchStatisticsScope {
                    owner_id: owner_id.to_owned(),
                    owner_epoch: owner_epoch.to_owned(),
                },
                as_of_day,
            )
            .await
    }

    /// Append a bounded statistics batch for the active owner and epoch.
    pub async fn append_watch_statistics(
        &self,
        owner_id: &str,
        owner_epoch: &str,
        as_of_day: &str,
        batch: WatchStatisticsBatch,
    ) -> Result<WatchStatisticsAppendResult, WatchStatisticsError> {
        let _state = self.state.lock().await;
        _state
            .check_scope(owner_id, owner_epoch)
            .map_err(|_| WatchStatisticsError::OwnerChanged)?;
        self.statistics
            .append(
                &WatchStatisticsScope {
                    owner_id: owner_id.to_owned(),
                    owner_epoch: owner_epoch.to_owned(),
                },
                as_of_day,
                batch,
            )
            .await
    }

    /// Reset only the active owner's statistics; history and account data remain intact.
    pub async fn reset_watch_statistics(
        &self,
        owner_id: &str,
        owner_epoch: &str,
        as_of_day: &str,
    ) -> Result<WatchStatisticsSnapshot, WatchStatisticsError> {
        let _state = self.state.lock().await;
        _state
            .check_scope(owner_id, owner_epoch)
            .map_err(|_| WatchStatisticsError::OwnerChanged)?;
        self.statistics
            .reset(
                &WatchStatisticsScope {
                    owner_id: owner_id.to_owned(),
                    owner_epoch: owner_epoch.to_owned(),
                },
                as_of_day,
            )
            .await
    }

    /// Current local session; this does not claim that a cloud session is still valid.
    pub async fn snapshot(&self) -> Account {
        let mut state = self.state.lock().await;
        state.expire();
        if !self.sync.is_running() {
            state.syncing = false;
        }
        if state.refresh_sync_view().await.is_err() {
            state.sync_view.state = super::AccountSyncState::Error;
            state.sync_view.error = Some("本机同步状态读取失败，请重试".into());
        }
        state.account()
    }

    /// Reconcile account and library together after a lost mutation response.
    pub async fn state(&self) -> Result<AccountCommandResult, AccountError> {
        self.online.drain().await;
        let mut state = self.state.lock().await;
        state.expire();
        if !self.sync.is_running() {
            state.syncing = false;
        }
        state.refresh_sync_view().await?;
        Ok(AccountCommandResult {
            import_history: None,
            account: state.account(),
            library: state
                .library
                .snapshot()
                .await
                .map_err(|_| AccountError::Library)?,
        })
    }

    /// Snapshot only the authenticated active library, optionally checking a caller precondition.
    pub async fn library_snapshot(&self, owner: Option<&str>) -> Result<Library, LibraryError> {
        let state = self.state.lock().await;
        if owner.is_some_and(|owner| owner != state.owner()) {
            return Err(LibraryError::OwnerChanged);
        }
        state.library.snapshot().await
    }
    /// Apply to the authenticated library; request owner is a precondition, never a selector.
    pub async fn apply_history(&self, change: HistoryChange) -> Result<Library, LibraryError> {
        if !change.is_history() {
            return Err(LibraryError::InvalidInput);
        }
        let state = self.state.lock().await;
        // Compatibility writes have no epoch. After any switch only registered operations are safe.
        if !state.legacy_guest || state.saved.is_some() {
            return Err(LibraryError::SessionExpired);
        }
        state.library.apply(change).await
    }
    /// Issue a new write session in the active owner scope.
    pub async fn write_session(
        &self,
        request: LibraryWriteSessionRequest,
    ) -> Result<LibraryWriteSession, LibraryError> {
        let state = self.state.lock().await;
        state.library.write_session(request).await
    }
    /// Execute or replay an exact registered operation in the active owner scope.
    pub async fn apply_operation(
        &self,
        identity: LibraryOperationIdentity,
        change: HistoryChange,
    ) -> Result<LibraryOperation, LibraryError> {
        let state = self.state.lock().await;
        let library = state.library.clone();
        let runtime = self.sync.clone();
        let mut work = Box::pin(async move {
            let result = library.apply_operation(identity, change).await?;
            if matches!(result.outcome, LibraryOperationOutcome::Committed { .. }) {
                runtime.wake();
            }
            Ok(result)
        });
        // Register under the owner lock, then retain only the completion waiter on caller loss.
        tokio::select! {
            biased;
            result = work.as_mut() => return result,
            _ = std::future::ready(()) => {},
        }
        drop(state);
        tokio::spawn(work)
            .await
            .map_err(|_| LibraryError::Storage)?
    }

    /// Execute one explicit command. Dropping network work cancels its uncommitted attempt.
    pub async fn command(
        &self,
        request: AccountCommandRequest,
    ) -> Result<AccountCommandResult, AccountError> {
        {
            let state = self.state.lock().await;
            state.check_scope(&request.owner_id, &request.owner_epoch)?;
        }
        match request.command {
            AccountCommand::Sync {} => {
                return self
                    .request_sync(&request.owner_id, &request.owner_epoch)
                    .await;
            }
            AccountCommand::ImportGuestHistory {} => {
                return self
                    .import_history(&request.owner_id, &request.owner_epoch)
                    .await;
            }
            AccountCommand::QrStart {} => {
                self.start(&request.owner_id, &request.owner_epoch, None, false)
                    .await?
            }
            AccountCommand::PhoneStart {
                country_code,
                phone,
                send_code,
            } => {
                let phone = PhoneNumber::parse(&country_code, &phone).map_err(protocol_error)?;
                self.start(
                    &request.owner_id,
                    &request.owner_epoch,
                    Some(phone),
                    send_code,
                )
                .await?;
            }
            AccountCommand::Cancel { id } => {
                let mut state = self.state.lock().await;
                state.check_scope(&request.owner_id, &request.owner_epoch)?;
                // Repeated cancellation is harmless; an old ID cannot cancel its replacement.
                if let Some(attempt) = &state.attempt {
                    if attempt.view.id != id {
                        return Err(AccountError::AttemptExpired);
                    }
                    attempt.alive.store(false, Ordering::Release);
                }
                state.expire();
            }
            AccountCommand::Logout {} => {
                let state = self.state.clone().lock_owned().await;
                state.check_scope(&request.owner_id, &request.owner_epoch)?;
                if let Some(attempt) = &state.attempt {
                    attempt.alive.store(false, Ordering::Release);
                }
                let guest = state.guest.clone();
                self.commit(state, None, guest).await?;
            }
            command => {
                self.advance(&request.owner_id, &request.owner_epoch, command)
                    .await?
            }
        }
        self.state().await
    }

    async fn start(
        &self,
        owner: &str,
        epoch: &str,
        phone: Option<PhoneNumber>,
        send_code: bool,
    ) -> Result<(), AccountError> {
        let id = random_id()?;
        let alive = Arc::new(AtomicBool::new(true));
        let mut cancellation = CancelOnDrop(alive.clone(), true);
        let duration = if phone.is_some() { 600 } else { 180 };
        let mut state = self.state.lock().await;
        state.check_scope(owner, epoch)?;
        state.expire();
        let cooldown_key = phone.as_ref().map(PhoneNumber::cooldown_key);
        if send_code
            && cooldown_key
                .as_ref()
                .is_some_and(|key| state.cooldowns.contains_key(key))
        {
            return Err(AccountError::Limited);
        }
        let client = match &state.device {
            Some(device) => PassportClient::new(device.clone()),
            None => PassportClient::anonymous(),
        }
        .map_err(protocol_error)?;
        if let Some(old) = &state.attempt {
            old.alive.store(false, Ordering::Release);
        }
        let work = Arc::new(Mutex::new(AttemptWork {
            client,
            qr: None,
            phone,
            mfa: None,
            code: None,
        }));
        let masked = work.lock().await.phone.as_ref().map(PhoneNumber::masked);
        state.attempt = Some(Attempt {
            view: AccountLogin {
                id: id.clone(),
                method: if masked.is_some() {
                    LoginMethod::Phone
                } else {
                    LoginMethod::Qr
                },
                state: LoginState::Processing,
                expires_at: now_millis()?.saturating_add(duration * 1000),
                image: None,
                phone: masked,
                retry_after: None,
                sms_number: None,
                sms_content: None,
                sms_image: None,
                error: None,
            },
            alive: alive.clone(),
            deadline: Instant::now() + Duration::from_secs(duration),
            next_poll: Instant::now(),
            cooldown_key: cooldown_key.clone(),
            work: work.clone(),
        });
        // Reserve the cooldown before dispatch: cancellation or uncertain delivery cannot bypass it.
        if send_code && let Some(key) = &cooldown_key {
            state
                .cooldowns
                .insert(key.clone(), Instant::now() + Duration::from_secs(60));
        }
        drop(state);
        let mut protocol = work.lock().await;
        if protocol.phone.is_some() {
            if send_code {
                let registered = protocol
                    .client
                    .register_device()
                    .await
                    .map_err(protocol_error);
                if let Err(error) = registered {
                    self.fail(&id, error).await;
                    cancellation.1 = false;
                    return Err(error);
                }
                let device = protocol.client.credential().without_credentials();
                self.save_registered_device(owner, epoch, &id, device)
                    .await?;
                let phone = protocol
                    .phone
                    .as_ref()
                    .ok_or(AccountError::InvalidInput)?
                    .clone();
                let result = protocol.client.send_code(&phone).await;
                let mut state = self.state.lock().await;
                let retry = match &result {
                    Ok(result) => result.retry_after,
                    Err(error) => error.retry_after(),
                };
                if let Some(key) = &cooldown_key {
                    let deadline =
                        Instant::now() + Duration::from_secs(u64::from(retry.clamp(60, 86400)));
                    let previous = state.cooldowns.entry(key.clone()).or_insert(deadline);
                    *previous = (*previous).max(deadline);
                }
                state.check_owner(owner)?;
                let view = &mut state.check_attempt(&id)?.view;
                match result {
                    Ok(result) => {
                        view.state = match result.state {
                            PhoneCodeState::Sent => LoginState::CodeSent,
                            PhoneCodeState::Uncertain => LoginState::Uncertain,
                            PhoneCodeState::Rejected | PhoneCodeState::Limited => {
                                LoginState::Failed
                            }
                        };
                        view.error = result.error.map(safe_protocol_message);
                    }
                    Err(error) => {
                        view.state = LoginState::Failed;
                        view.error = Some(safe_protocol_message(error));
                    }
                }
            } else {
                // An existing App code still uses a legitimately registered device for login.
                protocol
                    .client
                    .register_device()
                    .await
                    .map_err(protocol_error)?;
                let device = protocol.client.credential().without_credentials();
                self.save_registered_device(owner, epoch, &id, device)
                    .await?;
                let mut state = self.state.lock().await;
                state.check_scope(owner, epoch)?;
                state.check_attempt(&id)?.view.state = LoginState::Pending;
            }
        } else {
            let qr = match protocol.client.qr_start().await {
                Ok(qr) => qr,
                Err(error) => {
                    let error = protocol_error(error);
                    self.fail(&id, error).await;
                    cancellation.1 = false;
                    return Err(error);
                }
            };
            let mut state = self.state.lock().await;
            state.check_owner(owner)?;
            let attempt = state.check_attempt(&id)?;
            let now = now_millis()?;
            let expires_at = qr.expires_at.min(now.saturating_add(600_000));
            if expires_at <= now {
                return Err(AccountError::AttemptExpired);
            }
            attempt.view.expires_at = expires_at;
            attempt.deadline = Instant::now() + Duration::from_millis(expires_at - now);
            attempt.view.image = Some(qr.image.clone());
            attempt.view.state = LoginState::Pending;
            protocol.qr = Some(qr);
        }
        cancellation.1 = false;
        Ok(())
    }

    async fn advance(
        &self,
        owner: &str,
        epoch: &str,
        command: AccountCommand,
    ) -> Result<(), AccountError> {
        let (id, kind) = match &command {
            AccountCommand::QrPoll { id } => (id.clone(), 0),
            AccountCommand::PhoneLogin { id, code } => {
                if !(4..=8).contains(&code.len()) || !code.bytes().all(|b| b.is_ascii_digit()) {
                    return Err(AccountError::InvalidInput);
                }
                (id.clone(), 1)
            }
            AccountCommand::PhoneVerify { id } => (id.clone(), 2),
            _ => return Err(AccountError::InvalidInput),
        };
        let mut state = self.state.lock().await;
        state.check_scope(owner, epoch)?;
        let attempt = state.check_attempt(&id)?;
        if Instant::now() < attempt.next_poll {
            return Err(AccountError::Limited);
        }
        if (kind == 0) != (attempt.view.method == LoginMethod::Qr) {
            return Err(AccountError::InvalidInput);
        }
        let work = attempt.work.clone();
        let alive = attempt.alive.clone();
        let mut protocol = work.try_lock().map_err(|_| AccountError::Busy)?;
        if (kind == 0 && protocol.qr.is_none())
            || (kind == 1 && protocol.phone.is_none())
            || (kind == 2
                && (protocol.phone.is_none() || protocol.mfa.is_none() || protocol.code.is_none()))
        {
            return Err(AccountError::InvalidInput);
        }
        attempt.next_poll = Instant::now() + Duration::from_millis(1800);
        drop(state);
        let mut cancellation = CancelOnDrop(alive, true);
        let result: Result<Option<VerifiedSession>, PassportError> = if kind == 0 {
            let qr = protocol.qr.clone().ok_or(AccountError::InvalidInput)?;
            match protocol.client.qr_poll(&qr).await {
                Ok(QrPoll::Confirmed(confirmation)) => {
                    {
                        let mut state = self.state.lock().await;
                        state.check_owner(owner)?;
                        let attempt = state.check_attempt(&id)?;
                        attempt.view.state = LoginState::Processing;
                        attempt.deadline = Instant::now() + Duration::from_secs(45);
                        attempt.view.expires_at = now_millis()?.saturating_add(45_000);
                    }
                    tokio::time::timeout(
                        Duration::from_secs(45),
                        protocol.client.qr_complete(confirmation),
                    )
                    .await
                    .unwrap_or(Err(PassportError::Timeout))
                    .map(Some)
                }
                Ok(poll) => {
                    let mut state = self.state.lock().await;
                    state.check_owner(owner)?;
                    let attempt = state.check_attempt(&id)?;
                    attempt.view.state = match poll {
                        QrPoll::Pending => LoginState::Pending,
                        QrPoll::Scanned => LoginState::Scanned,
                        QrPoll::Cancelled => LoginState::Cancelled,
                        QrPoll::Expired => LoginState::Expired,
                        QrPoll::Confirmed(_) => unreachable!(),
                    };
                    if matches!(
                        attempt.view.state,
                        LoginState::Cancelled | LoginState::Expired
                    ) {
                        attempt.alive.store(false, Ordering::Release);
                    }
                    Ok(None)
                }
                Err(error) => Err(error),
            }
        } else {
            let phone = protocol.phone.clone().ok_or(AccountError::InvalidInput)?;
            let login = if let AccountCommand::PhoneLogin { code, .. } = command {
                protocol.code = Some(code.clone());
                protocol.client.login(&phone, &code, None).await
            } else {
                let challenge = protocol.mfa.clone().ok_or(AccountError::InvalidInput)?;
                match protocol.client.verify(&challenge, &phone).await {
                    Ok(MfaResult::Pending) => {
                        cancellation.1 = false;
                        return Ok(());
                    }
                    Ok(MfaResult::Ticket(ticket)) => {
                        let code = protocol.code.clone().ok_or(AccountError::InvalidInput)?;
                        protocol.client.login(&phone, &code, Some(&ticket)).await
                    }
                    Err(error) => Err(error),
                }
            };
            match login {
                Ok(PhoneLogin::Verified(verified)) => Ok(Some(verified)),
                Ok(PhoneLogin::Mfa(challenge)) => {
                    let mut state = self.state.lock().await;
                    state.check_owner(owner)?;
                    let attempt = state.check_attempt(&id)?;
                    if attempt.view.state != LoginState::Mfa {
                        attempt.deadline = Instant::now() + Duration::from_secs(600);
                        attempt.view.expires_at = now_millis()?.saturating_add(600_000);
                    }
                    attempt.view.state = LoginState::Mfa;
                    attempt.view.sms_number = Some(challenge.sms_number.clone());
                    attempt.view.sms_content = Some(challenge.sms_content.clone());
                    protocol.mfa = Some(challenge);
                    Ok(None)
                }
                Err(error) => Err(error),
            }
        };
        match result {
            Ok(Some(verified)) => {
                verified
                    .credential
                    .validate_for_uid(&verified.uid)
                    .map_err(protocol_error)?;
                let library = LibraryStore::open_for_owner(
                    self.directory
                        .join("accounts")
                        .join(format!("{}.sqlite3", verified.uid)),
                    verified.uid.clone(),
                )
                .await
                .map_err(|_| AccountError::Library)?;
                let mut state = self.state.clone().lock_owned().await;
                state.check_owner(owner)?;
                state.check_attempt(&id)?;
                let saved = SavedSession {
                    profile: AccountProfile {
                        uid: verified.uid,
                        name: verified
                            .name
                            .chars()
                            .filter(|c| !c.is_control())
                            .take(128)
                            .collect(),
                    },
                    credential: verified.credential,
                };
                saved.validate()?;
                self.commit(state, Some(saved), library).await?;
            }
            Ok(None) => {}
            Err(error) => {
                let mut state = self.state.lock().await;
                state.check_owner(owner)?;
                let attempt = state.check_attempt(&id)?;
                attempt.view.error = Some(safe_protocol_message(error));
                if error == PassportError::ChallengeExpired {
                    attempt.view.state = LoginState::Expired;
                    attempt.alive.store(false, Ordering::Release);
                    attempt.view.image = None;
                    attempt.view.sms_number = None;
                    attempt.view.sms_content = None;
                    attempt.view.sms_image = None;
                    protocol.mfa = None;
                    protocol.code = None;
                }
                // A rejected code remains editable; protocol/transport failures remain explicit.
                if kind == 0 && error != PassportError::ChallengeExpired {
                    attempt.view.state = LoginState::Failed;
                }
            }
        }
        cancellation.1 = false;
        Ok(())
    }

    async fn save_registered_device(
        &self,
        owner: &str,
        epoch: &str,
        id: &str,
        device: PersistedSession,
    ) -> Result<(), AccountError> {
        let mut state = self.state.clone().lock_owned().await;
        state.check_scope(owner, epoch)?;
        state.check_attempt(id)?;
        let storage = self.storage.clone();
        let id = id.to_owned();
        // Keep the coordinator until admitted persistence settles, including after caller loss.
        tokio::spawn(async move {
            storage.save_device(device.clone()).await?;
            state.check_attempt(&id)?;
            state.device = Some(device);
            Ok(())
        })
        .await
        .map_err(|_| AccountError::Storage)?
    }

    async fn commit(
        &self,
        mut state: OwnedMutexGuard<State>,
        saved: Option<SavedSession>,
        library: LibraryStore,
    ) -> Result<(), AccountError> {
        let storage = self.storage.clone();
        let epoch = random_id()?;
        let runtime = self.sync.clone();
        runtime.interrupt();
        self.online.interrupt();
        state.syncing = false;
        // Once admitted, persistence and publication retain the coordinator even if the caller disappears.
        tokio::spawn(async move {
            library
                .snapshot()
                .await
                .map_err(|_| AccountError::Library)?;
            state
                .library
                .invalidate_write_sessions()
                .await
                .map_err(|_| AccountError::Library)?;
            library
                .invalidate_write_sessions()
                .await
                .map_err(|_| AccountError::Library)?;
            storage.replace(saved.clone()).await?;
            if let Some(attempt) = &state.attempt {
                attempt.alive.store(false, Ordering::Release);
            }
            state.saved = saved;
            state.epoch = epoch;
            state.legacy_guest = false;
            state.library = library;
            state.attempt = None;
            state.sync_view = AccountSyncStatus::default();
            state.sync_error = None;
            state.guest_history = None;
            runtime.wake();
            Ok(())
        })
        .await
        .map_err(|_| AccountError::Storage)?
    }

    async fn fail(&self, id: &str, error: AccountError) {
        let mut state = self.state.lock().await;
        if let Ok(attempt) = state.check_attempt(id) {
            attempt.view.state = LoginState::Failed;
            attempt.view.error = Some(error.to_string());
        }
    }
}

fn protocol_error(error: PassportError) -> AccountError {
    match error {
        PassportError::InvalidInput => AccountError::InvalidInput,
        PassportError::InvalidIdentity | PassportError::MissingCredentials => {
            AccountError::IdentityMismatch
        }
        PassportError::ChallengeExpired => AccountError::AttemptExpired,
        PassportError::UpstreamHttp { status: 429, .. } => AccountError::Limited,
        _ => AccountError::Upstream,
    }
}
fn safe_protocol_message(error: PassportError) -> String {
    match error {
        PassportError::CodeRejected => "验证码无效，请检查后重试".into(),
        PassportError::LoginRejected => "登录未被确认，请检查验证码或重新登录".into(),
        _ => protocol_error(error).to_string(),
    }
}
fn remaining(deadline: Instant) -> u32 {
    u32::try_from(
        deadline
            .saturating_duration_since(Instant::now())
            .as_secs()
            .saturating_add(1),
    )
    .unwrap_or(u32::MAX)
}
fn now_millis() -> Result<u64, AccountError> {
    u64::try_from(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| AccountError::Storage)?
            .as_millis(),
    )
    .map_err(|_| AccountError::Storage)
}
fn random_id() -> Result<String, AccountError> {
    let mut bytes = [0u8; 16];
    SystemRandom::new()
        .fill(&mut bytes)
        .map_err(|_| AccountError::Storage)?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

#[cfg(test)]
#[path = "tests.rs"]
mod tests;
