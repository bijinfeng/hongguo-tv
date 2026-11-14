//! Fixed public-plan Medusa profile; no account input and no playback profile changes.
use super::{
    PlaybackError,
    identity::encode_query,
    protocol::{md5, random, registration_gorgon},
    sign::{blob, iv_hash, ladon, sm3, text, unhex, varint},
};
use base64::{Engine, engine::general_purpose};
use reqwest::header::{HeaderMap, HeaderValue};
use std::collections::BTreeMap;
include!("public_sign/tables.rs");

fn branch(query: &str, body: &[u8], ts: u32) -> (u32, [u8; 32], [u8; 16]) {
    let q = sm3(query.as_bytes());
    let m = if body.is_empty() { [0; 16] } else { md5(body) };
    let iv = iv_hash(&ts.to_le_bytes(), iv_hash(&m, iv_hash(&q, 0x20230928)));
    (iv, q, m)
}
fn f13(iv: u32, ts: u32, q: &[u8; 32], m: &[u8; 16]) -> Vec<u8> {
    let group = ((iv & 15) - 2) as usize / 3;
    let count = [
        0x8980f29bu32,
        0xeb549c7f,
        0xb08726db,
        0xd40cb5e6,
        0xe8f559e4,
    ][group]
        .wrapping_add(ts);
    let shift = count.wrapping_add(5) & 7;
    let mut msg = q.to_vec();
    msg.extend_from_slice(m);
    msg.extend_from_slice(&ts.to_le_bytes());
    for x in unhex("8496779dd4150bf8") {
        msg.push(((u16::from(x) * 257) >> shift) as u8);
    }
    msg.extend_from_slice(&[0xa0, 1, 0, 0]);
    let start =
        [0x79e0f2fbu32, 0xc8b52570, 0xebc2f8cd, 0x7c104d93].map(|x| x.rotate_right(count & 31));
    let end = [0x19be4866u32, 0xe85986b4, 0xe19b326e, 0x71d1d7d4]
        .map(|x| x.rotate_right(count.wrapping_add(6) & 31));
    let [mut a, mut b, mut c, mut d] = start;
    let shifts = [
        [7, 12, 17, 22],
        [5, 9, 14, 20],
        [4, 11, 16, 23],
        [6, 10, 15, 21],
    ];
    let orders = unhex(ORDERS);
    for i in 0..64 {
        let f = match i / 16 {
            0 => (b & c) | (!b & d),
            1 => (b & d) | (c & !d),
            2 => b ^ c ^ d,
            _ => c ^ (b | !d),
        };
        let offset = usize::from(orders[group * 64 + i]) * 4;
        let word = u32::from_le_bytes(msg[offset..offset + 4].try_into().expect("fixed word"));
        let x = b.wrapping_add(
            a.wrapping_add(f)
                .wrapping_add(word)
                .wrapping_add(MD5_CONSTANTS[i].rotate_right(count.wrapping_add(1) & 31))
                .rotate_left(shifts[i / 16][i % 4]),
        );
        (a, b, c, d) = (d, x, b, c);
    }
    let mut out = Vec::with_capacity(20);
    for (i, x) in [a, b, c, d].iter().enumerate() {
        out.extend_from_slice(&(start[i].wrapping_add(*x) ^ end[i]).to_le_bytes());
    }
    let mut check = 0x20220420u32;
    for (i, x) in out[..12].iter().enumerate() {
        check = if i & 1 == 0 {
            (check >> 3) ^ check ^ u32::from(*x) ^ (check << 7)
        } else {
            (check >> 5) ^ check ^ !(u32::from(*x) | (check << 11))
        };
    }
    out.extend_from_slice(&((check | 4) ^ 0x1000000).to_le_bytes());
    out
}
fn sint(out: &mut Vec<u8>, field: u64, n: i64) {
    varint(out, field << 3);
    varint(out, ((n as u64) << 1) ^ ((n >> 63) as u64));
}
fn proto(
    query: &str,
    ts: u32,
    nonce: u32,
    device_id: &str,
    q: &[u8; 32],
    m: &[u8; 16],
    digest: &[u8],
) -> Vec<u8> {
    let (mut device, mut env, mut report, mut count, mut p) =
        (Vec::new(), Vec::new(), Vec::new(), Vec::new(), Vec::new());
    sint(&mut device, 1, 1);
    sint(&mut device, 2, 2);
    for (field, value) in [
        (3, "8662"),
        (4, device_id),
        (5, "Ai6svO3PyrwDOUSmO6ZcResxu"),
        (6, "!noperm!"),
    ] {
        text(&mut device, field, value);
    }
    for field in [7, 8] {
        sint(&mut device, field, -888888);
    }
    sint(&mut device, 9, 3);
    sint(&mut device, 10, -888888);
    text(&mut device, 11, "!notset!");
    text(&mut device, 12, "Asia/Shanghai,8");
    text(&mut device, 13, "zh_CN");
    sint(&mut device, 14, 4);
    for (i, x) in [
        0x437f3ffcu32,
        0x420e580eu32,
        0x405deab0u32,
        0x405deab0u32,
        0x437f2cedu32,
        0x4228b3a7u32,
    ]
    .iter()
    .enumerate()
    {
        varint(&mut device, (((i + 16) as u64) << 3) | 5);
        device.extend_from_slice(&x.to_le_bytes());
    }
    text(&mut device, 22, "16");
    sint(&mut device, 23, 41);
    sint(&mut device, 24, 36);
    for field in 25..=28 {
        sint(
            &mut device,
            field,
            1728388016635 + if field == 28 { 2 } else { 0 },
        );
    }
    sint(&mut device, 29, -1);
    for (i, x) in [
        "25053RT47C",
        "Redmi",
        "25053RT47C",
        "25053RT47C",
        "Redmi",
        "Redmi",
        "Redmi",
    ]
    .iter()
    .enumerate()
    {
        text(&mut device, (i + 30) as u64, x);
    }
    sint(&mut device, 38, 31);
    sint(&mut report, 1, i64::from(ts));
    sint(&mut report, 2, -2);
    sint(&mut report, 4, 200);
    for (field, n) in [(1, 110), (2, 146331399), (3, 146331396), (5, 7)] {
        sint(&mut env, field, n);
    }
    text(&mut env, 6, "v04.06.04.03-bugfix");
    sint(&mut env, 7, 11001);
    blob(&mut env, 12, &device);
    blob(&mut env, 13, &report);
    text(&mut env, 14, "7.3.5.32");
    for (field, n) in [(1, 111), (2, 10), (3, 694367), (5, 586952199)] {
        sint(&mut count, field, n);
    }
    blob(&mut p, 1, &unhex("f7e85ffad7d7dc3bd62ac87057cf6118"));
    sint(&mut p, 2, 3);
    sint(&mut p, 3, i64::from(nonce));
    for (field, value) in [
        (4, "8662"),
        (5, device_id),
        (6, "1588093228"),
        (7, "7.3.5.32"),
        (8, "v04.06.04-ml-android"),
    ] {
        text(&mut p, field, value);
    }
    sint(&mut p, 9, 67503104);
    blob(&mut p, 10, &unhex("4001000000000000"));
    sint(&mut p, 12, i64::from(ts));
    blob(&mut p, 13, digest);
    blob(&mut p, 14, &q[..6]);
    blob(&mut p, 15, &count);
    text(&mut p, 16, "AXYQOS6n2m60x1fVZHIrH3iol");
    sint(&mut p, 17, i64::from(ts));
    let mut hash_input = query.as_bytes().to_vec();
    hash_input.extend_from_slice(m);
    hash_input.extend_from_slice(b"none");
    blob(&mut p, 19, &sm3(&hash_input));
    text(&mut p, 20, "none");
    sint(&mut p, 21, 312);
    blob(&mut p, 23, &env);
    text(
        &mut p,
        24,
        r#"{"cmr":16777216,"cmr2":16777216,"un_h":1879194040,"vpn":0,"kd":0,"fkd":3672518972,"pd":-1872573247,"dyn":"","do":0,"tk":true}"#,
    );
    p
}
fn xm_xor(data: &[u8], key: &[u8; 32]) -> Vec<u8> {
    let mut out = vec![0u8; data.len()];
    for (i, x) in data.iter().enumerate() {
        let k = (i * 4) & 28;
        let (a, b) = (key[k], key[k + 1]);
        let v = (!x.rotate_left(4).wrapping_add(a)) ^ b;
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
fn aes_v3(data: &[u8], ts: u32) -> Result<Vec<u8>, PlaybackError> {
    if data.len() < 248 {
        return Err(PlaybackError::Configuration);
    }
    let i = (ts & 3) as usize;
    let table = unhex(SBOX);
    let bx = &table[i * 256..(i + 1) * 256];
    let con = [[1, 0, 2, 3], [2, 0, 3, 1], [0, 1, 3, 2], [1, 0, 2, 3]][i];
    let order = [
        [0, 9, 14, 11, 4, 13, 2, 7, 8, 1, 6, 15, 12, 5, 10, 3],
        [0, 9, 14, 15, 4, 13, 2, 7, 8, 1, 6, 3, 12, 5, 10, 11],
        [0, 9, 14, 7, 4, 13, 2, 11, 8, 1, 6, 3, 12, 5, 10, 15],
        [0, 9, 14, 11, 4, 13, 2, 7, 8, 1, 6, 15, 12, 5, 10, 3],
    ][i];
    let init = [0xca025ddcu32, 0x823dc546, 0xc9420583, 0xc298225f][i];
    let key = unhex("f1593376766ea98d34f31b057a9d5be4");
    let mut mk = [0u8; 48];
    for j in 0..16 {
        mk[j] = key[j] ^ ((init >> ((j % 4) * 8)) as u8);
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
    let mut plain = [0u8; 32];
    for j in 0..31 {
        let d = &data[j * 8..];
        plain[j] = ((d[0] >> 4) & 2)
            | (d[1] & 64)
            | ((d[2] >> 2) & 1)
            | ((d[3] << 3) & 128)
            | ((d[4] >> 1) & 4)
            | ((d[5] << 3) & 16)
            | ((d[6] << 5) & 32)
            | ((d[7] >> 4) & 8);
    }
    plain[31] = 1;
    let mut previous = unhex("1fe109a4125283f418de9e051a969e12");
    let mut encrypted = Vec::with_capacity(32);
    for j in [0, 16] {
        for k in 0..16 {
            plain[j + k] ^= previous[k];
        }
        previous = block(&plain[j..j + 16]);
        encrypted.extend_from_slice(&previous);
    }
    let mut out = vec![encrypted[31]];
    out.extend_from_slice(data);
    for j in 0..31 {
        let d = &mut out[1 + j * 8..];
        let k = encrypted[j];
        d[0] = (d[0] & !32) | ((k << 4) & 32);
        d[1] = (d[1] & !64) | (k & 64);
        d[2] = (d[2] & !4) | ((k << 2) & 4);
        d[3] = (d[3] & !16) | ((k >> 3) & 16);
        d[4] = (d[4] & !8) | ((k << 1) & 8);
        d[5] = (d[5] & !2) | ((k >> 3) & 2);
        d[6] = (d[6] & !1) | ((k >> 5) & 1);
        d[7] = (d[7] & 127) | ((k << 4) & 128);
    }
    Ok(out)
}
fn medusa(
    query: &str,
    ts: u32,
    randoms: [u32; 3],
    device_id: &str,
    iv: u32,
    q: &[u8; 32],
    m: &[u8; 16],
) -> Result<String, PlaybackError> {
    let [nonce, hash_rand, xm_rand] = randoms;
    let digest = f13(iv, ts, q, m);
    let sign_key = unhex("8ebdfa3806ecc5cee79423e6029ed82540bc2218bb7eaef71cb691f7aa8aa2f5");
    let mut key_input = sign_key.clone();
    key_input.extend_from_slice(&hash_rand.to_le_bytes());
    key_input.extend_from_slice(&sign_key);
    let key = sm3(&key_input);
    let d1 = (hash_rand >> 16) & 255;
    let seed = (!((d1 << 11) | ((hash_rand >> 24) ^ (d1 >> 5) ^ d1))).to_le_bytes();
    let mut p = unhex("4001000000000000");
    p.extend_from_slice(&xm_xor(
        &proto(query, ts, nonce, device_id, q, m, &digest),
        &key,
    ));
    p.reverse();
    for (i, x) in p.iter_mut().enumerate() {
        *x ^= seed[(!i) & 3];
    }
    let check = 0x18000001u32 | (u32::from(q[0] & 63) << 14) | (u32::from(digest[0] & 63) << 8);
    let mut body = vec![0x35];
    body.extend_from_slice(&xm_rand.to_le_bytes());
    body.extend_from_slice(&check.to_le_bytes());
    body.extend_from_slice(&p);
    body.extend_from_slice(&hash_rand.to_le_bytes()[2..]);
    let enc = aes_v3(&body, ts)?;
    let mut header = unhex("03000000f7e85ffad7d7dc3bd62ac87057cf6118");
    for word in header.chunks_exact_mut(4) {
        let n = u32::from_le_bytes(word.try_into().expect("fixed header")) ^ ts;
        word.copy_from_slice(&n.to_le_bytes());
    }
    header.extend_from_slice(&hash_rand.to_le_bytes()[..2]);
    header.extend_from_slice(&[0, 1]);
    header.extend_from_slice(&enc);
    Ok(general_purpose::STANDARD.encode(header))
}
/// Public-plan only. All randomness and signing stay in process.
pub(super) fn sign(
    mut query: BTreeMap<String, String>,
    stamp: u64,
    device_id: &str,
) -> Result<(String, HeaderMap), PlaybackError> {
    let ts = (stamp / 1000) as u32;
    for i in 0..256 {
        query.insert(
            "_rticket".into(),
            stamp
                .checked_add(i)
                .ok_or(PlaybackError::Configuration)?
                .to_string(),
        );
        let raw = encode_query(&query);
        let (iv, q, m) = branch(&raw, b"", ts);
        if (iv & 15) % 3 != 2 {
            continue;
        }
        let [nonce, hash_rand, xm_rand, helios_rand] =
            [random()?, random()?, random()?, random()?].map(u32::from_le_bytes);
        let mut headers = HeaderMap::new();
        for (name, value) in [
            ("x-khronos", ts.to_string()),
            ("x-ss-req-ticket", query["_rticket"].clone()),
            ("x-helios", ladon(ts, "8662", helios_rand, "1588093228")),
            (
                "x-medusa",
                medusa(&raw, ts, [nonce, hash_rand, xm_rand], device_id, iv, &q, &m)?,
            ),
            ("x-gorgon", registration_gorgon(&raw, b"", ts, nonce as u16)),
        ] {
            headers.insert(
                name,
                HeaderValue::from_str(&value).map_err(|_| PlaybackError::Configuration)?,
            );
        }
        return Ok((raw, headers));
    }
    Err(PlaybackError::Configuration)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::playback::protocol::hex;
    #[test]
    fn public_plan_matches_independent_vectors_including_all_cipher_branches() {
        let v: serde_json::Value = serde_json::from_str(include_str!(
            "../../../../contracts/fixtures/discovery/passport-vectors.json"
        ))
        .unwrap();
        let raw = v["query"].as_str().unwrap();
        let body = v["body"].as_str().unwrap().as_bytes();
        let ts = v["ts"].as_u64().unwrap() as u32;
        let (iv, q, m) = branch(raw, body, ts);
        assert_eq!(iv, v["iv"].as_u64().unwrap() as u32);
        assert_eq!(hex(&q), v["sm3"].as_str().unwrap());
        let digest = f13(iv, ts, &q, &m);
        assert_eq!(hex(&digest), v["f13"].as_str().unwrap());
        assert_eq!(
            hex(&proto(
                raw,
                ts,
                0x12345678,
                "7000000000000000001",
                &q,
                &m,
                &digest
            )),
            v["proto"].as_str().unwrap()
        );
        assert_eq!(
            ladon(ts, "8662", 0x12345678, "1588093228"),
            v["helios"].as_str().unwrap()
        );
        assert_eq!(
            registration_gorgon(raw, body, ts, 0x4567),
            v["gorgon"].as_str().unwrap()
        );
        let data: Vec<u8> = (0..256).map(|n| n as u8).collect();
        for (i, want) in v["aes_v3"].as_array().unwrap().iter().enumerate() {
            assert_eq!(
                hex(&aes_v3(&data, ts + i as u32).unwrap()),
                want.as_str().unwrap()
            );
        }
        assert_eq!(
            medusa(
                raw,
                ts,
                [0x12345678, 0x87654321, 0x33445566],
                "7000000000000000001",
                iv,
                &q,
                &m
            )
            .unwrap(),
            v["medusa"].as_str().unwrap()
        );
        assert!(aes_v3(&data[..247], ts).is_err());
    }
}
