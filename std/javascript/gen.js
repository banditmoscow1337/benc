/**
 * gen.js - JavaScript port of the Go `gen.go` test data generator.
 * Provides functions to generate random primitives, slices, maps, and pointers
 * for testing the `bstd` serialization library.
 */

const MaxDepth = 2; // Controls the maximum nesting level for recursive structures

// --- Helper: Randomness ---

// Simulating Go's rand.Intn(n)
function randIntn(n) {
    return Math.floor(Math.random() * n);
}

// Simulating Go's rand.Int()
function randInt() {
    // JS numbers are doubles, effectively 53-bit integers. 
    // This generates a random integer up to MAX_SAFE_INTEGER.
    return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
}

// Simulating rand.Int31()
function randInt31() {
    return Math.floor(Math.random() * 2147483647);
}

// Simulating rand.Uint32()
function randUint32() {
    return Math.floor(Math.random() * 4294967296);
}

// --- Generic Generators ---

function RandomCount() {
    return 1 + randIntn(3); // Generate slices/maps with 1 to 3 elements
}

function GenerateBool(_depth) {
    return randIntn(2) === 1;
}

function GenerateInt(_depth) {
    // Go 'int' is platform dependent, usually 64-bit on modern systems.
    // JS 'number' is safe up to 2^53.
    const v = randInt();
    return randIntn(2) === 0 ? v : -v;
}

function GenerateInt8(_depth) {
    return (randIntn(256) - 128);
}

function GenerateInt16(_depth) {
    return (randIntn(65536) - 32768);
}

function GenerateInt32(_depth) {
    const v = randInt31();
    return randIntn(2) === 0 ? v : -v;
}

function GenerateInt64(_depth) {
    // Use BigInt for 64-bit precision
    const low = BigInt(randUint32());
    const high = BigInt(randUint32());
    const val = (high << 32n) | low;
    return randIntn(2) === 0 ? val : -val;
}

function GenerateUint(_depth) {
    return randInt();
}

function GenerateUint8(_depth) {
    return randIntn(256);
}

function GenerateUint16(_depth) {
    return randIntn(65536);
}

function GenerateUint32(_depth) {
    return randUint32();
}

function GenerateUint64(_depth) {
    const low = BigInt(randUint32());
    const high = BigInt(randUint32());
    return (high << 32n) | low;
}

function GenerateUintptr(_depth) {
    // Usually treated as uint64 or uint32 depending on arch. defaulting to uint64 logic.
    return GenerateUint64(_depth);
}

function GenerateFloat32(_depth) {
    // Math.fround ensures 32-bit float precision representation
    return Math.fround(Math.random() * 1000); 
}

function GenerateFloat64(_depth) {
    return Math.random() * 1000;
}

function GenerateComplex64(_depth) {
    // JS doesn't have a native Complex type, represented here as an object.
    return { r: GenerateFloat32(), i: GenerateFloat32() };
}

function GenerateComplex128(_depth) {
    return { r: GenerateFloat64(), i: GenerateFloat64() };
}

function GenerateString(_depth) {
    return RandomString(5 + randIntn(15));
}

function GenerateByte(_depth) {
    return randIntn(256);
}

function GenerateBytes(_depth) {
    return RandomBytes(3 + randIntn(7));
}

function GenerateRune(_depth) {
    return randInt31(); // Runes are int32
}

function GenerateTime(_depth) {
    return RandomTime();
}

// --- Slice Generators ---

function GenerateSlice(depth, generator) {
    const count = RandomCount();
    const s = new Array(count);
    for (let i = 0; i < count; i++) {
        s[i] = generator(depth);
    }
    return s;
}

function GenerateSliceSlice(depth, generator) {
    const count = RandomCount();
    const s = new Array(count);
    for (let i = 0; i < count; i++) {
        s[i] = GenerateSlice(depth, generator);
    }
    return s;
}

// Helper function for byte slice comparison
function BytesEqual(a, b) {
    if (a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}

// GeneratePointer randomly returns either null (nil) or a value.
function GeneratePointer(depth, generator) {
    if (randIntn(4) === 0) {
        return null;
    }
    return generator(depth);
}

// --- Map Generators ---

function GenerateMap(depth, keyGen, valGen) {
    const count = RandomCount();
    const m = new Map();
    for (let i = 0; i < count; i++) {
        m.set(keyGen(depth), valGen(depth));
    }
    return m;
}

// --- Random Helpers ---

function RandomString(length) {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let res = "";
    for (let i = 0; i < length; i++) {
        res += charset[randIntn(charset.length)];
    }
    return res;
}

function RandomBytes(length) {
    const b = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
        b[i] = randIntn(256);
    }
    return b;
}

function RandomTime() {
    // Current time + random duration (up to 1,000,000 seconds)
    // Go code: r.Int63n(1000000) * time.Second
    const now = Date.now();
    const offset = randIntn(1000000) * 1000; // milliseconds
    return new Date(now + offset);
}

function RandomTimePtr() {
    return RandomTime();
}

// --- Comparison Functions ---

function CompareField(name, cmp) {
    const err = cmp();
    if (err) {
        return new Error(`${name}: ${err.message}`);
    }
    return null;
}

function ComparePrimitive(a, b) {
    if (a !== b) {
        return new Error(`mismatch: ${a} != ${b}`);
    }
    return null;
}

function CompareBytes(a, b) {
    if (!BytesEqual(a, b)) {
        // Simple hex-like display for error
        const hexA = Array.from(a).map(byte => byte.toString(16).padStart(2, '0')).join('');
        const hexB = Array.from(b).map(byte => byte.toString(16).padStart(2, '0')).join('');
        return new Error(`mismatch: ${hexA} != ${hexB}`);
    }
    return null;
}

function CompareSlice(a, b, elemCmp) {
    if (a.length !== b.length) {
        return new Error(`length mismatch: ${a.length} != ${b.length}`);
    }
    if (a.length === 0 && b.length === 0) {
        return null;
    }
    for (let i = 0; i < a.length; i++) {
        const err = elemCmp(a[i], b[i]);
        if (err) {
            return new Error(`index [${i}]: ${err.message}`);
        }
    }
    return null;
}

function CompareMap(a, b, valCmp) {
    if (a.size !== b.size) {
        return new Error(`length mismatch: ${a.size} != ${b.size}`);
    }
    if (a.size === 0 && b.size === 0) {
        return null;
    }
    for (const [k, v1] of a) {
        if (!b.has(k)) {
            return new Error(`key ${k} missing in b`);
        }
        const v2 = b.get(k);
        const err = valCmp(v1, v2);
        if (err) {
            return new Error(`key ${k} value: ${err.message}`);
        }
    }
    return null;
}

function ComparePointer(a, b, elemCmp) {
    if (a === null && b === null) {
        return null;
    }
    if (a === null && b !== null) {
        return new Error("mismatch: a is nil, b is not");
    }
    if (a !== null && b === null) {
        return new Error("mismatch: a is not nil, b is nil");
    }
    // In JS, pointers are just the value (objects/arrays) or null.
    // So we just compare the values directly via elemCmp.
    return elemCmp(a, b);
}

// --- Exports ---

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        MaxDepth,
        RandomCount,
        GenerateBool,
        GenerateInt, GenerateInt8, GenerateInt16, GenerateInt32, GenerateInt64,
        GenerateUint, GenerateUint8, GenerateUint16, GenerateUint32, GenerateUint64, GenerateUintptr,
        GenerateFloat32, GenerateFloat64,
        GenerateComplex64, GenerateComplex128,
        GenerateString,
        GenerateByte, GenerateBytes,
        GenerateRune,
        GenerateTime,
        GenerateSlice, GenerateSliceSlice,
        GeneratePointer,
        GenerateMap,
        RandomString, RandomBytes, RandomTime, RandomTimePtr,
        BytesEqual,
        CompareField, ComparePrimitive, CompareBytes, CompareSlice, CompareMap, ComparePointer
    };
}