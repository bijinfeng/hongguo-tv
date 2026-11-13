#![no_main]
use libfuzzer_sys::fuzz_target;

fuzz_target!(|input: (String, u64)| {
    if let Ok(range) = hongguo_core::media::ByteRange::parse(&input.0, input.1) {
        assert!(range.start() <= range.end());
        assert!(range.end() < input.1);
    }
});
