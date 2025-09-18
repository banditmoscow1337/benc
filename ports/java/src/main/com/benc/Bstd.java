package main.com.benc;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/**
 * A Java implementation of the Go `benc` binary serialization library.
 * This version is enhanced for readability while maintaining 100% binary compati§bility.
 */
public final class Bstd {

    private Bstd() {
        // Prevent instantiation of this utility class.
    }

    // A constant 4-byte terminator for slices and maps.
    private static final byte[] SLICE_MAP_TERMINATOR = {1, 1, 1, 1};
    private static final int TERMINATOR_SIZE = 4;
    private static final int MAX_VARINT_LEN_64 = 10;

    // Functional Interfaces for clean API design, mirroring Go's function types.
    @FunctionalInterface
    public interface SkipFunc {
        int skip(int offset, byte[] buffer) throws BencException;
    }

    @FunctionalInterface
    public interface MarshalFunc<T> {
        int marshal(int offset, byte[] buffer, T value);
    }

    @FunctionalInterface
    public interface UnmarshalFunc<T> {
        UnmarshalResult<T> unmarshal(int offset, byte[] buffer) throws BencException;
    }
    
    // Helper record for UnmarshalFunc to return both new offset and value.
    public record UnmarshalResult<T>(int newOffset, T value) {}


    // =================================================================================
    // String Functions
    // =================================================================================

    public static int skipString(int offset, byte[] buffer) throws BencException {
        UnmarshalResult<Long> varintResult = unmarshalUint(offset, buffer);
        int strLen = (int) varintResult.value().longValue();
        int currentOffset = varintResult.newOffset();

        if (buffer.length - currentOffset < strLen) {
            throw new BencBufferTooSmallException();
        }
        return currentOffset + strLen;
    }

    public static int sizeString(String str) {
        int len = str.getBytes(StandardCharsets.UTF_8).length;
        return len + sizeUint(len);
    }

    public static int marshalString(int offset, byte[] buffer, String str) {
        byte[] strBytes = str.getBytes(StandardCharsets.UTF_8);
        int newOffset = marshalUint(offset, buffer, strBytes.length);
        System.arraycopy(strBytes, 0, buffer, newOffset, strBytes.length);
        return newOffset + strBytes.length;
    }

    public static UnmarshalResult<String> unmarshalString(int offset, byte[] buffer) throws BencException {
        UnmarshalResult<Long> varintResult = unmarshalUint(offset, buffer);
        int strLen = (int) varintResult.value().longValue();
        int currentOffset = varintResult.newOffset();

        if (buffer.length - currentOffset < strLen) {
            throw new BencBufferTooSmallException();
        }
        String val = new String(buffer, currentOffset, strLen, StandardCharsets.UTF_8);
        return new UnmarshalResult<>(currentOffset + strLen, val);
    }

    public static int marshalUnsafeString(int offset, byte[] buffer, String str) {
        return marshalString(offset, buffer, str);
    }

    public static UnmarshalResult<String> unmarshalUnsafeString(int offset, byte[] buffer) throws BencException {
        return unmarshalString(offset, buffer);
    }


    // =================================================================================
    // Slice / List Functions
    // =================================================================================

    public static int skipSlice(int offset, byte[] buffer, SkipFunc skipElement) throws BencException {
        UnmarshalResult<Long> countResult = unmarshalUint(offset, buffer);
        long elementCount = countResult.value();
        int currentOffset = countResult.newOffset();

        for (long i = 0; i < elementCount; i++) {
            currentOffset = skipElement.skip(currentOffset, buffer);
        }

        if (buffer.length - currentOffset < TERMINATOR_SIZE) {
            throw new BencBufferTooSmallException();
        }
        return currentOffset + TERMINATOR_SIZE;
    }
    
    public static <T> int sizeSlice(List<T> list, Function<T, Integer> sizer) {
        int size = TERMINATOR_SIZE + sizeUint(list.size());
        for (T item : list) {
            size += sizer.apply(item);
        }
        return size;
    }

    public static <T> int sizeFixedSlice(List<T> list, int elementSize) {
        return TERMINATOR_SIZE + sizeUint(list.size()) + (list.size() * elementSize);
    }
    
    public static <T> int marshalSlice(int offset, byte[] buffer, List<T> list, MarshalFunc<T> marshaler) {
        int currentOffset = marshalUint(offset, buffer, list.size());
        for (T item : list) {
            currentOffset = marshaler.marshal(currentOffset, buffer, item);
        }
        System.arraycopy(SLICE_MAP_TERMINATOR, 0, buffer, currentOffset, TERMINATOR_SIZE);
        return currentOffset + TERMINATOR_SIZE;
    }

    public static <T> UnmarshalResult<List<T>> unmarshalSlice(int offset, byte[] buffer, UnmarshalFunc<T> unmarshaler) throws BencException {
        UnmarshalResult<Long> countResult = unmarshalUint(offset, buffer);
        int count = countResult.value().intValue();
        int currentOffset = countResult.newOffset();

        List<T> list = new ArrayList<>(count);
        for (int i = 0; i < count; i++) {
            UnmarshalResult<T> itemResult = unmarshaler.unmarshal(currentOffset, buffer);
            list.add(itemResult.value());
            currentOffset = itemResult.newOffset();
        }

        if (buffer.length - currentOffset < TERMINATOR_SIZE) {
            throw new BencBufferTooSmallException();
        }
        return new UnmarshalResult<>(currentOffset + TERMINATOR_SIZE, list);
    }
    

    // =================================================================================
    // Map Functions
    // =================================================================================

    public static int skipMap(int offset, byte[] buffer, SkipFunc skipKey, SkipFunc skipValue) throws BencException {
        UnmarshalResult<Long> countResult = unmarshalUint(offset, buffer);
        long pairCount = countResult.value();
        int currentOffset = countResult.newOffset();

        for (long i = 0; i < pairCount; i++) {
            currentOffset = skipKey.skip(currentOffset, buffer);
            currentOffset = skipValue.skip(currentOffset, buffer);
        }

        if (buffer.length - currentOffset < TERMINATOR_SIZE) {
            throw new BencBufferTooSmallException();
        }
        return currentOffset + TERMINATOR_SIZE;
    }

    public static <K, V> int sizeMap(Map<K, V> map, Function<K, Integer> keySizer, Function<V, Integer> valueSizer) {
        int size = TERMINATOR_SIZE + sizeUint(map.size());
        for (Map.Entry<K, V> entry : map.entrySet()) {
            size += keySizer.apply(entry.getKey());
            size += valueSizer.apply(entry.getValue());
        }
        return size;
    }

    public static <K, V> int marshalMap(int offset, byte[] buffer, Map<K, V> map, MarshalFunc<K> keyMarshaler, MarshalFunc<V> valueMarshaler) {
        int currentOffset = marshalUint(offset, buffer, map.size());
        for (Map.Entry<K, V> entry : map.entrySet()) {
            currentOffset = keyMarshaler.marshal(currentOffset, buffer, entry.getKey());
            currentOffset = valueMarshaler.marshal(currentOffset, buffer, entry.getValue());
        }
        System.arraycopy(SLICE_MAP_TERMINATOR, 0, buffer, currentOffset, TERMINATOR_SIZE);
        return currentOffset + TERMINATOR_SIZE;
    }
    
    public static <K, V> UnmarshalResult<Map<K, V>> unmarshalMap(int offset, byte[] buffer, UnmarshalFunc<K> keyUnmarshaler, UnmarshalFunc<V> valueUnmarshaler) throws BencException {
        UnmarshalResult<Long> countResult = unmarshalUint(offset, buffer);
        int count = countResult.value().intValue();
        int currentOffset = countResult.newOffset();

        Map<K, V> map = new HashMap<>(count);
        for (int i = 0; i < count; i++) {
            UnmarshalResult<K> keyResult = keyUnmarshaler.unmarshal(currentOffset, buffer);
            currentOffset = keyResult.newOffset();
            
            UnmarshalResult<V> valueResult = valueUnmarshaler.unmarshal(currentOffset, buffer);
            currentOffset = valueResult.newOffset();
            
            map.put(keyResult.value(), valueResult.value());
        }
        
        if (buffer.length - currentOffset < TERMINATOR_SIZE) {
            throw new BencBufferTooSmallException();
        }
        return new UnmarshalResult<>(currentOffset + TERMINATOR_SIZE, map);
    }


    // =================================================================================
    // Byte and Byte Slice Functions
    // =================================================================================

    public static int skipByte(int offset, byte[] buffer) throws BencBufferTooSmallException {
        if (buffer.length - offset < 1) throw new BencBufferTooSmallException();
        return offset + 1;
    }

    public static int sizeByte() {
        return 1;
    }
    
    public static int marshalByte(int offset, byte[] buffer, byte val) {
        buffer[offset] = val;
        return offset + 1;
    }

    public static UnmarshalResult<Byte> unmarshalByte(int offset, byte[] buffer) throws BencBufferTooSmallException {
        if (buffer.length - offset < 1) throw new BencBufferTooSmallException();
        return new UnmarshalResult<>(offset + 1, buffer[offset]);
    }

    public static int skipBytes(int offset, byte[] buffer) throws BencException {
        return skipString(offset, buffer);
    }

    public static int sizeBytes(byte[] bytes) {
        return bytes.length + sizeUint(bytes.length);
    }
    
    public static int marshalBytes(int offset, byte[] buffer, byte[] bytes) {
        int newOffset = marshalUint(offset, buffer, bytes.length);
        System.arraycopy(bytes, 0, buffer, newOffset, bytes.length);
        return newOffset + bytes.length;
    }

    public static UnmarshalResult<byte[]> unmarshalBytesCopied(int offset, byte[] buffer) throws BencException {
        UnmarshalResult<Long> varintResult = unmarshalUint(offset, buffer);
        int len = varintResult.value().intValue();
        int currentOffset = varintResult.newOffset();

        if (buffer.length - currentOffset < len) throw new BencBufferTooSmallException();

        byte[] copied = Arrays.copyOfRange(buffer, currentOffset, currentOffset + len);
        return new UnmarshalResult<>(currentOffset + len, copied);
    }

    public static UnmarshalResult<byte[]> unmarshalBytesCropped(int offset, byte[] buffer) throws BencException {
        return unmarshalBytesCopied(offset, buffer);
    }

    // =================================================================================
    // Varint and ZigZag Functions
    // =================================================================================

    public static int skipVarint(int offset, byte[] buffer) throws BencException {
        for (int i = 0; i < MAX_VARINT_LEN_64; i++) {
            int currentPos = offset + i;
            if (currentPos >= buffer.length) {
                throw new BencBufferTooSmallException();
            }
            if ((buffer[currentPos] & 0x80) == 0) {
                 if (i == MAX_VARINT_LEN_64 - 1 && buffer[currentPos] > 1) {
                    throw new BencOverflowException();
                }
                return currentPos + 1;
            }
        }
        throw new BencOverflowException();
    }

    public static int sizeInt(long v) {
        return sizeUint(encodeZigZag(v));
    }

    public static int marshalInt(int offset, byte[] buffer, long v) {
        return marshalUint(offset, buffer, encodeZigZag(v));
    }
    
    public static UnmarshalResult<Long> unmarshalInt(int offset, byte[] buffer) throws BencException {
        UnmarshalResult<Long> result = unmarshalUint(offset, buffer);
        return new UnmarshalResult<>(result.newOffset(), decodeZigZag(result.value()));
    }

    public static int sizeUint(long v) {
        int i = 0;
        long value = v;
        while ((value & ~0x7FL) != 0) {
            i++;
            value >>>= 7;
        }
        return i + 1;
    }
    
    public static int marshalUint(int offset, byte[] buffer, long v) {
        int i = offset;
        long value = v;
        while ((value & ~0x7FL) != 0) {
            buffer[i++] = (byte) ((value & 0x7F) | 0x80);
            value >>>= 7;
        }
        buffer[i++] = (byte) value;
        return i;
    }
    
    public static UnmarshalResult<Long> unmarshalUint(int offset, byte[] buffer) throws BencException {
        long value = 0;
        int shift = 0;
        for (int i = 0; i < MAX_VARINT_LEN_64; i++) {
            int currentPos = offset + i;
            if (currentPos >= buffer.length) {
                throw new BencBufferTooSmallException();
            }
            byte b = buffer[currentPos];
            
            // If the most significant bit (MSB) is 0, this is the last byte of the varint.
            if ((b & 0x80) == 0) {
                if (i == MAX_VARINT_LEN_64 - 1 && b > 1) {
                    throw new BencOverflowException(); // Overflow check for the last possible byte
                }
                // Add the final 7 bits to the value and return.
                return new UnmarshalResult<>(currentPos + 1, value | (long) b << shift);
            }
            
            // If MSB is 1, it's not the last byte.
            // Add the lower 7 bits of this byte to our value.
            value |= (long) (b & 0x7f) << shift;
            // Prepare for the next 7 bits.
            shift += 7;
        }
        // If the loop completes, the varint is too long.
        throw new BencOverflowException();
    }

    private static long encodeZigZag(long n) {
        return (n << 1) ^ (n >> 63);
    }

    private static long decodeZigZag(long n) {
        return (n >>> 1) ^ -(n & 1);
    }
    
    // =================================================================================
    // Fixed-Size Integer/Float Functions
    // =================================================================================

    public static int skipUint64(int offset, byte[] b) throws BencBufferTooSmallException { return skipFixed(offset, b, 8); }
    public static int sizeUint64() { return 8; }
    public static int marshalUint64(int n, byte[] b, long v) { return marshalFixed64(n, b, v); }
    public static UnmarshalResult<Long> unmarshalUint64(int n, byte[] b) throws BencBufferTooSmallException { return unmarshalFixed64(n, b); }

    public static int skipUint32(int offset, byte[] b) throws BencBufferTooSmallException { return skipFixed(offset, b, 4); }
    public static int sizeUint32() { return 4; }
    public static int marshalUint32(int n, byte[] b, int v) { return marshalFixed32(n, b, v); }
    public static UnmarshalResult<Integer> unmarshalUint32(int n, byte[] b) throws BencBufferTooSmallException { return unmarshalFixed32(n, b); }

    public static int skipUint16(int offset, byte[] b) throws BencBufferTooSmallException { return skipFixed(offset, b, 2); }
    public static int sizeUint16() { return 2; }
    public static int marshalUint16(int n, byte[] b, short v) { return marshalFixed16(n, b, v); }
    public static UnmarshalResult<Short> unmarshalUint16(int n, byte[] b) throws BencBufferTooSmallException { return unmarshalFixed16(n, b); }
    
    public static int skipInt64(int offset, byte[] b) throws BencBufferTooSmallException { return skipFixed(offset, b, 8); }
    public static int sizeInt64() { return 8; }
    public static int marshalInt64(int n, byte[] b, long v) { return marshalFixed64(n, b, v); }
    public static UnmarshalResult<Long> unmarshalInt64(int n, byte[] b) throws BencBufferTooSmallException { return unmarshalFixed64(n, b); }

    public static int skipInt32(int offset, byte[] b) throws BencBufferTooSmallException { return skipFixed(offset, b, 4); }
    public static int sizeInt32() { return 4; }
    public static int marshalInt32(int n, byte[] b, int v) { return marshalFixed32(n, b, v); }
    public static UnmarshalResult<Integer> unmarshalInt32(int n, byte[] b) throws BencBufferTooSmallException { return unmarshalFixed32(n, b); }

    public static int skipInt16(int offset, byte[] b) throws BencBufferTooSmallException { return skipFixed(offset, b, 2); }
    public static int sizeInt16() { return 2; }
    public static int marshalInt16(int n, byte[] b, short v) { return marshalFixed16(n, b, v); }
    public static UnmarshalResult<Short> unmarshalInt16(int n, byte[] b) throws BencBufferTooSmallException { return unmarshalFixed16(n, b); }

    public static int skipInt8(int offset, byte[] b) throws BencBufferTooSmallException { return skipByte(offset, b); }
    public static int sizeInt8() { return 1; }
    public static int marshalInt8(int n, byte[] b, byte v) { return marshalByte(n, b, v); }
    public static UnmarshalResult<Byte> unmarshalInt8(int n, byte[] b) throws BencBufferTooSmallException { return unmarshalByte(n,b); }
    
    public static int skipFloat64(int offset, byte[] b) throws BencBufferTooSmallException { return skipFixed(offset, b, 8); }
    public static int sizeFloat64() { return 8; }
    public static int marshalFloat64(int n, byte[] b, double v) {
        if (b.length - n < 8) throw new IndexOutOfBoundsException("Buffer too small");
        ByteBuffer.wrap(b).order(ByteOrder.LITTLE_ENDIAN).putDouble(n, v);
        return n + 8;
    }
    public static UnmarshalResult<Double> unmarshalFloat64(int n, byte[] b) throws BencBufferTooSmallException {
        if (b.length - n < 8) throw new BencBufferTooSmallException();
        double val = ByteBuffer.wrap(b).order(ByteOrder.LITTLE_ENDIAN).getDouble(n);
        return new UnmarshalResult<>(n + 8, val);
    }
    
    public static int skipFloat32(int offset, byte[] b) throws BencBufferTooSmallException { return skipFixed(offset, b, 4); }
    public static int sizeFloat32() { return 4; }
    public static int marshalFloat32(int n, byte[] b, float v) {
        if (b.length - n < 4) throw new IndexOutOfBoundsException("Buffer too small");
        ByteBuffer.wrap(b).order(ByteOrder.LITTLE_ENDIAN).putFloat(n, v);
        return n + 4;
    }
    public static UnmarshalResult<Float> unmarshalFloat32(int n, byte[] b) throws BencBufferTooSmallException {
        if (b.length - n < 4) throw new BencBufferTooSmallException();
        float val = ByteBuffer.wrap(b).order(ByteOrder.LITTLE_ENDIAN).getFloat(n);
        return new UnmarshalResult<>(n + 4, val);
    }
    
    private static int skipFixed(int offset, byte[] b, int size) throws BencBufferTooSmallException {
        if (b.length - offset < size) throw new BencBufferTooSmallException();
        return offset + size;
    }
    private static int marshalFixed64(int n, byte[] b, long v) {
        if (b.length - n < 8) throw new IndexOutOfBoundsException("Buffer too small");
        ByteBuffer.wrap(b).order(ByteOrder.LITTLE_ENDIAN).putLong(n, v);
        return n + 8;
    }
    private static UnmarshalResult<Long> unmarshalFixed64(int n, byte[] b) throws BencBufferTooSmallException {
        if (b.length - n < 8) throw new BencBufferTooSmallException();
        long val = ByteBuffer.wrap(b).order(ByteOrder.LITTLE_ENDIAN).getLong(n);
        return new UnmarshalResult<>(n + 8, val);
    }
    private static int marshalFixed32(int n, byte[] b, int v) {
        if (b.length - n < 4) throw new IndexOutOfBoundsException("Buffer too small");
        ByteBuffer.wrap(b).order(ByteOrder.LITTLE_ENDIAN).putInt(n, v);
        return n + 4;
    }
    private static UnmarshalResult<Integer> unmarshalFixed32(int n, byte[] b) throws BencBufferTooSmallException {
        if (b.length - n < 4) throw new BencBufferTooSmallException();
        int val = ByteBuffer.wrap(b).order(ByteOrder.LITTLE_ENDIAN).getInt(n);
        return new UnmarshalResult<>(n + 4, val);
    }
    private static int marshalFixed16(int n, byte[] b, short v) {
        if (b.length - n < 2) throw new IndexOutOfBoundsException("Buffer too small");
        ByteBuffer.wrap(b).order(ByteOrder.LITTLE_ENDIAN).putShort(n, v);
        return n + 2;
    }
    private static UnmarshalResult<Short> unmarshalFixed16(int n, byte[] b) throws BencBufferTooSmallException {
        if (b.length - n < 2) throw new BencBufferTooSmallException();
        short val = ByteBuffer.wrap(b).order(ByteOrder.LITTLE_ENDIAN).getShort(n);
        return new UnmarshalResult<>(n + 2, val);
    }

    // =================================================================================
    // Bool Functions
    // =================================================================================
    
    public static int skipBool(int offset, byte[] b) throws BencBufferTooSmallException {
        if (b.length - offset < 1) throw new BencBufferTooSmallException();
        return offset + 1;
    }
    
    public static int sizeBool() {
        return 1;
    }
    
    public static int marshalBool(int offset, byte[] b, boolean v) {
        b[offset] = (byte) (v ? 1 : 0);
        return offset + 1;
    }
    
    public static UnmarshalResult<Boolean> unmarshalBool(int offset, byte[] b) throws BencBufferTooSmallException {
        if (b.length - offset < 1) throw new BencBufferTooSmallException();
        return new UnmarshalResult<>(offset + 1, b[offset] == 1);
    }
    
    // =================================================================================
    // Time Functions
    // =================================================================================
    
    public static int skipTime(int offset, byte[] b) throws BencBufferTooSmallException {
        return skipInt64(offset, b);
    }
    
    public static int sizeTime() {
        return 8;
    }
    
    public static int marshalTime(int offset, byte[] b, Instant t) {
        long nano = t.getEpochSecond() * 1_000_000_000L + t.getNano();
        return marshalInt64(offset, b, nano);
    }
    
    public static UnmarshalResult<Instant> unmarshalTime(int offset, byte[] b) throws BencBufferTooSmallException {
        UnmarshalResult<Long> nanoResult = unmarshalInt64(offset, b);
        long totalNanos = nanoResult.value();
        Instant time = Instant.ofEpochSecond(totalNanos / 1_000_000_000L, totalNanos % 1_000_000_000L);
        return new UnmarshalResult<>(nanoResult.newOffset(), time);
    }

    // =================================================================================
    // Pointer Functions
    // =================================================================================

    public static int skipPointer(int offset, byte[] buffer, SkipFunc skipElement) throws BencException {
        UnmarshalResult<Boolean> hasValueResult = unmarshalBool(offset, buffer);
        if (hasValueResult.value()) {
            return skipElement.skip(hasValueResult.newOffset(), buffer);
        }
        return hasValueResult.newOffset();
    }
    
    public static <T> int sizePointer(T value, Function<T, Integer> sizeFn) {
        if (value != null) {
            return sizeBool() + sizeFn.apply(value);
        }
        return sizeBool();
    }
    
    public static <T> int marshalPointer(int offset, byte[] buffer, T value, MarshalFunc<T> marshalFn) {
        int currentOffset = marshalBool(offset, buffer, value != null);
        if (value != null) {
            currentOffset = marshalFn.marshal(currentOffset, buffer, value);
        }
        return currentOffset;
    }
    
    public static <T> UnmarshalResult<T> unmarshalPointer(int offset, byte[] buffer, UnmarshalFunc<T> unmarshaler) throws BencException {
        UnmarshalResult<Boolean> hasValueResult = unmarshalBool(offset, buffer);
        if (!hasValueResult.value()) {
            return new UnmarshalResult<>(hasValueResult.newOffset(), null);
        }
        return unmarshaler.unmarshal(hasValueResult.newOffset(), buffer);
    }
}