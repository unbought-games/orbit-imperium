use num_bigint::BigUint;
use orbit_engine::*;
use uuid::Uuid;
#[test]
fn published_stream_vectors_and_resume() {
    let secret = std::array::from_fn(|i| i as u8);
    let mut r = RandomStream::new(
        &secret,
        UniverseId(Uuid::from_u128(1)),
        Epoch(Uuid::from_u128(2)),
        InputId(Uuid::from_u128(3)),
        "battle",
    )
    .unwrap();
    assert_eq!(
        r.uniform(&BigUint::from(120000000u32)).unwrap(),
        BigUint::from(64716373u32)
    );
    assert_eq!(
        r.uniform(&BigUint::from(10u32)).unwrap(),
        BigUint::from(3u32)
    );
    assert_eq!(r.cursor(), (0, 5));
    let restored: RandomStream = serde_json::from_str(&serde_json::to_string(&r).unwrap()).unwrap();
    assert_eq!(r, restored);
    r.restore_cursor(0, 31).unwrap();
    assert_eq!(r.read_byte().unwrap(), 0xd8);
    assert_eq!(r.read_byte().unwrap(), 0x8b);
    assert_eq!(r.cursor(), (1, 1));
}
#[test]
fn sampler_byte_width_rejection_and_full_256_bit_limit() {
    use num_traits::One;
    let secret = std::array::from_fn(|i| i as u8);
    let stream = || {
        RandomStream::new(
            &secret,
            UniverseId(Uuid::from_u128(1)),
            Epoch(Uuid::from_u128(2)),
            InputId(Uuid::from_u128(3)),
            "battle",
        )
        .unwrap()
    };
    let mut r = stream();
    assert_eq!(r.uniform_u64(129).unwrap(), 85);
    assert_eq!(r.cursor(), (0, 4));
    let mut r = stream();
    assert_eq!(r.uniform_u64(256).unwrap(), 189);
    assert_eq!(r.cursor(), (0, 1));
    let mut r = stream();
    assert_eq!(r.uniform_u64(257).unwrap(), 21);
    assert_eq!(r.cursor(), (0, 2));
    let mut r = stream();
    let n = (BigUint::one() << 256usize) - BigUint::one();
    assert_eq!(
        r.uniform(&n).unwrap(),
        BigUint::parse_bytes(
            b"bdd2ea557b6fe27b7a2b59bf3bc5bb1510f94468f0f1b8c83d5f152f4eabd0d8",
            16
        )
        .unwrap()
    );
    assert_eq!(r.cursor(), (1, 0));
}
