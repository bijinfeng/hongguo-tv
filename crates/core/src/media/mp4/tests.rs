use super::*;
fn hex(s: &str) -> Vec<u8> {
    s.as_bytes()
        .chunks_exact(2)
        .map(|b| u8::from_str_radix(std::str::from_utf8(b).unwrap(), 16).unwrap())
        .collect()
}
pub(crate) fn atom(kind: &[u8; 4], payload: &[u8]) -> Vec<u8> {
    let mut v = ((payload.len() + 8) as u32).to_be_bytes().to_vec();
    v.extend_from_slice(kind);
    v.extend_from_slice(payload);
    v
}
fn join(parts: &[Vec<u8>]) -> Vec<u8> {
    parts.concat()
}
fn ints(values: &[u32]) -> Vec<u8> {
    values.iter().flat_map(|v| v.to_be_bytes()).collect()
}
fn metadata(offset: u32, encrypted: bool, vendor: bool) -> Vec<u8> {
    let mut entry = vec![0; 78];
    entry.extend_from_slice(&atom(b"hvcC", &[0; 23]));
    if vendor {
        entry.extend_from_slice(&atom(b"bv2C", &[1, 2, 3]));
    }
    if encrypted {
        entry.extend_from_slice(&atom(
            b"sinf",
            &join(&[
                atom(b"frma", b"hvc1"),
                atom(b"schm", &join(&[vec![0; 4], b"cenc".to_vec(), vec![0; 4]])),
            ]),
        ));
    }
    let stsd = atom(
        b"stsd",
        &join(&[
            ints(&[0, 1]),
            atom(if encrypted { b"encv" } else { b"hvc1" }, &entry),
        ]),
    );
    let mut stbl = join(&[
        stsd,
        atom(b"stsc", &ints(&[0, 1, 1, 1, 1])),
        atom(b"stsz", &ints(&[0, 64, 1])),
        atom(b"stco", &ints(&[0, 1, offset])),
    ]);
    if encrypted {
        let mut p = ints(&[0, 1]);
        p.extend_from_slice(&hex("f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff"));
        stbl.extend_from_slice(&atom(b"senc", &p));
    }
    atom(
        b"moov",
        &atom(
            b"trak",
            &atom(b"mdia", &atom(b"minf", &atom(b"stbl", &stbl))),
        ),
    )
}
pub(crate) fn fixture(encrypted: bool, vendor: bool) -> Vec<u8> {
    let ftyp = atom(b"ftyp", b"isom\0\0\0\0isom");
    let provisional = metadata(0, encrypted, vendor);
    let offset = (ftyp.len() + provisional.len() + 8) as u32;
    let samples = if encrypted {
        hex(
            "874d6191b620e3261bef6864990db6ce9806f66b7970fdff8617187bb9fffdff5ae4df3edbd5d35e5b4f09020db03eab1e031dda2fbe03d1792170a0f3009cee",
        )
    } else {
        vec![7; 64]
    };
    join(&[
        ftyp,
        metadata(offset, encrypted, vendor),
        atom(b"mdat", &samples),
    ])
}

#[test]
fn ctr_matches_nist_at_every_fragment_offset_and_detects_overflow() {
    let key = hex("2b7e151628aed2a6abf7158809cf4f3c");
    let iv = hex("f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff").try_into().unwrap();
    let cipher = aes::Aes128::new_from_slice(&key).unwrap();
    let encrypted = hex(
        "874d6191b620e3261bef6864990db6ce9806f66b7970fdff8617187bb9fffdff5ae4df3edbd5d35e5b4f09020db03eab1e031dda2fbe03d1792170a0f3009cee",
    );
    let plain = hex(
        "6bc1bee22e409f96e93d7e117393172aae2d8a571e03ac9c9eb76fac45af8e5130c81c46a35ce411e5fbc1191a0a52eff69f2445df4f9b17ad2b417be66c3710",
    );
    for start in 0..64 {
        for length in [1, 7, 16, 37, 64] {
            let end = (start + length).min(64);
            let mut fragment = encrypted[start..end].to_vec();
            ctr(&mut fragment, &cipher, iv, start as u64).unwrap();
            assert_eq!(fragment, plain[start..end]);
        }
    }
    assert_eq!(ctr(&mut [0; 32], &cipher, [255; 16], 0), Err(INVALID));
    assert_eq!(ctr(&mut [0; 1], &cipher, [255; 16], 16), Err(INVALID));
}

#[test]
fn initializes_supported_tracks_patches_protection_and_preserves_offsets() {
    let key: [u8; 16] = hex("2b7e151628aed2a6abf7158809cf4f3c").try_into().unwrap();
    for encrypted in [false, true] {
        let file = fixture(encrypted, false);
        validate_ftyp(&file).unwrap();
        let end = prefix_end(&file, file.len() as u64).unwrap().unwrap();
        let mut prefix = file[..end].to_vec();
        let index =
            initialize(&mut prefix, 0, file.len() as u64, encrypted.then_some(&key)).unwrap();
        assert_eq!(index.codec, "hevc");
        assert_eq!(prefix.len(), end);
        if encrypted {
            assert_eq!(index.samples.len(), 1);
            assert!(prefix.windows(4).any(|s| s == b"hvc1"));
            assert!(!prefix.windows(4).any(|s| s == b"encv"));
            assert!(!prefix.windows(4).any(|s| s == b"sinf"));
            assert!(!prefix.windows(4).any(|s| s == b"senc"));
            let from = index.samples[0].offset as usize + 3;
            let mut part = file[from..from + 31].to_vec();
            transform(&mut part, from as u64, &index.samples, &key).unwrap();
            assert_eq!(
                part,
                hex(
                    "6bc1bee22e409f96e93d7e117393172aae2d8a571e03ac9c9eb76fac45af8e5130c81c46a35ce411e5fbc1191a0a52eff69f2445df4f9b17ad2b417be66c3710"
                )[3..34]
            );
        } else {
            assert!(index.samples.is_empty());
            assert_eq!(prefix, file[..end]);
        }
    }
}

#[test]
fn vendor_codec_missing_key_and_malformed_sample_tables_never_become_ready() {
    let key = [0; 16];
    for (encrypted, vendor, has_key) in [
        (false, true, false),
        (true, true, true),
        (true, false, false),
        (false, false, true),
    ] {
        let file = fixture(encrypted, vendor);
        let end = prefix_end(&file, file.len() as u64).unwrap().unwrap();
        assert!(matches!(
            initialize(
                &mut file[..end].to_vec(),
                0,
                file.len() as u64,
                has_key.then_some(&key)
            ),
            Err(UNSUPPORTED)
        ));
    }
    let file = fixture(true, false);
    let end = prefix_end(&file, file.len() as u64).unwrap().unwrap();
    for kind in [b"stsc", b"stsz", b"stco", b"senc"] {
        let mut prefix = file[..end].to_vec();
        let at = prefix.windows(4).position(|w| w == kind).unwrap() + 8;
        prefix[at..at + 4].copy_from_slice(&u32::MAX.to_be_bytes());
        assert!(initialize(&mut prefix, 0, file.len() as u64, Some(&key)).is_err());
    }
    for len in 0..32 {
        if let Ok(Some(end)) = prefix_end(&file[..len], file.len() as u64) {
            assert!(end > len); // Header may announce metadata that still needs fetching.
        }
    }
}

#[test]
fn rejects_invalid_boxes_and_requests_full_preparation_for_late_moov() {
    assert_eq!(prefix_end(b"\0\0\0\x04moov", 100), Err(INVALID));
    let mut late = atom(b"ftyp", b"isom\0\0\0\0");
    late.extend_from_slice(&atom(b"mdat", &[0; 32]));
    late.extend_from_slice(&metadata(0, false, false));
    assert_eq!(prefix_end(&late, late.len() as u64).unwrap(), None);
    let mut oversized = atom(b"ftyp", b"isom\0\0\0\0");
    oversized.extend_from_slice(&((INIT_LIMIT as u32) + 1).to_be_bytes());
    oversized.extend_from_slice(b"moov");
    assert_eq!(prefix_end(&oversized, 512 * 1024 * 1024).unwrap(), None);
}
