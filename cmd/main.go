package main

import (
	"flag"
	"log"
	"strings"

	"github.com/banditmoscow1337/benc/cmd/generator/c"
	"github.com/banditmoscow1337/benc/cmd/generator/cpp"
	"github.com/banditmoscow1337/benc/cmd/generator/golang"
	"github.com/banditmoscow1337/benc/cmd/generator/javascript"

	"github.com/banditmoscow1337/benc/cmd/generator/common"
)

func main() {
	langFlag := flag.String("lang", "go", "Comma separated list of languages to generate (go, js, c)")
	flag.Parse()

	args := flag.Args()
	if len(args) < 1 {
		log.Fatal("Usage: go run main.go -lang=go,js,c,cpp <input_file>")
	}

	ctx := common.NewContext(args[0])

	// Detect Input Type
	if strings.HasSuffix(ctx.InputFile, ".js") {
		javascript.Parse(ctx)
	} else if strings.HasSuffix(ctx.InputFile, ".c") || strings.HasSuffix(ctx.InputFile, ".h") {
		c.Parse(ctx)
	} else {
		golang.Parse(ctx)
	}

	if !ctx.Type2TypeSpecs() {
		return
	}

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

		if err :=generator.Tests(); err != nil {
			log.Fatalf("%s generation test failed: %v", lang, err)
		}
	}
}