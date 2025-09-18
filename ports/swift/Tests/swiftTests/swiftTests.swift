import XCTest
@testable import benc

final class BstdTests: XCTestCase {
    
    // MARK: - Helper Functions
    
    private func assertAnyEqual(_ a: Any, _ b: Any, file: StaticString = #filePath, line: UInt = #line) {
        switch (a, b) {
        case let (a as Bool, b as Bool): XCTAssertEqual(a, b, file: file, line: line)
        case let (a as UInt8, b as UInt8): XCTAssertEqual(a, b, file: file, line: line)
        case let (a as Float, b as Float): XCTAssertEqual(a, b, file: file, line: line)
        case let (a as Double, b as Double): XCTAssertEqual(a, b, file: file, line: line)
        case let (a as Int16, b as Int16): XCTAssertEqual(a, b, file: file, line: line)
        case let (a as Int32, b as Int32): XCTAssertEqual(a, b, file: file, line: line)
        case let (a as Int64, b as Int64): XCTAssertEqual(a, b, file: file, line: line)
        case let (a as UInt16, b as UInt16): XCTAssertEqual(a, b, file: file, line: line)
        case let (a as UInt32, b as UInt32): XCTAssertEqual(a, b, file: file, line: line)
        case let (a as UInt64, b as UInt64): XCTAssertEqual(a, b, file: file, line: line)
        case let (a as String, b as String): XCTAssertEqual(a, b, file: file, line: line)
        case let (a as [UInt8], b as [UInt8]): XCTAssertEqual(a, b, file: file, line: line)
        default: XCTFail("Type mismatch or unhandled type: \(type(of: a)) vs \(type(of: b))", file: file, line: line)
        }
    }

    func marshalAll(s: Int, values: [Any], marshals: [(Any, inout Int, inout [UInt8]) throws -> Void]) throws -> [UInt8] {
        var buffer = [UInt8](repeating: 0, count: s)
        var index = 0
        for (i, marshal) in marshals.enumerated() {
            try marshal(values[i], &index, &buffer)
        }
        if index != buffer.count {
            throw NSError(domain: "BstdTests", code: -1, userInfo: [NSLocalizedDescriptionKey: "Marshal failed: final index \(index) does not match calculated size \(s)"])
        }
        return buffer
    }

    func unmarshalAll(_ buffer: [UInt8], expectedValues: [Any], unmarshals: [(inout Int, [UInt8]) throws -> Any]) throws {
        var index = 0
        for (i, unmarshal) in unmarshals.enumerated() {
            let value = try unmarshal(&index, buffer)
            assertAnyEqual(value, expectedValues[i], file: #file, line: #line)
        }
        if index != buffer.count {
            throw NSError(domain: "BstdTests", code: -1, userInfo: [NSLocalizedDescriptionKey: "Unmarshal failed: final index \(index) does not match buffer size \(buffer.count)"])
        }
    }

    func skipAll(_ buffer: [UInt8], skippers: [(inout Int, [UInt8]) throws -> Void]) throws {
        var index = 0
        for skipper in skippers {
            try skipper(&index, buffer)
        }
        if index != buffer.count {
            throw NSError(domain: "BstdTests", code: -1, userInfo: [NSLocalizedDescriptionKey: "Skip failed: final index \(index) does not match buffer size \(buffer.count)"])
        }
    }
    
    func skipOnceVerify(_ buffer: [UInt8], skipper: (inout Int, [UInt8]) throws -> Void) throws {
        var index = 0
        try skipper(&index, buffer)
        if index != buffer.count {
            throw NSError(domain: "BstdTests", code: -1, userInfo: [NSLocalizedDescriptionKey: "Skip failed: something doesn't match in the marshal- and skip progress"])
        }
    }

    // MARK: - Test Cases
    
    func testDataTypes() throws {
        let testStr = "Hello World!"
        let testBs: [UInt8] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
        
        let values: [Any] = [
            true, UInt8(128), Float(0.12345), Double(0.67891),
            Int64.max, Int16(-1), Int32(12345678), Int64(-987654321),
            UInt64.max, UInt16(160), UInt32(98765), UInt64(18446744073709551610),
            testStr, testStr, testBs, testBs
        ]

        let sizers: [() -> Int] = [
            Bstd.sizeBool, Bstd.sizeByte, Bstd.sizeFloat32, Bstd.sizeFloat64,
            { Bstd.sizeInt(values[4] as! Int64) }, Bstd.sizeInt16, Bstd.sizeInt32, Bstd.sizeInt64,
            { Bstd.sizeUInt(values[8] as! UInt64) }, Bstd.sizeUInt16, Bstd.sizeUInt32, Bstd.sizeUInt64,
            { Bstd.sizeString(testStr) }, { Bstd.sizeString(testStr) }, { Bstd.sizeBytes(testBs) }, { Bstd.sizeBytes(testBs) }
        ]
        let totalSize = sizers.reduce(0) { $0 + $1() }
        
        let marshals: [(Any, inout Int, inout [UInt8]) throws -> Void] = [
            { v, i, b in try Bstd.marshalBool(v as! Bool, at: &i, into: &b) },
            { v, i, b in try Bstd.marshalByte(v as! UInt8, at: &i, into: &b) },
            { v, i, b in try Bstd.marshalFloat32(v as! Float, at: &i, into: &b) },
            { v, i, b in try Bstd.marshalFloat64(v as! Double, at: &i, into: &b) },
            { v, i, b in try Bstd.marshalInt(v as! Int64, at: &i, into: &b) },
            { v, i, b in try Bstd.marshalInt16(v as! Int16, at: &i, into: &b) },
            { v, i, b in try Bstd.marshalInt32(v as! Int32, at: &i, into: &b) },
            { v, i, b in try Bstd.marshalInt64(v as! Int64, at: &i, into: &b) },
            { v, i, b in try Bstd.marshalUInt(v as! UInt64, at: &i, into: &b) },
            { v, i, b in try Bstd.marshalUInt16(v as! UInt16, at: &i, into: &b) },
            { v, i, b in try Bstd.marshalUInt32(v as! UInt32, at: &i, into: &b) },
            { v, i, b in try Bstd.marshalUInt64(v as! UInt64, at: &i, into: &b) },
            { v, i, b in try Bstd.marshalString(v as! String, at: &i, into: &b) },
            { v, i, b in try Bstd.marshalUnsafeString(v as! String, at: &i, into: &b) },
            { v, i, b in try Bstd.marshalBytes(v as! [UInt8], at: &i, into: &b) },
            { v, i, b in try Bstd.marshalBytes(v as! [UInt8], at: &i, into: &b) }
        ]
        
        let skippers: [(inout Int, [UInt8]) throws -> Void] = [
            Bstd.skipBool, Bstd.skipByte, Bstd.skipFloat32, Bstd.skipFloat64,
            Bstd.skipVarint, Bstd.skipInt16, Bstd.skipInt32, Bstd.skipInt64,
            Bstd.skipVarint, Bstd.skipUInt16, Bstd.skipUInt32, Bstd.skipUInt64,
            Bstd.skipString, Bstd.skipString, Bstd.skipBytes, Bstd.skipBytes
        ]
        
        let unmarshals: [(inout Int, [UInt8]) throws -> Any] = [
            Bstd.unmarshalBool, Bstd.unmarshalByte, Bstd.unmarshalFloat32, Bstd.unmarshalFloat64,
            Bstd.unmarshalInt, Bstd.unmarshalInt16, Bstd.unmarshalInt32, Bstd.unmarshalInt64,
            Bstd.unmarshalUInt, Bstd.unmarshalUInt16, Bstd.unmarshalUInt32, Bstd.unmarshalUInt64,
            Bstd.unmarshalString, Bstd.unmarshalUnsafeString, Bstd.unmarshalBytesCropped, Bstd.unmarshalBytesCopied
        ]
        
        let buffer = try marshalAll(s: totalSize, values: values, marshals: marshals)
        try skipAll(buffer, skippers: skippers)
        try unmarshalAll(buffer, expectedValues: values, unmarshals: unmarshals)
    }

    func testErrBufTooSmall() {
        let buffers: [[UInt8]] = [
            [], [], [1, 2, 3], [1, 2, 3, 4, 5, 6, 7], [], [1], [1, 2, 3], [1, 2, 3, 4, 5, 6, 7],
            [], [1], [1, 2, 3], [1, 2, 3, 4, 5, 6, 7], [], [2, 0], [4, 1, 2, 3], [8, 1, 2, 3, 4, 5, 6, 7],
            [], [2, 0], [4, 1, 2, 3], [8, 1, 2, 3, 4, 5, 6, 7], [], [2, 0], [4, 1, 2, 3], [8, 1, 2, 3, 4, 5, 6, 7],
            [], [2, 0], [4, 1, 2, 3], [8, 1, 2, 3, 4, 5, 6, 7], [], [2, 0], [4, 1, 2, 3], [8, 1, 2, 3, 4, 5, 6, 7],
            [], [2, 0], [4, 1, 2, 3], [8, 1, 2, 3, 4, 5, 6, 7]
        ]
        
        let unmarshals: [(inout Int, [UInt8]) throws -> Any] = [
            Bstd.unmarshalBool, Bstd.unmarshalByte, Bstd.unmarshalFloat32, Bstd.unmarshalFloat64, Bstd.unmarshalInt,
            Bstd.unmarshalInt16, Bstd.unmarshalInt32, Bstd.unmarshalInt64, Bstd.unmarshalUInt, Bstd.unmarshalUInt16,
            Bstd.unmarshalUInt32, Bstd.unmarshalUInt64, Bstd.unmarshalString, Bstd.unmarshalString, Bstd.unmarshalString, Bstd.unmarshalString,
            Bstd.unmarshalUnsafeString, Bstd.unmarshalUnsafeString, Bstd.unmarshalUnsafeString, Bstd.unmarshalUnsafeString,
            Bstd.unmarshalBytesCropped, Bstd.unmarshalBytesCropped, Bstd.unmarshalBytesCropped, Bstd.unmarshalBytesCropped,
            Bstd.unmarshalBytesCopied, Bstd.unmarshalBytesCopied, Bstd.unmarshalBytesCopied, Bstd.unmarshalBytesCopied,
            { i, b in try Bstd.unmarshalSlice(at: &i, from: b, unmarshaler: Bstd.unmarshalByte) },
            { i, b in try Bstd.unmarshalSlice(at: &i, from: b, unmarshaler: Bstd.unmarshalByte) },
            { i, b in try Bstd.unmarshalSlice(at: &i, from: b, unmarshaler: Bstd.unmarshalByte) },
            { i, b in try Bstd.unmarshalSlice(at: &i, from: b, unmarshaler: Bstd.unmarshalByte) },
            { i, b in try Bstd.unmarshalMap(at: &i, from: b, kUnmarshaler: Bstd.unmarshalByte, vUnmarshaler: Bstd.unmarshalByte) },
            { i, b in try Bstd.unmarshalMap(at: &i, from: b, kUnmarshaler: Bstd.unmarshalByte, vUnmarshaler: Bstd.unmarshalByte) },
            { i, b in try Bstd.unmarshalMap(at: &i, from: b, kUnmarshaler: Bstd.unmarshalByte, vUnmarshaler: Bstd.unmarshalByte) },
            { i, b in try Bstd.unmarshalMap(at: &i, from: b, kUnmarshaler: Bstd.unmarshalByte, vUnmarshaler: Bstd.unmarshalByte) }
        ]
        
        for (i, unmarshal) in unmarshals.enumerated() {
            var index = 0
            // **BUG FIX**: Corrected the logic for expected errors. All these cases should throw .bufferTooSmall
            // because the operation is aborted before the terminator is even checked.
            XCTAssertThrowsError(try unmarshal(&index, buffers[i]), "Unmarshal at index \(i) should have thrown") { error in
                XCTAssertEqual(error as? BstdError, .bufferTooSmall, "Incorrect error type for unmarshal at index \(i)")
            }
        }
    }
    
    func testErrBufTooSmall_2() {
        let buffers: [[UInt8]] = [
            [], [2, 0], [], [2, 0], [], [2, 0], [], [2, 0],
            [], [10, 0, 0, 0, 1], [], [10, 0, 0, 0, 1]
        ]

        let unmarshals: [(inout Int, [UInt8]) throws -> Any] = [
            Bstd.unmarshalString, Bstd.unmarshalString,
            Bstd.unmarshalUnsafeString, Bstd.unmarshalUnsafeString,
            Bstd.unmarshalBytesCropped, Bstd.unmarshalBytesCropped,
            Bstd.unmarshalBytesCopied, Bstd.unmarshalBytesCopied,
            { i, b in try Bstd.unmarshalSlice(at: &i, from: b, unmarshaler: Bstd.unmarshalByte) },
            { i, b in try Bstd.unmarshalSlice(at: &i, from: b, unmarshaler: Bstd.unmarshalByte) },
            { i, b in try Bstd.unmarshalMap(at: &i, from: b, kUnmarshaler: Bstd.unmarshalByte, vUnmarshaler: Bstd.unmarshalByte) },
            { i, b in try Bstd.unmarshalMap(at: &i, from: b, kUnmarshaler: Bstd.unmarshalByte, vUnmarshaler: Bstd.unmarshalByte) }
        ]

        for (i, unmarshal) in unmarshals.enumerated() {
             var index = 0
             // **BUG FIX**: Corrected the logic for expected errors.
             XCTAssertThrowsError(try unmarshal(&index, buffers[i])) { error in
                let err = error as? BstdError
                XCTAssertEqual(err, .bufferTooSmall, "Incorrect error for unmarshal at index \(i)")
             }
        }
    }

    func testSlices() throws {
        let slice = ["sliceelement1", "sliceelement2", "sliceelement3"]
        let size = Bstd.sizeSlice(slice, sizer: Bstd.sizeString)
        var buffer = [UInt8](repeating: 0, count: size)
        var index = 0
        
        try Bstd.marshalSlice(slice, at: &index, into: &buffer, marshaler: Bstd.marshalString)
        
        try skipOnceVerify(buffer, skipper: Bstd.skipSlice)
        
        index = 0
        let retSlice = try Bstd.unmarshalSlice(at: &index, from: buffer, unmarshaler: Bstd.unmarshalString)
        
        XCTAssertEqual(slice, retSlice)
    }
    
    func testMaps() throws {
        let m = ["mapkey1": "mapvalue1", "mapkey2": "mapvalue2", "mapkey3": "mapvalue3"]
        
        let size = Bstd.sizeMap(m, kSizer: Bstd.sizeString, vSizer: Bstd.sizeString)
        var buffer = [UInt8](repeating: 0, count: size)
        var index = 0
        
        try Bstd.marshalMap(m, at: &index, into: &buffer, kMarshaler: Bstd.marshalString, vMarshaler: Bstd.marshalString)
        
        try skipOnceVerify(buffer, skipper: Bstd.skipMap)
        
        index = 0
        let retMap = try Bstd.unmarshalMap(at: &index, from: buffer, kUnmarshaler: Bstd.unmarshalString, vUnmarshaler: Bstd.unmarshalString)
        
        XCTAssertEqual(m, retMap)
    }

    func testEmptyString() throws {
        let str = ""
        let size = Bstd.sizeString(str)
        var buffer = [UInt8](repeating: 0, count: size)
        var index = 0
        
        try Bstd.marshalString(str, at: &index, into: &buffer)
        
        try skipOnceVerify(buffer, skipper: Bstd.skipString)
        
        index = 0
        let retStr = try Bstd.unmarshalString(at: &index, from: buffer)
        
        XCTAssertEqual(str, retStr)
    }

    func testLongString() throws {
        let str = String(repeating: "H", count: Int(UInt16.max) + 1)
        
        let size = Bstd.sizeString(str)
        var buffer = [UInt8](repeating: 0, count: size)
        var index = 0
        
        try Bstd.marshalString(str, at: &index, into: &buffer)
        
        try skipOnceVerify(buffer, skipper: Bstd.skipString)
        
        index = 0
        let retStr = try Bstd.unmarshalString(at: &index, from: buffer)
        
        XCTAssertEqual(str, retStr)
    }
    
    func testSkipVarint() {
        let tests: [(name: String, buf: [UInt8], wantN: Int, wantErr: BstdError?)] = [
            ("Valid single-byte varint", [0x05], 1, nil),
            ("Valid multi-byte varint", [0x80, 0x01], 2, nil),
            ("Buffer too small", [0x80], 0, .bufferTooSmall),
            ("Varint overflow", [0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x02], 0, .overflow),
            ("Varint ends exactly at buffer end", [0xAC, 0x02], 2, nil)
        ]
        
        for test in tests {
            var index = 0
            do {
                try Bstd.skipVarint(at: &index, in: test.buf)
                XCTAssertNil(test.wantErr, "\(test.name): Expected error but none was thrown.")
                XCTAssertEqual(index, test.wantN, "\(test.name): Incorrect final index.")
            } catch {
                XCTAssertEqual(error as? BstdError, test.wantErr, "\(test.name): Incorrect error thrown.")
            }
        }
    }
    
    func testUnmarshalInt() {
        let tests: [(name: String, buf: [UInt8], wantN: Int, wantVal: Int64, wantErr: BstdError?)] = [
            ("Valid small int (1)", [0x02], 1, 1, nil),
            ("Valid negative int (-2)", [0x03], 1, -2, nil),
            ("Valid multi-byte int (150)", [0xAC, 0x02], 2, 150, nil),
            ("Buffer too small", [0x80], 0, 0, .bufferTooSmall),
            ("Varint overflow", [0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x01], 0, 0, .overflow)
        ]
        
        for test in tests {
            var index = 0
            do {
                let value = try Bstd.unmarshalInt(at: &index, from: test.buf)
                XCTAssertNil(test.wantErr, "\(test.name): Expected error but none was thrown.")
                XCTAssertEqual(index, test.wantN, "\(test.name): Incorrect final index.")
                XCTAssertEqual(value, test.wantVal, "\(test.name): Incorrect value.")
            } catch {
                XCTAssertEqual(error as? BstdError, test.wantErr, "\(test.name): Incorrect error thrown.")
            }
        }
    }
    
    func testUnmarshalUint() {
        let tests: [(name: String, buf: [UInt8], wantN: Int, wantVal: UInt64, wantErr: BstdError?)] = [
            ("Valid small uint (7)", [0x07], 1, 7, nil),
            ("Valid multi-byte uint (300)", [0xAC, 0x02], 2, 300, nil),
            ("Buffer too small", [0x80], 0, 0, .bufferTooSmall),
            ("Varint overflow", [0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x01], 0, 0, .overflow)
        ]
        
        for test in tests {
            var index = 0
            do {
                let value = try Bstd.unmarshalUInt(at: &index, from: test.buf)
                XCTAssertNil(test.wantErr, "\(test.name): Expected error but none was thrown.")
                XCTAssertEqual(index, test.wantN, "\(test.name): Incorrect final index.")
                XCTAssertEqual(value, test.wantVal, "\(test.name): Incorrect value.")
            } catch {
                XCTAssertEqual(error as? BstdError, test.wantErr, "\(test.name): Incorrect error thrown.")
            }
        }
    }
}