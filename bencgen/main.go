// benc_generator.go
// This is a code generator for benc serialization/deserialization and tests.
// Usage: go run benc_generator.go input.go output_dir
// It assumes all substructs are defined in the input file and are local to the package.
// Ignores fields of type 'any', interfaces, and types from other packages (except time.Time).
// Generates two files: <input>_benc.go and <input>_benc_test.go

package main

import (
	"bytes"
	"fmt"
	"go/ast"
	"go/importer"
	"go/parser"
	"go/token"
	"go/types"
	"log"
	"os"
	"path/filepath"
	"strings"
	"text/template"
)

// TypeInfo holds information about a field type for code generation.
type TypeInfo struct {
	Name                  string // e.g., "int64", "string", "SubItem", "*SubItem", "[]byte", "[][]byte", "map[string]int32"
	IsPointer             bool
	IsSlice               bool
	SliceElementIsPointer bool // True for types like []*SubItem
	IsMap                 bool
	KeyType               string
	ValueType             string
	IsTime                bool
	IsByteSlice           bool // for []byte
	IsStruct              bool
	IsIgnored             bool // for any/interface
}

// FieldInfo holds information about a field.
type FieldInfo struct {
	Name string
	Type TypeInfo
}

// StructInfo holds information about a struct for template.
type StructInfo struct {
	Name     string
	Receiver string
	Fields   []FieldInfo
}

// BencFuncs holds the names of the serialization functions for a basic type.
type BencFuncs struct {
	Size      string
	Marshal   string
	Unmarshal string
}

// Generator holds the state for code generation.
type Generator struct {
	fset              *token.FileSet
	pkg               *ast.Package
	typesInfo         *types.Info
	structs           map[string]*StructInfo
	imports           map[string]bool
	pkgName           string
	outputDir         string
	inputFileBaseName string
}

// NewGenerator creates a new generator.
func NewGenerator() *Generator {
	return &Generator{
		fset:    token.NewFileSet(),
		imports: make(map[string]bool),
		structs: make(map[string]*StructInfo),
	}
}

// ParseFile parses the input Go file.
func (g *Generator) ParseFile(filename string) error {
	f, err := parser.ParseFile(g.fset, filename, nil, parser.ParseComments)
	if err != nil {
		return err
	}
	g.pkgName = f.Name.Name
	g.pkg = &ast.Package{
		Name:  g.pkgName,
		Files: map[string]*ast.File{filename: f},
	}

	// Configure type checker
	conf := types.Config{Importer: importer.Default()}
	g.typesInfo = &types.Info{
		Types: make(map[ast.Expr]types.TypeAndValue),
	}
	if _, err := conf.Check(f.Name.Name, g.fset, []*ast.File{f}, g.typesInfo); err != nil {
		log.Printf("warning: type check failed: %v", err)
	}

	// Extract structs
	g.extractStructs(f)

	return nil
}

// extractStructs extracts structs with //benc:generate comment and their dependencies.
func (g *Generator) extractStructs(f *ast.File) {
	// First pass: find structs with //benc:generate comment
	var mainStructs []string
	for _, decl := range f.Decls {
		if genDecl, ok := decl.(*ast.GenDecl); ok && genDecl.Tok == token.TYPE {
			hasGenerateComment := false
			if genDecl.Doc != nil {
				for _, comment := range genDecl.Doc.List {
					if strings.Contains(comment.Text, "//benc:generate") {
						hasGenerateComment = true
						break
					}
				}
			}

			if hasGenerateComment {
				for _, spec := range genDecl.Specs {
					if typeSpec, ok := spec.(*ast.TypeSpec); ok {
						mainStructs = append(mainStructs, typeSpec.Name.Name)
					}
				}
			}
		}
	}

	// Process main structs and their dependencies recursively
	for _, name := range mainStructs {
		g.findAndProcessStruct(name, f)
	}
}

func (g *Generator) findAndProcessStruct(structName string, f *ast.File) {
	if _, exists := g.structs[structName]; exists {
		return // Already processed
	}

	for _, decl := range f.Decls {
		if genDecl, ok := decl.(*ast.GenDecl); ok && genDecl.Tok == token.TYPE {
			for _, spec := range genDecl.Specs {
				if typeSpec, ok := spec.(*ast.TypeSpec); ok && typeSpec.Name.Name == structName {
					if structType, ok := typeSpec.Type.(*ast.StructType); ok {
						info := g.processStruct(typeSpec.Name.Name, structType)
						// Now find dependencies of this struct and process them
						for _, field := range info.Fields {
							if field.Type.IsIgnored {
								continue
							}
							underlyingType := strings.TrimPrefix(field.Type.Name, "[]")
							underlyingType = strings.TrimPrefix(underlyingType, "*")
							if field.Type.IsStruct && !g.isBuiltInType(underlyingType) && !strings.HasPrefix(underlyingType, "time.") {
								g.findAndProcessStruct(underlyingType, f)
							}
						}
					}
					return
				}
			}
		}
	}
}

func toCamelCase(s string) string {
	if s == "" {
		return ""
	}
	return strings.ToLower(s[:1]) + s[1:]
}

// processStruct processes a struct type.
func (g *Generator) processStruct(name string, st *ast.StructType) *StructInfo {
	if s, ok := g.structs[name]; ok {
		return s
	}

	var fields []FieldInfo
	for _, field := range st.Fields.List {
		if len(field.Names) == 0 {
			continue
		}
		fName := field.Names[0].Name
		tInfo := g.analyzeType(field.Type)
		if tInfo.IsIgnored {
			continue
		}
		fields = append(fields, FieldInfo{Name: fName, Type: tInfo})
	}

	info := &StructInfo{
		Name:     name,
		Receiver: toCamelCase(name),
		Fields:   fields,
	}
	g.structs[name] = info
	return info
}

// analyzeType analyzes a type expression to TypeInfo.
func (g *Generator) analyzeType(expr ast.Expr) TypeInfo {
	tInfo := TypeInfo{}

	switch e := expr.(type) {
	case *ast.Ident:
		tInfo.Name = e.Name
		switch tInfo.Name {
		case "any", "interface{}":
			tInfo.IsIgnored = true
		case "string", "int64", "int32", "int16", "int8", "uint64", "uint32", "uint16", "uint8", "byte", "bool", "float64", "float32":
			// basic types
		default:
			tInfo.IsStruct = true
		}
	case *ast.StarExpr:
		tInfo.IsPointer = true
		sub := g.analyzeType(e.X)
		if sub.IsIgnored {
			tInfo.IsIgnored = true
			return tInfo
		}
		tInfo.Name = "*" + sub.Name
		tInfo.IsSlice = sub.IsSlice
		tInfo.IsStruct = sub.IsStruct
		tInfo.IsTime = sub.IsTime
		tInfo.IsByteSlice = sub.IsByteSlice
	case *ast.ArrayType:
		tInfo.IsSlice = true
		sub := g.analyzeType(e.Elt)
		if sub.IsIgnored {
			tInfo.IsIgnored = true
			return tInfo
		}
		tInfo.Name = "[]" + sub.Name
		tInfo.IsStruct = sub.IsStruct
		tInfo.SliceElementIsPointer = sub.IsPointer
		if sub.Name == "byte" || sub.Name == "uint8" {
			tInfo.IsByteSlice = true
			tInfo.Name = "[]byte"
			tInfo.IsSlice = false
		}
	case *ast.MapType:
		tInfo.IsMap = true
		key := g.analyzeType(e.Key)
		value := g.analyzeType(e.Value)
		if key.IsIgnored || value.IsIgnored {
			tInfo.IsIgnored = true
			return tInfo
		}
		tInfo.KeyType = key.Name
		tInfo.ValueType = value.Name
		tInfo.Name = fmt.Sprintf("map[%s]%s", key.Name, value.Name)
	case *ast.SelectorExpr:
		if ident, ok := e.X.(*ast.Ident); ok && ident.Name == "time" {
			if e.Sel.Name == "Time" {
				tInfo.Name = "time.Time"
				tInfo.IsTime = true
			}
		}
	default:
		tInfo.IsIgnored = true
	}
	return tInfo
}

// isBuiltInType checks if type is built-in.
func (g *Generator) isBuiltInType(name string) bool {
	builtIns := map[string]bool{
		"string": true, "int": true, "int8": true, "int16": true, "int32": true, "int64": true,
		"uint": true, "uint8": true, "uint16": true, "uint32": true, "uint64": true,
		"byte": true, "rune": true, "float32": true, "float64": true, "bool": true,
	}
	return builtIns[name]
}

// getBasicFuncs returns a struct with size, marshal, and unmarshal function names for a type.
func (g *Generator) getBasicFuncs(typ string) BencFuncs {
	switch typ {
	case "int64":
		return BencFuncs{"SizeInt64", "MarshalInt64", "UnmarshalInt64"}
	case "int32":
		return BencFuncs{"SizeInt32", "MarshalInt32", "UnmarshalInt32"}
	case "int16":
		return BencFuncs{"SizeInt16", "MarshalInt16", "UnmarshalInt16"}
	case "int8":
		return BencFuncs{"SizeInt8", "MarshalInt8", "UnmarshalInt8"}
	case "uint64":
		return BencFuncs{"SizeUint64", "MarshalUint64", "UnmarshalUint64"}
	case "uint32":
		return BencFuncs{"SizeUint32", "MarshalUint32", "UnmarshalUint32"}
	case "uint16":
		return BencFuncs{"SizeUint16", "MarshalUint16", "UnmarshalUint16"}
	case "uint8", "byte":
		return BencFuncs{"SizeByte", "MarshalByte", "UnmarshalByte"}
	case "string":
		return BencFuncs{"SizeString", "MarshalString", "UnmarshalString"}
	case "bool":
		return BencFuncs{"SizeBool", "MarshalBool", "UnmarshalBool"}
	case "time.Time":
		return BencFuncs{"SizeTime", "MarshalTime", "UnmarshalTime"}
	case "[]byte":
		return BencFuncs{"SizeBytes", "MarshalBytes", "UnmarshalBytesCropped"}
	default:
		return BencFuncs{}
	}
}

// GetRandomValue generates random value code for a type (exported for template use)
func (g *Generator) GetRandomValue(f FieldInfo) string {
	switch f.Type.Name {
	case "int64":
		return "random.Int63()"
	case "int8":
		return "int8(random.Intn(256) - 128)"
	case "int16":
		return "int16(random.Intn(65536) - 32768)"
	case "int32":
		return "random.Int31()"
	case "uint64":
		return "random.Uint64()"
	case "uint32":
		return "random.Uint32()"
	case "uint16":
		return "uint16(random.Intn(65536))"
	case "uint8", "byte":
		return "uint8(random.Intn(256))"
	case "string":
		return "btst.RandomString(random, 5+random.Intn(15))"
	case "[]byte":
		return "btst.RandomBytes(random, 3+random.Intn(7))"
	case "[]int64":
		return "[]int64{\n\t\t\trandom.Int63(),\n\t\t\trandom.Int63(),\n\t\t}"
	case "time.Time":
		return "btst.RandomTime(random)"
	case "map[string]int32":
		return "map[string]int32{\n\t\t\tbtst.RandomString(random, 4+random.Intn(6)): random.Int31(),\n\t\t\tbtst.RandomString(random, 4+random.Intn(6)): random.Int31(),\n\t\t}"
	case "map[string]string":
		return "map[string]string{\n\t\t\tbtst.RandomString(random, 3+random.Intn(5)): btst.RandomString(random, 5+random.Intn(10)),\n\t\t}"
	case "map[string]*time.Time":
		return "map[string]*time.Time{\n\t\t\tbtst.RandomString(random, 3+random.Intn(5)): btst.RandomTimePtr(random),\n\t\t}"
	default:
		if f.Type.IsPointer && f.Type.IsSlice && f.Type.IsStruct {
			elem := strings.TrimPrefix(f.Type.Name, "*[]")
			return fmt.Sprintf("&[]%s{\n\t\t\tGenerate%s(),\n\t\t}", elem, elem)
		}
		if f.Type.IsSlice && f.Type.IsStruct {
			if f.Type.SliceElementIsPointer {
				elem := strings.TrimPrefix(f.Type.Name, "[]*")
				// FIX 1: Call the new Generate<StructName>Ptr() helper function.
				// This avoids the "cannot take address of function call" compile error.
				return fmt.Sprintf("[]*%s{\n\t\t\tGenerate%sPtr(),\n\t\t}", elem, elem)
			}
			elem := strings.TrimPrefix(f.Type.Name, "[]")
			return fmt.Sprintf("[]%s{\n\t\t\tGenerate%s(),\n\t\t\tGenerate%s(),\n\t\t}", elem, elem, elem)
		}
		if f.Type.Name == "[][]byte" {
			return "[][]byte{\n\t\t\tbtst.RandomBytes(random, 3+random.Intn(7)),\n\t\t\tbtst.RandomBytes(random, 3+random.Intn(7)),\n\t\t}"
		}
		if f.Type.IsPointer && f.Type.IsStruct {
			elem := strings.TrimPrefix(f.Type.Name, "*")
			return fmt.Sprintf("&Generate%s()", elem)
		}
		if f.Type.IsStruct && !f.Type.IsTime {
			return fmt.Sprintf("Generate%s()", f.Type.Name)
		}
		return "nil"
	}
}

// GetCompareCode generates comparison code for a field (exported for template use)
func (g *Generator) GetCompareCode(f FieldInfo, aVar, bVar string) string {
	aField := fmt.Sprintf("%s.%s", aVar, f.Name)
	bField := fmt.Sprintf("%s.%s", bVar, f.Name)

	switch {
	case f.Type.IsTime:
		return fmt.Sprintf(`if !%s.Equal(%s) {
		return fmt.Errorf("%s mismatch: %%v != %%v", %s, %s)
	}`, aField, bField, f.Name, aField, bField)
	case f.Type.IsByteSlice:
		return fmt.Sprintf(`if !btst.BytesEqual(%s, %s) {
		return errors.New("%s mismatch")
	}`, aField, bField, f.Name)
	case f.Type.IsPointer && f.Type.IsSlice:
		elem := strings.TrimPrefix(f.Type.Name, "*[]")
		return fmt.Sprintf(`if (%s == nil) != (%s == nil) {
		return errors.New("%s nil mismatch")
	}
	if %s != nil {
		if len(*%s) != len(*%s) {
			return fmt.Errorf("%s length mismatch: %%d != %%d", len(*%s), len(*%s))
		}
		for i := range *%s {
			if err := compare%s((*%s)[i], (*%s)[i]); err != nil {
				return fmt.Errorf("%s[%%d]: %%w", i, err)
			}
		}
	}`, aField, bField, f.Name, aField, aField, bField, f.Name, aField, bField, aField, elem, aField, bField, f.Name)
	case f.Type.Name == "[][]byte":
		return fmt.Sprintf(`if len(%s) != len(%s) {
		return fmt.Errorf("%s length mismatch: %%d != %%d", len(%s), len(%s))
	}
	for i := range %s {
		if !btst.BytesEqual(%s[i], %s[i]) {
			return fmt.Errorf("%s[%%d] mismatch", i)
		}
	}`, aField, bField, f.Name, aField, bField, aField, aField, bField, f.Name)
	case f.Type.IsSlice:
		elem := strings.TrimPrefix(f.Type.Name, "[]")
		compareFunc := "compare" + strings.TrimPrefix(elem, "*")
		if f.Type.SliceElementIsPointer {
			compareFunc += "Ptr"
		}
		var comparison string
		if f.Type.IsStruct {
			comparison = fmt.Sprintf(`if err := %s(%s[i], %s[i]); err != nil {
				return fmt.Errorf("%s[%%d]: %%w", i, err)
			}`, compareFunc, aField, bField, f.Name)
		} else { // slice of basic types
			comparison = fmt.Sprintf(`if %s[i] != %s[i] {
				return fmt.Errorf("%s[%%d] mismatch: %%v != %%v", i, %s[i], %s[i])
			}`, aField, bField, f.Name, aField, bField)
		}

		return fmt.Sprintf(`if len(%s) != len(%s) {
		return fmt.Errorf("%s length mismatch: %%d != %%d", len(%s), len(%s))
	}
	for i := range %s {
		%s
	}`, aField, bField, f.Name, aField, bField, aField, comparison)
	case f.Type.IsMap:
		valCompare := ""
		if f.Type.ValueType == "*time.Time" {
			valCompare = fmt.Sprintf(`t2, exists := %s[k]
		if !exists { return fmt.Errorf("%s key %%s missing in b", k) }
		if (v1 == nil) != (t2 == nil) { return fmt.Errorf("%s[%%s] nil mismatch", k) }
		if v1 != nil && !v1.Equal(*t2) { return fmt.Errorf("%s[%%s] value mismatch: %%v != %%v", k, *v1, *t2) }`, bField, f.Name, f.Name, f.Name)
		} else if g.isBuiltInType(f.Type.ValueType) {
			valCompare = fmt.Sprintf(`if v2, exists := %s[k]; !exists {
			return fmt.Errorf("%s key %%s missing in b", k)
		} else if v1 != v2 {
			return fmt.Errorf("%s[%%s] value mismatch: %%v != %%v", k, v1, v2)
		}`, bField, f.Name, f.Name)
		} else { // Assume map of structs
			valCompare = fmt.Sprintf(`if v2, exists := %s[k]; !exists {
			return fmt.Errorf("%s key %%s missing in b", k)
		} else if err := compare%s(v1, v2); err != nil {
			return fmt.Errorf("%s[%%s]: %%w", k, err)
		}`, bField, f.Name, f.Type.ValueType, f.Name)
		}
		return fmt.Sprintf(`if len(%s) != len(%s) {
		return fmt.Errorf("%s length mismatch: %%d != %%d", len(%s), len(%s))
	}
	for k, v1 := range %s {
		%s
	}`, aField, bField, f.Name, aField, bField, aField, valCompare)

	case f.Type.IsPointer && f.Type.IsStruct:
		elem := strings.TrimPrefix(f.Type.Name, "*")
		return fmt.Sprintf(`if err := compare%sPtr(%s, %s); err != nil {
		return fmt.Errorf("%s: %%w", err)
	}`, elem, aField, bField, f.Name)
	case f.Type.IsStruct && !f.Type.IsTime:
		return fmt.Sprintf(`if err := compare%s(%s, %s); err != nil {
		return fmt.Errorf("%s: %%w", err)
	}`, f.Type.Name, aField, bField, f.Name)
	default: // Basic types
		format := "%v"
		if f.Type.Name == "string" {
			format = "%s"
		}
		return fmt.Sprintf(`if %s != %s {
		return fmt.Errorf("%s mismatch: %s != %s", %s, %s)
	}`, aField, bField, f.Name, format, format, aField, bField)
	}
}

// generateBencFile generates the benc.go file using a template.
func (g *Generator) generateBencFile() error {
	const bencTemplate = `// Code generated by benc generator; DO NOT EDIT.

package {{.PkgName}}

import (
	"time"
	bstd "github.com/banditmoscow1337/benc/std"
)
{{range $struct := .Structs}}
func ({{$struct.Receiver}} *{{$struct.Name}}) SizePlain() (s int) {
{{- range $field := $struct.Fields}}
	{{- $fieldName := print $struct.Receiver "." $field.Name }}
	{{- if and $field.Type.IsPointer $field.Type.IsSlice $field.Type.IsStruct }}
	s += bstd.SizePointer({{ $fieldName }}, func(v []{{cleanStructType $field.Type.Name}}) int { return bstd.SizeSlice(v, func(s {{cleanStructType $field.Type.Name}}) int { return s.SizePlain() }) })
	{{- else if and $field.Type.IsSlice $field.Type.SliceElementIsPointer $field.Type.IsStruct }}
	s += bstd.SizeSlice({{ $fieldName }}, func(v *{{cleanStructType $field.Type.Name}}) int { return bstd.SizePointer(v, func(v {{cleanStructType $field.Type.Name}}) int { return v.SizePlain() }) })
	{{- else if and $field.Type.IsSlice $field.Type.IsStruct }}
	s += bstd.SizeSlice({{ $fieldName }}, func(s {{cleanStructType $field.Type.Name}}) int { return s.SizePlain() })
	{{- else if eq $field.Type.Name "[]int64" }}
	s += bstd.SizeFixedSlice({{ $fieldName }}, bstd.SizeInt64())
	{{- else if eq $field.Type.Name "[][]byte" }}
	s += bstd.SizeSlice({{ $fieldName }}, bstd.SizeBytes)
	{{- else if $field.Type.IsMap }}
		{{- if eq $field.Type.ValueType "*time.Time" }}
	s += bstd.SizeMap({{ $fieldName }}, bstd.SizeString, func(v *time.Time) int { return bstd.SizePointer(v, func(_ time.Time) int { return bstd.SizeTime() }) })
		{{- else }}
	s += bstd.SizeMap({{ $fieldName }}, bstd.{{($field.Type.KeyType | getBasicFuncs).Size}}, bstd.{{($field.Type.ValueType | getBasicFuncs).Size}})
		{{- end }}
	{{- else if and $field.Type.IsPointer $field.Type.IsStruct }}
	s += bstd.SizePointer({{ $fieldName }}, func(v {{cleanStructType $field.Type.Name}}) int { return v.SizePlain() })
	{{- else if $field.Type.IsStruct }}
	s += {{ $fieldName }}.SizePlain()
	{{- else if ($field.Type.Name | getBasicFuncs).Size | isFixedSize }}
	s += bstd.{{($field.Type.Name | getBasicFuncs).Size}}()
	{{- else }}
	s += bstd.{{($field.Type.Name | getBasicFuncs).Size}}({{ $fieldName }})
	{{- end}}
{{end}}
	return
}

func ({{$struct.Receiver}} *{{$struct.Name}}) MarshalPlain(tn int, b []byte) (n int) {
	n = tn
{{- range $field := $struct.Fields}}
	{{- $fieldName := print $struct.Receiver "." $field.Name }}
	{{- if and $field.Type.IsPointer $field.Type.IsSlice $field.Type.IsStruct }}
	n = bstd.MarshalPointer(n, b, {{ $fieldName }}, func(n int, b []byte, v []{{cleanStructType $field.Type.Name}}) int { return bstd.MarshalSlice(n, b, v, func(n int, b []byte, s {{cleanStructType $field.Type.Name}}) int { return s.MarshalPlain(n, b) }) })
	{{- else if and $field.Type.IsSlice $field.Type.SliceElementIsPointer $field.Type.IsStruct }}
	n = bstd.MarshalSlice(n, b, {{ $fieldName }}, func(n int, b []byte, v *{{cleanStructType $field.Type.Name}}) int { return bstd.MarshalPointer(n, b, v, func(n int, b []byte, v {{cleanStructType $field.Type.Name}}) int { return v.MarshalPlain(n, b) }) })
	{{- else if and $field.Type.IsSlice $field.Type.IsStruct }}
	n = bstd.MarshalSlice(n, b, {{ $fieldName }}, func(n int, b []byte, s {{cleanStructType $field.Type.Name}}) int { return s.MarshalPlain(n, b) })
	{{- else if eq $field.Type.Name "[][]byte" }}
	n = bstd.MarshalSlice(n, b, {{ $fieldName }}, bstd.MarshalBytes)
	{{- else if $field.Type.IsSlice }}
	n = bstd.MarshalSlice(n, b, {{ $fieldName }}, bstd.{{((sliceElementType $field.Type.Name) | getBasicFuncs).Marshal}})
	{{- else if $field.Type.IsMap }}
		{{- if eq $field.Type.ValueType "*time.Time" }}
	n = bstd.MarshalMap(n, b, {{ $fieldName }}, bstd.MarshalString, func(n int, b []byte, v *time.Time) int { return bstd.MarshalPointer(n, b, v, bstd.MarshalTime) })
		{{- else }}
	n = bstd.MarshalMap(n, b, {{ $fieldName }}, bstd.{{($field.Type.KeyType | getBasicFuncs).Marshal}}, bstd.{{($field.Type.ValueType | getBasicFuncs).Marshal}})
		{{- end }}
	{{- else if and $field.Type.IsPointer $field.Type.IsStruct }}
	n = bstd.MarshalPointer(n, b, {{ $fieldName }}, func(n int, b []byte, v {{cleanStructType $field.Type.Name}}) int { return v.MarshalPlain(n, b) })
	{{- else if $field.Type.IsStruct }}
	n = {{ $fieldName }}.MarshalPlain(n, b)
	{{- else }}
	n = bstd.{{($field.Type.Name | getBasicFuncs).Marshal}}(n, b, {{ $fieldName }})
	{{- end}}
{{end}}
	return n
}

func ({{$struct.Receiver}} *{{$struct.Name}}) UnmarshalPlain(tn int, b []byte) (n int, err error) {
	n = tn
{{- range $field := $struct.Fields}}
	{{- if and .Type.IsPointer .Type.IsSlice .Type.IsStruct }}
	if n, {{$struct.Receiver}}.{{$field.Name}}, err = bstd.UnmarshalPointer[[]{{cleanStructType .Type.Name}}](n, b, func(n int, b []byte) (int, []{{cleanStructType .Type.Name}}, error) { return bstd.UnmarshalSlice[{{cleanStructType .Type.Name}}](n, b, func(n int, b []byte, s *{{cleanStructType .Type.Name}}) (int, error) { return s.UnmarshalPlain(n, b) }) }); err != nil { return }
	{{- else if and .Type.IsSlice .Type.SliceElementIsPointer .Type.IsStruct }}
	if n, {{$struct.Receiver}}.{{$field.Name}}, err = bstd.UnmarshalSlice[*{{cleanStructType .Type.Name}}](n, b, func(n int, b []byte) (int, *{{cleanStructType .Type.Name}}, error) { return bstd.UnmarshalPointer[{{cleanStructType .Type.Name}}](n, b, func(n int, b []byte, s *{{cleanStructType .Type.Name}}) (int, error) { return s.UnmarshalPlain(n, b) }) }); err != nil { return }
	{{- else if and .Type.IsSlice .Type.IsStruct }}
	if n, {{$struct.Receiver}}.{{$field.Name}}, err = bstd.UnmarshalSlice[{{cleanStructType .Type.Name}}](n, b, func(n int, b []byte, s *{{cleanStructType .Type.Name}}) (int, error) { return s.UnmarshalPlain(n, b) }); err != nil { return }
	{{- else if eq .Type.Name "[][]byte" }}
	if n, {{$struct.Receiver}}.{{$field.Name}}, err = bstd.UnmarshalSlice[[]byte](n, b, bstd.UnmarshalBytesCropped); err != nil { return }
	{{- else if .Type.IsSlice }}
	if n, {{$struct.Receiver}}.{{$field.Name}}, err = bstd.UnmarshalSlice[{{sliceElementType .Type.Name}}](n, b, bstd.{{((sliceElementType .Type.Name) | getBasicFuncs).Unmarshal}}); err != nil { return }
	{{- else if .Type.IsMap }}
		{{- if eq .Type.ValueType "*time.Time" }}
	if n, {{$struct.Receiver}}.{{$field.Name}}, err = bstd.UnmarshalMap[string, *time.Time](n, b, bstd.UnmarshalString, func(n int, b []byte) (int, *time.Time, error) { return bstd.UnmarshalPointer[time.Time](n, b, bstd.UnmarshalTime) }); err != nil { return }
		{{- else }}
	if n, {{$struct.Receiver}}.{{$field.Name}}, err = bstd.UnmarshalMap[{{.Type.KeyType}}, {{.Type.ValueType}}](n, b, bstd.{{(.Type.KeyType | getBasicFuncs).Unmarshal}}, bstd.{{(.Type.ValueType | getBasicFuncs).Unmarshal}}); err != nil { return }
		{{- end }}
	{{- else if and .Type.IsPointer .Type.IsStruct }}
	if n, {{$struct.Receiver}}.{{$field.Name}}, err = bstd.UnmarshalPointer[{{cleanStructType .Type.Name}}](n, b, func(n int, b []byte, s *{{cleanStructType .Type.Name}}) (int, error) { return s.UnmarshalPlain(n, b) }); err != nil { return }
	{{- else if .Type.IsStruct }}
	if n, err = {{$struct.Receiver}}.{{$field.Name}}.UnmarshalPlain(n, b); err != nil { return }
	{{- else }}
	if n, {{$struct.Receiver}}.{{$field.Name}}, err = bstd.{{(.Type.Name | getBasicFuncs).Unmarshal}}(n, b); err != nil { return }
	{{- end}}
{{end}}
	return
}
{{end}}`

	funcMap := template.FuncMap{
		"sliceElementType": func(s string) string { return strings.TrimPrefix(s, "[]") },
		"cleanStructType": func(s string) string {
			s = strings.TrimPrefix(s, "*")
			s = strings.TrimPrefix(s, "[]")
			s = strings.TrimPrefix(s, "*")
			return s
		},
		"getBasicFuncs": g.getBasicFuncs,
		"isFixedSize": func(s string) bool {
			return s == "SizeInt64" || s == "SizeInt32" || s == "SizeInt16" || s == "SizeInt8" ||
				s == "SizeUint64" || s == "SizeUint32" || s == "SizeUint16" || s == "SizeByte" ||
				s == "SizeTime" || s == "SizeBool"
		},
	}

	var buf bytes.Buffer
	tmpl, err := template.New("benc").Funcs(funcMap).Parse(bencTemplate)
	if err != nil {
		return fmt.Errorf("parsing benc template: %w", err)
	}

	data := struct {
		PkgName string
		Structs []*StructInfo
	}{
		PkgName: g.pkgName,
		Structs: make([]*StructInfo, 0, len(g.structs)),
	}

	// Ensure a consistent order for generated code
	var structNames []string
	for name := range g.structs {
		structNames = append(structNames, name)
	}
	// Sort to make output deterministic, though not strictly necessary
	// sort.Strings(structNames)
	// For now, simple append is fine.
	for _, name := range structNames {
		data.Structs = append(data.Structs, g.structs[name])
	}

	if err := tmpl.Execute(&buf, data); err != nil {
		return fmt.Errorf("executing benc template: %w", err)
	}

	filename := filepath.Join(g.outputDir, g.inputFileBaseName+"_benc.go")
	return os.WriteFile(filename, buf.Bytes(), 0644)
}

// generateTestFile generates the test file using a template.
func (g *Generator) generateTestFile() error {
	// FIX 2: Add the new Generate<StructName>Ptr helper function to the template.
	const testTemplate = `package {{.PkgName}}

import (
	"errors"
	"fmt"
	"math/rand"
	"testing"
	"time"

	btst "github.com/banditmoscow1337/benc/testing"
)
{{$generator := .Generator}}
{{range .Structs}}
// Generate{{.Name}} generates a {{.Name}} structure with random values
func Generate{{.Name}}() {{.Name}} {
	random := rand.New(rand.NewSource(time.Now().UnixNano()))
	return {{.Name}}{
{{- range .Fields}}
		{{.Name}}: {{$generator.GetRandomValue .}},
{{- end}}
	}
}

// compare{{.Name}} compares two {{.Name}} instances and returns detailed errors
func compare{{.Name}}(a, b {{.Name}}) error {
{{- range .Fields}}
	{{$generator.GetCompareCode . "a" "b"}}
{{- end}}
	return nil
}
{{if .NeedsPtrHelpers}}
// compare{{.Name}}Ptr compares two *{{.Name}} instances
func compare{{.Name}}Ptr(a, b *{{.Name}}) error {
	if (a == nil) != (b == nil) {
		return errors.New("{{.Name}} nil pointer mismatch")
	}
	if a != nil {
		return compare{{.Name}}(*a, *b)
	}
	return nil
}

// Generate{{.Name}}Ptr generates a pointer to a random {{.Name}}
func Generate{{.Name}}Ptr() *{{.Name}} {
	v := Generate{{.Name}}()
	return &v
}
{{end}}
{{end}}
func Test{{.MainStruct.Name}}(t *testing.T) {
	original := Generate{{.MainStruct.Name}}()

	s := original.SizePlain()
	buf := make([]byte, s)
	original.MarshalPlain(0, buf)

	var copy {{.MainStruct.Name}}

	if _, err := copy.UnmarshalPlain(0, buf); err != nil {
		t.Fatalf("Unmarshal failed: %v", err)
	}

	if err := compare{{.MainStruct.Name}}(original, copy); err != nil {
		t.Fatalf("Comparison failed: %v", err)
	}
}
`

	var buf bytes.Buffer
	tmpl, err := template.New("test").Funcs(template.FuncMap{}).Parse(testTemplate)
	if err != nil {
		return err
	}

	if len(g.structs) == 0 {
		return fmt.Errorf("no structs with //benc:generate found to generate")
	}

	// Determine which structs need a Ptr comparator
	neededPtrs := make(map[string]bool)
	for _, s := range g.structs {
		for _, f := range s.Fields {
			if f.Type.IsPointer || f.Type.SliceElementIsPointer {
				underlyingType := strings.TrimPrefix(f.Type.Name, "[]")
				underlyingType = strings.TrimPrefix(underlyingType, "*")
				neededPtrs[underlyingType] = true
			}
		}
	}

	// FIX 3: Rename struct field for clarity
	type TestStructInfo struct {
		*StructInfo
		NeedsPtrHelpers bool
	}

	var mainStruct *StructInfo
	structsForTmpl := make([]*TestStructInfo, 0, len(g.structs))

	// Find the first struct that was marked with the generate comment
	// This is a heuristic to pick the "main" struct for the Test function
	for _, s := range g.structs {
		if mainStruct == nil {
			mainStruct = s
		}
		structsForTmpl = append(structsForTmpl, &TestStructInfo{
			StructInfo:      s,
			NeedsPtrHelpers: neededPtrs[s.Name],
		})
	}

	if mainStruct == nil {
		return fmt.Errorf("could not determine a main struct for testing")
	}

	data := struct {
		PkgName    string
		Structs    []*TestStructInfo
		MainStruct *TestStructInfo
		Generator  *Generator
	}{
		PkgName:    g.pkgName,
		Structs:    structsForTmpl,
		MainStruct: &TestStructInfo{StructInfo: mainStruct},
		Generator:  g,
	}

	if err := tmpl.Execute(&buf, data); err != nil {
		return err
	}

	filename := filepath.Join(g.outputDir, g.inputFileBaseName+"_benc_test.go")
	return os.WriteFile(filename, buf.Bytes(), 0644)
}

// Generate generates the files.
func (g *Generator) Generate(inputFile, outputDir string) error {
	g.outputDir = outputDir
	base := filepath.Base(inputFile)
	ext := filepath.Ext(base)
	g.inputFileBaseName = strings.TrimSuffix(base, ext)

	if err := g.ParseFile(inputFile); err != nil {
		return err
	}
	if err := g.generateBencFile(); err != nil {
		return err
	}
	if err := g.generateTestFile(); err != nil {
		return err
	}
	return nil
}

func main() {
	if len(os.Args) < 3 {
		log.Fatal("usage: benc_generator <input.go> <output_dir>")
	}
	input := os.Args[1]
	output := os.Args[2]

	gen := NewGenerator()
	if err := gen.Generate(input, output); err != nil {
		log.Fatal(err)
	}
	fmt.Printf("Generated files in %s\n", output)
}
