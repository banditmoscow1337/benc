package main.com.benc;

/**
 * Thrown when a varint overflows the capacity of its target integer type.
 */
public class BencOverflowException extends BencException {
    public BencOverflowException() {
        super("Varint overflowed a 64-bit integer.");
    }
}