use super::{
    PlaybackError,
    identity::encode_query,
    protocol::{hex, md5, random, registration_gorgon},
};
use aes::cipher::{BlockModeEncrypt, KeyIvInit, block_padding::Pkcs7};
use base64::{Engine, engine::general_purpose};
use reqwest::header::{HeaderMap, HeaderValue};
use std::collections::BTreeMap;

pub(super) fn sm3(data: &[u8]) -> [u8; 32] {
    let mut bytes = data.to_vec();
    bytes.push(0x80);
    while bytes.len() % 64 != 56 {
        bytes.push(0)
    }
    bytes.extend_from_slice(&((data.len() as u64) * 8).to_be_bytes());
    let mut v = [
        0x7380166fu32,
        0x4914b2b9,
        0x172442d7,
        0xda8a0600,
        0xa96f30bc,
        0x163138aa,
        0xe38dee4d,
        0xb0fb0e4e,
    ];
    let p0 = |x: u32| x ^ x.rotate_left(9) ^ x.rotate_left(17);
    let p1 = |x: u32| x ^ x.rotate_left(15) ^ x.rotate_left(23);
    for block in bytes.chunks_exact(64) {
        let mut w = [0u32; 68];
        for (i, word) in block.chunks_exact(4).enumerate() {
            w[i] = u32::from_be_bytes(word.try_into().expect("four-byte word"));
        }
        for i in 16..68 {
            w[i] = p1(w[i - 16] ^ w[i - 9] ^ w[i - 3].rotate_left(15))
                ^ w[i - 13].rotate_left(7)
                ^ w[i - 6];
        }
        let [mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut h] = v;
        for j in 0..64 {
            let (t, ff, gg) = if j < 16 {
                (0x79cc4519u32, a ^ b ^ c, e ^ f ^ g)
            } else {
                (0x7a879d8a, (a & b) | (a & c) | (b & c), (e & f) | (!e & g))
            };
            let ss1 = a
                .rotate_left(12)
                .wrapping_add(e)
                .wrapping_add(t.rotate_left(j as u32))
                .rotate_left(7);
            let tt1 = ff
                .wrapping_add(d)
                .wrapping_add(ss1 ^ a.rotate_left(12))
                .wrapping_add(w[j] ^ w[j + 4]);
            let tt2 = gg.wrapping_add(h).wrapping_add(ss1).wrapping_add(w[j]);
            d = c;
            c = b.rotate_left(9);
            b = a;
            a = tt1;
            h = g;
            g = f.rotate_left(19);
            f = e;
            e = p0(tt2);
        }
        for (i, x) in [a, b, c, d, e, f, g, h].into_iter().enumerate() {
            v[i] ^= x;
        }
    }
    let mut out = [0; 32];
    for (i, x) in v.into_iter().enumerate() {
        out[i * 4..i * 4 + 4].copy_from_slice(&x.to_be_bytes())
    }
    out
}
pub(super) fn iv_hash(data: &[u8], mut iv: u32) -> u32 {
    for (i, b) in data.iter().enumerate() {
        iv = if i & 1 == 0 {
            (iv >> 4) ^ iv ^ (iv << 6) ^ u32::from(*b)
        } else {
            !((iv >> 7) ^ iv ^ (u32::from(*b) | (iv << 12)))
        }
    }
    iv
}
fn pad(data: &[u8]) -> Vec<u8> {
    let n = 16 - data.len() % 16;
    let mut out = data.to_vec();
    out.resize(out.len() + n, n as u8);
    out
}
fn le64(bytes: &[u8]) -> u64 {
    u64::from_le_bytes(bytes[..8].try_into().expect("eight-byte word"))
}
pub(super) fn varint(out: &mut Vec<u8>, mut n: u64) {
    while n >= 128 {
        out.push((n as u8) | 128);
        n >>= 7
    }
    out.push(n as u8)
}
fn number(out: &mut Vec<u8>, field: u64, value: u32) {
    varint(out, field << 3);
    varint(out, u64::from(value));
}
pub(super) fn blob(out: &mut Vec<u8>, field: u64, value: &[u8]) {
    varint(out, (field << 3) | 2);
    varint(out, value.len() as u64);
    out.extend_from_slice(value)
}
pub(super) fn text(out: &mut Vec<u8>, field: u64, value: &str) {
    blob(out, field, value.as_bytes())
}
pub(super) fn unhex(value: &str) -> Vec<u8> {
    value
        .as_bytes()
        .chunks_exact(2)
        .map(|s| {
            u8::from_str_radix(std::str::from_utf8(s).expect("hex constant"), 16)
                .expect("hex constant")
        })
        .collect()
}

fn argus(
    query: &str,
    body: &[u8],
    ts: u32,
    nonce: u32,
    registered: bool,
) -> Result<String, PlaybackError> {
    let q: BTreeMap<_, _> = reqwest::Url::parse(&format!("https://fixture.invalid/?{query}"))
        .map_err(|_| PlaybackError::Configuration)?
        .query_pairs()
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .collect();
    let get = |name: &str| q.get(name).map(String::as_str).unwrap_or("");
    let aid = if get("aid").is_empty() {
        "1967"
    } else {
        get("aid")
    };
    let mut p = Vec::new();
    for (field, value) in [
        (1, 1077940818),
        (2, 2),
        (
            3,
            if registered {
                nonce & 0x7fffffff
            } else {
                nonce
            },
        ),
    ] {
        number(&mut p, field, value)
    }
    text(&mut p, 4, if registered { "8662" } else { aid });
    text(&mut p, 5, get("device_id"));
    text(&mut p, 6, "1611921764");
    text(
        &mut p,
        7,
        if registered {
            "7.3.5.32"
        } else {
            get("version_name")
        },
    );
    text(
        &mut p,
        8,
        if registered {
            "v04.07.01-ml-android"
        } else {
            "v04.04.05-ov-android"
        },
    );
    number(&mut p, 9, if registered { 135135744 } else { 134744640 });
    blob(&mut p, 10, &[0; 8]);
    number(&mut p, 11, 0);
    number(&mut p, 12, ts << 1);
    let m = if body.is_empty() { [0; 16] } else { md5(body) };
    blob(&mut p, 13, &sm3(&m)[..6]);
    let qh = if query.is_empty() && !registered {
        sm3(&[0; 16])
    } else {
        sm3(query.as_bytes())
    };
    blob(&mut p, 14, &qh[..6]);
    let mut counters = Vec::new();
    for (field, value) in [(1, 1), (2, 1), (3, 1), (7, 0xc792eccc)] {
        number(&mut counters, field, value)
    }
    blob(&mut p, 15, &counters);
    text(&mut p, 16, if registered { "" } else { get("iid") });
    text(&mut p, 20, "none");
    number(&mut p, 21, 738);
    let mut env = Vec::new();
    if registered {
        text(&mut env, 1, "25053RT47C");
        text(&mut env, 2, "16");
        text(&mut env, 3, "update_64");
        number(&mut env, 4, 2147483648);
    } else {
        text(&mut env, 1, "NX551J");
        number(&mut env, 2, 8196);
        number(&mut env, 4, 0x80e0d800);
    }
    blob(&mut p, 23, &env);
    number(&mut p, 25, 2);
    let registered_key = unhex("ac1adaae95a7af94a5114ab3b3a97dd80050aa0a39314c40528caec95256c28c");
    let raw = if registered {
        let mut seed = registered_key.clone();
        seed.extend_from_slice(&[0x3c, 0xcc, 0x56, 0x7b]);
        seed.extend_from_slice(&registered_key);
        sm3(&seed).to_vec()
    } else {
        unhex("fc78e0a9657a0c748ce51559903ccf03510e51d3cff232d71343e88a321c5304")
    };
    let mut rounds = [0u64; 72];
    for i in 0..4 {
        rounds[i] = le64(&raw[i * 8..]);
    }
    for i in 4..72 {
        let x = rounds[i - 1].rotate_right(3) ^ rounds[i - 3];
        rounds[i] = !rounds[i - 4]
            ^ x
            ^ x.rotate_right(1)
            ^ ((0x3dc94c3a046d678bu64 >> ((i - 4) % 62)) & 1)
            ^ 3;
    }
    let mut plain = pad(&p);
    for block in plain.chunks_exact_mut(16) {
        let (mut a, mut b) = (le64(block), le64(&block[8..]));
        for k in rounds {
            (a, b) = (
                b,
                a ^ (b.rotate_left(1) & b.rotate_left(8)) ^ b.rotate_left(2) ^ k,
            );
        }
        block[..8].copy_from_slice(&a.to_le_bytes());
        block[8..].copy_from_slice(&b.to_le_bytes());
    }
    let (key, iv, frame, prefix) = if registered {
        let mask = [0xd0, 0x4f, 0xfd, 0xff, 0xd0, 0x4f, 0xfd, 0xff];
        for (i, b) in plain.iter_mut().enumerate() {
            *b ^= mask[i % 8];
        }
        let mut frame = mask.to_vec();
        frame.extend_from_slice(&plain);
        frame.reverse();
        let mut outer = vec![0xa6, 0xe7, 0x83, 0xee, 0x70, 1, 0x10, 9, 0x18];
        outer.extend_from_slice(&frame);
        outer.extend_from_slice(&[0x56, 0x7b]);
        (
            md5(&registered_key[..16]).to_vec(),
            md5(&registered_key[16..]).to_vec(),
            outer,
            [0x3c, 0xcc],
        )
    } else {
        let mask = [0xf2, 0xf7, 0xfc, 0xff, 0xf2, 0xf7, 0xfc, 0xff];
        let mut frame = mask.to_vec();
        frame.extend_from_slice(&plain);
        frame.extend_from_slice(&[0xea, 0xfb, 0x2c, 0xfe, 0x85, 0x68, 0x51, 0x91, 0x54]);
        for i in 8..frame.len() {
            frame[i] ^= mask[i % 8];
        }
        frame.reverse();
        frame.extend_from_slice(&[0x61, 0x6f]);
        (
            unhex("d31e3718288a1027baab59f146a09a9c"),
            unhex("ea180a0336ed352fcd24e4d50018ae54"),
            frame,
            [0xf2, 0x81],
        )
    };
    let cipher = cbc::Encryptor::<aes::Aes128>::new_from_slices(&key, &iv)
        .map_err(|_| PlaybackError::Configuration)?;
    let mut out = prefix.to_vec();
    out.extend_from_slice(&cipher.encrypt_padded_vec::<Pkcs7>(&frame));
    Ok(general_purpose::STANDARD.encode(out))
}

pub(super) fn ladon(ts: u32, aid: &str, nonce: u32, license: &str) -> String {
    let mut seed = nonce.to_le_bytes().to_vec();
    let mut input = seed.clone();
    input.extend_from_slice(aid.as_bytes());
    let digest = hex(&md5(&input));
    let raw = digest.as_bytes();
    let mut k = le64(raw);
    let mut pending = [le64(&raw[8..]), le64(&raw[16..]), le64(&raw[24..])];
    let mut keys = [0u64; 34];
    for (i, key) in keys.iter_mut().enumerate() {
        *key = k;
        let x = pending[0].rotate_right(8).wrapping_add(k) ^ (i as u64);
        pending = [pending[1], pending[2], x];
        k = x ^ k.rotate_left(3);
    }
    let mut plain = pad(format!("{ts}-{license}-{aid}").as_bytes());
    for block in plain.chunks_exact_mut(16) {
        let (mut a, mut b) = (le64(block), le64(&block[8..]));
        for key in keys {
            b = key ^ a.wrapping_add(b.rotate_right(8));
            a = b ^ a.rotate_left(3);
        }
        block[..8].copy_from_slice(&a.to_le_bytes());
        block[8..].copy_from_slice(&b.to_le_bytes());
    }
    seed.extend_from_slice(&plain);
    general_purpose::STANDARD.encode(seed)
}
fn registered_gorgon(query: &str, body: &[u8], ts: u32) -> String {
    let mut p = [0u8; 20];
    p[..4].copy_from_slice(&md5(query.as_bytes())[..4]);
    if !body.is_empty() {
        p[4..8].copy_from_slice(&md5(body)[..4]);
    }
    p[12..16].copy_from_slice(&[0, 6, 11, 28]);
    p[16..].copy_from_slice(&ts.to_be_bytes());
    let key = [
        0x44, 0xb9, 0xb9, 0xd9, 0xa4, 0xae, 0xf9, 0xfc, 0xa4, 0x93, 0xaa, 0x75, 0x7c, 0xa3, 0xc2,
        0xc4, 0xa4, 0x96, 0x93, 0x8f,
    ];
    for i in 0..20 {
        p[i] ^= key[i];
    }
    for i in 0..20 {
        p[i] = (p[i].rotate_left(4) ^ p[(i + 1) % 20]).reverse_bits() ^ 0xff ^ 20;
    }
    let mut out = vec![0x84, 4, 0x40, 0x1c, 0, 0];
    out.extend_from_slice(&p);
    hex(&out)
}

pub(super) fn sign(
    mut query: BTreeMap<String, String>,
    body: &[u8],
    stamp: u64,
    registered: bool,
) -> Result<(String, HeaderMap), PlaybackError> {
    let ts = (stamp / 1000) as u32;
    if !registered {
        query.insert("ts".into(), (stamp / 1000).to_string());
    }
    let mut raw = String::new();
    for i in 0..if registered { 1 } else { 256 } {
        query.insert("_rticket".into(), (stamp + i).to_string());
        raw = encode_query(&query);
        if registered {
            break;
        }
        let hash = sm3(raw.as_bytes());
        let m = if body.is_empty() { [0; 16] } else { md5(body) };
        let iv = iv_hash(&ts.to_le_bytes(), iv_hash(&m, iv_hash(&hash, 0x20230928)));
        if (iv & 15) % 3 == 2 {
            break;
        }
        if i == 255 {
            return Err(PlaybackError::Configuration);
        }
    }
    let nonce = u32::from_le_bytes(random()?);
    let ladon_nonce = u32::from_le_bytes(random()?);
    let aid = query.get("aid").map(String::as_str).unwrap_or("1967");
    let mut h = HeaderMap::new();
    for (k, v) in [
        ("x-khronos", ts.to_string()),
        (
            "x-ss-req-ticket",
            query.get("_rticket").cloned().unwrap_or_default(),
        ),
        ("x-ss-stub", hex(&md5(body)).to_ascii_uppercase()),
        (
            "x-gorgon",
            if registered {
                registered_gorgon(&raw, body, ts)
            } else {
                registration_gorgon(&raw, body, ts, nonce as u16)
            },
        ),
        ("x-argus", argus(&raw, body, ts, nonce, registered)?),
        ("x-ladon", ladon(ts, aid, ladon_nonce, "1611921764")),
    ] {
        h.insert(
            k,
            HeaderValue::from_str(&v).map_err(|_| PlaybackError::Configuration)?,
        );
    }
    if !registered {
        h.insert(
            "x-helios",
            HeaderValue::from_str(&ladon(
                ts,
                "8662",
                u32::from_le_bytes(random()?),
                "1588093228",
            ))
            .map_err(|_| PlaybackError::Configuration)?,
        );
    }
    Ok((raw, h))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;
    #[test]
    fn playback_signatures_match_pinned_vectors() {
        assert_eq!(
            hex(&sm3(b"abc")),
            "66c7f0f462eeedd9d1f2d46bdc10e4e24167c4875cf2f7a2297da02b8f4ba8e0"
        );
        let vectors: Value = serde_json::from_str(include_str!(
            "../../../../contracts/fixtures/playback/sign-legacy.json"
        ))
        .unwrap();
        for v in vectors.as_array().unwrap() {
            let q = v["query"].as_str().unwrap();
            let body = v["body"].as_str().unwrap().as_bytes();
            let ts = v["ts"].as_u64().unwrap() as u32;
            let nonce = v["nonce"].as_u64().unwrap() as u32;
            assert_eq!(
                argus(q, body, ts, nonce, false).unwrap(),
                v["argus"].as_str().unwrap()
            );
            let aid = if q.contains("8662") { "8662" } else { "1967" };
            assert_eq!(
                ladon(ts, aid, 0x04030201, "1611921764"),
                v["ladon"].as_str().unwrap()
            );
        }
        let v: Value = serde_json::from_str(include_str!(
            "../../../../contracts/fixtures/playback/sign-registered.json"
        ))
        .unwrap();
        let q = v["query"].as_str().unwrap();
        let body = v["body"].as_str().unwrap().as_bytes();
        let ts = v["ts"].as_u64().unwrap() as u32;
        assert_eq!(
            argus(q, body, ts, v["nonce"].as_u64().unwrap() as u32, true).unwrap(),
            v["argus"].as_str().unwrap()
        );
        assert_eq!(
            registered_gorgon(q, body, ts),
            v["gorgon"].as_str().unwrap()
        );
        assert_eq!(
            ladon(ts, "8662", 0x04030201, "1611921764"),
            v["ladon"].as_str().unwrap()
        );
    }
}
