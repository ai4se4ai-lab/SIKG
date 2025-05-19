// Code Parser - Parses source code and extracts code elements and relationships

import * as path from 'path';
import * as crypto from 'crypto';
import { CodeElement } from './GraphTypes';
import { Logger } from '../utils/Logger';

export class CodeParser {
    /**
     * Parse a code file and extract code elements and relationships
     */
    public async parseCodeFile(content: string, filePath: string): Promise<CodeElement[]> {
        Logger.debug(`Parsing code file: ${filePath}`);
        const elements: CodeElement[] = [];
        
        try {
            // Determine the language based on file extension
            const extension = path.extname(filePath).toLowerCase();
            
            switch (extension) {
                case '.ts':
                case '.tsx':
                    return this.parseTypeScript(content, filePath);
                case '.js':
                case '.jsx':
                    return this.parseJavaScript(content, filePath);
                case '.java':
                    return this.parseJava(content, filePath);
                case '.py':
                    return this.parsePython(content, filePath);
                case '.cs':
                    return this.parseCSharp(content, filePath);
                case '.go':
                    return this.parseGo(content, filePath);
                default:
                    // Generic parser that tries to identify functions, classes, etc.
                    return this.parseGeneric(content, filePath);
            }
        } catch (error) {
            Logger.error(`Error parsing code file ${filePath}:`, error);
            return [];
        }
    }

    /**
     * Parse TypeScript code
     */
    private parseTypeScript(content: string, filePath: string): CodeElement[] {
        return this.parseGeneric(content, filePath); // Replace with actual TypeScript parsing
    }

    /**
     * Parse JavaScript code
     */
    private parseJavaScript(content: string, filePath: string): CodeElement[] {
        return this.parseGeneric(content, filePath); // Replace with actual JavaScript parsing
    }

    /**
     * Parse Java code
     */
    private parseJava(content: string, filePath: string): CodeElement[] {
        return this.parseGeneric(content, filePath); // Replace with actual Java parsing
    }

    /**
     * Parse Python code
     */
    private parsePython(content: string, filePath: string): CodeElement[] {
        return this.parseGeneric(content, filePath); // Replace with actual Python parsing
    }

    /**
     * Parse C# code
     */
    private parseCSharp(content: string, filePath: string): CodeElement[] {
        return this.parseGeneric(content, filePath); // Replace with actual C# parsing
    }

    /**
     * Parse Go code
     */
    private parseGo(content: string, filePath: string): CodeElement[] {
        return this.parseGeneric(content, filePath); // Replace with actual Go parsing
    }

    /**
     * Generic parser that tries to identify code elements using regex patterns
     * This is a simplified placeholder - a real implementation would use language-specific AST parsers
     */
    private parseGeneric(content: string, filePath: string): CodeElement[] {
        const elements: CodeElement[] = [];
        const lines = content.split('\n');
        
        // Track modules/namespaces/classes to establish parent-child relationships
        const scopeStack: { id: string; name: string; kind: string; startLine: number }[] = [];
        
        try {
            // Simplified patterns for different code constructs
            // In a real implementation, use AST parsing for accurate results
            
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
                    const implementsInterfaces = classMatch[3];
                    
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
