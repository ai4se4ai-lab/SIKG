// PythonCodeParser.ts - Python-specific code parser implementation

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { CodeElement } from '../../../GraphTypes';
import { Logger } from '../../../../utils/Logger';
import { ParserUtils } from '../../util/ParserUtils';
import { FileUtils } from '../../util/FileUtils';
import { AstProcessorManager } from '../../util/AstProcessorManager';
import { AstScripts } from '../../util/AstScripts';
import { CodeParserBase } from './../CodeParserBase';

/**
 * Python-specific code parser implementation using AST
 */
export class PythonCodeParser extends CodeParserBase {
    private astProcessorManager: AstProcessorManager;
    private astEnabled: boolean = false;

    constructor(astProcessorManager: AstProcessorManager) {
        super();
        this.astProcessorManager = astProcessorManager;
        this.astEnabled = astProcessorManager.initialized;
    }

    /**
     * Get the language supported by this parser
     */
    public getLanguage(): string {
        return 'python';
    }

    /**
     * Check if this parser can handle a given file
     * @param filePath Path to the file
     * @param content Optional content of the file
     * @returns True if this parser can handle the file
     */
    public canHandle(filePath: string, content?: string): boolean {
        // Check by file extension
        if (ParserUtils.isPythonFile(filePath)) {
            return true;
        }

        // If content is provided, check for Python patterns
        if (content) {
            return ParserUtils.detectPythonContent(content);
        }

        return false;
    }

    /**
     * Parse a Python file and extract code elements and relationships
     * @param content Content of the file to parse
     * @param filePath Path to the file
     * @returns Array of code elements extracted from the file
     */
    public async parseCodeFile(content: string, filePath: string): Promise<CodeElement[]> {
        Logger.debug(`Parsing Python file: ${filePath}`);

        try {
            // Convert to absolute path for consistent ID generation
            const absolutePath = this.resolveToAbsolutePath(filePath);
            
            // Use AST parsing if available
            if (this.astEnabled) {
                return await this.parsePythonWithAst(content, absolutePath);
            } else {
                // Fall back to regex-based parsing
                Logger.debug(`AST parsing not available, using regex-based parsing for ${absolutePath}`);
                return this.parsePythonWithRegex(content, absolutePath);
            }
        } catch (error) {
            return this.handleError(filePath, error);
        }
    }

    /**
     * Resolve file path to absolute path for consistent ID generation
     */
    private resolveToAbsolutePath(filePath: string): string {
        // If it's already absolute, return as-is
        if (path.isAbsolute(filePath)) {
            return filePath;
        }
        
        // If we have a workspace, resolve relative to workspace
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            return path.resolve(workspaceRoot, filePath);
        }
        
        // Fallback to current working directory
        return path.resolve(filePath);
    }

    /**
     * Parse Python code using AST-based analysis
     * @param content Content of the file to parse
     * @param filePath Path to the file
     * @returns Array of code elements extracted from the file
     */
    private async parsePythonWithAst(content: string, filePath: string): Promise<CodeElement[]> {
        Logger.debug(`Parsing Python file with AST: ${filePath}`);
        
        try {
            // Create a temporary file with the content
            const tempFilePath = FileUtils.createTempFileWithContent(
                this.astProcessorManager.getTempDir(),
                `temp_${Date.now()}.py`,
                content
            );
            
            // Get the Python AST parser script
            const scriptContent = AstScripts.getScript('python_ast_parser.py');
            if (!scriptContent) {
                throw new Error('Python AST parser script not found');
            }

            // Execute the AST parser
            const output = this.astProcessorManager.processFile('python_ast_parser.py', scriptContent, tempFilePath);
            
            // Clean up the temporary file
            try {
                if (FileUtils.fileExists(tempFilePath)) {
                    fs.unlinkSync(tempFilePath);
                }
            } catch (cleanupError) {
                Logger.warn(`Failed to clean up temporary file ${tempFilePath}:`, cleanupError);
            }
            
            // Parse the JSON output from the AST parser
            const astData = JSON.parse(output);
            
            // Convert the AST data to CodeElements
            return this.convertAstToCodeElements(astData, filePath);
        } catch (error) {
            Logger.error(`Error parsing Python file with AST ${filePath}:`, error);
            // Fallback to the regex-based parser
            Logger.debug(`Falling back to regex-based parser for ${filePath}`);
            return this.parsePythonWithRegex(content, filePath);
        }
    }

    /**
     * Convert AST data to CodeElements
     * @param astData AST data from the Python parser
     * @param filePath Path to the file
     * @returns Array of code elements extracted from the AST data
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
        
        // Process imports with enhanced tracking
        for (const importItem of astData.imports) {
            const importedModuleName = importItem.name;
            const resolvedImportPath = this.resolveImportPath(importedModuleName, filePath);
            const importId = this.generateElementId('module', importedModuleName, resolvedImportPath);
            
            // Add import relationship to the module
            elements[0].relations.push({
                targetId: importId,
                type: 'IMPORTS',
                weight: 0.7
            });
            
            // Store the name to ID mapping for imported names
            for (const name of importItem.imported_names || []) {
                // Generate consistent IDs for imported functions
                const functionId = this.generateElementId('function', name, resolvedImportPath);
                idMap.set(name, functionId);
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
                
                // Add method calls with proper ID resolution
                for (const calledFunc of methodData.calls) {
                    this.addCallRelationship(methodElement, calledFunc, idMap, filePath);
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
            
            // Add function calls with proper ID resolution
            for (const calledFunc of funcData.calls) {
                this.addCallRelationship(funcElement, calledFunc, idMap, filePath);
            }
            
            elements.push(funcElement);
        }
        
        return this.buildRelationships(elements);
    }

    /**
     * Add call relationship with proper ID resolution
     */
    private addCallRelationship(
        element: CodeElement,
        calledFunc: string,
        idMap: Map<string, string>,
        filePath: string
    ): void {
        const isMethod = calledFunc.includes('.');
        let callTargetId: string;
        
        if (isMethod) {
            // This is a method call like obj.method()
            const [obj, method] = calledFunc.split('.');
            
            // Add USES relationship for the object
            const objId = idMap.get(obj) || this.generateElementId('class', obj, filePath);
            element.relations.push({
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
        
        element.relations.push({
            targetId: callTargetId,
            type: 'CALLS',
            weight: 0.8
        });
    }


    /**
     * Resolve import path to absolute file path
     */
    private resolveImportPath(importName: string, currentFilePath: string): string {
        const currentDir = path.dirname(currentFilePath);
        
        // Handle relative imports
        if (importName.startsWith('.')) {
            const relativePath = importName.substring(1);
            const resolvedPath = path.join(currentDir, relativePath + '.py');
            if (fs.existsSync(resolvedPath)) {
                return resolvedPath;
            }
        }
        
        // Handle absolute imports within the same directory
        const sameDirPath = path.join(currentDir, importName + '.py');
        if (fs.existsSync(sameDirPath)) {
            return sameDirPath;
        }
        
        // Handle common project structure patterns
        const projectRoot = this.findProjectRoot(currentDir);
        if (projectRoot) {
            const projectPath = path.join(projectRoot, importName + '.py');
            if (fs.existsSync(projectPath)) {
                return projectPath;
            }
            
            // Also check in src directory
            const srcPath = path.join(projectRoot, 'src', importName + '.py');
            if (fs.existsSync(srcPath)) {
                return srcPath;
            }
        }
        
        // If we can't resolve, use the import name itself
        return importName;
    }

    /**
     * Find the project root directory
     */
    private findProjectRoot(startDir: string): string | null {
        let currentDir = startDir;
        
        while (currentDir !== path.dirname(currentDir)) {
            // Look for common project markers
            if (fs.existsSync(path.join(currentDir, 'setup.py')) ||
                fs.existsSync(path.join(currentDir, 'pyproject.toml')) ||
                fs.existsSync(path.join(currentDir, 'requirements.txt')) ||
                fs.existsSync(path.join(currentDir, '.git'))) {
                return currentDir;
            }
            
            currentDir = path.dirname(currentDir);
        }
        
        return null;
    }

    /**
     * Parse Python code using regex-based parsing (fallback method)
     * @param content Content of the file to parse
     * @param filePath Path to the file
     * @returns Array of code elements extracted from the file
     */
    private parsePythonWithRegex(content: string, filePath: string): CodeElement[] {
        Logger.debug(`Using regex-based parsing for Python file: ${filePath}`);
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
                            const resolvedImportPath = this.resolveImportPath(fromModule || item, filePath);
                            
                            currentElement.relations.push({
                                targetId: this.generateElementId('module', importPath, resolvedImportPath),
                                type: 'IMPORTS',
                                weight: 0.7
                            });
                        }
                    }
                }
            }
            
            // Add relationships between elements based on function calls and references
            return this.buildRelationships(elements);
            
        } catch (error) {
            return this.handleError(filePath, error);
        }
    }

    /**
     * Find function calls within a Python function body
     * @param functionBody The function body code
     * @param functionElement The function element to update with calls
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
     * Clean up any resources used by this parser
     */
    public dispose(): void {
        // Nothing to dispose for this parser
    }
}