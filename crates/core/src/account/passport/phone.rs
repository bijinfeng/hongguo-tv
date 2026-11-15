use super::{PassportError, crypto::hex};
use ring::digest;

// The fixed client's fourteen-region input policy; upstream still decides SMS deliverability.
const REGIONS: [(&str, usize, usize); 14] = [
    ("+86", 11, 11),
    ("+852", 8, 8),
    ("+853", 8, 8),
    ("+886", 9, 10),
    ("+60", 9, 10),
    ("+65", 8, 8),
    ("+62", 10, 13),
    ("+95", 9, 10),
    ("+63", 7, 10),
    ("+84", 9, 10),
    ("+855", 8, 9),
    ("+81", 9, 11),
    ("+82", 8, 11),
    ("+971", 9, 9),
];

/// Canonical phone identity; never format it as a debug/log value.
#[derive(Clone, PartialEq, Eq)]
pub(crate) struct PhoneNumber {
    country: &'static str,
    local: String,
}
impl PhoneNumber {
    pub(crate) fn parse(country_code: &str, number: &str) -> Result<Self, PassportError> {
        let code = country_code.trim().trim_start_matches('+');
        let code = if code.is_empty() { "86" } else { code };
        let &(country, min, max) = REGIONS
            .iter()
            .find(|(country, _, _)| &country[1..] == code)
            .ok_or(PassportError::InvalidInput)?;
        let local = number.trim();
        if !local.bytes().all(|b| b.is_ascii_digit())
            || local.len() < min
            || local.len() > max
            || country.len() - 1 + local.len() > 15
            || (country == "+86"
                && !(local.starts_with('1')
                    && matches!(local.as_bytes().get(1), Some(b'3'..=b'9'))))
        {
            return Err(PassportError::InvalidInput);
        }
        Ok(Self {
            country,
            local: local.to_owned(),
        })
    }
    pub(crate) fn masked(&self) -> String {
        let n = self.local.len();
        let prefix = if n > 7 { 3 } else { 1 };
        format!(
            "{}{}****{}",
            self.country,
            &self.local[..prefix],
            &self.local[n.saturating_sub(4)..]
        )
    }
    pub(crate) fn cooldown_key(&self) -> String {
        hex(digest::digest(&digest::SHA256, self.canonical().as_bytes()).as_ref())
    }
    pub(super) fn canonical(&self) -> String {
        format!("{}{}", self.country, self.local)
    }
    pub(super) fn international(&self) -> bool {
        self.country != "+86"
    }
    pub(super) fn wire(&self) -> String {
        if !self.international() {
            return self.canonical();
        }
        let &(_, _, max) = REGIONS
            .iter()
            .find(|(code, _, _)| *code == self.country)
            .expect("validated region");
        let widths = match max {
            10 => vec![3, 4, 3],
            11 => vec![3, 4, 4],
            n => vec![if n % 4 == 0 { 4 } else { 3 }; n.div_ceil(if n % 4 == 0 { 4 } else { 3 })],
        };
        let mut rest = self.local.as_str();
        let mut groups = Vec::new();
        for width in widths {
            if rest.is_empty() {
                break;
            }
            let width = width.min(rest.len());
            groups.push(&rest[..width]);
            rest = &rest[width..];
        }
        format!("{}{}", self.country, groups.join(" "))
    }
}
