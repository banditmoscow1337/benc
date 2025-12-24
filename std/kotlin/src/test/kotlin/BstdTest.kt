package com.banditmoscow1337.bstd

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.time.Instant
import kotlin.random.Random
import kotlin.test.assertContentEquals

@DisplayName("Bstd Library Tests")
class BstdTest {

    // --- Test: Main Data Types Roundtrip ---
    @Test
    @DisplayName("should correctly marshal, skip, and unmarshal all primary data types")
    fun testDataTypes() {
        val testStr = "Hello World!"
        val testBs = byteArrayOf(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10)
        val negLongVal = -12345L
        val posLongVal = Long.MAX_VALUE
        // FIX: In Go, `uint` is platform-dependent but typically 64-bit on servers.
        // The correct Kotlin equivalent for testing against Go's varint encoding is ULong.
        val maxULong = ULong.MAX_VALUE

        val values = listOf(
            true,
            128.toByte(),
            Random.nextFloat(),
            Random.nextDouble(),
            posLongVal,
            negLongVal,
            (-1).toByte(),
            (-1).toShort(),
            Random.nextInt(),
            Random.nextLong(),
            maxULong,
            160.toUShort(),
            // FIX: Random.nextUInt() and nextULong() can be experimental. Use stable alternatives.
            Random.nextInt().toUInt(),
            Random.nextLong().toULong(),
            testStr,
            testBs,
        )
        
        // 1. Calculate total size
        var totalSize = 0
        for (v in values) {
            totalSize += when (v) {
                is Boolean -> Bstd.sizeBoolean()
                is Byte -> Bstd.sizeByte()
                is Float -> Bstd.sizeFloat32()
                is Double -> Bstd.sizeFloat64()
                is Long -> Bstd.sizeLongAsVarint(v) // Covers both posLongVal and negLongVal
                is Short -> Bstd.sizeInt16()
                is Int -> Bstd.sizeInt32()
                is ULong -> Bstd.sizeULongAsVarint(v) // Correctly size the ULong for varint
                is UShort -> Bstd.sizeUInt16()
                is UInt -> Bstd.sizeUInt32()
                is String -> Bstd.sizeString(v)
                is ByteArray -> Bstd.sizeBytes(v)
                else -> fail("Unhandled type in size calculation: ${v::class.simpleName}")
            }
        }

        // 2. Marshal all values into a single buffer
        val b = ByteArray(totalSize)
        var n = 0
        for (v in values) {
            n = when (v) {
                is Boolean -> Bstd.marshalBoolean(b, n, v)
                is Byte -> Bstd.marshalByte(b, n, v)
                is Float -> Bstd.marshalFloat32(b, n, v)
                is Double -> Bstd.marshalFloat64(b, n, v)
                is Long -> Bstd.marshalLongAsVarint(b, n, v)
                is Short -> Bstd.marshalInt16(b, n, v)
                is Int -> Bstd.marshalInt32(b, n, v)
                is ULong -> Bstd.marshalULongAsVarint(b, n, v)
                is UShort -> Bstd.marshalUInt16(b, n, v)
                is UInt -> Bstd.marshalUInt32(b, n, v)
                is String -> Bstd.marshalString(b, n, v)
                is ByteArray -> Bstd.marshalBytes(b, n, v)
                else -> fail("Unhandled type in marshalling: ${v::class.simpleName}")
            }
        }
        assertEquals(totalSize, n, "Marshal failed: final offset doesn't match calculated size")

        // 3. Skip all values
        var skipN = 0
        for (v in values) {
            skipN = when (v) {
                is Boolean -> Bstd.skipBoolean(b, skipN)
                is Byte -> Bstd.skipByte(b, skipN)
                is Float -> Bstd.skipFloat32(b, skipN)
                is Double -> Bstd.skipFloat64(b, skipN)
                is Long -> Bstd.skipVarint(b, skipN)
                is Short -> Bstd.skipInt16(b, skipN)
                is Int -> Bstd.skipInt32(b, skipN)
                is ULong -> Bstd.skipVarint(b, skipN)
                is UShort -> Bstd.skipUInt16(b, skipN)
                is UInt -> Bstd.skipUInt32(b, skipN)
                is String -> Bstd.skipString(b, skipN)
                is ByteArray -> Bstd.skipBytes(b, skipN)
                else -> fail("Unhandled type in skipping: ${v::class.simpleName}")
            }
        }
        assertEquals(b.size, skipN, "Skip failed: final offset doesn't match buffer length")


        // 4. Unmarshal and verify
        var unmarshalN = 0
        for (expected in values) {
            val (newN, actual) = when (expected) {
                is Boolean -> Bstd.unmarshalBoolean(b, unmarshalN)
                is Byte -> Bstd.unmarshalByte(b, unmarshalN)
                is Float -> Bstd.unmarshalFloat32(b, unmarshalN)
                is Double -> Bstd.unmarshalFloat64(b, unmarshalN)
                is Long -> Bstd.unmarshalLongAsVarint(b, unmarshalN)
                is Short -> Bstd.unmarshalInt16(b, unmarshalN)
                is Int -> Bstd.unmarshalInt32(b, unmarshalN)
                is ULong -> Bstd.unmarshalULongAsVarint(b, unmarshalN)
                is UShort -> Bstd.unmarshalUInt16(b, unmarshalN)
                is UInt -> Bstd.unmarshalUInt32(b, unmarshalN)
                is String -> Bstd.unmarshalString(b, unmarshalN)
                is ByteArray -> Bstd.unmarshalBytes(b, unmarshalN)
                else -> fail("Unhandled type in unmarshalling: ${expected::class.simpleName}")
            }

            if (expected is ByteArray) {
                assertContentEquals(expected, actual as ByteArray, "Unmarshal failed for ByteArray")
            } else {
                assertEquals(expected, actual, "Unmarshal failed for ${expected::class.simpleName}")
            }
            unmarshalN = newN
        }
        assertEquals(b.size, unmarshalN, "Unmarshal failed: final offset doesn't match buffer length")
    }

    // --- Test: Error on Buffer Too Small ---
    @Test
    @DisplayName("should throw BstdBufferTooSmallException on insufficient buffer size")
    fun testErrBufTooSmall() {
        assertThrows<BstdBufferTooSmallException> { Bstd.unmarshalBoolean(byteArrayOf(), 0) }
        assertThrows<BstdBufferTooSmallException> { Bstd.unmarshalFloat32(byteArrayOf(1,2,3), 0) }
        assertThrows<BstdBufferTooSmallException> { Bstd.unmarshalLongAsVarint(byteArrayOf(0x80.toByte()), 0) }
        assertThrows<BstdBufferTooSmallException> { Bstd.unmarshalString(byteArrayOf(2, 0), 0) }
        // FIX: The function reference must be wrapped in a lambda to match the expected signature.
        assertThrows<BstdBufferTooSmallException> { Bstd.unmarshalSlice(byteArrayOf(2,0,0,0,0), 0) { b,n -> Bstd.unmarshalByte(b,n)} }
        assertThrows<BstdBufferTooSmallException> { Bstd.skipString(byteArrayOf(2,0),0) }
    }


    // --- Test: Collections ---
    @Test
    @DisplayName("should handle slices (lists) correctly")
    fun testSlices() {
        val slice = listOf("slice-element-1", "slice-element-2", "slice-element-3")
        // FIX: Pass a lambda that matches the expected signature `(T) -> Int`
        val s = Bstd.sizeSlice(slice) { Bstd.sizeString(it) }
        val buf = ByteArray(s)
        Bstd.marshalSlice(buf, 0, slice) { b, n, t -> Bstd.marshalString(b, n, t) }

        val skippedN = Bstd.skipSlice(buf, 0) { b, n -> Bstd.skipString(b, n) }
        assertEquals(buf.size, skippedN)

        val (finalN, retSlice) = Bstd.unmarshalSlice(buf, 0) { b, n -> Bstd.unmarshalString(b, n) }
        assertEquals(buf.size, finalN)
        assertEquals(slice, retSlice)
    }

    @Test
    @DisplayName("should handle maps correctly")
    fun testMaps() {
        val m = mapOf(
            "map-key-1" to "map-value-1",
            "map-key-2" to "map-value-2"
        )
        val s = Bstd.sizeMap(m, { Bstd.sizeString(it) }, { Bstd.sizeString(it) })
        val buf = ByteArray(s)
        Bstd.marshalMap(buf, 0, m, { b, n, t -> Bstd.marshalString(b, n, t) }, { b, n, t -> Bstd.marshalString(b, n, t) })

        val skippedN = Bstd.skipMap(buf, 0, Bstd::skipString, Bstd::skipString)
        assertEquals(buf.size, skippedN)

        val (finalN, retMap) = Bstd.unmarshalMap(buf, 0, Bstd::unmarshalString, Bstd::unmarshalString)
        assertEquals(buf.size, finalN)
        assertEquals(m, retMap)
    }

    // --- Test: String Edge Cases ---
    @Test
    @DisplayName("should handle empty strings")
    fun testEmptyString() {
        val str = ""
        val s = Bstd.sizeString(str)
        val buf = ByteArray(s)
        Bstd.marshalString(buf, 0, str)

        assertEquals(1, buf.size) // Only varint '0'
        assertEquals(0.toByte(), buf[0])

        val (finalN, retStr) = Bstd.unmarshalString(buf, 0)
        assertEquals(buf.size, finalN)
        assertEquals(str, retStr)
    }

    @Test
    @DisplayName("should handle long strings")
    fun testLongString() {
        val str = "H".repeat(UShort.MAX_VALUE.toInt() + 1)
        val s = Bstd.sizeString(str)
        val buf = ByteArray(s)
        Bstd.marshalString(buf, 0, str)

        val (finalN, retStr) = Bstd.unmarshalString(buf, 0)
        assertEquals(buf.size, finalN)
        assertEquals(str, retStr)
    }

    // --- Test: Varint Edge Cases ---
    @Test
    @DisplayName("should handle varint edge cases for skipping and unmarshalling")
    fun testVarintEdgeCases() {
        val overflowBytes = ByteArray(11) { 0x80.toByte() }
        val overflowEdgeCaseBytes = ByteArray(10) { 0x80.toByte() }.apply { this[9] = 0x02 }

        // Test SkipVarint
        assertThrows<BstdOverflowException> { Bstd.skipVarint(overflowBytes, 0) }
        assertThrows<BstdOverflowException> { Bstd.skipVarint(overflowEdgeCaseBytes, 0) }
        assertThrows<BstdBufferTooSmallException> { Bstd.skipVarint(byteArrayOf(0x80.toByte()), 0) }

        // Test UnmarshalLongAsVarint and UnmarshalULongAsVarint
        assertThrows<BstdOverflowException> { Bstd.unmarshalLongAsVarint(overflowBytes, 0) }
        assertThrows<BstdOverflowException> { Bstd.unmarshalLongAsVarint(overflowEdgeCaseBytes, 0) }
        assertThrows<BstdBufferTooSmallException> { Bstd.unmarshalULongAsVarint(byteArrayOf(0x80.toByte()), 0) }
    }

    // --- Test: Time ---
    @Test
    @DisplayName("should handle Time (Instant) correctly")
    fun testTime() {
        val now = Instant.ofEpochSecond(1663362895, 123456789)
        val s = Bstd.sizeTime()
        val buf = ByteArray(s)
        Bstd.marshalTime(buf, 0, now)

        val (finalN, retTime) = Bstd.unmarshalTime(buf, 0)
        assertEquals(buf.size, finalN)
        assertEquals(now, retTime)

        // Error path
        assertThrows<BstdBufferTooSmallException> { Bstd.unmarshalTime(byteArrayOf(1, 2, 3), 0) }
    }

    // --- Test: Pointer (Nullable) ---
    @Test
    @DisplayName("should handle non-null pointer (nullable type)")
    fun testNonNilPointer() {
        val value = "hello nullable world"
        val ptr: String? = value

        val s = Bstd.sizePointer(ptr) { Bstd.sizeString(it) }
        val buf = ByteArray(s)
        Bstd.marshalPointer(buf, 0, ptr) { b, n, t -> Bstd.marshalString(b, n, t) }

        val skippedN = Bstd.skipPointer(buf, 0, Bstd::skipString)
        assertEquals(buf.size, skippedN)

        val (finalN, retPtr) = Bstd.unmarshalPointer(buf, 0, Bstd::unmarshalString)
        assertEquals(buf.size, finalN)
        assertNotNull(retPtr)
        assertEquals(value, retPtr)
    }

    @Test
    @DisplayName("should handle null pointer (nullable type)")
    fun testNilPointer() {
        val ptr: String? = null

        val s = Bstd.sizePointer(ptr) { Bstd.sizeString(it) }
        val buf = ByteArray(s)
        Bstd.marshalPointer(buf, 0, ptr) { b, n, t -> Bstd.marshalString(b, n, t) }

        assertEquals(1, buf.size)
        assertEquals(0.toByte(), buf[0])

        val (finalN, retPtr) = Bstd.unmarshalPointer(buf, 0, Bstd::unmarshalString)
        assertEquals(buf.size, finalN)
        assertNull(retPtr)
    }

    @Test
    @DisplayName("should handle errors in pointer functions")
    fun testPointerErrors() {
        // Error during bool read in skip
        assertThrows<BstdBufferTooSmallException> { Bstd.skipPointer(byteArrayOf(), 0, Bstd::skipByte) }
        // Error during bool read in unmarshal
        assertThrows<BstdBufferTooSmallException> { Bstd.unmarshalPointer(byteArrayOf(), 0, Bstd::unmarshalByte) }
        // Error during element unmarshal
        assertThrows<BstdBufferTooSmallException> { Bstd.unmarshalPointer(byteArrayOf(1), 0, Bstd::unmarshalByte) }
    }

    /**
     * **NEW TEST**
     * Verifies that the library rejects streams with incorrect terminator sequences.
     * This is a robustness improvement over the original Go library.
     */
    @Test
    @DisplayName("should throw exception for invalid terminators")
    fun testInvalidTerminator() {
        // 1. Create a valid marshalled slice
        val slice = listOf<Byte>(10, 20)
        val s = Bstd.sizeSlice(slice) { Bstd.sizeByte() }
        val buf = ByteArray(s)
        Bstd.marshalSlice(buf, 0, slice) { b, n, t -> Bstd.marshalByte(b, n, t) }

        // 2. Corrupt the terminator (e.g., change it from [1,1,1,1] to [0,0,0,0])
        buf[s - 1] = 0
        buf[s - 2] = 0

        // 3. Assert that unmarshalling now fails with the correct exception
        assertThrows<BstdInvalidTerminatorException> {
            Bstd.unmarshalSlice(buf, 0, Bstd::unmarshalByte)
        }

        // 4. Do the same for a map
        // FIX: Integer literals must be explicitly cast to Byte
        val m = mapOf<Byte, Byte>(1.toByte() to 2.toByte())
        // FIX: Pass lambdas instead of function references
        val mapSize = Bstd.sizeMap(m, { Bstd.sizeByte() }, { Bstd.sizeByte() })
        val mapBuf = ByteArray(mapSize)
        Bstd.marshalMap(mapBuf, 0, m, { b, n, t -> Bstd.marshalByte(b, n, t) }, { b, n, t -> Bstd.marshalByte(b, n, t) })
        mapBuf[mapSize - 1] = 9 // Corrupt the map terminator

        assertThrows<BstdInvalidTerminatorException> {
            Bstd.unmarshalMap(mapBuf, 0, Bstd::unmarshalByte, Bstd::unmarshalByte)
        }
    }

    // --- Test: Final Coverage items from Go test ---
    @Test
    @DisplayName("should correctly calculate size for fixed-size slices")
    fun testSizeFixedSlice() {
        val slice = listOf(10, 20, 30) // List<Int>
        val elementSize = Bstd.sizeInt32()
        val expectedSize = Bstd.sizeULongAsVarint(slice.size.toULong()) + slice.size * elementSize + 4 // 4 for terminator
        val actualSize = Bstd.sizeFixedSlice(slice, elementSize)
        assertEquals(expectedSize, actualSize)
    }
}
