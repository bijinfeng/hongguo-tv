//! Bounded cryptographic primitives shared by the pinned Passport wire profiles.
use super::PassportError;
use aes::cipher::{BlockModeDecrypt, BlockModeEncrypt, KeyIvInit, block_padding::Pkcs7};
use flate2::{Compression, read::GzDecoder, write::GzEncoder};
use md5::{Digest, Md5};
use ring::{
    digest,
    rand::{SecureRandom, SystemRandom},
};
use std::io::{Read, Write};

const LIMIT: usize = 4 * 1024 * 1024;
const SALT: [u8; 64] = [
    0x4d, 0xd4, 0xc2, 0xe6, 0xb8, 0x31, 0x62, 0x09, 0x0e, 0x52, 0xb3, 0xc7, 0xa6, 0x73, 0x3b, 0xa4,
    0x1c, 0xb2, 0x46, 0x2b, 0x82, 0x9a, 0xb5, 0x8a, 0x19, 0x6b, 0x39, 0xdb, 0x57, 0x17, 0x75, 0x24,
    0xf4, 0x9b, 0xaf, 0x7f, 0x08, 0xe8, 0xd6, 0x8d, 0x26, 0xa7, 0x2e, 0x37, 0xc1, 0xa9, 0x5a, 0x2f,
    0x1f, 0x05, 0xa5, 0x18, 0x92, 0xae, 0xf2, 0x94, 0x97, 0x32, 0xb6, 0x2a, 0x38, 0xaa, 0xdd, 0x58,
];

pub(super) fn random<const N: usize>() -> Result<[u8; N], PassportError> {
    let mut bytes = [0; N];
    SystemRandom::new()
        .fill(&mut bytes)
        .map_err(|_| PassportError::Configuration)?;
    Ok(bytes)
}

pub(super) fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

pub(super) fn uuid() -> Result<String, PassportError> {
    let mut b = random::<16>()?;
    b[6] = (b[6] & 15) | 64;
    b[8] = (b[8] & 63) | 128;
    Ok(format!(
        "{}-{}-{}-{}-{}",
        hex(&b[..4]),
        hex(&b[4..6]),
        hex(&b[6..8]),
        hex(&b[8..10]),
        hex(&b[10..])
    ))
}

pub(super) fn device_key(seed: &[u8]) -> [u8; 64] {
    let hash = digest::digest(&digest::SHA512, seed);
    let mut input = [0; 128];
    input[..64].copy_from_slice(hash.as_ref());
    input[64..].copy_from_slice(&SALT);
    let mut result = [0; 64];
    result.copy_from_slice(digest::digest(&digest::SHA512, &input).as_ref());
    result
}

pub(super) fn encrypt_device(plain: &[u8], seed: &[u8; 32]) -> Result<Vec<u8>, PassportError> {
    if plain.len() > LIMIT {
        return Err(PassportError::InvalidResponse);
    }
    let mut gzip = GzEncoder::new(Vec::new(), Compression::best());
    gzip.write_all(plain)
        .map_err(|_| PassportError::Configuration)?;
    let mut zipped = gzip.finish().map_err(|_| PassportError::Configuration)?;
    zipped[..10].copy_from_slice(&[0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 0]);
    let hash = digest::digest(&digest::SHA512, &zipped);
    let mut framed = hash.as_ref().to_vec();
    framed.extend_from_slice(&zipped);
    let key = device_key(seed);
    let cipher = cbc::Encryptor::<aes::Aes128>::new_from_slices(&key[..16], &key[16..32])
        .map_err(|_| PassportError::Configuration)?;
    let ciphertext = cipher.encrypt_padded_vec::<Pkcs7>(&framed);
    let mut output = vec![0x74, 0x63, 5, 0x10, 0, 0];
    output.extend_from_slice(seed);
    output.extend_from_slice(&ciphertext);
    Ok(output)
}

pub(super) fn decrypt_device(body: &[u8]) -> Result<Vec<u8>, PassportError> {
    if body.len() < 118
        || body.len() > LIMIT
        || !body.starts_with(&[0x74, 0x63, 5, 0x10, 0, 0])
        || !(body.len() - 38).is_multiple_of(16)
    {
        return Err(PassportError::InvalidResponse);
    }
    let key = device_key(&body[6..38]);
    let cipher = cbc::Decryptor::<aes::Aes128>::new_from_slices(&key[..16], &key[16..32])
        .map_err(|_| PassportError::InvalidResponse)?;
    let plain = cipher
        .decrypt_padded_vec::<Pkcs7>(&body[38..])
        .map_err(|_| PassportError::InvalidResponse)?;
    if plain.len() < 64 || digest::digest(&digest::SHA512, &plain[64..]).as_ref() != &plain[..64] {
        return Err(PassportError::InvalidResponse);
    }
    let mut reader = GzDecoder::new(&plain[64..]).take(LIMIT as u64 + 1);
    let mut output = Vec::new();
    reader
        .read_to_end(&mut output)
        .map_err(|_| PassportError::InvalidResponse)?;
    if output.len() > LIMIT {
        return Err(PassportError::InvalidResponse);
    }
    Ok(output)
}

pub(super) fn md5(bytes: &[u8]) -> [u8; 16] {
    Md5::digest(bytes).into()
}

pub(super) fn registration_gorgon(query: &str, body: &[u8], ts: u32, nonce: u16) -> String {
    let q = md5(query.as_bytes());
    let m = if body.is_empty() { [0; 16] } else { md5(body) };
    let mut data = [0u8; 20];
    data[..4].copy_from_slice(&q[..4]);
    data[4..8].copy_from_slice(&m[..4]);
    data[12..16].copy_from_slice(&67503104u32.to_le_bytes());
    data[16..].copy_from_slice(&ts.to_be_bytes());
    let key = [
        0x4a,
        0x40,
        0x16,
        (nonce >> 8) as u8,
        0x47,
        0x6c,
        1,
        nonce as u8,
    ];
    let mut s = std::array::from_fn::<u8, 256, _>(|i| i as u8);
    let mut j = 0usize;
    for i in 0..256 {
        j = (j + usize::from(s[i]) + usize::from(key[i % 8])) & 255;
        s[i] = s[j];
    }
    j = 0;
    for i in 0..20 {
        j += usize::from(s[i + 1]);
        let y = s[j & 255];
        s[i + 1] = y;
        data[i] ^= s[(usize::from(y) * 2) & 255];
    }
    for i in 0..20 {
        data[i] = data[i].rotate_left(4);
        let next = if i < 19 { data[i + 1] } else { data[0] };
        data[i] = !((data[i] ^ next).reverse_bits() ^ 20);
    }
    let mut framed = vec![0x84, 4, nonce as u8, (nonce >> 8) as u8, 0x40, 1];
    framed.extend_from_slice(&data);
    hex(&framed)
}

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

use base64::{Engine, engine::general_purpose};
