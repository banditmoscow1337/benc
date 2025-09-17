import XCTest
@testable import benc

final class BstdComplexTests: XCTestCase {
    
    struct ComplexData: Equatable {
        var id: Int64
        var title: String
        var items: [SubItem]
        var metadata: [String: Int32]
        var subData: SubComplexData
        var largeBinaryData: [[UInt8]]
        var hugeList: [Int64]
        
        func sizePlain() -> Int {
            var s = 0
            s += Bstd.sizeInt(id)
            s += Bstd.sizeString(title)
            s += Bstd.sizeSlice(items) { $0.sizePlain() }
            s += Bstd.sizeMap(metadata) { Bstd.sizeString($0) } vSizer: { _ in Bstd.sizeInt32() }
            s += subData.sizePlain()
            s += Bstd.sizeSlice(largeBinaryData) { Bstd.sizeBytes($0) }
            s += Bstd.sizeFixedSlice(hugeList, elementSize: Bstd.sizeInt64())
            return s
        }
        
        func marshalPlain(into buffer: inout [UInt8], startingAt index: inout Int) throws {
            try Bstd.marshalInt(id, at: &index, into: &buffer)
            try Bstd.marshalString(title, at: &index, into: &buffer)
            try Bstd.marshalSlice(items, at: &index, into: &buffer) { item, idx, buf in
                try item.marshalPlain(into: &buf, startingAt: &idx)
            }
            try Bstd.marshalMap(metadata, at: &index, into: &buffer) { key, idx, buf in
                try Bstd.marshalString(key, at: &idx, into: &buf)
            } vMarshaler: { value, idx, buf in
                try Bstd.marshalInt32(value, at: &idx, into: &buf)
            }
            try subData.marshalPlain(into: &buffer, startingAt: &index)
            try Bstd.marshalSlice(largeBinaryData, at: &index, into: &buffer) { bytes, idx, buf in
                try Bstd.marshalBytes(bytes, at: &idx, into: &buf)
            }
            try Bstd.marshalSlice(hugeList, at: &index, into: &buffer) { value, idx, buf in
                try Bstd.marshalInt64(value, at: &idx, into: &buf)
            }
        }
        
        static func unmarshalPlain(from buffer: [UInt8], startingAt index: inout Int) throws -> Self {
            let id = try Bstd.unmarshalInt(at: &index, from: buffer)
            let title = try Bstd.unmarshalString(at: &index, from: buffer)
            let items = try Bstd.unmarshalSlice(at: &index, from: buffer) { idx, buf in
                try SubItem.unmarshalPlain(from: buf, startingAt: &idx)
            }
            let metadata = try Bstd.unmarshalMap(at: &index, from: buffer) { idx, buf in
                try Bstd.unmarshalString(at: &idx, from: buf)
            } vUnmarshaler: { idx, buf in
                try Bstd.unmarshalInt32(at: &idx, from: buf)
            }
            let subData = try SubComplexData.unmarshalPlain(from: buffer, startingAt: &index)
            let largeBinaryData = try Bstd.unmarshalSlice(at: &index, from: buffer) { idx, buf in
                try Bstd.unmarshalBytesCropped(at: &idx, from: buf)
            }
            let hugeList = try Bstd.unmarshalSlice(at: &index, from: buffer) { idx, buf in
                try Bstd.unmarshalInt64(at: &idx, from: buf)
            }
            
            return ComplexData(
                id: id,
                title: title,
                items: items,
                metadata: metadata,
                subData: subData,
                largeBinaryData: largeBinaryData,
                hugeList: hugeList
            )
        }
    }

    struct SubItem: Equatable {
        var subId: Int32
        var description: String
        var subItems: [SubSubItem]
        
        func sizePlain() -> Int {
            var s = 0
            s += Bstd.sizeInt32()
            s += Bstd.sizeString(description)
            s += Bstd.sizeSlice(subItems) { $0.sizePlain() }
            return s
        }
        
        func marshalPlain(into buffer: inout [UInt8], startingAt index: inout Int) throws {
            try Bstd.marshalInt32(subId, at: &index, into: &buffer)
            try Bstd.marshalString(description, at: &index, into: &buffer)
            try Bstd.marshalSlice(subItems, at: &index, into: &buffer) { item, idx, buf in
                try item.marshalPlain(into: &buf, startingAt: &idx)
            }
        }
        
        static func unmarshalPlain(from buffer: [UInt8], startingAt index: inout Int) throws -> Self {
            let subId = try Bstd.unmarshalInt32(at: &index, from: buffer)
            let description = try Bstd.unmarshalString(at: &index, from: buffer)
            let subItems = try Bstd.unmarshalSlice(at: &index, from: buffer) { idx, buf in
                try SubSubItem.unmarshalPlain(from: buf, startingAt: &idx)
            }
            
            return SubItem(
                subId: subId,
                description: description,
                subItems: subItems
            )
        }
    }

    struct SubSubItem: Equatable {
        var subSubId: String
        var subSubData: [UInt8]
        
        func sizePlain() -> Int {
            var s = 0
            s += Bstd.sizeString(subSubId)
            s += Bstd.sizeBytes(subSubData)
            return s
        }
        
        func marshalPlain(into buffer: inout [UInt8], startingAt index: inout Int) throws {
            try Bstd.marshalString(subSubId, at: &index, into: &buffer)
            try Bstd.marshalBytes(subSubData, at: &index, into: &buffer)
        }
        
        static func unmarshalPlain(from buffer: [UInt8], startingAt index: inout Int) throws -> Self {
            let subSubId = try Bstd.unmarshalString(at: &index, from: buffer)
            let subSubData = try Bstd.unmarshalBytesCropped(at: &index, from: buffer)
            
            return SubSubItem(
                subSubId: subSubId,
                subSubData: subSubData
            )
        }
    }

    struct SubComplexData: Equatable {
        var subId: Int32
        var subTitle: String
        var subBinaryData: [[UInt8]]
        var subItems: [SubItem]
        var subMetadata: [String: String]
        
        func sizePlain() -> Int {
            var s = 0
            s += Bstd.sizeInt32()
            s += Bstd.sizeString(subTitle)
            s += Bstd.sizeSlice(subBinaryData) { Bstd.sizeBytes($0) }
            s += Bstd.sizeSlice(subItems) { $0.sizePlain() }
            s += Bstd.sizeMap(subMetadata) { Bstd.sizeString($0) } vSizer: { Bstd.sizeString($0) }
            return s
        }
        
        func marshalPlain(into buffer: inout [UInt8], startingAt index: inout Int) throws {
            try Bstd.marshalInt32(subId, at: &index, into: &buffer)
            try Bstd.marshalString(subTitle, at: &index, into: &buffer)
            try Bstd.marshalSlice(subBinaryData, at: &index, into: &buffer) { bytes, idx, buf in
                try Bstd.marshalBytes(bytes, at: &idx, into: &buf)
            }
            try Bstd.marshalSlice(subItems, at: &index, into: &buffer) { item, idx, buf in
                try item.marshalPlain(into: &buf, startingAt: &idx)
            }
            try Bstd.marshalMap(subMetadata, at: &index, into: &buffer) { key, idx, buf in
                try Bstd.marshalString(key, at: &idx, into: &buf)
            } vMarshaler: { value, idx, buf in
                try Bstd.marshalString(value, at: &idx, into: &buf)
            }
        }
        
        static func unmarshalPlain(from buffer: [UInt8], startingAt index: inout Int) throws -> Self {
            let subId = try Bstd.unmarshalInt32(at: &index, from: buffer)
            let subTitle = try Bstd.unmarshalString(at: &index, from: buffer)
            let subBinaryData = try Bstd.unmarshalSlice(at: &index, from: buffer) { idx, buf in
                try Bstd.unmarshalBytesCropped(at: &idx, from: buf)
            }
            let subItems = try Bstd.unmarshalSlice(at: &index, from: buffer) { idx, buf in
                try SubItem.unmarshalPlain(from: buf, startingAt: &idx)
            }
            let subMetadata = try Bstd.unmarshalMap(at: &index, from: buffer) { idx, buf in
                try Bstd.unmarshalString(at: &idx, from: buf)
            } vUnmarshaler: { idx, buf in
                try Bstd.unmarshalString(at: &idx, from: buf)
            }
            
            return SubComplexData(
                subId: subId,
                subTitle: subTitle,
                subBinaryData: subBinaryData,
                subItems: subItems,
                subMetadata: subMetadata
            )
        }
    }

    func testComplex() throws {
        let data = ComplexData(
            id: 12345,
            title: "Example Complex Data",
            items: [
                SubItem(
                    subId: 1,
                    description: "SubItem 1",
                    subItems: [
                        SubSubItem(
                            subSubId: "subsub1",
                            subSubData: [0x01, 0x02, 0x03]
                        )
                    ]
                )
            ],
            metadata: [
                "key1": 10,
                "key2": 20
            ],
            subData: SubComplexData(
                subId: 999,
                subTitle: "Sub Complex Data",
                subBinaryData: [
                    [0x11, 0x22, 0x33],
                    [0x44, 0x55, 0x66]
                ],
                subItems: [
                    SubItem(
                        subId: 2,
                        description: "SubItem 2",
                        subItems: [
                            SubSubItem(
                                subSubId: "subsub2",
                                subSubData: [0xAA, 0xBB, 0xCC]
                            )
                        ]
                    )
                ],
                subMetadata: [
                    "meta1": "value1",
                    "meta2": "value2"
                ]
            ),
            largeBinaryData: [
                [0xFF, 0xEE, 0xDD]
            ],
            hugeList: [1000000, 2000000, 3000000]
        )
        
        let size = data.sizePlain()
        var buffer = [UInt8](repeating: 0, count: size)
        var index = 0
        
        try data.marshalPlain(into: &buffer, startingAt: &index)
        
        index = 0
        let retData = try ComplexData.unmarshalPlain(from: buffer, startingAt: &index)
        
        XCTAssertEqual(data, retData)
    }
}