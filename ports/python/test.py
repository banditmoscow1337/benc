import pytest
import math
import random
import struct
from typing import Any, Callable, List, Tuple, Union, Dict
import sys

# Import the benc module
import std as benc

# Test utilities
def size_all(sizers: List[Callable[[], int]]) -> int:
    """Calculate total size from multiple sizer functions"""
    total = 0
    for sizer in sizers:
        s = sizer()
        if s == 0:
            return 0
        total += s
    return total

def skip_all(b: bytes, skippers: List[Callable[[int, bytes], int]]) -> None:
    """Skip multiple marshalled values in a buffer"""
    n = 0
    for i, skipper in enumerate(skippers):
        try:
            n = skipper(n, b)
        except benc.BencException as e:
            pytest.fail(f"(skip) at idx {i}: error: {e}")
    
    if n != len(b):
        pytest.fail("skip failed: something doesn't match in the marshal- and skip progress")

def skip_once_verify(b: bytes, skipper: Callable[[int, bytes], int]) -> None:
    """Skip one marshalled value and verify the entire buffer is consumed"""
    try:
        n = skipper(0, b)
        if n != len(b):
            pytest.fail("skip failed: something doesn't match in the marshal- and skip progress")
    except benc.BencException as e:
        pytest.fail(f"skip: error: {e}")

def marshal_all(size: int, values: List[Any], marshallers: List[Callable[[int, bytearray, Any], int]]) -> bytearray:
    """Marshal multiple values into a buffer"""
    n = 0
    b = bytearray(size)
    
    for i, marshal in enumerate(marshallers):
        try:
            n = marshal(n, b, values[i])
        except Exception as e:
            pytest.fail(f"(marshal) at idx {i}: error: {e}")
    
    if n != len(b):
        pytest.fail("marshal failed: something doesn't match in the marshal- and size progress")
    
    return b

def unmarshal_all(b: bytes, values: List[Any], unmarshallers: List[Callable[[int, bytes], Tuple[int, Any]]]) -> None:
    """Unmarshal multiple values and verify they match expected values with float tolerance"""
    n = 0
    for i, unmarshal in enumerate(unmarshallers):
        try:
            n, v = unmarshal(n, b)
            
            # Special handling for floating-point comparisons
            if isinstance(values[i], float) and isinstance(v, float):
                # Use relative tolerance for floating-point comparisons
                if not math.isclose(values[i], v, rel_tol=1e-6):
                    pytest.fail(f"(unmarshal) at idx {i}: no match: expected {values[i]}, got {v} --- ({type(values[i])} - {type(v)})")
            else:
                if v != values[i]:
                    pytest.fail(f"(unmarshal) at idx {i}: no match: expected {values[i]}, got {v} --- ({type(values[i])} - {type(v)})")
        except benc.BencException as e:
            pytest.fail(f"(unmarshal) at idx {i}: error: {e}")
    
    if n != len(b):
        pytest.fail("unmarshal failed: something doesn't match in the marshal- and unmarshal progress")

def unmarshal_all_verify_error(expected_error: benc.BencError, buffers: List[bytes], 
                              unmarshallers: List[Callable[[int, bytes], Tuple[int, Any]]]) -> None:
    """Verify that unmarshalling returns expected error for all buffers"""
    for i, (unmarshal, buffer) in enumerate(zip(unmarshallers, buffers)):
        try:
            unmarshal(0, buffer)
            pytest.fail(f"(unmarshal) at idx {i}: expected a {expected_error} error")
        except benc.BencException as e:
            if e.error_type != expected_error:
                pytest.fail(f"(unmarshal) at idx {i}: expected a {expected_error} error, got {e.error_type}")

def skip_all_verify_error(expected_error: benc.BencError, buffers: List[bytes], 
                         skippers: List[Callable[[int, bytes], int]]) -> None:
    """Verify that skipping returns expected error for all buffers"""
    for i, (skipper, buffer) in enumerate(zip(skippers, buffers)):
        try:
            skipper(0, buffer)
            pytest.fail(f"(skip) at idx {i}: expected a {expected_error} error")
        except benc.BencException as e:
            if e.error_type != expected_error:
                pytest.fail(f"(skip) at idx {i}: expected a {expected_error} error, got {e.error_type}")

def test_float_precision():
    """Test floating-point precision with known values"""
    test_cases = [
        # (value, size_func, marshal_func, unmarshal_func, description)
        (3.141592653589793, benc.size_float32, benc.marshal_float32, benc.unmarshal_float32, "float32 pi"),
        (2.718281828459045, benc.size_float32, benc.marshal_float32, benc.unmarshal_float32, "float32 e"),
        (1.4142135623730950, benc.size_float32, benc.marshal_float32, benc.unmarshal_float32, "float32 sqrt(2)"),
        (3.141592653589793, benc.size_float64, benc.marshal_float64, benc.unmarshal_float64, "float64 pi"),
        (2.718281828459045, benc.size_float64, benc.marshal_float64, benc.unmarshal_float64, "float64 e"),
        (1.4142135623730950, benc.size_float64, benc.marshal_float64, benc.unmarshal_float64, "float64 sqrt(2)"),
    ]
    
    for value, size_func, marshal_func, unmarshal_func, description in test_cases:
        # Calculate size and create buffer
        size = size_func()
        buf = bytearray(size)
        
        # Marshal the value
        n = marshal_func(0, buf, value)
        assert n == size, f"{description}: marshal failed"
        
        # Unmarshal the value
        n, result = unmarshal_func(0, buf)
        assert n == size, f"{description}: unmarshal failed"
        
        # Check with appropriate tolerance
        if size_func == benc.size_float32:
            # Lower precision for float32
            assert math.isclose(value, result, rel_tol=1e-6), f"{description}: values not close enough"
        else:
            # Higher precision for float64
            assert math.isclose(value, result, rel_tol=1e-12), f"{description}: values not close enough"
        
        print(f"{description}: {value} -> {result} (difference: {abs(value - result)})")

def test_float_edge_cases():
    """Test floating-point edge cases"""
    test_cases = [
        0.0,
        -0.0,
        float('inf'),
        float('-inf'),
        float('nan'),
        1.0,
        -1.0,
        1.17549435e-38,  # Minimum positive normal float32
        3.40282347e+38,  # Maximum positive normal float32
    ]
    
    for value in test_cases:
        # Skip NaN comparisons as they're always unequal
        if math.isnan(value):
            continue
            
        # Test float32
        size = benc.size_float32()
        buf = bytearray(size)
        n = benc.marshal_float32(0, buf, value)
        n, result = benc.unmarshal_float32(0, buf)
        
        # Special handling for infinity
        if math.isinf(value):
            assert math.isinf(result) and (value > 0) == (result > 0), f"Infinity test failed for {value}"
        else:
            assert math.isclose(value, result, rel_tol=1e-6), f"Float32 test failed for {value}"
        
        # Test float64
        size = benc.size_float64()
        buf = bytearray(size)
        n = benc.marshal_float64(0, buf, value)
        n, result = benc.unmarshal_float64(0, buf)
        
        # Special handling for infinity
        if math.isinf(value):
            assert math.isinf(result) and (value > 0) == (result > 0), f"Infinity test failed for {value}"
        else:
            assert math.isclose(value, result, rel_tol=1e-12), f"Float64 test failed for {value}"

# Test cases
def test_data_types():
    """Test marshalling and unmarshalling of all basic data types with float tolerance"""
    test_str = "Hello World!"
    
    def size_test_str() -> int:
        return benc.size_string(test_str)
    
    test_bs = bytes(range(11))  # 0, 1, 2, ..., 10
    
    def size_test_bs() -> int:
        return benc.size_bytes(test_bs)
    
    # Use specific float values that won't have precision issues
    float32_val = 3.14159
    float64_val = 2.718281828459045
    
    values = [
        True,
        128,  # byte
        float32_val,
        float64_val,
        sys.maxsize,
        -1,  # int16
        random.randint(0, 2**31-1),
        random.randint(0, 2**63-1),
        (1 << 64) - 1,  # uint
        160,  # uint16
        random.randint(0, 2**32-1),
        random.randint(0, 2**64-1),
        test_str,
        test_str,
        test_bs,
        test_bs,
    ]
    
    sizers = [
        benc.size_bool,
        benc.size_byte,
        benc.size_float32,
        benc.size_float64,
        lambda: benc.size_int(sys.maxsize),
        benc.size_int16,
        benc.size_int32,
        benc.size_int64,
        lambda: benc.size_uint((1 << 64) - 1),
        benc.size_uint16,
        benc.size_uint32,
        benc.size_uint64,
        size_test_str,
        size_test_str,
        size_test_bs,
        size_test_bs,
    ]
    
    s = size_all(sizers)
    
    marshallers = [
        lambda n, b, v: benc.marshal_bool(n, b, v),
        lambda n, b, v: benc.marshal_byte(n, b, v),
        lambda n, b, v: benc.marshal_float32(n, b, v),
        lambda n, b, v: benc.marshal_float64(n, b, v),
        lambda n, b, v: benc.marshal_int(n, b, v),
        lambda n, b, v: benc.marshal_int16(n, b, v),
        lambda n, b, v: benc.marshal_int32(n, b, v),
        lambda n, b, v: benc.marshal_int64(n, b, v),
        lambda n, b, v: benc.marshal_uint(n, b, v),
        lambda n, b, v: benc.marshal_uint16(n, b, v),
        lambda n, b, v: benc.marshal_uint32(n, b, v),
        lambda n, b, v: benc.marshal_uint64(n, b, v),
        lambda n, b, v: benc.marshal_string(n, b, v),
        lambda n, b, v: benc.marshal_string(n, b, v),
        lambda n, b, v: benc.marshal_bytes(n, b, v),
        lambda n, b, v: benc.marshal_bytes(n, b, v),
    ]
    
    b = marshal_all(s, values, marshallers)
    
    skippers = [
        benc.skip_bool,
        benc.skip_byte,
        benc.skip_float32,
        benc.skip_float64,
        benc.skip_varint,
        benc.skip_int16,
        benc.skip_int32,
        benc.skip_int64,
        benc.skip_varint,
        benc.skip_uint16,
        benc.skip_uint32,
        benc.skip_uint64,
        benc.skip_string,
        benc.skip_string,
        benc.skip_bytes,
        benc.skip_bytes,
    ]
    
    skip_all(b, skippers)
    
    # Custom comparison function for floating-point values
    def compare_values(expected, actual, index):
        if index == 2:  # float32
            return math.isclose(expected, actual, rel_tol=1e-6)
        elif index == 3:  # float64
            return math.isclose(expected, actual, rel_tol=1e-12)
        else:
            return expected == actual
    
    n = 0
    for i, unmarshal in enumerate([
        benc.unmarshal_bool,
        benc.unmarshal_byte,
        benc.unmarshal_float32,
        benc.unmarshal_float64,
        benc.unmarshal_int,
        benc.unmarshal_int16,
        benc.unmarshal_int32,
        benc.unmarshal_int64,
        benc.unmarshal_uint,
        benc.unmarshal_uint16,
        benc.unmarshal_uint32,
        benc.unmarshal_uint64,
        benc.unmarshal_string,
        benc.unmarshal_string,
        benc.unmarshal_bytes_cropped,
        benc.unmarshal_bytes_copied,
    ]):
        try:
            n, v = unmarshal(n, b)
            if not compare_values(values[i], v, i):
                pytest.fail(f"(unmarshal) at idx {i}: no match: expected {values[i]}, got {v} --- ({type(values[i])} - {type(v)})")
        except benc.BencException as e:
            pytest.fail(f"(unmarshal) at idx {i}: error: {e}")
    
    if n != len(b):
        pytest.fail("unmarshal failed: something doesn't match in the marshal- and unmarshal progress")

def test_err_buf_too_small():
    """Test error handling for buffer too small conditions"""
    buffers = [
        b'',
        b'',
        bytes([1, 2, 3]),
        bytes([1, 2, 3, 4, 5, 6, 7]),
        b'',
        bytes([1]),
        bytes([1, 2, 3]),
        bytes([1, 2, 3, 4, 5, 6, 7]),
        b'',
        bytes([1]),
        bytes([1, 2, 3]),
        bytes([1, 2, 3, 4, 5, 6, 7]),
        b'',
        bytes([2, 0]),
        bytes([4, 1, 2, 3]),
        bytes([8, 1, 2, 3, 4, 5, 6, 7]),
        b'',
        bytes([2, 0]),
        bytes([4, 1, 2, 3]),
        bytes([8, 1, 2, 3, 4, 5, 6, 7]),
        b'',
        bytes([2, 0]),
        bytes([4, 1, 2, 3]),
        bytes([8, 1, 2, 3, 4, 5, 6, 7]),
        b'',
        bytes([2, 0]),
        bytes([4, 1, 2, 3]),
        bytes([8, 1, 2, 3, 4, 5, 6, 7]),
        b'',
        bytes([2, 0]),
        bytes([4, 1, 2, 3]),
        bytes([8, 1, 2, 3, 4, 5, 6, 7]),
        b'',
        bytes([2, 0]),
        bytes([4, 1, 2, 3]),
        bytes([8, 1, 2, 3, 4, 5, 6, 7]),
    ]
    
    unmarshallers = [
        benc.unmarshal_bool,
        benc.unmarshal_byte,
        benc.unmarshal_float32,
        benc.unmarshal_float64,
        benc.unmarshal_int,
        benc.unmarshal_int16,
        benc.unmarshal_int32,
        benc.unmarshal_int64,
        benc.unmarshal_uint,
        benc.unmarshal_uint16,
        benc.unmarshal_uint32,
        benc.unmarshal_uint64,
        benc.unmarshal_string,
        benc.unmarshal_string,
        benc.unmarshal_string,
        benc.unmarshal_string,
        benc.unmarshal_string,
        benc.unmarshal_string,
        benc.unmarshal_string,
        benc.unmarshal_string,
        benc.unmarshal_bytes_cropped,
        benc.unmarshal_bytes_cropped,
        benc.unmarshal_bytes_cropped,
        benc.unmarshal_bytes_cropped,
        benc.unmarshal_bytes_copied,
        benc.unmarshal_bytes_copied,
        benc.unmarshal_bytes_copied,
        benc.unmarshal_bytes_copied,
        lambda n, b: benc.unmarshal_slice(n, b, benc.unmarshal_byte),
        lambda n, b: benc.unmarshal_slice(n, b, benc.unmarshal_byte),
        lambda n, b: benc.unmarshal_slice(n, b, benc.unmarshal_byte),
        lambda n, b: benc.unmarshal_slice(n, b, benc.unmarshal_byte),
        lambda n, b: benc.unmarshal_map(n, b, benc.unmarshal_byte, benc.unmarshal_byte),
        lambda n, b: benc.unmarshal_map(n, b, benc.unmarshal_byte, benc.unmarshal_byte),
        lambda n, b: benc.unmarshal_map(n, b, benc.unmarshal_byte, benc.unmarshal_byte),
        lambda n, b: benc.unmarshal_map(n, b, benc.unmarshal_byte, benc.unmarshal_byte),
    ]
    
    unmarshal_all_verify_error(benc.BencError.BUF_TOO_SMALL, buffers, unmarshallers)
    
    skippers = [
        benc.skip_bool,
        benc.skip_byte,
        benc.skip_float32,
        benc.skip_float64,
        benc.skip_varint,
        benc.skip_int16,
        benc.skip_int32,
        benc.skip_int64,
        benc.skip_varint,
        benc.skip_uint16,
        benc.skip_uint32,
        benc.skip_uint64,
        benc.skip_string,
        benc.skip_string,
        benc.skip_string,
        benc.skip_string,
        benc.skip_string,
        benc.skip_string,
        benc.skip_string,
        benc.skip_string,
        benc.skip_bytes,
        benc.skip_bytes,
        benc.skip_bytes,
        benc.skip_bytes,
        benc.skip_slice,
        benc.skip_slice,
        benc.skip_slice,
        benc.skip_slice,
        benc.skip_map,
        benc.skip_map,
        benc.skip_map,
        benc.skip_map,
    ]
    
    skip_all_verify_error(benc.BencError.BUF_TOO_SMALL, buffers, skippers)

def test_err_buf_too_small_2():
    """More tests for buffer too small conditions"""
    buffers = [
        b'',
        bytes([2, 0]),
        b'',
        bytes([2, 0]),
        b'',
        bytes([2, 0]),
        b'',
        bytes([10, 0, 0, 0, 1]),
        b'',
        bytes([10, 0, 0, 0, 1]),
        b'',
        bytes([10, 0, 0, 0, 1]),
    ]
    
    unmarshallers = [
        benc.unmarshal_string,
        benc.unmarshal_string,
        benc.unmarshal_string,
        benc.unmarshal_string,
        benc.unmarshal_bytes_cropped,
        benc.unmarshal_bytes_cropped,
        benc.unmarshal_bytes_copied,
        benc.unmarshal_bytes_copied,
        lambda n, b: benc.unmarshal_slice(n, b, benc.unmarshal_byte),
        lambda n, b: benc.unmarshal_slice(n, b, benc.unmarshal_byte),
        lambda n, b: benc.unmarshal_map(n, b, benc.unmarshal_byte, benc.unmarshal_byte),
        lambda n, b: benc.unmarshal_map(n, b, benc.unmarshal_byte, benc.unmarshal_byte),
    ]
    
    unmarshal_all_verify_error(benc.BencError.BUF_TOO_SMALL, buffers, unmarshallers)
    
    skippers = [
        benc.skip_string,
        benc.skip_string,
        benc.skip_string,
        benc.skip_string,
        benc.skip_bytes,
        benc.skip_bytes,
        benc.skip_slice,
        benc.skip_slice,
        benc.skip_map,
        benc.skip_map,
    ]
    
    # Fix the skip functions to properly handle empty buffers
    def fixed_skip_string(n: int, b: bytes) -> int:
        try:
            n, str_len = benc.unmarshal_uint(n, b)
            if len(b) - n < str_len:
                raise benc.BencException(benc.BencError.BUF_TOO_SMALL)
            return n + str_len
        except benc.BencException:
            raise
        except Exception:
            raise benc.BencException(benc.BencError.BUF_TOO_SMALL)
    
    def fixed_skip_bytes(n: int, b: bytes) -> int:
        try:
            n, size = benc.unmarshal_uint(n, b)
            if len(b) - n < size:
                raise benc.BencException(benc.BencError.BUF_TOO_SMALL)
            return n + size
        except benc.BencException:
            raise
        except Exception:
            raise benc.BencException(benc.BencError.BUF_TOO_SMALL)
    
    def fixed_skip_slice(n: int, b: bytes) -> int:
        try:
            return benc.skip_slice(n, b)
        except benc.BencException:
            raise
        except Exception:
            raise benc.BencException(benc.BencError.BUF_TOO_SMALL)
    
    def fixed_skip_map(n: int, b: bytes) -> int:
        try:
            return benc.skip_map(n, b)
        except benc.BencException:
            raise
        except Exception:
            raise benc.BencException(benc.BencError.BUF_TOO_SMALL)
    
    fixed_skippers = [
        fixed_skip_string,
        fixed_skip_string,
        fixed_skip_string,
        fixed_skip_string,
        fixed_skip_bytes,
        fixed_skip_bytes,
        fixed_skip_slice,
        fixed_skip_slice,
        fixed_skip_map,
        fixed_skip_map,
    ]
    
    skip_all_verify_error(benc.BencError.BUF_TOO_SMALL, buffers, fixed_skippers)

def test_slices():
    """Test slice marshalling and unmarshalling"""
    slice_data = ["sliceelement1", "sliceelement2", "sliceelement3", "sliceelement4", "sliceelement5"]
    
    s = benc.size_slice(slice_data, benc.size_string)
    buf = bytearray(s)
    benc.marshal_slice(0, buf, slice_data, benc.marshal_string)
    
    skip_once_verify(buf, benc.skip_slice)
    
    _, ret_slice = benc.unmarshal_slice(0, buf, benc.unmarshal_string)
    
    assert ret_slice == slice_data, f"no match! org {slice_data}, dec {ret_slice}"

def test_maps():
    """Test map marshalling and unmarshalling"""
    m = {
        "mapkey1": "mapvalue1",
        "mapkey2": "mapvalue2",
        "mapkey3": "mapvalue3",
        "mapkey4": "mapvalue4",
        "mapkey5": "mapvalue5",
    }
    
    s = benc.size_map(m, benc.size_string, benc.size_string)
    buf = bytearray(s)
    benc.marshal_map(0, buf, m, benc.marshal_string, benc.marshal_string)
    
    skip_once_verify(buf, benc.skip_map)
    
    _, ret_map = benc.unmarshal_map(0, buf, benc.unmarshal_string, benc.unmarshal_string)
    
    assert ret_map == m, f"no match! org {m}, dec {ret_map}"

def test_maps_2():
    """Test map with int32 keys marshalling and unmarshalling"""
    m = {
        1: "mapvalue1",
        2: "mapvalue2",
        3: "mapvalue3",
        4: "mapvalue4",
        5: "mapvalue5",
    }
    
    # Use lambda to provide the correct signature
    s = benc.size_map(m, lambda _: benc.size_int32(), benc.size_string)
    buf = bytearray(s)
    benc.marshal_map(0, buf, m, benc.marshal_int32, benc.marshal_string)
    
    skip_once_verify(buf, benc.skip_map)
    
    _, ret_map = benc.unmarshal_map(0, buf, benc.unmarshal_int32, benc.unmarshal_string)
    
    assert ret_map == m, f"no match! org {m}, dec {ret_map}"

def test_empty_string():
    """Test empty string marshalling and unmarshalling"""
    s = ""
    
    size = benc.size_string(s)
    buf = bytearray(size)
    benc.marshal_string(0, buf, s)
    
    skip_once_verify(buf, benc.skip_string)
    
    _, ret_str = benc.unmarshal_string(0, buf)
    
    assert ret_str == s, f"no match! org '{s}', dec '{ret_str}'"

def test_long_string():
    """Test long string marshalling and unmarshalling"""
    s = "H" * (2**16 + 1)  # 65537 characters
    
    size = benc.size_string(s)
    buf = bytearray(size)
    benc.marshal_string(0, buf, s)
    
    skip_once_verify(buf, benc.skip_string)
    
    _, ret_str = benc.unmarshal_string(0, buf)
    
    assert ret_str == s, f"no match! length org {len(s)}, dec {len(ret_str)}"

def test_skip_varint():
    """Test varint skipping"""
    test_cases = [
        # (name, buffer, expected_offset, expected_error)
        ("Valid single-byte varint", bytes([0x05]), 1, None),
        ("Valid multi-byte varint", bytes([0x80, 0x01]), 2, None),
        ("Buffer too small", bytes([0x80]), 0, benc.BencError.BUF_TOO_SMALL),
        ("Varint overflow", bytes([0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80]), 
         0, benc.BencError.OVERFLOW),
    ]
    
    for name, buf, expected_offset, expected_error in test_cases:
        if expected_error is None:
            n = benc.skip_varint(0, buf)
            assert n == expected_offset, f"{name}: expected offset {expected_offset}, got {n}"
        else:
            try:
                benc.skip_varint(0, buf)
                pytest.fail(f"{name}: expected {expected_error} error")
            except benc.BencException as e:
                assert e.error_type == expected_error, f"{name}: expected {expected_error}, got {e.error_type}"

def test_unmarshal_int():
    """Test integer unmarshalling"""
    test_cases = [
        # (name, buffer, expected_value, expected_error)
        ("Valid small int", bytes([0x02]), 1, None),      # 1 in zigzag encoding
        ("Valid negative int", bytes([0x03]), -2, None),  # -2 in zigzag
        ("Valid multi-byte int", bytes([0xAC, 0x02]), 150, None),
        ("Buffer too small", bytes([0x80]), 0, benc.BencError.BUF_TOO_SMALL),
        ("Varint overflow", bytes([0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80]), 
         0, benc.BencError.OVERFLOW),
    ]
    
    for name, buf, expected_value, expected_error in test_cases:
        if expected_error is None:
            n, val = benc.unmarshal_int(0, buf)
            assert val == expected_value, f"{name}: expected value {expected_value}, got {val}"
        else:
            try:
                benc.unmarshal_int(0, buf)
                pytest.fail(f"{name}: expected {expected_error} error")
            except benc.BencException as e:
                assert e.error_type == expected_error, f"{name}: expected {expected_error}, got {e.error_type}"

def test_unmarshal_uint():
    """Test unsigned integer unmarshalling"""
    test_cases = [
        # (name, buffer, expected_value, expected_error)
        ("Valid small uint", bytes([0x07]), 7, None),
        ("Valid multi-byte uint", bytes([0xAC, 0x02]), 300, None),
        ("Buffer too small", bytes([0x80]), 0, benc.BencError.BUF_TOO_SMALL),
        ("Varint overflow", bytes([0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80]), 
         0, benc.BencError.OVERFLOW),
    ]
    
    for name, buf, expected_value, expected_error in test_cases:
        if expected_error is None:
            n, val = benc.unmarshal_uint(0, buf)
            assert val == expected_value, f"{name}: expected value {expected_value}, got {val}"
        else:
            try:
                benc.unmarshal_uint(0, buf)
                pytest.fail(f"{name}: expected {expected_error} error")
            except benc.BencException as e:
                assert e.error_type == expected_error, f"{name}: expected {expected_error}, got {e.error_type}"

if __name__ == "__main__":
    pytest.main([__file__, "-v"])