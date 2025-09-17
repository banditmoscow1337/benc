import * as bstd from './std.ts';

// Helper functions
function sizeAll(sizers: Array<() => number>): number {
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

function skipAll(b: Uint8Array, skippers: Array<(n: number, b: Uint8Array) => number>): void {
  let n = 0;

  for (let i = 0; i < skippers.length; i++) {
    const skipper = skippers[i];
    n = skipper(n, b);
  }

  if (n !== b.length) {
    throw new Error("skip failed: something doesn't match in the marshal- and skip progress");
  }
}

function skipOnceVerify(b: Uint8Array, skipper: (n: number, b: Uint8Array) => number): void {
  const n = skipper(0, b);

  if (n !== b.length) {
    throw new Error("skip failed: something doesn't match in the marshal- and skip progress");
  }
}

function marshalAll(s: number, values: any[], marshals: Array<(n: number, b: Uint8Array, v: any) => number>): Uint8Array {
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
    throw new Error("marshal failed: something doesn't match in the marshal- and size progress");
  }

  return b;
}

function unmarshalAllVerifyError(expectedError: Error, buffers: Uint8Array[], unmarshals: Array<(n: number, b: Uint8Array) => [number, any]>): void {
  for (let i = 0; i < unmarshals.length; i++) {
    const unmarshal = unmarshals[i];
    try {
      unmarshal(0, buffers[i]);
      throw new Error(`(unmarshal) at idx ${i}: expected an error`);
    } catch (err) {
      if (err !== expectedError && !(err instanceof Error && err.message === expectedError.message)) {
        throw new Error(`(unmarshal) at idx ${i}: expected a ${expectedError.message} error, got ${err.message}`);
      }
    }
  }
}

function skipAllVerifyError(expectedError: Error, buffers: Uint8Array[], skippers: Array<(n: number, b: Uint8Array) => number>): void {
  for (let i = 0; i < skippers.length; i++) {
    const skipper = skippers[i];
    try {
      skipper(0, buffers[i]);
      throw new Error(`(skip) at idx ${i}: expected an error`);
    } catch (err) {
      if (err !== expectedError && !(err instanceof Error && err.message === expectedError.message)) {
        throw new Error(`(skip) at idx ${i}: expected a ${expectedError.message} error, got ${err.message}`);
      }
    }
  }
}

// Test functions
// Enhanced test function with BigInt for large integers
function testDataTypes(): void {
  const testStr = "Hello World!";
  const sizeTestStr = (): number => bstd.sizeString(testStr);

  const testBs = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const sizeTestBs = (): number => bstd.sizeBytes(testBs);

  // Use exact values that can be precisely represented in both Go and JavaScript
  const values = [
    true,
    128, // byte
    bstd.exactFloat32(0.7581793), // float32 - exact value
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
    bstd.sizeBool,
    bstd.sizeByte,
    bstd.sizeFloat32,
    bstd.sizeFloat64,
    () => bstd.sizeInt(2147483647), // Use exact value
    bstd.sizeInt16,
    bstd.sizeInt32,
    bstd.sizeInt64,
    () => bstd.sizeUint(Math.pow(2, 32) - 1),
    bstd.sizeUint16,
    bstd.sizeUint32,
    bstd.sizeUint64,
    sizeTestStr,
    sizeTestStr,
    sizeTestBs,
    sizeTestBs,
  ]);

  const b = marshalAll(s, values, [
    (n: number, b: Uint8Array, v: any) => bstd.marshalBool(n, b, v as boolean),
    (n: number, b: Uint8Array, v: any) => bstd.marshalByte(n, b, v as number),
    (n: number, b: Uint8Array, v: any) => bstd.marshalFloat32(n, b, v as number),
    (n: number, b: Uint8Array, v: any) => bstd.marshalFloat64(n, b, v as number),
    (n: number, b: Uint8Array, v: any) => bstd.marshalInt(n, b, v as number),
    (n: number, b: Uint8Array, v: any) => bstd.marshalInt16(n, b, v as number),
    (n: number, b: Uint8Array, v: any) => bstd.marshalInt32(n, b, v as number),
    (n: number, b: Uint8Array, v: any) => bstd.marshalInt64(n, b, v as number),
    (n: number, b: Uint8Array, v: any) => bstd.marshalUint(n, b, v as number),
    (n: number, b: Uint8Array, v: any) => bstd.marshalUint16(n, b, v as number),
    (n: number, b: Uint8Array, v: any) => bstd.marshalUint32(n, b, v as number),
    (n: number, b: Uint8Array, v: any) => bstd.marshalUint64(n, b, v as number),
    (n: number, b: Uint8Array, v: any) => bstd.marshalString(n, b, v as string),
    (n: number, b: Uint8Array, v: any) => bstd.marshalString(n, b, v as string),
    (n: number, b: Uint8Array, v: any) => bstd.marshalBytes(n, b, v as Uint8Array),
    (n: number, b: Uint8Array, v: any) => bstd.marshalBytes(n, b, v as Uint8Array),
  ]);

  skipAll(b, [
    (n: number, b: Uint8Array) => bstd.skipBool(n, b),
    (n: number, b: Uint8Array) => bstd.skipByte(n, b),
    (n: number, b: Uint8Array) => bstd.skipFloat32(n, b),
    (n: number, b: Uint8Array) => bstd.skipFloat64(n, b),
    (n: number, b: Uint8Array) => bstd.skipVarint(n, b),
    (n: number, b: Uint8Array) => bstd.skipInt16(n, b),
    (n: number, b: Uint8Array) => bstd.skipInt32(n, b),
    (n: number, b: Uint8Array) => bstd.skipInt64(n, b),
    (n: number, b: Uint8Array) => bstd.skipVarint(n, b),
    (n: number, b: Uint8Array) => bstd.skipUint16(n, b),
    (n: number, b: Uint8Array) => bstd.skipUint32(n, b),
    (n: number, b: Uint8Array) => bstd.skipUint64(n, b),
    (n: number, b: Uint8Array) => bstd.skipString(n, b),
    (n: number, b: Uint8Array) => bstd.skipString(n, b),
    (n: number, b: Uint8Array) => bstd.skipBytes(n, b),
    (n: number, b: Uint8Array) => bstd.skipBytes(n, b),
  ]);

  // Enhanced unmarshalAll with exact value comparison
  let n = 0;

  for (let i = 0; i < values.length; i++) {
    let newN: number;
    let v: any;
    
    switch (i) {
      case 0: // bool
        [newN, v] = bstd.unmarshalBool(n, b);
        break;
      case 1: // byte
        [newN, v] = bstd.unmarshalByte(n, b);
        break;
      case 2: // float32
        [newN, v] = bstd.unmarshalFloat32(n, b);
        // Exact comparison for float32 values
        if (v !== values[i]) {
          throw new Error(`(unmarshal) at idx ${i}: no match: expected ${values[i]}, got ${v}`);
        }
        n = newN;
        continue;
      case 3: // float64
        [newN, v] = bstd.unmarshalFloat64(n, b);
        // Exact comparison for float64 values
        if (v !== values[i]) {
          throw new Error(`(unmarshal) at idx ${i}: no match: expected ${values[i]}, got ${v}`);
        }
        n = newN;
        continue;
      case 4: // int
        [newN, v] = bstd.unmarshalInt(n, b);
        break;
      case 5: // int16
        [newN, v] = bstd.unmarshalInt16(n, b);
        break;
      case 6: // int32
        [newN, v] = bstd.unmarshalInt32(n, b);
        break;
      case 7: // int64
        [newN, v] = bstd.unmarshalInt64(n, b);
        break;
      case 8: // uint
        [newN, v] = bstd.unmarshalUint(n, b);
        break;
      case 9: // uint16
        [newN, v] = bstd.unmarshalUint16(n, b);
        break;
      case 10: // uint32
        [newN, v] = bstd.unmarshalUint32(n, b);
        break;
      case 11: // uint64
        [newN, v] = bstd.unmarshalUint64(n, b);
        break;
      case 12: // string
        [newN, v] = bstd.unmarshalString(n, b);
        break;
      case 13: // string
        [newN, v] = bstd.unmarshalString(n, b);
        break;
      case 14: // bytes
        [newN, v] = bstd.unmarshalBytesCropped(n, b);
        break;
      case 15: // bytes
        [newN, v] = bstd.unmarshalBytesCopied(n, b);
        break;
      default:
        throw new Error("Invalid index");
    }
    
    if (JSON.stringify(v) !== JSON.stringify(values[i])) {
      throw new Error(`(unmarshal) at idx ${i}: no match: expected ${JSON.stringify(values[i])}, got ${JSON.stringify(v)}`);
    }
    
    n = newN;
  }

  if (n !== b.length) {
    throw new Error("unmarshal failed: something doesn't match in the marshal- and unmarshal progress");
  }
}

function testErrBufTooSmall(): void {
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

  unmarshalAllVerifyError(bstd.ErrBufTooSmall, buffers, [
    (n: number, b: Uint8Array) => bstd.unmarshalBool(n, b),
    (n: number, b: Uint8Array) => bstd.unmarshalByte(n, b),
    (n: number, b: Uint8Array) => bstd.unmarshalFloat32(n, b),
    (n: number, b: Uint8Array) => bstd.unmarshalFloat64(n, b),
    (n: number, b: Uint8Array) => bstd.unmarshalInt(n, b),
    (n: number, b: Uint8Array) => bstd.unmarshalInt16(n, b),
    (n: number, b: Uint8Array) => bstd.unmarshalInt32(n, b),
    (n: number, b: Uint8Array) => bstd.unmarshalInt64(n, b),
    (n: number, b: Uint8Array) => bstd.unmarshalUint(n, b),
    (n: number, b: Uint8Array) => bstd.unmarshalUint16(n, b),
    (n: number, b: Uint8Array) => bstd.unmarshalUint32(n, b),
    (n: number, b: Uint8Array) => bstd.unmarshalUint64(n, b),
    (n: number, b: Uint8Array) => bstd.unmarshalString(n, b),
    (n: number, b: Uint8Array) => bstd.unmarshalString(n, b),
    (n: number, b: Uint8Array) => bstd.unmarshalString(n, b),
    (n: number, b: Uint8Array) => bstd.unmarshalString(n, b),
    (n: number, b: Uint8Array) => bstd.unmarshalString(n, b),
    (n: number, b: Uint8Array) => bstd.unmarshalString(n, b),
    (n: number, b: Uint8Array) => bstd.unmarshalString(n, b),
    (n: number, b: Uint8Array) => bstd.unmarshalString(n, b),
    (n: number, b: Uint8Array) => bstd.unmarshalBytesCropped(n, b),
    (n: number, b: Uint8Array) => bstd.unmarshalBytesCropped(n, b),
    (n: number, b: Uint8Array) => bstd.unmarshalBytesCropped(n, b),
    (n: number, b: Uint8Array) => bstd.unmarshalBytesCropped(n, b),
    (n: number, b: Uint8Array) => bstd.unmarshalBytesCopied(n, b),
    (n: number, b: Uint8Array) => bstd.unmarshalBytesCopied(n, b),
    (n: number, b: Uint8Array) => bstd.unmarshalBytesCopied(n, b),
    (n: number, b: Uint8Array) => bstd.unmarshalBytesCopied(n, b),
    (n: number, b: Uint8Array) => bstd.unmarshalSlice(n, b, bstd.unmarshalByte),
    (n: number, b: Uint8Array) => bstd.unmarshalSlice(n, b, bstd.unmarshalByte),
    (n: number, b: Uint8Array) => bstd.unmarshalSlice(n, b, bstd.unmarshalByte),
    (n: number, b: Uint8Array) => bstd.unmarshalSlice(n, b, bstd.unmarshalByte),
    (n: number, b: Uint8Array) => bstd.unmarshalMap(n, b, bstd.unmarshalByte, bstd.unmarshalByte),
    (n: number, b: Uint8Array) => bstd.unmarshalMap(n, b, bstd.unmarshalByte, bstd.unmarshalByte),
    (n: number, b: Uint8Array) => bstd.unmarshalMap(n, b, bstd.unmarshalByte, bstd.unmarshalByte),
    (n: number, b: Uint8Array) => bstd.unmarshalMap(n, b, bstd.unmarshalByte, bstd.unmarshalByte),
  ]);

  const skipSliceOfBytes = (n: number, b: Uint8Array) => bstd.skipSlice(n, b);
  const skipMapOfBytes = (n: number, b: Uint8Array) => bstd.skipMap(n, b);

  skipAllVerifyError(bstd.ErrBufTooSmall, buffers, [
    bstd.skipBool,
    bstd.skipByte,
    bstd.skipFloat32,
    bstd.skipFloat64,
    bstd.skipVarint,
    bstd.skipInt16,
    bstd.skipInt32,
    bstd.skipInt64,
    bstd.skipVarint,
    bstd.skipUint16,
    bstd.skipUint32,
    bstd.skipUint64,
    bstd.skipString,
    bstd.skipString,
    bstd.skipString,
    bstd.skipString,
    bstd.skipString,
    bstd.skipString,
    bstd.skipString,
    bstd.skipString,
    bstd.skipBytes,
    bstd.skipBytes,
    bstd.skipBytes,
    bstd.skipBytes,
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

function testSlices(): void {
  const slice = ["sliceelement1", "sliceelement2", "sliceelement3", "sliceelement4", "sliceelement5"];
  const s = bstd.sizeSlice(slice, bstd.sizeString);
  const buf = new Uint8Array(s);
  bstd.marshalSlice(0, buf, slice, bstd.marshalString);

  skipOnceVerify(buf, bstd.skipSlice);

  const [, retSlice] = bstd.unmarshalSlice(0, buf, bstd.unmarshalString);

  if (JSON.stringify(retSlice) !== JSON.stringify(slice)) {
    throw new Error("no match!");
  }
}

function testMaps(): void {
  const m = new Map<string, string>();
  m.set("mapkey1", "mapvalue1");
  m.set("mapkey2", "mapvalue2");
  m.set("mapkey3", "mapvalue3");
  m.set("mapkey4", "mapvalue4");
  m.set("mapkey5", "mapvalue5");

  const s = bstd.sizeMap(m, bstd.sizeString, bstd.sizeString);
  const buf = new Uint8Array(s);
  bstd.marshalMap(0, buf, m, bstd.marshalString, bstd.marshalString);

  skipOnceVerify(buf, bstd.skipMap);

  const [, retMap] = bstd.unmarshalMap(0, buf, bstd.unmarshalString, bstd.unmarshalString);

  if (JSON.stringify(Array.from(retMap.entries())) !== JSON.stringify(Array.from(m.entries()))) {
    throw new Error("no match!");
  }
}

function testMaps2(): void {
  const m = new Map<number, string>();
  m.set(1, "mapvalue1");
  m.set(2, "mapvalue2");
  m.set(3, "mapvalue3");
  m.set(4, "mapvalue4");
  m.set(5, "mapvalue5");

  const s = bstd.sizeMap(m, bstd.sizeInt32, bstd.sizeString);
  const buf = new Uint8Array(s);
  bstd.marshalMap(0, buf, m, bstd.marshalInt32, bstd.marshalString);

  skipOnceVerify(buf, bstd.skipMap);

  const [, retMap] = bstd.unmarshalMap(0, buf, bstd.unmarshalInt32, bstd.unmarshalString);

  if (JSON.stringify(Array.from(retMap.entries())) !== JSON.stringify(Array.from(m.entries()))) {
    throw new Error("no match!");
  }
}

function testEmptyString(): void {
  const str = "";

  const s = bstd.sizeString(str);
  const buf = new Uint8Array(s);
  bstd.marshalString(0, buf, str);

  skipOnceVerify(buf, bstd.skipString);

  const [, retStr] = bstd.unmarshalString(0, buf);

  if (retStr !== str) {
    throw new Error("no match!");
  }
}

function testLongString(): void {
  let str = "";
  for (let i = 0; i < 65536 + 1; i++) {
    str += "H";
  }

  const s = bstd.sizeString(str);
  const buf = new Uint8Array(s);
  bstd.marshalString(0, buf, str);

  skipOnceVerify(buf, bstd.skipString);

  const [, retStr] = bstd.unmarshalString(0, buf);

  if (retStr !== str) {
    throw new Error("no match!");
  }
}

function testSkipVarint(): void {
  const tests = [
    { name: "Valid single-byte varint", buf: new Uint8Array([0x05]), n: 0, wantN: 1, wantErr: null },
    { name: "Valid multi-byte varint", buf: new Uint8Array([0x80, 0x01]), n: 0, wantN: 2, wantErr: null },
    { name: "Buffer too small", buf: new Uint8Array([0x80]), n: 0, wantN: 0, wantErr: bstd.ErrBufTooSmall },
    { name: "Varint overflow", buf: new Uint8Array([0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80]), n: 0, wantN: 0, wantErr: bstd.ErrOverflow },
  ];

  for (const test of tests) {
    try {
      const gotN = bstd.skipVarint(test.n, test.buf);
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

function testUnmarshalInt(): void {
  const tests = [
    { name: "Valid small int", buf: new Uint8Array([0x02]), n: 0, wantN: 1, wantVal: 1, wantErr: null },
    { name: "Valid negative int", buf: new Uint8Array([0x03]), n: 0, wantN: 1, wantVal: -2, wantErr: null },
    { name: "Valid multi-byte int", buf: new Uint8Array([0xAC, 0x02]), n: 0, wantN: 2, wantVal: 150, wantErr: null },
    { name: "Buffer too small", buf: new Uint8Array([0x80]), n: 0, wantN: 0, wantVal: 0, wantErr: bstd.ErrBufTooSmall },
    { name: "Varint overflow", buf: new Uint8Array([0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80]), n: 0, wantN: 0, wantVal: 0, wantErr: bstd.ErrOverflow },
  ];

  for (const test of tests) {
    try {
      const [gotN, gotVal] = bstd.unmarshalInt(test.n, test.buf);
      if (test.wantErr) {
        throw new Error(`Expected error ${test.wantErr.message}`);
      }
      if (gotN !== test.wantN || gotVal !== test.wantVal) {
        throw new Error(`Expected (${test.wantN}, ${test.wantVal}), got (${gotN}, ${gotVal})`);
      }
    } catch (err) {
      if (!test.wantErr || err !== test.wantErr) {
        throw new Error(`Test ${test.name} failed: ${err.message}`);
      }
    }
  }
}

function testUnmarshalUint(): void {
  const tests = [
    { name: "Valid small uint", buf: new Uint8Array([0x07]), n: 0, wantN: 1, wantVal: 7, wantErr: null },
    { name: "Valid multi-byte uint", buf: new Uint8Array([0xAC, 0x02]), n: 0, wantN: 2, wantVal: 300, wantErr: null },
    { name: "Buffer too small", buf: new Uint8Array([0x80]), n: 0, wantN: 0, wantVal: 0, wantErr: bstd.ErrBufTooSmall },
    { name: "Varint overflow", buf: new Uint8Array([0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80]), n: 0, wantN: 0, wantVal: 0, wantErr: bstd.ErrOverflow },
  ];

  for (const test of tests) {
    try {
      const [gotN, gotVal] = bstd.unmarshalUint(test.n, test.buf);
      if (test.wantErr) {
        throw new Error(`Expected error ${test.wantErr.message}`);
      }
      if (gotN !== test.wantN || gotVal !== test.wantVal) {
        throw new Error(`Expected (${test.wantN}, ${test.wantVal}), got (${gotN}, ${gotVal})`);
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
}