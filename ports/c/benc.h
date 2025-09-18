/*
 bstd.h - v2.0 - public domain - 2025
 Single-header C17 binary serialization library, a complete port of the Go `bstd` package.

 USAGE:
 This is a single-header library. To use it, do this in *one* C or C++ file:
     #define BSTD_IMPLEMENTATION
     #include "benc.h"

 In all other files where you need the library, just include it normally:
     #include "benc.h"

 FEATURES:
 - Complete 1:1 port of the original Go library's functionality.
 - Marshal/unmarshal for primitives (integers, floats, bools), strings, and raw bytes.
 - Variable-length integer encoding (ZigZag for signed types).
 - Generic support for slices, maps, and pointers via function pointers.
 - Focus on safety with explicit buffer size checks and clear error codes.
 - Offers both zero-copy "_view" and memory-allocating "_alloc" functions.
 - All multi-byte values are encoded as little-endian, matching the Go implementation.

 LICENSE:
 This software is in the public domain. Where that dedication is not
 recognized, you are granted a perpetual, irrevocable license to copy,
 distribute, and modify this file as you see fit.
*/

#ifndef BSTD_H
#define BSTD_H

#include <stddef.h>
#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

//-///////////////////////////////////////////////////////////////////////////
// Core Types and Status Codes
//-///////////////////////////////////////////////////////////////////////////

/**
 * @brief Represents the status of a bstd operation.
 */
typedef enum {
    BSTD_OK = 0,               // Operation was successful
    BSTD_ERR_BUF_TOO_SMALL,    // The provided buffer is too small for the operation
    BSTD_ERR_OVERFLOW,         // A variable-length integer is malformed or exceeds its limits
    BSTD_ERR_INVALID_ARGUMENT, // A function pointer or other required argument was NULL
    BSTD_ERR_MALLOC_FAILED,    // Memory allocation failed
} bstd_status;

/**
 * @brief Represents a non-null-terminated string view.
 * The `data` pointer is a view into another buffer and is not owned.
 */
typedef struct {
    const char* data;
    size_t len;
} bstd_string_view;


//-///////////////////////////////////////////////////////////////////////////
// Generic Function Pointers for Slices, Maps, and Pointers
//-///////////////////////////////////////////////////////////////////////////

typedef bstd_status (*bstd_skip_fn)(const uint8_t* buf, size_t buf_len, size_t* offset);
typedef size_t (*bstd_size_fn)(const void* element);
typedef bstd_status (*bstd_marshal_fn)(uint8_t* buf, size_t buf_len, size_t* offset, const void* element);
typedef bstd_status (*bstd_unmarshal_fn)(const uint8_t* buf, size_t buf_len, size_t* offset, void* out_element);
typedef void (*bstd_free_fn)(void* element);


//-///////////////////////////////////////////////////////////////////////////
// API Functions (Declarations)
//-///////////////////////////////////////////////////////////////////////////

// --- Bool ---
size_t bstd_size_bool(void);
bstd_status bstd_skip_bool(const uint8_t* buf, size_t buf_len, size_t* offset);
bstd_status bstd_marshal_bool(uint8_t* buf, size_t buf_len, size_t* offset, bool value);
bstd_status bstd_unmarshal_bool(const uint8_t* buf, size_t buf_len, size_t* offset, bool* out_value);

// --- Byte (alias for uint8) ---
size_t bstd_size_byte(void);
bstd_status bstd_skip_byte(const uint8_t* buf, size_t buf_len, size_t* offset);
bstd_status bstd_marshal_byte(uint8_t* buf, size_t buf_len, size_t* offset, uint8_t value);
bstd_status bstd_unmarshal_byte(const uint8_t* buf, size_t buf_len, size_t* offset, uint8_t* out_value);

// --- Bytes ---
size_t bstd_size_bytes(const uint8_t* bytes, size_t len);
bstd_status bstd_skip_bytes(const uint8_t* buf, size_t buf_len, size_t* offset);
bstd_status bstd_marshal_bytes(uint8_t* buf, size_t buf_len, size_t* offset, const uint8_t* bytes, size_t len);
bstd_status bstd_unmarshal_bytes_view(const uint8_t* buf, size_t buf_len, size_t* offset, const uint8_t** out_bytes, size_t* out_len);
bstd_status bstd_unmarshal_bytes_alloc(const uint8_t* buf, size_t buf_len, size_t* offset, uint8_t** out_bytes, size_t* out_len);

// --- Float32 / Float64 ---
size_t bstd_size_float32(void);
bstd_status bstd_skip_float32(const uint8_t* buf, size_t buf_len, size_t* offset);
bstd_status bstd_marshal_float32(uint8_t* buf, size_t buf_len, size_t* offset, float value);
bstd_status bstd_unmarshal_float32(const uint8_t* buf, size_t buf_len, size_t* offset, float* out_value);

size_t bstd_size_float64(void);
bstd_status bstd_skip_float64(const uint8_t* buf, size_t buf_len, size_t* offset);
bstd_status bstd_marshal_float64(uint8_t* buf, size_t buf_len, size_t* offset, double value);
bstd_status bstd_unmarshal_float64(const uint8_t* buf, size_t buf_len, size_t* offset, double* out_value);

// --- Signed Integers (Fixed Size) ---
size_t bstd_size_int8(void);
bstd_status bstd_skip_int8(const uint8_t* buf, size_t buf_len, size_t* offset);
bstd_status bstd_marshal_int8(uint8_t* buf, size_t buf_len, size_t* offset, int8_t value);
bstd_status bstd_unmarshal_int8(const uint8_t* buf, size_t buf_len, size_t* offset, int8_t* out_value);

size_t bstd_size_int16(void);
bstd_status bstd_skip_int16(const uint8_t* buf, size_t buf_len, size_t* offset);
bstd_status bstd_marshal_int16(uint8_t* buf, size_t buf_len, size_t* offset, int16_t value);
bstd_status bstd_unmarshal_int16(const uint8_t* buf, size_t buf_len, size_t* offset, int16_t* out_value);

size_t bstd_size_int32(void);
bstd_status bstd_skip_int32(const uint8_t* buf, size_t buf_len, size_t* offset);
bstd_status bstd_marshal_int32(uint8_t* buf, size_t buf_len, size_t* offset, int32_t value);
bstd_status bstd_unmarshal_int32(const uint8_t* buf, size_t buf_len, size_t* offset, int32_t* out_value);

size_t bstd_size_int64(void);
bstd_status bstd_skip_int64(const uint8_t* buf, size_t buf_len, size_t* offset);
bstd_status bstd_marshal_int64(uint8_t* buf, size_t buf_len, size_t* offset, int64_t value);
bstd_status bstd_unmarshal_int64(const uint8_t* buf, size_t buf_len, size_t* offset, int64_t* out_value);

// --- Signed Integer (Varint) ---
size_t bstd_size_int(intptr_t value);
bstd_status bstd_marshal_int(uint8_t* buf, size_t buf_len, size_t* offset, intptr_t value);
bstd_status bstd_unmarshal_int(const uint8_t* buf, size_t buf_len, size_t* offset, intptr_t* out_value);

// --- Map ---
bstd_status bstd_skip_map(const uint8_t* buf, size_t buf_len, size_t* offset, bstd_skip_fn key_skipper, bstd_skip_fn value_skipper);
size_t bstd_size_map(const void* keys, const void* values, size_t count, size_t key_stride, size_t value_stride, bstd_size_fn key_sizer, bstd_size_fn value_sizer);
bstd_status bstd_marshal_map(uint8_t* buf, size_t buf_len, size_t* offset, const void* keys, const void* values, size_t count, size_t key_stride, size_t value_stride, bstd_marshal_fn key_marshaler, bstd_marshal_fn value_marshaler);
bstd_status bstd_unmarshal_map_alloc(const uint8_t* buf, size_t buf_len, size_t* offset, void** out_keys, void** out_values, size_t* out_count, size_t key_size, size_t value_size, bstd_unmarshal_fn key_unmarshaler, bstd_unmarshal_fn value_unmarshaler);
void bstd_free_map(void* keys, void* values, size_t count, size_t key_size, size_t value_size, bstd_free_fn key_freer, bstd_free_fn value_freer);


// --- Pointer ---
size_t bstd_size_pointer(const void* ptr, bstd_size_fn element_sizer);
bstd_status bstd_skip_pointer(const uint8_t* buf, size_t buf_len, size_t* offset, bstd_skip_fn element_skipper);
bstd_status bstd_marshal_pointer(uint8_t* buf, size_t buf_len, size_t* offset, const void* ptr, bstd_marshal_fn element_marshaler);
bstd_status bstd_unmarshal_pointer_alloc(const uint8_t* buf, size_t buf_len, size_t* offset, void** out_ptr, size_t element_size, bstd_unmarshal_fn element_unmarshaler);
void bstd_free_pointer(void* ptr, bstd_free_fn element_freer);


// --- Slice ---
size_t bstd_size_slice(const void* slice, size_t count, size_t element_stride, bstd_size_fn element_sizer);
size_t bstd_size_fixed_slice(size_t count, size_t fixed_element_size);
bstd_status bstd_skip_slice(const uint8_t* buf, size_t buf_len, size_t* offset, bstd_skip_fn element_skipper);
bstd_status bstd_marshal_slice(uint8_t* buf, size_t buf_len, size_t* offset, const void* slice, size_t count, size_t element_stride, bstd_marshal_fn element_marshaler);
bstd_status bstd_unmarshal_slice_alloc(const uint8_t* buf, size_t buf_len, size_t* offset, void** out_slice, size_t* out_count, size_t element_size, bstd_unmarshal_fn element_unmarshaler);
void bstd_free_slice(void* slice, size_t count, size_t element_stride, bstd_free_fn element_freer);

// --- String ---
size_t bstd_size_string(const char* str, size_t len);
bstd_status bstd_skip_string(const uint8_t* buf, size_t buf_len, size_t* offset);
bstd_status bstd_marshal_string(uint8_t* buf, size_t buf_len, size_t* offset, const char* str, size_t len);
bstd_status bstd_unmarshal_string_view(const uint8_t* buf, size_t buf_len, size_t* offset, bstd_string_view* out_view);
bstd_status bstd_unmarshal_string_alloc(const uint8_t* buf, size_t buf_len, size_t* offset, char** out_str);

// --- Time (as Unix nanoseconds) ---
size_t bstd_size_time(void);
bstd_status bstd_skip_time(const uint8_t* buf, size_t buf_len, size_t* offset);
bstd_status bstd_marshal_time(uint8_t* buf, size_t buf_len, size_t* offset, int64_t unix_nano);
bstd_status bstd_unmarshal_time(const uint8_t* buf, size_t buf_len, size_t* offset, int64_t* out_unix_nano);


// --- Unsigned Integers (Fixed Size) ---
size_t bstd_size_uint8(void);
bstd_status bstd_skip_uint8(const uint8_t* buf, size_t buf_len, size_t* offset);
bstd_status bstd_marshal_uint8(uint8_t* buf, size_t buf_len, size_t* offset, uint8_t value);
bstd_status bstd_unmarshal_uint8(const uint8_t* buf, size_t buf_len, size_t* offset, uint8_t* out_value);

size_t bstd_size_uint16(void);
bstd_status bstd_skip_uint16(const uint8_t* buf, size_t buf_len, size_t* offset);
bstd_status bstd_marshal_uint16(uint8_t* buf, size_t buf_len, size_t* offset, uint16_t value);
bstd_status bstd_unmarshal_uint16(const uint8_t* buf, size_t buf_len, size_t* offset, uint16_t* out_value);

size_t bstd_size_uint32(void);
bstd_status bstd_skip_uint32(const uint8_t* buf, size_t buf_len, size_t* offset);
bstd_status bstd_marshal_uint32(uint8_t* buf, size_t buf_len, size_t* offset, uint32_t value);
bstd_status bstd_unmarshal_uint32(const uint8_t* buf, size_t buf_len, size_t* offset, uint32_t* out_value);

size_t bstd_size_uint64(void);
bstd_status bstd_skip_uint64(const uint8_t* buf, size_t buf_len, size_t* offset);
bstd_status bstd_marshal_uint64(uint8_t* buf, size_t buf_len, size_t* offset, uint64_t value);
bstd_status bstd_unmarshal_uint64(const uint8_t* buf, size_t buf_len, size_t* offset, uint64_t* out_value);

// --- Unsigned Integer (Varint) ---
size_t bstd_size_uint(uintptr_t value);
bstd_status bstd_skip_varint(const uint8_t* buf, size_t buf_len, size_t* offset);
bstd_status bstd_marshal_uint(uint8_t* buf, size_t buf_len, size_t* offset, uintptr_t value);
bstd_status bstd_unmarshal_uint(const uint8_t* buf, size_t buf_len, size_t* offset, uintptr_t* out_value);

#ifdef __cplusplus
}
#endif

#endif // BSTD_H

#ifdef BSTD_IMPLEMENTATION

#include <string.h> // For memcpy, memcmp
#include <stdlib.h> // For malloc, free

//-///////////////////////////////////////////////////////////////////////////
// Compile-time constants and assertions
//-///////////////////////////////////////////////////////////////////////////

#if INTPTR_MAX == INT32_MAX
    #define MAX_VARINT_LEN 5 // Corresponds to Go's MaxVarintLen32
#elif INTPTR_MAX == INT64_MAX
    #define MAX_VARINT_LEN 10 // Corresponds to Go's MaxVarintLen64
#else
    #error "bstd.h: Unsupported pointer size. Only 32-bit and 64-bit architectures are supported."
#endif

// The terminator sequence used for slices and maps in the original Go code.
static const uint8_t TERMINATOR[] = {1, 1, 1, 1};
#define TERMINATOR_SIZE sizeof(TERMINATOR)


//-///////////////////////////////////////////////////////////////////////////
// Internal Helper Functions
//-///////////////////////////////////////////////////////////////////////////

static inline uintptr_t encode_zigzag(intptr_t v) {
    // Note: Cast to uintptr_t before bitwise operations to ensure logical right shift.
    return (uintptr_t)((v << 1) ^ (v >> (sizeof(intptr_t) * 8 - 1)));
}

static inline intptr_t decode_zigzag(uintptr_t v) {
    return (intptr_t)((v >> 1) ^ -(intptr_t)(v & 1));
}


//-///////////////////////////////////////////////////////////////////////////
// Varint Implementation (Internal)
//-///////////////////////////////////////////////////////////////////////////

size_t bstd_size_uint(uintptr_t v) {
    size_t i = 1;
    while (v >= 0x80) {
        v >>= 7;
        i++;
    }
    return i;
}

bstd_status bstd_marshal_uint(uint8_t* buf, size_t buf_len, size_t* offset, uintptr_t v) {
    size_t initial_offset = *offset;
    while (v >= 0x80) {
        if (*offset >= buf_len) {
            *offset = initial_offset; // Revert on error
            return BSTD_ERR_BUF_TOO_SMALL;
        }
        buf[(*offset)++] = (uint8_t)(v) | 0x80;
        v >>= 7;
    }
    if (*offset >= buf_len) {
        *offset = initial_offset; // Revert on error
        return BSTD_ERR_BUF_TOO_SMALL;
    }
    buf[(*offset)++] = (uint8_t)(v);
    return BSTD_OK;
}

bstd_status bstd_unmarshal_uint(const uint8_t* buf, size_t buf_len, size_t* offset, uintptr_t* out_value) {
    uintptr_t x = 0;
    uintptr_t s = 0;
    size_t i = 0;
    size_t initial_offset = *offset;

    while (i < MAX_VARINT_LEN) {
        if (*offset >= buf_len) {
            *offset = initial_offset;
            return BSTD_ERR_BUF_TOO_SMALL;
        }
        uint8_t b = buf[(*offset)++];
        if (b < 0x80) {
            if (i == MAX_VARINT_LEN - 1 && b > 1) {
                *offset = initial_offset;
                return BSTD_ERR_OVERFLOW;
            }
            *out_value = x | (uintptr_t)b << s;
            return BSTD_OK;
        }
        x |= (uintptr_t)(b & 0x7f) << s;
        s += 7;
        i++;
    }
    *offset = initial_offset;
    return BSTD_ERR_OVERFLOW;
}

bstd_status bstd_skip_varint(const uint8_t* buf, size_t buf_len, size_t* offset) {
    size_t initial_offset = *offset;
    for (size_t i = 0; i < MAX_VARINT_LEN; ++i) {
        if (*offset >= buf_len) {
            *offset = initial_offset;
            return BSTD_ERR_BUF_TOO_SMALL;
        }
        if (buf[(*offset)++] < 0x80) {
            return BSTD_OK;
        }
    }
    *offset = initial_offset;
    return BSTD_ERR_OVERFLOW;
}


//-///////////////////////////////////////////////////////////////////////////
// API Function Implementations
//-///////////////////////////////////////////////////////////////////////////

// --- Bool ---
size_t bstd_size_bool(void) { return 1; }

bstd_status bstd_skip_bool(const uint8_t* buf, size_t buf_len, size_t* offset) {
    (void)buf;
    if (buf_len < *offset + 1) return BSTD_ERR_BUF_TOO_SMALL;
    (*offset)++;
    return BSTD_OK;
}

bstd_status bstd_marshal_bool(uint8_t* buf, size_t buf_len, size_t* offset, bool value) {
    if (buf_len < *offset + 1) return BSTD_ERR_BUF_TOO_SMALL;
    buf[(*offset)++] = (uint8_t)(value ? 1 : 0);
    return BSTD_OK;
}

bstd_status bstd_unmarshal_bool(const uint8_t* buf, size_t buf_len, size_t* offset, bool* out_value) {
    if (buf_len < *offset + 1) return BSTD_ERR_BUF_TOO_SMALL;
    *out_value = (buf[(*offset)++] == 1);
    return BSTD_OK;
}

// --- Byte (alias for uint8) ---
size_t bstd_size_byte(void) { return bstd_size_uint8(); }
bstd_status bstd_skip_byte(const uint8_t* buf, size_t buf_len, size_t* offset) { return bstd_skip_uint8(buf, buf_len, offset); }
bstd_status bstd_marshal_byte(uint8_t* buf, size_t buf_len, size_t* offset, uint8_t value) { return bstd_marshal_uint8(buf, buf_len, offset, value); }
bstd_status bstd_unmarshal_byte(const uint8_t* buf, size_t buf_len, size_t* offset, uint8_t* out_value) { return bstd_unmarshal_uint8(buf, buf_len, offset, out_value); }


// --- Bytes ---
size_t bstd_size_bytes(const uint8_t* bytes, size_t len) {
    (void)bytes; // Unused parameter
    return bstd_size_uint((uintptr_t)len) + len;
}

bstd_status bstd_skip_bytes(const uint8_t* buf, size_t buf_len, size_t* offset) {
    size_t initial_offset = *offset;
    uintptr_t len;
    bstd_status status = bstd_unmarshal_uint(buf, buf_len, offset, &len);
    if (status != BSTD_OK) return status;

    if (buf_len < *offset + (size_t)len) {
        *offset = initial_offset;
        return BSTD_ERR_BUF_TOO_SMALL;
    }
    *offset += (size_t)len;
    return BSTD_OK;
}

bstd_status bstd_marshal_bytes(uint8_t* buf, size_t buf_len, size_t* offset, const uint8_t* bytes, size_t len) {
    size_t initial_offset = *offset;
    bstd_status status = bstd_marshal_uint(buf, buf_len, offset, (uintptr_t)len);
    if (status != BSTD_OK) return status;

    if (buf_len < *offset + len) {
        *offset = initial_offset;
        return BSTD_ERR_BUF_TOO_SMALL;
    }
    memcpy(buf + *offset, bytes, len);
    *offset += len;
    return BSTD_OK;
}

bstd_status bstd_unmarshal_bytes_view(const uint8_t* buf, size_t buf_len, size_t* offset, const uint8_t** out_bytes, size_t* out_len) {
    size_t initial_offset = *offset;
    uintptr_t len;
    bstd_status status = bstd_unmarshal_uint(buf, buf_len, offset, &len);
    if (status != BSTD_OK) return status;

    if (buf_len < *offset + (size_t)len) {
        *offset = initial_offset;
        return BSTD_ERR_BUF_TOO_SMALL;
    }
    *out_len = (size_t)len;
    *out_bytes = buf + *offset;
    *offset += (size_t)len;
    return BSTD_OK;
}

bstd_status bstd_unmarshal_bytes_alloc(const uint8_t* buf, size_t buf_len, size_t* offset, uint8_t** out_bytes, size_t* out_len) {
    const uint8_t* view_ptr;
    size_t view_len;
    bstd_status status = bstd_unmarshal_bytes_view(buf, buf_len, offset, &view_ptr, &view_len);
    if (status != BSTD_OK) return status;

    if (view_len == 0) {
        *out_bytes = NULL;
        *out_len = 0;
        return BSTD_OK;
    }

    uint8_t* new_buf = (uint8_t*)malloc(view_len);
    if (!new_buf) return BSTD_ERR_MALLOC_FAILED;

    memcpy(new_buf, view_ptr, view_len);
    *out_bytes = new_buf;
    *out_len = view_len;
    return BSTD_OK;
}

// --- String ---
size_t bstd_size_string(const char* str, size_t len) {
    (void)str;
    return bstd_size_uint((uintptr_t)len) + len;
}

bstd_status bstd_skip_string(const uint8_t* buf, size_t buf_len, size_t* offset) {
    return bstd_skip_bytes(buf, buf_len, offset);
}

bstd_status bstd_marshal_string(uint8_t* buf, size_t buf_len, size_t* offset, const char* str, size_t len) {
    return bstd_marshal_bytes(buf, buf_len, offset, (const uint8_t*)str, len);
}

bstd_status bstd_unmarshal_string_view(const uint8_t* buf, size_t buf_len, size_t* offset, bstd_string_view* out_view) {
    return bstd_unmarshal_bytes_view(buf, buf_len, offset, (const uint8_t**)&out_view->data, &out_view->len);
}

bstd_status bstd_unmarshal_string_alloc(const uint8_t* buf, size_t buf_len, size_t* offset, char** out_str) {
    bstd_string_view view;
    bstd_status status = bstd_unmarshal_string_view(buf, buf_len, offset, &view);
    if (status != BSTD_OK) return status;

    char* new_str = (char*)malloc(view.len + 1);
    if (!new_str) return BSTD_ERR_MALLOC_FAILED;

    memcpy(new_str, view.data, view.len);
    new_str[view.len] = '\0';
    *out_str = new_str;
    return BSTD_OK;
}

// --- Signed Integer (Varint) ---
size_t bstd_size_int(intptr_t value) {
    return bstd_size_uint(encode_zigzag(value));
}

bstd_status bstd_marshal_int(uint8_t* buf, size_t buf_len, size_t* offset, intptr_t value) {
    return bstd_marshal_uint(buf, buf_len, offset, encode_zigzag(value));
}

bstd_status bstd_unmarshal_int(const uint8_t* buf, size_t buf_len, size_t* offset, intptr_t* out_value) {
    uintptr_t u_val;
    bstd_status status = bstd_unmarshal_uint(buf, buf_len, offset, &u_val);
    if (status == BSTD_OK) {
        *out_value = decode_zigzag(u_val);
    }
    return status;
}

// --- Time ---
size_t bstd_size_time(void) { return 8; }
bstd_status bstd_skip_time(const uint8_t* buf, size_t buf_len, size_t* offset) { return bstd_skip_int64(buf, buf_len, offset); }
bstd_status bstd_marshal_time(uint8_t* buf, size_t buf_len, size_t* offset, int64_t unix_nano) {
    return bstd_marshal_int64(buf, buf_len, offset, unix_nano);
}
bstd_status bstd_unmarshal_time(const uint8_t* buf, size_t buf_len, size_t* offset, int64_t* out_unix_nano) {
    return bstd_unmarshal_int64(buf, buf_len, offset, out_unix_nano);
}

// --- Slice ---
bstd_status bstd_skip_slice(const uint8_t* buf, size_t buf_len, size_t* offset, bstd_skip_fn element_skipper) {
    if (!element_skipper) return BSTD_ERR_INVALID_ARGUMENT;

    size_t initial_offset = *offset;
    uintptr_t count_u;
    bstd_status status = bstd_unmarshal_uint(buf, buf_len, offset, &count_u);
    if (status != BSTD_OK) return status;

    for (uintptr_t i = 0; i < count_u; ++i) {
        status = element_skipper(buf, buf_len, offset);
        if (status != BSTD_OK) {
            *offset = initial_offset;
            return status;
        }
    }

    if (buf_len < *offset + TERMINATOR_SIZE) {
        *offset = initial_offset;
        return BSTD_ERR_BUF_TOO_SMALL;
    }
    *offset += TERMINATOR_SIZE;
    return BSTD_OK;
}

size_t bstd_size_slice(const void* slice, size_t count, size_t element_stride, bstd_size_fn element_sizer) {
    if (!element_sizer) return 0;
    size_t s = bstd_size_uint((uintptr_t)count) + TERMINATOR_SIZE;
    for (size_t i = 0; i < count; ++i) {
        s += element_sizer((const uint8_t*)slice + i * element_stride);
    }
    return s;
}

size_t bstd_size_fixed_slice(size_t count, size_t fixed_element_size) {
    return bstd_size_uint((uintptr_t)count) + (count * fixed_element_size) + TERMINATOR_SIZE;
}

bstd_status bstd_marshal_slice(uint8_t* buf, size_t buf_len, size_t* offset, const void* slice, size_t count, size_t element_stride, bstd_marshal_fn element_marshaler) {
    if (!element_marshaler) return BSTD_ERR_INVALID_ARGUMENT;

    size_t initial_offset = *offset;
    bstd_status status = bstd_marshal_uint(buf, buf_len, offset, (uintptr_t)count);
    if (status != BSTD_OK) return status;

    for (size_t i = 0; i < count; ++i) {
        const void* element = (const uint8_t*)slice + i * element_stride;
        status = element_marshaler(buf, buf_len, offset, element);
        if (status != BSTD_OK) {
            *offset = initial_offset;
            return status;
        }
    }

    if (buf_len < *offset + TERMINATOR_SIZE) {
        *offset = initial_offset;
        return BSTD_ERR_BUF_TOO_SMALL;
    }
    memcpy(buf + *offset, TERMINATOR, TERMINATOR_SIZE);
    *offset += TERMINATOR_SIZE;
    return BSTD_OK;
}

bstd_status bstd_unmarshal_slice_alloc(const uint8_t* buf, size_t buf_len, size_t* offset, void** out_slice, size_t* out_count, size_t element_size, bstd_unmarshal_fn element_unmarshaler) {
    if (!out_slice || !out_count || !element_unmarshaler) return BSTD_ERR_INVALID_ARGUMENT;

    size_t initial_offset = *offset;
    uintptr_t count_u;
    bstd_status status = bstd_unmarshal_uint(buf, buf_len, offset, &count_u);
    if (status != BSTD_OK) return status;
    size_t count = (size_t)count_u;

    void* slice = NULL;
    if (count > 0) {
        slice = malloc(count * element_size);
        if (!slice) {
            *offset = initial_offset;
            return BSTD_ERR_MALLOC_FAILED;
        }
    }

    for (size_t i = 0; i < count; ++i) {
        void* element = (uint8_t*)slice + i * element_size;
        status = element_unmarshaler(buf, buf_len, offset, element);
        if (status != BSTD_OK) {
            free(slice);
            *offset = initial_offset;
            return status;
        }
    }

    if (buf_len < *offset + TERMINATOR_SIZE) {
        free(slice);
        *offset = initial_offset;
        return BSTD_ERR_BUF_TOO_SMALL;
    }
    // Final check for terminator sequence can be done here if desired, but the
    // Go implementation just skips it.
    *offset += TERMINATOR_SIZE;

    *out_slice = slice;
    *out_count = count;
    return BSTD_OK;
}

void bstd_free_slice(void* slice, size_t count, size_t element_stride, bstd_free_fn element_freer) {
    if (!slice) return;
    if (element_freer) {
        for (size_t i = 0; i < count; ++i) {
            element_freer((uint8_t*)slice + i * element_stride);
        }
    }
    free(slice);
}

// --- Map ---
bstd_status bstd_skip_map(const uint8_t* buf, size_t buf_len, size_t* offset, bstd_skip_fn key_skipper, bstd_skip_fn value_skipper) {
    if (!key_skipper || !value_skipper) return BSTD_ERR_INVALID_ARGUMENT;

    size_t initial_offset = *offset;
    uintptr_t count_u;
    bstd_status status = bstd_unmarshal_uint(buf, buf_len, offset, &count_u);
    if (status != BSTD_OK) return status;

    for (uintptr_t i = 0; i < count_u; ++i) {
        status = key_skipper(buf, buf_len, offset);
        if (status != BSTD_OK) {
            *offset = initial_offset;
            return status;
        }
        status = value_skipper(buf, buf_len, offset);
        if (status != BSTD_OK) {
            *offset = initial_offset;
            return status;
        }
    }

    if (buf_len < *offset + TERMINATOR_SIZE) {
        *offset = initial_offset;
        return BSTD_ERR_BUF_TOO_SMALL;
    }
    *offset += TERMINATOR_SIZE;
    return BSTD_OK;
}

size_t bstd_size_map(const void* keys, const void* values, size_t count, size_t key_stride, size_t value_stride, bstd_size_fn key_sizer, bstd_size_fn value_sizer) {
    if (!key_sizer || !value_sizer) return 0;
    size_t s = bstd_size_uint((uintptr_t)count) + TERMINATOR_SIZE;
    for (size_t i = 0; i < count; ++i) {
        s += key_sizer((const uint8_t*)keys + i * key_stride);
        s += value_sizer((const uint8_t*)values + i * value_stride);
    }
    return s;
}

bstd_status bstd_marshal_map(uint8_t* buf, size_t buf_len, size_t* offset, const void* keys, const void* values, size_t count, size_t key_stride, size_t value_stride, bstd_marshal_fn key_marshaler, bstd_marshal_fn value_marshaler) {
    if (!key_marshaler || !value_marshaler) return BSTD_ERR_INVALID_ARGUMENT;

    size_t initial_offset = *offset;
    bstd_status status = bstd_marshal_uint(buf, buf_len, offset, (uintptr_t)count);
    if (status != BSTD_OK) return status;

    for (size_t i = 0; i < count; ++i) {
        const void* key = (const uint8_t*)keys + i * key_stride;
        status = key_marshaler(buf, buf_len, offset, key);
        if (status != BSTD_OK) {
            *offset = initial_offset;
            return status;
        }
        const void* value = (const uint8_t*)values + i * value_stride;
        status = value_marshaler(buf, buf_len, offset, value);
        if (status != BSTD_OK) {
            *offset = initial_offset;
            return status;
        }
    }

    if (buf_len < *offset + TERMINATOR_SIZE) {
        *offset = initial_offset;
        return BSTD_ERR_BUF_TOO_SMALL;
    }
    memcpy(buf + *offset, TERMINATOR, TERMINATOR_SIZE);
    *offset += TERMINATOR_SIZE;
    return BSTD_OK;
}

bstd_status bstd_unmarshal_map_alloc(const uint8_t* buf, size_t buf_len, size_t* offset, void** out_keys, void** out_values, size_t* out_count, size_t key_size, size_t value_size, bstd_unmarshal_fn key_unmarshaler, bstd_unmarshal_fn value_unmarshaler) {
    if (!out_keys || !out_values || !out_count || !key_unmarshaler || !value_unmarshaler) return BSTD_ERR_INVALID_ARGUMENT;

    size_t initial_offset = *offset;
    uintptr_t count_u;
    bstd_status status = bstd_unmarshal_uint(buf, buf_len, offset, &count_u);
    if (status != BSTD_OK) return status;
    size_t count = (size_t)count_u;

    void* keys = NULL;
    void* values = NULL;

    if (count > 0) {
        keys = malloc(count * key_size);
        if (!keys) { *offset = initial_offset; return BSTD_ERR_MALLOC_FAILED; }
        values = malloc(count * value_size);
        if (!values) { free(keys); *offset = initial_offset; return BSTD_ERR_MALLOC_FAILED; }
    }

    for (size_t i = 0; i < count; ++i) {
        void* key = (uint8_t*)keys + i * key_size;
        status = key_unmarshaler(buf, buf_len, offset, key);
        if (status != BSTD_OK) {
            bstd_free_map(keys, values, i, key_size, value_size, NULL, NULL); // Free what was allocated so far
            *offset = initial_offset;
            return status;
        }
        void* value = (uint8_t*)values + i * value_size;
        status = value_unmarshaler(buf, buf_len, offset, value);
        if (status != BSTD_OK) {
            bstd_free_map(keys, values, i + 1, key_size, value_size, NULL, NULL); // Free keys and partially filled values
            *offset = initial_offset;
            return status;
        }
    }

    if (buf_len < *offset + TERMINATOR_SIZE) {
        bstd_free_map(keys, values, count, key_size, value_size, NULL, NULL);
        *offset = initial_offset;
        return BSTD_ERR_BUF_TOO_SMALL;
    }
    *offset += TERMINATOR_SIZE;

    *out_keys = keys;
    *out_values = values;
    *out_count = count;
    return BSTD_OK;
}

void bstd_free_map(void* keys, void* values, size_t count, size_t key_size, size_t value_size, bstd_free_fn key_freer, bstd_free_fn value_freer) {
    if (keys && key_freer) {
        for (size_t i = 0; i < count; ++i) key_freer((uint8_t*)keys + i * key_size);
    }
    if (values && value_freer) {
        for (size_t i = 0; i < count; ++i) value_freer((uint8_t*)values + i * value_size);
    }
    free(keys);
    free(values);
}

// --- Pointer ---
bstd_status bstd_skip_pointer(const uint8_t* buf, size_t buf_len, size_t* offset, bstd_skip_fn element_skipper) {
    if (!element_skipper) return BSTD_ERR_INVALID_ARGUMENT;

    size_t initial_offset = *offset;
    bool has_value;
    bstd_status status = bstd_unmarshal_bool(buf, buf_len, offset, &has_value);
    if (status != BSTD_OK) return status;

    if (has_value) {
        status = element_skipper(buf, buf_len, offset);
        if (status != BSTD_OK) {
            *offset = initial_offset;
        }
        return status;
    }
    return BSTD_OK;
}

size_t bstd_size_pointer(const void* ptr, bstd_size_fn element_sizer) {
    if (ptr) {
        if (!element_sizer) return bstd_size_bool();
        return bstd_size_bool() + element_sizer(ptr);
    }
    return bstd_size_bool();
}

bstd_status bstd_marshal_pointer(uint8_t* buf, size_t buf_len, size_t* offset, const void* ptr, bstd_marshal_fn element_marshaler) {
    size_t initial_offset = *offset;
    bool has_value = (ptr != NULL);
    bstd_status status = bstd_marshal_bool(buf, buf_len, offset, has_value);
    if (status != BSTD_OK) return status;

    if (has_value) {
        if (!element_marshaler) {
             *offset = initial_offset;
             return BSTD_ERR_INVALID_ARGUMENT;
        }
        status = element_marshaler(buf, buf_len, offset, ptr);
        if (status != BSTD_OK) {
            *offset = initial_offset;
        }
        return status;
    }
    return BSTD_OK;
}

bstd_status bstd_unmarshal_pointer_alloc(const uint8_t* buf, size_t buf_len, size_t* offset, void** out_ptr, size_t element_size, bstd_unmarshal_fn element_unmarshaler) {
    if (!out_ptr || !element_unmarshaler) return BSTD_ERR_INVALID_ARGUMENT;

    size_t initial_offset = *offset;
    bool has_value;
    bstd_status status = bstd_unmarshal_bool(buf, buf_len, offset, &has_value);
    if (status != BSTD_OK) return status;

    if (has_value) {
        void* ptr = malloc(element_size);
        if (!ptr) return BSTD_ERR_MALLOC_FAILED;

        status = element_unmarshaler(buf, buf_len, offset, ptr);
        if (status != BSTD_OK) {
            free(ptr);
            *offset = initial_offset;
            *out_ptr = NULL;
            return status;
        }
        *out_ptr = ptr;
    } else {
        *out_ptr = NULL;
    }
    return BSTD_OK;
}

void bstd_free_pointer(void* ptr, bstd_free_fn element_freer) {
    if (!ptr) return;
    if (element_freer) {
        element_freer(ptr);
    }
    free(ptr);
}

// --- Fixed-size type implementations ---

// This macro implements the skip, size, marshal, and unmarshal functions for
// any fixed-size, little-endian primitive type.
#define IMPLEMENT_FIXED_TYPE(type_name, c_type, size) \
size_t bstd_size_##type_name(void) { return size; } \
bstd_status bstd_skip_##type_name(const uint8_t* buf, size_t buf_len, size_t* offset) { \
    (void)buf; \
    if (buf_len < *offset + size) return BSTD_ERR_BUF_TOO_SMALL; \
    *offset += size; \
    return BSTD_OK; \
} \
bstd_status bstd_marshal_##type_name(uint8_t* buf, size_t buf_len, size_t* offset, c_type value) { \
    if (buf_len < *offset + size) return BSTD_ERR_BUF_TOO_SMALL; \
    uint8_t* p = buf + *offset; \
    for (size_t i = 0; i < size; ++i) { \
        p[i] = (uint8_t)((uint64_t)value >> (i * 8)); \
    } \
    *offset += size; \
    return BSTD_OK; \
} \
bstd_status bstd_unmarshal_##type_name(const uint8_t* buf, size_t buf_len, size_t* offset, c_type* out_value) { \
    if (buf_len < *offset + size) return BSTD_ERR_BUF_TOO_SMALL; \
    c_type value = 0; \
    const uint8_t* p = buf + *offset; \
    for (size_t i = 0; i < size; ++i) { \
        value |= (c_type)((c_type)p[i] << (i * 8)); \
    } \
    *out_value = value; \
    *offset += size; \
    return BSTD_OK; \
}

IMPLEMENT_FIXED_TYPE(uint8,  uint8_t,  1)
IMPLEMENT_FIXED_TYPE(uint16, uint16_t, 2)
IMPLEMENT_FIXED_TYPE(uint32, uint32_t, 4)
IMPLEMENT_FIXED_TYPE(uint64, uint64_t, 8)
IMPLEMENT_FIXED_TYPE(int8,   int8_t,   1)
IMPLEMENT_FIXED_TYPE(int16,  int16_t,  2)
IMPLEMENT_FIXED_TYPE(int32,  int32_t,  4)
IMPLEMENT_FIXED_TYPE(int64,  int64_t,  8)

// --- Float implementations (require bit-casting) ---
size_t bstd_size_float32(void) { return 4; }
bstd_status bstd_skip_float32(const uint8_t* buf, size_t buf_len, size_t* offset) {
    (void)buf; if (buf_len < *offset + 4) return BSTD_ERR_BUF_TOO_SMALL; *offset += 4; return BSTD_OK;
}
bstd_status bstd_marshal_float32(uint8_t* buf, size_t buf_len, size_t* offset, float value) {
    uint32_t bits; memcpy(&bits, &value, sizeof(bits));
    return bstd_marshal_uint32(buf, buf_len, offset, bits);
}
bstd_status bstd_unmarshal_float32(const uint8_t* buf, size_t buf_len, size_t* offset, float* out_value) {
    uint32_t bits; bstd_status status = bstd_unmarshal_uint32(buf, buf_len, offset, &bits);
    if (status == BSTD_OK) { memcpy(out_value, &bits, sizeof(*out_value)); } return status;
}

size_t bstd_size_float64(void) { return 8; }
bstd_status bstd_skip_float64(const uint8_t* buf, size_t buf_len, size_t* offset) {
    (void)buf; if (buf_len < *offset + 8) return BSTD_ERR_BUF_TOO_SMALL; *offset += 8; return BSTD_OK;
}
bstd_status bstd_marshal_float64(uint8_t* buf, size_t buf_len, size_t* offset, double value) {
    uint64_t bits; memcpy(&bits, &value, sizeof(bits));
    return bstd_marshal_uint64(buf, buf_len, offset, bits);
}
bstd_status bstd_unmarshal_float64(const uint8_t* buf, size_t buf_len, size_t* offset, double* out_value) {
    uint64_t bits; bstd_status status = bstd_unmarshal_uint64(buf, buf_len, offset, &bits);
    if (status == BSTD_OK) { memcpy(out_value, &bits, sizeof(*out_value)); } return status;
}

#endif // BSTD_IMPLEMENTATION
