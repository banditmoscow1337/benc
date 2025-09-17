#[cfg(test)]
mod complex_tests {
    use benc::*;
    use std::collections::HashMap;

    #[derive(Debug, PartialEq, Clone)]
    struct ComplexData {
        id: i64,
        title: String,
        items: Vec<SubItem>,
        metadata: HashMap<String, i32>,
        sub_data: SubComplexData,
        large_binary_data: Vec<Vec<u8>>,
        huge_list: Vec<i64>,
    }

    impl ComplexData {
        fn size(&self) -> usize {
            size_int(self.id) +
            size_string(&self.title) +
            size_slice(&self.items, |item| item.size()) +
            size_map(&self.metadata, |k| size_string(k), |v| size_int(*v as i64)) + // Convert i32 to i64 for size calculation
            self.sub_data.size() +
            size_slice(&self.large_binary_data, |b| size_bytes(b)) +
            size_slice(&self.huge_list, |v| size_int(*v)) // Use variable-length encoding for consistency
        }

        fn marshal(&self, writer: &mut &mut [u8]) {
            marshal_int(self.id, writer);
            marshal_string(&self.title, writer);
            marshal_slice(&self.items, writer, |item, w| item.marshal(w));
            marshal_map(&self.metadata, writer, 
                |k, w| marshal_string(k, w), 
                |v, w| marshal_int(*v as i64, w) // Convert i32 to i64 for marshaling
            );
            self.sub_data.marshal(writer);
            marshal_slice(&self.large_binary_data, writer, |b, w| marshal_bytes(b, w));
            marshal_slice(&self.huge_list, writer, |v, w| marshal_int(*v, w));
        }

        fn unmarshal(reader: &mut &[u8]) -> Result<Self> {
            Ok(Self {
                id: unmarshal_int(reader)?,
                title: unmarshal_string(reader)?.to_string(),
                items: unmarshal_slice(reader, SubItem::unmarshal)?,
                metadata: unmarshal_map(
                    reader,
                    |r| unmarshal_string(r).map(|s| s.to_string()),
                    |r| unmarshal_int(r).map(|v| v as i32) // Convert back to i32 after unmarshaling
                )?,
                sub_data: SubComplexData::unmarshal(reader)?,
                large_binary_data: unmarshal_slice(reader, |r| 
                    unmarshal_bytes_copied(r).map(|v| v)
                )?,
                huge_list: unmarshal_slice(reader, unmarshal_int)?,
            })
        }
    }

    #[derive(Debug, PartialEq, Clone)]
    struct SubItem {
        sub_id: i32,
        description: String,
        sub_items: Vec<SubSubItem>,
    }

    impl SubItem {
        fn size(&self) -> usize {
            size_int(self.sub_id as i64) + // Use variable-length encoding
            size_string(&self.description) +
            size_slice(&self.sub_items, |item| item.size())
        }

        fn marshal(&self, writer: &mut &mut [u8]) {
            marshal_int(self.sub_id as i64, writer); // Use variable-length encoding
            marshal_string(&self.description, writer);
            marshal_slice(&self.sub_items, writer, |item, w| item.marshal(w));
        }

        fn unmarshal(reader: &mut &[u8]) -> Result<Self> {
            Ok(Self {
                sub_id: unmarshal_int(reader)? as i32, // Convert back to i32
                description: unmarshal_string(reader)?.to_string(),
                sub_items: unmarshal_slice(reader, SubSubItem::unmarshal)?,
            })
        }
    }

    #[derive(Debug, PartialEq, Clone)]
    struct SubSubItem {
        sub_sub_id: String,
        sub_sub_data: Vec<u8>,
    }

    impl SubSubItem {
        fn size(&self) -> usize {
            size_string(&self.sub_sub_id) +
            size_bytes(&self.sub_sub_data)
        }

        fn marshal(&self, writer: &mut &mut [u8]) {
            marshal_string(&self.sub_sub_id, writer);
            marshal_bytes(&self.sub_sub_data, writer);
        }

        fn unmarshal(reader: &mut &[u8]) -> Result<Self> {
            Ok(Self {
                sub_sub_id: unmarshal_string(reader)?.to_string(),
                sub_sub_data: unmarshal_bytes_copied(reader)?,
            })
        }
    }

    #[derive(Debug, PartialEq, Clone)]
    struct SubComplexData {
        sub_id: i32,
        sub_title: String,
        sub_binary_data: Vec<Vec<u8>>,
        sub_items: Vec<SubItem>,
        sub_metadata: HashMap<String, String>,
    }

    impl SubComplexData {
        fn size(&self) -> usize {
            size_int(self.sub_id as i64) + // Use variable-length encoding
            size_string(&self.sub_title) +
            size_slice(&self.sub_binary_data, |b| size_bytes(b)) +
            size_slice(&self.sub_items, |item| item.size()) +
            size_map(&self.sub_metadata, |k| size_string(k), |v| size_string(v))
        }

        fn marshal(&self, writer: &mut &mut [u8]) {
            marshal_int(self.sub_id as i64, writer); // Use variable-length encoding
            marshal_string(&self.sub_title, writer);
            marshal_slice(&self.sub_binary_data, writer, |b, w| marshal_bytes(b, w));
            marshal_slice(&self.sub_items, writer, |item, w| item.marshal(w));
            marshal_map(&self.sub_metadata, writer,
                |k, w| marshal_string(k, w),
                |v, w| marshal_string(v, w)
            );
        }

        fn unmarshal(reader: &mut &[u8]) -> Result<Self> {
            Ok(Self {
                sub_id: unmarshal_int(reader)? as i32, // Convert back to i32
                sub_title: unmarshal_string(reader)?.to_string(),
                sub_binary_data: unmarshal_slice(reader, |r| 
                    unmarshal_bytes_copied(r).map(|v| v)
                )?,
                sub_items: unmarshal_slice(reader, SubItem::unmarshal)?,
                sub_metadata: unmarshal_map(
                    reader,
                    |r| unmarshal_string(r).map(|s| s.to_string()),
                    |r| unmarshal_string(r).map(|s| s.to_string())
                )?,
            })
        }
    }

    #[test]
    fn test_complex() {
        let data = ComplexData {
            id: 12345,
            title: "Example Complex Data".to_string(),
            items: vec![SubItem {
                sub_id: 1,
                description: "SubItem 1".to_string(),
                sub_items: vec![SubSubItem {
                    sub_sub_id: "subsub1".to_string(),
                    sub_sub_data: vec![0x01, 0x02, 0x03],
                }],
            }],
            metadata: {
                let mut map = HashMap::new();
                map.insert("key1".to_string(), 10);
                map.insert("key2".to_string(), 20);
                map
            },
            sub_data: SubComplexData {
                sub_id: 999,
                sub_title: "Sub Complex Data".to_string(),
                sub_binary_data: vec![
                    vec![0x11, 0x22, 0x33],
                    vec![0x44, 0x55, 0x66],
                ],
                sub_items: vec![SubItem {
                    sub_id: 2,
                    description: "SubItem 2".to_string(),
                    sub_items: vec![SubSubItem {
                        sub_sub_id: "subsub2".to_string(),
                        sub_sub_data: vec![0xAA, 0xBB, 0xCC],
                    }],
                }],
                sub_metadata: {
                    let mut map = HashMap::new();
                    map.insert("meta1".to_string(), "value1".to_string());
                    map.insert("meta2".to_string(), "value2".to_string());
                    map
                },
            },
            large_binary_data: vec![vec![0xFF, 0xEE, 0xDD]],
            huge_list: vec![1000000, 2000000, 3000000],
        };

        // Calculate size and create buffer
        let size = data.size();
        let mut buf = vec![0u8; size];
        let mut writer = &mut buf[..];
        
        // Marshal the data
        data.marshal(&mut writer);
        assert_eq!(writer.len(), 0, "Buffer not fully written");

        // Unmarshal the data
        let mut reader = &buf[..];
        let ret_data = ComplexData::unmarshal(&mut reader).unwrap();
        
        // Verify all data was read
        assert_eq!(reader.len(), 0, "Buffer not fully read");
        
        // Verify data matches
        assert_eq!(data, ret_data);
    }
}