import Foundation

// MARK: - Error Types

enum BstdError: Error {
    case bufferTooSmall
    case overflow
    case invalidUTF8
    case missingTerminator
}

// MARK: - Constants

struct BstdConstants {
    static let terminator: [UInt8] = [1, 1, 1, 1]
    static let maxVarintLen64 = 10
}

// MARK: - Core Bstd Implementation

struct Bstd {
    
// MARK: - Helper Functions

private static func encodeZigZag(_ value: Int64) -> UInt64 {
    // Moves the sign bit to the least significant bit.
    return UInt64(bitPattern: (value << 1) ^ (value >> 63))
}

private static func decodeZigZag(_ value: UInt64) -> Int64 {
    let result: UInt64
    if (value & 1) == 1 {
        // For negative numbers, perform a bitwise NOT on the shifted value.
        // Using .max is a 64-bit safe way to do this.
        result = .max ^ (value >> 1)
    } else {
        // For positive numbers, just shift right.
        result = value >> 1
    }
    return Int64(bitPattern: result)
}


// MARK: - String Operations
    
    static func sizeString(_ str: String) -> Int {
        let length = str.utf8.count
        return sizeUInt(UInt64(length)) + length
    }
    
    static func marshalString(_ str: String, at index: inout Int, into buffer: inout [UInt8]) throws {
        let length = str.utf8.count
        try marshalUInt(UInt64(length), at: &index, into: &buffer)
        
        guard index + length <= buffer.count else {
            throw BstdError.bufferTooSmall
        }
        
        let utf8 = Array(str.utf8)
        buffer.replaceSubrange(index..<index+length, with: utf8)
        index += length
    }
    
    static func unmarshalString(at index: inout Int, from buffer: [UInt8]) throws -> String {
        let length64 = try unmarshalUInt(at: &index, from: buffer)
        let length = Int(length64)
        
        guard index + length <= buffer.count else {
            throw BstdError.bufferTooSmall
        }
        
        let stringData = buffer[index..<index+length]
        guard let string = String(bytes: stringData, encoding: .utf8) else {
            throw BstdError.invalidUTF8
        }
        
        index += length
        return string
    }
    
    static func skipString(at index: inout Int, in buffer: [UInt8]) throws {
        let length64 = try unmarshalUInt(at: &index, from: buffer)
        let length = Int(length64)

        guard index + length <= buffer.count else {
            throw BstdError.bufferTooSmall
        }
        
        index += length
    }
    
    // MARK: - Byte Operations
    
    static func sizeByte() -> Int {
        return 1
    }
    
    static func marshalByte(_ value: UInt8, at index: inout Int, into buffer: inout [UInt8]) throws {
        guard index < buffer.count else {
            throw BstdError.bufferTooSmall
        }
        buffer[index] = value
        index += 1
    }
    
    static func unmarshalByte(at index: inout Int, from buffer: [UInt8]) throws -> UInt8 {
        guard index < buffer.count else {
            throw BstdError.bufferTooSmall
        }
        let value = buffer[index]
        index += 1
        return value
    }
    
    static func skipByte(at index: inout Int, in buffer: [UInt8]) throws {
        guard index < buffer.count else {
            throw BstdError.bufferTooSmall
        }
        index += 1
    }
    
    // MARK: - Byte Slice Operations
    
    static func sizeBytes(_ data: [UInt8]) -> Int {
        return sizeUInt(UInt64(data.count)) + data.count
    }
    
    static func marshalBytes(_ data: [UInt8], at index: inout Int, into buffer: inout [UInt8]) throws {
        try marshalUInt(UInt64(data.count), at: &index, into: &buffer)
        
        guard index + data.count <= buffer.count else {
            throw BstdError.bufferTooSmall
        }
        
        buffer.replaceSubrange(index..<index+data.count, with: data)
        index += data.count
    }
    
    static func unmarshalBytesCropped(at index: inout Int, from buffer: [UInt8]) throws -> [UInt8] {
        let length64 = try unmarshalUInt(at: &index, from: buffer)
        let length = Int(length64)
        
        guard index + length <= buffer.count else {
            throw BstdError.bufferTooSmall
        }
        
        let result = Array(buffer[index..<index+length])
        index += length
        return result
    }
    
    static func unmarshalBytesCopied(at index: inout Int, from buffer: [UInt8]) throws -> [UInt8] {
        // In Swift, Array slicing creates a copy, so this is equivalent to Cropped.
        return try unmarshalBytesCropped(at: &index, from: buffer)
    }
    
    static func skipBytes(at index: inout Int, in buffer: [UInt8]) throws {
        try skipString(at: &index, in: buffer)
    }
    
    // MARK: - Slice Operations
    
    static func sizeSlice<T>(_ slice: [T], sizer: (T) -> Int) -> Int {
        let count = slice.count
        var size = sizeUInt(UInt64(count))
        
        for item in slice {
            size += sizer(item)
        }
        
        return size + BstdConstants.terminator.count
    }
    
    static func sizeFixedSlice<T>(_ slice: [T], elementSize: Int) -> Int {
        let count = slice.count
        return sizeUInt(UInt64(count)) + count * elementSize + BstdConstants.terminator.count
    }
    
    static func marshalSlice<T>(_ slice: [T], at index: inout Int, into buffer: inout [UInt8], marshaler: (T, inout Int, inout [UInt8]) throws -> Void) throws {
        try marshalUInt(UInt64(slice.count), at: &index, into: &buffer)
        
        for item in slice {
            try marshaler(item, &index, &buffer)
        }
        
        guard index + BstdConstants.terminator.count <= buffer.count else {
            throw BstdError.bufferTooSmall
        }
        
        buffer.replaceSubrange(index..<index+BstdConstants.terminator.count, with: BstdConstants.terminator)
        index += BstdConstants.terminator.count
    }
    
    static func unmarshalSlice<T>(at index: inout Int, from buffer: [UInt8], unmarshaler: (inout Int, [UInt8]) throws -> T) throws -> [T] {
        let count64 = try unmarshalUInt(at: &index, from: buffer)
        let count = Int(count64)
        var result: [T] = []
        result.reserveCapacity(count)
        
        for _ in 0..<count {
            let item = try unmarshaler(&index, buffer)
            result.append(item)
        }
        
        guard index + BstdConstants.terminator.count <= buffer.count else {
            throw BstdError.missingTerminator
        }
        
        let foundTerminator = buffer[index..<index+BstdConstants.terminator.count]
        if foundTerminator.elementsEqual(BstdConstants.terminator) == false {
            throw BstdError.missingTerminator
        }
        
        index += BstdConstants.terminator.count
        return result
    }
    
    static func skipSlice(at index: inout Int, in buffer: [UInt8]) throws {
        while index <= buffer.count - BstdConstants.terminator.count {
            if buffer[index] == BstdConstants.terminator[0] &&
               buffer[index+1] == BstdConstants.terminator[1] &&
               buffer[index+2] == BstdConstants.terminator[2] &&
               buffer[index+3] == BstdConstants.terminator[3] {
                index += BstdConstants.terminator.count
                return
            }
            index += 1
        }
        throw BstdError.missingTerminator
    }
    
    // MARK: - Map Operations
    
    static func sizeMap<K, V>(_ map: [K: V], kSizer: (K) -> Int, vSizer: (V) -> Int) -> Int {
        let count = map.count
        var size = sizeUInt(UInt64(count)) + BstdConstants.terminator.count
        
        for (key, value) in map {
            size += kSizer(key) + vSizer(value)
        }
        
        return size
    }
    
    static func marshalMap<K, V>(_ map: [K: V], at index: inout Int, into buffer: inout [UInt8], kMarshaler: (K, inout Int, inout [UInt8]) throws -> Void, vMarshaler: (V, inout Int, inout [UInt8]) throws -> Void) throws {
        try marshalUInt(UInt64(map.count), at: &index, into: &buffer)
        
        for (key, value) in map {
            try kMarshaler(key, &index, &buffer)
            try vMarshaler(value, &index, &buffer)
        }
        
        guard index + BstdConstants.terminator.count <= buffer.count else {
            throw BstdError.bufferTooSmall
        }
        
        buffer.replaceSubrange(index..<index+BstdConstants.terminator.count, with: BstdConstants.terminator)
        index += BstdConstants.terminator.count
    }
    
    static func unmarshalMap<K, V>(at index: inout Int, from buffer: [UInt8], kUnmarshaler: (inout Int, [UInt8]) throws -> K, vUnmarshaler: (inout Int, [UInt8]) throws -> V) throws -> [K: V] where K: Hashable {
        let count64 = try unmarshalUInt(at: &index, from: buffer)
        let count = Int(count64)
        var result: [K: V] = [:]
        result.reserveCapacity(count)
        
        for _ in 0..<count {
            let key = try kUnmarshaler(&index, buffer)
            let value = try vUnmarshaler(&index, buffer)
            result[key] = value
        }
        
        guard index + BstdConstants.terminator.count <= buffer.count else {
            throw BstdError.missingTerminator
        }
        
        let foundTerminator = buffer[index..<index+BstdConstants.terminator.count]
        if foundTerminator.elementsEqual(BstdConstants.terminator) == false {
            throw BstdError.missingTerminator
        }
        
        index += BstdConstants.terminator.count
        return result
    }
    
    static func skipMap(at index: inout Int, in buffer: [UInt8]) throws {
        try skipSlice(at: &index, in: buffer)
    }
    
    // MARK: - Varint Operations
    
    static func skipVarint(at index: inout Int, in buffer: [UInt8]) throws {
        for i in 0..<BstdConstants.maxVarintLen64 {
            guard index + i < buffer.count else {
                throw BstdError.bufferTooSmall
            }
            
            let byte = buffer[index + i]
            if byte < 0x80 {
                if i == BstdConstants.maxVarintLen64 - 1 && byte > 1 {
                    throw BstdError.overflow
                }
                index += i + 1
                return
            }
        }
        
        throw BstdError.overflow
    }

    static func sizeInt(_ value: Int64) -> Int {
        return sizeUInt(encodeZigZag(value))
    }

    static func marshalInt(_ value: Int64, at index: inout Int, into buffer: inout [UInt8]) throws {
        try marshalUInt(encodeZigZag(value), at: &index, into: &buffer)
    }

    static func unmarshalInt(at index: inout Int, from buffer: [UInt8]) throws -> Int64 {
        return decodeZigZag(try unmarshalUInt(at: &index, from: buffer))
    }

    static func sizeUInt(_ value: UInt64) -> Int {
        if value == 0 { return 1 }
        let bitWidth = (64 - value.leadingZeroBitCount)
        return (bitWidth + 6) / 7
    }
    
    static func marshalUInt(_ value: UInt64, at index: inout Int, into buffer: inout [UInt8]) throws {
        var v = value
        while v >= 0x80 {
            guard index < buffer.count else { throw BstdError.bufferTooSmall }
            buffer[index] = UInt8(v & 0x7F) | 0x80
            v >>= 7
            index += 1
        }
        guard index < buffer.count else { throw BstdError.bufferTooSmall }
        buffer[index] = UInt8(v)
        index += 1
    }
    
    static func unmarshalUInt(at index: inout Int, from buffer: [UInt8]) throws -> UInt64 {
        var value: UInt64 = 0
        var shift: UInt64 = 0
        let startIndex = index
        
        for i in 0..<BstdConstants.maxVarintLen64 {
            guard startIndex + i < buffer.count else {
                throw BstdError.bufferTooSmall
            }
            let byte = buffer[startIndex + i]
            if byte < 0x80 {
                if i == BstdConstants.maxVarintLen64 - 1 && byte > 1 {
                    throw BstdError.overflow
                }
                index = startIndex + i + 1
                return value | (UInt64(byte) << shift)
            }
            value |= UInt64(byte & 0x7F) << shift
            shift += 7
        }
        throw BstdError.overflow
    }
    
    // MARK: - Fixed Size Primitives
    
    static func sizeUInt8() -> Int { return 1 }
    
    static func marshalUInt8(_ value: UInt8, at index: inout Int, into buffer: inout [UInt8]) throws {
        try marshalByte(value, at: &index, into: &buffer)
    }
    
    static func unmarshalUInt8(at index: inout Int, from buffer: [UInt8]) throws -> UInt8 {
        return try unmarshalByte(at: &index, from: buffer)
    }
    
    static func skipUInt8(at index: inout Int, in buffer: [UInt8]) throws {
        try skipByte(at: &index, in: buffer)
    }
    
    static func sizeUInt16() -> Int { return 2 }
    
    static func marshalUInt16(_ value: UInt16, at index: inout Int, into buffer: inout [UInt8]) throws {
        guard index + 2 <= buffer.count else { throw BstdError.bufferTooSmall }
        buffer[index] = UInt8(truncatingIfNeeded: value)
        buffer[index + 1] = UInt8(truncatingIfNeeded: value >> 8)
        index += 2
    }
    
    static func unmarshalUInt16(at index: inout Int, from buffer: [UInt8]) throws -> UInt16 {
        guard index + 2 <= buffer.count else { throw BstdError.bufferTooSmall }
        let low = UInt16(buffer[index])
        let high = UInt16(buffer[index + 1])
        index += 2
        return low | (high << 8)
    }
    
    static func skipUInt16(at index: inout Int, in buffer: [UInt8]) throws {
        guard index + 2 <= buffer.count else { throw BstdError.bufferTooSmall }
        index += 2
    }
    
    static func sizeUInt32() -> Int { return 4 }
    
    static func marshalUInt32(_ value: UInt32, at index: inout Int, into buffer: inout [UInt8]) throws {
        guard index + 4 <= buffer.count else { throw BstdError.bufferTooSmall }
        let bytes = withUnsafeBytes(of: value.littleEndian) { Array($0) }
        buffer.replaceSubrange(index..<index+4, with: bytes)
        index += 4
    }
    
    static func unmarshalUInt32(at index: inout Int, from buffer: [UInt8]) throws -> UInt32 {
        guard index + 4 <= buffer.count else { throw BstdError.bufferTooSmall }
        var value: UInt32 = 0
        _ = withUnsafeMutableBytes(of: &value) { buffer[index..<index+4].copyBytes(to: $0) }
        index += 4
        return UInt32(littleEndian: value)
    }
    
    static func skipUInt32(at index: inout Int, in buffer: [UInt8]) throws {
        guard index + 4 <= buffer.count else { throw BstdError.bufferTooSmall }
        index += 4
    }
    
    static func sizeUInt64() -> Int { return 8 }
    
    static func marshalUInt64(_ value: UInt64, at index: inout Int, into buffer: inout [UInt8]) throws {
        guard index + 8 <= buffer.count else { throw BstdError.bufferTooSmall }
        let bytes = withUnsafeBytes(of: value.littleEndian) { Array($0) }
        buffer.replaceSubrange(index..<index+8, with: bytes)
        index += 8
    }
    
    static func unmarshalUInt64(at index: inout Int, from buffer: [UInt8]) throws -> UInt64 {
        guard index + 8 <= buffer.count else { throw BstdError.bufferTooSmall }
        var value: UInt64 = 0
        _ = withUnsafeMutableBytes(of: &value) { buffer[index..<index+8].copyBytes(to: $0) }
        index += 8
        return UInt64(littleEndian: value)
    }
    
    static func skipUInt64(at index: inout Int, in buffer: [UInt8]) throws {
        guard index + 8 <= buffer.count else { throw BstdError.bufferTooSmall }
        index += 8
    }
    
    static func sizeInt16() -> Int { return 2 }
    
    static func marshalInt16(_ value: Int16, at index: inout Int, into buffer: inout [UInt8]) throws {
        try marshalUInt16(UInt16(bitPattern: value), at: &index, into: &buffer)
    }
    
    static func unmarshalInt16(at index: inout Int, from buffer: [UInt8]) throws -> Int16 {
        return Int16(bitPattern: try unmarshalUInt16(at: &index, from: buffer))
    }
    
    static func skipInt16(at index: inout Int, in buffer: [UInt8]) throws {
        try skipUInt16(at: &index, in: buffer)
    }
    
    static func sizeInt32() -> Int { return 4 }
    
    static func marshalInt32(_ value: Int32, at index: inout Int, into buffer: inout [UInt8]) throws {
        try marshalUInt32(UInt32(bitPattern: value), at: &index, into: &buffer)
    }
    
    static func unmarshalInt32(at index: inout Int, from buffer: [UInt8]) throws -> Int32 {
        return Int32(bitPattern: try unmarshalUInt32(at: &index, from: buffer))
    }
    
    static func skipInt32(at index: inout Int, in buffer: [UInt8]) throws {
        try skipUInt32(at: &index, in: buffer)
    }
    
    static func sizeInt64() -> Int { return 8 }
    
    static func marshalInt64(_ value: Int64, at index: inout Int, into buffer: inout [UInt8]) throws {
        try marshalUInt64(UInt64(bitPattern: value), at: &index, into: &buffer)
    }
    
    static func unmarshalInt64(at index: inout Int, from buffer: [UInt8]) throws -> Int64 {
        return Int64(bitPattern: try unmarshalUInt64(at: &index, from: buffer))
    }
    
    static func skipInt64(at index: inout Int, in buffer: [UInt8]) throws {
        try skipUInt64(at: &index, in: buffer)
    }
    
    static func sizeFloat32() -> Int { return 4 }
    
    static func marshalFloat32(_ value: Float, at index: inout Int, into buffer: inout [UInt8]) throws {
        try marshalUInt32(value.bitPattern, at: &index, into: &buffer)
    }
    
    static func unmarshalFloat32(at index: inout Int, from buffer: [UInt8]) throws -> Float {
        return Float(bitPattern: try unmarshalUInt32(at: &index, from: buffer))
    }
    
    static func skipFloat32(at index: inout Int, in buffer: [UInt8]) throws {
        try skipUInt32(at: &index, in: buffer)
    }
    
    static func sizeFloat64() -> Int { return 8 }
    
    static func marshalFloat64(_ value: Double, at index: inout Int, into buffer: inout [UInt8]) throws {
        try marshalUInt64(value.bitPattern, at: &index, into: &buffer)
    }
    
    static func unmarshalFloat64(at index: inout Int, from buffer: [UInt8]) throws -> Double {
        return Double(bitPattern: try unmarshalUInt64(at: &index, from: buffer))
    }
    
    static func skipFloat64(at index: inout Int, in buffer: [UInt8]) throws {
        try skipUInt64(at: &index, in: buffer)
    }
    
    static func sizeBool() -> Int { return 1 }
    
    static func marshalBool(_ value: Bool, at index: inout Int, into buffer: inout [UInt8]) throws {
        try marshalUInt8(value ? 1 : 0, at: &index, into: &buffer)
    }
    
    static func unmarshalBool(at index: inout Int, from buffer: [UInt8]) throws -> Bool {
        return try unmarshalUInt8(at: &index, from: buffer) != 0
    }
    
    static func skipBool(at index: inout Int, in buffer: [UInt8]) throws {
        try skipUInt8(at: &index, in: buffer)
    }

    // MARK: - "Unsafe" Operations
    
    static func marshalUnsafeString(_ str: String, at index: inout Int, into buffer: inout [UInt8]) throws {
        try marshalString(str, at: &index, into: &buffer)
    }
    
    static func unmarshalUnsafeString(at index: inout Int, from buffer: [UInt8]) throws -> String {
        return try unmarshalString(at: &index, from: buffer)
    }
}