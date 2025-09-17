// Error types
class BencError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BencError';
  }
}

const ErrOverflow = new BencError('varint overflowed a N-bit unsigned integer');
const ErrBufTooSmall = new BencError('buffer was too small');

// Unsigned integer encoding/decoding (varint)
function sizeUint(v) {
  let value = BigInt(v);
  let i = 0;
  
  while (value >= 0x80n) {
    value >>= 7n;
    i++;
  }
  
  return i + 1;
}

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

function unmarshalUint(n, b) {
  let value = 0n;
  let shift = 0n;
  let byte;
  
  do {
    if (n >= b.length) {
      throw ErrBufTooSmall;
    }
    
    byte = b[n++];
    value |= BigInt(byte & 0x7F) << shift;
    shift += 7n;
    
    if (shift >= 64n && (byte & 0x80) !== 0) {
      throw ErrOverflow;
    }
  } while ((byte & 0x80) !== 0);
  
  return [n, Number(value)];
}

// ZigZag encoding/decoding
function encodeZigZag(t) {
  return (t << 1n) ^ (t >> 63n);
}

function decodeZigZag(t) {
  return (t >> 1n) ^ -(t & 1n);
}

// Signed integer encoding/decoding (varint with zigzag)
function sizeInt(sv) {
  const v = encodeZigZag(BigInt(sv));
  return sizeUint(Number(v));
}

function marshalInt(n, b, sv) {
  const v = encodeZigZag(BigInt(sv));
  return marshalUint(n, b, Number(v));
}

function unmarshalInt(n, b) {
  const [newN, value] = unmarshalUint(n, b);
  const decoded = decodeZigZag(BigInt(value));
  return [newN, Number(decoded)];
}

// String encoding/decoding
function sizeString(str) {
  const v = str.length;
  return v + sizeUint(v);
}

function marshalString(n, b, str) {
  n = marshalUint(n, b, str.length);
  const encoder = new TextEncoder();
  const encoded = encoder.encode(str);
  b.set(encoded, n);
  return n + encoded.length;
}

function unmarshalString(n, b) {
  const [newN, length] = unmarshalUint(n, b);
  
  if (b.length - newN < length) {
    throw ErrBufTooSmall;
  }
  
  const decoder = new TextDecoder('utf-8');
  const str = decoder.decode(b.subarray(newN, newN + length));
  return [newN + length, str];
}

// Slice encoding/decoding
function skipSlice(n, b) {
  const length = b.length;
  
  while (true) {
    if (length - n < 4) {
      throw ErrBufTooSmall;
    }
    
    if (b[n] === 1 && b[n + 1] === 1 && b[n + 2] === 1 && b[n + 3] === 1) {
      return n + 4;
    }
    n++;
  }
}

function sizeSlice(slice, sizer) {
  let s = 4 + sizeUint(slice.length);
  
  for (const t of slice) {
    s += sizer(t);
  }
  
  return s;
}

function marshalSlice(n, b, slice, marshaler) {
  n = marshalUint(n, b, slice.length);
  
  for (const t of slice) {
    n = marshaler(n, b, t);
  }
  
  b[n] = 1;
  b[n + 1] = 1;
  b[n + 2] = 1;
  b[n + 3] = 1;
  return n + 4;
}

function unmarshalSlice(n, b, unmarshaler) {
  const [newN, length] = unmarshalUint(n, b);
  const result = new Array(length);
  let currentN = newN;
  
  for (let i = 0; i < length; i++) {
    [currentN, result[i]] = unmarshaler(currentN, b);
  }
  
  // Skip 4 bytes (termination pattern)
  if (b.length - currentN < 4) {
    throw ErrBufTooSmall;
  }
  
  return [currentN + 4, result];
}

// Map encoding/decoding
function skipMap(n, b) {
  const length = b.length;
  
  while (true) {
    if (length - n < 4) {
      throw ErrBufTooSmall;
    }
    
    if (b[n] === 1 && b[n + 1] === 1 && b[n + 2] === 1 && b[n + 3] === 1) {
      return n + 4;
    }
    n++;
  }
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
  
  b[n] = 1;
  b[n + 1] = 1;
  b[n + 2] = 1;
  b[n + 3] = 1;
  return n + 4;
}

function unmarshalMap(n, b, kUnmarshaler, vUnmarshaler) {
  const [newN, size] = unmarshalUint(n, b);
  const map = new Map();
  let currentN = newN;
  
  for (let i = 0; i < size; i++) {
    let key, value;
    
    [currentN, key] = kUnmarshaler(currentN, b);
    [currentN, value] = vUnmarshaler(currentN, b);
    
    map.set(key, value);
  }
  
  // Skip 4 bytes (termination pattern)
  if (b.length - currentN < 4) {
    throw ErrBufTooSmall;
  }
  
  return [currentN + 4, map];
}

// Fixed-size integer encoding/decoding
function sizeInt16() {
  return 2;
}

function marshalInt16(n, b, v) {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  view.setInt16(n, v, true);
  return n + 2;
}

function unmarshalInt16(n, b) {
  if (b.length - n < 2) {
    throw ErrBufTooSmall;
  }
  
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const value = view.getInt16(n, true);
  return [n + 2, value];
}

function sizeInt32() {
  return 4;
}

function marshalInt32(n, b, v) {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  view.setInt32(n, v, true);
  return n + 4;
}

function unmarshalInt32(n, b) {
  if (b.length - n < 4) {
    throw ErrBufTooSmall;
  }
  
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const value = view.getInt32(n, true);
  return [n + 4, value];
}

function sizeInt64() {
  return 8;
}

function marshalInt64(n, b, v) {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  view.setBigInt64(n, BigInt(v), true);
  return n + 8;
}

function unmarshalInt64(n, b) {
  if (b.length - n < 8) {
    throw ErrBufTooSmall;
  }
  
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const value = view.getBigInt64(n, true);
  return [n + 8, Number(value)];
}

function sizeUint16() {
  return 2;
}

function marshalUint16(n, b, v) {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  view.setUint16(n, v, true);
  return n + 2;
}

function unmarshalUint16(n, b) {
  if (b.length - n < 2) {
    throw ErrBufTooSmall;
  }
  
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const value = view.getUint16(n, true);
  return [n + 2, value];
}

function sizeUint32() {
  return 4;
}

function marshalUint32(n, b, v) {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  view.setUint32(n, v, true);
  return n + 4;
}

function unmarshalUint32(n, b) {
  if (b.length - n < 4) {
    throw ErrBufTooSmall;
  }
  
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const value = view.getUint32(n, true);
  return [n + 4, value];
}

function sizeUint64() {
  return 8;
}

function marshalUint64(n, b, v) {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  view.setBigUint64(n, BigInt(v), true);
  return n + 8;
}

function unmarshalUint64(n, b) {
  if (b.length - n < 8) {
    throw ErrBufTooSmall;
  }
  
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const value = view.getBigUint64(n, true);
  return [n + 8, Number(value)];
}

// Float encoding/decoding
function sizeFloat32() {
  return 4;
}

function marshalFloat32(n, b, v) {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  view.setFloat32(n, v, true);
  return n + 4;
}

function unmarshalFloat32(n, b) {
  if (b.length - n < 4) {
    throw ErrBufTooSmall;
  }
  
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const value = view.getFloat32(n, true);
  return [n + 4, value];
}

function sizeFloat64() {
  return 8;
}

function marshalFloat64(n, b, v) {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  view.setFloat64(n, v, true);
  return n + 8;
}

function unmarshalFloat64(n, b) {
  if (b.length - n < 8) {
    throw ErrBufTooSmall;
  }
  
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const value = view.getFloat64(n, true);
  return [n + 8, value];
}

// Boolean encoding/decoding
function sizeBool() {
  return 1;
}

function marshalBool(n, b, v) {
  b[n] = v ? 1 : 0;
  return n + 1;
}

function unmarshalBool(n, b) {
  if (b.length - n < 1) {
    throw ErrBufTooSmall;
  }
  
  return [n + 1, b[n] === 1];
}

// Byte and Bytes encoding/decoding
function sizeByte() {
  return 1;
}

function marshalByte(n, b, byteValue) {
  b[n] = byteValue;
  return n + 1;
}

function unmarshalByte(n, b) {
  if (b.length - n < 1) {
    throw ErrBufTooSmall;
  }
  return [n + 1, b[n]];
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
  
  if (b.length - newN < length) {
    throw ErrBufTooSmall;
  }
  
  const result = new Uint8Array(length);
  result.set(b.subarray(newN, newN + length));
  return [newN + length, result];
}

function unmarshalBytesCropped(n, b) {
  const [newN, length] = unmarshalUint(n, b);
  
  if (b.length - newN < length) {
    throw ErrBufTooSmall;
  }
  
  return [newN + length, b.subarray(newN, newN + length)];
}

// Skip functions
function skipBool(n, b) {
  if (b.length - n < 1) {
    throw ErrBufTooSmall;
  }
  return n + 1;
}

function skipByte(n, b) {
  if (b.length - n < 1) {
    throw ErrBufTooSmall;
  }
  return n + 1;
}

function skipFloat32(n, b) {
  if (b.length - n < 4) {
    throw ErrBufTooSmall;
  }
  return n + 4;
}

function skipFloat64(n, b) {
  if (b.length - n < 8) {
    throw ErrBufTooSmall;
  }
  return n + 8;
}

function skipInt16(n, b) {
  if (b.length - n < 2) {
    throw ErrBufTooSmall;
  }
  return n + 2;
}

function skipInt32(n, b) {
  if (b.length - n < 4) {
    throw ErrBufTooSmall;
  }
  return n + 4;
}

function skipInt64(n, b) {
  if (b.length - n < 8) {
    throw ErrBufTooSmall;
  }
  return n + 8;
}

function skipUint16(n, b) {
  if (b.length - n < 2) {
    throw ErrBufTooSmall;
  }
  return n + 2;
}

function skipUint32(n, b) {
  if (b.length - n < 4) {
    throw ErrBufTooSmall;
  }
  return n + 4;
}

function skipUint64(n, b) {
  if (b.length - n < 8) {
    throw ErrBufTooSmall;
  }
  return n + 8;
}

function skipVarint(n, b) {
  for (let i = 0; i < 10; i++) {
    if (n + i >= b.length) {
      throw ErrBufTooSmall;
    }
    
    const byte = b[n + i];
    if (byte < 0x80) {
      if (i === 9 && byte > 1) {
        throw ErrOverflow;
      }
      return n + i + 1;
    }
  }
  
  throw ErrOverflow;
}

function skipString(n, b) {
  const [newN, length] = unmarshalUint(n, b);
  
  if (b.length - newN < length) {
    throw ErrBufTooSmall;
  }
  
  return newN + length;
}

function skipBytes(n, b) {
  const [newN, length] = unmarshalUint(n, b);
  
  if (b.length - newN < length) {
    throw ErrBufTooSmall;
  }
  
  return newN + length;
}

// Export all functions
module.exports = {
  BencError,
  ErrOverflow,
  ErrBufTooSmall,
  sizeUint,
  marshalUint,
  unmarshalUint,
  sizeInt,
  marshalInt,
  unmarshalInt,
  sizeString,
  marshalString,
  unmarshalString,
  skipBool,
  skipByte,
  skipFloat32,
  skipFloat64,
  skipInt16,
  skipInt32,
  skipInt64,
  skipUint16,
  skipUint32,
  skipUint64,
  skipVarint,
  skipString,
  skipBytes,
  skipSlice,
  skipMap,
  sizeSlice,
  marshalSlice,
  unmarshalSlice,
  sizeMap,
  marshalMap,
  unmarshalMap,
  sizeInt16,
  marshalInt16,
  unmarshalInt16,
  sizeInt32,
  marshalInt32,
  unmarshalInt32,
  sizeInt64,
  marshalInt64,
  unmarshalInt64,
  sizeUint16,
  marshalUint16,
  unmarshalUint16,
  sizeUint32,
  marshalUint32,
  unmarshalUint32,
  sizeUint64,
  marshalUint64,
  unmarshalUint64,
  sizeFloat32,
  marshalFloat32,
  unmarshalFloat32,
  sizeFloat64,
  marshalFloat64,
  unmarshalFloat64,
  sizeBool,
  marshalBool,
  unmarshalBool,
  sizeByte,
  marshalByte,
  unmarshalByte,
  sizeBytes,
  marshalBytes,
  unmarshalBytesCopied,
  unmarshalBytesCropped
};