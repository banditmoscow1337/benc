#include <gtest/gtest.h>
#include <vector>
#include <map>
#include <string>
#include <cstdint>
#include <span>
#include "std.hpp"

using namespace bstd;

// Forward declarations
struct SubSubItem;
struct SubItem;
struct SubComplexData;
struct ComplexData;

// SubSubItem implementation
struct SubSubItem {
    std::string Sub_sub_id;
    std::vector<std::byte> Sub_sub_data;

    size_t SizePlain() const {
        return size_string(Sub_sub_id) + size_bytes(Sub_sub_data);
    }

    size_t MarshalPlain(std::span<std::byte> b, size_t n) const {
        n = marshal_string(b, n, Sub_sub_id);
        n = marshal_bytes(b, n, Sub_sub_data);
        return n;
    }

    SkipResult UnmarshalPlain(std::span<const std::byte> b, size_t n) {
        auto id_res = unmarshal_string(b, n);
        if (std::holds_alternative<Error>(id_res)) {
            return std::get<Error>(id_res);
        }
        auto& id_result = std::get<UnmarshalResult<std::string>>(id_res);
        Sub_sub_id = id_result.value;
        n = id_result.new_offset;

        auto data_res = unmarshal_bytes_copied(b, n);
        if (std::holds_alternative<Error>(data_res)) {
            return std::get<Error>(data_res);
        }
        auto& data_result = std::get<UnmarshalResult<std::vector<std::byte>>>(data_res);
        Sub_sub_data = data_result.value;
        n = data_result.new_offset;

        return n;
    }
};

// SubItem implementation
struct SubItem {
    int32_t Sub_id;
    std::string Description;
    std::vector<SubSubItem> Sub_items;

    size_t SizePlain() const {
        size_t s = size_int32() + size_string(Description);
        s += size_slice(Sub_items, [](const SubSubItem& item) { return item.SizePlain(); });
        return s;
    }

    size_t MarshalPlain(std::span<std::byte> b, size_t n) const {
        n = marshal_int32(b, n, Sub_id);
        n = marshal_string(b, n, Description);
        
        auto marshaler = [](std::span<std::byte> buf, size_t offset, const SubSubItem& item) {
            return item.MarshalPlain(buf, offset);
        };
        n = marshal_slice(b, n, Sub_items, marshaler);
        
        return n;
    }

    SkipResult UnmarshalPlain(std::span<const std::byte> b, size_t n) {
        auto id_res = unmarshal_int32(b, n);
        if (std::holds_alternative<Error>(id_res)) {
            return std::get<Error>(id_res);
        }
        auto& id_result = std::get<UnmarshalResult<int32_t>>(id_res);
        Sub_id = id_result.value;
        n = id_result.new_offset;

        auto desc_res = unmarshal_string(b, n);
        if (std::holds_alternative<Error>(desc_res)) {
            return std::get<Error>(desc_res);
        }
        auto& desc_result = std::get<UnmarshalResult<std::string>>(desc_res);
        Description = desc_result.value;
        n = desc_result.new_offset;

        auto unmarshaler = [](std::span<const std::byte> buf, size_t offset) -> Result<SubSubItem> {
            SubSubItem item;
            auto res = item.UnmarshalPlain(buf, offset);
            if (std::holds_alternative<Error>(res)) {
                return std::get<Error>(res);
            }
            return UnmarshalResult<SubSubItem>{item, std::get<size_t>(res)};
        };
        
        auto items_res = unmarshal_slice<SubSubItem>(b, n, unmarshaler);
        if (std::holds_alternative<Error>(items_res)) {
            return std::get<Error>(items_res);
        }
        auto& items_result = std::get<UnmarshalResult<std::vector<SubSubItem>>>(items_res);
        Sub_items = items_result.value;
        n = items_result.new_offset;

        return n;
    }
};

// SubComplexData implementation
struct SubComplexData {
    int32_t Sub_id;
    std::string Sub_title;
    std::vector<std::vector<std::byte>> Sub_binary_data;
    std::vector<SubItem> Sub_items;
    std::map<std::string, std::string> Sub_metadata;

    size_t SizePlain() const {
        size_t s = size_int32() + size_string(Sub_title);
        
        s += size_slice(Sub_binary_data, [](const std::vector<std::byte>& data) {
            return size_bytes(data);
        });
        
        s += size_slice(Sub_items, [](const SubItem& item) {
            return item.SizePlain();
        });
        
        s += size_map(Sub_metadata, 
            [](const std::string& key) { return size_string(key); },
            [](const std::string& value) { return size_string(value); });
        
        return s;
    }

    size_t MarshalPlain(std::span<std::byte> b, size_t n) const {
        n = marshal_int32(b, n, Sub_id);
        n = marshal_string(b, n, Sub_title);
        
        // Marshal binary data
        auto bin_marshaler = [](std::span<std::byte> buf, size_t offset, const std::vector<std::byte>& data) {
            return marshal_bytes(buf, offset, data);
        };
        n = marshal_slice(b, n, Sub_binary_data, bin_marshaler);
        
        // Marshal items
        auto item_marshaler = [](std::span<std::byte> buf, size_t offset, const SubItem& item) {
            return item.MarshalPlain(buf, offset);
        };
        n = marshal_slice(b, n, Sub_items, item_marshaler);
        
        // Marshal metadata
        auto key_marshaler = [](std::span<std::byte> buf, size_t offset, const std::string& key) {
            return marshal_string(buf, offset, key);
        };
        auto value_marshaler = [](std::span<std::byte> buf, size_t offset, const std::string& value) {
            return marshal_string(buf, offset, value);
        };
        n = marshal_map(b, n, Sub_metadata, key_marshaler, value_marshaler);
        
        return n;
    }

    SkipResult UnmarshalPlain(std::span<const std::byte> b, size_t n) {
        auto id_res = unmarshal_int32(b, n);
        if (std::holds_alternative<Error>(id_res)) {
            return std::get<Error>(id_res);
        }
        auto& id_result = std::get<UnmarshalResult<int32_t>>(id_res);
        Sub_id = id_result.value;
        n = id_result.new_offset;

        auto title_res = unmarshal_string(b, n);
        if (std::holds_alternative<Error>(title_res)) {
            return std::get<Error>(title_res);
        }
        auto& title_result = std::get<UnmarshalResult<std::string>>(title_res);
        Sub_title = title_result.value;
        n = title_result.new_offset;

        // Unmarshal binary data
        auto bin_unmarshaler = [](std::span<const std::byte> buf, size_t offset) {
            return unmarshal_bytes_copied(buf, offset);
        };
        auto bin_res = unmarshal_slice<std::vector<std::byte>>(b, n, bin_unmarshaler);
        if (std::holds_alternative<Error>(bin_res)) {
            return std::get<Error>(bin_res);
        }
        auto& bin_result = std::get<UnmarshalResult<std::vector<std::vector<std::byte>>>>(bin_res);
        Sub_binary_data = bin_result.value;
        n = bin_result.new_offset;

        // Unmarshal items
        auto item_unmarshaler = [](std::span<const std::byte> buf, size_t offset) -> Result<SubItem> {
            SubItem item;
            auto res = item.UnmarshalPlain(buf, offset);
            if (std::holds_alternative<Error>(res)) {
                return std::get<Error>(res);
            }
            return UnmarshalResult<SubItem>{item, std::get<size_t>(res)};
        };
        auto items_res = unmarshal_slice<SubItem>(b, n, item_unmarshaler);
        if (std::holds_alternative<Error>(items_res)) {
            return std::get<Error>(items_res);
        }
        auto& items_result = std::get<UnmarshalResult<std::vector<SubItem>>>(items_res);
        Sub_items = items_result.value;
        n = items_result.new_offset;

        // Unmarshal metadata
        auto key_unmarshaler = [](std::span<const std::byte> buf, size_t offset) {
            return unmarshal_string(buf, offset);
        };
        auto value_unmarshaler = [](std::span<const std::byte> buf, size_t offset) {
            return unmarshal_string(buf, offset);
        };
        auto meta_res = unmarshal_map<std::string, std::string>(b, n, key_unmarshaler, value_unmarshaler);
        if (std::holds_alternative<Error>(meta_res)) {
            return std::get<Error>(meta_res);
        }
        auto& meta_result = std::get<UnmarshalResult<std::map<std::string, std::string>>>(meta_res);
        Sub_metadata = meta_result.value;
        n = meta_result.new_offset;

        return n;
    }
};

// ComplexData implementation
struct ComplexData {
    int64_t Id;
    std::string Title;
    std::vector<SubItem> Items;
    std::map<std::string, int32_t> Metadata;
    SubComplexData Sub_data;
    std::vector<std::vector<std::byte>> Large_binary_data;
    std::vector<int64_t> Huge_list;

    size_t SizePlain() const {
        size_t s = size_int64() + size_string(Title);
        
        s += size_slice(Items, [](const SubItem& item) {
            return item.SizePlain();
        });
        
        s += size_map(Metadata, 
            [](const std::string& key) { return size_string(key); },
            [](int32_t value) { return size_int32(); });
        
        s += Sub_data.SizePlain();
        
        s += size_slice(Large_binary_data, [](const std::vector<std::byte>& data) {
            return size_bytes(data);
        });
        
        s += size_fixed_slice(Huge_list, size_int64());
        
        return s;
    }

    size_t MarshalPlain(std::span<std::byte> b, size_t n) const {
        n = marshal_int64(b, n, Id);
        n = marshal_string(b, n, Title);
        
        // Marshal items
        auto item_marshaler = [](std::span<std::byte> buf, size_t offset, const SubItem& item) {
            return item.MarshalPlain(buf, offset);
        };
        n = marshal_slice(b, n, Items, item_marshaler);
        
        // Marshal metadata
        auto key_marshaler = [](std::span<std::byte> buf, size_t offset, const std::string& key) {
            return marshal_string(buf, offset, key);
        };
        auto value_marshaler = [](std::span<std::byte> buf, size_t offset, int32_t value) {
            return marshal_int32(buf, offset, value);
        };
        n = marshal_map(b, n, Metadata, key_marshaler, value_marshaler);
        
        // Marshal sub data
        n = Sub_data.MarshalPlain(b, n);
        
        // Marshal binary data
        auto bin_marshaler = [](std::span<std::byte> buf, size_t offset, const std::vector<std::byte>& data) {
            return marshal_bytes(buf, offset, data);
        };
        n = marshal_slice(b, n, Large_binary_data, bin_marshaler);
        
        // Marshal huge list
        auto int_marshaler = [](std::span<std::byte> buf, size_t offset, int64_t value) {
            return marshal_int64(buf, offset, value);
        };
        n = marshal_slice(b, n, Huge_list, int_marshaler);
        
        return n;
    }

    SkipResult UnmarshalPlain(std::span<const std::byte> b, size_t n) {
        auto id_res = unmarshal_int64(b, n);
        if (std::holds_alternative<Error>(id_res)) {
            return std::get<Error>(id_res);
        }
        auto& id_result = std::get<UnmarshalResult<int64_t>>(id_res);
        Id = id_result.value;
        n = id_result.new_offset;

        auto title_res = unmarshal_string(b, n);
        if (std::holds_alternative<Error>(title_res)) {
            return std::get<Error>(title_res);
        }
        auto& title_result = std::get<UnmarshalResult<std::string>>(title_res);
        Title = title_result.value;
        n = title_result.new_offset;

        // Unmarshal items
        auto item_unmarshaler = [](std::span<const std::byte> buf, size_t offset) -> Result<SubItem> {
            SubItem item;
            auto res = item.UnmarshalPlain(buf, offset);
            if (std::holds_alternative<Error>(res)) {
                return std::get<Error>(res);
            }
            return UnmarshalResult<SubItem>{item, std::get<size_t>(res)};
        };
        auto items_res = unmarshal_slice<SubItem>(b, n, item_unmarshaler);
        if (std::holds_alternative<Error>(items_res)) {
            return std::get<Error>(items_res);
        }
        auto& items_result = std::get<UnmarshalResult<std::vector<SubItem>>>(items_res);
        Items = items_result.value;
        n = items_result.new_offset;

        // Unmarshal metadata
        auto key_unmarshaler = [](std::span<const std::byte> buf, size_t offset) {
            return unmarshal_string(buf, offset);
        };
        auto value_unmarshaler = [](std::span<const std::byte> buf, size_t offset) {
            return unmarshal_int32(buf, offset);
        };
        auto meta_res = unmarshal_map<std::string, int32_t>(b, n, key_unmarshaler, value_unmarshaler);
        if (std::holds_alternative<Error>(meta_res)) {
            return std::get<Error>(meta_res);
        }
        auto& meta_result = std::get<UnmarshalResult<std::map<std::string, int32_t>>>(meta_res);
        Metadata = meta_result.value;
        n = meta_result.new_offset;

        // Unmarshal sub data
        auto sub_res = Sub_data.UnmarshalPlain(b, n);
        if (std::holds_alternative<Error>(sub_res)) {
            return std::get<Error>(sub_res);
        }
        n = std::get<size_t>(sub_res);

        // Unmarshal binary data
        auto bin_unmarshaler = [](std::span<const std::byte> buf, size_t offset) {
            return unmarshal_bytes_copied(buf, offset);
        };
        auto bin_res = unmarshal_slice<std::vector<std::byte>>(b, n, bin_unmarshaler);
        if (std::holds_alternative<Error>(bin_res)) {
            return std::get<Error>(bin_res);
        }
        auto& bin_result = std::get<UnmarshalResult<std::vector<std::vector<std::byte>>>>(bin_res);
        Large_binary_data = bin_result.value;
        n = bin_result.new_offset;

        // Unmarshal huge list
        auto int_unmarshaler = [](std::span<const std::byte> buf, size_t offset) {
            return unmarshal_int64(buf, offset);
        };
        auto list_res = unmarshal_slice<int64_t>(b, n, int_unmarshaler);
        if (std::holds_alternative<Error>(list_res)) {
            return std::get<Error>(list_res);
        }
        auto& list_result = std::get<UnmarshalResult<std::vector<int64_t>>>(list_res);
        Huge_list = list_result.value;
        n = list_result.new_offset;

        return n;
    }
};

// Test for complex data structures
TEST(ComplexDataTest, Complex) {
    ComplexData data;
    data.Id = 12345;
    data.Title = "Example Complex Data";
    
    // Create items
    SubItem item1;
    item1.Sub_id = 1;
    item1.Description = "SubItem 1";
    
    SubSubItem subsub1;
    subsub1.Sub_sub_id = "subsub1";
    subsub1.Sub_sub_data = {std::byte{0x01}, std::byte{0x02}, std::byte{0x03}};
    item1.Sub_items.push_back(subsub1);
    
    data.Items.push_back(item1);
    
    // Create metadata
    data.Metadata = {
        {"key1", 10},
        {"key2", 20}
    };
    
    // Create sub data
    data.Sub_data.Sub_id = 999;
    data.Sub_data.Sub_title = "Sub Complex Data";
    data.Sub_data.Sub_binary_data = {
        {std::byte{0x11}, std::byte{0x22}, std::byte{0x33}},
        {std::byte{0x44}, std::byte{0x55}, std::byte{0x66}}
    };
    
    SubItem subItem2;
    subItem2.Sub_id = 2;
    subItem2.Description = "SubItem 2";
    
    SubSubItem subsub2;
    subsub2.Sub_sub_id = "subsub2";
    subsub2.Sub_sub_data = {std::byte{0xAA}, std::byte{0xBB}, std::byte{0xCC}};
    subItem2.Sub_items.push_back(subsub2);
    
    data.Sub_data.Sub_items.push_back(subItem2);
    
    data.Sub_data.Sub_metadata = {
        {"meta1", "value1"},
        {"meta2", "value2"}
    };
    
    // Create binary data
    data.Large_binary_data = {
        {std::byte{0xFF}, std::byte{0xEE}, std::byte{0xDD}}
    };
    
    // Create huge list
    data.Huge_list = {1000000, 2000000, 3000000};
    
    // Calculate size and marshal
    size_t s = data.SizePlain();
    std::vector<std::byte> buffer(s);
    data.MarshalPlain(buffer, 0);
    
    // Unmarshal
    ComplexData retData;
    auto result = retData.UnmarshalPlain(buffer, 0);
    
    ASSERT_TRUE(std::holds_alternative<size_t>(result));
    
    // Verify all fields match
    EXPECT_EQ(data.Id, retData.Id);
    EXPECT_EQ(data.Title, retData.Title);
    EXPECT_EQ(data.Items.size(), retData.Items.size());
    EXPECT_EQ(data.Metadata, retData.Metadata);
    EXPECT_EQ(data.Sub_data.Sub_id, retData.Sub_data.Sub_id);
    EXPECT_EQ(data.Sub_data.Sub_title, retData.Sub_data.Sub_title);
    EXPECT_EQ(data.Large_binary_data.size(), retData.Large_binary_data.size());
    EXPECT_EQ(data.Huge_list, retData.Huge_list);
    
    // Verify nested structures
    if (data.Items.size() == retData.Items.size()) {
        EXPECT_EQ(data.Items[0].Sub_id, retData.Items[0].Sub_id);
        EXPECT_EQ(data.Items[0].Description, retData.Items[0].Description);
        EXPECT_EQ(data.Items[0].Sub_items.size(), retData.Items[0].Sub_items.size());
        
        if (data.Items[0].Sub_items.size() == retData.Items[0].Sub_items.size()) {
            EXPECT_EQ(data.Items[0].Sub_items[0].Sub_sub_id, retData.Items[0].Sub_items[0].Sub_sub_id);
            EXPECT_EQ(data.Items[0].Sub_items[0].Sub_sub_data, retData.Items[0].Sub_items[0].Sub_sub_data);
        }
    }
    
    // Verify sub data
    EXPECT_EQ(data.Sub_data.Sub_binary_data.size(), retData.Sub_data.Sub_binary_data.size());
    EXPECT_EQ(data.Sub_data.Sub_items.size(), retData.Sub_data.Sub_items.size());
    EXPECT_EQ(data.Sub_data.Sub_metadata, retData.Sub_data.Sub_metadata);
}

int main(int argc, char **argv) {
    ::testing::InitGoogleTest(&argc, argv);
    return RUN_ALL_TESTS();
}