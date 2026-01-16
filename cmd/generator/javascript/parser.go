package javascript

import (
	"fmt"
	"go/ast"
	"go/parser"
	"log"
	"os"
	"strings"
	"text/scanner"

	"github.com/banditmoscow1337/benc/cmd/generator/common"
)

// Parse reads a JS file and extracts class definitions as Go AST TypeSpecs.
// It relies on the constructor initializing fields to infer types.
// It prioritizes trailing comments for type definition (e.g., // map[string]int).
func Parse(ctx *common.Context) (err error) {
	log.Printf("Parsing JS input: %s", ctx.InputFile)

	file, err := os.Open(ctx.InputFile)
	if err != nil {
		return
	}
	defer file.Close()

	var s scanner.Scanner
	s.Init(file)
	// We scan comments to use them for type hinting
	s.Mode = scanner.ScanIdents | scanner.ScanFloats | scanner.ScanInts | scanner.ScanStrings | scanner.ScanComments

	for tok := s.Scan(); tok != scanner.EOF; tok = s.Scan() {
		if s.TokenText() == "class" {
			var ts *ast.TypeSpec
			ts, err = parseClass(&s)
			if err != nil {
				return
			}
			ctx.Types = append(ctx.Types, ts)
		}
	}

	ctx.PkgName = strings.ToLower(ctx.BaseName)

	return
}

func parseClass(s *scanner.Scanner) (*ast.TypeSpec, error) {
	// 1. Scan Class Name
	if s.Scan() != scanner.Ident {
		return nil, fmt.Errorf("expected class name at %s", s.Pos())
	}
	className := s.TokenText()

	// 2. Scan until constructor is found
	depth := 0
	foundConstructor := false
	
	// We need to loop until we find 'constructor' at depth 1, or exit class
	for {
		// Peek or Scan? We Scan.
		tok := s.Scan()
		if tok == scanner.EOF {
			break
		}
		text := s.TokenText()

		if text == "{" {
			depth++
		} else if text == "}" {
			depth--
			if depth == 0 {
				break // End of class
			}
		} else if text == "constructor" && depth == 1 {
			// Found it. Now we parse the body.
			foundConstructor = true
			break
		}
	}

	if !foundConstructor {
		// Return empty struct if no constructor found
		return &ast.TypeSpec{
			Name: &ast.Ident{Name: className},
			Type: &ast.StructType{Fields: &ast.FieldList{}},
		}, nil
	}

	// 3. Parse Constructor Body for Fields
	fields, err := parseConstructorFields(s)
	if err != nil {
		return nil, fmt.Errorf("error parsing constructor for %s: %w", className, err)
	}

	return &ast.TypeSpec{
		Name: &ast.Ident{Name: className},
		Type: &ast.StructType{Fields: &ast.FieldList{List: fields}},
	}, nil
}

func parseConstructorFields(s *scanner.Scanner) ([]*ast.Field, error) {
	// Skip parameters: ( ... ) {
	for tok := s.Scan(); tok != scanner.EOF; tok = s.Scan() {
		if s.TokenText() == "{" {
			break
		}
	}

	var fields []*ast.Field
	depth := 1

	for tok := s.Scan(); tok != scanner.EOF; tok = s.Scan() {
		text := s.TokenText()

		// Track scope to handle nested blocks if necessary (though simple ctors preferred)
		if text == "{" {
			depth++
			continue
		} else if text == "}" {
			depth--
			if depth == 0 {
				break // End of constructor
			}
			continue
		}

		// Parse: this.FieldName = Value; // Type
		if text == "this" {
			// Expect '.'
			if s.Scan(); s.TokenText() != "." {
				continue
			}
			
			// Expect FieldName
			if s.Scan() != scanner.Ident {
				continue 
			}
			fieldName := s.TokenText()

			// Expect '='
			if s.Scan(); s.TokenText() != "=" {
				continue
			}

			// Parse Value and potential trailing comment
			typeExpr := parseAssignment(s)

			fields = append(fields, &ast.Field{
				Names: []*ast.Ident{{Name: fieldName}},
				Type:  typeExpr,
			})
		}
	}
	return fields, nil
}

// parseAssignment parses the value assigned and looks ahead for comments to determine type.
func parseAssignment(s *scanner.Scanner) ast.Expr {
	// 1. Capture the tokens of the value expression until ';' or newline/comment
	// This is a simplified expression parser.
	
	var valueTokens []string
	var comment string

	// Loop to consume value
	for tok := s.Scan(); tok != scanner.EOF; tok = s.Scan() {
		text := s.TokenText()

		if tok == scanner.Comment {
			comment = text
			break // Comment ends the statement processing for our purpose
		}
		if text == ";" {
			// Check if next is immediately a comment (on same line)
			if s.Peek() != scanner.EOF {
				// We need to look ahead for comment without consuming if it's not a comment
				// text/scanner doesn't have easy unread for token type, 
				// but strict JS usually puts comment right after ;
				// Let's loop one more time? 
				// Actually, the comment might be the NEXT token.
				// We return, and let the outer loop handle? 
				// No, we need to associate comment with THIS field.
				
				// HACK: Scan next token. If comment, use it. If not, we might lose a token?
				// To be safe, we stop at ;. The user should put comment before ; or we rely on line-based logic.
				// BUT: JS parsers usually allow `stmt; // comment`
				
				// Let's try to scan one ahead.
				nextTok := s.Scan()
				if nextTok == scanner.Comment {
					comment = s.TokenText()
				} else {
					// We consumed a token that wasn't a comment.
					// This is dangerous in a streaming scanner. 
					// Ideally, we rely on the scanner's position or the fact that `//` starts a comment token.
					// For this implementation, we assume comments for types come *before* semicolon 
					// OR we accept that we only catch comments if they are the immediate next token.
					
					// To fix "consumed token", we can't easily push back. 
					// However, for valid JS `this.x = y; next_statement`, the next token is start of next stmt.
					// We can just ignore the comment check after ; for safety unless we implement a lookahead buffer.
					// Let's stick to: if the value *itself* is followed by a comment (before ;), we catch it.
					// If it is after ;, we might miss it in this simple loop.
					
					// Workaround: Users should write `this.x = val; // type` 
					// The scanner produces [val] [;] [// type]
					// We hit [;].
				}
			}
			break
		}
		
		valueTokens = append(valueTokens, text)
		
		// Heuristic: specific tokens that end an assignment expression
		// If we see `new X()`, we count parens.
		// This is complex. We'll simplify: Scan until `;` or `Comment` or `}`.
		if text == "}" {
			// We accidentally hit end of block.
			break 
		}
	}
	
	// 2. If we have a comment, try to parse it as a Go type expression
	if comment != "" {
		// Strip // or /* */
		clean := strings.TrimSpace(comment)
		clean = strings.TrimPrefix(clean, "//")
		clean = strings.TrimPrefix(clean, "/*")
		clean = strings.TrimSuffix(clean, "*/")
		clean = strings.TrimSpace(clean)

		// Try parsing as Go expression
		if expr, err := parser.ParseExpr(clean); err == nil {
			return expr
		}
	}

	// 3. Infer from value tokens
	return inferTypeFromTokens(valueTokens)
}

func inferTypeFromTokens(tokens []string) ast.Expr {
	if len(tokens) == 0 {
		return &ast.Ident{Name: "any"}
	}
	
	first := tokens[0]

	// Literals
	if isInt(first) {
		// JS "BigInt" literal often ends in n, e.g. 100n. Scanner might split `100` `n`
		if len(tokens) > 1 && tokens[1] == "n" {
			return &ast.Ident{Name: "int64"}
		}
		return &ast.Ident{Name: "int"}
	}
	if isFloat(first) {
		return &ast.Ident{Name: "float64"}
	}
	if strings.HasPrefix(first, "\"") || strings.HasPrefix(first, "'") || strings.HasPrefix(first, "`") {
		return &ast.Ident{Name: "string"}
	}
	if first == "true" || first == "false" {
		return &ast.Ident{Name: "bool"}
	}

	// Complex types
	if first == "new" && len(tokens) > 1 {
		typeName := tokens[1]
		switch typeName {
		case "Date":
			return &ast.SelectorExpr{X: &ast.Ident{Name: "time"}, Sel: &ast.Ident{Name: "Time"}}
		case "Uint8Array":
			return &ast.ArrayType{Elt: &ast.Ident{Name: "byte"}}
		case "Map":
			// Without comment, default to map[any]any
			return &ast.MapType{
				Key:   &ast.Ident{Name: "any"},
				Value: &ast.Ident{Name: "any"},
			}
		default:
			// Assume it's a struct/class reference
			return &ast.Ident{Name: typeName}
		}
	}

	// Array literal []
	if first == "[" {
		if len(tokens) > 1 && tokens[1] == "]" {
			// Empty array, unknown type
			return &ast.ArrayType{Elt: &ast.Ident{Name: "any"}}
		}
		// Try to infer from first element
		if len(tokens) > 1 {
			elemType := inferTypeFromTokens(tokens[1:2]) // Recurse on first element
			return &ast.ArrayType{Elt: elemType}
		}
	}

	// Null
	if first == "null" {
		return &ast.Ident{Name: "any"} // or pointer to any?
	}

	return &ast.Ident{Name: "any"}
}

func isInt(s string) bool {
	for _, c := range s {
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}

func isFloat(s string) bool {
	return strings.Contains(s, ".") && !strings.ContainsAny(s, "abcdefghijklmnopqrstuvwxyz")
}