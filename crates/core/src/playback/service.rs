use super::{PlayInfo, PlaybackClient, PlaybackError, PlaybackRequest, PlaybackSource};
use crate::media::{MediaLease, MediaStore, PreparedMedia};
use std::{
    collections::HashMap,
    path::Path,
    sync::{Arc, Mutex, Weak},
    time::Duration,
};
use tokio::{
    sync::watch,
    task::AbortHandle,
    time::{Instant, timeout},
};

const MODEL_BUDGET: Duration = Duration::from_secs(30);
const JOB_BUDGET: Duration = Duration::from_secs(95);
const MAX_JOBS: usize = 2;

/// Concrete episode resolver shared by HTTP and future native hosts.
/// Each awaiting caller owns a cancelable lease and receives its own opaque handle.
#[derive(Clone)]
pub struct PlaybackService {
    inner: Arc<Service>,
}
struct Service {
    client: PlaybackClient,
    media: MediaStore,
    jobs: Mutex<Jobs>,
}
#[derive(Default)]
struct Jobs {
    closed: bool,
    revision: u64,
    pending: HashMap<PlaybackRequest, Job>,
}
struct Job {
    revision: u64,
    owners: usize,
    abort: AbortHandle,
    result: watch::Receiver<Option<Result<Resolved, PlaybackError>>>,
}
#[derive(Clone)]
struct Resolved {
    media: PreparedMedia,
    quality: String,
    qualities: Vec<String>,
}
struct Owner {
    service: Weak<Service>,
    request: PlaybackRequest,
    revision: u64,
}
impl Drop for Owner {
    fn drop(&mut self) {
        if let Some(service) = self.service.upgrade()
            && let Ok(mut jobs) = service.jobs.lock()
            && let Some(job) = jobs.pending.get_mut(&self.request)
            && job.revision == self.revision
        {
            job.owners -= 1;
            if job.owners == 0 {
                job.abort.abort();
                jobs.pending.remove(&self.request);
            }
        }
    }
}
impl Drop for Service {
    fn drop(&mut self) {
        if let Ok(jobs) = self.jobs.get_mut() {
            for job in jobs.pending.values() {
                job.abort.abort();
            }
        }
        self.media.close();
    }
}
impl PlaybackService {
    /// Initialize an anonymous resolver and its private app-owned media store.
    pub fn new(app_state: &Path) -> Result<Self, PlaybackError> {
        Ok(Self::with_services(
            PlaybackClient::new()?,
            MediaStore::new(app_state)?,
        ))
    }
    /// Assemble already initialized core services; tests inject explicit loopback transports.
    pub fn with_services(client: PlaybackClient, media: MediaStore) -> Self {
        Self {
            inner: Arc::new(Service {
                client,
                media,
                jobs: Mutex::new(Jobs::default()),
            }),
        }
    }
    /// Resolve only a validated selection. Dropping this future detaches its preparation owner.
    pub async fn resolve(&self, request: &PlaybackRequest) -> Result<PlayInfo, PlaybackError> {
        let (mut result, owner) = {
            let mut jobs = self
                .inner
                .jobs
                .lock()
                .map_err(|_| PlaybackError::Configuration)?;
            if jobs.closed {
                return Err(PlaybackError::Expired);
            }
            if !jobs.pending.contains_key(request) {
                if jobs.pending.len() >= MAX_JOBS {
                    return Err(PlaybackError::Capacity);
                }
                jobs.revision = jobs
                    .revision
                    .checked_add(1)
                    .ok_or(PlaybackError::Capacity)?;
                let revision = jobs.revision;
                let (tx, rx) = watch::channel(None);
                let weak = Arc::downgrade(&self.inner);
                let (client, media, selection) = (
                    self.inner.client.clone(),
                    self.inner.media.clone(),
                    request.clone(),
                );
                let task = tokio::spawn(async move {
                    let result = timeout(JOB_BUDGET, prepare(&client, &media, &selection))
                        .await
                        .unwrap_or(Err(PlaybackError::Timeout));
                    if let Some(service) = weak.upgrade()
                        && let Ok(jobs) = service.jobs.lock()
                        && !jobs.closed
                        && jobs
                            .pending
                            .get(&selection)
                            .is_some_and(|job| job.revision == revision && job.owners > 0)
                    {
                        tx.send_replace(Some(result));
                    }
                });
                jobs.pending.insert(
                    request.clone(),
                    Job {
                        revision,
                        owners: 0,
                        abort: task.abort_handle(),
                        result: rx,
                    },
                );
            }
            let job = jobs
                .pending
                .get_mut(request)
                .ok_or(PlaybackError::Configuration)?;
            job.owners += 1;
            (
                job.result.clone(),
                Owner {
                    service: Arc::downgrade(&self.inner),
                    request: request.clone(),
                    revision: job.revision,
                },
            )
        };
        let prepared = loop {
            if let Some(result) = result.borrow().clone() {
                break result?;
            }
            result.changed().await.map_err(|_| PlaybackError::Expired)?;
        };
        let path = {
            let jobs = self
                .inner
                .jobs
                .lock()
                .map_err(|_| PlaybackError::Configuration)?;
            if jobs.closed
                || !jobs
                    .pending
                    .get(request)
                    .is_some_and(|job| job.revision == owner.revision)
            {
                return Err(PlaybackError::Expired);
            }
            self.inner.media.publish(prepared.media.clone())?
        };
        Ok(PlayInfo {
            path,
            vid: request.vid().into(),
            video_codec: prepared.media.codec().into(),
            quality: prepared.quality,
            qualities: prepared.qualities,
        })
    }
    /// Borrow only a ready local handle, preserving its stable representation for the response.
    pub fn lease(&self, token: &str) -> Result<MediaLease, PlaybackError> {
        self.inner.media.lease(token)
    }
    /// Idempotently release one caller's opaque handle; other callers keep their own handles.
    pub fn release(&self, token: &str) -> Result<(), PlaybackError> {
        self.inner.media.release(token)
    }
    /// Cancel every pending job and stop new resolution and media reads.
    pub fn close(&self) {
        if let Ok(mut jobs) = self.inner.jobs.lock() {
            jobs.closed = true;
            for job in jobs.pending.values() {
                job.abort.abort();
            }
            jobs.pending.clear();
        }
        self.inner.media.close();
    }
}

async fn prepare(
    client: &PlaybackClient,
    media: &MediaStore,
    request: &PlaybackRequest,
) -> Result<Resolved, PlaybackError> {
    use PlaybackSource::*;
    let families: &[(Duration, &[PlaybackSource])] = &[
        (Duration::from_secs(8), &[VideoTab]),
        (
            Duration::from_secs(14),
            &[
                RegisteredLegacy,
                RegisteredLegacyAlternate,
                RegisteredLegacy,
                RegisteredLegacyAlternate,
            ],
        ),
        (
            Duration::from_secs(8),
            &[RegisteredSingle, LegacySingle, LegacySingle],
        ),
    ];
    let mut spent = Duration::ZERO;
    let mut last = PlaybackError::EmptySource;
    for (limit, sources) in families {
        let mut family_spent = Duration::ZERO;
        for source in *sources {
            let remaining = MODEL_BUDGET
                .saturating_sub(spent)
                .min(limit.saturating_sub(family_spent));
            if remaining.is_zero() {
                break;
            }
            let started = Instant::now();
            let candidate = timeout(remaining, client.candidates(request, *source))
                .await
                .unwrap_or(Err(PlaybackError::Timeout));
            let elapsed = started.elapsed();
            spent += elapsed;
            family_spent += elapsed;
            let model = match candidate {
                Ok(model) => model,
                Err(error) => {
                    if stops_recovery(error) {
                        return Err(error);
                    }
                    last = error;
                    continue;
                }
            };
            let representation = model.select(request)?;
            match media.prepare(representation).await {
                Ok(prepared) => {
                    return Ok(Resolved {
                        media: prepared,
                        quality: representation.quality(),
                        qualities: model.qualities(),
                    });
                }
                Err(error) => {
                    if stops_recovery(error) {
                        return Err(error);
                    }
                    last = error;
                }
            }
        }
    }
    Err(last)
}
fn stops_recovery(error: PlaybackError) -> bool {
    matches!(
        error,
        PlaybackError::InvalidInput
            | PlaybackError::UnsupportedContent
            | PlaybackError::AccessDenied
            | PlaybackError::IdentityMismatch
            | PlaybackError::QualityUnavailable
            | PlaybackError::Configuration
            | PlaybackError::Storage
            | PlaybackError::Capacity
            | PlaybackError::MediaTooLarge
            | PlaybackError::Expired
    )
}

#[cfg(test)]
mod tests;
