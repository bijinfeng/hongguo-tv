//! Fixed anonymous registration primitives; never used as a new account protocol.
use super::PlaybackError;
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

pub(super) fn random<const N: usize>() -> Result<[u8; N], PlaybackError> {
    let mut bytes = [0; N];
    SystemRandom::new()
        .fill(&mut bytes)
        .map_err(|_| PlaybackError::Configuration)?;
    Ok(bytes)
}

pub(super) fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

pub(super) fn uuid() -> Result<String, PlaybackError> {
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

pub(super) fn encrypt_device(plain: &[u8], seed: &[u8; 32]) -> Result<Vec<u8>, PlaybackError> {
    if plain.len() > LIMIT {
        return Err(PlaybackError::InvalidModel);
    }
    let mut gzip = GzEncoder::new(Vec::new(), Compression::best());
    gzip.write_all(plain)
        .map_err(|_| PlaybackError::Configuration)?;
    let mut zipped = gzip.finish().map_err(|_| PlaybackError::Configuration)?;
    zipped[..10].copy_from_slice(&[0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 0]);
    let hash = digest::digest(&digest::SHA512, &zipped);
    let mut framed = hash.as_ref().to_vec();
    framed.extend_from_slice(&zipped);
    let key = device_key(seed);
    let cipher = cbc::Encryptor::<aes::Aes128>::new_from_slices(&key[..16], &key[16..32])
        .map_err(|_| PlaybackError::Configuration)?;
    let ciphertext = cipher.encrypt_padded_vec::<Pkcs7>(&framed);
    let mut output = vec![0x74, 0x63, 5, 0x10, 0, 0];
    output.extend_from_slice(seed);
    output.extend_from_slice(&ciphertext);
    Ok(output)
}

pub(super) fn decrypt_device(body: &[u8]) -> Result<Vec<u8>, PlaybackError> {
    if body.len() < 118
        || body.len() > LIMIT
        || !body.starts_with(&[0x74, 0x63, 5, 0x10, 0, 0])
        || !(body.len() - 38).is_multiple_of(16)
    {
        return Err(PlaybackError::InvalidModel);
    }
    let key = device_key(&body[6..38]);
    let cipher = cbc::Decryptor::<aes::Aes128>::new_from_slices(&key[..16], &key[16..32])
        .map_err(|_| PlaybackError::InvalidModel)?;
    let plain = cipher
        .decrypt_padded_vec::<Pkcs7>(&body[38..])
        .map_err(|_| PlaybackError::InvalidModel)?;
    if plain.len() < 64 || digest::digest(&digest::SHA512, &plain[64..]).as_ref() != &plain[..64] {
        return Err(PlaybackError::InvalidModel);
    }
    let mut reader = GzDecoder::new(&plain[64..]).take(LIMIT as u64 + 1);
    let mut output = Vec::new();
    reader
        .read_to_end(&mut output)
        .map_err(|_| PlaybackError::InvalidModel)?;
    if output.len() > LIMIT {
        return Err(PlaybackError::InvalidModel);
    }
    Ok(output)
}

pub(super) fn md5(bytes: &[u8]) -> [u8; 16] {
    Md5::digest(bytes).into()
}

pub(super) fn decode_url(encoded: &str, seed: &str) -> Result<String, PlaybackError> {
    use base64::{Engine, engine::general_purpose};
    if encoded.len() > 16 * 1024 || seed.len() > 1024 {
        return Err(PlaybackError::InvalidModel);
    }
    let seed = general_purpose::STANDARD
        .decode(seed)
        .map_err(|_| PlaybackError::InvalidModel)?;
    let data = general_purpose::STANDARD
        .decode(encoded)
        .map_err(|_| PlaybackError::InvalidModel)?;
    if seed.is_empty() || data.len() < 20 || data[0] != 0xa8 || data[2..4] != [1, 0] {
        return Err(PlaybackError::InvalidModel);
    }
    let key = device_key(&seed);
    let cipher = cbc::Decryptor::<aes::Aes128>::new_from_slices(&key[..16], &key[16..32])
        .map_err(|_| PlaybackError::InvalidModel)?;
    let plain = cipher
        .decrypt_padded_vec::<Pkcs7>(&data[4..])
        .map_err(|_| PlaybackError::InvalidModel)?;
    String::from_utf8(plain).map_err(|_| PlaybackError::InvalidModel)
}

pub(super) fn content_key(value: &str) -> Result<[u8; 16], PlaybackError> {
    use base64::{Engine, engine::general_purpose};
    let invalid = PlaybackError::UnsupportedMedia;
    if value.len() > 1024 {
        return Err(invalid);
    }
    let raw = general_purpose::STANDARD
        .decode(value)
        .or_else(|_| general_purpose::STANDARD_NO_PAD.decode(value))
        .map_err(|_| invalid)?;
    if raw.len() < 3 {
        return Err(invalid);
    }
    let tag_len = usize::from(raw[0] ^ raw[1] ^ raw[2])
        .checked_sub(48)
        .filter(|n| *n > 0)
        .ok_or(invalid)?;
    let len = raw
        .len()
        .checked_sub(tag_len + 1)
        .filter(|n| *n >= 33 && *n < raw.len())
        .ok_or(invalid)?;
    let seed = raw[len - 1] ^ raw[len];
    let tag = raw[len + 1..].iter().map(|b| b ^ seed).collect::<Vec<_>>();
    if tag == b"app_v2" || tag == b"web_v2" {
        return Err(invalid);
    }
    let mut decoded = Vec::with_capacity(len);
    let mut previous = [250u8, 85];
    for i in 0..len {
        let current = raw[i + 1];
        decoded.push(
            (previous[i % 2] ^ current)
                .wrapping_sub(21)
                .wrapping_sub(i.count_ones() as u8),
        );
        previous[i % 2] = current;
    }
    let marker = char::from(decoded[0]).to_digit(36).ok_or(invalid)? as usize;
    if len.checked_sub(marker + 1) != Some(32) {
        return Err(invalid);
    }
    let mut key = [0; 16];
    for (i, hex) in decoded[1..33].chunks_exact(2).enumerate() {
        let high = char::from(hex[0]).to_digit(16).ok_or(invalid)?;
        let low = char::from(hex[1]).to_digit(16).ok_or(invalid)?;
        key[i] = ((high << 4) | low) as u8;
    }
    Ok(key)
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

#[cfg(test)]
mod tests {
    use super::*;
    use base64::{Engine, engine::general_purpose};
    use serde_json::Value;

    #[test]
    fn synthetic_content_key_vector_rejects_malformed_and_unknown_payloads() {
        let vector = "lL8dx1O8G/BSvBvzYo8exWSJHPBivivzerwy7U6TA+xOlbi+tbiErQ==";
        let expected = [
            0x2b, 0x7e, 0x15, 0x16, 0x28, 0xae, 0xd2, 0xa6, 0xab, 0xf7, 0x15, 0x88, 0x09, 0xcf,
            0x4f, 0x3c,
        ];
        assert_eq!(content_key(vector), Ok(expected));
        assert_eq!(content_key(vector.trim_end_matches('=')), Ok(expected));
        for value in ["", "!!!", "AA==", "AAAA", &"a".repeat(1025)] {
            assert!(content_key(value).is_err());
        }
        let raw = general_purpose::STANDARD.decode(vector).unwrap();
        for n in 0..raw.len() - 6 {
            assert!(content_key(&general_purpose::STANDARD.encode(&raw[..n])).is_err());
        }
        for tag in [b"app_v2", b"web_v2"] {
            let mut bytes = raw.clone();
            let len = bytes.len();
            let seed = bytes[len - 8] ^ bytes[len - 7];
            for (i, b) in tag.iter().enumerate() {
                bytes[len - 6 + i] = b ^ seed;
            }
            assert!(content_key(&general_purpose::STANDARD.encode(bytes)).is_err());
        }
    }

    #[test]
    fn independently_generated_device_vector_and_corruption() {
        let vector: Value = serde_json::from_str(include_str!(
            "../../../../contracts/fixtures/playback/device-crypto.json"
        ))
        .unwrap();
        let seed = std::array::from_fn::<u8, 32, _>(|i| i as u8);
        assert_eq!(
            hex(&device_key(&seed)),
            vector["derived_key"].as_str().unwrap()
        );
        let cipher = general_purpose::STANDARD
            .decode(vector["ciphertext"].as_str().unwrap())
            .unwrap();
        assert_eq!(
            decrypt_device(&cipher).unwrap(),
            vector["plain"].as_str().unwrap().as_bytes()
        );
        let mut encrypted =
            encrypt_device(vector["plain"].as_str().unwrap().as_bytes(), &seed).unwrap();
        assert_eq!(
            decrypt_device(&encrypted).unwrap(),
            vector["plain"].as_str().unwrap().as_bytes()
        );
        let last = encrypted.len() - 1;
        encrypted[last] ^= 1;
        assert_eq!(decrypt_device(&encrypted), Err(PlaybackError::InvalidModel));
        for malformed in [&[][..], &cipher[..38], &cipher[..cipher.len() - 1]] {
            assert_eq!(decrypt_device(malformed), Err(PlaybackError::InvalidModel));
        }
    }
}
