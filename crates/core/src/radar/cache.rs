use super::*;
use ring::rand::{SecureRandom, SystemRandom};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
};

// Two bounded source documents plus canonical decimal strings and JSON escaping.
const CACHE_LIMIT: u64 = 20 << 20;
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Cache {
    pub version: u32,
    pub ranks: Option<RadarRanks>,
    pub growth: Option<RadarGrowth>,
    pub ranks_fetched_at: Option<String>,
    pub growth_fetched_at: Option<String>,
}
impl Cache {
    pub fn snapshot(
        &self,
        ranks_stale: bool,
        growth_stale: bool,
        cache_write_failed: bool,
    ) -> RadarSnapshot {
        RadarSnapshot {
            ranks: self.ranks.clone(),
            growth: self.growth.clone(),
            ranks_stale,
            growth_stale,
            ranks_fetched_at: self.ranks_fetched_at.clone(),
            growth_fetched_at: self.growth_fetched_at.clone(),
            cache_write_failed,
        }
    }
    fn validate(&self) -> Result<(), RadarError> {
        let invalid = RadarError::InvalidCache;
        if self.version != 1 || (self.ranks.is_none() && self.growth.is_none()) {
            return Err(invalid);
        }
        for (present, at) in [
            (self.ranks.is_some(), &self.ranks_fetched_at),
            (self.growth.is_some(), &self.growth_fetched_at),
        ] {
            if present != at.is_some() || at.as_ref().is_some_and(|s| !time::valid_timestamp(s)) {
                return Err(invalid);
            }
        }
        if let Some(ranks) = &self.ranks {
            let value = serde_json::to_value(ranks).map_err(|_| invalid)?;
            if parse::ranks_value(&value).map_err(|_| invalid)? != *ranks {
                return Err(invalid);
            }
        }
        if let Some(growth) = &self.growth {
            let value = serde_json::to_value(growth).map_err(|_| invalid)?;
            if parse::growth_value(&value, true).map_err(|_| invalid)? != *growth {
                return Err(invalid);
            }
        }
        Ok(())
    }
}
pub(super) fn open(dir: &Path) -> Result<(PathBuf, Cache), RadarError> {
    if dir.as_os_str().is_empty() {
        return Err(RadarError::Configuration);
    }
    let mut builder = fs::DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    builder.create(dir).map_err(|_| RadarError::Storage)?;
    let path = dir.join("radar-v1.json");
    let file = match File::open(&path) {
        Ok(file) => file,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Ok((
                path,
                Cache {
                    version: 1,
                    ..Cache::default()
                },
            ));
        }
        Err(_) => return Err(RadarError::Storage),
    };
    let mut body = Vec::new();
    file.take(CACHE_LIMIT + 1)
        .read_to_end(&mut body)
        .map_err(|_| RadarError::Storage)?;
    if body.len() as u64 > CACHE_LIMIT {
        return Err(RadarError::InvalidCache);
    }
    let value: Cache = serde_json::from_slice(&body).map_err(|_| RadarError::InvalidCache)?;
    value.validate()?;
    Ok((path, value))
}
struct Temporary(PathBuf);
impl Drop for Temporary {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}
pub(super) fn write(path: &Path, value: &Cache) -> Result<(), RadarError> {
    let body = serde_json::to_vec(value).map_err(|_| RadarError::Storage)?;
    if body.len() as u64 > CACHE_LIMIT {
        return Err(RadarError::Storage);
    }
    let mut nonce = [0u8; 16];
    SystemRandom::new()
        .fill(&mut nonce)
        .map_err(|_| RadarError::Storage)?;
    let suffix: String = nonce.iter().map(|b| format!("{b:02x}")).collect();
    let temp = Temporary(path.with_file_name(format!(".radar-v1-{suffix}.tmp")));
    let mut opts = OpenOptions::new();
    opts.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        opts.mode(0o600);
    }
    let mut file = opts.open(&temp.0).map_err(|_| RadarError::Storage)?;
    file.write_all(&body)
        .and_then(|()| file.sync_all())
        .map_err(|_| RadarError::Storage)?;
    drop(file);
    fs::rename(&temp.0, path).map_err(|_| RadarError::Storage)?;
    // The rename is the commit point. No fallible operations follow it.
    Ok(())
}
