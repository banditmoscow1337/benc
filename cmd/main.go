package main

import (
	"flag"
	"go/ast"
	"log"
	"path/filepath"
	"strings"

	"github.com/banditmoscow1337/benc/cmd/internal/c"
	"github.com/banditmoscow1337/benc/cmd/internal/cpp"
	"github.com/banditmoscow1337/benc/cmd/internal/golang"
	"github.com/banditmoscow1337/benc/cmd/internal/javascript"

	"github.com/banditmoscow1337/benc/cmd/internal/common"
)

func main() {
	langFlag := flag.String("lang", "go", "Comma separated list of languages to generate (go, js, c)")
	flag.Parse()

	args := flag.Args()
	if len(args) < 1 {
		log.Fatal("Usage: go run main.go -lang=go,js,c,cpp <input_file>")
	}

	inputFile := args[0]
	outputDir := filepath.Dir(inputFile)
	baseName := strings.TrimSuffix(filepath.Base(inputFile), filepath.Ext(inputFile))

	var types []*ast.TypeSpec
	var pkgName string

	// Detect Input Type
	if strings.HasSuffix(inputFile, ".js") {
		javascript.Parse(inputFile, &pkgName, &types)
		pkgName = strings.ToLower(baseName)
	} else if strings.HasSuffix(inputFile, ".c") || strings.HasSuffix(inputFile, ".h") {
		c.Parse(inputFile, &pkgName, &types)
	} else {
		golang.Parse(inputFile,&pkgName,&types)
	}

	if len(types) == 0 {
		log.Printf("no structs or classes found in %s", inputFile)
		return
	}

	ctx := common.NewContext(pkgName, baseName, outputDir, types)

	var generator common.Generator
	
	for lang := range strings.SplitSeq(*langFlag, ",") {
		lang = strings.TrimSpace(lang)
		switch lang {
		case "go":
			generator = golang.New(ctx)
		case "js":
			generator = javascript.New(ctx)
		case "c":
			generator = c.New(ctx)
		case "cpp":
			generator = cpp.New(ctx)
		}

		if err := generator.Generate(); err != nil {
			log.Fatalf("%s generation failed: %v", lang, err)
		}

		generator.Tests()
	}
}