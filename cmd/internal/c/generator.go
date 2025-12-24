package c

import (
	"bytes"
	"fmt"
	"go/ast"
	"strings"

	"github.com/banditmoscow1337/benc/cmd/internal/common"
)

type generator struct {
	*common.Context
	buf bytes.Buffer
}

func New(ctx *common.Context) common.Generator {
	return &generator{Context: ctx}
}

func (g *generator) Generate() error {
	// 1. Generate Header (.h)
	g.generateHeader()
	common.WriteFile(g.Context, g.buf.Bytes(), "h")
	g.buf.Reset()

	// 2. Generate Implementation (.c)
	g.generateSource()
	common.WriteFile(g.Context, g.buf.Bytes(), "c")
	g.buf.Reset()

	return nil
}

// --- Header Generation ---

func (g *generator) generateHeader() {
	hGuard := fmt.Sprintf("%s_BENC_H", strings.ToUpper(g.BaseName))
	g.printf("#ifndef %s\n#define %s\n\n", hGuard, hGuard)
	g.printf("#include \"benc.h\"\n\n")
	g.printf("#ifdef __cplusplus\nextern \"C\" {\n#endif\n\n")

	// Struct Definitions
	for _, ts := range g.Types {
		g.generateCStructDef(ts)
	}

	// Function Prototypes
	for _, ts := range g.Types {
		name := ts.Name.Name
		g.printf("// --- %s ---\n", name)
		g.printf("size_t %s_size(%s* v);\n", name, name)
		g.printf("bstd_status %s_marshal(uint8_t* buf, size_t len, size_t* off, %s* v);\n", name, name)
		g.printf("bstd_status %s_unmarshal(const uint8_t* buf, size_t len, size_t* off, %s* v);\n", name, name)
		g.printf("void %s_free(%s* v);\n\n", name, name)
	}

	g.printf("#ifdef __cplusplus\n}\n#endif\n#endif // %s\n", hGuard)
}

func (g *generator) generateCStructDef(ts *ast.TypeSpec) {
	st, ok := ts.Type.(*ast.StructType)
	if !ok {
		return // Skip aliased types for struct defs for now
	}
	
	g.printf("typedef struct {\n")
	for _, field := range st.Fields.List {
		if g.ShouldIgnoreField(field) {
			continue
		}
		
		cType, nameSuffix := g.toCType(field.Type)
		for _, name := range field.Names {
			g.printf("\t%s %s%s;\n", cType, name.Name, nameSuffix)
			// Add count fields for slices/maps
			if _, isArray := field.Type.(*ast.ArrayType); isArray {
				g.printf("\tsize_t %s_count;\n", name.Name)
			} else if _, isMap := field.Type.(*ast.MapType); isMap {
				// We need keys and values for maps
				// The toCType for map returns the key* type. We need value* and count.
				// This is tricky in a single pass. Let's handle maps explicitly.
			}
		}
		
		// Map specific handling: existing toCType isn't enough because map splits into 3 fields in C
		if mapType, isMap := field.Type.(*ast.MapType); isMap {
			// toCType returned the key pointer type, but we need correct names
			// Re-do for map:
			// fieldName_keys, fieldName_values, fieldName_count
			//keyType, _ := g.toCType(mapType.Key)
			valType, _ := g.toCType(mapType.Value)
			// Remove the pointer * from the types returned by toCType to append it to variable, 
			// or just use them.
			// toCType usually returns "T*" for slice/ptr.
			
			// Actually, let's look at how we parsed it. 
			// Map[K]V -> K* keys, V* values, size_t count.
			// We already printed the first field (keys) above via standard loop? 
			// No, toCType for Map needs to return the KEYS type.
			// Then we append values and count here.
			for _, name := range field.Names {
				// The loop above printed: `KeyType* name;` (if we mapped Map to Key*)
				// We assume `toCType` for Map returns "KeyType*" and suffix "_keys".
				// Then we add:
				g.printf("\t%s %s_values;\n", valType, name.Name)
				g.printf("\tsize_t %s_count;\n", name.Name)
			}
		}
	}
	g.printf("} %s;\n\n", ts.Name.Name)
}

// --- Source Generation ---

func (g *generator) generateSource() {
	g.printf("#include \"%s_benc.h\"\n", g.BaseName)
	g.printf("#include <stdlib.h>\n\n") // for NULL

	for _, ts := range g.Types {
		if _, ok := ts.Type.(*ast.StructType); ok {
			g.generateCStructImpl(ts)
		}
	}
}

func (g *generator) generateCStructImpl(ts *ast.TypeSpec) {
	name := ts.Name.Name
	fields := g.GetSupportedFields(ts)

	// Size
	g.printf("size_t %s_size(%s* v) {\n", name, name)
	g.printf("\tsize_t s = 0;\n")
	for _, f := range fields {
		for _, n := range f.Names {
			g.printf("\ts += %s;\n", g.cSizeExpr(f.Type, "v->"+n.Name))
		}
	}
	g.printf("\treturn s;\n}\n\n")

	// Marshal
	g.printf("bstd_status %s_marshal(uint8_t* buf, size_t len, size_t* off, %s* v) {\n", name, name)
	g.printf("\tbstd_status status = BSTD_OK;\n")
	for _, f := range fields {
		for _, n := range f.Names {
			g.printf("\tif ((status = %s) != BSTD_OK) return status;\n", g.cMarshalExpr(f.Type, "v->"+n.Name))
		}
	}
	g.printf("\treturn BSTD_OK;\n}\n\n")

	// Unmarshal
	g.printf("bstd_status %s_unmarshal(const uint8_t* buf, size_t len, size_t* off, %s* v) {\n", name, name)
	g.printf("\tbstd_status status = BSTD_OK;\n")
	for _, f := range fields {
		for _, n := range f.Names {
			g.printf("\tif ((status = %s) != BSTD_OK) return status;\n", g.cUnmarshalExpr(f.Type, "v->"+n.Name))
		}
	}
	g.printf("\treturn BSTD_OK;\n}\n\n")

	// Free
	g.printf("void %s_free(%s* v) {\n", name, name)
	for _, f := range fields {
		for _, n := range f.Names {
			g.printf("\t%s;\n", g.cFreeExpr(f.Type, "v->"+n.Name))
		}
	}
	g.printf("}\n\n")
}

// --- Expression Helpers ---

func (g *generator) cSizeExpr(t ast.Expr, access string) string {
	typeName := g.ExprToString(t)
	// Check for nested structs
	if _, ok := g.TypeSpecs[typeName]; ok {
		return fmt.Sprintf("%s_size(&%s)", typeName, access)
	}

	switch t := t.(type) {
	case *ast.Ident:
		// Primitive
		return fmt.Sprintf("bstd_size_%s()", cBstdName(t.Name))
	case *ast.StarExpr:
		// Optional/Pointer
		return fmt.Sprintf("bstd_size_pointer(%s, (bstd_size_fn)%s)", access, g.cSizeFunc(t.X))
	case *ast.ArrayType:
		// Slice
		// access is the pointer, access_count is the length
		eltSizeFn := g.cSizeFunc(t.Elt)
		return fmt.Sprintf("bstd_size_slice(%s, %s_count, sizeof(%s), (bstd_size_fn)%s)", access, access, g.toCTypeRaw(t.Elt), eltSizeFn)
	case *ast.MapType:
		// Map
		// access is keys, access_values is values, access_count is count
		return fmt.Sprintf("bstd_size_map(%s_keys, %s_values, %s_count, sizeof(%s), sizeof(%s), (bstd_size_fn)%s, (bstd_size_fn)%s)", 
			access, access, access, g.toCTypeRaw(t.Key), g.toCTypeRaw(t.Value), g.cSizeFunc(t.Key), g.cSizeFunc(t.Value))
	}
	return "0"
}

func (g *generator) cMarshalExpr(t ast.Expr, access string) string {
	typeName := g.ExprToString(t)
	if _, ok := g.TypeSpecs[typeName]; ok {
		return fmt.Sprintf("%s_marshal(buf, len, off, &%s)", typeName, access)
	}

	switch t := t.(type) {
	case *ast.Ident:
		if t.Name == "string" {
			// string is char*, need strlen
			return fmt.Sprintf("bstd_marshal_string(buf, len, off, %s, %s ? strlen(%s) : 0)", access, access, access)
		}
		return fmt.Sprintf("bstd_marshal_%s(buf, len, off, %s)", cBstdName(t.Name), access)
	case *ast.StarExpr:
		return fmt.Sprintf("bstd_marshal_pointer(buf, len, off, %s, (bstd_marshal_fn)%s)", access, g.cMarshalFunc(t.X))
	case *ast.ArrayType:
		// byte slice
		if isByte(t.Elt) {
			return fmt.Sprintf("bstd_marshal_bytes(buf, len, off, %s, %s_count)", access, access)
		}
		return fmt.Sprintf("bstd_marshal_slice(buf, len, off, %s, %s_count, sizeof(%s), (bstd_marshal_fn)%s)", access, access, g.toCTypeRaw(t.Elt), g.cMarshalFunc(t.Elt))
	case *ast.MapType:
		return fmt.Sprintf("bstd_marshal_map(buf, len, off, %s_keys, %s_values, %s_count, sizeof(%s), sizeof(%s), (bstd_marshal_fn)%s, (bstd_marshal_fn)%s)",
			access, access, access, g.toCTypeRaw(t.Key), g.toCTypeRaw(t.Value), g.cMarshalFunc(t.Key), g.cMarshalFunc(t.Value))
	}
	return "BSTD_OK"
}

func (g *generator) cUnmarshalExpr(t ast.Expr, access string) string {
	typeName := g.ExprToString(t)
	if _, ok := g.TypeSpecs[typeName]; ok {
		return fmt.Sprintf("%s_unmarshal(buf, len, off, &%s)", typeName, access)
	}

	switch t := t.(type) {
	case *ast.Ident:
		if t.Name == "string" {
			return fmt.Sprintf("bstd_unmarshal_string_alloc(buf, len, off, &%s)", access)
		}
		return fmt.Sprintf("bstd_unmarshal_%s(buf, len, off, &%s)", cBstdName(t.Name), access)
	case *ast.StarExpr:
		return fmt.Sprintf("bstd_unmarshal_pointer_alloc(buf, len, off, (void**)&%s, sizeof(%s), (bstd_unmarshal_fn)%s)", access, g.toCTypeRaw(t.X), g.cUnmarshalFunc(t.X))
	case *ast.ArrayType:
		if isByte(t.Elt) {
			return fmt.Sprintf("bstd_unmarshal_bytes_alloc(buf, len, off, &%s, &%s_count)", access, access)
		}
		return fmt.Sprintf("bstd_unmarshal_slice_alloc(buf, len, off, (void**)&%s, &%s_count, sizeof(%s), (bstd_unmarshal_fn)%s)", access, access, g.toCTypeRaw(t.Elt), g.cUnmarshalFunc(t.Elt))
	case *ast.MapType:
		return fmt.Sprintf("bstd_unmarshal_map_alloc(buf, len, off, (void**)&%s_keys, (void**)&%s_values, &%s_count, sizeof(%s), sizeof(%s), (bstd_unmarshal_fn)%s, (bstd_unmarshal_fn)%s)",
			access, access, access, g.toCTypeRaw(t.Key), g.toCTypeRaw(t.Value), g.cUnmarshalFunc(t.Key), g.cUnmarshalFunc(t.Value))
	}
	return "BSTD_OK"
}

func (g *generator) cFreeExpr(t ast.Expr, access string) string {
	// Logic to free memory if needed (strings, pointers, slices, maps)
	typeName := g.ExprToString(t)
	if _, ok := g.TypeSpecs[typeName]; ok {
		return fmt.Sprintf("%s_free(&%s)", typeName, access)
	}

	switch t := t.(type) {
	case *ast.Ident:
		if t.Name == "string" {
			return fmt.Sprintf("free(%s)", access)
		}
		// Primitives don't need free
		return "/* no-op */"
	case *ast.StarExpr:
		return fmt.Sprintf("bstd_free_pointer(%s, (bstd_free_fn)%s)", access, g.cFreeFunc(t.X))
	case *ast.ArrayType:
		if isByte(t.Elt) {
			return fmt.Sprintf("free(%s)", access)
		}
		return fmt.Sprintf("bstd_free_slice(%s, %s_count, sizeof(%s), (bstd_free_fn)%s)", access, access, g.toCTypeRaw(t.Elt), g.cFreeFunc(t.Elt))
	case *ast.MapType:
		return fmt.Sprintf("bstd_free_map(%s_keys, %s_values, %s_count, sizeof(%s), sizeof(%s), (bstd_free_fn)%s, (bstd_free_fn)%s)",
			access, access, access, g.toCTypeRaw(t.Key), g.toCTypeRaw(t.Value), g.cFreeFunc(t.Key), g.cFreeFunc(t.Value))
	}
	return "/* no-op */"
}

// --- Helper Functions for C Types ---

func (g *generator) toCType(t ast.Expr) (string, string) {
	// Returns (Type, Suffix) e.g. ("char*", "") or ("map", "_keys") logic handled in struct loop
	// Here we return the base C type.
	
	switch t := t.(type) {
	case *ast.Ident:
		switch t.Name {
		case "string": return "char*", ""
		case "bool": return "bool", ""
		case "int8": return "int8_t", ""
		case "byte", "uint8": return "uint8_t", ""
		case "int16": return "int16_t", ""
		case "uint16": return "uint16_t", ""
		case "int32", "int": return "int32_t", ""
		case "uint32", "uint", "rune": return "uint32_t", ""
		case "int64": return "int64_t", ""
		case "uint64": return "uint64_t", ""
		case "float32": return "float", ""
		case "float64": return "double", ""
		default: return t.Name, "" // Struct name
		}
	case *ast.StarExpr:
		base, _ := g.toCType(t.X)
		return base + "*", ""
	case *ast.ArrayType:
		base, _ := g.toCType(t.Elt)
		return base + "*", ""
	case *ast.MapType:
		// Map is special, handled in struct gen.
		// Return key pointer type to satisfy simple calls
		baseK, _ := g.toCType(t.Key)
		return baseK + "*", "_keys" 
	}
	return "void*", ""
}

func (g *generator) toCTypeRaw(t ast.Expr) string {
	s, _ := g.toCType(t)
	return strings.TrimSuffix(s, "_keys") // cleanup for map hack
}

func (g *generator) cSizeFunc(t ast.Expr) string {
	if ident, ok := t.(*ast.Ident); ok {
		if _, isStruct := g.TypeSpecs[ident.Name]; isStruct {
			return ident.Name + "_size"
		}
		if ident.Name == "string" { return "bstd_size_string" } // special sig
		return "bstd_size_" + cBstdName(ident.Name)
	}
	return "NULL"
}

func (g *generator) cMarshalFunc(t ast.Expr) string {
	if ident, ok := t.(*ast.Ident); ok {
		if _, isStruct := g.TypeSpecs[ident.Name]; isStruct {
			return ident.Name + "_marshal"
		}
		if ident.Name == "string" { return "bstd_marshal_string" }
		return "bstd_marshal_" + cBstdName(ident.Name)
	}
	return "NULL"
}

func (g *generator) cUnmarshalFunc(t ast.Expr) string {
	if ident, ok := t.(*ast.Ident); ok {
		if _, isStruct := g.TypeSpecs[ident.Name]; isStruct {
			return ident.Name + "_unmarshal"
		}
		if ident.Name == "string" { return "bstd_unmarshal_string_alloc" }
		return "bstd_unmarshal_" + cBstdName(ident.Name)
	}
	return "NULL"
}

func (g *generator) cFreeFunc(t ast.Expr) string {
	if ident, ok := t.(*ast.Ident); ok {
		if _, isStruct := g.TypeSpecs[ident.Name]; isStruct {
			return ident.Name + "_free"
		}
		if ident.Name == "string" { return "free" }
	}
	return "NULL"
}

func cBstdName(goName string) string {
	switch goName {
	case "byte", "uint8": return "uint8"
	case "rune": return "int32"
	case "int": return "int32" // Assuming int is 32-bit for bstd map
	case "uint": return "uint32"
	case "float32": return "float32"
	case "float64": return "float64"
	case "string": return "string"
	default: return goName
	}
}

func isByte(t ast.Expr) bool {
	if ident, ok := t.(*ast.Ident); ok {
		return ident.Name == "byte" || ident.Name == "uint8"
	}
	return false
}

func (g *generator) Tests() {
	// 1. Generate Header Includes
	g.generateTestHeader()

	// 2. Generate Generic Wrappers for Primitives
	// (gen.h only provides a few examples, so we generate wrappers for all primitives 
	// to ensure slice/map generators have function pointers to use).
	g.generatePrimitiveWrappers()

	// 3. Generate Forward Declarations for Structs
	// This handles circular references (e.g. linked lists)
	g.printf("// --- Forward Declarations ---\n")
	for _, ts := range g.Types {
		if _, ok := ts.Type.(*ast.StructType); ok {
			name := ts.Name.Name
			g.printf("void generate_%s(void* out);\n", name)
			g.printf("bool compare_%s(const void* a, const void* b);\n", name)
		}
	}
	g.printf("\n")

	// 4. Generate Implementation (Generators & Comparers)
	for _, ts := range g.Types {
		if _, ok := ts.Type.(*ast.StructType); ok {
			g.generateStructTestImpl(ts)
		}
	}

	// 5. Generate Test Runners and Main
	g.generateTestRunners()
	g.generateTestMain()

	// 6. Write to File
	common.WriteFile(g.Context, g.buf.Bytes(), "test.c")
	g.buf.Reset()
}

// --- Test Generation Helpers ---

func (g *generator) generateTestHeader() {
	g.printf("#include <stdio.h>\n")
	g.printf("#include <stdlib.h>\n")
	g.printf("#include <time.h>\n")
	g.printf("#include <assert.h>\n")
	g.printf("#include \"%s_benc.h\"\n", g.BaseName)
	g.printf("#include \"gen.h\"\n\n") // Assumes gen.h is available as provided
}

func (g *generator) generatePrimitiveWrappers() {
	g.printf("// --- Primitive Wrappers for Generic Functions ---\n")
	primitives := []struct{ CType, Name string }{
		{"bool", "bool"},
		{"int8_t", "int8"}, {"int16_t", "int16"}, {"int32_t", "int32"}, {"int64_t", "int64"},
		{"uint8_t", "uint8"}, {"uint16_t", "uint16"}, {"uint32_t", "uint32"}, {"uint64_t", "uint64"},
		{"float", "float32"}, {"double", "float64"},
		{"char*", "string_alloc"}, // Special case handling in loops
	}

	for _, p := range primitives {
		// Generator Wrapper
		g.printf("static void generate_%s_generic(void* out) { ", p.Name)
		if p.Name == "string_alloc" {
			g.printf("*(char**)out = generate_string_alloc();")
		} else {
			g.printf("*(%s*)out = generate_%s();", p.CType, p.Name)
		}
		g.printf(" }\n")

		// Comparer Wrapper
		g.printf("static bool compare_%s_generic(const void* a, const void* b) { ", p.Name)
		if p.Name == "string_alloc" {
			g.printf("return compare_string(*(char**)a, *(char**)b);")
		} else {
			g.printf("return *(%s*)a == *(%s*)b;", p.CType, p.CType)
		}
		g.printf(" }\n")
	}
	g.printf("\n")
}

func (g *generator) generateStructTestImpl(ts *ast.TypeSpec) {
	name := ts.Name.Name
	//st := ts.Type.(*ast.StructType)
	fields := g.GetSupportedFields(ts)

	// --- Generator ---
	// We use void* signature to be compatible with generic slice/pointer generators
	g.printf("void generate_%s(void* out) {\n", name)
	g.printf("\t%s* v = (%s*)out;\n", name, name)

	for _, f := range fields {
		for _, n := range f.Names {
			g.printf("\t%s;\n", g.cGenerateExpr(f.Type, "v->"+n.Name))
		}
	}
	g.printf("}\n\n")

	// --- Comparer ---
	g.printf("bool compare_%s(const void* a_ptr, const void* b_ptr) {\n", name)
	g.printf("\tconst %s* a = (const %s*)a_ptr;\n", name, name)
	g.printf("\tconst %s* b = (const %s*)b_ptr;\n", name, name)

	for _, f := range fields {
		for _, n := range f.Names {
			g.printf("\tif (!%s) return false;\n", g.cCompareExpr(f.Type, "a->"+n.Name, "b->"+n.Name))
		}
	}
	g.printf("\treturn true;\n}\n\n")
}

func (g *generator) generateTestRunners() {
	g.printf("// --- Test Runners ---\n")
	for _, ts := range g.Types {
		if _, ok := ts.Type.(*ast.StructType); ok {
			name := ts.Name.Name
			g.printf("void test_%s() {\n", name)
			g.printf("\tprintf(\"Testing %s... \");\n", name)
			
			// 1. Generate
			g.printf("\t%s original;\n", name)
			// Zero init is important so free doesn't crash if generate fails or logic is partial
			g.printf("\tmemset(&original, 0, sizeof(original));\n") 
			g.printf("\tgenerate_%s(&original);\n", name)

			// 2. Measure
			g.printf("\tsize_t size = %s_size(&original);\n", name)

			// 3. Marshal
			g.printf("\tuint8_t* buf = (uint8_t*)malloc(size);\n")
			g.printf("\tsize_t off = 0;\n")
			g.printf("\tbstd_status status = %s_marshal(buf, size, &off, &original);\n", name)
			g.printf("\tif (status != BSTD_OK) { printf(\"Marshal failed code %%d\\n\", status); exit(1); }\n")
			g.printf("\tif (off != size) { printf(\"Size mismatch: size %%zu, off %%zu\\n\", size, off); exit(1); }\n")

			// 4. Unmarshal
			g.printf("\t%s copy;\n", name)
			g.printf("\tmemset(&copy, 0, sizeof(copy));\n")
			g.printf("\toff = 0;\n")
			g.printf("\tstatus = %s_unmarshal(buf, size, &off, &copy);\n", name)
			g.printf("\tif (status != BSTD_OK) { printf(\"Unmarshal failed code %%d\\n\", status); exit(1); }\n")

			// 5. Compare
			g.printf("\tif (!compare_%s(&original, &copy)) {\n", name)
			g.printf("\t\tprintf(\"Comparison failed!\\n\");\n")
			g.printf("\t\texit(1);\n")
			g.printf("\t}\n")

			// 6. Cleanup
			g.printf("\t%s_free(&original);\n", name)
			g.printf("\t%s_free(&copy);\n", name)
			g.printf("\tfree(buf);\n")
			g.printf("\tprintf(\"OK\\n\");\n")
			g.printf("}\n\n")
		}
	}
}

func (g *generator) generateTestMain() {
	g.printf("int main() {\n")
	g.printf("\tsrand(time(NULL));\n")
	for _, ts := range g.Types {
		if _, ok := ts.Type.(*ast.StructType); ok {
			g.printf("\ttest_%s();\n", ts.Name.Name)
		}
	}
	g.printf("\tprintf(\"All tests passed!\\n\");\n")
	g.printf("\treturn 0;\n")
	g.printf("}\n")
}

// --- Expr Generators for Tests ---

func (g *generator) cGenerateExpr(t ast.Expr, access string) string {
	typeName := g.ExprToString(t)

	// Nested Struct (Direct)
	if _, ok := g.TypeSpecs[typeName]; ok {
		return fmt.Sprintf("generate_%s(&%s)", typeName, access)
	}

	switch t := t.(type) {
	case *ast.Ident:
		if t.Name == "string" {
			return fmt.Sprintf("%s = generate_string_alloc()", access)
		}
		// Primitive direct assignment
		return fmt.Sprintf("%s = generate_%s()", access, cBstdName(t.Name))

	case *ast.StarExpr:
		// Optional field
		// We use the generic wrapper for the element type
		elemGen := g.cGenericName(t.X, "generate", "") 
		return fmt.Sprintf("%s = (%s)generate_pointer_alloc(sizeof(%s), %s)", 
			access, g.toCTypeRaw(t), g.toCTypeRaw(t.X), elemGen)

	case *ast.ArrayType:
		// Slice
		// Handle []byte specifically if needed, though gen.h has generate_bytes_alloc
		if isByte(t.Elt) {
			return fmt.Sprintf("%s = generate_bytes_alloc(&%s_count)", access, access)
		}
		elemGen := g.cGenericName(t.Elt, "generate", "")
		return fmt.Sprintf("%s = (%s)generate_slice_alloc(&%s_count, sizeof(%s), %s)", 
			access, g.toCTypeRaw(t), access, g.toCTypeRaw(t.Elt), elemGen)

	case *ast.MapType:
		keyGen := g.cGenericName(t.Key, "generate", "")
		valGen := g.cGenericName(t.Value, "generate", "")
		return fmt.Sprintf("generate_map_alloc((void**)&%s_keys, (void**)&%s_values, &%s_count, sizeof(%s), sizeof(%s), %s, %s)",
			access, access, access, g.toCTypeRaw(t.Key), g.toCTypeRaw(t.Value), keyGen, valGen)
	}
	return ""
}

func (g *generator) cCompareExpr(t ast.Expr, accessA, accessB string) string {
	typeName := g.ExprToString(t)

	if _, ok := g.TypeSpecs[typeName]; ok {
		return fmt.Sprintf("compare_%s(&%s, &%s)", typeName, accessA, accessB)
	}

	switch t := t.(type) {
	case *ast.Ident:
		if t.Name == "string" {
			return fmt.Sprintf("compare_string(%s, %s)", accessA, accessB)
		}
		// Direct primitive comparison
		return fmt.Sprintf("%s == %s", accessA, accessB)

	case *ast.StarExpr:
		elemCmp := g.cGenericName(t.X, "compare", "")
		return fmt.Sprintf("compare_pointer(%s, %s, sizeof(%s), %s)", 
			accessA, accessB, g.toCTypeRaw(t.X), elemCmp)

	case *ast.ArrayType:
		if isByte(t.Elt) {
			return fmt.Sprintf("compare_bytes(%s, %s_count, %s, %s_count)", accessA, accessA, accessB, accessB)
		}
		elemCmp := g.cGenericName(t.Elt, "compare", "")
		return fmt.Sprintf("compare_slice(%s, %s, %s_count, sizeof(%s), %s)", 
			accessA, accessB, accessA, g.toCTypeRaw(t.Elt), elemCmp)

	case *ast.MapType:
		keyCmp := g.cGenericName(t.Key, "compare", "")
		valCmp := g.cGenericName(t.Value, "compare", "")
		return fmt.Sprintf("compare_map(%s_keys, %s_values, %s_count, %s_keys, %s_values, %s_count, sizeof(%s), sizeof(%s), %s, %s)",
			accessA, accessA, accessA, accessB, accessB, accessB, g.toCTypeRaw(t.Key), g.toCTypeRaw(t.Value), keyCmp, valCmp)
	}
	return "true"
}

// Helper to get the name of the generic wrapper function: e.g. "generate_int32_generic" or "generate_MyStruct"
func (g *generator) cGenericName(t ast.Expr, prefix, suffix string) string {
	typeName := g.ExprToString(t)
	if _, ok := g.TypeSpecs[typeName]; ok {
		// Structs match the signature naturally
		return fmt.Sprintf("%s_%s", prefix, typeName)
	}
	
	switch t := t.(type) {
	case *ast.Ident:
		if t.Name == "string" {
			return fmt.Sprintf("%s_string_alloc_generic", prefix)
		}
		return fmt.Sprintf("%s_%s_generic", prefix, cBstdName(t.Name))
	}
	// Fallback for types not strictly handled (shouldn't happen with valid schemas)
	return "NULL"
}
func (g *generator) printf(format string, args ...interface{}) {
	_, _ = fmt.Fprintf(&g.buf, format, args...)
}