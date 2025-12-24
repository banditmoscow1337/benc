package main.com.benc;

/**
 * Base exception for all Bstd encoding/decoding errors.
 */
public class BencException extends Exception {
    public BencException(String message) {
        super(message);
    }

    public BencException(String message, Throwable cause) {
        super(message, cause);
    }
}