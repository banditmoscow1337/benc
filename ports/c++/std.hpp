#pragma once

#include <cassert>
#include <cstddef>
#include <cstdint>
#include <cstring> // For std::memcpy
#include <map>
#include <span>
#include <string>
#include <string_view>
#include <system_error>
#include <type_traits>
#include <variant>
#include <vector>
#include <algorithm>

namespace bstd {

// --- Public Error and Result Types ---

/**
 * @brief Error codes for bstd operations.
 */
enum class Error {
    Ok = 0,             ///< No error
    Overflow,           ///< A variable-length integer overflowed its boundaries
    BufferTooSmall,     ///< The provided buffer is too small for the operation
};

/**
 * @brief Represents the successful result of an unmarshal operation.
 * @tparam T The type of the unmarshalled value.
 */
template<typename T>
struct UnmarshalResult {
    T value;
    size_t new_offset;
};

/**
 * @brief A variant representing either a successful result or an error.
 * @tparam T The type of the value in the successful result.
 */
template<typename T>
using Result = std::variant<UnmarshalResult<T>, Error>;

/**
 * @brief A variant representing either a new offset or an error, used by Skip functions.
 */
using SkipResult = std::variant<size_t, Error>;


// --- Implementation Details ---
namespace detail {

constexpr int MAX_VARINT_LEN = 10; // Corresponds to binary.MaxVarintLen64
constexpr std::byte SLICE_MAP_TERMINATOR[] = {std::byte{1}, std::byte{1}, std::byte{1}, std::byte{1}};

// ZigZag encoding maps signed integers to unsigned ones so that numbers with a small
// absolute value (positive or negative) have a small varint encoded value.
template<typename T, std::enable_if_t<std::is_signed_v<T>, int> = 0>
constexpr std::make_unsigned_t<T> encode_zigzag(T t) noexcept {
    return (static_cast<std::make_unsigned_t<T>>(t) << 1) ^ (t >> (sizeof(T) * 8 - 1));
}

template<typename T, std::enable_if_t<std::is_unsigned_v<T>, int> = 0>
constexpr std::make_signed_t<T> decode_zigzag(T t) noexcept {
    using Signed = std::make_signed_t<T>;
    return static_cast<Signed>((t >> 1) ^ (-(t & 1)));
}

// --- Varint Functions ---

inline size_t size_uint_var(uint64_t v) noexcept {
    size_t i = 1;
    while (v >= 0x80) {
        v >>= 7;
        i++;
    }
    return i;
}

inline size_t size_int_var(int64_t v) noexcept {
    return size_uint_var(encode_zigzag(v));
}

inline size_t marshal_uint_var(std::span<std::byte> b, size_t n, uint64_t v) noexcept {
    assert(b.size() >= n + size_uint_var(v) && "marshal_uint_var: buffer too small");
    size_t i = n;
    while (v >= 0x80) {
        b[i++] = static_cast<std::byte>(v) | std::byte{0x80};
        v >>= 7;
    }
    b[i++] = static_cast<std::byte>(v);
    return i;
}

inline Result<uint64_t> unmarshal_uint_var(std::span<const std::byte> b, size_t n) noexcept {
    uint64_t x = 0;
    uint s = 0;
    for (size_t i = 0; i < MAX_VARINT_LEN; ++i) {
        if (n + i >= b.size()) {
            return Error::BufferTooSmall;
        }
        const std::byte B = b[n + i];
        if (std::to_integer<uint8_t>(B) < 0x80) {
            if (i == MAX_VARINT_LEN - 1 && std::to_integer<uint8_t>(B) > 1) {
                return Error::Overflow;
            }
            x |= static_cast<uint64_t>(std::to_integer<uint8_t>(B)) << s;
            return UnmarshalResult<uint64_t>{x, n + i + 1};
        }
        x |= static_cast<uint64_t>(std::to_integer<uint8_t>(B) & 0x7f) << s;
        s += 7;
    }
    return Error::Overflow;
}

inline SkipResult skip_varint(std::span<const std::byte> b, size_t n) noexcept {
    for (size_t i = 0; i < MAX_VARINT_LEN; ++i) {
        if (n + i >= b.size()) return Error::BufferTooSmall;
        if (std::to_integer<uint8_t>(b[n + i]) < 0x80) {
            if (i == MAX_VARINT_LEN - 1 && std::to_integer<uint8_t>(b[n + i]) > 1) {
                return Error::Overflow;
            }
            return n + i + 1;
        }
    }
    return Error::Overflow;  // Changed from Error::BufferTooSmall to Error::Overflow
}
// --- Fixed-size Primitives (Little-Endian) ---

template<typename T>
inline void encode_little_endian(std::span<std::byte> b, size_t n, T val) noexcept {
    assert(b.size() >= n + sizeof(T) && "encode_little_endian: buffer too small");
    uint64_t bits;
    if constexpr (std::is_floating_point_v<T>) {
        static_assert(sizeof(bits) >= sizeof(T));
        bits = 0;
        std::memcpy(&bits, &val, sizeof(T));
    } else {
        bits = static_cast<uint64_t>(static_cast<std::make_unsigned_t<T>>(val));
    }
    for (size_t i = 0; i < sizeof(T); ++i) {
        b[n + i] = static_cast<std::byte>(bits >> (i * 8));
    }
}

// Add this specialization for bool:
template<>
inline void encode_little_endian<bool>(std::span<std::byte> b, size_t n, bool val) noexcept {
    assert(b.size() >= n + sizeof(bool) && "encode_little_endian<bool>: buffer too small");
    b[n] = static_cast<std::byte>(val ? 1 : 0);
    // If sizeof(bool) > 1, zero the rest (optional, for portability)
    for (size_t i = 1; i < sizeof(bool); ++i) {
        b[n + i] = std::byte{0};
    }
}

template<typename T>
inline T decode_little_endian(std::span<const std::byte> b, size_t n) noexcept {
    assert(b.size() >= n + sizeof(T) && "decode_little_endian: buffer too small");
    uint64_t bits = 0;
    for (size_t i = 0; i < sizeof(T); ++i) {
        bits |= static_cast<uint64_t>(std::to_integer<uint8_t>(b[n + i])) << (i * 8);
    }
    if constexpr (std::is_floating_point_v<T>) {
         T val;
         std::memcpy(&val, &bits, sizeof(T));
         return val;
    }
    return static_cast<T>(bits);
}

// Trait to check if a function is callable with a specific argument type
template <typename F, typename Arg>
struct is_callable_with_arg {
    template <typename U, typename V, typename = decltype(std::declval<U>()(std::declval<V>()))>
    static std::true_type test(int);
    template <typename, typename>
    static std::false_type test(...);
    static constexpr bool value = decltype(test<F, Arg>(0))::value;
};

} // namespace detail


// --- Public API ---

// --- String ---

inline size_t size_string(std::string_view str) noexcept {
    return detail::size_uint_var(str.length()) + str.length();
}

inline size_t marshal_string(std::span<std::byte> b, size_t n, std::string_view str) noexcept {
    assert(b.size() >= n + size_string(str) && "marshal_string: buffer too small");
    n = detail::marshal_uint_var(b, n, str.length());
    std::memcpy(b.data() + n, str.data(), str.length());
    return n + str.length();
}

inline Result<std::string> unmarshal_string(std::span<const std::byte> b, size_t n) noexcept {
    auto len_res = detail::unmarshal_uint_var(b, n);
    if (auto* err = std::get_if<Error>(&len_res)) return *err;
    auto& [len, offset] = std::get<UnmarshalResult<uint64_t>>(len_res);
    if (b.size() - offset < len) return Error::BufferTooSmall;
    std::string str(reinterpret_cast<const char*>(b.data() + offset), static_cast<size_t>(len));
    return UnmarshalResult<std::string>{std::move(str), offset + static_cast<size_t>(len)};
}

/**
 * @brief Unmarshals a string as a view into the original buffer.
 * @warning The returned view is only valid as long as the underlying buffer `b` is valid.
 */
inline Result<std::string_view> unmarshal_string_view(std::span<const std::byte> b, size_t n) noexcept {
    auto len_res = detail::unmarshal_uint_var(b, n);
    if (auto* err = std::get_if<Error>(&len_res)) return *err;
    auto& [len, offset] = std::get<UnmarshalResult<uint64_t>>(len_res);
    if (b.size() - offset < len) return Error::BufferTooSmall;
    std::string_view sv(reinterpret_cast<const char*>(b.data() + offset), static_cast<size_t>(len));
    return UnmarshalResult<std::string_view>{sv, offset + static_cast<size_t>(len)};
}

inline SkipResult skip_string(std::span<const std::byte> b, size_t n) noexcept {
    auto len_res = detail::unmarshal_uint_var(b, n);
    if (auto* err = std::get_if<Error>(&len_res)) return *err;
    auto& [len, offset] = std::get<UnmarshalResult<uint64_t>>(len_res);
    if (b.size() - offset < len) return Error::BufferTooSmall;
    return offset + static_cast<size_t>(len);
}


// --- Generic Skip for Slice and Map ---

inline SkipResult skip_slice_or_map(std::span<const std::byte> b, size_t n) noexcept {
    const auto end_marker = std::span(detail::SLICE_MAP_TERMINATOR);
    if (b.size() < n) return Error::BufferTooSmall;
    auto it = std::search(b.begin() + n, b.end(), end_marker.begin(), end_marker.end());
    if (it == b.end()) return Error::BufferTooSmall;
    return std::distance(b.begin(), it) + end_marker.size();
}


// --- Slice ---

inline SkipResult skip_slice(std::span<const std::byte> b, size_t n) noexcept {
    return skip_slice_or_map(b, n);
}

template<typename T, typename Sizer>
size_t size_slice(const std::vector<T>& slice, Sizer sizer) {
    size_t s = detail::size_uint_var(slice.size()) + 4; // Length + terminator
    for (const auto& t : slice) {
        if constexpr (detail::is_callable_with_arg<Sizer, T>::value) {
            s += sizer(t);
        } else {
            s += sizer();
        }
    }
    return s;
}

template<typename T>
size_t size_fixed_slice(const std::vector<T>& slice, size_t elem_size) noexcept {
    return detail::size_uint_var(slice.size()) + 4 + (slice.size() * elem_size);
}

template<typename T, typename Marshaler>
size_t marshal_slice(std::span<std::byte> b, size_t n, const std::vector<T>& slice, Marshaler marshaler) {
    n = detail::marshal_uint_var(b, n, slice.size());
    for (const auto& t : slice) {
        n = marshaler(b, n, t);
    }
    assert(b.size() >= n + 4 && "marshal_slice: buffer too small for terminator");
    std::memcpy(b.data() + n, detail::SLICE_MAP_TERMINATOR, 4);
    return n + 4;
}

template<typename T, typename Unmarshaler>
Result<std::vector<T>> unmarshal_slice(std::span<const std::byte> b, size_t n, Unmarshaler unmarshaler) {
    auto len_res = detail::unmarshal_uint_var(b, n);
    if (auto* err = std::get_if<Error>(&len_res)) return *err;
    auto& [len, offset] = std::get<UnmarshalResult<uint64_t>>(len_res);
    n = offset;

    std::vector<T> ts;
    ts.reserve(static_cast<size_t>(len));

    for (uint64_t i = 0; i < len; ++i) {
        auto item_res = unmarshaler(b, n);
        if (auto* err = std::get_if<Error>(&item_res)) return *err;
        auto& [item, item_offset] = std::get<UnmarshalResult<T>>(item_res);
        ts.push_back(std::move(item));
        n = item_offset;
    }

    if (b.size() < n + 4 || std::memcmp(b.data() + n, detail::SLICE_MAP_TERMINATOR, 4) != 0) {
        return Error::BufferTooSmall;
    }
    return UnmarshalResult<std::vector<T>>{std::move(ts), n + 4};
}


// --- Map ---

inline SkipResult skip_map(std::span<const std::byte> b, size_t n) noexcept {
    return skip_slice_or_map(b, n);
}

template<typename K, typename V, typename KSizer, typename VSizer>
size_t size_map(const std::map<K, V>& m, KSizer k_sizer, VSizer v_sizer) {
    size_t s = detail::size_uint_var(m.size()) + 4; // Length + terminator
    for (const auto& [key, val] : m) {
        if constexpr (detail::is_callable_with_arg<KSizer, K>::value) {
            s += k_sizer(key);
        } else {
            s += k_sizer();
        }
        if constexpr (detail::is_callable_with_arg<VSizer, V>::value) {
            s += v_sizer(val);
        } else {
            s += v_sizer();
        }
    }
    return s;
}

template<typename K, typename V, typename KMarshaler, typename VMarshaler>
size_t marshal_map(std::span<std::byte> b, size_t n, const std::map<K, V>& m, KMarshaler k_marshaler, VMarshaler v_marshaler) {
    n = detail::marshal_uint_var(b, n, m.size());
    for (const auto& [key, val] : m) {
        n = k_marshaler(b, n, key);
        n = v_marshaler(b, n, val);
    }
    assert(b.size() >= n + 4 && "marshal_map: buffer too small for terminator");
    std::memcpy(b.data() + n, detail::SLICE_MAP_TERMINATOR, 4);
    return n + 4;
}

template<typename K, typename V, typename KUnmarshaler, typename VUnmarshaler>
Result<std::map<K, V>> unmarshal_map(std::span<const std::byte> b, size_t n, KUnmarshaler k_unmarshaler, VUnmarshaler v_unmarshaler) {
    auto len_res = detail::unmarshal_uint_var(b, n);
    if (auto* err = std::get_if<Error>(&len_res)) return *err;
    auto& [len, offset] = std::get<UnmarshalResult<uint64_t>>(len_res);
    n = offset;

    std::map<K, V> m;
    for (uint64_t i = 0; i < len; ++i) {
        auto key_res = k_unmarshaler(b, n);
        if (auto* err = std::get_if<Error>(&key_res)) return *err;
        auto& [key, key_offset] = std::get<UnmarshalResult<K>>(key_res);
        n = key_offset;

        auto val_res = v_unmarshaler(b, n);
        if (auto* err = std::get_if<Error>(&val_res)) return *err;
        auto& [val, val_offset] = std::get<UnmarshalResult<V>>(val_res);
        n = val_offset;
        
        m.emplace(std::move(key), std::move(val));
    }
    
    if (b.size() < n + 4 || std::memcmp(b.data() + n, detail::SLICE_MAP_TERMINATOR, 4) != 0) {
        return Error::BufferTooSmall;
    }
    return UnmarshalResult<std::map<K, V>>{std::move(m), n + 4};
}


// --- Bytes ---

inline size_t size_bytes(std::span<const std::byte> bs) noexcept {
    return detail::size_uint_var(bs.size()) + bs.size();
}

inline size_t marshal_bytes(std::span<std::byte> b, size_t n, std::span<const std::byte> bs) noexcept {
    assert(b.size() >= n + size_bytes(bs) && "marshal_bytes: buffer too small");
    n = detail::marshal_uint_var(b, n, bs.size());
    std::memcpy(b.data() + n, bs.data(), bs.size());
    return n + bs.size();
}

inline Result<std::vector<std::byte>> unmarshal_bytes_copied(std::span<const std::byte> b, size_t n) noexcept {
    auto res = unmarshal_string_view(b, n); // Logic is identical
    if(auto* err = std::get_if<Error>(&res)) return *err;
    auto& [sv, offset] = std::get<UnmarshalResult<std::string_view>>(res);
    const auto* ptr = reinterpret_cast<const std::byte*>(sv.data());
    return UnmarshalResult<std::vector<std::byte>>{{ptr, ptr + sv.size()}, offset};
}

inline Result<std::span<const std::byte>> unmarshal_bytes_cropped(std::span<const std::byte> b, size_t n) noexcept {
    auto res = unmarshal_string_view(b, n); // Logic is identical
    if(auto* err = std::get_if<Error>(&res)) return *err;
    auto& [sv, offset] = std::get<UnmarshalResult<std::string_view>>(res);
    return UnmarshalResult<std::span<const std::byte>>{{reinterpret_cast<const std::byte*>(sv.data()), sv.size()}, offset};
}

inline SkipResult skip_bytes(std::span<const std::byte> b, size_t n) noexcept {
    auto len_res = detail::unmarshal_uint_var(b, n);
    if (auto* err = std::get_if<Error>(&len_res)) return *err;
    auto& [len, offset] = std::get<UnmarshalResult<uint64_t>>(len_res);
    if (b.size() - offset < len) return Error::BufferTooSmall;
    return offset + static_cast<size_t>(len);
}


// --- Fixed-size Primitives ---

#define BSTD_DEFINE_FIXED_TYPE_FUNCS(TypeName, CppType) \
    inline SkipResult skip_##TypeName(std::span<const std::byte> b, size_t n) noexcept { \
        if (b.size() < n + sizeof(CppType)) return Error::BufferTooSmall; \
        return n + sizeof(CppType); \
    } \
    constexpr size_t size_##TypeName() noexcept { return sizeof(CppType); } \
    inline size_t marshal_##TypeName(std::span<std::byte> b, size_t n, CppType v) noexcept { \
        detail::encode_little_endian(b, n, v); \
        return n + sizeof(CppType); \
    } \
    inline Result<CppType> unmarshal_##TypeName(std::span<const std::byte> b, size_t n) noexcept { \
        if (b.size() < n + sizeof(CppType)) return Result<CppType>{Error::BufferTooSmall}; \
        return UnmarshalResult<CppType>{detail::decode_little_endian<CppType>(b, n), n + sizeof(CppType)}; \
    }

BSTD_DEFINE_FIXED_TYPE_FUNCS(uint64, uint64_t)
BSTD_DEFINE_FIXED_TYPE_FUNCS(uint32, uint32_t)
BSTD_DEFINE_FIXED_TYPE_FUNCS(uint16, uint16_t)
BSTD_DEFINE_FIXED_TYPE_FUNCS(byte,   uint8_t)
BSTD_DEFINE_FIXED_TYPE_FUNCS(int64,  int64_t)
BSTD_DEFINE_FIXED_TYPE_FUNCS(int32,  int32_t)
BSTD_DEFINE_FIXED_TYPE_FUNCS(int16,  int16_t)
BSTD_DEFINE_FIXED_TYPE_FUNCS(int8,   int8_t)
BSTD_DEFINE_FIXED_TYPE_FUNCS(float64,double)
BSTD_DEFINE_FIXED_TYPE_FUNCS(float32,float)

// --- Varint Primitives ---

inline SkipResult skip_uint(std::span<const std::byte> b, size_t n) noexcept { return detail::skip_varint(b, n); }
inline size_t size_uint(uint64_t v) noexcept { return detail::size_uint_var(v); }
inline size_t marshal_uint(std::span<std::byte> b, size_t n, uint64_t v) noexcept { return detail::marshal_uint_var(b, n, v); }
inline Result<uint64_t> unmarshal_uint(std::span<const std::byte> b, size_t n) noexcept { return detail::unmarshal_uint_var(b, n); }

inline SkipResult skip_int(std::span<const std::byte> b, size_t n) noexcept { return detail::skip_varint(b, n); }
inline size_t size_int(int64_t v) noexcept { return detail::size_int_var(v); }
inline size_t marshal_int(std::span<std::byte> b, size_t n, int64_t v) noexcept { return detail::marshal_uint_var(b, n, detail::encode_zigzag(v)); }
inline Result<int64_t> unmarshal_int(std::span<const std::byte> b, size_t n) noexcept {
    auto res = detail::unmarshal_uint_var(b, n);
    if (auto* val = std::get_if<UnmarshalResult<uint64_t>>(&res)) {
        return UnmarshalResult<int64_t>{detail::decode_zigzag(val->value), val->new_offset};
    }
    return std::get<Error>(res);
}

// --- Bool ---

BSTD_DEFINE_FIXED_TYPE_FUNCS(bool, bool)

#undef BSTD_DEFINE_FIXED_TYPE_FUNCS

} // namespace bstd