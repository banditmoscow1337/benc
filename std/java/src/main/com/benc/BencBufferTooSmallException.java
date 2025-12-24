package main.com.benc;

/**
 * Thrown when a buffer is too small to read or write the required data.
 */
public class BencBufferTooSmallException extends BencException {
    public BencBufferTooSmallException() {
        super("Buffer was too small to complete the operation.");
    }
}