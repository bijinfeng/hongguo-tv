//! Bounded MP4 metadata and whole-sample CENC CTR, preserving physical byte offsets.
use crate::playback::PlaybackError;
use aes::cipher::{Array, BlockCipherEncrypt, KeyInit};

const INVALID: PlaybackError = PlaybackError::InvalidMedia;
const UNSUPPORTED: PlaybackError = PlaybackError::UnsupportedMedia;
pub(super) const INIT_LIMIT: usize = 16 * 1024 * 1024;
const SAMPLE_LIMIT: usize = 1_000_000;

#[derive(Clone, Copy)]
struct Atom {
    start: usize,
    payload: usize,
    end: usize,
    kind: [u8; 4],
}
#[derive(Clone)]
pub(super) struct Sample {
    pub offset: u64,
    pub size: u32,
    iv: [u8; 16],
}
pub(super) struct Index {
    pub samples: Vec<Sample>,
    pub codec: &'static str,
}

fn u32_at(data: &[u8], at: usize) -> Result<u32, PlaybackError> {
    Ok(u32::from_be_bytes(
        data.get(at..at + 4)
            .ok_or(INVALID)?
            .try_into()
            .map_err(|_| INVALID)?,
    ))
}
fn u64_at(data: &[u8], at: usize) -> Result<u64, PlaybackError> {
    Ok(u64::from_be_bytes(
        data.get(at..at + 8)
            .ok_or(INVALID)?
            .try_into()
            .map_err(|_| INVALID)?,
    ))
}
fn atoms(data: &[u8], start: usize, end: usize) -> Result<Vec<Atom>, PlaybackError> {
    if start > end || end > data.len() {
        return Err(INVALID);
    }
    let mut output = Vec::new();
    let mut at = start;
    while at < end {
        if end - at < 8 {
            return Err(INVALID);
        }
        let size = u32_at(data, at)?;
        let (header, size) = match size {
            0 => (8, end - at),
            1 => (
                16,
                usize::try_from(u64_at(data, at + 8)?).map_err(|_| INVALID)?,
            ),
            n => (8, n as usize),
        };
        if size < header || size > end - at {
            return Err(INVALID);
        }
        if output.len() >= SAMPLE_LIMIT {
            return Err(INVALID);
        }
        output.push(Atom {
            start: at,
            payload: at + header,
            end: at + size,
            kind: data[at + 4..at + 8].try_into().map_err(|_| INVALID)?,
        });
        at += size;
    }
    Ok(output)
}
fn child(data: &[u8], parent: Atom, kind: &[u8; 4]) -> Result<Option<Atom>, PlaybackError> {
    Ok(atoms(data, parent.payload, parent.end)?
        .into_iter()
        .find(|a| &a.kind == kind))
}
fn path(data: &[u8], mut parent: Atom, kinds: &[[u8; 4]]) -> Result<Option<Atom>, PlaybackError> {
    for kind in kinds {
        let Some(next) = child(data, parent, kind)? else {
            return Ok(None);
        };
        parent = next;
    }
    Ok(Some(parent))
}

/// Returns the known initialization end, or None for an unsupported layout needing full preparation.
pub(super) fn prefix_end(data: &[u8], length: u64) -> Result<Option<usize>, PlaybackError> {
    let mut at = 0usize;
    while data.len().saturating_sub(at) >= 8 {
        let size = u32_at(data, at)?;
        let (header, size) = match size {
            0 => (8, length.checked_sub(at as u64).ok_or(INVALID)?),
            1 => {
                if data.len() - at < 16 {
                    return Ok(None);
                }
                (16, u64_at(data, at + 8)?)
            }
            n => (8, u64::from(n)),
        };
        if size < header || size > length.saturating_sub(at as u64) {
            return Err(INVALID);
        }
        let end = (at as u64).checked_add(size).ok_or(INVALID)?;
        if &data[at + 4..at + 8] == b"moov" {
            if end > INIT_LIMIT as u64 {
                return Ok(None);
            }
            return Ok(Some(end as usize));
        }
        if &data[at + 4..at + 8] == b"mdat" {
            return Ok(None);
        }
        if end > data.len() as u64 {
            return Ok(None);
        }
        at = end as usize;
    }
    Ok(None)
}

pub(super) fn validate_ftyp(data: &[u8]) -> Result<(), PlaybackError> {
    if data.len() < 16 || &data[4..8] != b"ftyp" || u32_at(data, 0)? < 16 {
        return Err(INVALID);
    }
    Ok(())
}

/// Validate and patch a moov (possibly inside a fast-start prefix); never infer vendor HEVC.
pub(super) fn initialize(
    data: &mut [u8],
    base: u64,
    length: u64,
    key: Option<&[u8; 16]>,
) -> Result<Index, PlaybackError> {
    if data.len() > INIT_LIMIT {
        return Err(INVALID);
    }
    let moov = atoms(data, 0, data.len())?
        .into_iter()
        .find(|a| a.kind == *b"moov")
        .ok_or(INVALID)?;
    let tracks = atoms(data, moov.payload, moov.end)?;
    let mut samples = Vec::new();
    let mut track_count = 0;
    let mut protected_count = 0;
    let mut codec = None;
    for track in tracks.into_iter().filter(|a| a.kind == *b"trak") {
        let Some(stbl) = path(data, track, &[*b"mdia", *b"minf", *b"stbl"])? else {
            continue;
        };
        track_count += 1;
        let senc = child(data, stbl, b"senc")?;
        let (protected, track_codec) = sample_entries(data, stbl, key.is_some())?;
        if let Some(track_codec) = track_codec {
            if codec.is_some_and(|previous| previous != track_codec) {
                return Err(UNSUPPORTED);
            }
            codec = Some(track_codec);
        }
        if protected != senc.is_some() {
            return Err(UNSUPPORTED);
        }
        let mut indexed = track_samples(data, stbl, senc, length)?;
        let meta_start = base.checked_add(moov.start as u64).ok_or(INVALID)?;
        let meta_end = base.checked_add(moov.end as u64).ok_or(INVALID)?;
        if indexed
            .iter()
            .any(|s| s.offset < meta_end && s.offset + u64::from(s.size) > meta_start)
        {
            return Err(INVALID);
        }
        if let Some(senc) = senc {
            if key.is_none() {
                return Err(UNSUPPORTED);
            }
            if indexed.len() > SAMPLE_LIMIT - samples.len() {
                return Err(INVALID);
            }
            samples.append(&mut indexed);
            neutralize(data, senc);
            protected_count += 1;
        }
    }
    if track_count == 0 || key.is_some() && protected_count == 0 {
        return Err(UNSUPPORTED);
    }
    samples.sort_by_key(|s| s.offset);
    if samples
        .windows(2)
        .any(|p| p[0].offset + u64::from(p[0].size) > p[1].offset)
    {
        return Err(INVALID);
    }
    Ok(Index {
        samples,
        codec: codec.ok_or(UNSUPPORTED)?,
    })
}

fn neutralize(data: &mut [u8], atom: Atom) {
    data[atom.start + 4..atom.start + 8].copy_from_slice(b"free");
    data[atom.payload..atom.end].fill(0);
}
fn sample_entries(
    data: &mut [u8],
    stbl: Atom,
    has_key: bool,
) -> Result<(bool, Option<&'static str>), PlaybackError> {
    let stsd = child(data, stbl, b"stsd")?.ok_or(INVALID)?;
    if stsd.end - stsd.payload < 8 {
        return Err(INVALID);
    }
    let count = u32_at(data, stsd.payload + 4)? as usize;
    let entries = atoms(data, stsd.payload + 8, stsd.end)?;
    if count != entries.len() || count == 0 || count > 16 {
        return Err(INVALID);
    }
    let mut protected = false;
    let mut video_codec = None;
    for entry in entries {
        let encrypted = matches!(&entry.kind, b"encv" | b"enca");
        let header = match &entry.kind {
            b"avc1" | b"hvc1" | b"hev1" | b"encv" => 78,
            b"mp4a" | b"enca" => 28,
            _ => return Err(UNSUPPORTED),
        };
        if entry.end - entry.payload < header {
            return Err(INVALID);
        }
        let children = atoms(data, entry.payload + header, entry.end)?;
        if children.iter().any(|a| a.kind == *b"bv2C") {
            return Err(UNSUPPORTED);
        }
        let mut format = entry.kind;
        if encrypted {
            if !has_key {
                return Err(UNSUPPORTED);
            }
            let sinf = children
                .iter()
                .copied()
                .find(|a| a.kind == *b"sinf")
                .ok_or(UNSUPPORTED)?;
            let frma = child(data, sinf, b"frma")?.ok_or(UNSUPPORTED)?;
            let codec = data.get(frma.payload..frma.payload + 4).ok_or(INVALID)?;
            if !matches!(codec, b"avc1" | b"hvc1" | b"hev1" | b"mp4a") {
                return Err(UNSUPPORTED);
            }
            let codec: [u8; 4] = codec.try_into().map_err(|_| INVALID)?;
            format = codec;
            let schm = child(data, sinf, b"schm")?.ok_or(UNSUPPORTED)?;
            if data.get(schm.payload + 4..schm.payload + 8) != Some(b"cenc".as_slice()) {
                return Err(UNSUPPORTED);
            }
            data[entry.start + 4..entry.start + 8].copy_from_slice(&codec);
            neutralize(data, sinf);
            protected = true;
        }
        let selected = match &format {
            b"avc1" => Some(("h264", *b"avcC", 7)),
            b"hvc1" | b"hev1" => Some(("hevc", *b"hvcC", 23)),
            _ => None,
        };
        if let Some((codec, configuration, minimum)) = selected {
            if !children
                .iter()
                .any(|a| a.kind == configuration && a.end - a.payload >= minimum)
            {
                return Err(INVALID);
            }
            if video_codec.is_some_and(|previous| previous != codec) {
                return Err(UNSUPPORTED);
            }
            video_codec = Some(codec);
        }
    }
    Ok((protected, video_codec))
}

fn table(data: &[u8], atom: Atom, width: usize) -> Result<(usize, usize), PlaybackError> {
    if atom.end - atom.payload < 8 {
        return Err(INVALID);
    }
    let count = u32_at(data, atom.payload + 4)? as usize;
    let at = atom.payload + 8;
    if count > SAMPLE_LIMIT || count.checked_mul(width) != Some(atom.end - at) {
        return Err(INVALID);
    }
    Ok((at, count))
}
fn track_samples(
    data: &[u8],
    stbl: Atom,
    senc: Option<Atom>,
    length: u64,
) -> Result<Vec<Sample>, PlaybackError> {
    let stsc = child(data, stbl, b"stsc")?.ok_or(INVALID)?;
    let stsz = child(data, stbl, b"stsz")?.ok_or(INVALID)?;
    let offsets = child(data, stbl, b"stco")?
        .or(child(data, stbl, b"co64")?)
        .ok_or(INVALID)?;
    let (at, count) = table(data, stsc, 12)?;
    if count == 0 {
        return Err(INVALID);
    }
    let mut mapping = Vec::with_capacity(count);
    for i in 0..count {
        let p = at + i * 12;
        let first = u32_at(data, p)?;
        let per = u32_at(data, p + 4)?;
        if first == 0
            || per == 0
            || u32_at(data, p + 8)? != 1
            || mapping
                .last()
                .is_some_and(|(previous, _)| *previous >= first)
        {
            return Err(INVALID);
        }
        mapping.push((first, per));
    }
    if mapping[0].0 != 1 {
        return Err(INVALID);
    }
    if stsz.end - stsz.payload < 12 {
        return Err(INVALID);
    }
    let constant = u32_at(data, stsz.payload + 4)?;
    let count = u32_at(data, stsz.payload + 8)? as usize;
    if count == 0
        || count > SAMPLE_LIMIT
        || if constant == 0 {
            count.checked_mul(4) != Some(stsz.end - stsz.payload - 12)
        } else {
            stsz.end - stsz.payload != 12
        }
    {
        return Err(INVALID);
    }
    let mut sizes = Vec::with_capacity(count);
    for i in 0..count {
        let size = if constant == 0 {
            u32_at(data, stsz.payload + 12 + i * 4)?
        } else {
            constant
        };
        if size == 0 {
            return Err(INVALID);
        }
        sizes.push(size);
    }
    let width = if offsets.kind == *b"co64" { 8 } else { 4 };
    let (at, chunks) = table(data, offsets, width)?;
    if chunks == 0
        || mapping
            .last()
            .is_some_and(|(first, _)| *first as usize > chunks)
    {
        return Err(INVALID);
    }
    let iv_size = if let Some(senc) = senc {
        if senc.end - senc.payload < 8
            || u32_at(data, senc.payload)? != 0
            || u32_at(data, senc.payload + 4)? as usize != count
        {
            return Err(UNSUPPORTED);
        }
        let remaining = senc.end - senc.payload - 8;
        if remaining == count * 8 {
            8
        } else if remaining == count * 16 {
            16
        } else {
            return Err(INVALID);
        }
    } else {
        0
    };
    let mut samples = Vec::with_capacity(count);
    let mut mapping_index = 0;
    for chunk in 0..chunks {
        while mapping_index + 1 < mapping.len()
            && mapping[mapping_index + 1].0 as usize <= chunk + 1
        {
            mapping_index += 1;
        }
        let mut position = if width == 8 {
            u64_at(data, at + chunk * 8)?
        } else {
            u64::from(u32_at(data, at + chunk * 4)?)
        };
        for _ in 0..mapping[mapping_index].1 {
            let index = samples.len();
            let size = *sizes.get(index).ok_or(INVALID)?;
            if position > length || u64::from(size) > length - position {
                return Err(INVALID);
            }
            let mut iv = [0; 16];
            if let Some(senc) = senc {
                let from = senc.payload + 8 + index * iv_size;
                iv[..iv_size].copy_from_slice(&data[from..from + iv_size]);
            }
            samples.push(Sample {
                offset: position,
                size,
                iv,
            });
            position += u64::from(size);
        }
    }
    samples.sort_by_key(|s| s.offset);
    if samples
        .windows(2)
        .any(|p| p[0].offset + u64::from(p[0].size) > p[1].offset)
    {
        return Err(INVALID);
    }
    if samples.len() != count {
        return Err(INVALID);
    }
    Ok(samples)
}

pub(super) fn transform(
    data: &mut [u8],
    start: u64,
    samples: &[Sample],
    key: &[u8; 16],
) -> Result<(), PlaybackError> {
    let end = start.checked_add(data.len() as u64).ok_or(INVALID)?;
    let cipher = aes::Aes128::new_from_slice(key).map_err(|_| INVALID)?;
    let first = samples.partition_point(|s| s.offset + u64::from(s.size) <= start);
    for sample in &samples[first..] {
        if sample.offset >= end {
            break;
        }
        let from = start.max(sample.offset);
        let to = end.min(sample.offset + u64::from(sample.size));
        ctr(
            &mut data[(from - start) as usize..(to - start) as usize],
            &cipher,
            sample.iv,
            from - sample.offset,
        )?;
    }
    Ok(())
}
fn ctr(
    data: &mut [u8],
    cipher: &aes::Aes128,
    iv: [u8; 16],
    offset: u64,
) -> Result<(), PlaybackError> {
    let mut counter = u128::from_be_bytes(iv)
        .checked_add(u128::from(offset / 16))
        .ok_or(INVALID)?;
    let mut skip = (offset % 16) as usize;
    let mut written = 0;
    while written < data.len() {
        let mut block = Array::from(counter.to_be_bytes());
        cipher.encrypt_block(&mut block);
        let count = (16 - skip).min(data.len() - written);
        for i in 0..count {
            data[written + i] ^= block[skip + i];
        }
        written += count;
        skip = 0;
        if written < data.len() {
            counter = counter.checked_add(1).ok_or(INVALID)?;
        }
    }
    Ok(())
}

#[cfg(test)]
pub(super) mod tests;
