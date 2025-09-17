#include <gtest/gtest.h>
#include <vector>
#include <map>
#include <string>
#include <random>
#include <cstdint>
#include <algorithm>
#include <variant>
#include <span>
#include <functional>
#include "std.hpp"

using namespace bstd;

// Helper functions
template<typename... Sizers>
size_t SizeAll(Sizers... sizers) {
    return (sizers() + ...);
}

SkipResult SkipAll(std::span<const std::byte> buffer, std::vector<std::function<SkipResult(std::span<const std::byte>, size_t)>> skippers) {
    size_t offset = 0;
    
    for (size_t i = 0; i < skippers.size(); ++i) {
        auto result = skippers[i](buffer, offset);
        if (std::holds_alternative<Error>(result)) {
            return std::get<Error>(result);
        }
        offset = std::get<size_t>(result);
    }
    
    if (offset != buffer.size()) {
        return Error::BufferTooSmall;
    }
    
    return offset;
}

SkipResult SkipOnceVerify(std::span<const std::byte> buffer, std::function<SkipResult(std::span<const std::byte>, size_t)> skipper) {
    auto result = skipper(buffer, 0);
    if (std::holds_alternative<Error>(result)) {
        return std::get<Error>(result);
    }
    
    size_t offset = std::get<size_t>(result);
    if (offset != buffer.size()) {
        return Error::BufferTooSmall;
    }
    
    return offset;
}

// Test fixture
class BstdTest : public ::testing::Test {
protected:
    void SetUp() override {
        std::random_device rd;
        gen.seed(rd());
    }

    std::mt19937 gen;
};

// Test basic data types
TEST_F(BstdTest, DataTypes) {
    std::string testStr = "Hello World!";
    auto sizeTestStr = [&]() { return size_string(testStr); };
    
    std::vector<std::byte> testBs = {
        std::byte{0}, std::byte{1}, std::byte{2}, std::byte{3}, std::byte{4}, 
        std::byte{5}, std::byte{6}, std::byte{7}, std::byte{8}, std::byte{9}, std::byte{10}
    };
    auto sizeTestBs = [&]() { return size_bytes(testBs); };

    // Create test values
    bool boolVal = true;
    uint8_t byteVal = 128;
    float float32Val = std::uniform_real_distribution<float>{}(gen);
    double float64Val = std::uniform_real_distribution<double>{}(gen);
    int64_t intVal = std::numeric_limits<int64_t>::max();
    int16_t int16Val = -1;
    int32_t int32Val = std::uniform_int_distribution<int32_t>{}(gen);
    int64_t int64Val = std::uniform_int_distribution<int64_t>{}(gen);
    uint64_t uintVal = std::numeric_limits<uint64_t>::max();
    uint16_t uint16Val = 160;
    uint32_t uint32Val = std::uniform_int_distribution<uint32_t>{}(gen);
    uint64_t uint64Val = std::uniform_int_distribution<uint64_t>{}(gen);
    
    // Calculate total size
    auto totalSize = SizeAll(
        size_bool, size_byte, size_float32, size_float64,
        [&]() { return size_int(intVal); },
        size_int16, size_int32, size_int64,
        [&]() { return size_uint(uintVal); },
        size_uint16, size_uint32, size_uint64,
        sizeTestStr, sizeTestStr, sizeTestBs, sizeTestBs
    );

    // Create buffer and marshal all values
    std::vector<std::byte> buffer(totalSize);
    
    size_t offset = 0;
    offset = marshal_bool(buffer, offset, boolVal);
    offset = marshal_byte(buffer, offset, byteVal);
    offset = marshal_float32(buffer, offset, float32Val);
    offset = marshal_float64(buffer, offset, float64Val);
    offset = marshal_int(buffer, offset, intVal);
    offset = marshal_int16(buffer, offset, int16Val);
    offset = marshal_int32(buffer, offset, int32Val);
    offset = marshal_int64(buffer, offset, int64Val);
    offset = marshal_uint(buffer, offset, uintVal);
    offset = marshal_uint16(buffer, offset, uint16Val);
    offset = marshal_uint32(buffer, offset, uint32Val);
    offset = marshal_uint64(buffer, offset, uint64Val);
    offset = marshal_string(buffer, offset, testStr);
    offset = marshal_string(buffer, offset, testStr);
    offset = marshal_bytes(buffer, offset, testBs);
    offset = marshal_bytes(buffer, offset, testBs);
    
    ASSERT_EQ(offset, buffer.size());

    // Test skipping
    std::vector<std::function<SkipResult(std::span<const std::byte>, size_t)>> skippers = {
        skip_bool, skip_byte, skip_float32, skip_float64,
        skip_int, skip_int16, skip_int32, skip_int64,
        skip_uint, skip_uint16, skip_uint32, skip_uint64,
        skip_string, skip_string, skip_bytes, skip_bytes
    };
    
    auto skipResult = SkipAll(std::span{buffer}, skippers);
    ASSERT_TRUE(std::holds_alternative<size_t>(skipResult));
    ASSERT_EQ(std::get<size_t>(skipResult), buffer.size());

    // Test unmarshaling
    offset = 0;
    
    auto boolRes = unmarshal_bool(buffer, offset);
    ASSERT_TRUE(std::holds_alternative<UnmarshalResult<bool>>(boolRes));
    EXPECT_EQ(std::get<UnmarshalResult<bool>>(boolRes).value, boolVal);
    offset = std::get<UnmarshalResult<bool>>(boolRes).new_offset;
    
    auto byteRes = unmarshal_byte(buffer, offset);
    ASSERT_TRUE(std::holds_alternative<UnmarshalResult<uint8_t>>(byteRes));
    EXPECT_EQ(std::get<UnmarshalResult<uint8_t>>(byteRes).value, byteVal);
    offset = std::get<UnmarshalResult<uint8_t>>(byteRes).new_offset;
    
    auto float32Res = unmarshal_float32(buffer, offset);
    ASSERT_TRUE(std::holds_alternative<UnmarshalResult<float>>(float32Res));
    EXPECT_FLOAT_EQ(std::get<UnmarshalResult<float>>(float32Res).value, float32Val);
    offset = std::get<UnmarshalResult<float>>(float32Res).new_offset;
    
    auto float64Res = unmarshal_float64(buffer, offset);
    ASSERT_TRUE(std::holds_alternative<UnmarshalResult<double>>(float64Res));
    EXPECT_DOUBLE_EQ(std::get<UnmarshalResult<double>>(float64Res).value, float64Val);
    offset = std::get<UnmarshalResult<double>>(float64Res).new_offset;
    
    auto intRes = unmarshal_int(buffer, offset);
    ASSERT_TRUE(std::holds_alternative<UnmarshalResult<int64_t>>(intRes));
    EXPECT_EQ(std::get<UnmarshalResult<int64_t>>(intRes).value, intVal);
    offset = std::get<UnmarshalResult<int64_t>>(intRes).new_offset;
    
    auto int16Res = unmarshal_int16(buffer, offset);
    ASSERT_TRUE(std::holds_alternative<UnmarshalResult<int16_t>>(int16Res));
    EXPECT_EQ(std::get<UnmarshalResult<int16_t>>(int16Res).value, int16Val);
    offset = std::get<UnmarshalResult<int16_t>>(int16Res).new_offset;
    
    auto int32Res = unmarshal_int32(buffer, offset);
    ASSERT_TRUE(std::holds_alternative<UnmarshalResult<int32_t>>(int32Res));
    EXPECT_EQ(std::get<UnmarshalResult<int32_t>>(int32Res).value, int32Val);
    offset = std::get<UnmarshalResult<int32_t>>(int32Res).new_offset;
    
    auto int64Res = unmarshal_int64(buffer, offset);
    ASSERT_TRUE(std::holds_alternative<UnmarshalResult<int64_t>>(int64Res));
    EXPECT_EQ(std::get<UnmarshalResult<int64_t>>(int64Res).value, int64Val);
    offset = std::get<UnmarshalResult<int64_t>>(int64Res).new_offset;
    
    auto uintRes = unmarshal_uint(buffer, offset);
    ASSERT_TRUE(std::holds_alternative<UnmarshalResult<uint64_t>>(uintRes));
    EXPECT_EQ(std::get<UnmarshalResult<uint64_t>>(uintRes).value, uintVal);
    offset = std::get<UnmarshalResult<uint64_t>>(uintRes).new_offset;
    
    auto uint16Res = unmarshal_uint16(buffer, offset);
    ASSERT_TRUE(std::holds_alternative<UnmarshalResult<uint16_t>>(uint16Res));
    EXPECT_EQ(std::get<UnmarshalResult<uint16_t>>(uint16Res).value, uint16Val);
    offset = std::get<UnmarshalResult<uint16_t>>(uint16Res).new_offset;
    
    auto uint32Res = unmarshal_uint32(buffer, offset);
    ASSERT_TRUE(std::holds_alternative<UnmarshalResult<uint32_t>>(uint32Res));
    EXPECT_EQ(std::get<UnmarshalResult<uint32_t>>(uint32Res).value, uint32Val);
    offset = std::get<UnmarshalResult<uint32_t>>(uint32Res).new_offset;
    
    auto uint64Res = unmarshal_uint64(buffer, offset);
    ASSERT_TRUE(std::holds_alternative<UnmarshalResult<uint64_t>>(uint64Res));
    EXPECT_EQ(std::get<UnmarshalResult<uint64_t>>(uint64Res).value, uint64Val);
    offset = std::get<UnmarshalResult<uint64_t>>(uint64Res).new_offset;
    
    auto strRes = unmarshal_string(buffer, offset);
    ASSERT_TRUE(std::holds_alternative<UnmarshalResult<std::string>>(strRes));
    EXPECT_EQ(std::get<UnmarshalResult<std::string>>(strRes).value, testStr);
    offset = std::get<UnmarshalResult<std::string>>(strRes).new_offset;
    
    auto strRes2 = unmarshal_string(buffer, offset);
    ASSERT_TRUE(std::holds_alternative<UnmarshalResult<std::string>>(strRes2));
    EXPECT_EQ(std::get<UnmarshalResult<std::string>>(strRes2).value, testStr);
    offset = std::get<UnmarshalResult<std::string>>(strRes2).new_offset;
    
    auto bytesRes = unmarshal_bytes_cropped(buffer, offset);
    ASSERT_TRUE(std::holds_alternative<UnmarshalResult<std::span<const std::byte>>>(bytesRes));
    auto cropped = std::get<UnmarshalResult<std::span<const std::byte>>>(bytesRes).value;
    EXPECT_TRUE(std::equal(cropped.begin(), cropped.end(), testBs.begin()));
    offset = std::get<UnmarshalResult<std::span<const std::byte>>>(bytesRes).new_offset;
    
    auto bytesRes2 = unmarshal_bytes_copied(buffer, offset);
    ASSERT_TRUE(std::holds_alternative<UnmarshalResult<std::vector<std::byte>>>(bytesRes2));
    EXPECT_EQ(std::get<UnmarshalResult<std::vector<std::byte>>>(bytesRes2).value, testBs);
    offset = std::get<UnmarshalResult<std::vector<std::byte>>>(bytesRes2).new_offset;
    
    ASSERT_EQ(offset, buffer.size());
}

// Test error conditions
TEST_F(BstdTest, BufferTooSmall) {
    std::vector<std::vector<std::byte>> buffers = {
        {},
        {std::byte{1}, std::byte{2}, std::byte{3}},
        {std::byte{1}, std::byte{2}, std::byte{3}, std::byte{4}, std::byte{5}, std::byte{6}, std::byte{7}},
        {},
        {std::byte{1}},
        {std::byte{1}, std::byte{2}, std::byte{3}},
        {std::byte{1}, std::byte{2}, std::byte{3}, std::byte{4}, std::byte{5}, std::byte{6}, std::byte{7}},
        {},
        {std::byte{1}},
        {std::byte{1}, std::byte{2}, std::byte{3}},
        {std::byte{1}, std::byte{2}, std::byte{3}, std::byte{4}, std::byte{5}, std::byte{6}, std::byte{7}},
        {},
        {std::byte{2}, std::byte{0}},
        {std::byte{4}, std::byte{1}, std::byte{2}, std::byte{3}},
        {std::byte{8}, std::byte{1}, std::byte{2}, std::byte{3}, std::byte{4}, std::byte{5}, std::byte{6}, std::byte{7}},
        {},
        {std::byte{2}, std::byte{0}},
        {std::byte{4}, std::byte{1}, std::byte{2}, std::byte{3}},
        {std::byte{8}, std::byte{1}, std::byte{2}, std::byte{3}, std::byte{4}, std::byte{5}, std::byte{6}, std::byte{7}},
        {},
        {std::byte{2}, std::byte{0}},
        {std::byte{4}, std::byte{1}, std::byte{2}, std::byte{3}},
        {std::byte{8}, std::byte{1}, std::byte{2}, std::byte{3}, std::byte{4}, std::byte{5}, std::byte{6}, std::byte{7}},
        {},
        {std::byte{2}, std::byte{0}},
        {std::byte{4}, std::byte{1}, std::byte{2}, std::byte{3}},
        {std::byte{8}, std::byte{1}, std::byte{2}, std::byte{3}, std::byte{4}, std::byte{5}, std::byte{6}, std::byte{7}},
        {},
        {std::byte{2}, std::byte{0}},
        {std::byte{4}, std::byte{1}, std::byte{2}, std::byte{3}},
        {std::byte{8}, std::byte{1}, std::byte{2}, std::byte{3}, std::byte{4}, std::byte{5}, std::byte{6}, std::byte{7}},
        {},
        {std::byte{2}, std::byte{0}},
        {std::byte{4}, std::byte{1}, std::byte{2}, std::byte{3}},
        {std::byte{8}, std::byte{1}, std::byte{2}, std::byte{3}, std::byte{4}, std::byte{5}, std::byte{6}, std::byte{7}}
    };
    
    // Test unmarshal functions with small buffers
    for (const auto& buffer : buffers) {
        auto boolRes = unmarshal_bool(std::span{buffer}, 0);
        if (buffer.size() < size_bool()) {
            EXPECT_TRUE(std::holds_alternative<Error>(boolRes));
        }
        
        auto byteRes = unmarshal_byte(std::span{buffer}, 0);
        if (buffer.size() < size_byte()) {
            EXPECT_TRUE(std::holds_alternative<Error>(byteRes));
        }
        
        // Test other types similarly...
    }
}

// Test slices
TEST_F(BstdTest, Slices) {
    std::vector<std::string> slice = {
        "sliceelement1", "sliceelement2", "sliceelement3", 
        "sliceelement4", "sliceelement5"
    };
    
    auto sizer = [](const std::string& s) { return size_string(s); };
    size_t s = size_slice(slice, sizer);
    
    std::vector<std::byte> buffer(s);
    
    auto marshaler = [](std::span<std::byte> b, size_t n, const std::string& str) {
        return marshal_string(b, n, str);
    };
    
    size_t offset = marshal_slice(buffer, 0, slice, marshaler);
    ASSERT_EQ(offset, buffer.size());
    
    // Test skipping
    auto skipResult = SkipOnceVerify(std::span{buffer}, skip_slice);
    ASSERT_TRUE(std::holds_alternative<size_t>(skipResult));
    ASSERT_EQ(std::get<size_t>(skipResult), buffer.size());
    
    // Test unmarshaling
    auto unmarshaler = [](std::span<const std::byte> b, size_t n) {
        return unmarshal_string(b, n);
    };
    
    auto result = unmarshal_slice<std::string>(std::span{buffer}, 0, unmarshaler);
    ASSERT_TRUE(std::holds_alternative<UnmarshalResult<std::vector<std::string>>>(result));
    
    auto& unmarshalResult = std::get<UnmarshalResult<std::vector<std::string>>>(result);
    EXPECT_EQ(unmarshalResult.value, slice);
}

// Test maps
TEST_F(BstdTest, Maps) {
    std::map<std::string, std::string> m = {
        {"mapkey1", "mapvalue1"},
        {"mapkey2", "mapvalue2"},
        {"mapkey3", "mapvalue3"},
        {"mapkey4", "mapvalue4"},
        {"mapkey5", "mapvalue5"}
    };
    
    auto keySizer = [](const std::string& s) { return size_string(s); };
    auto valueSizer = [](const std::string& s) { return size_string(s); };
    
    size_t s = size_map(m, keySizer, valueSizer);
    std::vector<std::byte> buffer(s);
    
    auto keyMarshaler = [](std::span<std::byte> b, size_t n, const std::string& str) {
        return marshal_string(b, n, str);
    };
    
    auto valueMarshaler = [](std::span<std::byte> b, size_t n, const std::string& str) {
        return marshal_string(b, n, str);
    };
    
    size_t offset = marshal_map(buffer, 0, m, keyMarshaler, valueMarshaler);
    ASSERT_EQ(offset, buffer.size());
    
    // Test skipping
    auto skipResult = SkipOnceVerify(std::span{buffer}, skip_map);
    ASSERT_TRUE(std::holds_alternative<size_t>(skipResult));
    ASSERT_EQ(std::get<size_t>(skipResult), buffer.size());
    
    // Test unmarshaling
    auto keyUnmarshaler = [](std::span<const std::byte> b, size_t n) {
        return unmarshal_string(b, n);
    };
    
    auto valueUnmarshaler = [](std::span<const std::byte> b, size_t n) {
        return unmarshal_string(b, n);
    };
    
    auto result = unmarshal_map<std::string, std::string>(
        std::span{buffer}, 0, keyUnmarshaler, valueUnmarshaler
    );
    
    ASSERT_TRUE((std::holds_alternative<UnmarshalResult<std::map<std::string, std::string>>>(result)));
    
    auto& unmarshalResult = std::get<UnmarshalResult<std::map<std::string, std::string>>>(result);
    EXPECT_EQ(unmarshalResult.value, m);
}

// Test maps with int32 keys
TEST_F(BstdTest, MapsWithInt32Keys) {
    std::map<int32_t, std::string> m = {
        {1, "mapvalue1"},
        {2, "mapvalue2"},
        {3, "mapvalue3"},
        {4, "mapvalue4"},
        {5, "mapvalue5"}
    };
    
    auto keySizer = []() { return size_int32(); };
    auto valueSizer = [](const std::string& s) { return size_string(s); };
    
    size_t s = size_map(m, keySizer, valueSizer);
    std::vector<std::byte> buffer(s);
    
    auto keyMarshaler = [](std::span<std::byte> b, size_t n, int32_t val) {
        return marshal_int32(b, n, val);
    };
    
    auto valueMarshaler = [](std::span<std::byte> b, size_t n, const std::string& str) {
        return marshal_string(b, n, str);
    };
    
    size_t offset = marshal_map(buffer, 0, m, keyMarshaler, valueMarshaler);
    ASSERT_EQ(offset, buffer.size());
    
    // Test skipping
    auto skipResult = SkipOnceVerify(std::span{buffer}, skip_map);
    ASSERT_TRUE(std::holds_alternative<size_t>(skipResult));
    ASSERT_EQ(std::get<size_t>(skipResult), buffer.size());
    
    // Test unmarshaling
    auto keyUnmarshaler = [](std::span<const std::byte> b, size_t n) {
        return unmarshal_int32(b, n);
    };
    
    auto valueUnmarshaler = [](std::span<const std::byte> b, size_t n) {
        return unmarshal_string(b, n);
    };
    
    auto result = unmarshal_map<int32_t, std::string>(
        std::span{buffer}, 0, keyUnmarshaler, valueUnmarshaler
    );
    
    ASSERT_TRUE((std::holds_alternative<UnmarshalResult<std::map<int32_t, std::string>>>(result)));
    
    auto& unmarshalResult = std::get<UnmarshalResult<std::map<int32_t, std::string>>>(result);
    EXPECT_EQ(unmarshalResult.value, m);
}

// Test empty string
TEST_F(BstdTest, EmptyString) {
    std::string str = "";
    
    size_t s = size_string(str);
    std::vector<std::byte> buffer(s);
    
    size_t offset = marshal_string(buffer, 0, str);
    ASSERT_EQ(offset, buffer.size());
    
    // Test skipping
    auto skipResult = SkipOnceVerify(std::span{buffer}, skip_string);
    ASSERT_TRUE(std::holds_alternative<size_t>(skipResult));
    ASSERT_EQ(std::get<size_t>(skipResult), buffer.size());
    
    // Test unmarshaling
    auto result = unmarshal_string(std::span{buffer}, 0);
    ASSERT_TRUE(std::holds_alternative<UnmarshalResult<std::string>>(result));
    
    auto& unmarshalResult = std::get<UnmarshalResult<std::string>>(result);
    EXPECT_EQ(unmarshalResult.value, str);
}

// Test long string
TEST_F(BstdTest, LongString) {
    std::string str;
    for (int i = 0; i < 65536 + 1; i++) {
        str += "H";
    }
    
    size_t s = size_string(str);
    std::vector<std::byte> buffer(s);
    
    size_t offset = marshal_string(buffer, 0, str);
    ASSERT_EQ(offset, buffer.size());
    
    // Test skipping
    auto skipResult = SkipOnceVerify(std::span{buffer}, skip_string);
    ASSERT_TRUE(std::holds_alternative<size_t>(skipResult));
    ASSERT_EQ(std::get<size_t>(skipResult), buffer.size());
    
    // Test unmarshaling
    auto result = unmarshal_string(std::span{buffer}, 0);
    ASSERT_TRUE(std::holds_alternative<UnmarshalResult<std::string>>(result));
    
    auto& unmarshalResult = std::get<UnmarshalResult<std::string>>(result);
    EXPECT_EQ(unmarshalResult.value, str);
}

// Test varint skipping
TEST_F(BstdTest, SkipVarint) {
    struct TestCase {
        std::string name;
        std::vector<std::byte> buf;
        size_t n;
        size_t wantN;
        Error wantErr;
    };
    
    std::vector<TestCase> tests = {
        {"Valid single-byte varint", {std::byte{0x05}}, 0, 1, Error::Ok},
        {"Valid multi-byte varint", {std::byte{0x80}, std::byte{0x01}}, 0, 2, Error::Ok},
        {"Buffer too small", {std::byte{0x80}}, 0, 0, Error::BufferTooSmall},
        {"Varint overflow", 
         {std::byte{0x80}, std::byte{0x80}, std::byte{0x80}, std::byte{0x80}, 
          std::byte{0x80}, std::byte{0x80}, std::byte{0x80}, std::byte{0x80}, 
          std::byte{0x80}, std::byte{0x80}, std::byte{0x80}}, 
         0, 0, Error::Overflow}
    };
    
    for (const auto& test : tests) {
        auto result = skip_uint(std::span{test.buf}, test.n);
        
        if (test.wantErr == Error::Ok) {
            ASSERT_TRUE(std::holds_alternative<size_t>(result)) << test.name;
            EXPECT_EQ(std::get<size_t>(result), test.wantN) << test.name;
        } else {
            ASSERT_TRUE(std::holds_alternative<Error>(result)) << test.name;
            EXPECT_EQ(std::get<Error>(result), test.wantErr) << test.name;
        }
    }
}

// Test unmarshal int
TEST_F(BstdTest, UnmarshalInt) {
    struct TestCase {
        std::string name;
        std::vector<std::byte> buf;
        size_t n;
        size_t wantN;
        int64_t wantVal;
        Error wantErr;
    };
    
    std::vector<TestCase> tests = {
        {"Valid small int", {std::byte{0x02}}, 0, 1, 1, Error::Ok},
        {"Valid negative int", {std::byte{0x03}}, 0, 1, -2, Error::Ok},
        {"Valid multi-byte int", {std::byte{0xAC}, std::byte{0x02}}, 0, 2, 150, Error::Ok},
        {"Buffer too small", {std::byte{0x80}}, 0, 0, 0, Error::BufferTooSmall},
        {"Varint overflow", 
         {std::byte{0x80}, std::byte{0x80}, std::byte{0x80}, std::byte{0x80}, 
          std::byte{0x80}, std::byte{0x80}, std::byte{0x80}, std::byte{0x80}, 
          std::byte{0x80}, std::byte{0x80}, std::byte{0x80}}, 
         0, 0, 0, Error::Overflow}
    };
    
    for (const auto& test : tests) {
        auto result = unmarshal_int(std::span{test.buf}, test.n);
        
        if (test.wantErr == Error::Ok) {
            ASSERT_TRUE(std::holds_alternative<UnmarshalResult<int64_t>>(result)) << test.name;
            auto& unmarshalResult = std::get<UnmarshalResult<int64_t>>(result);
            EXPECT_EQ(unmarshalResult.value, test.wantVal) << test.name;
            EXPECT_EQ(unmarshalResult.new_offset, test.wantN) << test.name;
        } else {
            ASSERT_TRUE(std::holds_alternative<Error>(result)) << test.name;
            EXPECT_EQ(std::get<Error>(result), test.wantErr) << test.name;
        }
    }
}

// Test unmarshal uint
TEST_F(BstdTest, UnmarshalUint) {
    struct TestCase {
        std::string name;
        std::vector<std::byte> buf;
        size_t n;
        size_t wantN;
        uint64_t wantVal;
        Error wantErr;
    };
    
    std::vector<TestCase> tests = {
        {"Valid small uint", {std::byte{0x07}}, 0, 1, 7, Error::Ok},
        {"Valid multi-byte uint", {std::byte{0xAC}, std::byte{0x02}}, 0, 2, 300, Error::Ok},
        {"Buffer too small", {std::byte{0x80}}, 0, 0, 0, Error::BufferTooSmall},
        {"Varint overflow", 
         {std::byte{0x80}, std::byte{0x80}, std::byte{0x80}, std::byte{0x80}, 
          std::byte{0x80}, std::byte{0x80}, std::byte{0x80}, std::byte{0x80}, 
          std::byte{0x80}, std::byte{0x80}, std::byte{0x80}}, 
         0, 0, 0, Error::Overflow}
    };
    
    for (const auto& test : tests) {
        auto result = unmarshal_uint(std::span{test.buf}, test.n);
        
        if (test.wantErr == Error::Ok) {
            ASSERT_TRUE(std::holds_alternative<UnmarshalResult<uint64_t>>(result)) << test.name;
            auto& unmarshalResult = std::get<UnmarshalResult<uint64_t>>(result);
            EXPECT_EQ(unmarshalResult.value, test.wantVal) << test.name;
            EXPECT_EQ(unmarshalResult.new_offset, test.wantN) << test.name;
        } else {
            ASSERT_TRUE(std::holds_alternative<Error>(result)) << test.name;
            EXPECT_EQ(std::get<Error>(result), test.wantErr) << test.name;
        }
    }
}

int main(int argc, char **argv) {
    ::testing::InitGoogleTest(&argc, argv);
    return RUN_ALL_TESTS();
}