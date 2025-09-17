from dataclasses import dataclass, field
from typing import List, Dict, Any, Tuple, Callable
import std as benc

@dataclass
class SubSubItem:
    sub_sub_id: str = ""
    sub_sub_data: bytes = b""
    
    def size_plain(self) -> int:
        return benc.size_string(self.sub_sub_id) + benc.size_bytes(self.sub_sub_data)
    
    def marshal_plain(self, n: int, b: bytearray) -> int:
        n = benc.marshal_string(n, b, self.sub_sub_id)
        return benc.marshal_bytes(n, b, self.sub_sub_data)
    
    def unmarshal_plain(self, n: int, b: bytes) -> int:
        n, self.sub_sub_id = benc.unmarshal_string(n, b)
        n, self.sub_sub_data = benc.unmarshal_bytes_cropped(n, b)
        return n

@dataclass
class SubItem:
    sub_id: int = 0
    description: str = ""
    sub_items: List[SubSubItem] = field(default_factory=list)
    
    def size_plain(self) -> int:
        return (
            benc.size_int32() + 
            benc.size_string(self.description) + 
            benc.size_slice(self.sub_items, lambda x: x.size_plain())
        )
    
    def marshal_plain(self, n: int, b: bytearray) -> int:
        n = benc.marshal_int32(n, b, self.sub_id)
        n = benc.marshal_string(n, b, self.description)
        return benc.marshal_slice(n, b, self.sub_items, lambda n, b, item: item.marshal_plain(n, b))
    
    def unmarshal_plain(self, n: int, b: bytes) -> int:
        n, self.sub_id = benc.unmarshal_int32(n, b)
        n, self.description = benc.unmarshal_string(n, b)
        
        def unmarshal_subsubitem(n: int, b: bytes) -> Tuple[int, SubSubItem]:
            item = SubSubItem()
            n = item.unmarshal_plain(n, b)
            return n, item
        
        n, self.sub_items = benc.unmarshal_slice(n, b, unmarshal_subsubitem)
        return n

@dataclass
class SubComplexData:
    sub_id: int = 0
    sub_title: str = ""
    sub_binary_data: List[bytes] = field(default_factory=list)
    sub_items: List[SubItem] = field(default_factory=list)
    sub_metadata: Dict[str, str] = field(default_factory=dict)
    
    def size_plain(self) -> int:
        return (
            benc.size_int32() +
            benc.size_string(self.sub_title) +
            benc.size_slice(self.sub_binary_data, benc.size_bytes) +
            benc.size_slice(self.sub_items, lambda x: x.size_plain()) +
            benc.size_map(self.sub_metadata, benc.size_string, benc.size_string)
        )
    
    def marshal_plain(self, n: int, b: bytearray) -> int:
        n = benc.marshal_int32(n, b, self.sub_id)
        n = benc.marshal_string(n, b, self.sub_title)
        n = benc.marshal_slice(n, b, self.sub_binary_data, benc.marshal_bytes)
        n = benc.marshal_slice(n, b, self.sub_items, lambda n, b, item: item.marshal_plain(n, b))
        return benc.marshal_map(n, b, self.sub_metadata, benc.marshal_string, benc.marshal_string)
    
    def unmarshal_plain(self, n: int, b: bytes) -> int:
        n, self.sub_id = benc.unmarshal_int32(n, b)
        n, self.sub_title = benc.unmarshal_string(n, b)
        n, self.sub_binary_data = benc.unmarshal_slice(n, b, benc.unmarshal_bytes_cropped)
        
        def unmarshal_subitem(n: int, b: bytes) -> Tuple[int, SubItem]:
            item = SubItem()
            n = item.unmarshal_plain(n, b)
            return n, item
        
        n, self.sub_items = benc.unmarshal_slice(n, b, unmarshal_subitem)
        n, self.sub_metadata = benc.unmarshal_map(n, b, benc.unmarshal_string, benc.unmarshal_string)
        return n

@dataclass
class ComplexData:
    id: int = 0
    title: str = ""
    items: List[SubItem] = field(default_factory=list)
    metadata: Dict[str, int] = field(default_factory=dict)
    sub_data: SubComplexData = field(default_factory=SubComplexData)
    large_binary_data: List[bytes] = field(default_factory=list)
    huge_list: List[int] = field(default_factory=list)
    
    def size_plain(self) -> int:
        return (
            benc.size_int64() +
            benc.size_string(self.title) +
            benc.size_slice(self.items, lambda x: x.size_plain()) +
            benc.size_map(self.metadata, benc.size_string, benc.size_int32) +
            self.sub_data.size_plain() +
            benc.size_slice(self.large_binary_data, benc.size_bytes) +
            benc.size_fixed_slice(self.huge_list, benc.size_int64())
        )
    
    def marshal_plain(self, n: int, b: bytearray) -> int:
        n = benc.marshal_int64(n, b, self.id)
        n = benc.marshal_string(n, b, self.title)
        n = benc.marshal_slice(n, b, self.items, lambda n, b, item: item.marshal_plain(n, b))
        n = benc.marshal_map(n, b, self.metadata, benc.marshal_string, benc.marshal_int32)
        n = self.sub_data.marshal_plain(n, b)
        n = benc.marshal_slice(n, b, self.large_binary_data, benc.marshal_bytes)
        return benc.marshal_slice(n, b, self.huge_list, benc.marshal_int64)
    
    def unmarshal_plain(self, n: int, b: bytes) -> int:
        n, self.id = benc.unmarshal_int64(n, b)
        n, self.title = benc.unmarshal_string(n, b)
        
        def unmarshal_subitem(n: int, b: bytes) -> Tuple[int, SubItem]:
            item = SubItem()
            n = item.unmarshal_plain(n, b)
            return n, item
        
        n, self.items = benc.unmarshal_slice(n, b, unmarshal_subitem)
        n, self.metadata = benc.unmarshal_map(n, b, benc.unmarshal_string, benc.unmarshal_int32)
        n = self.sub_data.unmarshal_plain(n, b)
        n, self.large_binary_data = benc.unmarshal_slice(n, b, benc.unmarshal_bytes_cropped)
        n, self.huge_list = benc.unmarshal_slice(n, b, benc.unmarshal_int64)
        return n

def create_test_data() -> ComplexData:
    """Create test data with nested structures"""
    return ComplexData(
        id=12345,
        title="Example Complex Data",
        items=[
            SubItem(
                sub_id=1,
                description="SubItem 1",
                sub_items=[
                    SubSubItem(
                        sub_sub_id="subsub1",
                        sub_sub_data=bytes([0x01, 0x02, 0x03])
                    )
                ]
            )
        ],
        metadata={
            "key1": 10,
            "key2": 20
        },
        sub_data=SubComplexData(
            sub_id=999,
            sub_title="Sub Complex Data",
            sub_binary_data=[
                bytes([0x11, 0x22, 0x33]),
                bytes([0x44, 0x55, 0x66])
            ],
            sub_items=[
                SubItem(
                    sub_id=2,
                    description="SubItem 2",
                    sub_items=[
                        SubSubItem(
                            sub_sub_id="subsub2",
                            sub_sub_data=bytes([0xAA, 0xBB, 0xCC])
                        )
                    ]
                )
            ],
            sub_metadata={
                "meta1": "value1",
                "meta2": "value2"
            }
        ),
        large_binary_data=[
            bytes([0xFF, 0xEE, 0xDD])
        ],
        huge_list=[1000000, 2000000, 3000000]
    )

def test_complex_data() -> None:
    """Test complex data structure serialization/deserialization"""
    # Create test data
    original_data = create_test_data()
    
    # Calculate size and create buffer
    size = original_data.size_plain()
    buffer = bytearray(size)
    
    # Marshal the data
    marshal_result = original_data.marshal_plain(0, buffer)
    assert marshal_result == size, f"Marshal failed: expected {size} bytes, got {marshal_result}"
    
    # Unmarshal the data
    unmarshaled_data = ComplexData()
    unmarshal_result = unmarshaled_data.unmarshal_plain(0, buffer)
    assert unmarshal_result == size, f"Unmarshal failed: expected {size} bytes, got {unmarshal_result}"
    
    # Verify data integrity
    assert original_data.id == unmarshaled_data.id
    assert original_data.title == unmarshaled_data.title
    assert original_data.metadata == unmarshaled_data.metadata
    assert original_data.sub_data.sub_id == unmarshaled_data.sub_data.sub_id
    assert original_data.sub_data.sub_title == unmarshaled_data.sub_data.sub_title
    assert original_data.sub_data.sub_metadata == unmarshaled_data.sub_data.sub_metadata
    assert original_data.huge_list == unmarshaled_data.huge_list
    
    # Verify nested structures
    assert len(original_data.items) == len(unmarshaled_data.items)
    assert len(original_data.sub_data.sub_items) == len(unmarshaled_data.sub_data.sub_items)
    assert len(original_data.large_binary_data) == len(unmarshaled_data.large_binary_data)
    
    # Verify binary data
    for i, (orig, unmarshaled) in enumerate(zip(original_data.large_binary_data, unmarshaled_data.large_binary_data)):
        assert orig == unmarshaled, f"Binary data mismatch at index {i}"
    
    print("✓ Complex data test passed!")

if __name__ == "__main__":
    test_complex_data()