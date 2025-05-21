// GenericCodeParser.ts - Generic fallback parser for any language

import * as path from 'path';
import { CodeElement } from '../../../GraphTypes';
import { Logger } from '../../../../utils/Logger';
import { ParserUtils } from '../../util/ParserUtils';
import { CodeParserBase } from './../CodeParserBase';

/**
 * Generic code parser that provides basic parsing for any language
 * This is used as a fallback when no language-specific parser is available
 */
export class GenericCodeParser extends CodeParserBase {
    /**
     * Get the language supported by this parser
     */
    public getLanguage(): string {
        return 'generic';
    }

    /**
     * Check if this parser can handle a given file
     * Always returns true as this is a fallback parser
     */
    public canHandle(filePath: string, content?: string): boolean {
        return true;
    }

    /**
     * Parse a code file using generic patterns that work across languages
     * @param content Content of the file to parse
     * @param filePath Path to the file
     * @returns Array of code elements extracted from the file
     */
    public async parseCodeFile(content: string, filePath: string): Promise<CodeElement[]> {
        Logger.debug(`Parsing file with generic parser: ${filePath}`);
        return this.parseGeneric(content, filePath);
    }

    /**
     * Generic parser that tries to identify code elements using regex patterns
     * This is a simplified parser that works across multiple languages
     */
    private parseGeneric(content: string, filePath: string): CodeElement[] {
        const elements: CodeElement[] = [];
        const lines = content.split('\n');
        
        // Track modules/namespaces/classes to establish parent-child relationships
        const scopeStack: { id: string; name: string; kind: string; startLine: number }[] = [];
        
        try {
            // Create a module/file element
            const moduleName = path.basename(filePath, path.extname(filePath));
            const moduleId = this.generateElementId('module', moduleName, filePath);
            
            elements.push({
                id: moduleId,
                name: moduleName,
                kind: 'module',
                filePath,
                loc: {
                    start: { line: 1, column: 0 },
                    end: { line: lines.length, column: 0 }
                },
                relations: []
            });
            
            // Simplified patterns for different code constructs
            
            // Pattern for classes (works across multiple languages)
            const classPattern = /\b(?:class|interface|enum)\s+(\w+)(?:<.*>)?(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?/g;
            
            // Pattern for methods/functions (works across multiple languages)
            const functionPattern = /\b(?:function|def|async|public|private|protected|static)?\s*(\w+)\s*(?:<.*>)?\s*\(([^)]*)\)/g;
            
            // Pattern for imports/requires
            const importPattern = /\b(?:import|require|using|from|include)\s+(?:['"](.+?)['"]|(?:{([\w\s,]+)})\s+from\s+['"](.+?)['"])/g;
            
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
                    const endLine = this.findScopeEnd(lines, lineIndex);
                    
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
                        relations: [
                            // Classes belong to the module/file
                            {
                                targetId: moduleId,
                                type: 'BELONGS_TO',
                                weight: 1.0
                            }
                        ]
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
                    let parentId = moduleId; // Default parent is the module
                    
                    if (scopeStack.length > 0 && scopeStack[scopeStack.length - 1].kind === 'class') {
                        kind = 'method';
                        parentId = scopeStack[scopeStack.length - 1].id;
                    }
                    
                    // Create a unique ID for the function
                    const functionId = this.generateElementId(kind, functionName, filePath);
                    
                    // Estimate where the function ends
                    const endLine = this.findScopeEnd(lines, lineIndex);
                    
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
                        relations: [
                            // Function belongs to parent (class or module)
                            {
                                targetId: parentId,
                                type: 'BELONGS_TO',
                                weight: 1.0
                            }
                        ]
                    };
                    
                    // Extract the function body
                    const functionBody = lines.slice(lineIndex, endLine + 1).join('\n');
                    
                    // Analyze function content to find calls to other functions
                    this.findFunctionCalls(functionBody, functionElement);
                    
                    // Add to elements list
                    elements.push(functionElement);
                    
                    // Update lineIndex to skip past this function definition
                    lineIndex = endLine;
                }
                
                // Check for import statements
                let importMatch;
                const importPatternCopy = new RegExp(importPattern);
                while ((importMatch = importPatternCopy.exec(line)) !== null) {
                    const importPath = importMatch[1] || importMatch[3];
                    
                    if (importPath) {
                        // Add import relationship to the module
                        elements[0].relations.push({
                            targetId: this.generateElementId('module', importPath, importPath),
                            type: 'IMPORTS',
                            weight: 0.7
                        });
                    }
                }
            }
            
            // Add relationships between elements
            return this.buildRelationships(elements);
            
        } catch (error) {
            return this.handleError(filePath, error);
        }
    }

    /**
     * Find function calls within a function body
     * @param functionBody The function body code
     * @param functionElement The function element to update with calls
     */
    private findFunctionCalls(functionBody: string, functionElement: CodeElement): void {
        // Basic function call regex that works across multiple languages
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
        
        // Look for method calls on objects (obj.method())
        const methodCallPattern = /(\w+)\.(\w+)\s*\(/g;
        while ((match = methodCallPattern.exec(functionBody)) !== null) {
            const objectName = match[1];
            const methodName = match[2];
            
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
     * Find the end of a scope (class, function, etc.)
     * @param lines Lines of code
     * @param startLine Line where the scope starts
     * @returns Line where the scope ends
     */
    private findScopeEnd(lines: string[], startLine: number): number {
        let braceCount = 0;
        let foundOpenBrace = false;
        const baseIndent = this.getIndentation(lines[startLine]);
        
        // Look for opening brace on the start line
        if (lines[startLine].includes('{')) {
            foundOpenBrace = true;
            braceCount = (lines[startLine].match(/{/g) || []).length - (lines[startLine].match(/}/g) || []).length;
        }
        
        // If braces are used for scope (C-like languages)
        if (foundOpenBrace) {
            for (let i = startLine + 1; i < lines.length; i++) {
                const line = lines[i];
                
                // Count braces
                braceCount += (line.match(/{/g) || []).length;
                braceCount -= (line.match(/}/g) || []).length;
                
                if (braceCount <= 0) {
                    return i;
                }
                
                // If we reach the end of the file
                if (i === lines.length - 1) {
                    return i;
                }
            }
        } else {
            // If indentation is used for scope (Python-like languages)
            for (let i = startLine + 1; i < lines.length; i++) {
                const line = lines[i].trim();
                
                // Skip empty lines
                if (line.length === 0) {
                    continue;
                }
                
                const indent = this.getIndentation(lines[i]);
                
                // If we find a line with less or equal indentation, the scope has ended
                if (indent <= baseIndent) {
                    return i - 1;
                }
                
                // If we reach the end of the file
                if (i === lines.length - 1) {
                    return i;
                }
            }
        }
        
        // Default to the end of the file
        return lines.length - 1;
    }

    /**
     * Clean up any resources used by this parser
     */
    public dispose(): void {
        // Nothing to dispose for this parser
    }
}