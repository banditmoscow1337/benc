import math
import struct
from typing import Any, Callable, Dict, Generic, List, Tuple, TypeVar, Union, cast
from enum import Enum

T = TypeVar('T')
K = TypeVar('K')
V = TypeVar('V')

class BencError(Enum):
    """Error types for binary encoding/decoding operations"""
    OVERFLOW = "varint overflowed a N-bit unsigned integer"
    BUF_TOO_SMALL = "buffer was too small"

class BencException(Exception):
    def __init__(self, error_type: BencError, message: str = ""):
        self.error_type = error_type
        super().__init__(message or error_type.value)

# Constants
MAX_VARINT_LEN = 10  # Maximum length of a 64-bit varint

# Type aliases for better readability
SizeFunc = Callable[[T], int]
MarshalFunc = Callable[[int, bytearray, T], int]
UnmarshalFunc = Callable[[int, bytes], Tuple[int, T]]

def size_string(s: str) -> int:
    """Calculate bytes needed to marshal a string"""
    str_len = len(s)
    return str_len + size_uint(str_len)

def marshal_string(n: int, b: bytearray, s: str) -> int:
    """Marshal a string and return the new offset"""
    str_len = len(s)
    n = marshal_uint(n, b, str_len)
    b[n:n+str_len] = s.encode('utf-8')
    return n + str_len

def unmarshal_string(n: int, b: bytes) -> Tuple[int, str]:
    """Unmarshal a string and return the new offset and string"""
    n, str_len = unmarshal_uint(n, b)
    if len(b) - n < str_len:
        raise BencException(BencError.BUF_TOO_SMALL)
    s = b[n:n+str_len].decode('utf-8')
    return n + str_len, s


def size_slice(slice_data: List[T], sizer: SizeFunc[T]) -> int:
    """Calculate bytes needed to marshal a slice with dynamic element size"""
    total = 4 + size_uint(len(slice_data))
    for item in slice_data:
        total += sizer(item)
    return total

def size_fixed_slice(slice_data: List[Any], elem_size: int) -> int:
    """Calculate bytes needed to marshal a slice with fixed element size"""
    return 4 + size_uint(len(slice_data)) + len(slice_data) * elem_size

def marshal_slice(n: int, b: bytearray, slice_data: List[T], marshaler: MarshalFunc[T]) -> int:
    """Marshal a slice and return the new offset"""
    n = marshal_uint(n, b, len(slice_data))
    for item in slice_data:
        n = marshaler(n, b, item)
    
    # Write termination sequence
    b[n:n+4] = bytes([1, 1, 1, 1])
    return n + 4

def unmarshal_slice(n: int, b: bytes, unmarshaler: UnmarshalFunc[T]) -> Tuple[int, List[T]]:
    """Unmarshal a slice and return the new offset and slice"""
    n, size = unmarshal_uint(n, b)
    result = []
    for _ in range(size):
        n, item = unmarshaler(n, b)
        result.append(item)
    
    # Skip termination sequence
    if len(b) - n < 4:
        raise BencException(BencError.BUF_TOO_SMALL)
    return n + 4, result

def size_map(m: Dict[K, V], k_sizer: SizeFunc[K], v_sizer: SizeFunc[V]) -> int:
    """Calculate bytes needed to marshal a map"""
    total = 4 + size_uint(len(m))
    for k, v in m.items():
        total += k_sizer(k) + v_sizer(v)
    return total

def marshal_map(n: int, b: bytearray, m: Dict[K, V], 
                k_marshaler: MarshalFunc[K], v_marshaler: MarshalFunc[V]) -> int:
    """Marshal a map and return the new offset"""
    n = marshal_uint(n, b, len(m))
    for k, v in m.items():
        n = k_marshaler(n, b, k)
        n = v_marshaler(n, b, v)
    
    # Write termination sequence
    b[n:n+4] = bytes([1, 1, 1, 1])
    return n + 4

def unmarshal_map(n: int, b: bytes, 
                  k_unmarshaler: UnmarshalFunc[K], 
                  v_unmarshaler: UnmarshalFunc[V]) -> Tuple[int, Dict[K, V]]:
    """Unmarshal a map and return the new offset and map"""
    n, size = unmarshal_uint(n, b)
    result = {}
    for _ in range(size):
        n, key = k_unmarshaler(n, b)
        n, value = v_unmarshaler(n, b)
        result[key] = value
    
    # Skip termination sequence
    if len(b) - n < 4:
        raise BencException(BencError.BUF_TOO_SMALL)
    return n + 4, result

# Primitive type functions
def skip_byte(n: int, b: bytes) -> int:
    """Skip a marshalled byte and return the new offset"""
    if len(b) - n < 1:
        raise BencException(BencError.BUF_TOO_SMALL)
    return n + 1

def size_byte(_: Any = None) -> int:
    """Calculate bytes needed to marshal a byte"""
    return 1

def marshal_byte(n: int, b: bytearray, value: int) -> int:
    """Marshal a byte and return the new offset"""
    b[n] = value & 0xFF
    return n + 1

def unmarshal_byte(n: int, b: bytes) -> Tuple[int, int]:
    """Unmarshal a byte and return the new offset and byte value"""
    if len(b) - n < 1:
        raise BencException(BencError.BUF_TOO_SMALL)
    return n + 1, b[n]

def size_bytes(bs: bytes) -> int:
    """Calculate bytes needed to marshal bytes"""
    return len(bs) + size_uint(len(bs))

def marshal_bytes(n: int, b: bytearray, bs: bytes) -> int:
    """Marshal bytes and return the new offset"""
    n = marshal_uint(n, b, len(bs))
    b[n:n+len(bs)] = bs
    return n + len(bs)

def unmarshal_bytes_copied(n: int, b: bytes) -> Tuple[int, bytes]:
    """Unmarshal bytes (with copy) and return the new offset and bytes"""
    n, size = unmarshal_uint(n, b)
    if len(b) - n < size:
        raise BencException(BencError.BUF_TOO_SMALL)
    return n + size, b[n:n+size]

def unmarshal_bytes_cropped(n: int, b: bytes) -> Tuple[int, bytes]:
    """Unmarshal bytes (without copy) and return the new offset and bytes"""
    n, size = unmarshal_uint(n, b)
    if len(b) - n < size:
        raise BencException(BencError.BUF_TOO_SMALL)
    return n + size, b[n:n+size]

def skip_varint(n: int, buf: bytes) -> int:
    """Skip a marshalled varint and return the new offset"""
    for i in range(MAX_VARINT_LEN):
        if n + i >= len(buf):
            raise BencException(BencError.BUF_TOO_SMALL)
        
        if buf[n + i] < 0x80:
            if i == MAX_VARINT_LEN - 1 and buf[n + i] > 1:
                raise BencException(BencError.OVERFLOW)
            return n + i + 1
    raise BencException(BencError.OVERFLOW)

def size_int(value: int) -> int:
    """Calculate bytes needed to marshal an integer"""
    v = encode_zigzag(value)
    size = 0
    while v >= 0x80:
        v >>= 7
        size += 1
    return size + 1

def marshal_int(n: int, b: bytearray, value: int) -> int:
    """Marshal an integer and return the new offset"""
    v = encode_zigzag(value)
    i = n
    while v >= 0x80:
        b[i] = (v & 0x7F) | 0x80
        v >>= 7
        i += 1
    b[i] = v & 0x7F
    return i + 1

def unmarshal_int(n: int, buf: bytes) -> Tuple[int, int]:
    """Unmarshal an integer and return the new offset and value"""
    x = 0
    s = 0
    for i in range(MAX_VARINT_LEN):
        if n + i >= len(buf):
            raise BencException(BencError.BUF_TOO_SMALL)
        
        b = buf[n + i]
        if b < 0x80:
            if i == MAX_VARINT_LEN - 1 and b > 1:
                raise BencException(BencError.OVERFLOW)
            return n + i + 1, decode_zigzag(x | (b << s))
        
        x |= (b & 0x7F) << s
        s += 7
    
    raise BencException(BencError.OVERFLOW)

def size_uint(value: int) -> int:
    """Calculate bytes needed to marshal an unsigned integer"""
    size = 0
    v = value
    while v >= 0x80:
        v >>= 7
        size += 1
    return size + 1

def marshal_uint(n: int, b: bytearray, value: int) -> int:
    """Marshal an unsigned integer and return the new offset"""
    v = value
    i = n
    while v >= 0x80:
        b[i] = (v & 0x7F) | 0x80
        v >>= 7
        i += 1
    b[i] = v & 0x7F
    return i + 1

def unmarshal_uint(n: int, buf: bytes) -> Tuple[int, int]:
    """Unmarshal an unsigned integer and return the new offset and value"""
    x = 0
    s = 0
    for i in range(MAX_VARINT_LEN):
        if n + i >= len(buf):
            raise BencException(BencError.BUF_TOO_SMALL)
        
        b = buf[n + i]
        if b < 0x80:
            if i == MAX_VARINT_LEN - 1 and b > 1:
                raise BencException(BencError.OVERFLOW)
            return n + i + 1, x | (b << s)
        
        x |= (b & 0x7F) << s
        s += 7
    
    raise BencException(BencError.OVERFLOW)

# uint16 functions
def size_uint16(_: Any = None) -> int:
    """Calculate bytes needed to marshal a 16-bit unsigned integer"""
    return 2

def marshal_uint16(n: int, b: bytearray, value: int) -> int:
    """Marshal a 16-bit unsigned integer and return the new offset"""
    if len(b) - n < 2:
        raise BencException(BencError.BUF_TOO_SMALL)
    if value < 0 or value > 0xFFFF:
        raise BencException(BencError.OVERFLOW)
    
    b[n] = value & 0xFF
    b[n+1] = (value >> 8) & 0xFF
    return n + 2

def unmarshal_uint16(n: int, b: bytes) -> Tuple[int, int]:
    """Unmarshal a 16-bit unsigned integer and return the new offset and value"""
    if len(b) - n < 2:
        raise BencException(BencError.BUF_TOO_SMALL)
    
    value = b[n] | (b[n+1] << 8)
    return n + 2, value

def skip_uint16(n: int, b: bytes) -> int:
    """Skip a 16-bit unsigned integer and return the new offset"""
    if len(b) - n < 2:
        raise BencException(BencError.BUF_TOO_SMALL)
    return n + 2

# uint32 functions
def size_uint32(_: Any = None) -> int:
    """Calculate bytes needed to marshal a 32-bit unsigned integer"""
    return 4

def marshal_uint32(n: int, b: bytearray, value: int) -> int:
    """Marshal a 32-bit unsigned integer and return the new offset"""
    if len(b) - n < 4:
        raise BencException(BencError.BUF_TOO_SMALL)
    if value < 0 or value > 0xFFFFFFFF:
        raise BencException(BencError.OVERFLOW)
    
    b[n] = value & 0xFF
    b[n+1] = (value >> 8) & 0xFF
    b[n+2] = (value >> 16) & 0xFF
    b[n+3] = (value >> 24) & 0xFF
    return n + 4

def unmarshal_uint32(n: int, b: bytes) -> Tuple[int, int]:
    """Unmarshal a 32-bit unsigned integer and return the new offset and value"""
    if len(b) - n < 4:
        raise BencException(BencError.BUF_TOO_SMALL)
    
    value = b[n] | (b[n+1] << 8) | (b[n+2] << 16) | (b[n+3] << 24)
    return n + 4, value

def skip_uint32(n: int, b: bytes) -> int:
    """Skip a 32-bit unsigned integer and return the new offset"""
    if len(b) - n < 4:
        raise BencException(BencError.BUF_TOO_SMALL)
    return n + 4

# int64 functions
def size_int64(_: Any = None) -> int:
    """Calculate bytes needed to marshal a 64-bit integer"""
    return 8

def marshal_int64(n: int, b: bytearray, value: int) -> int:
    """Marshal a 64-bit integer and return the new offset"""
    if len(b) - n < 8:
        raise BencException(BencError.BUF_TOO_SMALL)
    
    # Convert to unsigned representation for bit manipulation
    if value < 0:
        unsigned_value = (1 << 64) + value
    else:
        unsigned_value = value
    
    b[n] = unsigned_value & 0xFF
    b[n+1] = (unsigned_value >> 8) & 0xFF
    b[n+2] = (unsigned_value >> 16) & 0xFF
    b[n+3] = (unsigned_value >> 24) & 0xFF
    b[n+4] = (unsigned_value >> 32) & 0xFF
    b[n+5] = (unsigned_value >> 40) & 0xFF
    b[n+6] = (unsigned_value >> 48) & 0xFF
    b[n+7] = (unsigned_value >> 56) & 0xFF
    return n + 8

def unmarshal_int64(n: int, b: bytes) -> Tuple[int, int]:
    """Unmarshal a 64-bit integer and return the new offset and value"""
    if len(b) - n < 8:
        raise BencException(BencError.BUF_TOO_SMALL)
    
    # Read as unsigned first
    unsigned_value = (
        b[n] |
        (b[n+1] << 8) |
        (b[n+2] << 16) |
        (b[n+3] << 24) |
        (b[n+4] << 32) |
        (b[n+5] << 40) |
        (b[n+6] << 48) |
        (b[n+7] << 56)
    )
    
    # Convert to signed
    if unsigned_value & (1 << 63):
        value = unsigned_value - (1 << 64)
    else:
        value = unsigned_value
    
    return n + 8, value

def skip_int64(n: int, b: bytes) -> int:
    """Skip a 64-bit integer and return the new offset"""
    if len(b) - n < 8:
        raise BencException(BencError.BUF_TOO_SMALL)
    return n + 8


# Fixed-size integer functions
def skip_uint64(n: int, b: bytes) -> int:
    if len(b) - n < 8:
        raise BencException(BencError.BUF_TOO_SMALL)
    return n + 8

def size_uint64(_: Any = None) -> int:
    return 8

def marshal_uint64(n: int, b: bytearray, value: int) -> int:
    b[n:n+8] = value.to_bytes(8, 'little')
    return n + 8

def unmarshal_uint64(n: int, b: bytes) -> Tuple[int, int]:
    if len(b) - n < 8:
        raise BencException(BencError.BUF_TOO_SMALL)
    return n + 8, int.from_bytes(b[n:n+8], 'little')

def size_int16(_: Any = None) -> int:
    return 2

def marshal_int16(n: int, b: bytearray, value: int) -> int:
    if len(b) - n < 2:
        raise BencException(BencError.BUF_TOO_SMALL)
    b[n:n+2] = value.to_bytes(2, 'little', signed=True)
    return n + 2

def unmarshal_int16(n: int, b: bytes) -> Tuple[int, int]:
    if len(b) - n < 2:
        raise BencException(BencError.BUF_TOO_SMALL)
    return n + 2, int.from_bytes(b[n:n+2], 'little', signed=True)

def skip_int16(n: int, b: bytes) -> int:
    if len(b) - n < 2:
        raise BencException(BencError.BUF_TOO_SMALL)
    return n + 2

def size_int32(_: Any = None) -> int:
    return 4

def marshal_int32(n: int, b: bytearray, value: int) -> int:
    if len(b) - n < 4:
        raise BencException(BencError.BUF_TOO_SMALL)
    b[n:n+4] = value.to_bytes(4, 'little', signed=True)
    return n + 4

def unmarshal_int32(n: int, b: bytes) -> Tuple[int, int]:
    if len(b) - n < 4:
        raise BencException(BencError.BUF_TOO_SMALL)
    return n + 4, int.from_bytes(b[n:n+4], 'little', signed=True)

def skip_int32(n: int, b: bytes) -> int:
    if len(b) - n < 4:
        raise BencException(BencError.BUF_TOO_SMALL)
    return n + 4

# Float functions
def skip_float64(n: int, b: bytes) -> int:
    if len(b) - n < 8:
        raise BencException(BencError.BUF_TOO_SMALL)
    return n + 8

def size_float64(_: Any = None) -> int:
    return 8

def marshal_float64(n: int, b: bytearray, value: float) -> int:
    b[n:n+8] = struct.pack('<d', value)
    return n + 8

def unmarshal_float64(n: int, b: bytes) -> Tuple[int, float]:
    if len(b) - n < 8:
        raise BencException(BencError.BUF_TOO_SMALL)
    return n + 8, struct.unpack('<d', b[n:n+8])[0]

def skip_float32(n: int, b: bytes) -> int:
    if len(b) - n < 4:
        raise BencException(BencError.BUF_TOO_SMALL)
    return n + 4

def size_float32(_: Any = None) -> int:
    return 4

def marshal_float32(n: int, b: bytearray, value: float) -> int:
    b[n:n+4] = struct.pack('<f', value)
    return n + 4

def unmarshal_float32(n: int, b: bytes) -> Tuple[int, float]:
    if len(b) - n < 4:
        raise BencException(BencError.BUF_TOO_SMALL)
    return n + 4, struct.unpack('<f', b[n:n+4])[0]

# Boolean functions
def skip_bool(n: int, b: bytes) -> int:
    if len(b) - n < 1:
        raise BencException(BencError.BUF_TOO_SMALL)
    return n + 1

def size_bool(_: Any = None) -> int:
    return 1

def marshal_bool(n: int, b: bytearray, value: bool) -> int:
    b[n] = 1 if value else 0
    return n + 1

def unmarshal_bool(n: int, b: bytes) -> Tuple[int, bool]:
    if len(b) - n < 1:
        raise BencException(BencError.BUF_TOO_SMALL)
    return n + 1, b[n] == 1

# ZigZag encoding helpers
def encode_zigzag(value: int) -> int:
    if value < 0:
        return (abs(value) << 1) - 1
    return value << 1

def decode_zigzag(value: int) -> int:
    if value & 1:
        return -(value >> 1) - 1
    return value >> 1

def skip_string(n: int, b: bytes) -> int:
    """Skip a marshalled string and return the new offset"""
    try:
        n, str_len = unmarshal_uint(n, b)
        if len(b) - n < str_len:
            raise BencException(BencError.BUF_TOO_SMALL)
        return n + str_len
    except BencException:
        raise
    except Exception:
        # If we can't even read the length, then buffer is too small
        raise BencException(BencError.BUF_TOO_SMALL)

def skip_bytes(n: int, b: bytes) -> int:
    """Skip marshalled bytes and return the new offset"""
    try:
        n, size = unmarshal_uint(n, b)
        if len(b) - n < size:
            raise BencException(BencError.BUF_TOO_SMALL)
        return n + size
    except BencException:
        raise
    except Exception:
        # If we can't even read the length, then buffer is too small
        raise BencException(BencError.BUF_TOO_SMALL)

def skip_slice(n: int, b: bytes) -> int:
    """Skip a marshalled slice and return the new offset"""
    lb = len(b)
    
    # Try to find the termination sequence
    for i in range(n, lb - 3):
        if b[i] == 1 and b[i+1] == 1 and b[i+2] == 1 and b[i+3] == 1:
            return i + 4
    
    # If we get here, we didn't find the termination sequence
    raise BencException(BencError.BUF_TOO_SMALL)

def skip_map(n: int, b: bytes) -> int:
    """Skip a marshalled map and return the new offset"""
    lb = len(b)
    
    # Try to find the termination sequence
    for i in range(n, lb - 3):
        if b[i] == 1 and b[i+1] == 1 and b[i+2] == 1 and b[i+3] == 1:
            return i + 4
    
    # If we get here, we didn't find the termination sequence
    raise BencException(BencError.BUF_TOO_SMALL)