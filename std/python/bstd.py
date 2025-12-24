import math
import struct
from typing import Any, Callable, Dict, List, Tuple, TypeVar, Optional
from enum import Enum
from datetime import datetime, timezone

# --- Type Variables ---
T = TypeVar('T')
K = TypeVar('K')
V = TypeVar('V')

# --- Error Handling ---

class BencError(Enum):
    """Error types for binary encoding/decoding operations."""
    OVERFLOW = "varint overflowed a N-bit unsigned integer"
    BUF_TOO_SMALL = "buffer was too small"

class BencException(Exception):
    """Custom exception for Benc errors."""
    def __init__(self, error_type: BencError, message: str = ""):
        self.error_type = error_type
        super().__init__(message or error_type.value)

# --- Constants ---
MAX_VARINT_LEN = 10  # Maximum length of a 64-bit varint

# --- Type Aliases for better readability ---
SizeFunc = Callable[[T], int]
MarshalFunc = Callable[[int, bytearray, T], int]
UnmarshalFunc = Callable[[int, bytes], Tuple[int, T]]
SkipFunc = Callable[[int, bytes], int]

# --- String Functions ---

def size_string(s: str) -> int:
    """Calculate bytes needed to marshal a string."""
    str_len = len(s.encode('utf-8'))
    return str_len + size_uint(str_len)

def marshal_string(n: int, b: bytearray, s: str) -> int:
    """Marshal a string and return the new offset."""
    encoded_s = s.encode('utf-8')
    str_len = len(encoded_s)
    n = marshal_uint(n, b, str_len)
    if len(b) - n < str_len:
        raise BencException(BencError.BUF_TOO_SMALL)
    b[n:n+str_len] = encoded_s
    return n + str_len

def unmarshal_string(n: int, b: bytes) -> Tuple[int, str]:
    """Unmarshal a string and return the new offset and string."""
    n, str_len = unmarshal_uint(n, b)
    if len(b) - n < str_len:
        raise BencException(BencError.BUF_TOO_SMALL)
    s = b[n:n+str_len].decode('utf-8')
    return n + str_len, s

def skip_string(n: int, b: bytes) -> int:
    """Skip a marshalled string and return the new offset."""
    n_after_len, str_len = unmarshal_uint(n, b)
    if len(b) - n_after_len < str_len:
        raise BencException(BencError.BUF_TOO_SMALL)
    return n_after_len + str_len

# --- Slice (List) Functions ---

def size_slice(slice_data: List[T], sizer: SizeFunc[T]) -> int:
    """Calculate bytes needed to marshal a slice with dynamic element size."""
    total = 4 + size_uint(len(slice_data))  # 4 bytes for terminator
    for item in slice_data:
        total += sizer(item)
    return total

def size_fixed_slice(slice_data: List[Any], elem_size: int) -> int:
    """Calculate bytes needed to marshal a slice with fixed element size."""
    count = len(slice_data)
    return 4 + size_uint(count) + count * elem_size

def marshal_slice(n: int, b: bytearray, slice_data: List[T], marshaler: MarshalFunc[T]) -> int:
    """Marshal a slice and return the new offset."""
    n = marshal_uint(n, b, len(slice_data))
    for item in slice_data:
        n = marshaler(n, b, item)
    
    if len(b) - n < 4:
        raise BencException(BencError.BUF_TOO_SMALL, "buffer too small for slice terminator")
    b[n:n+4] = b'\x01\x01\x01\x01'
    return n + 4

def unmarshal_slice(n: int, b: bytes, unmarshaler: UnmarshalFunc[T]) -> Tuple[int, List[T]]:
    """Unmarshal a slice and return the new offset and slice."""
    n, size = unmarshal_uint(n, b)
    result: List[T] = []
    for _ in range(size):
        n, item = unmarshaler(n, b)
        result.append(item)
    
    if len(b) - n < 4:
        raise BencException(BencError.BUF_TOO_SMALL, "buffer too small for slice terminator")
    return n + 4, result

def skip_slice(n: int, b: bytes, element_skipper: SkipFunc) -> int:
    """Skip a marshalled slice by skipping each element individually."""
    n, element_count = unmarshal_uint(n, b)
    for _ in range(element_count):
        n = element_skipper(n, b)
    
    if len(b) - n < 4:
        raise BencException(BencError.BUF_TOO_SMALL, "buffer too small for slice terminator")
    return n + 4

# --- Map (Dict) Functions ---

def size_map(m: Dict[K, V], k_sizer: SizeFunc[K], v_sizer: SizeFunc[V]) -> int:
    """Calculate bytes needed to marshal a map."""
    total = 4 + size_uint(len(m))  # 4 bytes for terminator
    for k, v in m.items():
        total += k_sizer(k) + v_sizer(v)
    return total

def marshal_map(n: int, b: bytearray, m: Dict[K, V], 
                k_marshaler: MarshalFunc[K], v_marshaler: MarshalFunc[V]) -> int:
    """Marshal a map and return the new offset."""
    n = marshal_uint(n, b, len(m))
    for k, v in m.items():
        n = k_marshaler(n, b, k)
        n = v_marshaler(n, b, v)
    
    if len(b) - n < 4:
        raise BencException(BencError.BUF_TOO_SMALL, "buffer too small for map terminator")
    b[n:n+4] = b'\x01\x01\x01\x01'
    return n + 4

def unmarshal_map(n: int, b: bytes, 
                  k_unmarshaler: UnmarshalFunc[K], 
                  v_unmarshaler: UnmarshalFunc[V]) -> Tuple[int, Dict[K, V]]:
    """Unmarshal a map and return the new offset and map."""
    n, size = unmarshal_uint(n, b)
    result = {}
    for _ in range(size):
        n, key = k_unmarshaler(n, b)
        n, value = v_unmarshaler(n, b)
        result[key] = value
    
    if len(b) - n < 4:
        raise BencException(BencError.BUF_TOO_SMALL, "buffer too small for map terminator")
    return n + 4, result

def skip_map(n: int, b: bytes, key_skipper: SkipFunc, value_skipper: SkipFunc) -> int:
    """Skip a marshalled map by skipping each key and value."""
    n, pair_count = unmarshal_uint(n, b)
    for _ in range(pair_count):
        n = key_skipper(n, b)
        n = value_skipper(n, b)
        
    if len(b) - n < 4:
        raise BencException(BencError.BUF_TOO_SMALL, "buffer too small for map terminator")
    return n + 4

# --- Primitive Type Functions ---

def skip_byte(n: int, b: bytes) -> int:
    if len(b) - n < 1: raise BencException(BencError.BUF_TOO_SMALL)
    return n + 1

def size_byte(_: Any = None) -> int:
    return 1

def marshal_byte(n: int, b: bytearray, value: int) -> int:
    if len(b) - n < 1: raise BencException(BencError.BUF_TOO_SMALL)
    b[n] = value & 0xFF
    return n + 1

def unmarshal_byte(n: int, b: bytes) -> Tuple[int, int]:
    if len(b) - n < 1: raise BencException(BencError.BUF_TOO_SMALL)
    return n + 1, b[n]

# --- Bytes Functions ---

def size_bytes(bs: bytes) -> int:
    return len(bs) + size_uint(len(bs))

def marshal_bytes(n: int, b: bytearray, bs: bytes) -> int:
    n = marshal_uint(n, b, len(bs))
    if len(b) - n < len(bs):
        raise BencException(BencError.BUF_TOO_SMALL)
    b[n:n+len(bs)] = bs
    return n + len(bs)

def unmarshal_bytes(n: int, b: bytes) -> Tuple[int, bytes]:
    """Unmarshal bytes (with copy) and return the new offset and bytes."""
    n, size = unmarshal_uint(n, b)
    if len(b) - n < size:
        raise BencException(BencError.BUF_TOO_SMALL)
    return n + size, b[n:n+size]

def skip_bytes(n: int, b: bytes) -> int:
    """Skip marshalled bytes and return the new offset."""
    n, size = unmarshal_uint(n, b)
    if len(b) - n < size:
        raise BencException(BencError.BUF_TOO_SMALL)
    return n + size

# --- Varint (Signed Integer) Functions ---

def encode_zigzag(value: int) -> int:
    """ZigZag encodes a signed integer into an unsigned integer."""
    return (abs(value) << 1) - 1 if value < 0 else value << 1

def decode_zigzag(value: int) -> int:
    """Decodes a ZigZag-encoded unsigned integer back to a signed integer."""
    return -(value >> 1) - 1 if value & 1 else value >> 1

def skip_varint(n: int, buf: bytes) -> int:
    """Skip a marshalled varint and return the new offset."""
    for i in range(MAX_VARINT_LEN):
        if n + i >= len(buf):
            raise BencException(BencError.BUF_TOO_SMALL)
        
        if buf[n + i] < 0x80:
            if i == MAX_VARINT_LEN - 1 and buf[n + i] > 1:
                raise BencException(BencError.OVERFLOW)
            return n + i + 1
    raise BencException(BencError.OVERFLOW)

def size_int(value: int) -> int:
    """Calculate bytes needed to marshal an integer."""
    return size_uint(encode_zigzag(value))

def marshal_int(n: int, b: bytearray, value: int) -> int:
    """Marshal an integer and return the new offset."""
    return marshal_uint(n, b, encode_zigzag(value))

def unmarshal_int(n: int, buf: bytes) -> Tuple[int, int]:
    """Unmarshal an integer and return the new offset and value."""
    n, unsigned_val = unmarshal_uint(n, buf)
    return n, decode_zigzag(unsigned_val)

# --- Varint (Unsigned Integer) Functions ---

def size_uint(value: int) -> int:
    """Calculate bytes needed to marshal an unsigned integer."""
    size = 0
    v = value
    while v >= 0x80:
        v >>= 7
        size += 1
    return size + 1

def marshal_uint(n: int, b: bytearray, value: int) -> int:
    """Marshal an unsigned integer and return the new offset."""
    v = value
    i = n
    while v >= 0x80:
        if i >= len(b): raise BencException(BencError.BUF_TOO_SMALL)
        b[i] = (v & 0x7F) | 0x80
        v >>= 7
        i += 1
    if i >= len(b): raise BencException(BencError.BUF_TOO_SMALL)
    b[i] = v & 0x7F
    return i + 1

def unmarshal_uint(n: int, buf: bytes) -> Tuple[int, int]:
    """Unmarshal an unsigned integer and return the new offset and value."""
    x = 0
    s = 0
    for i in range(MAX_VARINT_LEN):
        if n + i >= len(buf):
            raise BencException(BencError.BUF_TOO_SMALL)
        
        byte_val = buf[n + i]
        if byte_val < 0x80:
            if i == MAX_VARINT_LEN - 1 and byte_val > 1:
                raise BencException(BencError.OVERFLOW)
            return n + i + 1, x | (byte_val << s)
        
        x |= (byte_val & 0x7F) << s
        s += 7
    raise BencException(BencError.OVERFLOW)

# --- Fixed-size integer functions ---

def skip_int8(n: int, b: bytes) -> int: return skip_byte(n, b)
def size_int8(_: Any = None) -> int: return 1
def marshal_int8(n: int, b: bytearray, v: int) -> int:
    if len(b) < n + 1: raise BencException(BencError.BUF_TOO_SMALL)
    b[n:n+1] = v.to_bytes(1, 'little', signed=True); return n + 1
def unmarshal_int8(n: int, b: bytes) -> Tuple[int, int]:
    if len(b) < n + 1: raise BencException(BencError.BUF_TOO_SMALL)
    return n + 1, int.from_bytes(b[n:n+1], 'little', signed=True)

def skip_uint16(n: int, b: bytes) -> int:
    if len(b) < n + 2:
        raise BencException(BencError.BUF_TOO_SMALL)
    return n + 2
def size_uint16(_: Any = None) -> int: return 2
def marshal_uint16(n: int, b: bytearray, v: int) -> int:
    if len(b) < n + 2: raise BencException(BencError.BUF_TOO_SMALL)
    b[n:n+2] = v.to_bytes(2, 'little', signed=False); return n + 2
def unmarshal_uint16(n: int, b: bytes) -> Tuple[int, int]:
    if len(b) < n + 2: raise BencException(BencError.BUF_TOO_SMALL)
    return n + 2, int.from_bytes(b[n:n+2], 'little', signed=False)

def skip_int16(n: int, b: bytes) -> int:
    if len(b) < n + 2:
        raise BencException(BencError.BUF_TOO_SMALL)
    return n + 2
def size_int16(_: Any = None) -> int: return 2
def marshal_int16(n: int, b: bytearray, v: int) -> int:
    if len(b) < n + 2: raise BencException(BencError.BUF_TOO_SMALL)
    b[n:n+2] = v.to_bytes(2, 'little', signed=True); return n + 2
def unmarshal_int16(n: int, b: bytes) -> Tuple[int, int]:
    if len(b) < n + 2: raise BencException(BencError.BUF_TOO_SMALL)
    return n + 2, int.from_bytes(b[n:n+2], 'little', signed=True)

def skip_uint32(n: int, b: bytes) -> int:
    if len(b) < n + 4:
        raise BencException(BencError.BUF_TOO_SMALL)
    return n + 4
def size_uint32(_: Any = None) -> int: return 4
def marshal_uint32(n: int, b: bytearray, v: int) -> int:
    if len(b) < n + 4: raise BencException(BencError.BUF_TOO_SMALL)
    b[n:n+4] = v.to_bytes(4, 'little', signed=False); return n + 4
def unmarshal_uint32(n: int, b: bytes) -> Tuple[int, int]:
    if len(b) < n + 4: raise BencException(BencError.BUF_TOO_SMALL)
    return n + 4, int.from_bytes(b[n:n+4], 'little', signed=False)

def skip_int32(n: int, b: bytes) -> int:
    if len(b) < n + 4:
        raise BencException(BencError.BUF_TOO_SMALL)
    return n + 4
def size_int32(_: Any = None) -> int: return 4
def marshal_int32(n: int, b: bytearray, v: int) -> int:
    if len(b) < n + 4: raise BencException(BencError.BUF_TOO_SMALL)
    b[n:n+4] = v.to_bytes(4, 'little', signed=True); return n + 4
def unmarshal_int32(n: int, b: bytes) -> Tuple[int, int]:
    if len(b) < n + 4: raise BencException(BencError.BUF_TOO_SMALL)
    return n + 4, int.from_bytes(b[n:n+4], 'little', signed=True)

def skip_uint64(n: int, b: bytes) -> int:
    if len(b) < n + 8:
        raise BencException(BencError.BUF_TOO_SMALL)
    return n + 8
def size_uint64(_: Any = None) -> int: return 8
def marshal_uint64(n: int, b: bytearray, v: int) -> int:
    if len(b) < n + 8: raise BencException(BencError.BUF_TOO_SMALL)
    b[n:n+8] = v.to_bytes(8, 'little', signed=False); return n + 8
def unmarshal_uint64(n: int, b: bytes) -> Tuple[int, int]:
    if len(b) < n + 8: raise BencException(BencError.BUF_TOO_SMALL)
    return n + 8, int.from_bytes(b[n:n+8], 'little', signed=False)

def skip_int64(n: int, b: bytes) -> int:
    if len(b) < n + 8:
        raise BencException(BencError.BUF_TOO_SMALL)
    return n + 8
def size_int64(_: Any = None) -> int: return 8
def marshal_int64(n: int, b: bytearray, v: int) -> int:
    if len(b) < n + 8: raise BencException(BencError.BUF_TOO_SMALL)
    b[n:n+8] = v.to_bytes(8, 'little', signed=True); return n + 8
def unmarshal_int64(n: int, b: bytes) -> Tuple[int, int]:
    if len(b) < n + 8: raise BencException(BencError.BUF_TOO_SMALL)
    return n + 8, int.from_bytes(b[n:n+8], 'little', signed=True)

# --- Float functions ---

def skip_float32(n: int, b: bytes) -> int:
    if len(b) < n + 4:
        raise BencException(BencError.BUF_TOO_SMALL)
    return n + 4
def size_float32(_: Any = None) -> int: return 4
def marshal_float32(n: int, b: bytearray, v: float) -> int:
    if len(b) < n + 4: raise BencException(BencError.BUF_TOO_SMALL)
    b[n:n+4] = struct.pack('<f', v); return n + 4
def unmarshal_float32(n: int, b: bytes) -> Tuple[int, float]:
    if len(b) < n + 4: raise BencException(BencError.BUF_TOO_SMALL)
    return n + 4, struct.unpack('<f', b[n:n+4])[0]

def skip_float64(n: int, b: bytes) -> int:
    if len(b) < n + 8:
        raise BencException(BencError.BUF_TOO_SMALL)
    return n + 8
def size_float64(_: Any = None) -> int: return 8
def marshal_float64(n: int, b: bytearray, v: float) -> int:
    if len(b) < n + 8: raise BencException(BencError.BUF_TOO_SMALL)
    b[n:n+8] = struct.pack('<d', v); return n + 8
def unmarshal_float64(n: int, b: bytes) -> Tuple[int, float]:
    if len(b) < n + 8: raise BencException(BencError.BUF_TOO_SMALL)
    return n + 8, struct.unpack('<d', b[n:n+8])[0]

# --- Boolean functions ---

def skip_bool(n: int, b: bytes) -> int:
    if len(b) - n < 1: raise BencException(BencError.BUF_TOO_SMALL)
    return n + 1
def size_bool(_: Any = None) -> int: return 1
def marshal_bool(n: int, b: bytearray, v: bool) -> int:
    if len(b) - n < 1: raise BencException(BencError.BUF_TOO_SMALL)
    b[n] = 1 if v else 0
    return n + 1
def unmarshal_bool(n: int, b: bytes) -> Tuple[int, bool]:
    if len(b) - n < 1: raise BencException(BencError.BUF_TOO_SMALL)
    return n + 1, b[n] == 1

# --- Time functions ---

def skip_time(n: int, b: bytes) -> int:
    """Time is stored as int64 (Unix nano)."""
    return skip_int64(n, b)

def size_time(_: Any = None) -> int:
    """Time is stored as int64 (Unix nano)."""
    return size_int64()

def marshal_time(n: int, b: bytearray, t: datetime) -> int:
    """Converts a datetime object to Unix nanoseconds and marshals as int64."""
    if t.tzinfo is None:
        raise ValueError("marshal_time requires a timezone-aware datetime object")
    nanos = int(t.timestamp() * 1_000_000_000)
    return marshal_int64(n, b, nanos)

def unmarshal_time(n: int, b: bytes) -> Tuple[int, datetime]:
    """Unmarshals an int64 and converts from Unix nanoseconds to a UTC datetime."""
    n, nanos = unmarshal_int64(n, b)
    return n, datetime.fromtimestamp(nanos / 1_000_000_000, tz=timezone.utc)

# --- Optional (Pointer) functions ---

def skip_optional(n: int, b: bytes, element_skipper: SkipFunc) -> int:
    """Skips a boolean flag and, if true, the element that follows."""
    n, has_value = unmarshal_bool(n, b)
    if has_value:
        return element_skipper(n, b)
    return n

def size_optional(value: Optional[T], sizer: SizeFunc[T]) -> int:
    """Calculates size of a boolean flag and, if value is not None, the value."""
    return size_bool() + (sizer(value) if value is not None else 0)

def marshal_optional(n: int, b: bytearray, value: Optional[T], marshaler: MarshalFunc[T]) -> int:
    """Marshals a boolean flag and, if value is not None, the value."""
    n = marshal_bool(n, b, value is not None)
    if value is not None:
        n = marshaler(n, b, value)
    return n

def unmarshal_optional(n: int, b: bytes, unmarshaler: UnmarshalFunc[T]) -> Tuple[int, Optional[T]]:
    """Unmarshals a boolean flag and, if true, unmarshals and returns the value."""
    n, has_value = unmarshal_bool(n, b)
    if has_value:
        return unmarshaler(n, b)
    return n, None

