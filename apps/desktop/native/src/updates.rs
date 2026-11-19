//! Persist the version an update should leave installed across NSH's process restart.
use nsh_core::prelude::*;
use std::{fs, io::Write, path::PathBuf};

fn receipt() -> Result<PathBuf, String> {
    Ok(data_dir()
        .ok_or("应用数据目录不可用")?
        .join("update-expected-version"))
}

/// What `nsh.json` can hold as a version, and nothing a path or log could be built from.
fn checked(version: &str) -> bool {
    !version.is_empty()
        && version.len() <= 128
        && version
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b".-+".contains(&b))
}

/// An update is reported as successful only after the actual shell version matches the receipt.
#[module]
pub struct DesktopUpdateReceipt;
#[module]
impl DesktopUpdateReceipt {
    /// Atomically save the version being staged, before NSH may replace the installed shell.
    pub async fn expect(version: String) -> Result<(), String> {
        if !checked(&version) {
            return Err("更新版本不可用".to_owned());
        }
        let path = receipt()?;
        background(async move {
            let partial = path.with_extension("part");
            let mut file = fs::File::create(&partial).map_err(|_| "无法保存更新状态")?;
            file.write_all(version.as_bytes())
                .and_then(|_| file.sync_all())
                .map_err(|_| "无法保存更新状态")?;
            fs::rename(partial, path).map_err(|_| "无法保存更新状态".to_owned())
        })
        .await
        .map_err(|_| "无法保存更新状态")?
    }
    /// Consume a receipt at startup: `updated` when this shell is that version, `interrupted`
    /// when the replacement never happened, `none` when nothing was expected.
    pub async fn confirm(version: String) -> Result<String, String> {
        let path = receipt()?;
        background(async move {
            let expected = match fs::metadata(&path) {
                Ok(meta) if meta.len() <= 128 => {
                    fs::read_to_string(&path).map_err(|_| "无法读取更新状态")?
                }
                Ok(_) => String::new(),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                    return Ok("none".to_owned());
                }
                Err(_) => return Err("无法读取更新状态".to_owned()),
            };
            fs::remove_file(path).map_err(|_| "无法清理更新状态")?;
            Ok(if expected == version {
                "updated"
            } else {
                "interrupted"
            }
            .to_owned())
        })
        .await
        .map_err(|_| "无法确认更新版本")?
    }
    /// Remove an unsuccessful install's receipt so the running app stays usable.
    pub async fn clear() -> Result<(), String> {
        let path = receipt()?;
        background(async move {
            match fs::remove_file(path) {
                Ok(()) => Ok(()),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
                Err(_) => Err("无法清理更新状态".to_owned()),
            }
        })
        .await
        .map_err(|_| "无法清理更新状态")?
    }
}
