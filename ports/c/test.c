#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <stdbool.h>
#include <stdint.h>
#include <assert.h>
#include <math.h>

// Define the implementation in this file
#define BSTD_IMPLEMENTATION
#include "benc.h"

//-///////////////////////////////////////////////////////////////////////////
// Minimal Testing Framework
//-///////////////////////////////////////////////////////////////////////////

int tests_run = 0;
int tests_failed = 0;

#define FAIL(msg, ...) \
    do { \
        fprintf(stderr, "FAIL (%s:%d): " msg "\n", __func__, __LINE__, ##__VA_ARGS__); \
        tests_failed++; \
    } while (0)

#define ASSERT(condition) \
    do { \
        if (!(condition)) { \
            FAIL("Assertion failed: %s", #condition); \
        } \
    } while (0)

#define RUN_TEST(test) \
    do { \
        fprintf(stdout, "--- Running %s ---\n", #test); \
        test(); \
        tests_run++; \
    } while (0)


//-///////////////////////////////////////////////////////////////////////////
// Helper functions for testing generic types (slices, maps, etc.)
//-///////////////////////////////////////////////////////////////////////////

// --- String Helpers for Slice/Map ---
bstd_status skip_string_element(const uint8_t* buf, size_t buf_len, size_t* offset) {
    return bstd_skip_string(buf, buf_len, offset);
}

size_t size_string_element(const void* element) {
    const char* str = *(const char**)element;
    return bstd_size_string(str, strlen(str));
}

bstd_status marshal_string_element(uint8_t* buf, size_t buf_len, size_t* offset, const void* element) {
    const char* str = *(const char**)element;
    return bstd_marshal_string(buf, buf_len, offset, str, strlen(str));
}

bstd_status unmarshal_string_element(const uint8_t* buf, size_t buf_len, size_t* offset, void* out_element) {
    return bstd_unmarshal_string_alloc(buf, buf_len, offset, (char**)out_element);
}

void free_string_element(void* element) {
    free(*(char**)element);
}

// --- int32 Helpers ---
size_t size_int32_element(const void* element) {
    (void)element;
    return bstd_size_int32();
}
bstd_status marshal_int32_element(uint8_t* buf, size_t buf_len, size_t* offset, const void* element) {
    return bstd_marshal_int32(buf, buf_len, offset, *(const int32_t*)element);
}
bstd_status unmarshal_int32_element(const uint8_t* buf, size_t buf_len, size_t* offset, void* out_element) {
    return bstd_unmarshal_int32(buf, buf_len, offset, (int32_t*)out_element);
}

//-///////////////////////////////////////////////////////////////////////////
// Test Cases
//-///////////////////////////////////////////////////////////////////////////

void test_data_types() {
    const char* test_str = "Hello World!";
    const uint8_t test_bs[] = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10};
    const intptr_t neg_int_val = -12345;
    const intptr_t pos_int_val = INTPTR_MAX;

    size_t total_size = 0;
    total_size += bstd_size_bool();
    total_size += bstd_size_byte();
    total_size += bstd_size_float32();
    total_size += bstd_size_float64();
    total_size += bstd_size_int(pos_int_val);
    total_size += bstd_size_int(neg_int_val);
    total_size += bstd_size_int8();
    total_size += bstd_size_int16();
    total_size += bstd_size_int32();
    total_size += bstd_size_int64();
    total_size += bstd_size_uint(UINTPTR_MAX);
    total_size += bstd_size_uint16();
    total_size += bstd_size_uint32();
    total_size += bstd_size_uint64();
    total_size += bstd_size_string(test_str, strlen(test_str));
    total_size += bstd_size_bytes(test_bs, sizeof(test_bs));

    uint8_t* buf = (uint8_t*)malloc(total_size);
    ASSERT(buf != NULL);
    
    size_t offset = 0;
    bstd_marshal_bool(buf, total_size, &offset, true);
    bstd_marshal_byte(buf, total_size, &offset, 128);
    bstd_marshal_float32(buf, total_size, &offset, 123.456f);
    bstd_marshal_float64(buf, total_size, &offset, 789.0123);
    bstd_marshal_int(buf, total_size, &offset, pos_int_val);
    bstd_marshal_int(buf, total_size, &offset, neg_int_val);
    bstd_marshal_int8(buf, total_size, &offset, -1);
    bstd_marshal_int16(buf, total_size, &offset, -1234);
    bstd_marshal_int32(buf, total_size, &offset, 123456);
    bstd_marshal_int64(buf, total_size, &offset, -123456789012LL);
    bstd_marshal_uint(buf, total_size, &offset, UINTPTR_MAX);
    bstd_marshal_uint16(buf, total_size, &offset, 65000);
    bstd_marshal_uint32(buf, total_size, &offset, 4000000000U);
    bstd_marshal_uint64(buf, total_size, &offset, 18000000000000000000ULL);
    bstd_marshal_string(buf, total_size, &offset, test_str, strlen(test_str));
    bstd_marshal_bytes(buf, total_size, &offset, test_bs, sizeof(test_bs));

    ASSERT(offset == total_size);

    // Test Skip functions
    offset = 0;
    ASSERT(bstd_skip_bool(buf, total_size, &offset) == BSTD_OK);
    ASSERT(bstd_skip_byte(buf, total_size, &offset) == BSTD_OK);
    ASSERT(bstd_skip_float32(buf, total_size, &offset) == BSTD_OK);
    ASSERT(bstd_skip_float64(buf, total_size, &offset) == BSTD_OK);
    ASSERT(bstd_skip_varint(buf, total_size, &offset) == BSTD_OK);
    ASSERT(bstd_skip_varint(buf, total_size, &offset) == BSTD_OK);
    ASSERT(bstd_skip_int8(buf, total_size, &offset) == BSTD_OK);
    ASSERT(bstd_skip_int16(buf, total_size, &offset) == BSTD_OK);
    ASSERT(bstd_skip_int32(buf, total_size, &offset) == BSTD_OK);
    ASSERT(bstd_skip_int64(buf, total_size, &offset) == BSTD_OK);
    ASSERT(bstd_skip_varint(buf, total_size, &offset) == BSTD_OK);
    ASSERT(bstd_skip_uint16(buf, total_size, &offset) == BSTD_OK);
    ASSERT(bstd_skip_uint32(buf, total_size, &offset) == BSTD_OK);
    ASSERT(bstd_skip_uint64(buf, total_size, &offset) == BSTD_OK);
    ASSERT(bstd_skip_string(buf, total_size, &offset) == BSTD_OK);
    ASSERT(bstd_skip_bytes(buf, total_size, &offset) == BSTD_OK);
    ASSERT(offset == total_size);


    // Test Unmarshal functions
    offset = 0;
    bool v_bool;
    uint8_t v_byte;
    float v_f32;
    double v_f64;
    intptr_t v_pos_int, v_neg_int;
    int8_t v_i8;
    int16_t v_i16;
    int32_t v_i32;
    int64_t v_i64;
    uintptr_t v_uint;
    uint16_t v_u16;
    uint32_t v_u32;
    uint64_t v_u64;
    char* v_str;
    uint8_t* v_bs;
    size_t v_bs_len;

    ASSERT(bstd_unmarshal_bool(buf, total_size, &offset, &v_bool) == BSTD_OK && v_bool == true);
    ASSERT(bstd_unmarshal_byte(buf, total_size, &offset, &v_byte) == BSTD_OK && v_byte == 128);
    ASSERT(bstd_unmarshal_float32(buf, total_size, &offset, &v_f32) == BSTD_OK && fabsf(v_f32 - 123.456f) < 1e-6);
    ASSERT(bstd_unmarshal_float64(buf, total_size, &offset, &v_f64) == BSTD_OK && fabs(v_f64 - 789.0123) < 1e-9);
    ASSERT(bstd_unmarshal_int(buf, total_size, &offset, &v_pos_int) == BSTD_OK && v_pos_int == pos_int_val);
    ASSERT(bstd_unmarshal_int(buf, total_size, &offset, &v_neg_int) == BSTD_OK && v_neg_int == neg_int_val);
    ASSERT(bstd_unmarshal_int8(buf, total_size, &offset, &v_i8) == BSTD_OK && v_i8 == -1);
    ASSERT(bstd_unmarshal_int16(buf, total_size, &offset, &v_i16) == BSTD_OK && v_i16 == -1234);
    ASSERT(bstd_unmarshal_int32(buf, total_size, &offset, &v_i32) == BSTD_OK && v_i32 == 123456);
    ASSERT(bstd_unmarshal_int64(buf, total_size, &offset, &v_i64) == BSTD_OK && v_i64 == -123456789012LL);
    ASSERT(bstd_unmarshal_uint(buf, total_size, &offset, &v_uint) == BSTD_OK && v_uint == UINTPTR_MAX);
    ASSERT(bstd_unmarshal_uint16(buf, total_size, &offset, &v_u16) == BSTD_OK && v_u16 == 65000);
    ASSERT(bstd_unmarshal_uint32(buf, total_size, &offset, &v_u32) == BSTD_OK && v_u32 == 4000000000U);
    ASSERT(bstd_unmarshal_uint64(buf, total_size, &offset, &v_u64) == BSTD_OK && v_u64 == 18000000000000000000ULL);
    ASSERT(bstd_unmarshal_string_alloc(buf, total_size, &offset, &v_str) == BSTD_OK && strcmp(v_str, test_str) == 0);
    ASSERT(bstd_unmarshal_bytes_alloc(buf, total_size, &offset, &v_bs, &v_bs_len) == BSTD_OK && v_bs_len == sizeof(test_bs) && memcmp(v_bs, test_bs, v_bs_len) == 0);
    
    ASSERT(offset == total_size);

    free(v_str);
    free(v_bs);
    free(buf);
}

void test_err_buf_too_small() {
    uint8_t empty_buf[] = {};
    uint8_t short_buf_1[] = {0x80};
    uint8_t short_buf_3[] = {1, 2, 3};
    size_t offset;

    // Test Unmarshal functions
    bool v_bool;
    offset = 0;
    ASSERT(bstd_unmarshal_bool(empty_buf, sizeof(empty_buf), &offset, &v_bool) == BSTD_ERR_BUF_TOO_SMALL);
    int32_t v_i32;
    offset = 0;
    ASSERT(bstd_unmarshal_int32(short_buf_3, sizeof(short_buf_3), &offset, &v_i32) == BSTD_ERR_BUF_TOO_SMALL);
    intptr_t v_int;
    offset = 0;
    ASSERT(bstd_unmarshal_int(short_buf_1, sizeof(short_buf_1), &offset, &v_int) == BSTD_ERR_BUF_TOO_SMALL);
    char* v_str;
    offset = 0;
    ASSERT(bstd_unmarshal_string_alloc(short_buf_1, sizeof(short_buf_1), &offset, &v_str) == BSTD_ERR_BUF_TOO_SMALL);
    
    // Test Skip functions
    offset = 0;
    ASSERT(bstd_skip_bool(empty_buf, sizeof(empty_buf), &offset) == BSTD_ERR_BUF_TOO_SMALL);
    offset = 0;
    ASSERT(bstd_skip_int32(short_buf_3, sizeof(short_buf_3), &offset) == BSTD_ERR_BUF_TOO_SMALL);
    offset = 0;
    ASSERT(bstd_skip_varint(short_buf_1, sizeof(short_buf_1), &offset) == BSTD_ERR_BUF_TOO_SMALL);
    offset = 0;
    ASSERT(bstd_skip_string(short_buf_1, sizeof(short_buf_1), &offset) == BSTD_ERR_BUF_TOO_SMALL);
}

void test_slices() {
    const char* slice[] = {"sliceelement1", "sliceelement2", "sliceelement3"};
    size_t count = sizeof(slice) / sizeof(slice[0]);

    size_t total_size = bstd_size_slice(slice, count, sizeof(char*), size_string_element);
    uint8_t* buf = (uint8_t*)malloc(total_size);
    ASSERT(buf != NULL);

    size_t offset = 0;
    ASSERT(bstd_marshal_slice(buf, total_size, &offset, slice, count, sizeof(char*), marshal_string_element) == BSTD_OK);
    ASSERT(offset == total_size);

    offset = 0;
    ASSERT(bstd_skip_slice(buf, total_size, &offset, skip_string_element) == BSTD_OK);
    ASSERT(offset == total_size);

    char** ret_slice = NULL;
    size_t ret_count = 0;
    offset = 0;
    ASSERT(bstd_unmarshal_slice_alloc(buf, total_size, &offset, (void**)&ret_slice, &ret_count, sizeof(char*), unmarshal_string_element) == BSTD_OK);
    ASSERT(offset == total_size);
    ASSERT(ret_count == count);
    for (size_t i = 0; i < count; ++i) {
        ASSERT(strcmp(slice[i], ret_slice[i]) == 0);
    }
    
    bstd_free_slice(ret_slice, ret_count, sizeof(char*), free_string_element);
    free(buf);
}

void test_maps() {
    const char* keys[] = {"mapkey1", "mapkey2", "mapkey3"};
    const char* values[] = {"mapvalue1", "mapvalue2", "mapvalue3"};
    size_t count = sizeof(keys) / sizeof(keys[0]);

    size_t total_size = bstd_size_map(keys, values, count, sizeof(char*), sizeof(char*), size_string_element, size_string_element);
    uint8_t* buf = (uint8_t*)malloc(total_size);
    ASSERT(buf != NULL);

    size_t offset = 0;
    ASSERT(bstd_marshal_map(buf, total_size, &offset, keys, values, count, sizeof(char*), sizeof(char*), marshal_string_element, marshal_string_element) == BSTD_OK);
    ASSERT(offset == total_size);

    offset = 0;
    ASSERT(bstd_skip_map(buf, total_size, &offset, skip_string_element, skip_string_element) == BSTD_OK);
    ASSERT(offset == total_size);

    char** ret_keys = NULL;
    char** ret_values = NULL;
    size_t ret_count = 0;
    offset = 0;
    ASSERT(bstd_unmarshal_map_alloc(buf, total_size, &offset, (void**)&ret_keys, (void**)&ret_values, &ret_count, sizeof(char*), sizeof(char*), unmarshal_string_element, unmarshal_string_element) == BSTD_OK);
    ASSERT(offset == total_size);
    ASSERT(ret_count == count);
    
    // Note: C map unmarshalling gives parallel arrays, so we can't check key-value pairs directly without building a hashmap.
    // For this test, we'll just verify the elements are present.
    int found_mask = 0;
    for(size_t i=0; i < ret_count; ++i) {
        for(size_t j=0; j < count; ++j) {
            if (strcmp(ret_keys[i], keys[j]) == 0 && strcmp(ret_values[i], values[j]) == 0) {
                found_mask |= (1 << j);
            }
        }
    }
    ASSERT(found_mask == (1 << count) - 1); // Check if all pairs were found

    bstd_free_map(ret_keys, ret_values, ret_count, sizeof(char*), sizeof(char*), free_string_element, free_string_element);
    free(buf);
}

void test_time() {
    int64_t now = 1663362895123456789LL;
    size_t size = bstd_size_time();
    uint8_t buf[8];

    size_t offset = 0;
    ASSERT(bstd_marshal_time(buf, size, &offset, now) == BSTD_OK);
    ASSERT(offset == size);

    offset = 0;
    ASSERT(bstd_skip_time(buf, size, &offset) == BSTD_OK);
    ASSERT(offset == size);

    int64_t ret_time;
    offset = 0;
    ASSERT(bstd_unmarshal_time(buf, size, &offset, &ret_time) == BSTD_OK);
    ASSERT(ret_time == now);
}

void test_pointer() {
    // Test non-nil pointer
    const char* val = "hello world";
    const char** ptr = &val;

    size_t size = bstd_size_pointer(ptr, size_string_element);
    uint8_t* buf = (uint8_t*)malloc(size);
    ASSERT(buf != NULL);

    size_t offset = 0;
    ASSERT(bstd_marshal_pointer(buf, size, &offset, ptr, marshal_string_element) == BSTD_OK);
    ASSERT(offset == size);
    
    offset = 0;
    ASSERT(bstd_skip_pointer(buf, size, &offset, skip_string_element) == BSTD_OK);
    ASSERT(offset == size);

    char** ret_ptr = NULL;
    offset = 0;
    ASSERT(bstd_unmarshal_pointer_alloc(buf, size, &offset, (void**)&ret_ptr, sizeof(char*), unmarshal_string_element) == BSTD_OK);
    ASSERT(ret_ptr != NULL);
    ASSERT(strcmp(*ret_ptr, val) == 0);
    
    bstd_free_pointer(ret_ptr, free_string_element);
    free(buf);

    // Test nil pointer
    char** nil_ptr = NULL;
    size = bstd_size_pointer(nil_ptr, size_string_element);
    buf = (uint8_t*)malloc(size);
    ASSERT(buf != NULL);
    
    offset = 0;
    ASSERT(bstd_marshal_pointer(buf, size, &offset, nil_ptr, marshal_string_element) == BSTD_OK);
    ASSERT(offset == size);
    
    offset = 0;
    ASSERT(bstd_skip_pointer(buf, size, &offset, skip_string_element) == BSTD_OK);
    ASSERT(offset == size);

    offset = 0;
    ASSERT(bstd_unmarshal_pointer_alloc(buf, size, &offset, (void**)&ret_ptr, sizeof(char*), unmarshal_string_element) == BSTD_OK);
    ASSERT(ret_ptr == NULL);

    free(buf);
}

void test_varint_overflow() {
    uint8_t overflow_buf[MAX_VARINT_LEN + 1];
    memset(overflow_buf, 0x80, sizeof(overflow_buf));
    overflow_buf[MAX_VARINT_LEN - 1] = 0x82; // Malformed last byte
    
    size_t offset = 0;
    uintptr_t val;
    ASSERT(bstd_unmarshal_uint(overflow_buf, MAX_VARINT_LEN, &offset, &val) == BSTD_ERR_OVERFLOW);

    offset = 0;
    ASSERT(bstd_skip_varint(overflow_buf, MAX_VARINT_LEN, &offset) == BSTD_ERR_OVERFLOW);
}


//-///////////////////////////////////////////////////////////////////////////
// Main Test Runner
//-///////////////////////////////////////////////////////////////////////////

int main() {
    RUN_TEST(test_data_types);
    RUN_TEST(test_err_buf_too_small);
    RUN_TEST(test_slices);
    RUN_TEST(test_maps);
    RUN_TEST(test_time);
    RUN_TEST(test_pointer);
    RUN_TEST(test_varint_overflow);

    if (tests_failed == 0) {
        printf("\nSUCCESS: All %d tests passed.\n", tests_run);
        return 0;
    } else {
        printf("\nFAILURE: %d out of %d tests failed.\n", tests_failed, tests_run);
        return 1;
    }
}

