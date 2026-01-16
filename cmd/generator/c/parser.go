package c

import (
	"fmt"
	"go/ast"
	"log"
	"os"
	"strings"
	"text/scanner"

	"github.com/banditmoscow1337/benc/cmd/generator/common"
)

// Parse reads a C header file and extracts structs as Go AST TypeSpecs.
// It applies heuristics to detect slices (pointer + _count) and maps (_keys + _values + _count).
func Parse(ctx *common.Context) {
	log.Printf("Parsing C17 input: %s", ctx.InputFile)

	file, err := os.Open(ctx.InputFile)
	if err != nil {
		log.Fatalf("failed to open file %s: %v", ctx.InputFile, err)
	}
	defer file.Close()

	var s scanner.Scanner
	s.Init(file)
	s.Mode = scanner.ScanIdents | scanner.ScanFloats | scanner.ScanInts | scanner.ScanStrings | scanner.ScanComments

	// Simple heuristic: Use the filename as the package/prefix name
	// In C, we don't strictly have packages, but we need one for the context.
	ctx.PkgName = "c_out"

	for tok := s.Scan(); tok != scanner.EOF; tok = s.Scan() {
		if s.TokenText() == "typedef" {
			if s.Scan(); s.TokenText() == "struct" {
				ts, err := parseStruct(&s)
				if err != nil {
					log.Printf("Skipping struct due to error: %v", err)
					continue
				}
				ctx.Types = append(ctx.Types, ts)
			}
		}
	}
}

type cField struct {
	Name    string
	Type    string
	IsPtr   bool
	IsArray bool // double pointer or []
}

func parseStruct(s *scanner.Scanner) (*ast.TypeSpec, error) {
	// Expect {
	if s.Scan(); s.TokenText() != "{" {
		return nil, fmt.Errorf("expected { after struct")
	}

	var rawFields []cField

	// Parse fields until }
	for {
		tok := s.Scan()
		text := s.TokenText()
		if text == "}" {
			break
		}
		if text == "const" { // skip const
			continue
		}
		if tok == scanner.EOF {
			return nil, fmt.Errorf("unexpected EOF in struct")
		}

		// Parse Type (simple: one or two words like 'unsigned int', 'struct X', 'char')
		typeName := text
		if text == "unsigned" || text == "struct" || text == "signed" {
			if s.Scan(); s.TokenText() != "" {
				typeName += " " + s.TokenText()
			}
		}

		// Check for pointers
		ptrs := 0
		s.Scan()
		for s.TokenText() == "*" {
			ptrs++
			s.Scan()
		}

		fieldName := s.TokenText()

		// Check for array brackets [N] (simple ignore or error for now, purely assuming pointer-based arrays)
		// Expect ;
		if s.Scan(); s.TokenText() != ";" {
			// Try to consume until ;
			for s.TokenText() != ";" && s.TokenText() != "}" && s.TokenText() != "" {
				s.Scan()
			}
		}

		rawFields = append(rawFields, cField{
			Name:    fieldName,
			Type:    strings.TrimSpace(typeName),
			IsPtr:   ptrs > 0,
			IsArray: ptrs > 1, // heuristic: char** = array of strings
		})
	}

	// Parse Struct Name (typedef struct { ... } Name;)
	if s.Scan(); s.TokenText() == "" {
		return nil, fmt.Errorf("expected struct name")
	}
	structName := s.TokenText()

	// Convert raw C fields to Go AST fields with Slice/Map reconstruction
	fields := convertFieldsToAST(rawFields)

	return &ast.TypeSpec{
		Name: &ast.Ident{Name: structName},
		Type: &ast.StructType{Fields: &ast.FieldList{List: fields}},
	}, nil
}

func convertFieldsToAST(raw []cField) []*ast.Field {
	var astFields []*ast.Field
	skipIndices := make(map[int]bool)

	for i := 0; i < len(raw); i++ {
		if skipIndices[i] {
			continue
		}
		f := raw[i]

		// 1. Check for Map: field_keys, field_values, field_count
		if i+2 < len(raw) {
			k := raw[i]
			v := raw[i+1]
			c := raw[i+2]
			if strings.HasSuffix(k.Name, "_keys") &&
				strings.HasSuffix(v.Name, "_values") &&
				strings.HasSuffix(c.Name, "_count") {
				
				baseName := strings.TrimSuffix(k.Name, "_keys")
				if v.Name == baseName+"_values" && c.Name == baseName+"_count" {
					// Found a Map
					astFields = append(astFields, &ast.Field{
						Names: []*ast.Ident{{Name: baseName}},
						Type: &ast.MapType{
							Key:   cTypeToGoType(k.Type, k.IsPtr, false), // Keys usually not double ptr
							Value: cTypeToGoType(v.Type, v.IsPtr, v.IsArray),
						},
					})
					skipIndices[i+1] = true
					skipIndices[i+2] = true
					continue
				}
			}
		}

		// 2. Check for Slice: field, field_count
		if i+1 < len(raw) {
			val := raw[i]
			cnt := raw[i+1]
			if strings.HasSuffix(cnt.Name, "_count") && cnt.Name == val.Name+"_count" {
				// Found a Slice
				astFields = append(astFields, &ast.Field{
					Names: []*ast.Ident{{Name: val.Name}},
					Type: &ast.ArrayType{
						Elt: cTypeToGoType(val.Type, false, val.IsArray), // Dereference one level for Elt
					},
				})
				skipIndices[i+1] = true
				continue
			}
		}

		// 3. Regular Field
		astFields = append(astFields, &ast.Field{
			Names: []*ast.Ident{{Name: f.Name}},
			Type:  cTypeToGoType(f.Type, f.IsPtr, f.IsArray),
		})
	}
	return astFields
}

func cTypeToGoType(ctype string, isPtr, isArray bool) ast.Expr {
	// Handle strings (char*)
	if ctype == "char" && isPtr && !isArray {
		return &ast.Ident{Name: "string"}
	}
	
	// Handle primitives
	var goType string
	switch ctype {
	case "int8_t", "char": goType = "int8" // generic char is int8 in Go usually, or byte
	case "uint8_t", "unsigned char": goType = "byte"
	case "int16_t", "short": goType = "int16"
	case "uint16_t", "unsigned short": goType = "uint16"
	case "int32_t", "int": goType = "int32"
	case "uint32_t", "unsigned int": goType = "uint32"
	case "int64_t", "long", "long long": goType = "int64"
	case "uint64_t", "unsigned long", "unsigned long long", "size_t": goType = "uint64"
	case "float": goType = "float32"
	case "double": goType = "float64"
	case "bool", "_Bool": goType = "bool"
	default: goType = ctype // Assumed struct name
	}

	ident := &ast.Ident{Name: goType}

	if isArray {
		return &ast.ArrayType{Elt: ident}
	}
	if isPtr && goType != "string" && !strings.HasPrefix(goType, "func") {
		// If it was a pointer in C but not a string/slice, it's an optional/pointer field
		return &ast.StarExpr{X: ident}
	}

	return ident
}