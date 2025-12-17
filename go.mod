retract (
    v1.1.0 // Undefined behavior vulnerability
    v1.1.1 // Broken varint skip
    v1.1.2 // Undefined Uint methods after code generation
    v1.1.5 // Broken code generation with slices and maps using imported benc schemas
    v1.2.0 // New generator and ports for many langs
)

module github.com/banditmoscow1337/benc

go 1.25.5

require golang.org/x/exp v0.0.0-20231110203233-9a3e6036ecaa
