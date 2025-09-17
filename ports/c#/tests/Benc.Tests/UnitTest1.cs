using System;
using System.Collections.Generic;
using System.Linq;
using Xunit;

public class BstdTests
{
    private static readonly Random Rng = new();

    #region Data Type Roundtrip Tests

    [Fact]
    public void AllDataTypes_ShouldRoundtripSuccessfully()
    {
        // Arrange
        var testString = "Hello World!";
        var testBytes = new byte[] { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 };

        var values = new object[]
        {
            true,
            (sbyte)-1,
            (short)-32768,
            Rng.Next(),
            Rng.NextInt64(),
            testString,
            testBytes
        };
        
        // Calculate total size
        int totalSize = Bstd.SizeOfBool() +
                        Bstd.SizeOfInt8() +
                        Bstd.SizeOfInt16() +
                        Bstd.SizeOfInt32() +
                        Bstd.SizeOfInt64() +
                        Bstd.SizeOfString(testString) +
                        Bstd.SizeOfSlice(testBytes, _ => 1);

        Span<byte> buffer = new byte[totalSize];

        // Act: Marshal all values
        int offset = 0;
        offset += Bstd.MarshalBool(buffer.Slice(offset), (bool)values[0]);
        offset += Bstd.MarshalInt8(buffer.Slice(offset), (sbyte)values[1]);
        offset += Bstd.MarshalInt16(buffer.Slice(offset), (short)values[2]);
        offset += Bstd.MarshalInt32(buffer.Slice(offset), (int)values[3]);
        offset += Bstd.MarshalInt64(buffer.Slice(offset), (long)values[4]);
        offset += Bstd.MarshalString(buffer.Slice(offset), (string)values[5]);
        offset += Bstd.MarshalSlice(buffer.Slice(offset), (byte[])values[6], (b, item) => { b[0] = item; return 1; });

        // Assert: Size and Marshal correctness
        Assert.Equal(totalSize, offset);

        // Act: Unmarshal all values
        int readOffset = 0;
        readOffset += Bstd.UnmarshalBool(buffer.Slice(readOffset), out bool vBool);
        readOffset += Bstd.UnmarshalInt8(buffer.Slice(readOffset), out sbyte vSbyte);
        readOffset += Bstd.UnmarshalInt16(buffer.Slice(readOffset), out short vShort);
        readOffset += Bstd.UnmarshalInt32(buffer.Slice(readOffset), out int vInt);
        readOffset += Bstd.UnmarshalInt64(buffer.Slice(readOffset), out long vLong);
        readOffset += Bstd.UnmarshalString(buffer.Slice(readOffset), out string vString);
        readOffset += Bstd.UnmarshalSlice(buffer.Slice(readOffset), b => (1, b[0]), out var vBytesList);

        // Assert: Unmarshal correctness
        Assert.Equal(totalSize, readOffset);
        Assert.Equal(values[0], vBool);
        Assert.Equal(values[1], vSbyte);
        Assert.Equal(values[2], vShort);
        Assert.Equal(values[3], vInt);
        Assert.Equal(values[4], vLong);
        Assert.Equal(values[5], vString);
        Assert.Equal(values[6], vBytesList.ToArray());
    }
    
    #endregion

    #region String Tests

    [Theory]
    [InlineData("")]
    [InlineData("Hello, C#!")]
    [InlineData("👋")]
    public void String_ShouldRoundtrip(string testString)
    {
        int size = Bstd.SizeOfString(testString);
        Span<byte> buffer = new byte[size];

        int bytesWritten = Bstd.MarshalString(buffer, testString);
        int bytesRead = Bstd.UnmarshalString(buffer, out string result);

        Assert.Equal(size, bytesWritten);
        Assert.Equal(size, bytesRead);
        Assert.Equal(testString, result);
    }
    
    #endregion

    #region Slice and Map Tests
    
    [Fact]
    public void Slice_ShouldRoundtrip()
    {
        var list = new List<string> { "element1", "element2", "element3" };

        int size = Bstd.SizeOfSlice(list, Bstd.SizeOfString);
        Span<byte> buffer = new byte[size];

        int bytesWritten = Bstd.MarshalSlice(buffer, list, Bstd.MarshalString);
        int bytesRead = Bstd.UnmarshalSlice(buffer, (b, out string v) => Bstd.UnmarshalString(b, out v), out var result);

        Assert.Equal(size, bytesWritten);
        Assert.Equal(size, bytesRead);
        Assert.Equal(list, result);
    }

    [Fact]
    public void Map_ShouldRoundtrip()
    {
        var dict = new Dictionary<int, string>
        {
            { 1, "value1" },
            { 42, "value42" },
            { 1024, "value1024" }
        };

        int size = Bstd.SizeOfMap(dict, Bstd.SizeOfInt32, Bstd.SizeOfString);
        Span<byte> buffer = new byte[size];
        
        int bytesWritten = Bstd.MarshalMap(buffer, dict, Bstd.MarshalInt32, Bstd.MarshalString);
        int bytesRead = Bstd.UnmarshalMap(buffer, 
            (b, out int k) => Bstd.UnmarshalInt32(b, out k),
            (b, out string v) => Bstd.UnmarshalString(b, out v),
            out var result);
            
        Assert.Equal(size, bytesWritten);
        Assert.Equal(size, bytesRead);
        Assert.Equal(dict, result);
    }

    #endregion

    #region Error Handling Tests

    [Fact]
    public void Unmarshal_WithInsufficientBuffer_ShouldThrowBencException()
    {
        // String with declared length longer than buffer
        var badStringBytes = new byte[] { 100, 72, 101, 108, 108, 111 }; // Len=100, "Hello"
        Assert.Throws<BencException>(() => Bstd.UnmarshalString(badStringBytes, out _));

        // Slice with missing terminator
        var badSliceBytes = new byte[] { 1, 65 }; // Len=1, 'A', but no 4-byte terminator
        Assert.Throws<IndexOutOfRangeException>(() => Bstd.UnmarshalSlice(badSliceBytes, b => (1, b[0]), out var _));
    }
    
    #endregion
}