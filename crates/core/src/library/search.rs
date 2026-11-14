//! Device-local submitted keywords; never sent to account or catalog services.
use super::{LibraryError, LibraryStore};
use rusqlite::{Connection, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use std::{error::Error, fmt};
use utoipa::ToSchema;

/// Committed recent keywords, newest first and at most ten.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct SearchHistory {
    /// Normalized, unique submitted keywords.
    pub items: Vec<String>,
}

/// Explicit device-local keyword mutation.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(tag = "action", rename_all = "snake_case", deny_unknown_fields)]
pub enum SearchHistoryChange {
    /// Save a submitted keyword, moving an existing keyword to the front.
    Add {
        /// Nonempty keyword within the website and UTF-16 limits.
        query: String,
    },
    /// Remove keywords without changing viewing history.
    Clear {},
}

/// Normalize a keyword without relaxing the existing website query limit.
pub fn normalize_keyword(value: &str) -> Result<String, SearchHistoryError> {
    if value.chars().any(char::is_control) {
        return Err(SearchHistoryError(LibraryError::InvalidInput));
    }
    let value = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if value.is_empty() || value.chars().count() > 80 || value.encode_utf16().count() > 100 {
        return Err(SearchHistoryError(LibraryError::InvalidInput));
    }
    Ok(value)
}

impl LibraryStore {
    /// Read committed device keywords without touching viewing records.
    pub async fn search_history(&self) -> Result<SearchHistory, SearchHistoryError> {
        self.run(|conn| snapshot(conn)).await.map_err(Into::into)
    }

    /// Serialize and commit a keyword mutation before returning its snapshot.
    pub async fn change_search_history(
        &self,
        change: SearchHistoryChange,
    ) -> Result<SearchHistory, SearchHistoryError> {
        let query = match change {
            SearchHistoryChange::Add { query } => Some(normalize_keyword(&query)?),
            SearchHistoryChange::Clear {} => None,
        };
        self.run(move |conn| {
            let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
            let previous = snapshot(&tx)?;
            let mut items = Vec::new();
            if let Some(query) = query {
                items.push(query.clone());
                items.extend(
                    previous
                        .items
                        .into_iter()
                        .filter(|item| item != &query)
                        .take(9),
                );
            }
            tx.execute("DELETE FROM recent_searches", [])?;
            for (rank, query) in items.iter().enumerate() {
                tx.execute(
                    "INSERT INTO recent_searches(rank, query) VALUES (?1, ?2)",
                    params![rank as i64, query],
                )?;
            }
            let next = snapshot(&tx)?;
            tx.commit()?;
            Ok(next)
        })
        .await
        .map_err(Into::into)
    }
}

pub(super) fn snapshot(conn: &Connection) -> Result<SearchHistory, LibraryError> {
    let mut statement = conn.prepare("SELECT rank, query FROM recent_searches ORDER BY rank")?;
    let mut rows = statement.query([])?;
    let mut items = Vec::new();
    while let Some(row) = rows.next()? {
        let rank: i64 = row.get(0)?;
        let query: String = row.get(1)?;
        if rank != items.len() as i64
            || items.len() >= 10
            || normalize_keyword(&query).ok().as_deref() != Some(query.as_str())
            || items.contains(&query)
        {
            return Err(LibraryError::InvalidDatabase);
        }
        items.push(query);
    }
    Ok(SearchHistory { items })
}

/// Sanitized keyword failures independent of the transport.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SearchHistoryError(LibraryError);
impl SearchHistoryError {
    /// Invalid request payload or keyword.
    pub fn invalid_input() -> Self {
        Self(LibraryError::InvalidInput)
    }
    /// Whether a failure came from the submitted request.
    pub fn is_invalid_input(self) -> bool {
        self.0 == LibraryError::InvalidInput
    }
    /// Stable error category without stored keywords or database paths.
    pub fn code(self) -> &'static str {
        match self.0 {
            LibraryError::InvalidInput => "SEARCH_HISTORY_REQUEST_INVALID",
            LibraryError::InvalidDatabase => "SEARCH_HISTORY_DATABASE_INVALID",
            _ => "SEARCH_HISTORY_STORAGE_UNAVAILABLE",
        }
    }
}
impl From<LibraryError> for SearchHistoryError {
    fn from(value: LibraryError) -> Self {
        Self(value)
    }
}
impl fmt::Display for SearchHistoryError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self.0 {
            LibraryError::InvalidInput => "关键词格式无效或过长，请缩短后重试",
            LibraryError::InvalidDatabase => {
                "搜索记录数据库不兼容或已损坏，请保留数据并检查版本或备份"
            }
            _ => "搜索记录读写失败，请检查磁盘空间与目录权限后重试",
        })
    }
}
impl Error for SearchHistoryError {}
