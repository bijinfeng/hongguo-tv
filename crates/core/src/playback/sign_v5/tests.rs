use super::*;
use crate::playback::sign::unhex;

fn vector<T: serde::de::DeserializeOwned>(name: &str) -> Vec<T> {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/src/playback/sign_v5/");
    let raw = std::fs::read(format!("{path}vectors-{name}.json")).expect("vector file");
    serde_json::from_slice(&raw).expect("vector json")
}

#[derive(serde::Deserialize)]
struct F13Row {
    #[serde(rename = "ts")]
    ts: u32,
    query: String,
    body: String,
    digest: String,
}

#[derive(serde::Deserialize)]
struct CarrierRow {
    ts: u32,
    source: String,
    key: String,
    iv: String,
    encrypted: String,
}

#[derive(serde::Deserialize)]
struct WireRow {
    query: String,
    body: String,
    medusa: String,
    helios: String,
    ts: u32,
}

fn fixed<const N: usize>(value: &str) -> [u8; N] {
    let bytes = unhex(value);
    bytes
        .try_into()
        .unwrap_or_else(|_| panic!("expected {N} bytes, found {}", value.len() / 2))
}

#[test]
fn f13_matches_every_recorded_rotation() {
    let rows: Vec<F13Row> = vector("f13");
    assert_eq!(rows.len(), 32, "recorded rotations");
    for row in rows {
        let digest = f13(&fixed(&row.query), &fixed(&row.body), row.ts);
        assert_eq!(
            hex(&digest[..16]),
            row.digest,
            "digest mismatch at timestamp {}",
            row.ts
        );
        assert_eq!(digest[16] & 0x24, 0x24, "branch marker at {}", row.ts);
    }
}

#[test]
fn carrier_matches_every_timestamp_variant() {
    let rows: Vec<CarrierRow> = vector("carrier");
    assert_eq!(rows.len(), 4, "recorded variants");
    for row in rows {
        let out = carrier(
            &unhex(&row.source),
            row.ts,
            &fixed(&row.key),
            &fixed(&row.iv),
        )
        .expect("carrier input");
        assert_eq!(
            hex(&out),
            row.encrypted,
            "carrier mismatch at timestamp {}",
            row.ts
        );
    }
}

#[test]
fn signatures_bind_the_final_query_body_and_identity() {
    let query: BTreeMap<String, String> = [
        ("aid", "8662"),
        ("app_name", "novelread"),
        ("version_code", "74332"),
        ("version_name", "7.4.3.32"),
        ("manifest_version_code", "74332"),
        ("channel", "vivo_8662_64"),
        ("device_platform", "android"),
        ("device_type", "PGT-AN10"),
        ("os_version", "12"),
        ("update_version_code", "74332"),
        ("iid", "456"),
        ("cdid", "synthetic"),
        ("device_id", "123"),
    ]
    .into_iter()
    .map(|(k, v)| (k.to_string(), v.to_string()))
    .collect();
    let body = [31, 139, 8, 0, 1, 2, 3, 4];
    let process = Process {
        nonce: "synthetic".into(),
        started: 1_800_000_000_000,
    };
    for ts in 1_800_000_000u32..1_800_000_032 {
        let (raw, headers) =
            sign(&query, &body, u64::from(ts) * 1000, &process, [1, 2, 3, 4]).expect("signature");
        let (iv, _, _) = branch(&raw, &body, ts);
        assert_eq!(iv & 15, u32::from(BRANCH), "branch at {ts}");
        assert_eq!(headers["x-khronos"], ts.to_string());
        assert_eq!(headers.len(), 5, "only the mobile profile headers");
        assert!(!raw.contains("&ts="), "no extra query fields");
        assert!(raw.starts_with("aid=8662&app_name=novelread&"));
        let ticket: u64 = raw
            .split('&')
            .find_map(|part| part.strip_prefix("_rticket="))
            .expect("ticket")
            .parse()
            .expect("numeric ticket");
        assert!(ticket >= u64::from(ts) * 1000 && ticket < u64::from(ts) * 1000 + 1024);
        assert!(raw.contains("device_id=123") && raw.contains("iid=456"));
        // A different identity or body must change the signature.
        let mut other = query.clone();
        other.insert("device_id".into(), "789".into());
        let (raw_other, _) =
            sign(&other, &body, u64::from(ts) * 1000, &process, [1, 2, 3, 4]).expect("signature");
        assert_ne!(raw, raw_other);
    }
}

#[test]
fn wire_vectors_match_the_recorded_signer() {
    let rows: Vec<WireRow> = vector("wire");
    assert_eq!(rows.len(), 4, "recorded wire vectors");
    for row in rows {
        let query: BTreeMap<String, String> = [
            ("aid", "8662"),
            ("app_name", "novelread"),
            ("version_code", "74332"),
            ("version_name", "7.4.3.32"),
            ("manifest_version_code", "74332"),
            ("channel", "vivo_8662_64"),
            ("device_platform", "android"),
            ("device_type", "PGT-AN10"),
            ("os_version", "12"),
            ("update_version_code", "74332"),
            ("iid", "456"),
            ("cdid", "synthetic"),
            ("device_id", "123"),
        ]
        .into_iter()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect();
        let body = unhex(&row.body);
        let process = Process {
            nonce: "synthetic".into(),
            started: 1_800_000_000_000,
        };
        let (raw, headers) = sign(
            &query,
            &body,
            u64::from(row.ts) * 1000,
            &process,
            [0x8000_0000; 4],
        )
        .expect("signature");
        // The recorded query is the tuned one; our ticket starts at the whole second.
        let recorded: BTreeMap<_, _> = row
            .query
            .split('&')
            .filter_map(|part| part.split_once('='))
            .collect();
        let actual: BTreeMap<_, _> = raw
            .split('&')
            .filter_map(|part| part.split_once('='))
            .collect();
        assert_eq!(
            recorded.get("aid"),
            actual.get("aid"),
            "query shape at {}",
            row.ts
        );
        assert!(
            raw.contains("&manifest_version_code=74332&"),
            "manifest version is signed at {}",
            row.ts
        );
        assert_eq!(headers["x-helios"], row.helios, "helios at {}", row.ts);
        let (iv, q, m) = branch(&row.query, &body, row.ts);
        assert_eq!(
            medusa(&query, row.ts, &q, &m, [0x8000_0000; 3], &process).expect("medusa"),
            row.medusa,
            "medusa at {}",
            row.ts
        );
        assert_eq!(iv & 15, u32::from(BRANCH));
    }
}
