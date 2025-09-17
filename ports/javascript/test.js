import {
  sizeString,
  sizeBytes,
  sizeBool,
  sizeByte,
  sizeFloat32,
  sizeFloat64,
  sizeInt,
  sizeInt16,
  sizeInt32,
  sizeInt64,
  sizeUint,
  sizeUint16,
  sizeUint32,
  sizeUint64,
  marshalBool,
  marshalByte,
  marshalFloat32,
  marshalFloat64,
  marshalInt,
  marshalInt16,
  marshalInt32,
  marshalInt64,
  marshalUint,
  marshalUint16,
  marshalUint32,
  marshalUint64,
  marshalString,
  marshalBytes,
  skipBool,
  skipByte,
  skipFloat32,
  skipFloat64,
  skipVarint,
  skipInt16,
  skipInt32,
  skipInt64,
  skipUint16,
  skipUint32,
  skipUint64,
  skipString,
  skipBytes,
  unmarshalBool,
  unmarshalByte,
  unmarshalFloat32,
  unmarshalFloat64,
  unmarshalInt,
  unmarshalInt16,
  unmarshalInt32,
  unmarshalInt64,
  unmarshalUint,
  unmarshalUint16,
  unmarshalUint32,
  unmarshalUint64,
  unmarshalString,
  unmarshalBytesCropped,
  unmarshalBytesCopied,
  ErrBufTooSmall,
  unmarshalSlice,
  unmarshalMap,
  skipSlice,
  skipMap,
  sizeSlice,
  marshalSlice,
  sizeMap,
  marshalMap,
  ErrOverflow,
} from "./std.js";

// Helper functions
function sizeAll(sizers) {
  let s = 0;
  for (const sizer of sizers) {
    const ts = sizer();
    if (ts === 0) {
      return 0;
    }
    s += ts;
  }
  return s;
}

function skipAll(b, skippers) {
  let n = 0;

  for (let i = 0; i < skippers.length; i++) {
    const skipper = skippers[i];
    n = skipper(n, b);
  }

  if (n !== b.length) {
    throw new Error(
      "skip failed: something doesn't match in the marshal- and skip progress"
    );
  }
}

function skipOnceVerify(b, skipper) {
  const n = skipper(0, b);

  if (n !== b.length) {
    throw new Error(
      "skip failed: something doesn't match in the marshal- and skip progress"
    );
  }
}

function marshalAll(s, values, marshals) {
  let n = 0;
  const b = new Uint8Array(s);

  for (let i = 0; i < marshals.length; i++) {
    const marshal = marshals[i];
    n = marshal(n, b, values[i]);
    if (n === 0) {
      throw new Error("marshal failed");
    }
  }

  if (n !== b.length) {
    throw new Error(
      "marshal failed: something doesn't match in the marshal- and size progress"
    );
  }

  return b;
}

function unmarshalAllVerifyError(expectedError, buffers, unmarshals) {
  for (let i = 0; i < unmarshals.length; i++) {
    const unmarshal = unmarshals[i];
    try {
      unmarshal(0, buffers[i]);
      throw new Error(`(unmarshal) at idx ${i}: expected an error`);
    } catch (err) {
      if (
        err !== expectedError &&
        !(err instanceof Error && err.message === expectedError.message)
      ) {
        throw new Error(
          `(unmarshal) at idx ${i}: expected a ${expectedError.message} error, got ${err.message}`
        );
      }
    }
  }
}

function skipAllVerifyError(expectedError, buffers, skippers) {
  for (let i = 0; i < skippers.length; i++) {
    const skipper = skippers[i];
    try {
      skipper(0, buffers[i]);
      throw new Error(`(skip) at idx ${i}: expected an error`);
    } catch (err) {
      if (
        err !== expectedError &&
        !(err instanceof Error && err.message === expectedError.message)
      ) {
        throw new Error(
          `(skip) at idx ${i}: expected a ${expectedError.message} error, got ${err.message}`
        );
      }
    }
  }
}

// Helper function to create exact float32 values
function exactFloat32(v) {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setFloat32(0, v, true);
  return view.getFloat32(0, true);
}

// Test functions
function testDataTypes() {
  const testStr = "Hello World!";
  const sizeTestStr = function () {
    return sizeString(testStr);
  };

  const testBs = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const sizeTestBs = function () {
    return sizeBytes(testBs);
  };

  // Use exact values that can be precisely represented in both Go and JavaScript
  const values = [
    true,
    128, // byte
    exactFloat32(0.7581793), // float32 - exact value
    0.7581793163390633, // float64 - exact value
    2147483647, // int32 max - exact value
    -1, // int16
    Math.floor(Math.random() * Math.pow(2, 31)),
    Math.floor(Math.random() * Math.pow(2, 53)), // int64 - within JS safe integer range
    Math.pow(2, 32) - 1, // uint max
    160, // uint16
    Math.floor(Math.random() * Math.pow(2, 32)),
    Math.floor(Math.random() * Math.pow(2, 53)), // uint64 - within JS safe integer range
    testStr,
    testStr,
    testBs,
    testBs,
  ];

  const s = sizeAll([
    sizeBool,
    sizeByte,
    sizeFloat32,
    sizeFloat64,
    function () {
      return sizeInt(2147483647);
    }, // Use exact value
    sizeInt16,
    sizeInt32,
    sizeInt64,
    function () {
      return sizeUint(Math.pow(2, 32) - 1);
    },
    sizeUint16,
    sizeUint32,
    sizeUint64,
    sizeTestStr,
    sizeTestStr,
    sizeTestBs,
    sizeTestBs,
  ]);

  const b = marshalAll(s, values, [
    function (n, b, v) {
      return marshalBool(n, b, v);
    },
    function (n, b, v) {
      return marshalByte(n, b, v);
    },
    function (n, b, v) {
      return marshalFloat32(n, b, v);
    },
    function (n, b, v) {
      return marshalFloat64(n, b, v);
    },
    function (n, b, v) {
      return marshalInt(n, b, v);
    },
    function (n, b, v) {
      return marshalInt16(n, b, v);
    },
    function (n, b, v) {
      return marshalInt32(n, b, v);
    },
    function (n, b, v) {
      return marshalInt64(n, b, v);
    },
    function (n, b, v) {
      return marshalUint(n, b, v);
    },
    function (n, b, v) {
      return marshalUint16(n, b, v);
    },
    function (n, b, v) {
      return marshalUint32(n, b, v);
    },
    function (n, b, v) {
      return marshalUint64(n, b, v);
    },
    function (n, b, v) {
      return marshalString(n, b, v);
    },
    function (n, b, v) {
      return marshalString(n, b, v);
    },
    function (n, b, v) {
      return marshalBytes(n, b, v);
    },
    function (n, b, v) {
      return marshalBytes(n, b, v);
    },
  ]);

  skipAll(b, [
    function (n, b) {
      return skipBool(n, b);
    },
    function (n, b) {
      return skipByte(n, b);
    },
    function (n, b) {
      return skipFloat32(n, b);
    },
    function (n, b) {
      return skipFloat64(n, b);
    },
    function (n, b) {
      return skipVarint(n, b);
    },
    function (n, b) {
      return skipInt16(n, b);
    },
    function (n, b) {
      return skipInt32(n, b);
    },
    function (n, b) {
      return skipInt64(n, b);
    },
    function (n, b) {
      return skipVarint(n, b);
    },
    function (n, b) {
      return skipUint16(n, b);
    },
    function (n, b) {
      return skipUint32(n, b);
    },
    function (n, b) {
      return skipUint64(n, b);
    },
    function (n, b) {
      return skipString(n, b);
    },
    function (n, b) {
      return skipString(n, b);
    },
    function (n, b) {
      return skipBytes(n, b);
    },
    function (n, b) {
      return skipBytes(n, b);
    },
  ]);

  // Enhanced unmarshalAll with exact value comparison
  let n = 0;

  for (let i = 0; i < values.length; i++) {
    let newN;
    let v;

    switch (i) {
      case 0: // bool
        var result = unmarshalBool(n, b);
        newN = result[0];
        v = result[1];
        break;
      case 1: // byte
        var result = unmarshalByte(n, b);
        newN = result[0];
        v = result[1];
        break;
      case 2: // float32
        var result = unmarshalFloat32(n, b);
        newN = result[0];
        v = result[1];
        // Exact comparison for float32 values
        if (v !== values[i]) {
          throw new Error(
            `(unmarshal) at idx ${i}: no match: expected ${values[i]}, got ${v}`
          );
        }
        n = newN;
        continue;
      case 3: // float64
        var result = unmarshalFloat64(n, b);
        newN = result[0];
        v = result[1];
        // Exact comparison for float64 values
        if (v !== values[i]) {
          throw new Error(
            `(unmarshal) at idx ${i}: no match: expected ${values[i]}, got ${v}`
          );
        }
        n = newN;
        continue;
      case 4: // int
        var result = unmarshalInt(n, b);
        newN = result[0];
        v = result[1];
        break;
      case 5: // int16
        var result = unmarshalInt16(n, b);
        newN = result[0];
        v = result[1];
        break;
      case 6: // int32
        var result = unmarshalInt32(n, b);
        newN = result[0];
        v = result[1];
        break;
      case 7: // int64
        var result = unmarshalInt64(n, b);
        newN = result[0];
        v = result[1];
        break;
      case 8: // uint
        var result = unmarshalUint(n, b);
        newN = result[0];
        v = result[1];
        break;
      case 9: // uint16
        var result = unmarshalUint16(n, b);
        newN = result[0];
        v = result[1];
        break;
      case 10: // uint32
        var result = unmarshalUint32(n, b);
        newN = result[0];
        v = result[1];
        break;
      case 11: // uint64
        var result = unmarshalUint64(n, b);
        newN = result[0];
        v = result[1];
        break;
      case 12: // string
        var result = unmarshalString(n, b);
        newN = result[0];
        v = result[1];
        break;
      case 13: // string
        var result = unmarshalString(n, b);
        newN = result[0];
        v = result[1];
        break;
      case 14: // bytes
        var result = unmarshalBytesCropped(n, b);
        newN = result[0];
        v = result[1];
        break;
      case 15: // bytes
        var result = unmarshalBytesCopied(n, b);
        newN = result[0];
        v = result[1];
        break;
      default:
        throw new Error("Invalid index");
    }

    if (JSON.stringify(v) !== JSON.stringify(values[i])) {
      throw new Error(
        `(unmarshal) at idx ${i}: no match: expected ${JSON.stringify(
          values[i]
        )}, got ${JSON.stringify(v)}`
      );
    }

    n = newN;
  }

  if (n !== b.length) {
    throw new Error(
      "unmarshal failed: something doesn't match in the marshal- and unmarshal progress"
    );
  }
}

function testErrBufTooSmall() {
  const buffers = [
    new Uint8Array([]),
    new Uint8Array([]),
    new Uint8Array([1, 2, 3]),
    new Uint8Array([1, 2, 3, 4, 5, 6, 7]),
    new Uint8Array([]),
    new Uint8Array([1]),
    new Uint8Array([1, 2, 3]),
    new Uint8Array([1, 2, 3, 4, 5, 6, 7]),
    new Uint8Array([]),
    new Uint8Array([1]),
    new Uint8Array([1, 2, 3]),
    new Uint8Array([1, 2, 3, 4, 5, 6, 7]),
    new Uint8Array([]),
    new Uint8Array([2, 0]),
    new Uint8Array([4, 1, 2, 3]),
    new Uint8Array([8, 1, 2, 3, 4, 5, 6, 7]),
    new Uint8Array([]),
    new Uint8Array([2, 0]),
    new Uint8Array([4, 1, 2, 3]),
    new Uint8Array([8, 1, 2, 3, 4, 5, 6, 7]),
    new Uint8Array([]),
    new Uint8Array([2, 0]),
    new Uint8Array([4, 1, 2, 3]),
    new Uint8Array([8, 1, 2, 3, 4, 5, 6, 7]),
    new Uint8Array([]),
    new Uint8Array([2, 0]),
    new Uint8Array([4, 1, 2, 3]),
    new Uint8Array([8, 1, 2, 3, 4, 5, 6, 7]),
    new Uint8Array([]),
    new Uint8Array([2, 0]),
    new Uint8Array([4, 1, 2, 3]),
    new Uint8Array([8, 1, 2, 3, 4, 5, 6, 7]),
    new Uint8Array([]),
    new Uint8Array([2, 0]),
    new Uint8Array([4, 1, 2, 3]),
    new Uint8Array([8, 1, 2, 3, 4, 5, 6, 7]),
  ];

  unmarshalAllVerifyError(ErrBufTooSmall, buffers, [
    function (n, b) {
      return unmarshalBool(n, b);
    },
    function (n, b) {
      return unmarshalByte(n, b);
    },
    function (n, b) {
      return unmarshalFloat32(n, b);
    },
    function (n, b) {
      return unmarshalFloat64(n, b);
    },
    function (n, b) {
      return unmarshalInt(n, b);
    },
    function (n, b) {
      return unmarshalInt16(n, b);
    },
    function (n, b) {
      return unmarshalInt32(n, b);
    },
    function (n, b) {
      return unmarshalInt64(n, b);
    },
    function (n, b) {
      return unmarshalUint(n, b);
    },
    function (n, b) {
      return unmarshalUint16(n, b);
    },
    function (n, b) {
      return unmarshalUint32(n, b);
    },
    function (n, b) {
      return unmarshalUint64(n, b);
    },
    function (n, b) {
      return unmarshalString(n, b);
    },
    function (n, b) {
      return unmarshalString(n, b);
    },
    function (n, b) {
      return unmarshalString(n, b);
    },
    function (n, b) {
      return unmarshalString(n, b);
    },
    function (n, b) {
      return unmarshalString(n, b);
    },
    function (n, b) {
      return unmarshalString(n, b);
    },
    function (n, b) {
      return unmarshalString(n, b);
    },
    function (n, b) {
      return unmarshalString(n, b);
    },
    function (n, b) {
      return unmarshalBytesCropped(n, b);
    },
    function (n, b) {
      return unmarshalBytesCropped(n, b);
    },
    function (n, b) {
      return unmarshalBytesCropped(n, b);
    },
    function (n, b) {
      return unmarshalBytesCropped(n, b);
    },
    function (n, b) {
      return unmarshalBytesCopied(n, b);
    },
    function (n, b) {
      return unmarshalBytesCopied(n, b);
    },
    function (n, b) {
      return unmarshalBytesCopied(n, b);
    },
    function (n, b) {
      return unmarshalBytesCopied(n, b);
    },
    function (n, b) {
      return unmarshalSlice(n, b, unmarshalByte);
    },
    function (n, b) {
      return unmarshalSlice(n, b, unmarshalByte);
    },
    function (n, b) {
      return unmarshalSlice(n, b, unmarshalByte);
    },
    function (n, b) {
      return unmarshalSlice(n, b, unmarshalByte);
    },
    function (n, b) {
      return unmarshalMap(n, b, unmarshalByte, unmarshalByte);
    },
    function (n, b) {
      return unmarshalMap(n, b, unmarshalByte, unmarshalByte);
    },
    function (n, b) {
      return unmarshalMap(n, b, unmarshalByte, unmarshalByte);
    },
    function (n, b) {
      return unmarshalMap(n, b, unmarshalByte, unmarshalByte);
    },
  ]);

  const skipSliceOfBytes = function (n, b) {
    return skipSlice(n, b);
  };
  const skipMapOfBytes = function (n, b) {
    return skipMap(n, b);
  };

  skipAllVerifyError(ErrBufTooSmall, buffers, [
    skipBool,
    skipByte,
    skipFloat32,
    skipFloat64,
    skipVarint,
    skipInt16,
    skipInt32,
    skipInt64,
    skipVarint,
    skipUint16,
    skipUint32,
    skipUint64,
    skipString,
    skipString,
    skipString,
    skipString,
    skipString,
    skipString,
    skipString,
    skipString,
    skipBytes,
    skipBytes,
    skipBytes,
    skipBytes,
    skipSliceOfBytes,
    skipSliceOfBytes,
    skipSliceOfBytes,
    skipSliceOfBytes,
    skipMapOfBytes,
    skipMapOfBytes,
    skipMapOfBytes,
    skipMapOfBytes,
  ]);
}

function testSlices() {
  const slice = [
    "sliceelement1",
    "sliceelement2",
    "sliceelement3",
    "sliceelement4",
    "sliceelement5",
  ];
  const s = sizeSlice(slice, sizeString);
  const buf = new Uint8Array(s);
  marshalSlice(0, buf, slice, marshalString);

  skipOnceVerify(buf, skipSlice);

  const result = unmarshalSlice(0, buf, unmarshalString);
  const retSlice = result[1];

  if (JSON.stringify(retSlice) !== JSON.stringify(slice)) {
    throw new Error("no match!");
  }
}

function testMaps() {
  const m = new Map();
  m.set("mapkey1", "mapvalue1");
  m.set("mapkey2", "mapvalue2");
  m.set("mapkey3", "mapvalue3");
  m.set("mapkey4", "mapvalue4");
  m.set("mapkey5", "mapvalue5");

  const s = sizeMap(m, sizeString, sizeString);
  const buf = new Uint8Array(s);
  marshalMap(0, buf, m, marshalString, marshalString);

  skipOnceVerify(buf, skipMap);

  const result = unmarshalMap(0, buf, unmarshalString, unmarshalString);
  const retMap = result[1];

  if (
    JSON.stringify(Array.from(retMap.entries())) !==
    JSON.stringify(Array.from(m.entries()))
  ) {
    throw new Error("no match!");
  }
}

function testMaps2() {
  const m = new Map();
  m.set(1, "mapvalue1");
  m.set(2, "mapvalue2");
  m.set(3, "mapvalue3");
  m.set(4, "mapvalue4");
  m.set(5, "mapvalue5");

  const s = sizeMap(m, sizeInt32, sizeString);
  const buf = new Uint8Array(s);
  marshalMap(0, buf, m, marshalInt32, marshalString);

  skipOnceVerify(buf, skipMap);

  const result = unmarshalMap(0, buf, unmarshalInt32, unmarshalString);
  const retMap = result[1];

  if (
    JSON.stringify(Array.from(retMap.entries())) !==
    JSON.stringify(Array.from(m.entries()))
  ) {
    throw new Error("no match!");
  }
}

function testEmptyString() {
  const str = "";

  const s = sizeString(str);
  const buf = new Uint8Array(s);
  marshalString(0, buf, str);

  skipOnceVerify(buf, skipString);

  const result = unmarshalString(0, buf);
  const retStr = result[1];

  if (retStr !== str) {
    throw new Error("no match!");
  }
}

function testLongString() {
  let str = "";
  for (let i = 0; i < 65536 + 1; i++) {
    str += "H";
  }

  const s = sizeString(str);
  const buf = new Uint8Array(s);
  marshalString(0, buf, str);

  skipOnceVerify(buf, skipString);

  const result = unmarshalString(0, buf);
  const retStr = result[1];

  if (retStr !== str) {
    throw new Error("no match!");
  }
}

function testSkipVarint() {
  const tests = [
    {
      name: "Valid single-byte varint",
      buf: new Uint8Array([0x05]),
      n: 0,
      wantN: 1,
      wantErr: null,
    },
    {
      name: "Valid multi-byte varint",
      buf: new Uint8Array([0x80, 0x01]),
      n: 0,
      wantN: 2,
      wantErr: null,
    },
    {
      name: "Buffer too small",
      buf: new Uint8Array([0x80]),
      n: 0,
      wantN: 0,
      wantErr: ErrBufTooSmall,
    },
    {
      name: "Varint overflow",
      buf: new Uint8Array([
        0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80,
      ]),
      n: 0,
      wantN: 0,
      wantErr: ErrOverflow,
    },
  ];

  for (const test of tests) {
    try {
      const gotN = skipVarint(test.n, test.buf);
      if (test.wantErr) {
        throw new Error(`Expected error ${test.wantErr.message}`);
      }
      if (gotN !== test.wantN) {
        throw new Error(`Expected ${test.wantN}, got ${gotN}`);
      }
    } catch (err) {
      if (!test.wantErr || err !== test.wantErr) {
        throw new Error(`Test ${test.name} failed: ${err.message}`);
      }
    }
  }
}

function testUnmarshalInt() {
  const tests = [
    {
      name: "Valid small int",
      buf: new Uint8Array([0x02]),
      n: 0,
      wantN: 1,
      wantVal: 1,
      wantErr: null,
    },
    {
      name: "Valid negative int",
      buf: new Uint8Array([0x03]),
      n: 0,
      wantN: 1,
      wantVal: -2,
      wantErr: null,
    },
    {
      name: "Valid multi-byte int",
      buf: new Uint8Array([0xac, 0x02]),
      n: 0,
      wantN: 2,
      wantVal: 150,
      wantErr: null,
    },
    {
      name: "Buffer too small",
      buf: new Uint8Array([0x80]),
      n: 0,
      wantN: 0,
      wantVal: 0,
      wantErr: ErrBufTooSmall,
    },
    {
      name: "Varint overflow",
      buf: new Uint8Array([
        0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80,
      ]),
      n: 0,
      wantN: 0,
      wantVal: 0,
      wantErr: ErrOverflow,
    },
  ];

  for (const test of tests) {
    try {
      const result = unmarshalInt(test.n, test.buf);
      const gotN = result[0];
      const gotVal = result[1];
      if (test.wantErr) {
        throw new Error(`Expected error ${test.wantErr.message}`);
      }
      if (gotN !== test.wantN || gotVal !== test.wantVal) {
        throw new Error(
          `Expected (${test.wantN}, ${test.wantVal}), got (${gotN}, ${gotVal})`
        );
      }
    } catch (err) {
      if (!test.wantErr || err !== test.wantErr) {
        throw new Error(`Test ${test.name} failed: ${err.message}`);
      }
    }
  }
}

function testUnmarshalUint() {
  const tests = [
    {
      name: "Valid small uint",
      buf: new Uint8Array([0x07]),
      n: 0,
      wantN: 1,
      wantVal: 7,
      wantErr: null,
    },
    {
      name: "Valid multi-byte uint",
      buf: new Uint8Array([0xac, 0x02]),
      n: 0,
      wantN: 2,
      wantVal: 300,
      wantErr: null,
    },
    {
      name: "Buffer too small",
      buf: new Uint8Array([0x80]),
      n: 0,
      wantN: 0,
      wantVal: 0,
      wantErr: ErrBufTooSmall,
    },
    {
      name: "Varint overflow",
      buf: new Uint8Array([
        0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80,
      ]),
      n: 0,
      wantN: 0,
      wantVal: 0,
      wantErr: ErrOverflow,
    },
  ];

  for (const test of tests) {
    try {
      const result = unmarshalUint(test.n, test.buf);
      const gotN = result[0];
      const gotVal = result[1];
      if (test.wantErr) {
        throw new Error(`Expected error ${test.wantErr.message}`);
      }
      if (gotN !== test.wantN || gotVal !== test.wantVal) {
        throw new Error(
          `Expected (${test.wantN}, ${test.wantVal}), got (${gotN}, ${gotVal})`
        );
      }
    } catch (err) {
      if (!test.wantErr || err !== test.wantErr) {
        throw new Error(`Test ${test.name} failed: ${err.message}`);
      }
    }
  }
}

// Run all tests
try {
  testDataTypes();
  console.log("testDataTypes passed");

  testErrBufTooSmall();
  console.log("testErrBufTooSmall passed");

  testSlices();
  console.log("testSlices passed");

  testMaps();
  console.log("testMaps passed");

  testMaps2();
  console.log("testMaps2 passed");

  testEmptyString();
  console.log("testEmptyString passed");

  testLongString();
  console.log("testLongString passed");

  testSkipVarint();
  console.log("testSkipVarint passed");

  testUnmarshalInt();
  console.log("testUnmarshalInt passed");

  testUnmarshalUint();
  console.log("testUnmarshalUint passed");

  console.log("All tests passed!");
} catch (err) {
  console.error("Test failed:", err.message);
  process.exit(1);
}
