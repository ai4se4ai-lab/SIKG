// CodeParser.ts - Enhanced with Abstract Syntax Tree Processing
// This version uses AST-based parsing for more accurate code analysis

import * as path from 'path';
import * as crypto from 'crypto';
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import { CodeElement } from './GraphTypes';
import { Logger } from '../utils/Logger';

/**
 * Enhanced CodeParser that uses AST-based parsing for more accurate code analysis
 */
export class CodeParser {
    private tempDir: string;

    constructor() {
        // Create a temporary directory for AST processing scripts
        this.tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sikg-ast-'));
        this.initializeAstProcessors();
    }

    /**
     * Initialize AST processor scripts
     */
    private initializeAstProcessors(): void {
        // Write Python AST parser script to temporary directory
        const pythonAstParserPath = path.join(this.tempDir, 'python_ast_parser.py');
        fs.writeFileSync(pythonAstParserPath, this.getPythonAstParserScript());
    }

    /**
     * Parse a code file and extract code elements and relationships
     */
    public async parseCodeFile(content: string, filePath: string): Promise<CodeElement[]> {
        Logger.debug(`Parsing code file: ${filePath}`);
        
        try {
            // Determine the language based on file extension
            const extension = path.extname(filePath).toLowerCase();
            
            switch (extension) {
                case '.py':
                    return this.parsePythonWithAst(content, filePath);
                default:
                    // Fall back to the generic parser for unsupported languages
                    Logger.debug(`Using generic parser for ${extension} file: ${filePath}`);
                    return this.parseGeneric(content, filePath);
            }
        } catch (error) {
            Logger.error(`Error parsing code file ${filePath}:`, error);
            // Fallback to generic parser if AST parsing fails
            Logger.debug(`Falling back to generic parser for ${filePath}`);
            return this.parseGeneric(content, filePath);
        }
    }

    /**
     * Parse Python code using AST-based analysis
     */
    private async parsePythonWithAst(content: string, filePath: string): Promise<CodeElement[]> {
        Logger.debug(`Parsing Python file with AST: ${filePath}`);
        
        try {
            // Write the content to a temporary file for processing
            const tempFilePath = path.join(this.tempDir, `temp_${Date.now()}.py`);
            fs.writeFileSync(tempFilePath, content);
            
            // Execute the Python AST parser on the temporary file
            const pythonAstParserPath = path.join(this.tempDir, 'python_ast_parser.py');
            const command = `python "${pythonAstParserPath}" "${tempFilePath}"`;
            
            Logger.debug(`Executing AST parser command: ${command}`);
            const output = child_process.execSync(command, { encoding: 'utf8' });
            
            // Clean up the temporary file
            fs.unlinkSync(tempFilePath);
            
            // Parse the JSON output from the AST parser
            const astData = JSON.parse(output);
            
            // Convert the AST data to CodeElements
            return this.convertAstToCodeElements(astData, filePath);
        } catch (error) {
            Logger.error(`Error parsing Python file with AST ${filePath}:`, error);
            // Fallback to the regex-based parser
            Logger.debug(`Falling back to regex-based parser for ${filePath}`);
            return this.parsePython(content, filePath);
        }
    }

    /**
     * Convert AST data to CodeElements
     */
    private convertAstToCodeElements(astData: any, filePath: string): CodeElement[] {
        const elements: CodeElement[] = [];
        const idMap = new Map<string, string>();
        
        // Process module
        const moduleId = this.generateElementId('module', path.basename(filePath, '.py'), filePath);
        elements.push({
            id: moduleId,
            name: path.basename(filePath, '.py'),
            kind: 'module',
            filePath,
            loc: {
                start: { line: 1, column: 0 },
                end: { line: astData.end_line, column: 0 }
            },
            relations: []
        });
        
        // Process imports
        for (const importItem of astData.imports) {
            const importedModuleName = importItem.name;
            const importId = this.generateElementId('module', importedModuleName, importedModuleName);
            
            // Add import relationship to the module
            elements[0].relations.push({
                targetId: importId,
                type: 'IMPORTS',
                weight: 0.7
            });
            
            // Store the name to ID mapping for imported names
            for (const name of importItem.imported_names || []) {
                idMap.set(name, this.generateElementId('function', name, importedModuleName));
            }
        }
        
        // Process classes
        for (const classData of astData.classes) {
            const classId = this.generateElementId('class', classData.name, filePath);
            
            // Create the class element
            const classElement: CodeElement = {
                id: classId,
                name: classData.name,
                kind: 'class',
                filePath,
                loc: {
                    start: { line: classData.start_line, column: classData.start_col },
                    end: { line: classData.end_line, column: classData.end_col }
                },
                relations: [
                    // Class belongs to module
                    {
                        targetId: moduleId,
                        type: 'BELONGS_TO',
                        weight: 1.0
                    }
                ]
            };
            
            // Add inheritance relationships
            for (const baseClass of classData.bases) {
                const baseClassId = idMap.get(baseClass) || this.generateElementId('class', baseClass, filePath);
                classElement.relations.push({
                    targetId: baseClassId,
                    type: 'INHERITS_FROM',
                    weight: 1.0
                });
            }
            
            elements.push(classElement);
            
            // Process methods
            for (const methodData of classData.methods) {
                const methodId = this.generateElementId('method', methodData.name, filePath);
                
                // Create the method element
                const methodElement: CodeElement = {
                    id: methodId,
                    name: methodData.name,
                    kind: 'method',
                    filePath,
                    signature: `${methodData.name}(${methodData.params.join(', ')})`,
                    loc: {
                        start: { line: methodData.start_line, column: methodData.start_col },
                        end: { line: methodData.end_line, column: methodData.end_col }
                    },
                    relations: [
                        // Method belongs to class
                        {
                            targetId: classId,
                            type: 'BELONGS_TO',
                            weight: 1.0
                        }
                    ]
                };
                
                // Add method calls
                for (const calledFunc of methodData.calls) {
                    const isMethod = calledFunc.includes('.');
                    let callTargetId: string;
                    
                    if (isMethod) {
                        // This is a method call like obj.method()
                        const [obj, method] = calledFunc.split('.');
                        
                        // Add USES relationship for the object
                        const objId = idMap.get(obj) || this.generateElementId('class', obj, filePath);
                        methodElement.relations.push({
                            targetId: objId,
                            type: 'USES',
                            weight: 0.6
                        });
                        
                        // Add CALLS relationship for the method
                        callTargetId = this.generateElementId('method', method, filePath);
                    } else {
                        // This is a regular function call
                        callTargetId = idMap.get(calledFunc) || this.generateElementId('function', calledFunc, filePath);
                    }
                    
                    methodElement.relations.push({
                        targetId: callTargetId,
                        type: 'CALLS',
                        weight: 0.8
                    });
                }
                
                elements.push(methodElement);
            }
        }
        
        // Process functions
        for (const funcData of astData.functions) {
            const funcId = this.generateElementId('function', funcData.name, filePath);
            
            // Create the function element
            const funcElement: CodeElement = {
                id: funcId,
                name: funcData.name,
                kind: 'function',
                filePath,
                signature: `${funcData.name}(${funcData.params.join(', ')})`,
                loc: {
                    start: { line: funcData.start_line, column: funcData.start_col },
                    end: { line: funcData.end_line, column: funcData.end_col }
                },
                relations: [
                    // Function belongs to module
                    {
                        targetId: moduleId,
                        type: 'BELONGS_TO',
                        weight: 1.0
                    }
                ]
            };
            
            // Add function calls
            for (const calledFunc of funcData.calls) {
                const isMethod = calledFunc.includes('.');
                let callTargetId: string;
                
                if (isMethod) {
                    // This is a method call like obj.method()
                    const [obj, method] = calledFunc.split('.');
                    
                    // Add USES relationship for the object
                    const objId = idMap.get(obj) || this.generateElementId('class', obj, filePath);
                    funcElement.relations.push({
                        targetId: objId,
                        type: 'USES',
                        weight: 0.6
                    });
                    
                    // Add CALLS relationship for the method
                    callTargetId = this.generateElementId('method', method, filePath);
                } else {
                    // This is a regular function call
                    callTargetId = idMap.get(calledFunc) || this.generateElementId('function', calledFunc, filePath);
                }
                
                funcElement.relations.push({
                    targetId: callTargetId,
                    type: 'CALLS',
                    weight: 0.8
                });
            }
            
            elements.push(funcElement);
        }
        
        return elements;
    }

    /**
     * Generate Python AST parser script content
     */
    private getPythonAstParserScript(): string {
        return `#!/usr/bin/env python
import ast
import json
import sys

class AstVisitor(ast.NodeVisitor):
    def __init__(self):
        self.classes = []
        self.functions = []
        self.imports = []
        self.current_class = None
        self.end_line = 0
    
    def visit_ClassDef(self, node):
        class_info = {
            'name': node.name,
            'start_line': node.lineno,
            'start_col': node.col_offset,
            'end_line': self.get_end_line(node),
            'end_col': 0,
            'bases': [self.get_name(base) for base in node.bases],
            'methods': []
        }
        
        old_class = self.current_class
        self.current_class = class_info
        
        # Visit all child nodes
        for child in node.body:
            self.visit(child)
        
        self.current_class = old_class
        
        if old_class is None:
            self.classes.append(class_info)
        self.end_line = max(self.end_line, class_info['end_line'])
    
    def visit_FunctionDef(self, node):
        func_info = {
            'name': node.name,
            'start_line': node.lineno,
            'start_col': node.col_offset,
            'end_line': self.get_end_line(node),
            'end_col': 0,
            'params': self.get_function_params(node),
            'calls': self.extract_function_calls(node)
        }
        
        if self.current_class:
            self.current_class['methods'].append(func_info)
        else:
            self.functions.append(func_info)
        
        self.end_line = max(self.end_line, func_info['end_line'])
    
    def visit_Import(self, node):
        for name in node.names:
            self.imports.append({
                'name': name.name,
                'asname': name.asname,
                'imported_names': []
            })
    
    def visit_ImportFrom(self, node):
        imported_names = [name.name for name in node.names]
        self.imports.append({
            'name': node.module or '',
            'level': node.level,
            'imported_names': imported_names
        })
    
    def get_function_params(self, node):
        params = []
        for arg in node.args.args:
            params.append(arg.arg)
        if node.args.vararg:
            params.append(f"*{node.args.vararg.arg}")
        if node.args.kwarg:
            params.append(f"**{node.args.kwarg.arg}")
        return params
    
    def extract_function_calls(self, node):
        calls = []
        
        for child in ast.walk(node):
            if isinstance(child, ast.Call):
                if isinstance(child.func, ast.Name):
                    # Simple function call: func()
                    calls.append(child.func.id)
                elif isinstance(child.func, ast.Attribute):
                    # Method call: obj.method()
                    if isinstance(child.func.value, ast.Name):
                        calls.append(f"{child.func.value.id}.{child.func.attr}")
        
        return calls
    
    def get_end_line(self, node):
        # Try to get the end line number from the node
        if hasattr(node, 'end_lineno') and node.end_lineno is not None:
            return node.end_lineno
        
        # If end_lineno is not available, find the maximum line number in child nodes
        max_line = node.lineno
        for child in ast.iter_child_nodes(node):
            if hasattr(child, 'lineno'):
                child_end = self.get_end_line(child)
                max_line = max(max_line, child_end)
        
        return max_line
    
    def get_name(self, node):
        if isinstance(node, ast.Name):
            return node.id
        elif isinstance(node, ast.Attribute):
            return f"{self.get_name(node.value)}.{node.attr}"
        return "unknown"

def parse_python_file(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        source = f.read()
    
    try:
        tree = ast.parse(source)
        visitor = AstVisitor()
        visitor.visit(tree)
        
        return {
            'classes': visitor.classes,
            'functions': visitor.functions,
            'imports': visitor.imports,
            'end_line': visitor.end_line or len(source.splitlines())
        }
    except SyntaxError as e:
        return {
            'error': f"Syntax error: {str(e)}",
            'classes': [],
            'functions': [],
            'imports': [],
            'end_line': len(source.splitlines())
        }

if __name__ == '__main__':
    if len(sys.argv) != 2:
        print("Usage: python_ast_parser.py <python_file>")
        sys.exit(1)
    
    result = parse_python_file(sys.argv[1])
    print(json.dumps(result))
`;
    }

    /**
     * Clean up resources used by the parser
     */
    public dispose(): void {
        try {
            // Delete the temporary directory and its contents
            if (fs.existsSync(this.tempDir)) {
                const files = fs.readdirSync(this.tempDir);
                for (const file of files) {
                    fs.unlinkSync(path.join(this.tempDir, file));
                }
                fs.rmdirSync(this.tempDir);
            }
        } catch (error) {
            Logger.error('Error cleaning up CodeParser resources:', error);
        }
    }

    /**
     * Parse Python code (legacy regex-based implementation, used as fallback)
     */
    private parsePython(content: string, filePath: string): CodeElement[] {
        Logger.debug(`Falling back to regex-based parsing for Python file: ${filePath}`);
        const elements: CodeElement[] = [];
        const lines = content.split('\n');
        
        // Track modules/classes to establish parent-child relationships
        const scopeStack: { id: string; name: string; kind: string; startLine: number; indentation: number }[] = [];
        
        try {
            // Pattern for classes
            const classPattern = /^\s*class\s+(\w+)(?:\(([^)]*)\))?:/;
            
            // Pattern for functions/methods
            const functionPattern = /^\s*def\s+(\w+)\s*\(([^)]*)\):/;
            
            // Pattern for imports
            const importPattern = /^\s*(?:from\s+(\S+)\s+)?import\s+(.+)/;
            
            // Process the file line by line
            for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
                const line = lines[lineIndex];
                const indentation = this.getIndentation(line);
                
                // Maintain the class stack based on indentation
                while (scopeStack.length > 0 && scopeStack[scopeStack.length - 1].indentation >= indentation) {
                    scopeStack.pop();
                }
                
                // Check for class declarations
                const classMatch = line.match(classPattern);
                if (classMatch) {
                    const className = classMatch[1];
                    const parentClasses = classMatch[2] ? classMatch[2].split(',').map(c => c.trim()) : [];
                    
                    // Create a unique ID for the class
                    const classId = this.generateElementId('class', className, filePath);
                    
                    // Find the end of the class definition
                    let endLine = lineIndex;
                    const classIndentation = indentation;
                    
                    // Look ahead to find where this class ends based on indentation
                    for (let i = lineIndex + 1; i < lines.length; i++) {
                        const nextLine = lines[i].trim();
                        if (nextLine.length > 0) {
                            const nextIndentation = this.getIndentation(lines[i]);
                            if (nextIndentation <= classIndentation) {
                                endLine = i - 1;
                                break;
                            }
                            
                            // If we reach the end of the file, it's also the end of the class
                            if (i === lines.length - 1) {
                                endLine = i;
                            }
                        }
                    }
                    
                    // Create the class element
                    const classElement: CodeElement = {
                        id: classId,
                        name: className,
                        kind: 'class',
                        filePath,
                        loc: {
                            start: { line: lineIndex + 1, column: line.indexOf('class') },
                            end: { line: endLine + 1, column: 0 }
                        },
                        relations: []
                    };
                    
                    // Add inheritance relationships
                    for (const parentClass of parentClasses) {
                        if (parentClass && parentClass !== 'object') {
                            const parentClassId = this.generateElementId('class', parentClass, filePath);
                            classElement.relations.push({
                                targetId: parentClassId,
                                type: 'INHERITS_FROM',
                                weight: 1.0
                            });
                        }
                    }
                    
                    // Check if this class is within another class or module
                    if (scopeStack.length > 0) {
                        const parentId = scopeStack[scopeStack.length - 1].id;
                        classElement.relations.push({
                            targetId: parentId,
                            type: 'BELONGS_TO',
                            weight: 1.0
                        });
                    }
                    
                    // Add to elements list
                    elements.push(classElement);
                    
                    // Add to scope stack
                    scopeStack.push({
                        id: classId,
                        name: className,
                        kind: 'class',
                        startLine: lineIndex,
                        indentation
                    });
                    
                    continue;
                }
                
                // Check for function/method declarations
                const functionMatch = line.match(functionPattern);
                if (functionMatch) {
                    const functionName = functionMatch[1];
                    const functionParams = functionMatch[2];
                    
                    // Determine if this is a method within a class or a standalone function
                    let kind = 'function';
                    let parentId = null;
                    
                    if (scopeStack.length > 0 && scopeStack[scopeStack.length - 1].kind === 'class') {
                        kind = 'method';
                        parentId = scopeStack[scopeStack.length - 1].id;
                    }
                    
                    // Create a unique ID for the function
                    const functionId = this.generateElementId(kind, functionName, filePath);
                    
                    // Find the end of the function definition
                    let endLine = lineIndex;
                    const functionIndentation = indentation;
                    
                    // Look ahead to find where this function ends based on indentation
                    for (let i = lineIndex + 1; i < lines.length; i++) {
                        const nextLine = lines[i].trim();
                        if (nextLine.length > 0) {
                            const nextIndentation = this.getIndentation(lines[i]);
                            if (nextIndentation <= functionIndentation) {
                                endLine = i - 1;
                                break;
                            }
                            
                            // If we reach the end of the file, it's also the end of the function
                            if (i === lines.length - 1) {
                                endLine = i;
                            }
                        }
                    }
                    
                    // Create the function signature
                    const signature = `${functionName}(${functionParams})`;
                    
                    // Create the function element
                    const functionElement: CodeElement = {
                        id: functionId,
                        name: functionName,
                        kind,
                        filePath,
                        signature,
                        loc: {
                            start: { line: lineIndex + 1, column: line.indexOf('def') },
                            end: { line: endLine + 1, column: 0 }
                        },
                        relations: []
                    };
                    
                    // Add relationship to parent class if it's a method
                    if (kind === 'method' && parentId) {
                        functionElement.relations.push({
                            targetId: parentId,
                            type: 'BELONGS_TO',
                            weight: 1.0
                        });
                    }
                    
                    // Extract the function body for further analysis
                    const functionBody = lines.slice(lineIndex, endLine + 1).join('\n');
                    
                    // Find function calls within the body
                    this.findPythonFunctionCalls(functionBody, functionElement);
                    
                    // Add to elements list
                    elements.push(functionElement);
                    
                    // Add to scope stack
                    scopeStack.push({
                        id: functionId,
                        name: functionName,
                        kind,
                        startLine: lineIndex,
                        indentation
                    });
                    
                    continue;
                }
                
                // Check for import statements
                const importMatch = line.match(importPattern);
                if (importMatch) {
                    const fromModule = importMatch[1] || '';
                    const importedItems = importMatch[2].split(',').map(item => {
                        // Handle "import x as y" syntax
                        const asParts = item.trim().split(/\s+as\s+/);
                        return asParts[0].trim();
                    });
                    
                    // If we have a current element, add dependencies for the imports
                    if (elements.length > 0) {
                        const currentElement = elements[elements.length - 1];
                        
                        for (const item of importedItems) {
                            const importPath = fromModule ? `${fromModule}.${item}` : item;
                            currentElement.relations.push({
                                targetId: this.generateElementId('module', importPath, importPath),
                                type: 'IMPORTS',
                                weight: 0.7
                            });
                        }
                    }
                }
            }
            
            // Add relationships between elements based on function calls and references
            this.buildRelationships(elements);
            
            return elements;
            
        } catch (error) {
            Logger.error(`Error parsing Python file ${filePath}:`, error);
            return [];
        }
    }

    /**
     * Find function calls within a Python function body
     */
    private findPythonFunctionCalls(functionBody: string, functionElement: CodeElement): void {
        // Pattern to find function calls
        const functionCallPattern = /\b(\w+)\s*\(/g;
        let match;
        
        while ((match = functionCallPattern.exec(functionBody)) !== null) {
            const calledFunctionName = match[1];
            
            // Skip common Python built-ins and keywords
            if (['if', 'while', 'for', 'print', 'len', 'str', 'int', 'float', 'list', 
                'dict', 'set', 'tuple', 'isinstance', 'type', 'super'].includes(calledFunctionName)) {
                continue;
            }
            
            // Add a calls relationship
            functionElement.relations.push({
                targetId: this.generateElementId('function', calledFunctionName, functionElement.filePath),
                type: 'CALLS',
                weight: 0.8
            });
        }
        
        // Look for method calls on objects (obj.method())
        const methodCallPattern = /(\w+)\.(\w+)\s*\(/g;
        while ((match = methodCallPattern.exec(functionBody)) !== null) {
            const objectName = match[1];
            const methodName = match[2];
            
            // Skip some common method calls like print, append, etc.
            if (['append', 'extend', 'insert', 'remove', 'pop', 'clear', 'index', 
                'count', 'sort', 'reverse', 'copy'].includes(methodName)) {
                continue;
            }
            
            // Add uses relationship for the object
            functionElement.relations.push({
                targetId: this.generateElementId('class', objectName, functionElement.filePath),
                type: 'USES',
                weight: 0.6
            });
            
            // Add calls relationship for the method
            functionElement.relations.push({
                targetId: this.generateElementId('method', methodName, functionElement.filePath),
                type: 'CALLS',
                weight: 0.7
            });
        }
    }

    /**
     * Get indentation level of a line
     */
    private getIndentation(line: string): number {
        const match = line.match(/^(\s*)/);
        return match ? match[1].length : 0;
    }

    /**
     * Generic parser that tries to identify code elements using regex patterns
     * This serves as a fallback for unsupported languages
     */
    private parseGeneric(content: string, filePath: string): CodeElement[] {
        Logger.debug(`Using generic parser for ${filePath}`);
        const elements: CodeElement[] = [];
        const lines = content.split('\n');
        
        // Track modules/namespaces/classes to establish parent-child relationships
        const scopeStack: { id: string; name: string; kind: string; startLine: number }[] = [];
        
        try {
            // Simplified patterns for different code constructs
            
            // Pattern for classes
            const classPattern = /\b(?:class|interface|enum)\s+(\w+)(?:<.*>)?(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?/g;
            
            // Pattern for methods/functions
            const functionPattern = /\b(?:function|async|public|private|protected|static)?\s*(\w+)\s*(?:<.*>)?\s*\(([^)]*)\)/g;
            
            // Pattern for imports/requires
            const importPattern = /\b(?:import|require)\s+(?:['"](.+?)['"]|(?:{([\w\s,]+)})\s+from\s+['"](.+?)['"])/g;
            
            // Process the file line by line
            for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
                const line = lines[lineIndex];
                
                // Check for class declarations
                let classMatch;
                const classPatternCopy = new RegExp(classPattern);
                while ((classMatch = classPatternCopy.exec(line)) !== null) {
                    const className = classMatch[1];
                    const extendsClass = classMatch[2];
                    
                    // Create a unique ID for the class
                    const classId = this.generateElementId('class', className, filePath);
                    
                    // Estimate where the class ends (simplified)
                    let endLine = lineIndex;
                    let braceCount = 0;
                    let foundOpenBrace = false;
                    
                    // Look for the opening brace on the class line
                    if (line.includes('{')) {
                        foundOpenBrace = true;
                        braceCount = 1;
                    }
                    
                    // If not found on the same line, look ahead
                    if (!foundOpenBrace) {
                        for (let i = lineIndex + 1; i < lines.length; i++) {
                            if (lines[i].includes('{')) {
                                foundOpenBrace = true;
                                braceCount = 1;
                                break;
                            }
                        }
                    }
                    
                    // Find the matching closing brace
                    if (foundOpenBrace) {
                        for (let i = lineIndex + 1; i < lines.length; i++) {
                            const curLine = lines[i];
                            
                            // Count opening braces
                            const openCount = (curLine.match(/{/g) || []).length;
                            braceCount += openCount;
                            
                            // Count closing braces
                            const closeCount = (curLine.match(/}/g) || []).length;
                            braceCount -= closeCount;
                            
                            if (braceCount === 0) {
                                endLine = i;
                                break;
                            }
                        }
                    }
                    
                    // Create a code element for the class
                    const classElement: CodeElement = {
                        id: classId,
                        name: className,
                        kind: 'class',
                        filePath,
                        loc: {
                            start: { line: lineIndex + 1, column: line.indexOf(className) },
                            end: { line: endLine + 1, column: 0 }
                        },
                        relations: []
                    };
                    
                    // Add inheritance relationship if extends another class
                    if (extendsClass) {
                        const parentClassId = this.generateElementId('class', extendsClass, filePath);
                        classElement.relations.push({
                            targetId: parentClassId,
                            type: 'INHERITS_FROM',
                            weight: 1.0
                        });
                    }
                    
                    // Add to elements list
                    elements.push(classElement);
                    
                    // Push to scope stack
                    scopeStack.push({
                        id: classId,
                        name: className,
                        kind: 'class',
                        startLine: lineIndex
                    });
                }
                
                // Check for function/method declarations
                let functionMatch;
                const functionPatternCopy = new RegExp(functionPattern);
                while ((functionMatch = functionPatternCopy.exec(line)) !== null) {
                    const functionName = functionMatch[1];
                    const functionParams = functionMatch[2];
                    
                    // Skip if it's likely part of a control structure (if, while, for)
                    if (['if', 'while', 'for', 'switch'].includes(functionName)) {
                        continue;
                    }
                    
                    // Determine if this is a method within a class or a standalone function
                    let kind = 'function';
                    let parentId = null;
                    
                    if (scopeStack.length > 0 && scopeStack[scopeStack.length - 1].kind === 'class') {
                        kind = 'method';
                        parentId = scopeStack[scopeStack.length - 1].id;
                    }
                    
                    // Create a unique ID for the function
                    const functionId = this.generateElementId(kind, functionName, filePath);
                    
                    // Estimate where the function ends (simplified)
                    let endLine = lineIndex;
                    let braceCount = 0;
                    let foundOpenBrace = false;
                    
                    // Look for the opening brace on the function line
                    if (line.includes('{')) {
                        foundOpenBrace = true;
                        braceCount = 1;
                    }
                    
                    // If not found on the same line, look ahead
                    if (!foundOpenBrace) {
                        for (let i = lineIndex + 1; i < lines.length; i++) {
                            if (lines[i].includes('{')) {
                                foundOpenBrace = true;
                                braceCount = 1;
                                break;
                            }
                        }
                    }
                    
                    // Find the matching closing brace
                    if (foundOpenBrace) {
                        for (let i = lineIndex + 1; i < lines.length; i++) {
                            const curLine = lines[i];
                            
                            // Count opening braces
                            const openCount = (curLine.match(/{/g) || []).length;
                            braceCount += openCount;
                            
                            // Count closing braces
                            const closeCount = (curLine.match(/}/g) || []).length;
                            braceCount -= closeCount;
                            
                            if (braceCount === 0) {
                                endLine = i;
                                break;
                            }
                        }
                    }
                    
                    // Create the function signature
                    const signature = `${functionName}(${functionParams})`;
                    
                    // Create a code element for the function
                    const functionElement: CodeElement = {
                        id: functionId,
                        name: functionName,
                        kind,
                        filePath,
                        signature,
                        loc: {
                            start: { line: lineIndex + 1, column: line.indexOf(functionName) },
                            end: { line: endLine + 1, column: 0 }
                        },
                        relations: []
                    };
                    
                    // Add relationship to parent class if it's a method
                    if (kind === 'method' && parentId) {
                        functionElement.relations.push({
                            targetId: parentId,
                            type: 'BELONGS_TO',
                            weight: 1.0
                        });
                    }
                    
                    // Analyze function content to find calls to other functions
                    const functionBody = lines.slice(lineIndex, endLine + 1).join('\n');
                    this.findFunctionCalls(functionBody, functionElement);
                    
                    // Add to elements list
                    elements.push(functionElement);
                }
                
                // Check for import statements
                let importMatch;
                const importPatternCopy = new RegExp(importPattern);
                while ((importMatch = importPatternCopy.exec(line)) !== null) {
                    const importPath = importMatch[1] || importMatch[3];
                    const importedItems = importMatch[2] ? importMatch[2].split(',').map(item => item.trim()) : [];
                    
                    // Create dependency relationships between modules
                    if (elements.length > 0) {
                        const currentElement = elements[elements.length - 1];
                        
                        // Add dependency relationship
                        currentElement.relations.push({
                            targetId: this.generateElementId('module', importPath, importPath),
                            type: 'DEPENDS_ON',
                            weight: 0.7
                        });
                    }
                }
            }
            
            // Add relationships between elements based on function calls and references
            this.buildRelationships(elements);
            
            return elements;
            
        } catch (error) {
            Logger.error(`Error in generic parser for ${filePath}:`, error);
            return [];
        }
    }

    /**
     * Find function calls within a function body
     */
    private findFunctionCalls(functionBody: string, functionElement: CodeElement): void {
        // Simplified approach - in a real implementation, use AST parsing
        const functionCallPattern = /\b(\w+)\s*\(/g;
        let match;
        
        while ((match = functionCallPattern.exec(functionBody)) !== null) {
            const calledFunctionName = match[1];
            
            // Skip common control structures
            if (['if', 'while', 'for', 'switch', 'catch'].includes(calledFunctionName)) {
                continue;
            }
            
            // Add a calls relationship
            functionElement.relations.push({
                targetId: this.generateElementId('function', calledFunctionName, functionElement.filePath),
                type: 'CALLS',
                weight: 0.8
            });
        }
    }

    /**
     * Build relationships between code elements
     */
    private buildRelationships(elements: CodeElement[]): void {
        // Map of element IDs to their index in the elements array
        const elementMap = new Map<string, number>();
        
        // Create a map for quick lookup
        elements.forEach((element, index) => {
            elementMap.set(element.id, index);
        });
        
        // Resolve and deduplicate relationships
        elements.forEach(element => {
            const uniqueRelations = new Map<string, { targetId: string; type: string; weight?: number }>();
            
            element.relations.forEach(relation => {
                const key = `${relation.type}-${relation.targetId}`;
                
                // If this relationship already exists, use the one with the higher weight
                if (uniqueRelations.has(key)) {
                    const existing = uniqueRelations.get(key)!;
                    if ((relation.weight || 1.0) > (existing.weight || 1.0)) {
                        uniqueRelations.set(key, relation);
                    }
                } else {
                    uniqueRelations.set(key, relation);
                }
            });
            
            // Replace with deduplicated relations
            element.relations = Array.from(uniqueRelations.values());
        });
    }

    /**
     * Generate a unique ID for a code element
     */
    public generateElementId(kind: string, name: string, filePath: string): string {
        const input = `${kind}:${name}:${filePath}`;
        const hash = crypto.createHash('md5').update(input).digest('hex');
        return `${kind}_${hash}`;
    }
}