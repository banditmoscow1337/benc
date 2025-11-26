package test.com.benc; // <-- CORRECT PACKAGE

// --- ADD ALL THESE IMPORTS ---
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import java.time.Instant;
import java.util.*;
import java.util.stream.Stream;

import static main.com.benc.Bstd.*;
// Static import for all JUnit assertions
import static org.junit.jupiter.api.Assertions.*;
// --- END IMPORTS ---

@DisplayName("Bstd Library Tests (Revised)")
class BstdTest {

    @Nested
    @DisplayName("Golden Path for All Data Types")
    class DataTypesTest {

        // Helper method to reduce boilerplate and improve readability in the main test
        private int assertUnmarshalAndAdvance(int offset, byte[] buffer, Object expected, UnmarshalFunc<?> unmarshaler) throws BencException {
            UnmarshalResult<?> result = unmarshaler.unmarshal(offset, buffer);
            if (expected instanceof byte[]) {
                assertArrayEquals((byte[]) expected, (byte[]) result.value());
            } else {
                assertEquals(expected, result.value());
            }
            return result.newOffset();
        }

        @Test
        @DisplayName("Should correctly marshal, skip, and unmarshal all supported data types in sequence")
        void testAllDataTypes() throws BencException {
            // 1. Setup test data
            Random rand = new Random();
            String testStr = "Hello World!";
            byte[] testBs = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10};

            List<Object> values = Arrays.asList(
                true,
                (byte) 128,
                rand.nextFloat(),
                rand.nextDouble(),
                (long) Integer.MAX_VALUE,
                -12345L,
                (byte) -1,
                (short) -1,
                rand.nextInt(),
                rand.nextLong(),
                (long) Integer.MAX_VALUE * 2L + 1L,
                (short) 160,
                rand.nextInt() & 0xFFFFFFFFL,
                rand.nextLong(),
                testStr,
                testStr,
                testBs,
                testBs,
                Instant.ofEpochSecond(1663362895, 123456789)
            );

            // 2. Calculate total size
            int totalSize = sizeBool() + sizeByte() + sizeFloat32() + sizeFloat64() +
                sizeInt((Long) values.get(4)) + sizeInt((Long) values.get(5)) +
                sizeInt8() + sizeInt16() + sizeInt32() + sizeInt64() +
                sizeUint((Long) values.get(10)) + sizeUint16() + sizeUint32() + sizeUint64() +
                sizeString(testStr) + sizeString(testStr) +
                sizeBytes(testBs) + sizeBytes(testBs) +
                sizeTime();

            // 3. Marshal all values
            byte[] buffer = new byte[totalSize];
            int offset = 0;
            offset = marshalBool(offset, buffer, (Boolean) values.get(0));
            offset = marshalByte(offset, buffer, (Byte) values.get(1));
            offset = marshalFloat32(offset, buffer, (Float) values.get(2));
            offset = marshalFloat64(offset, buffer, (Double) values.get(3));
            offset = marshalInt(offset, buffer, (Long) values.get(4));
            offset = marshalInt(offset, buffer, (Long) values.get(5));
            offset = marshalInt8(offset, buffer, (Byte) values.get(6));
            offset = marshalInt16(offset, buffer, (Short) values.get(7));
            offset = marshalInt32(offset, buffer, (Integer) values.get(8));
            offset = marshalInt64(offset, buffer, (Long) values.get(9));
            offset = marshalUint(offset, buffer, (Long) values.get(10));
            offset = marshalUint16(offset, buffer, (Short) values.get(11));
            offset = marshalUint32(offset, buffer, ((Number) values.get(12)).intValue());
            offset = marshalUint64(offset, buffer, (Long) values.get(13));
            offset = marshalString(offset, buffer, (String) values.get(14));
            offset = marshalUnsafeString(offset, buffer, (String) values.get(15));
            offset = marshalBytes(offset, buffer, (byte[]) values.get(16));
            offset = marshalBytes(offset, buffer, (byte[]) values.get(17));
            offset = marshalTime(offset, buffer, (Instant) values.get(18));
            assertEquals(totalSize, offset, "Marshal offset should match total calculated size");

            // 4. Skip all values
            int skipOffset = 0;
            skipOffset = skipBool(skipOffset, buffer);
            skipOffset = skipByte(skipOffset, buffer);
            skipOffset = skipFloat32(skipOffset, buffer);
            skipOffset = skipFloat64(skipOffset, buffer);
            skipOffset = skipVarint(skipOffset, buffer);
            skipOffset = skipVarint(skipOffset, buffer);
            skipOffset = skipInt8(skipOffset, buffer);
            skipOffset = skipInt16(skipOffset, buffer);
            skipOffset = skipInt32(skipOffset, buffer);
            skipOffset = skipInt64(skipOffset, buffer);
            skipOffset = skipVarint(skipOffset, buffer);
            skipOffset = skipUint16(skipOffset, buffer);
            skipOffset = skipUint32(skipOffset, buffer);
            skipOffset = skipUint64(skipOffset, buffer);
            skipOffset = skipString(skipOffset, buffer);
            skipOffset = skipString(skipOffset, buffer);
            skipOffset = skipBytes(skipOffset, buffer);
            skipOffset = skipBytes(skipOffset, buffer);
            skipOffset = skipTime(skipOffset, buffer);
            assertEquals(totalSize, skipOffset, "Skip offset should match total calculated size");

            // 5. Unmarshal and verify all values
            int unmarshalOffset = 0;
            unmarshalOffset = assertUnmarshalAndAdvance(unmarshalOffset, buffer, values.get(0), Bstd::unmarshalBool);
            unmarshalOffset = assertUnmarshalAndAdvance(unmarshalOffset, buffer, values.get(1), Bstd::unmarshalByte);
            unmarshalOffset = assertUnmarshalAndAdvance(unmarshalOffset, buffer, values.get(2), Bstd::unmarshalFloat32);
            unmarshalOffset = assertUnmarshalAndAdvance(unmarshalOffset, buffer, values.get(3), Bstd::unmarshalFloat64);
            unmarshalOffset = assertUnmarshalAndAdvance(unmarshalOffset, buffer, values.get(4), Bstd::unmarshalInt);
            unmarshalOffset = assertUnmarshalAndAdvance(unmarshalOffset, buffer, values.get(5), Bstd::unmarshalInt);
            unmarshalOffset = assertUnmarshalAndAdvance(unmarshalOffset, buffer, values.get(6), Bstd::unmarshalInt8);
            unmarshalOffset = assertUnmarshalAndAdvance(unmarshalOffset, buffer, values.get(7), Bstd::unmarshalInt16);
            unmarshalOffset = assertUnmarshalAndAdvance(unmarshalOffset, buffer, values.get(8), Bstd::unmarshalInt32);
            unmarshalOffset = assertUnmarshalAndAdvance(unmarshalOffset, buffer, values.get(9), Bstd::unmarshalInt64);
            unmarshalOffset = assertUnmarshalAndAdvance(unmarshalOffset, buffer, values.get(10), Bstd::unmarshalUint);
            unmarshalOffset = assertUnmarshalAndAdvance(unmarshalOffset, buffer, values.get(11), Bstd::unmarshalUint16);
            unmarshalOffset = assertUnmarshalAndAdvance(unmarshalOffset, buffer, ((Number)values.get(12)).intValue(), Bstd::unmarshalUint32);
            unmarshalOffset = assertUnmarshalAndAdvance(unmarshalOffset, buffer, values.get(13), Bstd::unmarshalUint64);
            unmarshalOffset = assertUnmarshalAndAdvance(unmarshalOffset, buffer, values.get(14), Bstd::unmarshalString);
            unmarshalOffset = assertUnmarshalAndAdvance(unmarshalOffset, buffer, values.get(15), Bstd::unmarshalUnsafeString);
            unmarshalOffset = assertUnmarshalAndAdvance(unmarshalOffset, buffer, values.get(16), Bstd::unmarshalBytesCropped);
            unmarshalOffset = assertUnmarshalAndAdvance(unmarshalOffset, buffer, values.get(17), Bstd::unmarshalBytesCopied);
            unmarshalOffset = assertUnmarshalAndAdvance(unmarshalOffset, buffer, values.get(18), Bstd::unmarshalTime);
            assertEquals(totalSize, unmarshalOffset, "Unmarshal offset should match total buffer size");
        }
    }

    @Nested
    @DisplayName("Complex Type Tests")
    class ComplexTypesTest {

        @Test
        @DisplayName("Should correctly handle slices (Lists)")
        void testSlices() throws BencException {
            List<String> slice = Arrays.asList("slice-element-1", "slice-element-2", "slice-element-3");
            int size = sizeSlice(slice, Bstd::sizeString);
            byte[] buffer = new byte[size];

            marshalSlice(0, buffer, slice, Bstd::marshalString);

            assertEquals(size, skipSlice(0, buffer, Bstd::skipString));

            UnmarshalResult<List<String>> result = unmarshalSlice(0, buffer, Bstd::unmarshalString);
            assertEquals(size, result.newOffset());
            assertEquals(slice, result.value());
        }

        @Test
        @DisplayName("Should correctly handle maps (String keys)")
        void testMaps() throws BencException {
            Map<String, String> map = new HashMap<>();
            map.put("map-key-1", "map-value-1");
            map.put("map-key-2", "map-value-2");

            int size = sizeMap(map, Bstd::sizeString, Bstd::sizeString);
            byte[] buffer = new byte[size];

            marshalMap(0, buffer, map, Bstd::marshalString, Bstd::marshalString);

            assertEquals(size, skipMap(0, buffer, Bstd::skipString, Bstd::skipString));

            UnmarshalResult<Map<String, String>> result = unmarshalMap(0, buffer, Bstd::unmarshalString, Bstd::unmarshalString);
            assertEquals(size, result.newOffset());
            assertEquals(map, result.value());
        }
    }

    @Nested
    @DisplayName("Pointer (Nullable) Tests")
    class PointerTest {
        @Test
        @DisplayName("Should handle non-null pointers correctly")
        void testNonNilPointer() throws BencException {
            String value = "hello nullable world";
            int size = sizePointer(value, Bstd::sizeString);
            byte[] buffer = new byte[size];

            marshalPointer(0, buffer, value, Bstd::marshalString);

            assertEquals(size, skipPointer(0, buffer, Bstd::skipString));

            UnmarshalResult<String> result = unmarshalPointer(0, buffer, Bstd::unmarshalString);
            assertEquals(size, result.newOffset());
            assertEquals(value, result.value());
        }

        @Test
        @DisplayName("Should handle null pointers correctly")
        void testNilPointer() throws BencException {
            String value = null;
            int size = sizePointer(value, Bstd::sizeString);
            byte[] buffer = new byte[size];

            marshalPointer(0, buffer, value, Bstd::marshalString);

            assertEquals(size, skipPointer(0, buffer, Bstd::skipString));

            UnmarshalResult<String> result = unmarshalPointer(0, buffer, Bstd::unmarshalString);
            assertEquals(size, result.newOffset());
            assertNull(result.value());
        }
    }

    @Nested
    @DisplayName("Error Handling Tests")
    class ErrorHandlingTest {

        @FunctionalInterface
        interface UnmarshalAction { void execute(byte[] buffer) throws BencException; }

        @FunctionalInterface
        interface SkipAction { void execute(byte[] buffer) throws BencException; }

        static Stream<Arguments> bufferTooSmallProvider() {
            return Stream.of(
                Arguments.of("UnmarshalBool", (UnmarshalAction) (b) -> unmarshalBool(0, b), new byte[0]),
                Arguments.of("SkipBool", (SkipAction) (b) -> skipBool(0, b), new byte[0]),
                Arguments.of("UnmarshalFloat32", (UnmarshalAction) (b) -> unmarshalFloat32(0, b), new byte[3]),
                Arguments.of("SkipFloat32", (SkipAction) (b) -> skipFloat32(0, b), new byte[3]),
                Arguments.of("UnmarshalString", (UnmarshalAction) (b) -> unmarshalString(0, b), new byte[]{4, 'a', 'b'}),
                Arguments.of("SkipString", (SkipAction) (b) -> skipString(0, b), new byte[]{4, 'a', 'b'}),
                Arguments.of("UnmarshalSlice w/o Terminator", (UnmarshalAction) (b) -> unmarshalSlice(0, b, Bstd::unmarshalByte), new byte[]{1, 1, 1, 1}),
                Arguments.of("SkipSlice w/o Terminator", (SkipAction) (b) -> skipSlice(0, b, Bstd::skipByte), new byte[]{1, 1, 1, 1})
            );
        }

        @ParameterizedTest(name = "{0}")
        @MethodSource("bufferTooSmallProvider")
        @DisplayName("Should throw BencBufferTooSmallException")
        void testBufferTooSmall(String name, Object action, byte[] buffer) {
            if (action instanceof UnmarshalAction) {
                assertThrows(BencBufferTooSmallException.class, () -> ((UnmarshalAction) action).execute(buffer));
            } else {
                assertThrows(BencBufferTooSmallException.class, () -> ((SkipAction) action).execute(buffer));
            }
        }

        static Stream<Arguments> overflowProvider() {
            byte[] overflowBytes = new byte[10];
            Arrays.fill(overflowBytes, (byte) 0x80);
            overflowBytes[9] = 0x02;

            return Stream.of(
                Arguments.of("UnmarshalInt", (UnmarshalAction) (b) -> unmarshalInt(0, b), overflowBytes),
                Arguments.of("UnmarshalUint", (UnmarshalAction) (b) -> unmarshalUint(0, b), overflowBytes),
                Arguments.of("SkipVarint", (SkipAction) (b) -> skipVarint(0, b), overflowBytes)
            );
        }

        @ParameterizedTest(name = "{0}")
        @MethodSource("overflowProvider")
        @DisplayName("Should throw BencOverflowException for varints")
        void testVarintOverflow(String name, Object action, byte[] buffer) {
            if (action instanceof UnmarshalAction) {
                assertThrows(BencOverflowException.class, () -> ((UnmarshalAction) action).execute(buffer));
            } else {
                assertThrows(BencOverflowException.class, () -> ((SkipAction) action).execute(buffer));
            }
        }
    }
}