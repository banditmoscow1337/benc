import * as bstd from './std';

// =============================================================================
// Test Helpers
// =============================================================================

/** Helper to create a float32 with the exact precision for tests. */
function exactFloat32(num: number): number {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setFloat32(0, num, true);
  return view.getFloat32(0, true);
}


// =============================================================================
// Tests
// =============================================================================

describe('bstd', () => {

  describe('DataTypes', () => {
    it('should correctly marshal, skip, and unmarshal all data types in sequence', () => {
      const testStr = "Hello World!";
      const testBs = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      const negIntVal = -12345;
      const posIntVal = Number.MAX_SAFE_INTEGER;
      const testFloat32 = exactFloat32(Math.random());
      const testFloat64 = Math.random();
      const testInt32 = Math.floor(Math.random() * (2**31 - 1));
      const testInt64 = BigInt(Math.floor(Math.random() * (2**53 - 1)));
      const testUint32 = Math.floor(Math.random() * (2**32 - 1));
      const testUint64 = BigInt(Math.floor(Math.random() * (2**53 - 1)));


      const values: any[] = [
        true,
        128, // byte
        testFloat32,
        testFloat64,
        posIntVal,
        negIntVal,
        -1, // int8
        -1, // int16
        testInt32,
        testInt64,
        BigInt(Number.MAX_SAFE_INTEGER) + 1n, // uint that becomes bigint
        160, // uint16
        testUint32,
        testUint64,
        testStr,
        testStr, // for unsafe
        testBs, // for cropped
        testBs, // for copied
      ];

      // 1. Size calculation
      let s = 0;
      s += bstd.sizeBool();
      s += bstd.sizeByte();
      s += bstd.sizeFloat32();
      s += bstd.sizeFloat64();
      s += bstd.sizeInt(posIntVal);
      s += bstd.sizeInt(negIntVal);
      s += bstd.sizeInt8();
      s += bstd.sizeInt16();
      s += bstd.sizeInt32();
      s += bstd.sizeInt64();
      s += bstd.sizeUint(BigInt(Number.MAX_SAFE_INTEGER) + 1n);
      s += bstd.sizeUint16();
      s += bstd.sizeUint32();
      s += bstd.sizeUint64();
      s += bstd.sizeString(testStr);
      s += bstd.sizeString(testStr); // unsafe
      s += bstd.sizeBytes(testBs);
      s += bstd.sizeBytes(testBs);

      // 2. Marshalling
      const b = new Uint8Array(s);
      let n = 0;
      n = bstd.marshalBool(n, b, values[0]);
      n = bstd.marshalByte(n, b, values[1]);
      n = bstd.marshalFloat32(n, b, values[2]);
      n = bstd.marshalFloat64(n, b, values[3]);
      n = bstd.marshalInt(n, b, values[4]);
      n = bstd.marshalInt(n, b, values[5]);
      n = bstd.marshalInt8(n, b, values[6]);
      n = bstd.marshalInt16(n, b, values[7]);
      n = bstd.marshalInt32(n, b, values[8]);
      n = bstd.marshalInt64(n, b, values[9]);
      n = bstd.marshalUint(n, b, values[10]);
      n = bstd.marshalUint16(n, b, values[11]);
      n = bstd.marshalUint32(n, b, values[12]);
      n = bstd.marshalUint64(n, b, values[13]);
      n = bstd.marshalString(n, b, values[14]);
      n = bstd.marshalUnsafeString(n, b, values[15]);
      n = bstd.marshalBytes(n, b, values[16]);
      n = bstd.marshalBytes(n, b, values[17]);

      expect(n).toBe(s);
      
      // 3. Skipping
      let skipN = 0;
      skipN = bstd.skipBool(skipN, b);
      skipN = bstd.skipByte(skipN, b);
      skipN = bstd.skipFloat32(skipN, b);
      skipN = bstd.skipFloat64(skipN, b);
      skipN = bstd.skipVarint(skipN, b); // posIntVal
      skipN = bstd.skipVarint(skipN, b); // negIntVal
      skipN = bstd.skipInt8(skipN, b);
      skipN = bstd.skipInt16(skipN, b);
      skipN = bstd.skipInt32(skipN, b);
      skipN = bstd.skipInt64(skipN, b);
      skipN = bstd.skipVarint(skipN, b); // uint
      skipN = bstd.skipUint16(skipN, b);
      skipN = bstd.skipUint32(skipN, b);
      skipN = bstd.skipUint64(skipN, b);
      skipN = bstd.skipString(skipN, b);
      skipN = bstd.skipString(skipN, b); // unsafe
      skipN = bstd.skipBytes(skipN, b);
      skipN = bstd.skipBytes(skipN, b);

      expect(skipN).toBe(s);
      
      // 4. Unmarshalling
      let unN = 0;
      let res: any;
      const unmarshalledValues: any[] = [];
      
      [unN, res] = bstd.unmarshalBool(unN, b); unmarshalledValues.push(res);
      [unN, res] = bstd.unmarshalByte(unN, b); unmarshalledValues.push(res);
      [unN, res] = bstd.unmarshalFloat32(unN, b); unmarshalledValues.push(res);
      [unN, res] = bstd.unmarshalFloat64(unN, b); unmarshalledValues.push(res);
      [unN, res] = bstd.unmarshalInt(unN, b); unmarshalledValues.push(res);
      [unN, res] = bstd.unmarshalInt(unN, b); unmarshalledValues.push(res);
      [unN, res] = bstd.unmarshalInt8(unN, b); unmarshalledValues.push(res);
      [unN, res] = bstd.unmarshalInt16(unN, b); unmarshalledValues.push(res);
      [unN, res] = bstd.unmarshalInt32(unN, b); unmarshalledValues.push(res);
      [unN, res] = bstd.unmarshalInt64(unN, b); unmarshalledValues.push(res);
      [unN, res] = bstd.unmarshalUint(unN, b); unmarshalledValues.push(res);
      [unN, res] = bstd.unmarshalUint16(unN, b); unmarshalledValues.push(res);
      [unN, res] = bstd.unmarshalUint32(unN, b); unmarshalledValues.push(res);
      [unN, res] = bstd.unmarshalUint64(unN, b); unmarshalledValues.push(res);
      [unN, res] = bstd.unmarshalString(unN, b); unmarshalledValues.push(res);
      [unN, res] = bstd.unmarshalUnsafeString(unN, b); unmarshalledValues.push(res);
      [unN, res] = bstd.unmarshalBytesCropped(unN, b); unmarshalledValues.push(res);
      [unN, res] = bstd.unmarshalBytesCopied(unN, b); unmarshalledValues.push(res);

      expect(unN).toBe(s);
      expect(unmarshalledValues).toEqual(values);
    });
  });

  describe('ErrBufTooSmall', () => {
    const funcs: { unmarshal: Function, skip: Function, invalidBuffers: Uint8Array[] }[] = [
        { unmarshal: bstd.unmarshalBool, skip: bstd.skipBool, invalidBuffers: [new Uint8Array([])] },
        { unmarshal: bstd.unmarshalByte, skip: bstd.skipByte, invalidBuffers: [new Uint8Array([])] },
        { unmarshal: bstd.unmarshalFloat32, skip: bstd.skipFloat32, invalidBuffers: [new Uint8Array([1, 2, 3])] },
        { unmarshal: bstd.unmarshalFloat64, skip: bstd.skipFloat64, invalidBuffers: [new Uint8Array([1, 2, 3, 4, 5, 6, 7])] },
        { unmarshal: bstd.unmarshalInt, skip: bstd.skipVarint, invalidBuffers: [new Uint8Array([0x80])] },
        { unmarshal: bstd.unmarshalString, skip: bstd.skipString, invalidBuffers: [new Uint8Array([]), new Uint8Array([2, 0])] },
        { unmarshal: (n: number, b: Uint8Array) => bstd.unmarshalSlice(n, b, bstd.unmarshalByte), skip: (n: number, b: Uint8Array) => bstd.skipSlice(n, b, bstd.skipByte), invalidBuffers: [new Uint8Array([10, 0, 0, 0, 1])] },
        { unmarshal: (n: number, b: Uint8Array) => bstd.unmarshalMap(n, b, bstd.unmarshalByte, bstd.unmarshalByte), skip: (n: number, b: Uint8Array) => bstd.skipMap(n, b, bstd.skipByte, bstd.skipByte), invalidBuffers: [new Uint8Array([10, 0, 0, 0, 1])] },
    ];

    for (const f of funcs) {
        for (const buf of f.invalidBuffers) {
            it(`should throw ErrBufTooSmall for ${f.unmarshal.name} with buffer [${buf}]`, () => {
                expect(() => f.unmarshal(0, buf)).toThrow(bstd.ErrBufTooSmall);
            });
            it(`should throw ErrBufTooSmall for ${f.skip.name} with buffer [${buf}]`, () => {
                expect(() => f.skip(0, buf)).toThrow(bstd.ErrBufTooSmall);
            });
        }
    }
  });

  describe('Slices', () => {
    it('should correctly handle slices of strings', () => {
        const slice = ["sliceelement1", "sliceelement2", "sliceelement3", "sliceelement4", "sliceelement5"];
        const s = bstd.sizeSlice(slice, bstd.sizeString);
        const buf = new Uint8Array(s);
        const n = bstd.marshalSlice(0, buf, slice, bstd.marshalString);

        expect(n).toBe(s);

        const skipN = bstd.skipSlice(0, buf, bstd.skipString);
        expect(skipN).toBe(s);
        
        const [unN, retSlice] = bstd.unmarshalSlice(0, buf, bstd.unmarshalString);
        expect(unN).toBe(s);
        expect(retSlice).toEqual(slice);
    });
  });

  describe('Maps', () => {
    it('should correctly handle maps of string to string', () => {
        const m = new Map<string, string>();
        m.set("mapkey1", "mapvalue1");
        m.set("mapkey2", "mapvalue2");
        m.set("mapkey3", "mapvalue3");

        const s = bstd.sizeMap(m, bstd.sizeString, bstd.sizeString);
        const buf = new Uint8Array(s);
        const n = bstd.marshalMap(0, buf, m, bstd.marshalString, bstd.marshalString);
        expect(n).toBe(s);

        const skipN = bstd.skipMap(0, buf, bstd.skipString, bstd.skipString);
        expect(skipN).toBe(s);

        const [unN, retMap] = bstd.unmarshalMap(0, buf, bstd.unmarshalString, bstd.unmarshalString);
        expect(unN).toBe(s);
        expect(retMap).toEqual(m);
    });

    it('should correctly handle maps of int32 to string', () => {
        const m = new Map<number, string>();
        m.set(1, "mapvalue1");
        m.set(2, "mapvalue2");

        const s = bstd.sizeMap(m, bstd.sizeInt32, bstd.sizeString);
        const buf = new Uint8Array(s);
        const n = bstd.marshalMap(0, buf, m, bstd.marshalInt32, bstd.marshalString);
        expect(n).toBe(s);
        
        const skipN = bstd.skipMap(0, buf, bstd.skipInt32, bstd.skipString);
        expect(skipN).toBe(s);

        const [unN, retMap] = bstd.unmarshalMap(0, buf, bstd.unmarshalInt32, bstd.unmarshalString);
        expect(unN).toBe(s);
        expect(retMap).toEqual(m);
    });
  });
  
  describe('Strings', () => {
      it('should handle empty strings', () => {
          const str = "";
          const s = bstd.sizeString(str);
          const buf = new Uint8Array(s);
          const n = bstd.marshalString(0, buf, str);
          expect(n).toBe(s);

          const skipN = bstd.skipString(0, buf);
          expect(skipN).toBe(s);
          
          const [unN, retStr] = bstd.unmarshalString(0, buf);
          expect(unN).toBe(s);
          expect(retStr).toEqual(str);
      });

      it('should handle long strings', () => {
          const str = "H".repeat(65536);
          const s = bstd.sizeString(str);
          const buf = new Uint8Array(s);
          const n = bstd.marshalString(0, buf, str);
          expect(n).toBe(s);

          const skipN = bstd.skipString(0, buf);
          expect(skipN).toBe(s);

          const [unN, retStr] = bstd.unmarshalString(0, buf);
          expect(unN).toBe(s);
          expect(retStr).toEqual(str);
      });
  });
  
  describe('Varint Edge Cases', () => {
    const overflowBytes = new Uint8Array([0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x01]);
    const overflowEdgeCase = new Uint8Array([0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x02]);

    it('skipVarint should throw on overflow', () => {
        expect(() => bstd.skipVarint(0, overflowBytes)).toThrow(bstd.ErrOverflow);
        expect(() => bstd.skipVarint(0, overflowEdgeCase)).toThrow(bstd.ErrOverflow);
    });

    it('unmarshalInt should throw on overflow', () => {
        expect(() => bstd.unmarshalInt(0, overflowBytes)).toThrow(bstd.ErrOverflow);
        expect(() => bstd.unmarshalInt(0, overflowEdgeCase)).toThrow(bstd.ErrOverflow);
    });

    it('unmarshalUint should throw on overflow', () => {
        expect(() => bstd.unmarshalUint(0, overflowBytes)).toThrow(bstd.ErrOverflow);
        expect(() => bstd.unmarshalUint(0, overflowEdgeCase)).toThrow(bstd.ErrOverflow);
    });

    it('unmarshalInt should handle valid cases', () => {
        expect(bstd.unmarshalInt(0, new Uint8Array([0x02]))).toEqual([1, 1]);
        expect(bstd.unmarshalInt(0, new Uint8Array([0x03]))).toEqual([1, -2]);
        expect(bstd.unmarshalInt(0, new Uint8Array([0xAC, 0x02]))).toEqual([2, 150]);
    });

    it('unmarshalUint should handle valid cases', () => {
        expect(bstd.unmarshalUint(0, new Uint8Array([0x07]))).toEqual([1, 7]);
        expect(bstd.unmarshalUint(0, new Uint8Array([0xAC, 0x02]))).toEqual([2, 300]);
    });
  });
  
  describe('Time', () => {
      it('should correctly handle Date objects', () => {
          const now = new Date("2022-09-16T21:14:55.123Z"); // Corresponds to Unix(1663362895, 123000000)
          
          const s = bstd.sizeTime();
          const buf = new Uint8Array(s);
          const n = bstd.marshalTime(0, buf, now);
          expect(n).toBe(s);

          const skipN = bstd.skipTime(0, buf);
          expect(skipN).toBe(s);
          
          const [unN, retTime] = bstd.unmarshalTime(0, buf);
          expect(unN).toBe(s);
          expect(retTime.getTime()).toBe(now.getTime());
      });
  });

  describe('Pointer (Nullable)', () => {
      it('should handle non-null pointers', () => {
          const val = "hello world";
          const s = bstd.sizePointer(val, bstd.sizeString);
          const buf = new Uint8Array(s);
          const n = bstd.marshalPointer(0, buf, val, bstd.marshalString);
          expect(n).toBe(s);
          
          const skipN = bstd.skipPointer(0, buf, bstd.skipString);
          expect(skipN).toBe(s);

          const [unN, retPtr] = bstd.unmarshalPointer(0, buf, bstd.unmarshalString);
          expect(unN).toBe(s);
          expect(retPtr).toBe(val);
      });

      it('should handle null pointers', () => {
          const val: string | null = null;
          const s = bstd.sizePointer(val, bstd.sizeString);
          const buf = new Uint8Array(s);
          const n = bstd.marshalPointer(0, buf, val, bstd.marshalString);
          expect(n).toBe(s);

          const skipN = bstd.skipPointer(0, buf, bstd.skipString);
          expect(skipN).toBe(s);
          
          const [unN, retPtr] = bstd.unmarshalPointer(0, buf, bstd.unmarshalString);
          expect(unN).toBe(s);
          expect(retPtr).toBeNull();
      });
  });

  describe('Terminator Errors', () => {
      it('should throw ErrBufTooSmall if slice terminator is missing', () => {
          const slice = ["a"];
          const s = bstd.sizeSlice(slice, bstd.sizeString);
          const buf = new Uint8Array(s);
          bstd.marshalSlice(0, buf, slice, bstd.marshalString);
          const truncatedBuf = buf.subarray(0, s - 1);
          expect(() => bstd.skipSlice(0, truncatedBuf, bstd.skipString)).toThrow(bstd.ErrBufTooSmall);
      });

      it('should throw ErrBufTooSmall if map terminator is missing', () => {
          const m = new Map([["a", "b"]]);
          const s = bstd.sizeMap(m, bstd.sizeString, bstd.sizeString);
          const buf = new Uint8Array(s);
          bstd.marshalMap(0, buf, m, bstd.marshalString, bstd.marshalString);
          const truncatedBuf = buf.subarray(0, s - 1);
          expect(() => bstd.skipMap(0, truncatedBuf, bstd.skipString, bstd.skipString)).toThrow(bstd.ErrBufTooSmall);
      });
  });

  describe('Coverage', () => {
      it('SizeFixedSlice should return correct size', () => {
          const slice = [1, 2, 3];
          const elemSize = bstd.sizeInt32();
          const expected = bstd.sizeUint(slice.length) + slice.length * elemSize + 4;
          expect(bstd.sizeFixedSlice(slice, elemSize)).toBe(expected);
      });

      it('unmarshalTime should propagate errors', () => {
          expect(() => bstd.unmarshalTime(0, new Uint8Array([1,2,3]))).toThrow(bstd.ErrBufTooSmall);
      });

      it('skipPointer should propagate errors', () => {
          expect(() => bstd.skipPointer(0, new Uint8Array([]), bstd.skipByte)).toThrow(bstd.ErrBufTooSmall);
      });

      it('unmarshalPointer should propagate errors', () => {
          // Error from unmarshalBool
          expect(() => bstd.unmarshalPointer(0, new Uint8Array([]), bstd.unmarshalInt)).toThrow(bstd.ErrBufTooSmall);
          // Error from element unmarshaler
          expect(() => bstd.unmarshalPointer(0, new Uint8Array([1, 0x80]), bstd.unmarshalInt)).toThrow(bstd.ErrBufTooSmall);
      });
  });

});
