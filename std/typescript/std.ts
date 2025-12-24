/**
 * This module is a TypeScript implementation of the Go `bstd` package,
 * providing tools for binary serialization and deserialization.
 *
 * ## API Design
 *
 * Functions operate by taking a numerical offset `n` and a buffer `b` (`Uint8Array`).
 *
 * - **Serialization (Marshalling)** functions return the new offset after writing
 * data to the buffer.
 * - **Deserialization (Unmarshalling)** functions return a tuple `[number, T]`,
 * containing the new offset and the unmarshalled value `T`.
 * - **Sizing** functions return the number of bytes required to marshal a given value.
 * - **Skipping** functions return the new offset after skipping over a marshalled value.
 */

// =============================================================================
// Errors
// =============================================================================

export const ErrBufTooSmall = new Error("buffer is too small");
export const ErrOverflow = new Error("varint overflows a 64-bit integer");

// =============================================================================
// Constants
// =============================================================================

const maxVarintLen = 10; // Maximum number of bytes for a 64-bit varint
const terminator = new Uint8Array([1, 1, 1, 1]);

// =============================================================================
// String
// =============================================================================

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/** Returns the bytes needed to marshal a string. */
export function sizeString(str: string): number {
  // A string is marshalled as a varint-encoded length followed by the UTF-8 bytes.
  const v = textEncoder.encode(str).length;
  return v + sizeUint(v);
}

/** Returns the new offset 'n' after marshalling the string. */
export function marshalString(n: number, b: Uint8Array, str: string): number {
  const strBytes = textEncoder.encode(str);
  n = marshalUint(n, b, strBytes.length);
  b.set(strBytes, n);
  return n + strBytes.length;
}

/** Returns the new offset 'n' and the unmarshalled string. */
export function unmarshalString(n: number, b: Uint8Array): [number, string] {
  const [newN, us] = unmarshalUint(n, b);
  const s = Number(us); // Length will be within safe integer range for strings
  n = newN;

  if (b.length - n < s) {
    throw ErrBufTooSmall;
  }
  const str = textDecoder.decode(b.subarray(n, n + s));
  return [n + s, str];
}

/** Returns the new offset 'n' after skipping the marshalled string. */
export function skipString(n: number, b: Uint8Array): number {
  const [newN, us] = unmarshalUint(n, b);
  const s = Number(us);
  n = newN;

  if (b.length - n < s) {
    throw ErrBufTooSmall;
  }
  return n + s;
}

/**
 * An alias for marshalString. In JavaScript, there is no direct, safe equivalent
 * of Go's unsafe string-to-byte conversion. This function is provided for
 * API compatibility with the original Go library.
 */
export const marshalUnsafeString = marshalString;


/**
 * An alias for unmarshalString. In JavaScript, there is no direct, safe equivalent
 * of Go's unsafe byte-to-string conversion. This function is provided for
 * API compatibility with the original Go library.
 */
export const unmarshalUnsafeString = unmarshalString;

// =============================================================================
// Slice / Array<T>
// =============================================================================

type SizerFunc<T> = (t: T) => number;
type MarshalFunc<T> = (n: number, b: Uint8Array, t: T) => number;
type UnmarshalFunc<T> = (n: number, b: Uint8Array) => [number, T];
type SkipFunc = (n: number, b: Uint8Array) => number;

/** Returns the bytes needed to marshal a slice with dynamically sized elements. */
export function sizeSlice<T>(slice: T[], sizer: SizerFunc<T>): number {
  let s = sizeUint(slice.length);
  for (const t of slice) {
    s += sizer(t);
  }
  return s + terminator.length;
}

/** Returns the bytes needed to marshal a slice with fixed-size elements. */
export function sizeFixedSlice<T>(slice: T[], elemSize: number): number {
    const v = slice.length;
    return sizeUint(v) + (v * elemSize) + terminator.length;
}

/** Returns the new offset 'n' after marshalling the slice. */
export function marshalSlice<T>(n: number, b: Uint8Array, slice: T[], marshaler: MarshalFunc<T>): number {
  n = marshalUint(n, b, slice.length);
  for (const t of slice) {
    n = marshaler(n, b, t);
  }
  b.set(terminator, n);
  return n + terminator.length;
}

/** Returns the new offset 'n' and the unmarshalled slice. */
export function unmarshalSlice<T>(n: number, b: Uint8Array, unmarshaler: UnmarshalFunc<T>): [number, T[]] {
  const [newN, us] = unmarshalUint(n, b);
  const s = Number(us);
  n = newN;

  const ts: T[] = new Array(s);
  for (let i = 0; i < s; i++) {
    const [nn, t] = unmarshaler(n, b);
    n = nn;
    ts[i] = t;
  }

  if (b.length - n < terminator.length) {
    throw ErrBufTooSmall;
  }
  // TODO: Check for terminator bytes for safety
  return [n + terminator.length, ts];
}

/** Returns the new offset 'n' after skipping the marshalled slice. */
export function skipSlice(n: number, b: Uint8Array, skipElement: SkipFunc): number {
    // 1. Unmarshal the number of elements in the slice.
    const [newN, elementCount] = unmarshalUint(n, b);
    n = newN;

    // 2. Loop 'elementCount' times, calling the provided skipper for each element.
    const count = Number(elementCount);
    for (let i = 0; i < count; i++) {
        n = skipElement(n, b);
    }

    // 3. Finally, skip the 4-byte terminator.
    if (b.length - n < terminator.length) {
        throw ErrBufTooSmall;
    }
    return n + terminator.length;
}


// =============================================================================
// Map / Map<K, V>
// =============================================================================

/** Returns the bytes needed to marshal a map. */
export function sizeMap<K, V>(m: Map<K, V>, kSizer: SizerFunc<K>, vSizer: SizerFunc<V>): number {
  let s = sizeUint(m.size);
  for (const [k, v] of m.entries()) {
    s += kSizer(k);
    s += vSizer(v);
  }
  return s + terminator.length;
}

/** Returns the new offset 'n' after marshalling the map. */
export function marshalMap<K, V>(n: number, b: Uint8Array, m: Map<K, V>, kMarshaler: MarshalFunc<K>, vMarshaler: MarshalFunc<V>): number {
  n = marshalUint(n, b, m.size);
  for (const [k, v] of m.entries()) {
    n = kMarshaler(n, b, k);
    n = vMarshaler(n, b, v);
  }
  b.set(terminator, n);
  return n + terminator.length;
}

/** Returns the new offset 'n' and the unmarshalled map. */
export function unmarshalMap<K, V>(n: number, b: Uint8Array, kUnmarshaler: UnmarshalFunc<K>, vUnmarshaler: UnmarshalFunc<V>): [number, Map<K, V>] {
  const [newN, us] = unmarshalUint(n, b);
  const s = Number(us);
  n = newN;

  const m = new Map<K, V>();
  for (let i = 0; i < s; i++) {
    const [nk, k] = kUnmarshaler(n, b);
    const [nv, v] = vUnmarshaler(nk, b);
    n = nv;
    m.set(k, v);
  }

  if (b.length - n < terminator.length) {
    throw ErrBufTooSmall;
  }
  // TODO: Check for terminator bytes for safety
  return [n + terminator.length, m];
}

/** Returns the new offset 'n' after skipping the marshalled map. */
export function skipMap(n: number, b: Uint8Array, skipKey: SkipFunc, skipValue: SkipFunc): number {
    // 1. Unmarshal the number of key-value pairs in the map.
    const [newN, pairCount] = unmarshalUint(n, b);
    n = newN;

    // 2. Loop 'pairCount' times, skipping one key and one value in each iteration.
    const count = Number(pairCount);
    for (let i = 0; i < count; i++) {
        n = skipKey(n, b);
        n = skipValue(n, b);
    }

    // 3. Finally, skip the 4-byte terminator.
    if (b.length - n < terminator.length) {
        throw ErrBufTooSmall;
    }
    return n + terminator.length;
}


// =============================================================================
// Byte
// =============================================================================

/** Returns the bytes needed to marshal a byte (1). */
export function sizeByte(): number {
  return 1;
}

/** Returns the new offset 'n' after marshalling the byte. */
export function marshalByte(n: number, b: Uint8Array, byt: number): number {
  if (b.length - n < 1) throw ErrBufTooSmall;
  b[n] = byt;
  return n + 1;
}

/** Returns the new offset 'n' and the unmarshalled byte. */
export function unmarshalByte(n: number, b: Uint8Array): [number, number] {
  if (b.length - n < 1) {
    throw ErrBufTooSmall;
  }
  return [n + 1, b[n]!];
}

/** Returns the new offset 'n' after skipping the marshalled byte. */
export function skipByte(n: number, b: Uint8Array): number {
  if (b.length - n < 1) {
    throw ErrBufTooSmall;
  }
  return n + 1;
}

// =============================================================================
// Byte Slice (Uint8Array)
// =============================================================================

/** Returns the bytes needed to marshal a byte slice. */
export function sizeBytes(bs: Uint8Array): number {
  const v = bs.length;
  return v + sizeUint(v);
}

/** Returns the new offset 'n' after marshalling the byte slice. */
export function marshalBytes(n: number, b: Uint8Array, bs: Uint8Array): number {
  n = marshalUint(n, b, bs.length);
  b.set(bs, n);
  return n + bs.length;
}

/** Unmarshals a byte slice by returning a view on the original buffer (zero-copy). */
export function unmarshalBytesCropped(n: number, b: Uint8Array): [number, Uint8Array] {
  const [newN, us] = unmarshalUint(n, b);
  const s = Number(us);
  n = newN;

  if (b.length - n < s) {
    throw ErrBufTooSmall;
  }
  return [n + s, b.subarray(n, n + s)];
}

/** Unmarshals a byte slice by copying it into a new buffer. */
export function unmarshalBytesCopied(n: number, b: Uint8Array): [number, Uint8Array] {
  const [newN, us] = unmarshalUint(n, b);
  const s = Number(us);
  n = newN;

  if (b.length - n < s) {
    throw ErrBufTooSmall;
  }
  const cb = new Uint8Array(s);
  cb.set(b.subarray(n, n + s));
  return [n + s, cb];
}

/** Returns the new offset 'n' after skipping the marshalled byte slice. */
export function skipBytes(n: number, b: Uint8Array): number {
  const [newN, us] = unmarshalUint(n, b);
  const s = Number(us);
  n = newN;

  if (b.length - n < s) {
    throw ErrBufTooSmall;
  }
  return n + s;
}

// =============================================================================
// Varint (number | bigint)
// =============================================================================

function encodeZigZag(v: number | bigint): bigint {
  const n = BigInt(v);
  // (n << 1) ^ (n >> 63) for 64-bit integers
  return (n << 1n) ^ (n >> 63n);
}

function decodeZigZag(v: bigint): bigint {
  // (v >> 1) ^ -(v & 1)
  return (v >> 1n) ^ -(v & 1n);
}

/** Skips a varint-encoded integer in the buffer. */
export function skipVarint(n: number, buf: Uint8Array): number {
  for (let i = 0; i < maxVarintLen; i++) {
    const idx = n + i;
    if (idx >= buf.length) {
      throw ErrBufTooSmall;
    }
    const byte = buf[idx]!;
    if (byte < 0x80) {
      // This is the last byte of the varint.
      // Check for overflow on the 10th byte.
      if (i === maxVarintLen - 1 && byte > 1) {
        throw ErrOverflow;
      }
      return n + i + 1;
    }
  }
  // If the loop completes, it means all 10 bytes had the continuation bit set,
  // which is an overflow condition.
  throw ErrOverflow;
}

/** Returns the bytes needed to marshal a signed integer. */
export function sizeInt(sv: number | bigint): number {
  const v = encodeZigZag(sv);
  return sizeUint(v);
}

/** Returns the new offset 'n' after marshalling the signed integer. */
export function marshalInt(n: number, b: Uint8Array, sv: number | bigint): number {
  const v = encodeZigZag(sv);
  return marshalUint(n, b, v);
}

/** Returns the new offset 'n' and the unmarshalled signed integer. */
export function unmarshalInt(n: number, buf: Uint8Array): [number, number | bigint] {
  const [newN, val] = unmarshalUint(n, buf);
  const decoded = decodeZigZag(BigInt(val));

  // Return as `number` if it fits within safe integer range, otherwise `bigint`
  if (decoded <= BigInt(Number.MAX_SAFE_INTEGER) && decoded >= BigInt(Number.MIN_SAFE_INTEGER)) {
    return [newN, Number(decoded)];
  }
  return [newN, decoded];
}

/** Returns the bytes needed to marshal an unsigned integer. */
export function sizeUint(v: number | bigint): number {
  let val = BigInt(v);
  let i = 0;
  while (val >= 0x80n) {
    val >>= 7n;
    i++;
  }
  return i + 1;
}

/** Returns the new offset 'n' after marshalling the unsigned integer. */
export function marshalUint(n: number, b: Uint8Array, v: number | bigint): number {
  let val = BigInt(v);
  let i = n;
  while (val >= 0x80n) {
    b[i] = Number(val & 0xffn) | 0x80;
    val >>= 7n;
    i++;
  }
  b[i] = Number(val);
  return i + 1;
}

/** Returns the new offset 'n' and the unmarshalled unsigned integer. */
export function unmarshalUint(n: number, buf: Uint8Array): [number, number | bigint] {
  let x = 0n;
  let s = 0n;
  for (let i = 0; i < maxVarintLen; i++) {
    const idx = n + i;
    if (idx >= buf.length) {
      throw ErrBufTooSmall;
    }
    const byte = buf[idx]!;
    if (byte < 0x80) {
      if (i === maxVarintLen - 1 && byte > 1) {
        throw ErrOverflow;
      }
      const val = x | (BigInt(byte) << s);
      // Return as `number` if it fits, otherwise `bigint`
      if (val <= BigInt(Number.MAX_SAFE_INTEGER)) {
        return [n + i + 1, Number(val)];
      }
      return [n + i + 1, val];
    }
    x |= BigInt(byte & 0x7f) << s;
    s += 7n;
  }
  throw ErrOverflow;
}

// =============================================================================
// Fixed-Size Primitives
// =============================================================================

// Helper for fixed-size marshalling
function marshalFixed<T>(n: number, b: Uint8Array, v: T, size: number, setter: (offset: number, val: T, littleEndian: boolean) => void): number {
  if (b.length - n < size) throw ErrBufTooSmall;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  setter.call(view, n, v, true); // true for little-endian
  return n + size;
}

// Helper for fixed-size unmarshalling
function unmarshalFixed<T>(n: number, b: Uint8Array, size: number, getter: (offset: number, littleEndian: boolean) => T): [number, T] {
  if (b.length - n < size) throw ErrBufTooSmall;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const val = getter.call(view, n, true);
  return [n + size, val];
}

// Helper for fixed-size skipping
function skipFixed(n: number, b: Uint8Array, size: number): number {
  if (b.length - n < size) throw ErrBufTooSmall;
  return n + size;
}

// --- Uint64 ---
export const sizeUint64 = () => 8;
export const marshalUint64 = (n: number, b: Uint8Array, v: bigint) => marshalFixed(n, b, v, 8, DataView.prototype.setBigUint64);
export const unmarshalUint64 = (n: number, b: Uint8Array) => unmarshalFixed<bigint>(n, b, 8, DataView.prototype.getBigUint64);
export const skipUint64 = (n: number, b: Uint8Array) => skipFixed(n, b, 8);

// --- Uint32 ---
export const sizeUint32 = () => 4;
export const marshalUint32 = (n: number, b: Uint8Array, v: number) => marshalFixed(n, b, v, 4, DataView.prototype.setUint32);
export const unmarshalUint32 = (n: number, b: Uint8Array) => unmarshalFixed<number>(n, b, 4, DataView.prototype.getUint32);
export const skipUint32 = (n: number, b: Uint8Array) => skipFixed(n, b, 4);

// --- Uint16 ---
export const sizeUint16 = () => 2;
export const marshalUint16 = (n: number, b: Uint8Array, v: number) => marshalFixed(n, b, v, 2, DataView.prototype.setUint16);
export const unmarshalUint16 = (n: number, b: Uint8Array) => unmarshalFixed<number>(n, b, 2, DataView.prototype.getUint16);
export const skipUint16 = (n: number, b: Uint8Array) => skipFixed(n, b, 2);

// --- Int64 ---
export const sizeInt64 = () => 8;
export const marshalInt64 = (n: number, b: Uint8Array, v: bigint) => marshalFixed(n, b, v, 8, DataView.prototype.setBigInt64);
export const unmarshalInt64 = (n: number, b: Uint8Array) => unmarshalFixed<bigint>(n, b, 8, DataView.prototype.getBigInt64);
export const skipInt64 = (n: number, b: Uint8Array) => skipFixed(n, b, 8);

// --- Int32 ---
export const sizeInt32 = () => 4;
export const marshalInt32 = (n: number, b: Uint8Array, v: number) => marshalFixed(n, b, v, 4, DataView.prototype.setInt32);
export const unmarshalInt32 = (n: number, b: Uint8Array) => unmarshalFixed<number>(n, b, 4, DataView.prototype.getInt32);
export const skipInt32 = (n: number, b: Uint8Array) => skipFixed(n, b, 4);

// --- Int16 ---
export const sizeInt16 = () => 2;
export const marshalInt16 = (n: number, b: Uint8Array, v: number) => marshalFixed(n, b, v, 2, DataView.prototype.setInt16);
export const unmarshalInt16 = (n: number, b: Uint8Array) => unmarshalFixed<number>(n, b, 2, DataView.prototype.getInt16);
export const skipInt16 = (n: number, b: Uint8Array) => skipFixed(n, b, 2);

// --- Int8 ---
export const sizeInt8 = () => 1;
export const marshalInt8 = (n: number, b: Uint8Array, v: number) => marshalFixed(n, b, v, 1, DataView.prototype.setInt8);
export const unmarshalInt8 = (n: number, b: Uint8Array) => unmarshalFixed<number>(n, b, 1, DataView.prototype.getInt8);
export const skipInt8 = (n: number, b: Uint8Array) => skipFixed(n, b, 1);

// --- Float64 ---
export const sizeFloat64 = () => 8;
export const marshalFloat64 = (n: number, b: Uint8Array, v: number) => marshalFixed(n, b, v, 8, DataView.prototype.setFloat64);
export const unmarshalFloat64 = (n: number, b: Uint8Array) => unmarshalFixed<number>(n, b, 8, DataView.prototype.getFloat64);
export const skipFloat64 = (n: number, b: Uint8Array) => skipFixed(n, b, 8);

// --- Float32 ---
export const sizeFloat32 = () => 4;
export const marshalFloat32 = (n: number, b: Uint8Array, v: number) => marshalFixed(n, b, v, 4, DataView.prototype.setFloat32);
export const unmarshalFloat32 = (n: number, b: Uint8Array) => unmarshalFixed<number>(n, b, 4, DataView.prototype.getFloat32);
export const skipFloat32 = (n: number, b: Uint8Array) => skipFixed(n, b, 4);

// --- Bool ---
export const sizeBool = () => 1;
export const marshalBool = (n: number, b: Uint8Array, v: boolean) => marshalByte(n, b, v ? 1 : 0);
export const unmarshalBool = (n: number, b: Uint8Array): [number, boolean] => {
  const [newN, val] = unmarshalByte(n, b);
  return [newN, val === 1];
};
export const skipBool = (n: number, b: Uint8Array) => skipByte(n, b);

// =============================================================================
// Time (Date)
// =============================================================================

/** Returns the bytes needed to marshal a Date object (8). */
export const sizeTime = (): number => sizeInt64();

/** Marshals a Date object as an int64 nanosecond timestamp. */
export function marshalTime(n: number, b: Uint8Array, t: Date): number {
  const nanos = BigInt(t.getTime()) * 1_000_000n;
  return marshalInt64(n, b, nanos);
}

/** Unmarshals an int64 nanosecond timestamp into a Date object. */
export function unmarshalTime(n: number, b: Uint8Array): [number, Date] {
  const [newN, nanos] = unmarshalInt64(n, b);
  const millis = Number(nanos / 1_000_000n);
  return [newN, new Date(millis)];
}

/** Skips a marshalled Date object in the buffer. */
export const skipTime = (n: number, b: Uint8Array): number => skipInt64(n, b);

// =============================================================================
// Pointer (Nullable Types)
// =============================================================================

/** Returns the bytes needed to marshal a nullable value. */
export function sizePointer<T>(v: T | null | undefined, sizer: SizerFunc<T>): number {
  let size = sizeBool();
  if (v != null) {
    size += sizer(v);
  }
  return size;
}

/** Marshals a nullable value, prefixed with a boolean flag. */
export function marshalPointer<T>(n: number, b: Uint8Array, v: T | null | undefined, marshaler: MarshalFunc<T>): number {
  const hasValue = v != null;
  n = marshalBool(n, b, hasValue);
  if (hasValue) {
    n = marshaler(n, b, v!);
  }
  return n;
}

/** Unmarshals a nullable value. Returns the value, or null if it was not present. */
export function unmarshalPointer<T>(n: number, b: Uint8Array, unmarshaler: UnmarshalFunc<T>): [number, T | null] {
  const [newN, hasValue] = unmarshalBool(n, b);
  n = newN;
  if (hasValue) {
    return unmarshaler(n, b);
  }
  return [n, null];
}

/** Skips a marshalled nullable value in the buffer. */
export function skipPointer(n: number, b: Uint8Array, skipper: SkipFunc): number {
  const [newN, hasValue] = unmarshalBool(n, b);
  n = newN;
  if (hasValue) {
    n = skipper(n, b);
  }
  return n;
}

