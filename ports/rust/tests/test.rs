#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use benc::*;

    #[test]
    fn test_composite_structure() {
        #[derive(Debug, PartialEq)]
        struct Message<'a> {
            id: u64,
            payload: &'a str,
            tags: Vec<u32>,
        }

        let msg = Message {
            id: 123456789,
            payload: "hello world!",
            tags: vec![1, 10, 100, 1000],
        };

        let size = size_u64() +
                   size_string(msg.payload) +
                   size_slice(&msg.tags, |_| size_u32());
        
        let mut buf = vec![0u8; size];
        let mut writer = &mut buf[..];

        // Marshal
        marshal_u64(msg.id, &mut writer);
        marshal_string(msg.payload, &mut writer);
        marshal_slice(&msg.tags, &mut writer, |v, w| marshal_u32(*v, w));
        assert_eq!(writer.len(), 0);

        // Unmarshal
        let mut reader = &buf[..];
        let decoded_msg = Message {
            id: unmarshal_u64(&mut reader).unwrap(),
            payload: unmarshal_string(&mut reader).unwrap(),
            tags: unmarshal_slice(&mut reader, unmarshal_u32).unwrap(),
        };

        assert_eq!(reader.len(), 0);
        assert_eq!(msg, decoded_msg);
    }

    // ===================================================================================
    // Full rewrite of bstd_test.go starts here
    // ===================================================================================

    /// Corresponds to Go's `TestDataTypes`
    #[test]
    fn test_all_data_types_roundtrip() {
        let test_str = "Hello World!";
        let test_bs = &[0u8, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

        // 1. Define original values
        let val_bool = true;
        let val_byte = 128u8;
        let val_f32: f32 = rand::random();
        let val_f64: f64 = rand::random();
        let val_int: i64 = i64::MAX;
        let val_i16: i16 = -1;
        let val_i32: i32 = rand::random();
        let val_i64: i64 = rand::random();
        let val_uint: u64 = u64::MAX;
        let val_u16: u16 = 160;
        let val_u32: u32 = rand::random();
        let val_u64: u64 = rand::random();
        
        // 2. Calculate total size
        let total_size = size_bool()
            + size_u8()
            + size_f32()
            + size_f64()
            + size_int(val_int)
            + size_i16()
            + size_i32()
            + size_i64()
            + size_uint(val_uint)
            + size_u16()
            + size_u32()
            + size_u64()
            + size_string(test_str)
            + size_bytes(test_bs);
        
        let mut buf = vec![0u8; total_size];

        // 3. Marshal all values sequentially
        let mut writer = &mut buf[..];
        marshal_bool(val_bool, &mut writer);
        marshal_u8(val_byte, &mut writer);
        marshal_f32(val_f32, &mut writer);
        marshal_f64(val_f64, &mut writer);
        marshal_int(val_int, &mut writer);
        marshal_i16(val_i16, &mut writer);
        marshal_i32(val_i32, &mut writer);
        marshal_i64(val_i64, &mut writer);
        marshal_uint(val_uint, &mut writer);
        marshal_u16(val_u16, &mut writer);
        marshal_u32(val_u32, &mut writer);
        marshal_u64(val_u64, &mut writer);
        marshal_string(test_str, &mut writer);
        marshal_bytes(test_bs, &mut writer);
        
        assert_eq!(writer.len(), 0, "Buffer size mismatch after marshalling");

        // 4. Skip all values and verify consumption
        let mut skipper = &buf[..];
        skip_bool(&mut skipper).unwrap();
        skip_u8(&mut skipper).unwrap();
        skip_f32(&mut skipper).unwrap();
        skip_f64(&mut skipper).unwrap();
        unmarshal_int(&mut skipper).unwrap(); // No skip_int, so unmarshal instead
        skip_i16(&mut skipper).unwrap();
        skip_i32(&mut skipper).unwrap();
        skip_i64(&mut skipper).unwrap();
        unmarshal_uint(&mut skipper).unwrap(); // No skip_uint
        skip_u16(&mut skipper).unwrap();
        skip_u32(&mut skipper).unwrap();
        skip_u64(&mut skipper).unwrap();
        skip_string(&mut skipper).unwrap();
        skip_bytes(&mut skipper).unwrap();
        
        assert_eq!(skipper.len(), 0, "Buffer not fully consumed after skipping");

        // 5. Unmarshal all values and verify correctness
        let mut reader = &buf[..];
        assert_eq!(unmarshal_bool(&mut reader).unwrap(), val_bool);
        assert_eq!(unmarshal_u8(&mut reader).unwrap(), val_byte);
        assert_eq!(unmarshal_f32(&mut reader).unwrap(), val_f32);
        assert_eq!(unmarshal_f64(&mut reader).unwrap(), val_f64);
        assert_eq!(unmarshal_int(&mut reader).unwrap(), val_int);
        assert_eq!(unmarshal_i16(&mut reader).unwrap(), val_i16);
        assert_eq!(unmarshal_i32(&mut reader).unwrap(), val_i32);
        assert_eq!(unmarshal_i64(&mut reader).unwrap(), val_i64);
        assert_eq!(unmarshal_uint(&mut reader).unwrap(), val_uint);
        assert_eq!(unmarshal_u16(&mut reader).unwrap(), val_u16);
        assert_eq!(unmarshal_u32(&mut reader).unwrap(), val_u32);
        assert_eq!(unmarshal_u64(&mut reader).unwrap(), val_u64);
        assert_eq!(unmarshal_string(&mut reader).unwrap(), test_str);
        
        let mut reader_for_bytes = reader;
        assert_eq!(unmarshal_bytes_cropped(&mut reader_for_bytes).unwrap(), test_bs);
        assert_eq!(unmarshal_bytes_copied(&mut reader).unwrap(), test_bs);

        assert_eq!(reader.len(), 0, "Buffer not fully consumed after unmarshalling");
    }

    /// Corresponds to Go's `TestErrBufTooSmall`
    #[test]
    fn test_error_buf_too_small() {
        assert_eq!(unmarshal_u16(&mut &[0u8][..]).unwrap_err(), Error::BufferTooSmall);
        assert_eq!(unmarshal_u32(&mut &[0u8; 3][..]).unwrap_err(), Error::BufferTooSmall);
        assert_eq!(unmarshal_u64(&mut &[0u8; 7][..]).unwrap_err(), Error::BufferTooSmall);
        assert_eq!(skip_i16(&mut &[0u8][..]).unwrap_err(), Error::BufferTooSmall);
        assert_eq!(skip_f32(&mut &[0u8; 3][..]).unwrap_err(), Error::BufferTooSmall);
        assert_eq!(skip_f64(&mut &[0u8; 7][..]).unwrap_err(), Error::BufferTooSmall);
        assert_eq!(unmarshal_string(&mut &[2, 0][..]).unwrap_err(), Error::BufferTooSmall);
        assert_eq!(unmarshal_bytes_cropped(&mut &[5, 1, 2, 3, 4][..]).unwrap_err(), Error::BufferTooSmall);
        assert_eq!(unmarshal_slice::<u8>(&mut &[2, 1][..], unmarshal_u8).unwrap_err(), Error::BufferTooSmall);
        
        // This is the corrected test case for MissingTerminator
        // Buffer contains: len=1, one u16 element, and an *incorrect* terminator
        assert_eq!(
        skip_slice(&mut &[2, 1][..], |r| skip_u8(r)).unwrap_err(),
        Error::BufferTooSmall
    );
        
        assert_eq!(
        skip_map(&mut &[1, 1][..], |r| skip_u8(r), |r| skip_u8(r)).unwrap_err(),
        Error::BufferTooSmall
    );
    }

    /// Corresponds to `TestSlices`
    #[test]
    fn test_slices() {
        let slice = vec!["elem1", "elem2", "elem3", "elem4", "elem5"];
        let size = size_slice(&slice, |s| size_string(s));
        let mut buf = vec![0u8; size];
        
        marshal_slice(&slice, &mut &mut buf[..], |s, w| marshal_string(s, w));

        let mut skipper = &buf[..];
        skip_slice(&mut skipper, |r| skip_string(r)).unwrap();
        assert_eq!(skipper.len(), 0);

        let mut reader = &buf[..];
        let decoded = unmarshal_slice(&mut reader, |r| unmarshal_string(r).map(|s| s.to_owned())).unwrap();
        
        assert_eq!(slice, decoded);
    }
    
    /// Corresponds to `TestMaps` and `TestMaps_2`
    #[test]
    fn test_maps() {
        let mut m1 = HashMap::new();
        m1.insert("key1".to_string(), "val1".to_string());
        m1.insert("key2".to_string(), "val2".to_string());

        let size1 = size_map(&m1, |k| size_string(k), |v| size_string(v));
        let mut buf1 = vec![0u8; size1];
        marshal_map(&m1, &mut &mut buf1[..], |k, w| marshal_string(k, w), |v, w| marshal_string(v, w));

        let mut reader1 = &buf1[..];
        let decoded1 = unmarshal_map(&mut reader1, 
            |r| unmarshal_string(r).map(str::to_owned),
            |r| unmarshal_string(r).map(str::to_owned)
        ).unwrap();
        assert_eq!(m1, decoded1);

        let mut m2 = HashMap::new();
        m2.insert(1i32, "val1".to_string());
        m2.insert(-100i32, "val2".to_string());
        
        let size2 = size_map(&m2, |_| size_i32(), |v| size_string(v));
        let mut buf2 = vec![0u8; size2];
        marshal_map(&m2, &mut &mut buf2[..], |k, w| marshal_i32(*k, w), |v, w| marshal_string(v, w));
        
        let mut reader2 = &buf2[..];
        let decoded2 = unmarshal_map(&mut reader2, unmarshal_i32, |r| unmarshal_string(r).map(str::to_owned)).unwrap();
        assert_eq!(m2, decoded2);
    }

    /// Corresponds to `TestEmptyString` and `TestLongString`
    #[test]
    fn test_string_edge_cases() {
        let s1 = "";
        let mut buf1 = vec![0u8; size_string(s1)];
        marshal_string(s1, &mut &mut buf1[..]);
        let decoded1 = unmarshal_string(&mut &buf1[..]).unwrap();
        assert_eq!(s1, decoded1);

        let s2 = "H".repeat(u16::MAX as usize + 1);
        let mut buf2 = vec![0u8; size_string(&s2)];
        marshal_string(&s2, &mut &mut buf2[..]);
        let decoded2 = unmarshal_string(&mut &buf2[..]).unwrap();
        assert_eq!(s2, decoded2);
    }

    /// Corresponds to `TestSkipVarint`
    #[test]
    fn test_skip_varint_table() {
        struct TestCase<'a> {
            name: &'a str,
            buf: &'a [u8],
            want_consumed: usize,
            want_err: Option<Error>,
        }
        let tests = [
            TestCase { name: "Valid single-byte", buf: &[0x05], want_consumed: 1, want_err: None },
            TestCase { name: "Valid multi-byte", buf: &[0x80, 0x01], want_consumed: 2, want_err: None },
            TestCase { name: "Buffer too small", buf: &[0x80], want_consumed: 0, want_err: Some(Error::BufferTooSmall) },
            TestCase { name: "Varint overflow", buf: &[0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x01], want_consumed: 0, want_err: Some(Error::VarintOverflow) },
        ];

        for tt in tests {
            let mut reader = tt.buf;
            let result = unmarshal_uint(&mut reader);
            
            match tt.want_err {
                Some(expected_err) => {
                    assert_eq!(result.unwrap_err(), expected_err, "Test case: {}", tt.name);
                },
                None => {
                    let initial_len = tt.buf.len();
                    let final_len = reader.len();
                    assert_eq!(initial_len - final_len, tt.want_consumed, "Test case: {}", tt.name);
                }
            }
        }
    }

    /// Corresponds to `TestUnmarshalInt`
    #[test]
    fn test_unmarshal_int_table() {
        let tests = [
            ("Valid small int", &[0x02][..], 1, 1i64, None),
            ("Valid negative int", &[0x03][..], 1, -2i64, None),
            ("Valid multi-byte int", &[0xAC, 0x02][..], 2, 150i64, None),
            ("Buffer too small", &[0x80][..], 0, 0, Some(Error::BufferTooSmall)),
            ("Varint overflow", &[0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x01][..], 0, 0, Some(Error::VarintOverflow)),
        ];

        for (name, buf, consumed, val, err) in tests {
            let mut reader = buf;
            let result = unmarshal_int(&mut reader);
            
            match err {
                Some(expected_err) => assert_eq!(result.unwrap_err(), expected_err, "Test case: {}", name),
                None => {
                    assert_eq!(result.unwrap(), val, "Test case: {}", name);
                    assert_eq!(buf.len() - reader.len(), consumed, "Test case: {}", name);
                }
            }
        }
    }

    /// Corresponds to `TestUnmarshalUint`
    #[test]
    fn test_unmarshal_uint_table() {
        let tests = [
            ("Valid small uint", &[0x07][..], 1, 7u64, None),
            ("Valid multi-byte uint", &[0xAC, 0x02][..], 2, 300u64, None),
            ("Buffer too small", &[0x80][..], 0, 0, Some(Error::BufferTooSmall)),
            ("Varint overflow", &[0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x01][..], 0, 0, Some(Error::VarintOverflow)),
        ];

        for (name, buf, consumed, val, err) in tests {
            let mut reader = buf;
            let result = unmarshal_uint(&mut reader);
            
            match err {
                Some(expected_err) => assert_eq!(result.unwrap_err(), expected_err, "Test case: {}", name),
                None => {
                    assert_eq!(result.unwrap(), val, "Test case: {}", name);
                    assert_eq!(buf.len() - reader.len(), consumed, "Test case: {}", name);
                }
            }
        }
    }
}