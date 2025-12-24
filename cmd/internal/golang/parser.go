package golang

import (
	"go/ast"
	"go/parser"
	"go/token"
	"log"
)

func Parse(inputFile string, pkgName *string, types *[]*ast.TypeSpec) {
	log.Printf("Parsing GO input: %s", inputFile)

	fset := token.NewFileSet()
	node, err := parser.ParseFile(fset, inputFile, nil, parser.ParseComments)
	if err != nil {
		log.Fatalf("failed to parse input file %s: %v", inputFile, err)
	}

	*pkgName = node.Name.Name
	*types = collectTypes(node)
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