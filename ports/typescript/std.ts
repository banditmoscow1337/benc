// Error types
class BencError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BencError';
  }
}

const ErrOverflow = new BencError('varint overflowed a N-bit unsigned integer');
const ErrBufTooSmall = new BencError('buffer was too small');

// Type definitions
type SizeFunc<T> = (t: T) => number;
type MarshalFunc<T> = (n: number, b: Uint8Array, t: T) => number;
type UnmarshalFunc<T> = (n: number, b: Uint8Array) => [number, T];

// String encoding/decoding
function sizeString(str: string): number {
  const v = str.length;
  return v + sizeUint(v);
}

function marshalString(n: number, b: Uint8Array, str: string): number {
  n = marshalUint(n, b, str.length);
  const encoder = new TextEncoder();
  const encoded = encoder.encode(str);
  b.set(encoded, n);
  return n + encoded.length;
}

function unmarshalString(n: number, b: Uint8Array): [number, string] {
  const [newN, length] = unmarshalUint(n, b);
  
  if (b.length - newN < length) {
    throw ErrBufTooSmall;
  }
  
  const decoder = new TextDecoder('utf-8');
  const str = decoder.decode(b.subarray(newN, newN + length));
  return [newN + length, str];
}

// Slice encoding/decoding
function skipSlice(n: number, b: Uint8Array): number {
  const length = b.length;
  
  while (true) {
    if (length - n < 4) {
      throw ErrBufTooSmall;
    }
    
    if (b[n] === 1 && b[n+1] === 1 && b[n+2] === 1 && b[n+3] === 1) {
      return n + 4;
    }
    n++;
  }
}

function sizeSlice<T>(slice: T[], sizer: SizeFunc<T>): number {
  let s = 4 + sizeUint(slice.length);
  
  for (const t of slice) {
    s += sizer(t);
  }
  
  return s;
}

function marshalSlice<T>(n: number, b: Uint8Array, slice: T[], marshaler: MarshalFunc<T>): number {
  n = marshalUint(n, b, slice.length);
  
  for (const t of slice) {
    n = marshaler(n, b, t);
  }
  
  b[n] = 1;
  b[n+1] = 1;
  b[n+2] = 1;
  b[n+3] = 1;
  return n + 4;
}

function unmarshalSlice<T>(n: number, b: Uint8Array, unmarshaler: UnmarshalFunc<T>): [number, T[]] {
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
function skipMap(n: number, b: Uint8Array): number {
  const length = b.length;
  
  while (true) {
    if (length - n < 4) {
      throw ErrBufTooSmall;
    }
    
    if (b[n] === 1 && b[n+1] === 1 && b[n+2] === 1 && b[n+3] === 1) {
      return n + 4;
    }
    n++;
  }
}

function sizeMap<K, V>(m: Map<K, V>, kSizer: SizeFunc<K>, vSizer: SizeFunc<V>): number {
  let s = 4 + sizeUint(m.size);
  
  for (const [k, v] of m) {
    s += kSizer(k) + vSizer(v);
  }
  
  return s;
}

function marshalMap<K, V>(
  n: number, 
  b: Uint8Array, 
  m: Map<K, V>, 
  kMarshaler: MarshalFunc<K>, 
  vMarshaler: MarshalFunc<V>
): number {
  n = marshalUint(n, b, m.size);
  
  for (const [k, v] of m) {
    n = kMarshaler(n, b, k);
    n = vMarshaler(n, b, v);
  }
  
  b[n] = 1;
  b[n+1] = 1;
  b[n+2] = 1;
  b[n+3] = 1;
  return n + 4;
}

function unmarshalMap<K, V>(
  n: number, 
  b: Uint8Array, 
  kUnmarshaler: UnmarshalFunc<K>, 
  vUnmarshaler: UnmarshalFunc<V>
): [number, Map<K, V>] {
  const [newN, size] = unmarshalUint(n, b);
  const map = new Map<K, V>();
  let currentN = newN;
  
  for (let i = 0; i < size; i++) {
    let key: K, value: V;
    
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

function marshalUint32(n: number, b: Uint8Array, v: number): number {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  view.setUint32(n, v, true);
  return n + 4;
}

function unmarshalUint32(n: number, b: Uint8Array): [number, number] {
  if (b.length - n < 4) {
    throw ErrBufTooSmall;
  }
  
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const value = view.getUint32(n, true);
  return [n + 4, value];
}

function marshalUint16(n: number, b: Uint8Array, v: number): number {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  view.setUint16(n, v, true);
  return n + 2;
}

function unmarshalUint16(n: number, b: Uint8Array): [number, number] {
  if (b.length - n < 2) {
    throw ErrBufTooSmall;
  }
  
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const value = view.getUint16(n, true);
  return [n + 2, value];
}

// Boolean encoding/decoding
function sizeBool(): number {
  return 1;
}

function marshalBool(n: number, b: Uint8Array, v: boolean): number {
  b[n] = v ? 1 : 0;
  return n + 1;
}

function unmarshalBool(n: number, b: Uint8Array): [number, boolean] {
  if (b.length - n < 1) {
    throw ErrBufTooSmall;
  }
  
  return [n + 1, b[n] === 1];
}

// Byte and Bytes encoding/decoding
function sizeBytes(bs: Uint8Array): number {
  return bs.length + sizeUint(bs.length);
}

function marshalBytes(n: number, b: Uint8Array, bs: Uint8Array): number {
  n = marshalUint(n, b, bs.length);
  b.set(bs, n);
  return n + bs.length;
}

function unmarshalBytesCopied(n: number, b: Uint8Array): [number, Uint8Array] {
  const [newN, length] = unmarshalUint(n, b);
  
  if (b.length - newN < length) {
    throw ErrBufTooSmall;
  }
  
  const result = new Uint8Array(length);
  result.set(b.subarray(newN, newN + length));
  return [newN + length, result];
}

function unmarshalBytesCropped(n: number, b: Uint8Array): [number, Uint8Array] {
  const [newN, length] = unmarshalUint(n, b);
  
  if (b.length - newN < length) {
    throw ErrBufTooSmall;
  }
  
  return [newN + length, b.subarray(newN, newN + length)];
}

// Skip functions
function skipBool(n: number, b: Uint8Array): number {
  if (b.length - n < 1) {
    throw ErrBufTooSmall;
  }
  return n + 1;
}

function skipByte(n: number, b: Uint8Array): number {
  if (b.length - n < 1) {
    throw ErrBufTooSmall;
  }
  return n + 1;
}

function skipFloat32(n: number, b: Uint8Array): number {
  if (b.length - n < 4) {
    throw ErrBufTooSmall;
  }
  return n + 4;
}

function skipFloat64(n: number, b: Uint8Array): number {
  if (b.length - n < 8) {
    throw ErrBufTooSmall;
  }
  return n + 8;
}

function skipInt16(n: number, b: Uint8Array): number {
  if (b.length - n < 2) {
    throw ErrBufTooSmall;
  }
  return n + 2;
}

function skipInt32(n: number, b: Uint8Array): number {
  if (b.length - n < 4) {
    throw ErrBufTooSmall;
  }
  return n + 4;
}

function skipInt64(n: number, b: Uint8Array): number {
  if (b.length - n < 8) {
    throw ErrBufTooSmall;
  }
  return n + 8;
}

function skipUint16(n: number, b: Uint8Array): number {
  if (b.length - n < 2) {
    throw ErrBufTooSmall;
  }
  return n + 2;
}

function skipUint32(n: number, b: Uint8Array): number {
  if (b.length - n < 4) {
    throw ErrBufTooSmall;
  }
  return n + 4;
}

function skipUint64(n: number, b: Uint8Array): number {
  if (b.length - n < 8) {
    throw ErrBufTooSmall;
  }
  return n + 8;
}

function skipVarint(n: number, b: Uint8Array): number {
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

function skipString(n: number, b: Uint8Array): number {
  const [newN, length] = unmarshalUint(n, b);
  
  if (b.length - newN < length) {
    throw ErrBufTooSmall;
  }
  
  return newN + length;
}

function skipBytes(n: number, b: Uint8Array): number {
  const [newN, length] = unmarshalUint(n, b);
  
  if (b.length - newN < length) {
    throw ErrBufTooSmall;
  }
  
  return newN + length;
}

// Byte functions
function sizeByte(): number {
  return 1;
}

function marshalByte(n: number, b: Uint8Array, byteValue: number): number {
  b[n] = byteValue;
  return n + 1;
}

function unmarshalByte(n: number, b: Uint8Array): [number, number] {
  if (b.length - n < 1) {
    throw ErrBufTooSmall;
  }
  return [n + 1, b[n]];
}


// Float encoding/decoding with exact value handling
function sizeFloat32(): number {
  return 4;
}

function marshalFloat32(n: number, b: Uint8Array, v: number): number {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  view.setFloat32(n, v, true);
  return n + 4;
}

function unmarshalFloat32(n: number, b: Uint8Array): [number, number] {
  if (b.length - n < 4) {
    throw ErrBufTooSmall;
  }
  
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const value = view.getFloat32(n, true);
  return [n + 4, value];
}

function sizeFloat64(): number {
  return 8;
}

function marshalFloat64(n: number, b: Uint8Array, v: number): number {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  view.setFloat64(n, v, true);
  return n + 8;
}

function unmarshalFloat64(n: number, b: Uint8Array): [number, number] {
  if (b.length - n < 8) {
    throw ErrBufTooSmall;
  }
  
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const value = view.getFloat64(n, true);
  return [n + 8, value];
}

// Integer encoding/decoding with proper type handling
function sizeInt16(): number {
  return 2;
}

function marshalInt16(n: number, b: Uint8Array, v: number): number {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  view.setInt16(n, v, true);
  return n + 2;
}

function unmarshalInt16(n: number, b: Uint8Array): [number, number] {
  if (b.length - n < 2) {
    throw ErrBufTooSmall;
  }
  
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const value = view.getInt16(n, true);
  return [n + 2, value];
}

function sizeInt32(): number {
  return 4;
}

function marshalInt32(n: number, b: Uint8Array, v: number): number {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  view.setInt32(n, v, true);
  return n + 4;
}

function unmarshalInt32(n: number, b: Uint8Array): [number, number] {
  if (b.length - n < 4) {
    throw ErrBufTooSmall;
  }
  
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const value = view.getInt32(n, true);
  return [n + 4, value];
}
// Helper function to create exact float32 values
function exactFloat32(v: number): number {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setFloat32(0, v, true);
  return view.getFloat32(0, true);
}

// Integer encoding/decoding with BigInt for large numbers
function sizeInt(sv: number): number {
  const v = encodeZigZag(BigInt(sv));
  return sizeUint(Number(v));
}

function marshalInt(n: number, b: Uint8Array, sv: number): number {
  const v = encodeZigZag(BigInt(sv));
  return marshalUint(n, b, Number(v));
}

function unmarshalInt(n: number, b: Uint8Array): [number, number] {
  const [newN, value] = unmarshalUint(n, b);
  const decoded = decodeZigZag(BigInt(value));
  return [newN, Number(decoded)];
}

// ZigZag encoding/decoding with BigInt
function encodeZigZag(t: bigint): bigint {
  return (t << 1n) ^ (t >> 63n);
}

function decodeZigZag(t: bigint): bigint {
  return (t >> 1n) ^ -(t & 1n);
}

// Unsigned integer encoding/decoding with proper bit handling
function sizeUint(v: number): number {
  let value = BigInt(v);
  let i = 0;
  
  while (value >= 0x80n) {
    value >>= 7n;
    i++;
  }
  
  return i + 1;
}

function marshalUint(n: number, b: Uint8Array, v: number): number {
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

function unmarshalUint(n: number, b: Uint8Array): [number, number] {
  let value = 0n;
  let shift = 0n;
  let byte: number;
  
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

// Fixed-size integer encoding/decoding with BigInt
function sizeInt64(): number {
  return 8;
}

function marshalInt64(n: number, b: Uint8Array, v: number): number {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  view.setBigInt64(n, BigInt(v), true);
  return n + 8;
}

function unmarshalInt64(n: number, b: Uint8Array): [number, number] {
  if (b.length - n < 8) {
    throw ErrBufTooSmall;
  }
  
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const value = view.getBigInt64(n, true);
  return [n + 8, Number(value)];
}

function sizeUint64(): number {
  return 8;
}

function marshalUint64(n: number, b: Uint8Array, v: number): number {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  view.setBigUint64(n, BigInt(v), true);
  return n + 8;
}

function unmarshalUint64(n: number, b: Uint8Array): [number, number] {
  if (b.length - n < 8) {
    throw ErrBufTooSmall;
  }
  
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const value = view.getBigUint64(n, true);
  return [n + 8, Number(value)];
}


// Export all functions
export {
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
  skipSlice,
  sizeSlice,
  marshalSlice,
  unmarshalSlice,
  skipMap,
  sizeMap,
  marshalMap,
  unmarshalMap,
  marshalUint64,
  unmarshalUint64,
  marshalInt64,
  unmarshalInt64,
  marshalUint32,
  unmarshalUint32,
  marshalInt32,
  unmarshalInt32,
  marshalUint16,
  unmarshalUint16,
  marshalInt16,
  unmarshalInt16,
  marshalFloat64,
  unmarshalFloat64,
  marshalFloat32,
  unmarshalFloat32,
  sizeBool,
  marshalBool,
  unmarshalBool,
  sizeBytes,
  marshalBytes,
  sizeInt16,
  sizeInt32,
  sizeInt64,
  sizeUint16,
  sizeUint32,
  sizeUint64,
  sizeFloat32,
  sizeFloat64,
  unmarshalBytesCopied,
  unmarshalBytesCropped,
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
  sizeByte,
  marshalByte,
  unmarshalByte,
  exactFloat32
};

// Fixed-size integer encoding/decoding

function sizeUint16(): number {
  return 2;
}

function sizeUint32(): number {
  return 4;
}