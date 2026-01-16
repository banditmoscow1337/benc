package golang

import (
	"go/ast"
	"go/parser"
	"go/token"
	"log"

	"github.com/banditmoscow1337/benc/cmd/generator/common"
)

func Parse(ctx *common.Context) {
	log.Printf("Parsing GO input: %s", ctx.InputFile)

	fset := token.NewFileSet()
	node, err := parser.ParseFile(fset, ctx.InputFile, nil, parser.ParseComments)
	if err != nil {
		log.Fatalf("failed to parse input file %s: %v", ctx.InputFile, err)
	}

	ctx.PkgName = node.Name.Name
	ctx.Types = collectTypes(node)
}

func collectTypes(node *ast.File) []*ast.TypeSpec {
	var types []*ast.TypeSpec
	ast.Inspect(node, func(n ast.Node) bool {
		ts, ok := n.(*ast.TypeSpec)
		if !ok {
			return true
		}
		switch ts.Type.(type) {
		case *ast.StructType, *ast.MapType:
			types = append(types, ts)
		}
		return false
	})
	return types
}