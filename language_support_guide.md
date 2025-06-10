# Adding Language Support to SIKG

This guide provides comprehensive instructions for extending SIKG to support new programming languages beyond Python. SIKG's modular architecture makes it straightforward to add full semantic analysis capabilities for any programming language.

## Table of Contents

- [Adding Language Support to SIKG](#adding-language-support-to-sikg)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
    - [Current Language Support](#current-language-support)
    - [What Full Support Includes](#what-full-support-includes)
  - [Architecture Understanding](#architecture-understanding)
    - [Parser System Structure](#parser-system-structure)
    - [Key Interfaces](#key-interfaces)
  - [Implementation Steps](#implementation-steps)
    - [Step 1: Create Code Parser](#step-1-create-code-parser)
    - [Step 2: Create Test Parser](#step-2-create-test-parser)
    - [Step 3: Register Parsers](#step-3-register-parsers)
    - [Step 4: Add Language Detection](#step-4-add-language-detection)
  - [AST Integration](#ast-integration)
    - [Python AST Example (Reference)](#python-ast-example-reference)
    - [JavaScript AST Integration](#javascript-ast-integration)
    - [External AST Scripts](#external-ast-scripts)
  - [Configuration Setup](#configuration-setup)
    - [Update Package.json](#update-packagejson)
    - [Language-Specific Settings](#language-specific-settings)
  - [Testing and Validation](#testing-and-validation)
    - [Unit Tests](#unit-tests)

## Overview

### Current Language Support

| Language | Support Level | Code Parser | Test Parser | AST Support | Semantic Analysis |
|----------|---------------|-------------|-------------|-------------|-------------------|
| **Python** | ✅ Full | ✅ | ✅ | ✅ | ✅ |
| **JavaScript** | 🔶 Basic | 🔶 Generic | ⚪ Limited | ⚪ | ⚪ |
| **TypeScript** | 🔶 Basic | 🔶 Generic | ⚪ Limited | ⚪ | ⚪ |
| **Java** | 🔶 Basic | 🔶 Generic | ⚪ Limited | ⚪ | ⚪ |
| **C#** | 🔶 Basic | 🔶 Generic | ⚪ Limited | ⚪ | ⚪ |
| **Go** | 🔶 Basic | 🔶 Generic | ⚪ Limited | ⚪ | ⚪ |

### What Full Support Includes

✅ **Comprehensive Code Parsing**: Functions, classes, methods, imports, inheritance  
✅ **Intelligent Test Detection**: Framework-specific test discovery and mapping  
✅ **AST-Based Analysis**: Precise parsing using language-specific AST libraries  
✅ **Semantic Relationship Extraction**: CALLS, IMPORTS, INHERITS_FROM, TESTS relationships  
✅ **Test-to-Code Mapping**: Automatic detection of which code elements tests cover  
✅ **Framework Integration**: Support for popular testing frameworks  

## Architecture Understanding

### Parser System Structure

```
src/sikg/parser/
├── code/                           # Code parsing system
│   ├── CodeParserFactory.ts        # Factory for code parsers
│   ├── CodeParserBase.ts           # Abstract base class
│   └── language/                   # Language-specific implementations
│       ├── PythonCodeParser.ts     # ✅ Full implementation
│       ├── GenericCodeParser.ts    # 🔶 Fallback parser
│       └── [YourLanguage]Parser.ts # 🎯 Your implementation
├── test/                           # Test parsing system
│   ├── TestParserFactory.ts        # Factory for test parsers
│   ├── TestParserBase.ts           # Abstract base class
│   └── language/                   # Language-specific implementations
│       ├── PythonTestParser.ts     # ✅ Full implementation
│       ├── GenericTestParser.ts    # 🔶 Fallback parser
│       └── [YourLanguage]TestParser.ts # 🎯 Your implementation
└── util/                           # Shared utilities
    ├── ParserUtils.ts              # Common parsing utilities
    ├── AstScripts.ts               # AST processor scripts
    └── AstProcessorManager.ts      # AST execution manager
```

### Key Interfaces

```typescript
// Core data structures you'll work with
interface CodeElement {
    id: string;                    // Unique identifier
    name: string;                  // Element name (function, class, etc.)
    kind: string;                  // Element type (function, class, method, etc.)
    filePath: string;              // Source file path
    signature?: string;            // Function/method signature
    loc: Location;                 // Line/column information
    relations: Relationship[];     // Connections to other elements
}

interface TestCase {
    id: string;                    // Unique test identifier
    name: string;                  // Test name
    testType: 'unit' | 'integration' | 'e2e' | 'unknown';
    filePath: string;              // Test file path
    loc: Location;                 // Line/column information
    coveredElements: Coverage[];   // Code elements this test covers
}

interface Relationship {
    targetId: string;              // Target element ID
    type: string;                  // CALLS, IMPORTS, INHERITS_FROM, etc.
    weight?: number;               // Relationship strength (0-1)
}
```

## Implementation Steps

### Step 1: Create Code Parser

Create a new file `src/sikg/parser/code/language/[Language]CodeParser.ts`:

```typescript
import { CodeElement } from '../../../GraphTypes';
import { Logger } from '../../../../utils/Logger';
import { ParserUtils } from '../../util/ParserUtils';
import { CodeParserBase } from '../CodeParserBase';

export class JavaScriptCodeParser extends CodeParserBase {
    /**
     * Return the language identifier
     */
    public getLanguage(): string {
        return 'javascript';
    }

    /**
     * Check if this parser can handle the given file
     */
    public canHandle(filePath: string, content?: string): boolean {
        // Check file extension
        if (ParserUtils.getLanguageFromFilePath(filePath) === 'javascript') {
            return true;
        }

        // Optional: Check content for language-specific patterns
        if (content) {
            return this.detectJavaScriptContent(content);
        }

        return false;
    }

    /**
     * Main parsing method - implement your language-specific logic here
     */
    public async parseCodeFile(content: string, filePath: string): Promise<CodeElement[]> {
        Logger.debug(`Parsing JavaScript file: ${filePath}`);
        
        try {
            // Option 1: Use AST parsing (recommended)
            if (this.isASTAvailable()) {
                return await this.parseWithAST(content, filePath);
            }
            
            // Option 2: Fallback to regex parsing
            return this.parseWithRegex(content, filePath);
            
        } catch (error) {
            return this.handleError(filePath, error);
        }
    }

    /**
     * AST-based parsing (recommended approach)
     */
    private async parseWithAST(content: string, filePath: string): Promise<CodeElement[]> {
        // Implement AST parsing using your language's AST library
        // See AST Integration section for details
        return [];
    }

    /**
     * Regex-based parsing (fallback approach)
     */
    private parseWithRegex(content: string, filePath: string): Promise<CodeElement[]> {
        const elements: CodeElement[] = [];
        const lines = content.split('\n');

        // Parse functions
        this.parseFunctions(lines, filePath, elements);
        
        // Parse classes
        this.parseClasses(lines, filePath, elements);
        
        // Parse imports
        this.parseImports(lines, filePath, elements);

        // Build relationships between elements
        return this.buildRelationships(elements);
    }

    /**
     * Parse function declarations
     */
    private parseFunctions(lines: string[], filePath: string, elements: CodeElement[]): void {
        // JavaScript function patterns
        const functionPatterns = [
            /function\s+(\w+)\s*\(([^)]*)\)/,           // function name() {}
            /const\s+(\w+)\s*=\s*\(([^)]*)\)\s*=>/,     // const name = () => {}
            /(\w+):\s*\(([^)]*)\)\s*=>/,                // name: () => {}
            /(\w+)\s*\(([^)]*)\)\s*{/                   // name() {} (method)
        ];

        lines.forEach((line, index) => {
            functionPatterns.forEach(pattern => {
                const match = line.match(pattern);
                if (match) {
                    const functionName = match[1];
                    const params = match[2] || '';
                    
                    const element: CodeElement = {
                        id: this.generateElementId('function', functionName, filePath),
                        name: functionName,
                        kind: 'function',
                        filePath,
                        signature: `${functionName}(${params})`,
                        loc: {
                            start: { line: index + 1, column: line.indexOf(functionName) },
                            end: { line: index + 1, column: line.indexOf(functionName) + functionName.length }
                        },
                        relations: []
                    };

                    elements.push(element);
                }
            });
        });
    }

    /**
     * Parse class declarations
     */
    private parseClasses(lines: string[], filePath: string, elements: CodeElement[]): void {
        const classPattern = /class\s+(\w+)(?:\s+extends\s+(\w+))?/;

        lines.forEach((line, index) => {
            const match = line.match(classPattern);
            if (match) {
                const className = match[1];
                const superClass = match[2];

                const element: CodeElement = {
                    id: this.generateElementId('class', className, filePath),
                    name: className,
                    kind: 'class',
                    filePath,
                    loc: {
                        start: { line: index + 1, column: line.indexOf(className) },
                        end: { line: index + 1, column: line.indexOf(className) + className.length }
                    },
                    relations: []
                };

                // Add inheritance relationship
                if (superClass) {
                    element.relations.push({
                        targetId: this.generateElementId('class', superClass, filePath),
                        type: 'INHERITS_FROM',
                        weight: 1.0
                    });
                }

                elements.push(element);
            }
        });
    }

    /**
     * Parse import statements
     */
    private parseImports(lines: string[], filePath: string, elements: CodeElement[]): void {
        const importPatterns = [
            /import\s+{([^}]+)}\s+from\s+['"]([^'"]+)['"]/,  // import { a, b } from 'module'
            /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/,      // import default from 'module'
            /const\s+(\w+)\s+=\s+require\(['"]([^'"]+)['"]\)/ // const module = require('module')
        ];

        lines.forEach((line, index) => {
            importPatterns.forEach(pattern => {
                const match = line.match(pattern);
                if (match) {
                    const modulePath = match[match.length - 1]; // Last group is always module path
                    
                    // Create import relationship
                    // This would be added to the appropriate element's relations
                }
            });
        });
    }

    /**
     * Detect if content appears to be JavaScript
     */
    private detectJavaScriptContent(content: string): boolean {
        const jsPatterns = [
            /function\s+\w+\s*\(/,
            /const\s+\w+\s*=/,
            /let\s+\w+\s*=/,
            /var\s+\w+\s*=/,
            /=>\s*{/,
            /console\.log\(/,
            /require\(['"].*['"]\)/,
            /import\s+.*from/
        ];

        return jsPatterns.some(pattern => pattern.test(content));
    }

    /**
     * Check if AST parsing is available
     */
    private isASTAvailable(): boolean {
        // Check if you have AST support available
        return false; // Implement based on your AST integration
    }

    /**
     * Clean up resources
     */
    public dispose(): void {
        // Clean up any resources if needed
    }
}
```

### Step 2: Create Test Parser

Create `src/sikg/parser/test/language/[Language]TestParser.ts`:

```typescript
import { TestCase } from '../../../GraphTypes';
import { Logger } from '../../../../utils/Logger';
import { ParserUtils } from '../../util/ParserUtils';
import { TestParserBase } from '../TestParserBase';
import { CodeParserBase } from '../../code/CodeParserBase';

export class JavaScriptTestParser extends TestParserBase {
    constructor(codeParser: CodeParserBase) {
        super(codeParser);
    }

    /**
     * Return the language identifier
     */
    public getLanguage(): string {
        return 'javascript';
    }

    /**
     * Check if this parser can handle the given file
     */
    public canHandle(filePath: string, content?: string): boolean {
        // Check if it's a JavaScript file and a test file
        return ParserUtils.getLanguageFromFilePath(filePath) === 'javascript' &&
               this.isTestFile(filePath, content);
    }

    /**
     * Parse test file and extract test cases
     */
    public async parseTestFile(content: string, filePath: string): Promise<TestCase[]> {
        Logger.debug(`Parsing JavaScript test file: ${filePath}`);

        try {
            const testCases: TestCase[] = [];

            // Detect test framework
            const framework = this.detectTestFramework(content);
            
            switch (framework) {
                case 'jest':
                    return this.parseJestTests(content, filePath);
                case 'mocha':
                    return this.parseMochaTests(content, filePath);
                default:
                    return this.parseGenericTests(content, filePath);
            }
        } catch (error) {
            return this.handleError(filePath, error);
        }
    }

    /**
     * Detect which test framework is being used
     */
    private detectTestFramework(content: string): string {
        if (content.includes('describe(') && content.includes('it(')) {
            return 'mocha';
        }
        if (content.includes('test(') || content.includes('expect(')) {
            return 'jest';
        }
        return 'generic';
    }

    /**
     * Parse Jest test files
     */
    private parseJestTests(content: string, filePath: string): TestCase[] {
        const testCases: TestCase[] = [];
        const lines = content.split('\n');

        // Jest patterns
        const testPatterns = [
            /test\(['"`]([^'"`]+)['"`],/,      // test('name', ...)
            /it\(['"`]([^'"`]+)['"`],/         // it('name', ...)
        ];

        lines.forEach((line, index) => {
            testPatterns.forEach(pattern => {
                const match = line.match(pattern);
                if (match) {
                    const testName = match[1];
                    
                    const testCase: TestCase = {
                        id: this.generateNodeId(testName, filePath),
                        name: testName,
                        testType: this.detectTestType(line, testName),
                        filePath,
                        loc: {
                            start: { line: index + 1, column: line.indexOf(testName) },
                            end: { line: index + 1, column: line.indexOf(testName) + testName.length }
                        },
                        coveredElements: []
                    };

                    // Find covered code elements
                    this.identifyJavaScriptCoveredCode(content, testCase, filePath);
                    
                    testCases.push(testCase);
                }
            });
        });

        return testCases;
    }

    /**
     * Parse Mocha test files (describe/it pattern)
     */
    private parseMochaTests(content: string, filePath: string): TestCase[] {
        const testCases: TestCase[] = [];
        const lines = content.split('\n');
        const suiteStack: string[] = [];

        lines.forEach((line, index) => {
            // Track describe blocks for context
            const describeMatch = line.match(/describe\(['"`]([^'"`]+)['"`],/);
            if (describeMatch) {
                suiteStack.push(describeMatch[1]);
                return;
            }

            // Find it blocks (actual tests)
            const itMatch = line.match(/it\(['"`]([^'"`]+)['"`],/);
            if (itMatch) {
                const testName = itMatch[1];
                const fullTestName = suiteStack.length > 0 
                    ? `${suiteStack.join(' > ')} > ${testName}`
                    : testName;

                const testCase: TestCase = {
                    id: this.generateNodeId(fullTestName, filePath),
                    name: fullTestName,
                    testType: this.detectTestType(line, testName),
                    filePath,
                    loc: {
                        start: { line: index + 1, column: line.indexOf(testName) },
                        end: { line: index + 1, column: line.indexOf(testName) + testName.length }
                    },
                    coveredElements: []
                };

                this.identifyJavaScriptCoveredCode(content, testCase, filePath);
                testCases.push(testCase);
            }
        });

        return testCases;
    }

    /**
     * Parse generic JavaScript test patterns
     */
    private parseGenericTests(content: string, filePath: string): TestCase[] {
        // Fallback to generic parsing when framework is unknown
        return this.parseGenericTests(content, filePath);
    }

    /**
     * Identify which code elements a JavaScript test covers
     */
    private identifyJavaScriptCoveredCode(content: string, testCase: TestCase, filePath: string): void {
        const coveredIds = new Set<string>();

        // Extract imports to find tested modules
        this.extractImportsAndLinks(content, testCase, coveredIds);

        // Find function calls in test
        this.extractFunctionCalls(content, testCase, coveredIds);

        // Infer tested functions from test name
        this.extractNameBasedInferences(testCase, coveredIds);
    }

    /**
     * Extract imports and link to imported modules
     */
    private extractImportsAndLinks(content: string, testCase: TestCase, coveredIds: Set<string>): void {
        const importPatterns = [
            /import\s+{([^}]+)}\s+from\s+['"]([^'"]+)['"]/g,
            /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g,
            /const\s+{([^}]+)}\s+=\s+require\(['"]([^'"]+)['"]\)/g,
            /const\s+(\w+)\s+=\s+require\(['"]([^'"]+)['"]\)/g
        ];

        importPatterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const modulePath = match[match.length - 1];
                
                // Create module ID and link test to it
                const moduleId = this.generateTargetId(modulePath, 'module');
                if (moduleId && !coveredIds.has(moduleId)) {
                    coveredIds.add(moduleId);
                    testCase.coveredElements.push({
                        targetId: moduleId,
                        weight: 0.8
                    });
                }
            }
        });
    }

    /**
     * Extract function calls in test content
     */
    private extractFunctionCalls(content: string, testCase: TestCase, coveredIds: Set<string>): void {
        // Look for function calls that aren't test framework functions
        const functionCallPattern = /(\w+)\(/g;
        const testFrameworkFunctions = new Set([
            'describe', 'it', 'test', 'expect', 'assert', 'beforeEach', 'afterEach',
            'beforeAll', 'afterAll', 'jest', 'spyOn', 'mock'
        ]);

        let match;
        while ((match = functionCallPattern.exec(content)) !== null) {
            const functionName = match[1];
            
            if (!testFrameworkFunctions.has(functionName)) {
                const functionId = this.generateTargetId(functionName, 'function');
                if (functionId && !coveredIds.has(functionId)) {
                    coveredIds.add(functionId);
                    testCase.coveredElements.push({
                        targetId: functionId,
                        weight: 0.7
                    });
                }
            }
        }
    }

    /**
     * Infer tested functions from test names
     */
    private extractNameBasedInferences(testCase: TestCase, coveredIds: Set<string>): void {
        const testName = testCase.name.toLowerCase();
        
        // Common JavaScript test naming patterns
        const patterns = [
            /should test (\w+)/,
            /(\w+) should/,
            /test (\w+)/,
            /(\w+) test/
        ];

        patterns.forEach(pattern => {
            const match = testName.match(pattern);
            if (match) {
                const inferredFunction = match[1];
                const functionId = this.generateTargetId(inferredFunction, 'function');
                
                if (functionId && !coveredIds.has(functionId)) {
                    coveredIds.add(functionId);
                    testCase.coveredElements.push({
                        targetId: functionId,
                        weight: 0.9 // High confidence for name-based inference
                    });
                }
            }
        });
    }

    /**
     * Generate target ID for covered elements
     */
    private generateTargetId(name: string, kind: string): string | null {
        // This should generate IDs consistent with your code parser
        // For now, return a simple implementation
        return ParserUtils.generateElementId(kind, name, this.getRelatedCodeFile());
    }

    /**
     * Get the likely code file this test is testing
     */
    private getRelatedCodeFile(): string {
        // Heuristic to find the code file this test is testing
        // e.g., test/user.test.js -> src/user.js
        return '';
    }

    /**
     * Clean up resources
     */
    public dispose(): void {
        // Clean up any resources
    }
}
```

### Step 3: Register Parsers

Update the factory classes to register your new parsers:

```typescript
// src/sikg/parser/code/CodeParserFactory.ts
import { JavaScriptCodeParser } from './language/JavaScriptCodeParser';

// In the initialize() method, add:
this.registerParser('javascript', new JavaScriptCodeParser());

// src/sikg/parser/test/TestParserFactory.ts
import { JavaScriptTestParser } from './language/JavaScriptTestParser';

// In the initialize() method, add:
this.registerParser('javascript', new JavaScriptTestParser(
    this.codeParserFactory.getParserForLanguage('javascript')
));
```

### Step 4: Add Language Detection

Update `src/sikg/parser/util/ParserUtils.ts`:

```typescript
// In getLanguageFromFilePath method, update the mapping:
const extensionToLanguage: Record<string, string> = {
    '.py': 'python',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    // ... add your extensions
};

// Add content detection method:
public static detectJavaScriptContent(content: string): boolean {
    const jsPatterns = [
        /function\s+\w+\s*\(/,
        /const\s+\w+\s*=/,
        /=>\s*{/,
        /console\.log\(/,
        /require\(/,
        /import\s+.*from/
    ];
    
    let matchCount = 0;
    for (const pattern of jsPatterns) {
        if (pattern.test(content)) {
            matchCount++;
        }
    }
    
    return matchCount >= 2;
}
```

## AST Integration

For the most accurate parsing, integrate with Abstract Syntax Tree libraries:

### Python AST Example (Reference)

SIKG uses Python's built-in `ast` module via external scripts:

```python
# This is how SIKG integrates with Python AST
import ast
import json

class PythonASTVisitor(ast.NodeVisitor):
    def visit_FunctionDef(self, node):
        # Extract function information
        pass
    
    def visit_ClassDef(self, node):
        # Extract class information
        pass
```

### JavaScript AST Integration

For JavaScript, you could use Babel or Acorn:

```typescript
// Example using @babel/parser (would need to be added as dependency)
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';

private parseWithBabelAST(content: string, filePath: string): CodeElement[] {
    const elements: CodeElement[] = [];
    
    try {
        const ast = parse(content, {
            sourceType: 'module',
            plugins: ['jsx', 'typescript']
        });
        
        traverse(ast, {
            FunctionDeclaration(path) {
                const node = path.node;
                const element: CodeElement = {
                    id: this.generateElementId('function', node.id.name, filePath),
                    name: node.id.name,
                    kind: 'function',
                    filePath,
                    // ... other properties
                    relations: []
                };
                elements.push(element);
            },
            
            ClassDeclaration(path) {
                // Handle class declarations
            },
            
            ImportDeclaration(path) {
                // Handle import statements
            }
        });
        
    } catch (error) {
        Logger.error(`AST parsing failed for ${filePath}:`, error);
        // Fallback to regex parsing
        return this.parseWithRegex(content, filePath);
    }
    
    return elements;
}
```

### External AST Scripts

You can also create external AST processing scripts like SIKG does for Python:

```typescript
// src/sikg/parser/util/AstScripts.ts
public static readonly JAVASCRIPT_AST_PARSER = `
#!/usr/bin/env node
const fs = require('fs');
const babel = require('@babel/parser');
const traverse = require('@babel/traverse').default;

function parseJavaScriptFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const ast = babel.parse(content, {
            sourceType: 'module',
            plugins: ['jsx']
        });
        
        const result = {
            functions: [],
            classes: [],
            imports: []
        };
        
        traverse(ast, {
            FunctionDeclaration(path) {
                result.functions.push({
                    name: path.node.id.name,
                    start_line: path.node.loc.start.line,
                    end_line: path.node.loc.end.line
                });
            }
            // ... other visitors
        });
        
        return result;
    } catch (error) {
        return { error: error.message };
    }
}

// Execute if called directly
if (require.main === module) {
    const result = parseJavaScriptFile(process.argv[2]);
    console.log(JSON.stringify(result));
}
`;
```

## Configuration Setup

### Update Package.json

Add your language to the VS Code extension configuration:

```json
{
  "contributes": {
    "configuration": {
      "properties": {
        "sikg.supportedLanguages": {
          "type": "array",
          "default": ["python", "javascript", "typescript"],
          "description": "Programming languages to analyze"
        },
        "sikg.codeFileExtensions": {
          "type": "array",
          "default": ["py", "js", "jsx", "ts", "tsx"],
          "description": "File extensions for code files"
        },
        "sikg.testFilePatterns": {
          "type": "array",
          "default": [
            "**/test_*.py",
            "**/*_test.py",
            "**/*.test.js",
            "**/*.spec.js",
            "**/__tests__/**/*.js"
          ],
          "description": "Glob patterns for test files"
        }
      }
    }
  }
}
```

### Language-Specific Settings

Add language-specific configuration options:

```json
{
  "sikg.javascript.testFrameworks": {
    "type": "array",
    "default": ["jest", "mocha", "jasmine"],
    "description": "JavaScript testing frameworks to support"
  },
  "sikg.javascript.useAST": {
    "type": "boolean", 
    "default": true,
    "description": "Use AST parsing for JavaScript files"
  }
}
```

## Testing and Validation

### Unit Tests

Create comprehensive tests for your parsers:

```typescript
// test/parser/JavaScriptCodeParser.test.ts
import { JavaScriptCodeParser } from '../../src/sikg/parser/code/language/JavaScriptCodeParser';

describe('JavaScriptCodeParser', () => {
    let parser: JavaScriptCodeParser;

    beforeEach(() => {
        parser = new JavaScriptCodeParser();
    });

    test('should detect JavaScript files', () => {
        expect(parser.canHandle('test.js')).toBe(true);
        expect(parser.canHandle('test.jsx')).toBe(true);
        expect(parser.canHandle('test.py')).toBe(false);
    });

    test('should parse function declarations', async () => {
        const content = `
            function hello(name) {
                return 'Hello ' + name;
            }
            
            const goodbye = (name) => {
                return 'Goodbye ' + name;
            }
        `;
        
        const elements = await parser.parseCodeFile(content, 'test.js');
        
        expect(elements).toHaveLength(2);
        expect(elements[0].name).toBe('hello');
        expect(elements[0].kind).toBe('function');
        expect(elements[1].name).toBe('goodbye');
    });

    test('should parse class declarations', async () => {
        const content = `
            class User extends Person {
                constructor(name) {
                    super(name);
                }
                
                getName() {
                    return this.name;
                }
            }
        `;
        
        const elements = await parser.parseCodeFile(content, 'test.js');
        
        const userClass = elements.find(e => e.name === 'User');
        expect(userClass).toBeDefined();
        expect(userClass.kind).toBe('class');
        
        // Check inheritance relationship
        const inheritanceRelation = userClass.relations.find(r => r.type === 'INHERITS_FROM');
        expect(inheritanceRelation).toBeDefined();
    });
});
```