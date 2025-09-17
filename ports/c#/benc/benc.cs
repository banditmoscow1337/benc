using System;
using System.Collections.Generic;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Text;
using System.Buffers.Binary;

public class BencException : Exception
{
    public BencException(string message) : base(message) { }
}

/// <summary>
/// Provides high-performance, allocation-free binary serialization and deserialization routines.
/// This library is a C# port of the Go 'bstd' package and operates on Spans for efficiency.
/// </summary>
public static class Bstd
{
    private const int SliceMapTerminator = 0x01010101;

    #region String
    
    public static int SizeOfString(string value)
    {
        int byteCount = Encoding.UTF8.GetByteCount(value);
        return SizeOfUInt32((uint)byteCount) + byteCount;
    }

    public static int MarshalString(Span<byte> buffer, string value)
    {
        int byteCount = Encoding.UTF8.GetByteCount(value);
        int offset = MarshalUInt32(buffer, (uint)byteCount);
        Encoding.UTF8.GetBytes(value, buffer.Slice(offset));
        return offset + byteCount;
    }

    public static int UnmarshalString(ReadOnlySpan<byte> buffer, out string value)
    {
        int offset = UnmarshalUInt32(buffer, out uint length);
        if (buffer.Length < offset + length)
        {
            throw new BencException("Buffer too small to unmarshal string.");
        }
        value = Encoding.UTF8.GetString(buffer.Slice(offset, (int)length));
        return offset + (int)length;
    }

    #endregion

    #region Slice / List

    public static int SizeOfSlice<T>(IReadOnlyList<T> slice, Func<T, int> elementSizer)
    {
        int size = SizeOfUInt32((uint)slice.Count) + sizeof(int); // Length + Terminator
        foreach (var item in slice)
        {
            size += elementSizer(item);
        }
        return size;
    }

    public static int SizeOfFixedSlice<T>(IReadOnlyList<T> slice, int elementSize) where T : unmanaged
    {
        return SizeOfUInt32((uint)slice.Count) + (slice.Count * elementSize) + sizeof(int);
    }

    public static int MarshalSlice<T>(Span<byte> buffer, IReadOnlyList<T> slice, Func<Span<byte>, T, int> elementMarshaler)
    {
        int offset = MarshalUInt32(buffer, (uint)slice.Count);
        foreach (var item in slice)
        {
            offset += elementMarshaler(buffer.Slice(offset), item);
        }
        BinaryPrimitives.WriteInt32LittleEndian(buffer.Slice(offset), SliceMapTerminator);
        return offset + sizeof(int);
    }
    
    public static int UnmarshalSlice<T>(ReadOnlySpan<byte> buffer, Func<ReadOnlySpan<byte>, (int, T)> elementUnmarshaler, out List<T> value)
    {
        int offset = UnmarshalUInt32(buffer, out uint count);
        value = new List<T>((int)count);
        for (int i = 0; i < count; i++)
        {
            var (bytesRead, item) = elementUnmarshaler(buffer.Slice(offset));
            offset += bytesRead;
            value.Add(item);
        }
        
        if (BinaryPrimitives.ReadInt32LittleEndian(buffer.Slice(offset)) != SliceMapTerminator)
        {
            throw new BencException("Slice terminator not found.");
        }
        return offset + sizeof(int);
    }

    #endregion

    #region Map / Dictionary

    public static int SizeOfMap<TKey, TValue>(IReadOnlyDictionary<TKey, TValue> map, Func<TKey, int> keySizer, Func<TValue, int> valueSizer)
    {
        int size = SizeOfUInt32((uint)map.Count) + sizeof(int); // Length + Terminator
        foreach (var kvp in map)
        {
            size += keySizer(kvp.Key);
            size += valueSizer(kvp.Value);
        }
        return size;
    }

    public static int MarshalMap<TKey, TValue>(Span<byte> buffer, IReadOnlyDictionary<TKey, TValue> map, Func<Span<byte>, TKey, int> keyMarshaler, Func<Span<byte>, TValue, int> valueMarshaler)
    {
        int offset = MarshalUInt32(buffer, (uint)map.Count);
        foreach (var kvp in map)
        {
            offset += keyMarshaler(buffer.Slice(offset), kvp.Key);
            offset += valueMarshaler(buffer.Slice(offset), kvp.Value);
        }
        BinaryPrimitives.WriteInt32LittleEndian(buffer.Slice(offset), SliceMapTerminator);
        return offset + sizeof(int);
    }
    
    public static int UnmarshalMap<TKey, TValue>(ReadOnlySpan<byte> buffer, Func<ReadOnlySpan<byte>, (int, TKey)> keyUnmarshaler, Func<ReadOnlySpan<byte>, (int, TValue)> valueUnmarshaler, out Dictionary<TKey, TValue> value)
    {
        int offset = UnmarshalUInt32(buffer, out uint count);
        value = new Dictionary<TKey, TValue>((int)count);
        for (int i = 0; i < count; i++)
        {
            var (keyBytesRead, key) = keyUnmarshaler(buffer.Slice(offset));
            offset += keyBytesRead;
            var (valueBytesRead, val) = valueUnmarshaler(buffer.Slice(offset));
            offset += valueBytesRead;
            value.Add(key, val);
        }

        if (BinaryPrimitives.ReadInt32LittleEndian(buffer.Slice(offset)) != SliceMapTerminator)
        {
            throw new BencException("Map terminator not found.");
        }
        return offset + sizeof(int);
    }

    #endregion

    #region Primitives

    // Unsigned Integers (VarInt for 32-bit length prefixes)
    public static int SizeOfUInt32(uint value)
    {
        if (value < (1 << 7)) return 1;
        if (value < (1 << 14)) return 2;
        if (value < (1 << 21)) return 3;
        if (value < (1 << 28)) return 4;
        return 5;
    }

    public static int MarshalUInt32(Span<byte> buffer, uint value)
    {
        int i = 0;
        while (value >= 0x80)
        {
            buffer[i++] = (byte)(value | 0x80);
            value >>= 7;
        }
        buffer[i++] = (byte)value;
        return i;
    }

    public static int UnmarshalUInt32(ReadOnlySpan<byte> buffer, out uint value)
    {
        value = 0;
        uint shift = 0;
        for (int i = 0; i < 5; i++)
        {
            if (i >= buffer.Length) throw new BencException("Buffer too small for VarInt.");
            byte b = buffer[i];
            value |= (uint)(b & 0x7F) << (int)shift;
            if ((b & 0x80) == 0)
            {
                return i + 1;
            }
            shift += 7;
        }
        throw new BencException("VarInt is too long or invalid.");
    }
    
    // Fixed-size Primitives
    public static int SizeOfInt8() => 1;
    public static int MarshalInt8(Span<byte> buffer, sbyte value) { buffer[0] = (byte)value; return 1; }
    public static int UnmarshalInt8(ReadOnlySpan<byte> buffer, out sbyte value) { value = (sbyte)buffer[0]; return 1; }

    public static int SizeOfInt16() => 2;
    public static int MarshalInt16(Span<byte> buffer, short value)
    {
        BinaryPrimitives.WriteInt16LittleEndian(buffer, value);
        return 2;
    }
    public static int UnmarshalInt16(ReadOnlySpan<byte> buffer, out short value) { value = BinaryPrimitives.ReadInt16LittleEndian(buffer); return 2; }
    
    public static int SizeOfInt32() => 4;
    public static int MarshalInt32(Span<byte> buffer, int value)
    {
        BinaryPrimitives.WriteInt32LittleEndian(buffer, value);
        return 4;
    }
    public static int UnmarshalInt32(ReadOnlySpan<byte> buffer, out int value) { value = BinaryPrimitives.ReadInt32LittleEndian(buffer); return 4; }

    public static int SizeOfInt64() => 8;
    public static int MarshalInt64(Span<byte> buffer, long value)
    {
        BinaryPrimitives.WriteInt64LittleEndian(buffer, value);
        return 8;
    }
    public static int UnmarshalInt64(ReadOnlySpan<byte> buffer, out long value) { value = BinaryPrimitives.ReadInt64LittleEndian(buffer); return 8; }

    public static int SizeOfBool() => 1;
    public static int MarshalBool(Span<byte> buffer, bool value) { buffer[0] = (byte)(value ? 1 : 0); return 1; }
    public static int UnmarshalBool(ReadOnlySpan<byte> buffer, out bool value) { value = buffer[0] == 1; return 1; }

    public static int SizeOfPointer<T>(T? value, Func<T, int> sizer) where T : class 
        => SizeOfBool() + (value != null ? sizer(value) : 0);
    
    public static int MarshalPointer<T>(Span<byte> buffer, T? value, Func<Span<byte>, T, int> marshaler) where T : class
    {
        int offset = MarshalBool(buffer, value != null);
        if (value != null)
        {
            offset += marshaler(buffer.Slice(offset), value);
        }
        return offset;
    }
    
    public static int UnmarshalPointer<T>(ReadOnlySpan<byte> buffer, Func<ReadOnlySpan<byte>, (int, T)> unmarshaler, out T? value) where T : class
    {
        int offset = UnmarshalBool(buffer, out bool hasValue);
        value = null;
        if (hasValue)
        {
            var (bytesRead, item) = unmarshaler(buffer.Slice(offset));
            offset += bytesRead;
            value = item;
        }
        return offset;
    }
    
    #endregion
}