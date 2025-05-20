// Test Parser - Parses test files and identifies test cases

import * as path from 'path';
import * as crypto from 'crypto';
import { TestCase } from './GraphTypes';
import { Logger } from '../utils/Logger';
import { CodeParser } from './CodeParser';

export class TestParser {
    private codeParser: CodeParser;

    constructor() {
        this.codeParser = new CodeParser();
    }

    /**
     * Parse a test file and extract test cases
     */

    public async parseTestFile(content: string, filePath: string): Promise<TestCase[]> {
        Logger.debug(`Parsing test file: ${filePath}`);
        const testCases: TestCase[] = [];
        
        try {
            // Only handle Python test files
            const extension = path.extname(filePath).toLowerCase();
            
            if (extension === '.py' && (content.includes('unittest') || content.includes('pytest'))) {
                return this.parsePythonTests(content, filePath);
            } else {
                // Use generic parser as fallback for any Python files that look like tests
                return this.parseGenericTests(content, filePath);
            }
        } catch (error) {
            Logger.error(`Error parsing test file ${filePath}:`, error);
            return [];
        }
    }

// Remove all other language-specific parse methods except parsePythonTests and parseGenericTests

    /**
     * Parse Jasmine/Mocha/Jest style tests (JavaScript/TypeScript)
     */
    private parseJasmineStyleTests(content: string, filePath: string): TestCase[] {
        const testCases: TestCase[] = [];
        const lines = content.split('\n');
        
        // Track test suites and nested contexts
        const suiteStack: { name: string; line: number }[] = [];
        
        try {
            // Find imports/requires to establish connections to code under test
            const importStatements = this.findImportStatements(content);
            const importedModules = this.resolveImportPaths(importStatements, filePath);
            
            // Process the file line by line
            for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
                const line = lines[lineIndex];
                
                // Check for test suite declarations
                const describeMatch = line.match(/describe\(['"](.*?)['"]/);
                if (describeMatch) {
                    suiteStack.push({ name: describeMatch[1], line: lineIndex });
                }
                
                // Check for nested context blocks
                const contextMatch = line.match(/(?:context|describe|suite)\(['"](.*?)['"]/);
                if (contextMatch && !describeMatch) {
                    suiteStack.push({ name: contextMatch[1], line: lineIndex });
                }
                
                // Check for test case declarations
                const testMatch = line.match(/(?:it|test)\(['"](.*?)['"]/);
                if (testMatch) {
                    const testName = testMatch[1];
                    
                    // Build full test name including suite context
                    const fullTestName = suiteStack.length > 0
                        ? `${suiteStack.map(s => s.name).join(' > ')} > ${testName}`
                        : testName;
                    
                    // Find the end of the test function
                    let endLine = lineIndex;
                    let braceCount = 0;
                    let foundOpenBrace = false;
                    
                    // Check if there's an opening brace on the same line
                    if (line.includes('{')) {
                        foundOpenBrace = true;
                        braceCount = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
                    } else if (line.includes('=>')) {
                        // Handle arrow functions
                        if (line.includes('=>') && line.includes('{')) {
                            foundOpenBrace = true;
                            braceCount = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
                        } else if (line.includes('=>') && !line.includes('{')) {
                            // Arrow function without braces - might be a one-liner
                            foundOpenBrace = false;
                            endLine = lineIndex;
                        }
                    } else {
                        // Look ahead for the opening brace
                        for (let i = lineIndex + 1; i < lines.length; i++) {
                            if (lines[i].includes('{')) {
                                foundOpenBrace = true;
                                braceCount = 1;
                                break;
                            } else if (lines[i].includes('=>')) {
                                if (lines[i].includes('{')) {
                                    foundOpenBrace = true;
                                    braceCount = (lines[i].match(/{/g) || []).length - (lines[i].match(/}/g) || []).length;
                                    break;
                                } else {
                                    // Arrow function without braces
                                    foundOpenBrace = false;
                                    endLine = i;
                                    break;
                                }
                            }
                        }
                    }
                    
                    // If found opening brace, find matching closing brace
                    if (foundOpenBrace && braceCount > 0) {
                        for (let i = lineIndex + 1; i < lines.length; i++) {
                            const curLine = lines[i];
                            
                            braceCount += (curLine.match(/{/g) || []).length;
                            braceCount -= (curLine.match(/}/g) || []).length;
                            
                            if (braceCount === 0) {
                                endLine = i;
                                break;
                            }
                        }
                    }
                    
                    // Extract the test body
                    const testBody = lines.slice(lineIndex, endLine + 1).join('\n');
                    
                    // Create a unique ID for the test
                    const testId = this.generateNodeId(fullTestName, filePath);
                    
                    // Create the test case
                    const testCase: TestCase = {
                        id: testId,
                        name: fullTestName,
                        testType: this.detectTestType(testBody, fullTestName),
                        filePath,
                        loc: {
                            start: { line: lineIndex + 1, column: line.indexOf(testName) },
                            end: { line: endLine + 1, column: 0 }
                        },
                        coveredElements: []
                    };
                    
                    // Find out which code elements this test case covers
                    this.identifyCoveredCode(testBody, testCase, importedModules);
                    
                    testCases.push(testCase);
                }
                
                // Check for ending a describe/context block
                if (line.includes('}') && suiteStack.length > 0) {
                    const openBraces = (line.match(/{/g) || []).length;
                    const closeBraces = (line.match(/}/g) || []).length;
                    
                    if (closeBraces > openBraces) {
                        // Pop from the stack for each extra closing brace
                        for (let i = 0; i < (closeBraces - openBraces); i++) {
                            if (suiteStack.length > 0) {
                                suiteStack.pop();
                            }
                        }
                    }
                }
            }
            
            return testCases;
            
        } catch (error) {
            Logger.error(`Error parsing Jasmine-style tests in ${filePath}:`, error);
            return [];
        }
    }

    /**
     * Parse JUnit style tests (Java)
     */
    private parseJUnitStyleTests(content: string, filePath: string): TestCase[] {
        // Simplified implementation - in a real extension, use Java AST parsing
        const testCases: TestCase[] = [];
        const lines = content.split('\n');
        
        try {
            // Find package and import statements
            const packageName = this.findJavaPackageName(content);
            const importStatements = this.findJavaImportStatements(content);
            
            // Extract class name
            const classNameMatch = content.match(/public\s+class\s+(\w+)/);
            const className = classNameMatch ? classNameMatch[1] : path.basename(filePath, path.extname(filePath));
            
            // Look for @Test annotations
            for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
                const line = lines[lineIndex];
                
                if (line.includes('@Test')) {
                    // Find the method that follows the @Test annotation
                    let methodMatch = null;
                    for (let i = lineIndex + 1; i < lines.length; i++) {
                        methodMatch = lines[i].match(/(?:public|private|protected)?\s+void\s+(\w+)\s*\([^)]*\)/);
                        if (methodMatch) {
                            lineIndex = i; // Update the line index to skip processed lines
                            break;
                        }
                    }
                    
                    if (methodMatch) {
                        const methodName = methodMatch[1];
                        const testName = `${className}.${methodName}`;
                        
                        // Find the end of the method
                        let endLine = lineIndex;
                        let braceCount = 0;
                        let foundOpenBrace = false;
                        
                        // Check if there's an opening brace on this line
                        if (lines[lineIndex].includes('{')) {
                            foundOpenBrace = true;
                            braceCount = 1;
                        } else {
                            // Look ahead for the opening brace
                            for (let i = lineIndex + 1; i < lines.length; i++) {
                                if (lines[i].includes('{')) {
                                    foundOpenBrace = true;
                                    braceCount = 1;
                                    break;
                                }
                            }
                        }
                        
                        // If found opening brace, find matching closing brace
                        if (foundOpenBrace) {
                            for (let i = lineIndex + 1; i < lines.length; i++) {
                                const curLine = lines[i];
                                
                                // Count braces
                                braceCount += (curLine.match(/{/g) || []).length;
                                braceCount -= (curLine.match(/}/g) || []).length;
                                
                                if (braceCount === 0) {
                                    endLine = i;
                                    break;
                                }
                            }
                        }
                        
                        // Extract the test body
                        const testBody = lines.slice(lineIndex, endLine + 1).join('\n');
                        
                        // Create a unique ID for the test
                        const testId = this.generateNodeId(testName, filePath);
                        
                        // Create the test case
                        const testCase: TestCase = {
                            id: testId,
                            name: testName,
                            testType: this.detectTestType(testBody, testName),
                            filePath,
                            loc: {
                                start: { line: lineIndex + 1, column: lines[lineIndex].indexOf(methodName) },
                                end: { line: endLine + 1, column: 0 }
                            },
                            coveredElements: []
                        };
                        
                        // Find code elements this test covers
                        this.identifyCoveredCodeJava(testBody, testCase, importStatements, packageName);
                        
                        testCases.push(testCase);
                    }
                }
            }
            
            return testCases;
            
        } catch (error) {
            Logger.error(`Error parsing JUnit tests in ${filePath}:`, error);
            return [];
        }
    }

    /**
     * Parse Python unittest or pytest tests
     */
    // Enhanced parsePythonTests method for TestParser.ts (continued)

private parsePythonTests(content: string, filePath: string): TestCase[] {
    Logger.debug(`Parsing Python test file: ${filePath}`);
    const testCases: TestCase[] = [];
    const lines = content.split('\n');
    
    try {
        // Detect unittest and pytest style tests
        const isUnittest = content.includes('import unittest') || content.includes('from unittest');
        const isPytest = content.includes('import pytest') || content.includes('from pytest');
        
        // Track class contexts for unittest
        const classStack: { name: string, line: number, indentation: number }[] = [];
        
        // Process the file line by line
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex];
            const indentation = this.getIndentation(line);
            
            // Maintain the class stack based on indentation
            while (classStack.length > 0 && classStack[classStack.length - 1].indentation >= indentation) {
                classStack.pop();
            }
            
            if (isUnittest) {
                // Look for unittest test classes
                const classMatch = line.match(/^\s*class\s+(\w+)(?:\(([^)]*)\))?:/);
                if (classMatch) {
                    const className = classMatch[1];
                    const parentClass = classMatch[2];
                    
                    // Check if this is a test class (inherits from TestCase)
                    if (parentClass && (parentClass.includes('TestCase') || parentClass.includes('unittest'))) {
                        classStack.push({ 
                            name: className,
                            line: lineIndex,
                            indentation
                        });
                    }
                    continue;
                }
                
                // Look for test methods in unittest style
                if (classStack.length > 0) {
                    const methodMatch = line.match(/^\s*def\s+(test\w*)\s*\(self(?:,\s*[^)]*)??\):/);
                    if (methodMatch) {
                        const methodName = methodMatch[1];
                        const className = classStack[classStack.length - 1].name;
                        const testName = `${className}.${methodName}`;
                        
                        // Find the end of the test method
                        let endLine = lineIndex;
                        const methodIndentation = indentation;
                        
                        // Look ahead to find where this method ends
                        for (let i = lineIndex + 1; i < lines.length; i++) {
                            const nextLine = lines[i].trim();
                            if (nextLine.length > 0) {
                                const nextIndentation = this.getIndentation(lines[i]);
                                if (nextIndentation <= methodIndentation) {
                                    endLine = i - 1;
                                    break;
                                }
                                
                                // If we reach the end of the file
                                if (i === lines.length - 1) {
                                    endLine = i;
                                }
                            }
                        }
                        
                        // Extract the test body
                        const testBody = lines.slice(lineIndex, endLine + 1).join('\n');
                        
                        // Create a unique ID for the test
                        const testId = this.generateNodeId(testName, filePath);
                        
                        // Create the test case
                        const testCase: TestCase = {
                            id: testId,
                            name: testName,
                            testType: this.detectTestType(testBody, testName),
                            filePath,
                            loc: {
                                start: { line: lineIndex + 1, column: line.indexOf(methodName) },
                                end: { line: endLine + 1, column: 0 }
                            },
                            coveredElements: []
                        };
                        
                        // Find code elements this test covers
                        this.identifyPythonCoveredCode(testBody, testCase, filePath);
                        
                        testCases.push(testCase);
                    }
                }
            } else if (isPytest) {
                // Look for pytest style test functions
                const functionMatch = line.match(/^\s*def\s+(test\w*)\s*\(([^)]*)\):/);
                if (functionMatch) {
                    const functionName = functionMatch[1];
                    
                    // Find the end of the test function
                    let endLine = lineIndex;
                    const functionIndentation = indentation;
                    
                    // Look ahead to find where this function ends
                    for (let i = lineIndex + 1; i < lines.length; i++) {
                        const nextLine = lines[i].trim();
                        if (nextLine.length > 0) {
                            const nextIndentation = this.getIndentation(lines[i]);
                            if (nextIndentation <= functionIndentation) {
                                endLine = i - 1;
                                break;
                            }
                            
                            // If we reach the end of the file
                            if (i === lines.length - 1) {
                                endLine = i;
                            }
                        }
                    }
                    
                    // Extract the test body
                    const testBody = lines.slice(lineIndex, endLine + 1).join('\n');
                    
                    // Create a unique ID for the test
                    const testId = this.generateNodeId(functionName, filePath);
                    
                    // Create the test case
                    const testCase: TestCase = {
                        id: testId,
                        name: functionName,
                        testType: this.detectTestType(testBody, functionName),
                        filePath,
                        loc: {
                            start: { line: lineIndex + 1, column: line.indexOf(functionName) },
                            end: { line: endLine + 1, column: 0 }
                        },
                        coveredElements: []
                    };
                    
                    // Find code elements this test covers
                    this.identifyPythonCoveredCode(testBody, testCase, filePath);
                    
                    testCases.push(testCase);
                }
            } else {
                // Generic approach for other Python testing frameworks or custom test functions
                const functionMatch = line.match(/^\s*def\s+(test\w*)\s*\(([^)]*)\):/);
                if (functionMatch) {
                    const functionName = functionMatch[1];
                    
                    // Find the end of the test function
                    let endLine = lineIndex;
                    const functionIndentation = indentation;
                    
                    // Look ahead to find where this function ends
                    for (let i = lineIndex + 1; i < lines.length; i++) {
                        const nextLine = lines[i].trim();
                        if (nextLine.length > 0) {
                            const nextIndentation = this.getIndentation(lines[i]);
                            if (nextIndentation <= functionIndentation) {
                                endLine = i - 1;
                                break;
                            }
                            
                            // If we reach the end of the file
                            if (i === lines.length - 1) {
                                endLine = i;
                            }
                        }
                    }
                    
                    // Extract the test body
                    const testBody = lines.slice(lineIndex, endLine + 1).join('\n');
                    
                    // Create a unique ID for the test
                    const testId = this.generateNodeId(functionName, filePath);
                    
                    // Create the test case
                    const testCase: TestCase = {
                        id: testId,
                        name: functionName,
                        testType: this.detectTestType(testBody, functionName),
                        filePath,
                        loc: {
                            start: { line: lineIndex + 1, column: line.indexOf(functionName) },
                            end: { line: endLine + 1, column: 0 }
                        },
                        coveredElements: []
                    };
                    
                    // Find code elements this test covers
                    this.identifyPythonCoveredCode(testBody, testCase, filePath);
                    
                    testCases.push(testCase);
                }
            }
        }
        
        return testCases;
        
    } catch (error) {
        Logger.error(`Error parsing Python test file ${filePath}:`, error);
        return [];
    }
}

/**
 * Identify which code elements a Python test covers
 */
private identifyPythonCoveredCode(testBody: string, testCase: TestCase, filePath: string): void {
    // Set to track unique IDs
    const coveredIds = new Set<string>();
    
    // Look for module imports
    const importPattern = /(?:from\s+(\S+)\s+)?import\s+(.+)/g;
    let importMatch;
    while ((importMatch = importPattern.exec(testBody)) !== null) {
        const fromModule = importMatch[1] || '';
        const importedItems = importMatch[2].split(',').map(item => {
            // Handle "import x as y" syntax
            const asParts = item.trim().split(/\s+as\s+/);
            return asParts[0].trim();
        });
        
        for (const item of importedItems) {
            const importPath = fromModule ? `${fromModule}.${item}` : item;
            
            // Add to covered elements
            const moduleId = this.codeParser.generateElementId('module', importPath, importPath);
            if (!coveredIds.has(moduleId)) {
                coveredIds.add(moduleId);
                testCase.coveredElements.push({
                    targetId: moduleId,
                    weight: 0.5 // Lower confidence for imports
                });
            }
        }
    }
    
    // Look for function calls
    const functionCallPattern = /\b(\w+)\s*\(/g;
    let match;
    while ((match = functionCallPattern.exec(testBody)) !== null) {
        const calledFunctionName = match[1];
        
        // Skip common testing functions and Python built-ins
        if (['assertEqual', 'assertTrue', 'assertFalse', 'assertRaises', 'assertIn',
             'assert', 'print', 'len', 'str', 'int', 'float', 'list', 'dict', 'set', 
             'isinstance', 'type', 'self'].includes(calledFunctionName)) {
            continue;
        }
        
        // Create an ID for the called function
        const functionId = this.codeParser.generateElementId('function', calledFunctionName, '');
        
        // Add to covered elements if not already added
        if (!coveredIds.has(functionId)) {
            coveredIds.add(functionId);
            testCase.coveredElements.push({
                targetId: functionId,
                weight: 0.8 // High confidence that it's testing this function
            });
        }
    }
    
    // Look for method calls on objects (obj.method())
    const methodCallPattern = /(\w+)\.(\w+)\s*\(/g;
    while ((match = methodCallPattern.exec(testBody)) !== null) {
        const objectName = match[1];
        const methodName = match[2];
        
        // Skip self and common assertion methods
        if (objectName === 'self' || ['assertEqual', 'assertTrue', 'assertFalse', 
            'assertRaises', 'assertIn', 'append', 'extend', 'insert', 'remove', 
            'pop', 'clear', 'index', 'count', 'sort', 'reverse', 'copy'].includes(methodName)) {
            continue;
        }
        
        // Create an ID for the object class
        const classId = this.codeParser.generateElementId('class', objectName, '');
        
        // Add class to covered elements if not already added
        if (!coveredIds.has(classId)) {
            coveredIds.add(classId);
            testCase.coveredElements.push({
                targetId: classId,
                weight: 0.9 // Very high confidence it's testing this class
            });
        }
        
        // Create an ID for the method
        const methodId = this.codeParser.generateElementId('method', methodName, '');
        
        // Add method to covered elements if not already added
        if (!coveredIds.has(methodId)) {
            coveredIds.add(methodId);
            testCase.coveredElements.push({
                targetId: methodId,
                weight: 0.8 // High confidence it's testing this method
            });
        }
    }
    
    // Look for assertions containing variable names, which might indicate covered code
    const assertPattern = /assert\w*\(\s*\w+\.?([^(),\s]+)?\s*(?:,|\))/g;
    while ((match = assertPattern.exec(testBody)) !== null) {
        if (match[1]) {
            const assertedName = match[1];
            
            // Create an ID for the possible function/variable being tested
            const elementId = this.codeParser.generateElementId('function', assertedName, '');
            
            // Add to covered elements if not already added
            if (!coveredIds.has(elementId)) {
                coveredIds.add(elementId);
                testCase.coveredElements.push({
                    targetId: elementId,
                    weight: 0.7 // Moderate confidence
                });
            }
        }
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
     * Parse .NET/MSTest style tests
     */
    private parseDotNetTests(content: string, filePath: string): TestCase[] {
        // Simplified implementation - in a real extension, use C# AST parsing
        return this.parseGenericTests(content, filePath);
    }

    /**
     * Parse Go tests
     */
    private parseGoTests(content: string, filePath: string): TestCase[] {
        // Simplified implementation - in a real extension, use Go AST parsing
        return this.parseGenericTests(content, filePath);
    }

    /**
     * Generic test parser as fallback
     */
    private parseGenericTests(content: string, filePath: string): TestCase[] {
        const testCases: TestCase[] = [];
        const lines = content.split('\n');
        
        // Use regex patterns to find test functions/methods
        const testPatterns = [
            /\b(?:test|check|verify|assert|expect|should|must|validate)(\w+)/i,
            /\b(\w+)(?:Test|Tests|TestCase|Spec|Check|Verify|Assert|Expect|Should|Must|Validate)\b/i
        ];
        
        try {
            for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
                const line = lines[lineIndex];
                
                // Try each pattern
                for (const pattern of testPatterns) {
                    const matches = line.match(pattern);
                    if (matches && matches[1]) {
                        const testName = matches[0];
                        
                        // Skip if it's likely not a test function definition
                        if (line.includes('=') || line.includes('+=') || 
                            line.includes('-=') || line.includes('*=') || 
                            line.includes('/=')) {
                            continue;
                        }
                        
                        // Find the end of the test function/method
                        let endLine = lineIndex;
                        let braceCount = 0;
                        let foundOpenBrace = false;
                        
                        // Check for opening brace on this line
                        if (line.includes('{')) {
                            foundOpenBrace = true;
                            braceCount = 1;
                        } else {
                            // Look ahead for indentation-based or brace-based scope
                            const baseIndent = this.getIndentation(line);
                            
                            for (let i = lineIndex + 1; i < lines.length; i++) {
                                const curLine = lines[i];
                                
                                if (curLine.trim().length === 0) {
                                    continue; // Skip empty lines
                                }
                                
                                // Check for opening brace
                                if (curLine.includes('{') && !foundOpenBrace) {
                                    foundOpenBrace = true;
                                    braceCount = 1;
                                    continue;
                                }
                                
                                // If using braces, track brace count
                                if (foundOpenBrace) {
                                    braceCount += (curLine.match(/{/g) || []).length;
                                    braceCount -= (curLine.match(/}/g) || []).length;
                                    
                                    if (braceCount === 0) {
                                        endLine = i;
                                        break;
                                    }
                                } else {
                                    // Check indentation-based scope (Python, etc.)
                                    const curIndent = this.getIndentation(curLine);
                                    
                                    if (curIndent <= baseIndent && i > lineIndex + 1) {
                                        // End of indentation-based scope
                                        endLine = i - 1;
                                        break;
                                    }
                                    
                                    // If we reach the end of the file
                                    if (i === lines.length - 1) {
                                        endLine = i;
                                    }
                                }
                            }
                        }
                        
                        // Extract the test body
                        const testBody = lines.slice(lineIndex, endLine + 1).join('\n');
                        
                        // Create a unique ID for the test
                        const testId = this.generateNodeId(testName, filePath);
                        
                        // Create the test case
                        const testCase: TestCase = {
                            id: testId,
                            name: testName,
                            testType: this.detectTestType(testBody, testName),
                            filePath,
                            loc: {
                                start: { line: lineIndex + 1, column: line.indexOf(testName) },
                                end: { line: endLine + 1, column: 0 }
                            },
                            coveredElements: []
                        };
                        
                        // Find code elements this test covers
                        this.identifyCoveredCode(testBody, testCase, []);
                        
                        testCases.push(testCase);
                        
                        // Skip to the end of this test to avoid detecting nested functions as tests
                        lineIndex = endLine;
                        break;
                    }
                }
            }
            
            return testCases;
            
        } catch (error) {
            Logger.error(`Error in generic test parser for ${filePath}:`, error);
            return [];
        }
    }

    /**
     * Detect the type of a test (unit, integration, e2e)
     */
    private detectTestType(testBody: string, testName: string): TestCase['testType'] {
        // Look for keywords that indicate test type
        const lowerBody = testBody.toLowerCase();
        const lowerName = testName.toLowerCase();
        
        // Check for E2E test indicators
        if (
            lowerBody.includes('browser') ||
            lowerBody.includes('selenium') ||
            lowerBody.includes('puppeteer') ||
            lowerBody.includes('cypress') ||
            lowerBody.includes('playwright') ||
            lowerName.includes('e2e') ||
            lowerName.includes('end to end') ||
            lowerName.includes('acceptance')
        ) {
            return 'e2e';
        }
        
        // Check for integration test indicators
        if (
            lowerBody.includes('database') ||
            lowerBody.includes('api') ||
            lowerBody.includes('http') ||
            lowerBody.includes('request') ||
            lowerBody.includes('response') ||
            lowerName.includes('integration') ||
            lowerName.includes('api')
        ) {
            return 'integration';
        }
        
        // Default to unit test
        return 'unit';
    }

    /**
     * Find import statements in JavaScript/TypeScript test files
     */
    private findImportStatements(content: string): string[] {
        const importStatements: string[] = [];
        const importPattern = /import\s+(?:{[^}]*}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g;
        const requirePattern = /(?:const|let|var)\s+(?:{[^}]*}|\w+)\s+=\s+require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
        
        let match;
        
        while ((match = importPattern.exec(content)) !== null) {
            importStatements.push(match[1]);
        }
        
        while ((match = requirePattern.exec(content)) !== null) {
            importStatements.push(match[1]);
        }
        
        return importStatements;
    }

    /**
     * Find package name in Java test files
     */
    private findJavaPackageName(content: string): string | null {
        const packageMatch = content.match(/package\s+([\w.]+);/);
        return packageMatch ? packageMatch[1] : null;
    }

    /**
     * Find import statements in Java test files
     */
    private findJavaImportStatements(content: string): string[] {
        const importStatements: string[] = [];
        const importPattern = /import\s+(static\s+)?([\w.]+|\*);/g;
        
        let match;
        while ((match = importPattern.exec(content)) !== null) {
            importStatements.push(match[2]);
        }
        
        return importStatements;
    }

    /**
     * Resolve import paths to actual file paths
     */
    private resolveImportPaths(importStatements: string[], currentFilePath: string): string[] {
        // Simplified implementation - in a real extension, use project-specific module resolution
        return importStatements.map(importPath => {
            // Handle relative imports
            if (importPath.startsWith('./') || importPath.startsWith('../')) {
                const dir = path.dirname(currentFilePath);
                return path.resolve(dir, importPath);
            }
            
            // For non-relative imports, just return as is
            return importPath;
        });
    }

    /**
     * Identify which code elements a test covers
     */
    private identifyCoveredCode(testBody: string, testCase: TestCase, importedModules: string[]): void {
        // Simplified implementation - in a real extension, use proper code analysis
        
        // Look for function/method calls in the test body
        const functionCallPattern = /\b(\w+)\s*\(/g;
        let match;
        
        // Set to track unique IDs
        const coveredIds = new Set<string>();
        
        while ((match = functionCallPattern.exec(testBody)) !== null) {
            const calledFunction = match[1];
            
            // Skip common test functions and control structures
            if (['if', 'while', 'for', 'switch', 'catch', 'describe', 'it', 'test', 'expect', 'assert', 'should'].includes(calledFunction)) {
                continue;
            }
            
            // Create an ID for the called function
            const functionId = this.codeParser.generateElementId('function', calledFunction, '');
            
            // Add to covered elements if not already added
            if (!coveredIds.has(functionId)) {
                coveredIds.add(functionId);
                testCase.coveredElements.push({
                    targetId: functionId,
                    weight: 0.8 // High confidence that it's testing this function
                });
            }
        }
        
        // Look for class/object references
        const objectReferencePattern = /\bnew\s+(\w+)\s*\(/g;
        while ((match = objectReferencePattern.exec(testBody)) !== null) {
            const className = match[1];
            
            // Create an ID for the class
            const classId = this.codeParser.generateElementId('class', className, '');
            
            // Add to covered elements if not already added
            if (!coveredIds.has(classId)) {
                coveredIds.add(classId);
                testCase.coveredElements.push({
                    targetId: classId,
                    weight: 0.9 // Very high confidence it's testing this class
                });
            }
        }
    }

    /**
     * Identify which code elements a Java test covers
     */
    private identifyCoveredCodeJava(testBody: string, testCase: TestCase, imports: string[], packageName: string | null): void {
        // Simplified implementation - similar approach as general identifyCoveredCode
        this.identifyCoveredCode(testBody, testCase, imports);
    }

    /**
     * Generate a unique ID for a test node
     */
    public generateNodeId(testName: string, filePath: string): string {
        const input = `test:${testName}:${filePath}`;
        const hash = crypto.createHash('md5').update(input).digest('hex');
        return `test_${hash}`;
    }
}