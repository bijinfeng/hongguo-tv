//! Fixed anonymous mobile-v5 playback profile. Never touches the account or passport profile.
//!
//! Interoperability constants and protocol semantics are described in `THIRD_PARTY_NOTICES.md`
//! and `docs/playback-v5.md`; the implementation here is this project's own Rust expression.
use super::{
    PlaybackError,
    identity::encode_query,
    protocol::{hex, md5, random},
    sign::{blob, sm3, text, unhex, varint},
};
use base64::{Engine, engine::general_purpose};
use reqwest::header::{HeaderMap, HeaderValue};
use std::collections::BTreeMap;

include!("sign_v5/tables.rs");

/// Fixed mobile-v5 license id; distinct from the account passport license.
const LICENSE: &str = "646637794";
/// Low nibble this profile must select for the F13 branch.
const BRANCH: u8 = 12;

fn le_bytes(n: u32) -> [u8; 4] {
    n.to_le_bytes()
}

fn iv_hash(data: &[u8], mut iv: u32) -> u32 {
    for (i, byte) in data.iter().enumerate() {
        iv = if i & 1 == 0 {
            (iv >> 4) ^ iv ^ (iv << 6) ^ u32::from(*byte)
        } else {
            !((iv >> 7) ^ iv ^ (u32::from(*byte) | (iv << 12)))
        };
    }
    iv
}

/// Branch selection shared with the generated wire vectors.
fn branch(query: &str, body: &[u8], ts: u32) -> (u32, [u8; 32], [u8; 16]) {
    let q = sm3(query.as_bytes());
    let m = if body.is_empty() { [0; 16] } else { md5(body) };
    let iv = iv_hash(&le_bytes(ts), iv_hash(&m, iv_hash(&q, 0x20230928)));
    (iv, q, m)
}

/// F13 digest for the fixed mobile-v5 seed.
fn f13(q: &[u8; 32], m: &[u8; 16], ts: u32) -> [u8; 20] {
    let count = F13_SEED.wrapping_add(ts);
    let mut data = q.to_vec();
    data.extend_from_slice(m);
    data.extend_from_slice(&le_bytes(ts));
    for byte in [0xfau8, 0x45, 0x61, 0xd7] {
        data.push(((u16::from(byte) * 257) >> (count.wrapping_add(2) & 7)) as u8);
    }
    data.extend_from_slice(&[0, 0, 0, 0, 0, 0, 1, 0xa0]);
    let mut words = [0u32; 128];
    for (i, word) in data.chunks_exact(4).take(16).enumerate() {
        words[i] = u32::from_be_bytes(word.try_into().expect("four-byte word"));
    }
    for i in 0..112 {
        let x = words[i + 1];
        let y = words[i + 14];
        words[i + 16] = words[i]
            .wrapping_add(words[i + 9])
            .wrapping_add(x.rotate_left(14) ^ x.rotate_left(25) ^ (x >> 3))
            .wrapping_add(y.rotate_left(13) ^ y.rotate_left(15) ^ (y >> 10));
    }
    let initial = F13_INITIAL.map(|x| x.rotate_right(count & 31));
    let mut d = initial;
    for i in 0..96u32 {
        let base = F13_SEED.wrapping_add(i);
        let n1 = ((d[4] ^ d[0]) & d[1]) ^ d[4];
        let n2 = d[1].rotate_left(26) ^ d[1].rotate_left(21) ^ d[1].rotate_left(7);
        let n4 = words[(base & 127) as usize]
            .wrapping_add(n1)
            .wrapping_add(n2)
            .wrapping_add(
                HASH_TABLE[(base & 63) as usize].rotate_right((count.wrapping_add(1)) & 31),
            )
            .wrapping_add(d[6]);
        let n5 = d[3].rotate_left(30) ^ d[3].rotate_left(19) ^ d[3].rotate_left(10);
        let n6 = (d[3] & d[5]) | ((d[3] | d[5]) & d[2]);
        let old = d[7];
        d.copy_within(0..7, 1);
        d[7] = n5.wrapping_add(n6).wrapping_add(n4);
        d[0] = old.wrapping_add(n4);
    }
    let mut ret = [0u8; 32];
    for (i, word) in d.iter().enumerate() {
        ret[i * 4..(i + 1) * 4].copy_from_slice(&word.wrapping_add(initial[i]).to_be_bytes());
    }
    let mut out = [0u8; 20];
    for (i, byte) in out[..16].iter_mut().enumerate() {
        *byte = ret[i] ^ ret[i + 16];
    }
    let mut check = 0x20220420u32;
    for (i, byte) in out[..12].iter().enumerate() {
        check = if i & 1 == 0 {
            (check >> 3) ^ check ^ u32::from(*byte) ^ (check << 7)
        } else {
            (check >> 5) ^ check ^ !(u32::from(*byte) | (check << 11))
        };
    }
    out[16..].copy_from_slice(&(((check | 4) ^ 0x1000000) | 0x20).to_le_bytes());
    out
}

fn sint(out: &mut Vec<u8>, field: u64, n: i64) {
    varint(out, field << 3);
    varint(out, ((n as u64) << 1) ^ ((n >> 63) as u64));
}

fn request_proto(
    query: &BTreeMap<String, String>,
    ts: u32,
    nonce: u32,
    q: &[u8; 32],
    digest: &[u8; 20],
    process: &Process,
) -> Vec<u8> {
    let get = |name: &str| query.get(name).map(String::as_str).unwrap_or("");
    let (mut device, mut env, mut count, mut p) = (Vec::new(), Vec::new(), Vec::new(), Vec::new());
    sint(&mut device, 1, 1);
    sint(&mut device, 2, 2);
    text(&mut device, 3, "8662");
    text(&mut device, 4, get("device_id"));
    text(&mut device, 5, &process.nonce);
    text(&mut device, 6, "!noperm!");
    text(&mut device, 12, "Asia/Shanghai,8");
    text(&mut device, 13, "zh_CN");
    text(&mut device, 22, get("os_version"));
    sint(&mut device, 25, process.started);
    text(&mut device, 30, get("device_type"));
    text(&mut device, 31, "HONOR");
    text(&mut device, 32, get("device_type"));
    text(&mut device, 34, "HONOR");
    text(&mut env, 6, "v04.10.03.04-bugfix");
    text(&mut env, 8, get("channel"));
    blob(&mut env, 12, &device);
    text(&mut env, 14, get("version_name"));
    for field in [1, 2, 3, 5] {
        sint(&mut count, field, 1);
    }
    blob(&mut p, 1, &unhex(MAGIC));
    sint(&mut p, 2, 5);
    sint(&mut p, 3, i64::from(nonce));
    text(&mut p, 4, "8662");
    text(&mut p, 5, get("device_id"));
    text(&mut p, 6, LICENSE);
    text(&mut p, 7, get("version_name"));
    text(&mut p, 8, "v04.10.03-ml-android");
    sint(&mut p, 9, 0x040a0300);
    blob(&mut p, 10, &[0; 8]);
    sint(&mut p, 12, i64::from(ts));
    blob(&mut p, 13, digest);
    blob(&mut p, 14, &q[..6]);
    blob(&mut p, 15, &count);
    sint(&mut p, 17, i64::from(ts));
    text(&mut p, 20, "none");
    sint(&mut p, 21, 377);
    blob(&mut p, 23, &env);
    text(
        &mut p,
        24,
        r#"{"cmr":16777216,"cmr2":16777216,"un_h":11,"vpn":0,"kd":0,"dyn":"","do":1,"tk":true}"#,
    );
    p
}

fn xm_xor(data: &[u8], key: &[u8; 32]) -> Vec<u8> {
    let mut out = vec![0u8; data.len()];
    for (i, byte) in data.iter().enumerate() {
        let k = (i * 4) & 28;
        let (a, b) = (key[k], key[k + 1]);
        let v = (!byte.rotate_left(4).wrapping_add(a)) ^ b;
        let v = v.rotate_left(3).wrapping_add(b);
        out[data.len() - 1 - i] = !(v ^ a);
    }
    let n = out.len();
    let flag = out[n - 1] ^ out[n - 2];
    let old = out[0];
    out[0] = out[0].wrapping_add(!flag);
    out[1] = out[1].wrapping_add(out[0] ^ out[n - 1] ^ 254);
    out[2] = out[2].wrapping_add(flag.wrapping_sub(old) ^ out[1].rotate_left(3) ^ 2);
    for i in 0..n - 4 {
        out[i + 3] =
            out[i + 3].wrapping_add(!(out[i + 2].rotate_left(3) ^ out[i + 1] ^ ((i + 3) as u8)));
    }
    out[n - 1] ^= out[n - 2];
    let sum = out[1..].iter().fold(0u8, |sum, x| sum.wrapping_add(*x));
    out[0] = (out[0] ^ out[1]).wrapping_add(sum);
    out
}

/// Carrier transform; not standard AES, despite the block shape.
fn carrier(data: &[u8], ts: u32, key: &[u8; 16], iv: &[u8; 16]) -> Result<Vec<u8>, PlaybackError> {
    if data.len() < 248 {
        return Err(PlaybackError::Configuration);
    }
    let i = (ts & 3) as usize;
    let table = unhex(SBOX);
    let bx = &table[i * 256..(i + 1) * 256];
    let con = [[2, 0, 3, 1], [1, 3, 2, 0], [3, 2, 1, 0], [2, 3, 1, 0]][i];
    let order = [
        [0, 9, 14, 15, 4, 13, 2, 7, 8, 1, 6, 3, 12, 5, 10, 11],
        [0, 9, 14, 11, 4, 13, 2, 3, 8, 1, 6, 15, 12, 5, 10, 7],
        [0, 9, 14, 3, 4, 13, 2, 15, 8, 1, 6, 11, 12, 5, 10, 7],
        [0, 9, 14, 15, 4, 13, 2, 3, 8, 1, 6, 11, 12, 5, 10, 7],
    ][i];
    let init = [0xbbb5de72u32, 0xd4638d5b, 0x92a5f73b, 0x89f8a1c9][i];
    let mut mk = [0u8; 48];
    for (j, byte) in mk.iter_mut().take(16).enumerate() {
        *byte = key[j] ^ ((init >> ((j % 4) * 8)) as u8);
    }
    let mut r = 8;
    for j in 4..12 {
        let mut prev = [mk[j * 4 - 4], mk[j * 4 - 3], mk[j * 4 - 2], mk[j * 4 - 1]];
        if j % 4 == 0 {
            prev = [
                ((init >> (r & 24)) as u8) ^ bx[usize::from(prev[1])],
                bx[usize::from(prev[2])],
                bx[usize::from(prev[3])],
                bx[usize::from(prev[0])],
            ];
        }
        r += 2;
        for k in 0..4 {
            mk[j * 4 + k] = prev[k] ^ mk[j * 4 + k - 16];
        }
    }
    let block = |src: &[u8]| {
        let mut b = src.to_vec();
        let add = |b: &mut [u8], base: usize| {
            for (j, x) in b.iter_mut().enumerate() {
                *x ^= mk[base + (j / 4) * 4 + con[j % 4]];
            }
        };
        add(&mut b, 0);
        for round in 1..=2 {
            let prev = b.clone();
            for j in 0..16 {
                let index = order[j];
                b[j] = bx[usize::from(prev[con[index / 4] * 4 + index % 4])];
            }
            if round == 1 {
                let prev = b.clone();
                for j in 0..16 {
                    b[j] = prev[(j / 4) * 4 + con[j % 4]];
                }
                let xt = |x: u8| {
                    if x & 128 != 0 {
                        (x << 1) ^ 0x1b
                    } else {
                        x << 1
                    }
                };
                for col in 0..4 {
                    let (a, c, d, e) = (b[col], b[4 + col], b[8 + col], b[12 + col]);
                    let t = a ^ c ^ d ^ e;
                    b[col] ^= t ^ xt(a ^ c);
                    b[4 + col] ^= t ^ xt(c ^ d);
                    b[8 + col] ^= t ^ xt(d ^ e);
                    b[12 + col] ^= t ^ xt(e ^ a);
                }
            }
            add(&mut b, round * 16);
        }
        for j in 0..16 {
            b[j] ^= mk[16 + j];
        }
        b
    };
    let wire = [6u8, 5, 3, 4, 2, 7, 1, 0];
    let compact = [1u8, 7, 3, 6, 2, 0, 4, 5];
    let mut plain = [0u8; 32];
    for j in 0..31 {
        for k in 0..8 {
            plain[j] |= ((data[j * 8 + k] >> wire[k]) & 1) << compact[k];
        }
    }
    plain[31] = 1;
    let mut previous = *iv;
    let mut encrypted = Vec::with_capacity(32);
    for chunk in plain.chunks_exact_mut(16) {
        for (byte, prev) in chunk.iter_mut().zip(previous.iter()) {
            *byte ^= prev;
        }
        previous = block(chunk)
            .try_into()
            .map_err(|_| PlaybackError::Configuration)?;
        encrypted.extend_from_slice(&previous);
    }
    let mut out = vec![0u8; data.len() + 1];
    out[0] = encrypted[31];
    out[1..].copy_from_slice(data);
    for (j, byte) in encrypted.iter().take(31).enumerate() {
        for k in 0..8 {
            let at = 1 + j * 8 + k;
            out[at] = (out[at] & !(1 << wire[k])) | (((byte >> compact[k]) & 1) << wire[k]);
        }
    }
    Ok(out)
}

fn medusa(
    query: &BTreeMap<String, String>,
    ts: u32,
    q: &[u8; 32],
    m: &[u8; 16],
    nonce: [u32; 3],
    process: &Process,
) -> Result<String, PlaybackError> {
    let digest = f13(q, m, ts);
    let message = request_proto(query, ts, nonce[0], q, &digest, process);
    let key_bytes = unhex(KEY);
    let mut key_input = key_bytes.clone();
    key_input.extend_from_slice(&le_bytes(nonce[1]));
    key_input.extend_from_slice(&key_bytes);
    let key = sm3(&key_input);
    let high = (nonce[1] >> 16) & 255;
    let seed = le_bytes(!(((high << 11) | (nonce[1] >> 24)) ^ (high >> 5) ^ high));
    let mut p = vec![0u8; 8];
    p.extend_from_slice(&xm_xor(&message, &key));
    p.reverse();
    for (i, byte) in p.iter_mut().enumerate() {
        *byte ^= seed[(!i) & 3];
    }
    let check = 0x18000001u32 | (u32::from(q[0] & 63) << 14) | (u32::from(digest[0] & 63) << 8);
    let mut packed = vec![0xca];
    packed.extend_from_slice(&le_bytes(nonce[2]));
    packed.extend_from_slice(&le_bytes(check));
    packed.extend_from_slice(&p);
    packed.extend_from_slice(&le_bytes(nonce[1])[2..]);
    let aes_key: [u8; 16] = md5(&key_bytes[..16]);
    let aes_iv: [u8; 16] = md5(&key_bytes[16..]);
    let encrypted = carrier(&packed, ts, &aes_key, &aes_iv)?;
    let mut header = le_bytes(5).to_vec();
    header.extend_from_slice(&unhex(MAGIC));
    let stamp = le_bytes(ts);
    for (i, byte) in header.iter_mut().enumerate() {
        *byte ^= stamp[i & 3];
    }
    header.extend_from_slice(&[nonce[1] as u8, (nonce[1] >> 8) as u8, 0, 1]);
    header.extend_from_slice(&encrypted);
    Ok(general_purpose::STANDARD.encode(header))
}

fn pad(data: &[u8]) -> Vec<u8> {
    let n = 16 - data.len() % 16;
    let mut out = data.to_vec();
    out.resize(out.len() + n, n as u8);
    out
}

fn helios(ts: u32, nonce: u32) -> String {
    let mut input = le_bytes(nonce).to_vec();
    input.extend_from_slice(b"8662");
    let raw = hex(&md5(&input)).into_bytes();
    let mut k = u64::from_le_bytes(raw[..8].try_into().expect("eight-byte word"));
    let mut pending = [
        u64::from_le_bytes(raw[8..16].try_into().expect("eight-byte word")),
        u64::from_le_bytes(raw[16..24].try_into().expect("eight-byte word")),
        u64::from_le_bytes(raw[24..32].try_into().expect("eight-byte word")),
    ];
    let mut rounds = [0u64; 34];
    for (i, slot) in rounds.iter_mut().enumerate() {
        *slot = k;
        let x = (pending[0].rotate_right(8).wrapping_add(k)) ^ (i as u64);
        pending = [pending[1], pending[2], x];
        k = x ^ k.rotate_left(3);
    }
    let plain = pad(format!("{ts}-{LICENSE}-8662").as_bytes());
    let mut out = le_bytes(nonce).to_vec();
    for chunk in plain.chunks_exact(16) {
        let mut a = u64::from_le_bytes(chunk[..8].try_into().expect("eight-byte word"));
        let mut b = u64::from_le_bytes(chunk[8..].try_into().expect("eight-byte word"));
        for r in rounds {
            b = r ^ a.wrapping_add(b.rotate_right(8));
            a = b ^ a.rotate_left(3);
        }
        out.extend_from_slice(&a.to_le_bytes());
        out.extend_from_slice(&b.to_le_bytes());
    }
    general_purpose::STANDARD.encode(out)
}

/// The mobile request's fixed query order; only `_rticket` is tuned.
const QUERY_ORDER: [&str; 13] = [
    "aid",
    "app_name",
    "version_code",
    "version_name",
    "channel",
    "device_platform",
    "device_type",
    "os_version",
    "update_version_code",
    "iid",
    "cdid",
    "device_id",
    "_rticket",
];

fn ordered_query(query: &BTreeMap<String, String>, ticket: u64) -> String {
    QUERY_ORDER
        .iter()
        .map(|name| {
            let value = if *name == "_rticket" {
                ticket.to_string()
            } else {
                query.get(*name).cloned().unwrap_or_default()
            };
            format!("{name}={}", encode_query_value(&value))
        })
        .collect::<Vec<_>>()
        .join("&")
}

fn encode_query_value(value: &str) -> String {
    let mut map = BTreeMap::new();
    map.insert("v".to_string(), value.to_string());
    let encoded = encode_query(&map);
    encoded
        .strip_prefix("v=")
        .unwrap_or(&encoded)
        .replace("+", "%20")
}

/// Process-independent registration values; stable for the life of the service instance.
pub(super) struct Process {
    nonce: String,
    started: i64,
}

impl Process {
    /// One random process nonce and start stamp, reusing the existing CSPRNG.
    pub(super) fn new() -> Result<Self, PlaybackError> {
        let raw = random::<18>()?;
        Ok(Self {
            nonce: general_purpose::URL_SAFE_NO_PAD.encode(raw),
            started: i64::try_from(super::identity::timestamp()?).unwrap_or(0),
        })
    }
}

/// Signed mobile-v5 request parts. The caller adds the transport headers.
pub(super) fn sign(
    query: &BTreeMap<String, String>,
    body: &[u8],
    stamp: u64,
    process: &Process,
    nonce: [u32; 4],
) -> Result<(String, HeaderMap), PlaybackError> {
    let ts = (stamp / 1000) as u32;
    let mut selected = None;
    for offset in 0..1024u64 {
        let ticket = stamp.saturating_add(offset);
        let raw = ordered_query(query, ticket);
        let (iv, q, m) = branch(&raw, body, ts);
        if iv & 15 == u32::from(BRANCH) {
            selected = Some((raw, ticket, q, m));
            break;
        }
    }
    let (raw, ticket, q, m) = selected.ok_or(PlaybackError::Configuration)?;
    let mut headers = HeaderMap::new();
    for (name, value) in [
        ("x-khronos", ts.to_string()),
        ("x-ss-req-ticket", ticket.to_string()),
        ("x-helios", helios(ts, nonce[3])),
        (
            "x-medusa",
            medusa(query, ts, &q, &m, [nonce[0], nonce[1], nonce[2]], process)?,
        ),
        ("x-ss-stub", hex(&m).to_ascii_uppercase()),
    ] {
        headers.insert(
            name,
            HeaderValue::from_str(&value).map_err(|_| PlaybackError::Configuration)?,
        );
    }
    Ok((raw, headers))
}

#[cfg(test)]
mod tests;
