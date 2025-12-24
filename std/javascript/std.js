/**
 * bstd.js - A full JavaScript port of the Go `bstd` binary serialization library.
 * This library provides functions for marshalling and unmarshalling various data types
 * into a compact binary format. It aims to be a direct, feature-complete port of the original.
 *
 * @see https://github.com/banditmoscow1337/bstd
 */

// --- Error Types ---

class BencError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BencError';
  }
}

const ErrOverflow = new BencError('varint overflowed a 64-bit integer');
const ErrBufTooSmall = new BencError('buffer was too small');

// --- Varint (uint / int) ---

/**
 * Returns the bytes needed to marshal an unsigned integer as a varint.
 * @param {number | bigint} v The unsigned integer.
 * @returns {number} The number of bytes.
 */
function sizeUint(v) {
  let value = BigInt(v);
  let i = 0;
  while (value >= 0x80n) {
    value >>= 7n;
    i++;
  }
  return i + 1;
}

/**
 * Marshals an unsigned integer into a buffer as a varint.
 * @param {number} n The offset in the buffer.
 * @param {Uint8Array} b The buffer.
 * @param {number | bigint} v The unsigned integer.
 * @returns {number} The new offset.
 */
function marshalUint(n, b, v) {
  let value = BigInt(v);
  let i = n;
  while (value >= 0x80n) {
    b[i] = Number(value & 0x7Fn) | 0x80;
    value >>= 7n;
    i++;
  }
  b[i] = Number(value);
  return i + 1;
}

/**
 * Unmarshals an unsigned varint from a buffer.
 * @param {number} n The offset in the buffer.
 * @param {Uint8Array} b The buffer.
 * @returns {[number, bigint]} The new offset and the unmarshalled BigInt.
 */
function unmarshalUint(n, b) {
  let x = 0n;
  let s = 0n;
  for (let i = 0; ; i++) {
    if (n >= b.length) {
      throw ErrBufTooSmall;
    }
    const byte = b[n];
    n++;
    if (i === 9 && byte > 1) { // MaxVarintLen64 is 10 bytes
      throw ErrOverflow;
    }
    if (byte < 0x80) {
      return [n, x | (BigInt(byte) << s)];
    }
    x |= BigInt(byte & 0x7f) << s;
    s += 7n;
  }
}

/**
 * Skips a varint in the buffer.
 * @param {number} n The offset in the buffer.
 * @param {Uint8Array} b The buffer.
 * @returns {number} The new offset.
 */
function skipVarint(n, b) {
    for (let i = 0; i < 10; i++) {
        if (n >= b.length) {
            throw ErrBufTooSmall;
        }
        const byte = b[n];
        n++;
        if (byte < 0x80) {
            if (i === 9 && byte > 1) {
                throw ErrOverflow;
            }
            return n;
        }
    }
    throw ErrOverflow;
}

// --- ZigZag Encoding ---
const sixtyThree = 63n;
const one = 1n;

function encodeZigZag(t) {
  const value = BigInt(t);
  return (value << one) ^ (value >> sixtyThree);
}

function decodeZigZag(t) {
  const value = BigInt(t);
  return (value >> one) ^ -(value & one);
}

/**
 * Returns the bytes needed to marshal a signed integer.
 * @param {number | bigint} v The signed integer.
 * @returns {number} The number of bytes.
 */
function sizeInt(v) {
  return sizeUint(encodeZigZag(v));
}

/**
 * Marshals a signed integer into a buffer.
 * @param {number} n The offset in the buffer.
 * @param {Uint8Array} b The buffer.
 * @param {number | bigint} v The signed integer.
 * @returns {number} The new offset.
 */
function marshalInt(n, b, v) {
  return marshalUint(n, b, encodeZigZag(v));
}

/**
 * Unmarshals a signed integer from a buffer.
 * @param {number} n The offset in the buffer.
 * @param {Uint8Array} b The buffer.
 * @returns {[number, bigint]} The new offset and the unmarshalled BigInt.
 */
function unmarshalInt(n, b) {
  const [newN, val] = unmarshalUint(n, b);
  return [newN, decodeZigZag(val)];
}

// --- String ---

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8');

/**
 * Returns the bytes needed to marshal a string.
 * @param {string} str The string.
 * @returns {number} The number of bytes.
 */
function sizeString(str) {
  // A rough estimate for byte length. For perfect accuracy, encode first.
  const byteLength = textEncoder.encode(str).length;
  return byteLength + sizeUint(byteLength);
}

/**
 * Marshals a string into a buffer.
 * @param {number} n The offset in the buffer.
 * @param {Uint8Array} b The buffer.
 * @param {string} str The string.
 * @returns {number} The new offset.
 */
function marshalString(n, b, str) {
  const encoded = textEncoder.encode(str);
  n = marshalUint(n, b, encoded.length);
  b.set(encoded, n);
  return n + encoded.length;
}

/**
 * Unmarshals a string from a buffer.
 * @param {number} n The offset in the buffer.
 * @param {Uint8Array} b The buffer.
 * @returns {[number, string]} The new offset and the unmarshalled string.
 */
function unmarshalString(n, b) {
  const [newN, length] = unmarshalUint(n, b);
  const len = Number(length);
  if (b.length - newN < len) {
    throw ErrBufTooSmall;
  }
  const str = textDecoder.decode(b.subarray(newN, newN + len));
  return [newN + len, str];
}

/**
 * Skips a marshalled string in the buffer.
 * @param {number} n The offset in the buffer.
 * @param {Uint8Array} b The buffer.
 * @returns {number} The new offset.
 */
function skipString(n, b) {
  const [newN, length] = unmarshalUint(n, b);
  const len = Number(length);
  if (b.length - newN < len) {
    throw ErrBufTooSmall;
  }
  return newN + len;
}

// Unsafe string functions are aliases for the safe ones in JS
const marshalUnsafeString = marshalString;
const unmarshalUnsafeString = unmarshalString;

// --- Byte & Bytes ---

function skipByte(n, b) {
    if (b.length - n < 1) throw ErrBufTooSmall;
    return n + 1;
}

function sizeByte() {
    return 1;
}

function marshalByte(n, b, byteValue) {
    b[n] = byteValue;
    return n + 1;
}

function unmarshalByte(n, b) {
    if (b.length - n < 1) throw ErrBufTooSmall;
    return [n + 1, b[n]];
}

function skipBytes(n, b) {
    const [newN, length] = unmarshalUint(n, b);
    const len = Number(length);
    if (b.length - newN < len) throw ErrBufTooSmall;
    return newN + len;
}

function sizeBytes(bs) {
    return bs.length + sizeUint(bs.length);
}

function marshalBytes(n, b, bs) {
    n = marshalUint(n, b, bs.length);
    b.set(bs, n);
    return n + bs.length;
}

function unmarshalBytesCopied(n, b) {
    const [newN, length] = unmarshalUint(n, b);
    const len = Number(length);
    if (b.length - newN < len) throw ErrBufTooSmall;
    const result = new Uint8Array(len);
    result.set(b.subarray(newN, newN + len));
    return [newN + len, result];
}

function unmarshalBytesCropped(n, b) {
    const [newN, length] = unmarshalUint(n, b);
    const len = Number(length);
    if (b.length - newN < len) throw ErrBufTooSmall;
    return [newN + len, b.subarray(newN, newN + len)];
}


// --- Slice / Array ---
const sliceTerminator = new Uint8Array([1, 1, 1, 1]);

function skipSlice(n, b, skipElement) {
    let [newN, elementCount] = unmarshalUint(n, b);
    n = newN;
    for (let i = 0n; i < elementCount; i++) {
        n = skipElement(n, b);
    }
    if (b.length - n < 4) throw ErrBufTooSmall;
    return n + 4;
}

function sizeSlice(slice, sizer) {
    let s = 4 + sizeUint(slice.length);
    for (const t of slice) {
        s += sizer(t);
    }
    return s;
}

function sizeFixedSlice(slice, elemSize) {
    return 4 + sizeUint(slice.length) + slice.length * elemSize;
}

function marshalSlice(n, b, slice, marshaler) {
    n = marshalUint(n, b, slice.length);
    for (const t of slice) {
        n = marshaler(n, b, t);
    }
    b.set(sliceTerminator, n);
    return n + 4;
}

function unmarshalSlice(n, b, unmarshaler) {
    const [newN, lengthBI] = unmarshalUint(n, b);
    const length = Number(lengthBI);
    const result = new Array(length);
    let currentN = newN;
    for (let i = 0; i < length; i++) {
        let value;
        [currentN, value] = unmarshaler(currentN, b);
        result[i] = value;
    }
    if (b.length - currentN < 4) throw ErrBufTooSmall;
    return [currentN + 4, result];
}


// --- Map ---

function skipMap(n, b, skipKey, skipValue) {
    let [newN, pairCount] = unmarshalUint(n, b);
    n = newN;
    for (let i = 0n; i < pairCount; i++) {
        n = skipKey(n, b);
        n = skipValue(n, b);
    }
    if (b.length - n < 4) throw ErrBufTooSmall;
    return n + 4;
}

function sizeMap(m, kSizer, vSizer) {
    let s = 4 + sizeUint(m.size);
    for (const [k, v] of m) {
        s += kSizer(k) + vSizer(v);
    }
    return s;
}

function marshalMap(n, b, m, kMarshaler, vMarshaler) {
    n = marshalUint(n, b, m.size);
    for (const [k, v] of m) {
        n = kMarshaler(n, b, k);
        n = vMarshaler(n, b, v);
    }
    b.set(sliceTerminator, n);
    return n + 4;
}

function unmarshalMap(n, b, kUnmarshaler, vUnmarshaler) {
    const [newN, sizeBI] = unmarshalUint(n, b);
    const size = Number(sizeBI);
    const map = new Map();
    let currentN = newN;
    for (let i = 0; i < size; i++) {
        let key, value;
        [currentN, key] = kUnmarshaler(currentN, b);
        [currentN, value] = vUnmarshaler(currentN, b);
        map.set(key, value);
    }
    if (b.length - currentN < 4) throw ErrBufTooSmall;
    return [currentN + 4, map];
}

// --- Fixed-size Primitives ---

function createFixedSizeFuncs(byteSize, type) {
    const isFloat = type.startsWith('Float');
    const isBigInt = byteSize === 8 && !isFloat;
    
    const readMethod = `get${isBigInt ? 'Big' : ''}${type}`;
    const writeMethod = `set${isBigInt ? 'Big' : ''}${type}`;

    function skip(n, b) {
        if (b.length - n < byteSize) throw ErrBufTooSmall;
        return n + byteSize;
    }
    function size() {
        return byteSize;
    }
    function marshal(n, b, v) {
        const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
        view[writeMethod](n, isBigInt ? BigInt(v) : v, true);
        return n + byteSize;
    }
    function unmarshal(n, b) {
        if (b.length - n < byteSize) throw ErrBufTooSmall;
        const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
        const value = view[readMethod](n, true);
        return [n + byteSize, isBigInt ? value : Number(value)];
    }
    return { skip, size, marshal, unmarshal };
}

const { skip: skipInt8, size: sizeInt8, marshal: marshalInt8, unmarshal: unmarshalInt8 } = createFixedSizeFuncs(1, 'Int8');
const { skip: skipInt16, size: sizeInt16, marshal: marshalInt16, unmarshal: unmarshalInt16 } = createFixedSizeFuncs(2, 'Int16');
const { skip: skipInt32, size: sizeInt32, marshal: marshalInt32, unmarshal: unmarshalInt32 } = createFixedSizeFuncs(4, 'Int32');
const { skip: skipInt64, size: sizeInt64, marshal: marshalInt64, unmarshal: unmarshalInt64 } = createFixedSizeFuncs(8, 'Int64');

const { skip: skipUint16, size: sizeUint16, marshal: marshalUint16, unmarshal: unmarshalUint16 } = createFixedSizeFuncs(2, 'Uint16');
const { skip: skipUint32, size: sizeUint32, marshal: marshalUint32, unmarshal: unmarshalUint32 } = createFixedSizeFuncs(4, 'Uint32');
const { skip: skipUint64, size: sizeUint64, marshal: marshalUint64, unmarshal: unmarshalUint64 } = createFixedSizeFuncs(8, 'Uint64');

const { skip: skipFloat32, size: sizeFloat32, marshal: marshalFloat32, unmarshal: unmarshalFloat32 } = createFixedSizeFuncs(4, 'Float32');
const { skip: skipFloat64, size: sizeFloat64, marshal: marshalFloat64, unmarshal: unmarshalFloat64 } = createFixedSizeFuncs(8, 'Float64');

// --- Bool ---

function skipBool(n, b) {
    if (b.length - n < 1) throw ErrBufTooSmall;
    return n + 1;
}

function sizeBool() {
    return 1;
}

function marshalBool(n, b, v) {
    b[n] = v ? 1 : 0;
    return n + 1;
}

function unmarshalBool(n, b) {
    if (b.length - n < 1) throw ErrBufTooSmall;
    return [n + 1, b[n] === 1];
}

// --- Time ---

function skipTime(n, b) {
    return skipInt64(n, b);
}

function sizeTime() {
    return 8; // int64 for UnixNano
}

function marshalTime(n, b, t) {
    // JS Date.getTime() is in milliseconds. Convert to nanoseconds.
    const nano = BigInt(t.getTime()) * 1000000n;
    return marshalInt64(n, b, nano);
}

function unmarshalTime(n, b) {
    const [newN, nano] = unmarshalInt64(n, b);
    // Convert nanoseconds back to milliseconds for JS Date
    const millis = nano / 1000000n;
    return [newN, new Date(Number(millis))];
}

// --- Pointer ---

function skipPointer(n, b, skipElement) {
    const [newN, hasValue] = unmarshalBool(n, b);
    if (hasValue) {
        return skipElement(newN, b);
    }
    return newN;
}

function sizePointer(v, sizeFn) {
    if (v !== null && v !== undefined) {
        return sizeBool() + sizeFn(v);
    }
    return sizeBool();
}

function marshalPointer(n, b, v, marshalFn) {
    const exists = v !== null && v !== undefined;
    n = marshalBool(n, b, exists);
    if (exists) {
        n = marshalFn(n, b, v);
    }
    return n;
}

function unmarshalPointer(n, b, unmarshaler) {
    const [newN, hasValue] = unmarshalBool(n, b);
    if (!hasValue) {
        return [newN, null];
    }
    return unmarshaler(newN, b);
}

// --- Exports ---

// For CommonJS environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    BencError, ErrOverflow, ErrBufTooSmall,
    // Varint
    sizeUint, marshalUint, unmarshalUint, skipVarint,
    sizeInt, marshalInt, unmarshalInt,
    // String
    sizeString, marshalString, unmarshalString, skipString,
    marshalUnsafeString, unmarshalUnsafeString,
    // Byte(s)
    skipByte, sizeByte, marshalByte, unmarshalByte,
    skipBytes, sizeBytes, marshalBytes, unmarshalBytesCopied, unmarshalBytesCropped,
    // Slice
    skipSlice, sizeSlice, sizeFixedSlice, marshalSlice, unmarshalSlice,
    // Map
    skipMap, sizeMap, marshalMap, unmarshalMap,
    // Fixed-size
    skipInt8, sizeInt8, marshalInt8, unmarshalInt8,
    skipInt16, sizeInt16, marshalInt16, unmarshalInt16,
    skipInt32, sizeInt32, marshalInt32, unmarshalInt32,
    skipInt64, sizeInt64, marshalInt64, unmarshalInt64,
    skipUint16, sizeUint16, marshalUint16, unmarshalUint16,
    skipUint32, sizeUint32, marshalUint32, unmarshalUint32,
    skipUint64, sizeUint64, marshalUint64, unmarshalUint64,
    skipFloat32, sizeFloat32, marshalFloat32, unmarshalFloat32,
    skipFloat64, sizeFloat64, marshalFloat64, unmarshalFloat64,
    // Bool
    skipBool, sizeBool, marshalBool, unmarshalBool,
    // Time
    skipTime, sizeTime, marshalTime, unmarshalTime,
    // Pointer
    skipPointer, sizePointer, marshalPointer, unmarshalPointer
  };
}

