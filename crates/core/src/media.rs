//! Media rules shared by future native and HTTP adapters.
mod mp4;
mod store;
use std::{error::Error, fmt};
pub use store::{MediaLease, MediaStore, PreparedMedia};

/// One satisfiable inclusive byte range. Multipart ranges are deliberately unsupported.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ByteRange {
    start: u64,
    end: u64,
    partial: bool,
}

impl ByteRange {
    /// Parse an HTTP Range value against a non-empty resource.
    pub fn parse(header: &str, length: u64) -> Result<Self, InvalidRange> {
        let end = length.checked_sub(1).ok_or(InvalidRange)?;
        if header.is_empty() {
            return Ok(Self {
                start: 0,
                end,
                partial: false,
            });
        }
        let value = header.strip_prefix("bytes=").ok_or(InvalidRange)?;
        let (first, last) = value.split_once('-').ok_or(InvalidRange)?;
        let number = |s: &str| {
            if s.is_empty() || !s.bytes().all(|b| b.is_ascii_digit()) {
                return Err(InvalidRange);
            }
            s.parse::<u64>().map_err(|_| InvalidRange)
        };
        let (start, end) = if first.is_empty() {
            let suffix = number(last)?;
            if suffix == 0 {
                return Err(InvalidRange);
            }
            (length.saturating_sub(suffix), end)
        } else {
            let start = number(first)?;
            let end = if last.is_empty() {
                end
            } else {
                number(last)?.min(end)
            };
            if start > end {
                return Err(InvalidRange);
            }
            (start, end)
        };
        Ok(Self {
            start,
            end,
            partial: true,
        })
    }

    /// First byte offset.
    pub fn start(self) -> u64 {
        self.start
    }
    /// Last byte offset, inclusive.
    pub fn end(self) -> u64 {
        self.end
    }
    /// Whether the response should use HTTP 206.
    pub fn partial(self) -> bool {
        self.partial
    }
}

/// Invalid, unsupported or unsatisfiable Range input.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct InvalidRange;
impl fmt::Display for InvalidRange {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("invalid or unsatisfiable byte range")
    }
}
impl Error for InvalidRange {}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn upstream_compatibility_vectors() {
        for (header, start, end, partial) in [
            ("", 0, 99, false),
            ("bytes=5-9", 5, 9, true),
            ("bytes=90-", 90, 99, true),
            ("bytes=-10", 90, 99, true),
            ("bytes=0-999", 0, 99, true),
            ("bytes=-999", 0, 99, true),
        ] {
            assert_eq!(
                ByteRange::parse(header, 100),
                Ok(ByteRange {
                    start,
                    end,
                    partial
                })
            );
        }
    }
    #[test]
    fn rejects_malformed_and_overflowing_ranges() {
        for header in [
            "bytes=100-",
            "bytes=1-2,4-5",
            "bytes=-0",
            "bytes=9-1",
            "bytes=+1-2",
            "bytes= 1-2",
            "bytes=--1",
            "bytes=-",
            "items=1-2",
            "bytes=18446744073709551616-",
        ] {
            assert_eq!(ByteRange::parse(header, 100), Err(InvalidRange), "{header}");
        }
        assert_eq!(ByteRange::parse("", 0), Err(InvalidRange));
        assert_eq!(
            ByteRange::parse("bytes=18446744073709551614-", u64::MAX)
                .unwrap()
                .end(),
            u64::MAX - 1
        );
    }
}
