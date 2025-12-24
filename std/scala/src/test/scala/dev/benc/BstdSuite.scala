package dev.benc

import munit.FunSuite
import java.time.Instant
import scala.util.Random

/**
 * A comprehensive test suite for the Bstd library, ported from the original Go tests.
 * This suite verifies correctness for:
 * - Round-trip encoding and decoding for all data types.
 * - Accurate `size` and `skip` functionality.
 * - Correct error handling for malformed or truncated buffers.
 * - Edge cases like empty collections, long strings, and VarInt overflows.
 */
class BstdSuite extends FunSuite {
  // Import all the given Benc instances for standard types.
  import dev.benc.Bstd.instances.given

  // A helper to simplify round-trip testing for any given type with standard equality.
  def testRoundTrip[A](name: String, value: A)(using benc: Benc[A])(implicit loc: munit.Location): Unit = {
    test(s"Round-trip: $name") {
      val encoded = Bstd.encode(value)
      assertEquals(encoded.length, benc.size(value), s"Size calculation for $name failed")
      val decoded = Bstd.decode[A](encoded)
      assertEquals(decoded, Right(value), s"Decode for $name did not match original")
      val skipped = benc.skip(0, encoded)
      assertEquals(skipped, Right(encoded.length), s"Skip for $name failed")
    }
  }

  // --- Main Data Type Tests (Port of `TestDataTypes`) ---
  val testString = "Hello World!"
  val testBytes = Array[Byte](0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10)
  
  testRoundTrip("Boolean", true)
  testRoundTrip("Byte", 128.toByte)
  testRoundTrip("Float", Random.nextFloat())
  testRoundTrip("Double", Random.nextDouble())
  testRoundTrip("Short", -12345.toShort)
  testRoundTrip("Fixed Int", Int.MaxValue)
  testRoundTrip("Fixed Long", Long.MinValue)
  testRoundTrip("String", testString)
  // testRoundTrip("Array[Byte]", testBytes) // <- REMOVED from generic helper

  testRoundTrip("Time", Instant.ofEpochSecond(1663362895, 123456789))

  // FIX: Dedicated test for Array[Byte] to handle content equality.
  test("Round-trip: Array[Byte]") {
    val benc = Benc[Array[Byte]]
    val value = testBytes

    // 1. Encode the value
    val encoded = Bstd.encode(value)

    // 2. Verify that the pre-calculated size matches the encoded length
    assertEquals(encoded.length, benc.size(value), s"Size calculation for Array[Byte] failed")

    // 3. Decode the value
    val decoded = Bstd.decode[Array[Byte]](encoded)

    // 4. Assert using content equality (by converting to Seq)
    assertEquals(decoded.map(_.toSeq), Right(value.toSeq), s"Decode for Array[Byte] did not match original")

    // 5. Verify that skipping the encoded value works
    val skipped = benc.skip(0, encoded)
    assertEquals(skipped, Right(encoded.length), s"Skip for Array[Byte] failed")
  }


  // --- Pointer/Option Tests (Port of `TestPointer`) ---
  testRoundTrip[Option[String]]("Some[String] (non-nil pointer)", Some("hello world"))
  testRoundTrip[Option[String]]("None (nil pointer)", None)

  // --- String Edge Cases (Ports of `TestEmptyString` and `TestLongString`) ---
  testRoundTrip("Empty String", "")
  testRoundTrip("Long String", "H" * (Short.MaxValue + 1))

  // --- Collection Tests (Ports of `TestSlices` and `TestMaps`) ---
  testRoundTrip("Seq[String]", Seq("elem1", "elem2", "elem3"))
  testRoundTrip("Empty Seq", Seq.empty[Int])
  testRoundTrip(
    "Map[String, String]",
    Map("key1" -> "val1", "key2" -> "val2", "key3" -> "val3")
  )
  testRoundTrip(
    "Map[Int, String] (mixed fixed and dynamic types)",
    Map(1 -> "val1", 2 -> "val2", 3 -> "val3")
  )
  testRoundTrip("Empty Map", Map.empty[String, Int])

  // --- VarInt Specific Tests (Ports of `TestUnmarshalInt`, `TestUnmarshalUint`) ---
  test("VarInt encoding and decoding") {
    import dev.benc.Bstd.instances.VarInt.given
    
    testRoundTrip("VarInt Positive", 150)
    testRoundTrip("VarInt Negative", -75)
    testRoundTrip("VarInt Zero", 0)
    
    val encoded = Bstd.encode[Int](150)
    assertEquals(encoded.toSeq, Seq(0xac.toByte, 0x02.toByte))
  }

  test("VarUInt encoding and decoding") {
    import dev.benc.Bstd.instances.VarUInt.given
    
    testRoundTrip("VarUInt Positive", 300)
    testRoundTrip("VarUInt Zero", 0)

    val encoded = Bstd.encode[Int](300)
    assertEquals(encoded.toSeq, Seq(0xac.toByte, 0x02.toByte))
  }
  
  // --- Comprehensive Error Handling Tests (Port of `TestErrBufTooSmall`) ---
  def testErrors[A](name: String, invalidBuffers: Seq[Array[Byte]])(using benc: Benc[A])(implicit loc: munit.Location): Unit = {
    test(s"Error handling for $name") {
      invalidBuffers.foreach { buf =>
        intercept[BstdError.BufferTooSmall] {
          benc.read(0, buf).toTry.get
        }
        intercept[BstdError.BufferTooSmall] {
          benc.skip(0, buf).toTry.get
        }
      }
    }
  }

  testErrors[Boolean]("Boolean", Seq(Array[Byte]()))
  testErrors[Int]("Fixed Int", Seq(Array[Byte](), Array[Byte](1, 2, 3)))
  testErrors[Long]("Fixed Long", Seq(Array[Byte](), Array[Byte](1, 2, 3, 4, 5, 6, 7)))
  testErrors[String]("String", Seq(
    Array[Byte](),
    Array[Byte](2),
    Array[Byte](10, 0, 1)
  ))
  testErrors[Seq[Int]]("Seq[Int]", Seq(
    Array[Byte](),
    Array[Byte](1),
    Array[Byte](1, 0, 0, 0)
  ))
  testErrors[Map[Int, Int]]("Map[Int, Int]", Seq(
    Array[Byte](),
    Array[Byte](1),
    Array[Byte](1, 0, 0, 0, 0),
    Array[Byte](1, 0, 0, 0, 0, 0, 0, 0)
  ))
  testErrors[Option[String]]("Option[String]", Seq(
    Array[Byte](),
    Array[Byte](1)
  ))

  // --- VarInt Overflow Tests (Port of `TestSkipVarint`, etc.) ---
  test("VarInt overflow errors") {
    import dev.benc.Bstd.instances.VarInt.given
    val overflowBytes = Array.fill[Byte](10)(0x80.toByte) :+ 0x01.toByte
    
    intercept[BstdError.VarIntOverflow.type] {
      Bstd.decode[Long](overflowBytes).toTry.get
    }
    intercept[BstdError.VarIntOverflow.type] {
      Benc[Long].skip(0, overflowBytes).toTry.get
    }
  }

  // --- Collection Terminator Tests (Port of `TestTerminatorErrors`) ---
  test("Collection terminator errors") {
    val seqBytes = Bstd.encode(Seq("a"))
    val mapBytes = Bstd.encode(Map("a" -> "b"))

    val truncatedSeq = seqBytes.slice(0, seqBytes.length - 1)
    val truncatedMap = mapBytes.slice(0, mapBytes.length - 1)

    intercept[BstdError] {
      Bstd.decode[Seq[String]](truncatedSeq).toTry.get
    }
    intercept[BstdError] {
      Bstd.decode[Map[String, String]](truncatedMap).toTry.get
    }
  }

  // --- Final Coverage Tests (Port of `TestFinalCoverage`) ---
  test("Coverage: Seq of fixed-size elements") {
    val slice = Seq[Int](1, 2, 3)
    val size = Benc[Seq[Int]].size(slice)
    
    val expectedSize = Bstd.instances.VarUInt.bencInt.size(slice.length) + (slice.length * 4) + 4
    assertEquals(size, expectedSize)
  }

  test("Coverage: Error path for UnmarshalTime") {
    intercept[BstdError.BufferTooSmall] {
      Bstd.decode[Instant](Array[Byte](1, 2, 3)).toTry.get
    }
  }
}