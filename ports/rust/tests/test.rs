#[cfg(test)]
mod tests {
    use super::*;
    use rand::Rng;
    use benc::*;

    // To run these tests, you'll need to add the following to your Cargo.toml:
    // [dev-dependencies]
    // rand = "0.8"

    fn verify_skip(mut bytes: &[u8], skipper: impl Fn(&mut &[u8]) -> Result<()>) {
        skipper(&mut bytes).unwrap();
        assert!(bytes.is_empty(), "skip did not consume the whole buffer");
    }

    #[test]
    fn test_data_types() {
        let mut rng = rand::thread_rng();

        let val_bool = true;
        let val_byte = 128u8;
        let val_f32: f32 = rng.gen();
        let val_f64: f64 = rng.gen();
        let val_isize_pos: isize = isize::MAX;
        let val_isize_neg: isize = -12345;
        let val_i8: i8 = -1;
        let val_i16: i16 = -1;
        let val_i32: i32 = rng.gen();
        let val_i64: i64 = rng.gen();
        let val_usize: usize = usize::MAX;
        let val_u16: u16 = 160;
        let val_u32: u32 = rng.gen();
        let val_u64: u64 = rng.gen();
        let val_str = "Hello World!";
        let val_bs: &[u8] = &[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

        let total_size = size_bool()
            + size_u8()
            + size_f32()
            + size_f64()
            + size_isize(val_isize_pos)
            + size_isize(val_isize_neg)
            + size_i8()
            + size_i16()
            + size_i32()
            + size_i64()
            + size_usize(val_usize)
            + size_u16()
            + size_u32()
            + size_u64()
            + size_string(val_str)
            + size_bytes(val_bs)
            + size_bytes(val_bs);

        let mut buf = vec![0u8; total_size];
        let mut writer = buf.as_mut_slice();

        marshal_bool(val_bool, &mut writer).unwrap();
        marshal_u8(val_byte, &mut writer).unwrap();
        marshal_f32(val_f32, &mut writer).unwrap();
        marshal_f64(val_f64, &mut writer).unwrap();
        marshal_isize(val_isize_pos, &mut writer).unwrap();
        marshal_isize(val_isize_neg, &mut writer).unwrap();
        marshal_i8(val_i8, &mut writer).unwrap();
        marshal_i16(val_i16, &mut writer).unwrap();
        marshal_i32(val_i32, &mut writer).unwrap();
        marshal_i64(val_i64, &mut writer).unwrap();
        marshal_usize(val_usize, &mut writer).unwrap();
        marshal_u16(val_u16, &mut writer).unwrap();
        marshal_u32(val_u32, &mut writer).unwrap();
        marshal_u64(val_u64, &mut writer).unwrap();
        marshal_string(val_str, &mut writer).unwrap();
        marshal_bytes(val_bs, &mut writer).unwrap();
        marshal_bytes(val_bs, &mut writer).unwrap();

        assert!(writer.is_empty(), "marshal did not fill the buffer");
        
        // Test Skip
        let mut skipper_buf = buf.as_slice();
        skip_bool(&mut skipper_buf).unwrap();
        skip_u8(&mut skipper_buf).unwrap();
        skip_f32(&mut skipper_buf).unwrap();
        skip_f64(&mut skipper_buf).unwrap();
        skip_isize(&mut skipper_buf).unwrap();
        skip_isize(&mut skipper_buf).unwrap();
        skip_i8(&mut skipper_buf).unwrap();
        skip_i16(&mut skipper_buf).unwrap();
        skip_i32(&mut skipper_buf).unwrap();
        skip_i64(&mut skipper_buf).unwrap();
        skip_usize(&mut skipper_buf).unwrap();
        skip_u16(&mut skipper_buf).unwrap();
        skip_u32(&mut skipper_buf).unwrap();
        skip_u64(&mut skipper_buf).unwrap();
        skip_string(&mut skipper_buf).unwrap();
        skip_bytes(&mut skipper_buf).unwrap();
        skip_bytes(&mut skipper_buf).unwrap();
        assert!(skipper_buf.is_empty(), "skip did not consume the buffer");

        // Test Unmarshal
        let mut reader = buf.as_slice();
        assert_eq!(unmarshal_bool(&mut reader).unwrap(), val_bool);
        assert_eq!(unmarshal_u8(&mut reader).unwrap(), val_byte);
        assert_eq!(unmarshal_f32(&mut reader).unwrap(), val_f32);
        assert_eq!(unmarshal_f64(&mut reader).unwrap(), val_f64);
        assert_eq!(unmarshal_isize(&mut reader).unwrap(), val_isize_pos);
        assert_eq!(unmarshal_isize(&mut reader).unwrap(), val_isize_neg);
        assert_eq!(unmarshal_i8(&mut reader).unwrap(), val_i8);
        assert_eq!(unmarshal_i16(&mut reader).unwrap(), val_i16);
        assert_eq!(unmarshal_i32(&mut reader).unwrap(), val_i32);
        assert_eq!(unmarshal_i64(&mut reader).unwrap(), val_i64);
        assert_eq!(unmarshal_usize(&mut reader).unwrap(), val_usize);
        assert_eq!(unmarshal_u16(&mut reader).unwrap(), val_u16);
        assert_eq!(unmarshal_u32(&mut reader).unwrap(), val_u32);
        assert_eq!(unmarshal_u64(&mut reader).unwrap(), val_u64);
        assert_eq!(unmarshal_string(&mut reader).unwrap(), val_str);
        assert_eq!(unmarshal_bytes_cropped(&mut reader).unwrap(), val_bs);
        // We need a new reader for the last one to test copied
        let remaining_len = reader.len();
        let mut final_reader = buf.as_slice();
        final_reader = &final_reader[total_size - remaining_len..];
        assert_eq!(unmarshal_bytes_copied(&mut final_reader).unwrap(), val_bs.to_vec());
        
        assert!(reader.len() > 0, "final unmarshal should not have been called on original reader");
        assert!(final_reader.is_empty(), "unmarshal did not consume the buffer");
    }

    #[test]
    fn test_err_buf_too_small() {
        assert_eq!(unmarshal_bool(&mut &[][..]).err(), Some(Error::BufferTooSmall));
        assert_eq!(unmarshal_u8(&mut &[][..]).err(), Some(Error::BufferTooSmall));
        assert_eq!(unmarshal_f32(&mut &[1,2,3][..]).err(), Some(Error::BufferTooSmall));
        assert_eq!(unmarshal_f64(&mut &[1,2,3,4,5,6,7][..]).err(), Some(Error::BufferTooSmall));
        assert_eq!(unmarshal_string(&mut &[2,0][..]).err(), Some(Error::BufferTooSmall));
        assert_eq!(unmarshal_bytes_cropped(&mut &[4,1,2,3][..]).err(), Some(Error::BufferTooSmall));
        let mut slice_buf = &[10, 0, 0, 0, 1][..];
        assert_eq!(unmarshal_slice(&mut slice_buf, unmarshal_u8).err(), Some(Error::BufferTooSmall));
        let mut map_buf = &[10, 0, 0, 0, 1][..];
        assert_eq!(unmarshal_map(&mut map_buf, unmarshal_u8, unmarshal_u8).err(), Some(Error::BufferTooSmall));
    }

    #[test]
    fn test_slices() {
        let slice = vec!["sliceelement1", "sliceelement2", "sliceelement3"];
        let size = size_slice(&slice, |s| size_string(s));
        let mut buf = vec![0; size];
        marshal_slice(&slice, &mut buf.as_mut_slice(), |s, w| marshal_string(s, w)).unwrap();

        verify_skip(&buf, |r| skip_slice(r, skip_string));

        let mut reader = buf.as_slice();
        let ret_slice = unmarshal_slice(&mut reader, unmarshal_string).unwrap();
        assert_eq!(ret_slice, slice);
        assert!(reader.is_empty());
    }
    
    #[test]
    fn test_maps() {
        let mut map = HashMap::new();
        map.insert("mapkey1".to_string(), "mapvalue1".to_string());
        map.insert("mapkey2".to_string(), "mapvalue2".to_string());
        map.insert("mapkey3".to_string(), "mapvalue3".to_string());
        
        let size = size_map(&map, |k| size_string(k), |v| size_string(v));
        let mut buf = vec![0; size];
        marshal_map(&map, &mut buf.as_mut_slice(), |k, w| marshal_string(k, w), |v, w| marshal_string(v, w)).unwrap();
        
        verify_skip(&buf, |r| skip_map(r, skip_string, skip_string));

        let mut reader = buf.as_slice();
        let ret_map = unmarshal_map(&mut reader, unmarshal_string, unmarshal_string).unwrap();
        assert_eq!(ret_map, map);
        assert!(reader.is_empty());
    }

    #[test]
    fn test_string_edge_cases() {
        // Empty string
        let s = "";
        let size = size_string(s);
        let mut buf = vec![0; size];
        marshal_string(s, &mut buf.as_mut_slice()).unwrap();
        verify_skip(&buf, skip_string);
        let mut reader = buf.as_slice();
        assert_eq!(unmarshal_string(&mut reader).unwrap(), s);
        assert!(reader.is_empty());

        // Long string
        let long_s = "H".repeat(u16::MAX as usize + 1);
        let size = size_string(&long_s);
        let mut buf = vec![0; size];
        marshal_string(&long_s, &mut buf.as_mut_slice()).unwrap();
        verify_skip(&buf, skip_string);
        let mut reader = buf.as_slice();
        assert_eq!(unmarshal_string(&mut reader).unwrap(), long_s);
        assert!(reader.is_empty());
    }

    #[test]
    fn test_varint_errors() {
        let overflow_buf = [0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x02];
        assert_eq!(skip_uint(&mut &overflow_buf[..]).err(), Some(Error::VarintOverflow));
        assert_eq!(unmarshal_uint(&mut &overflow_buf[..]).err(), Some(Error::VarintOverflow));

        let too_small_buf = [0x80];
        assert_eq!(skip_uint(&mut &too_small_buf[..]).err(), Some(Error::BufferTooSmall));
        assert_eq!(unmarshal_uint(&mut &too_small_buf[..]).err(), Some(Error::BufferTooSmall));
    }
    
    #[test]
    fn test_time() {
        let now = DateTime::from_timestamp_nanos(1663362895123456789);
        let size = size_time();
        let mut buf = vec![0; size];
        marshal_time(now, &mut buf.as_mut_slice()).unwrap();
        
        verify_skip(&buf, skip_time);

        let mut reader = buf.as_slice();
        let ret_time = unmarshal_time(&mut reader).unwrap();
        assert_eq!(ret_time, now);
        assert!(reader.is_empty());
    }

    #[test]
    fn test_option_pointer() {
        // Non-nil pointer
        let val = "hello world".to_string();
        let some_val = Some(val.clone());
        let size = size_option(&some_val, |s| size_string(s));
        let mut buf = vec![0; size];
        marshal_option(&some_val, &mut buf.as_mut_slice(), |v, w| marshal_string(v, w)).unwrap();

        verify_skip(&buf, |r| skip_option(r, skip_string));
        
        let mut reader = buf.as_slice();
        let ret_opt = unmarshal_option(&mut reader, unmarshal_string).unwrap().map(|s| s.to_string());
        assert_eq!(ret_opt, Some(val));
        assert!(reader.is_empty());
        
        // Nil pointer
        let none_val: Option<String> = None;
        let size = size_option(&none_val, |s| size_string(s));
        let mut buf = vec![0; size];
        marshal_option(&none_val, &mut buf.as_mut_slice(), |v, w| marshal_string(v, w)).unwrap();

        verify_skip(&buf, |r| skip_option(r, skip_string));

        let mut reader = buf.as_slice();
        let ret_opt: Option<String> = unmarshal_option(&mut reader, |_| unreachable!()).unwrap();
        assert_eq!(ret_opt, None);
        assert!(reader.is_empty());
    }

    #[test]
    fn test_terminator_errors() {
        // Slice
        let slice = vec!["a"];
        let size = size_slice(&slice, |s| size_string(s));
        let mut buf = vec![0; size];
        marshal_slice(&slice, &mut buf.as_mut_slice(), |s, w| marshal_string(s, w)).unwrap();
        let truncated_buf = &buf[..size - 1];
        assert_eq!(skip_slice(&mut truncated_buf.clone(), skip_string).err(), Some(Error::BufferTooSmall));
        assert_eq!(unmarshal_slice(&mut truncated_buf.clone(), unmarshal_string).err(), Some(Error::BufferTooSmall));

        // Map
        let mut map = HashMap::new();
        map.insert("a".to_string(), "b".to_string());
        let size = size_map(&map, |k| size_string(k), |v| size_string(v));
        let mut buf = vec![0; size];
        marshal_map(&map, &mut buf.as_mut_slice(), |k, w| marshal_string(k, w), |v, w| marshal_string(v, w)).unwrap();
        let truncated_buf = &buf[..size - 1];
        assert_eq!(skip_map(&mut truncated_buf.clone(), skip_string, skip_string).err(), Some(Error::BufferTooSmall));
        assert_eq!(unmarshal_map(&mut truncated_buf.clone(), unmarshal_string, unmarshal_string).err(), Some(Error::BufferTooSmall));
    }

    #[test]
    fn test_size_fixed_slice() {
        let slice = vec![1i32, 2, 3];
        let elem_size = size_i32();
        let expected = size_uint(slice.len() as u64) + slice.len() * elem_size + TERMINATOR.len();
        assert_eq!(size_fixed_slice(&slice, elem_size), expected);
    }
}

