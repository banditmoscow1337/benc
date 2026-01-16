package common

import (
	"bytes"
	"fmt"
	"go/ast"
	"go/format"
	"go/token"
	"log"
	"os"
	"path/filepath"
	"strings"
)

type Generator interface {
	Generate() error
	Tests() error
}

// FixedSizeTypes is a map of Go types that have a fixed marshalled size.
var FixedSizeTypes = map[string]bool{
	"bool": true, "byte": true, "rune": true, "int8": true, "uint8": true,
	"int16": true, "uint16": true, "int32": true, "uint32": true,
	"int64": true, "uint64": true, "float32": true, "float64": true,
	"time.Time": true,
}

// Context holds the shared state of the generation process (AST info).
type Context struct {
	InputFile, PkgName, BaseName, OutputDir   string
	TypeSpecs map[string]*ast.TypeSpec
	Types []*ast.TypeSpec
}

// NewContext creates a new shared context.
func NewContext(inputFile string) (ctx *Context) {
	ctx =  &Context{
		InputFile: inputFile,
		TypeSpecs: make(map[string]*ast.TypeSpec),
		BaseName: strings.TrimSuffix(filepath.Base(inputFile), filepath.Ext(inputFile)),
		OutputDir: filepath.Dir(inputFile),
	}

	return
}

func (ctx *Context) Type2TypeSpecs() bool {
	if len(ctx.Types) == 0 {
		log.Printf("no structs or classes found in %s", ctx.InputFile)
		return false
	}

	for _, t := range ctx.Types {
		ctx.TypeSpecs[t.Name.Name] = t
	}

	return true
}

// ExprToString converts an AST expression to its string representation.
func (c *Context) ExprToString(expr ast.Expr) string {
	var b bytes.Buffer
	if err := format.Node(&b, token.NewFileSet(), expr); err != nil {
		log.Printf("failed to convert expr to string: %v", err)
		return ""
	}
	return b.String()
}

// ShouldIgnoreField checks if the field has a //benc:ignore comment.
func (c *Context) ShouldIgnoreField(field *ast.Field) bool {
	checkGroup := func(cg *ast.CommentGroup) bool {
		if cg == nil {
			return false
		}
		for _, cm := range cg.List {
			if strings.Contains(cm.Text, "//benc:ignore") {
				return true
			}
		}
		return false
	}
	return checkGroup(field.Doc) || checkGroup(field.Comment)
}

// IsUnsupportedType recursively checks if a type expression contains an ignored type.
func (c *Context) IsUnsupportedType(expr ast.Expr) bool {
	switch t := expr.(type) {
	case *ast.Ident:
		switch t.Name {
		case "any", "complex64", "complex128", "uintptr", "chan", "func", "error":
			return true
		default:
			if ts, ok := c.TypeSpecs[t.Name]; ok {
				return c.IsUnsupportedType(ts.Type)
			}
			return false
		}
	case *ast.FuncType, *ast.ChanType:
		return true
	case *ast.InterfaceType:
		return true
	case *ast.ArrayType:
		return c.IsUnsupportedType(t.Elt)
	case *ast.MapType:
		return c.IsUnsupportedType(t.Key) || c.IsUnsupportedType(t.Value)
	case *ast.StarExpr:
		return c.IsUnsupportedType(t.X)
	case *ast.SelectorExpr:
		sel := c.ExprToString(t)
		if sel == "sync.Mutex" || sel == "sync.RWMutex" || sel == "unsafe.Pointer" {
			return true
		}
		return false
	case *ast.StructType:
		if t.Fields == nil {
			return true
		}
		return len(t.Fields.List) == 0
	default:
		return false
	}
}

// GetSupportedFields filters fields of a struct based on ignore tags and unsupported types.
func (c *Context) GetSupportedFields(ts *ast.TypeSpec) []*ast.Field {
	var supportedFields []*ast.Field
	name := ts.Name.Name
	for _, field := range ts.Type.(*ast.StructType).Fields.List {
		if c.ShouldIgnoreField(field) {
			continue
		}
		if c.IsUnsupportedType(field.Type) {
			for _, fName := range field.Names {
				log.Printf("INFO: Skipping unsupported field %s.%s", name, fName.Name)
			}
			continue
		}
		supportedFields = append(supportedFields, field)
	}
	return supportedFields
}

func (ctx *Context) WriteFile(content *bytes.Buffer, prefix, lang string) error {
	path := filepath.Join(ctx.OutputDir, fmt.Sprintf("%s_"+prefix+"."+lang, ctx.BaseName))
	if err := os.WriteFile(path, content.Bytes(), 0644); err != nil {
		log.Fatalf("failed to write file %s: %v", path, err)
		return err
	}

	content.Reset()

	log.Printf("Successfully generated %s", path)

	return nil
}