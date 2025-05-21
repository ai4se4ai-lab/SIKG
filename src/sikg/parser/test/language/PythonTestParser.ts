// PythonTestParser.ts - Python-specific test parser implementation

import * as path from 'path';
import * as fs from 'fs';
import { TestCase } from '../../../GraphTypes';
import { Logger } from '../../../../utils/Logger';
import { ParserUtils } from '../../util/ParserUtils';
import { FileUtils } from '../../util/FileUtils';
import { AstProcessorManager } from '../../util/AstProcessorManager';
import { AstScripts } from '../../util/AstScripts';
import { TestParserBase } from './../TestParserBase';
import { CodeParserBase } from '../../code/CodeParserBase';

/**
 * Python-specific test parser implementation using AST
 */
export class PythonTestParser extends TestParserBase {
    private astProcessorManager: AstProcessorManager;
    private astEnabled: boolean = false;

    constructor(codeParser: CodeParserBase, astProcessorManager: AstProcessorManager) {
        super(codeParser);
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
        // Check if it's a Python file
        if (!ParserUtils.isPythonFile(filePath)) {
            return false;
        }

        // Check if it seems to be a test file
        return this.isTestFile(filePath, content);
    }

    /**
     * Parse a Python test file and extract test cases
     * @param content Content of the file to parse
     * @param filePath Path to the file
     * @returns Array of test cases extracted from the file
     */
    public async parseTestFile(content: string, filePath: string): Promise<TestCase[]> {
        Logger.debug(`Parsing Python test file: ${filePath}`);

        try {
            // Use AST parsing if available
            if (this.astEnabled) {
                return await this.parsePythonTestsWithAst(content, filePath);
            } else {
                // Fall back to regex-based parsing
                Logger.debug(`AST parsing not available, using regex-based parsing for test file ${filePath}`);
                return this.parsePythonTestsWithRegex(content, filePath);
            }
        } catch (error) {
            return this.handleError(filePath, error);
        }
    }

    /**
     * Parse Python tests using AST-based analysis
     * @param content Content of the file to parse
     * @param filePath Path to the file
     * @returns Array of test cases extracted from the file
     */
    private async parsePythonTestsWithAst(content: string, filePath: string): Promise<TestCase[]> {
        Logger.debug(`Parsing Python test file with AST: ${filePath}`);
        
        try {
            // Create a temporary file with the content
            const tempFilePath = FileUtils.createTempFileWithContent(
                this.astProcessorManager.getTempDir(),
                `temp_test_${Date.now()}.py`,
                content
            );
            
            // Get the Python test AST parser script
            const scriptContent = AstScripts.getScript('python_test_ast_parser.py');
            if (!scriptContent) {
                throw new Error('Python test AST parser script not found');
            }

            // Execute the AST parser
            const output = this.astProcessorManager.processFile('python_test_ast_parser.py', scriptContent, tempFilePath);
            
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
            
            // Convert the AST data to TestCases
            return this.convertAstToTestCases(astData, filePath);
        } catch (error) {
            Logger.error(`Error parsing Python test file with AST ${filePath}:`, error);
            // Fallback to the regex-based parser
            Logger.debug(`Falling back to regex-based parser for test file ${filePath}`);
            return this.parsePythonTestsWithRegex(content, filePath);
        }
    }

    /**
     * Convert AST data to TestCases
     * @param astData AST data from the Python parser
     * @param filePath Path to the file
     * @returns Array of test cases extracted from the AST data
     */
    private convertAstToTestCases(astData: any, filePath: string): TestCase[] {
        const testCases: TestCase[] = [];
        
        // Process unittest test classes
        for (const testClass of astData.unittest_classes) {
            for (const testMethod of testClass.test_methods) {
                const testName = `${testClass.name}.${testMethod.name}`;
                const testId = this.generateNodeId(testName, filePath);
                
                const testCase: TestCase = {
                    id: testId,
                    name: testName,
                    testType: this.detectTestType(testMethod.body, testName),
                    filePath,
                    loc: {
                        start: { line: testMethod.start_line, column: testMethod.start_col },
                        end: { line: testMethod.end_line, column: testMethod.end_col }
                    },
                    coveredElements: []
                };
                
                // Add covered elements based on assertions and calls
                for (const assertion of testMethod.assertions) {
                    // Extract functions/methods involved in assertions
                    for (const func of assertion.functions) {
                        const targetId = ParserUtils.generateElementId(
                            func.is_method ? 'method' : 'function',
                            func.name,
                            assertion.module || ''
                        );
                        
                        testCase.coveredElements.push({
                            targetId,
                            weight: assertion.confidence || 0.8
                        });
                    }
                }
                
                // Add covered elements based on direct function calls
                for (const call of testMethod.calls) {
                    const targetId = ParserUtils.generateElementId(
                        call.is_method ? 'method' : 'function',
                        call.name,
                        call.module || ''
                    );
                    
                    testCase.coveredElements.push({
                        targetId,
                        weight: 0.7
                    });
                }
                
                // Add covered modules
                for (const module of testMethod.modules) {
                    const targetId = ParserUtils.generateElementId(
                        'module',
                        module,
                        module
                    );
                    
                    testCase.coveredElements.push({
                        targetId,
                        weight: 0.5
                    });
                }
                
                testCases.push(testCase);
            }
        }
        
        // Process pytest-style test functions
        for (const testFunc of astData.pytest_functions) {
            const testId = this.generateNodeId(testFunc.name, filePath);
            
            const testCase: TestCase = {
                id: testId,
                name: testFunc.name,
                testType: this.detectTestType(testFunc.body, testFunc.name),
                filePath,
                loc: {
                    start: { line: testFunc.start_line, column: testFunc.start_col },
                    end: { line: testFunc.end_line, column: testFunc.end_col }
                },
                coveredElements: []
            };
            
            // Add covered elements based on assertions and calls
            for (const assertion of testFunc.assertions) {
                // Extract functions/methods involved in assertions
                for (const func of assertion.functions) {
                    const targetId = ParserUtils.generateElementId(
                        func.is_method ? 'method' : 'function',
                        func.name,
                        assertion.module || ''
                    );
                    
                    testCase.coveredElements.push({
                        targetId,
                        weight: assertion.confidence || 0.8
                    });
                }
            }
            
            // Add covered elements based on direct function calls
            for (const call of testFunc.calls) {
                const targetId = ParserUtils.generateElementId(
                    call.is_method ? 'method' : 'function',
                    call.name,
                    call.module || ''
                );
                
                testCase.coveredElements.push({
                    targetId,
                    weight: 0.7
                });
            }
            
            // Add covered modules
            for (const module of testFunc.modules) {
                const targetId = ParserUtils.generateElementId(
                    'module',
                    module,
                    module
                );
                
                testCase.coveredElements.push({
                    targetId,
                    weight: 0.5
                });
            }
            
            testCases.push(testCase);
        }
        
        // Deduplicate covered elements
        this.deduplicateCoveredElements(testCases);
        
        return testCases;
    }

    /**
     * Deduplicate covered elements in test cases
     * @param testCases Test cases to process
     */
    private deduplicateCoveredElements(testCases: TestCase[]): void {
        for (const testCase of testCases) {
            const uniqueCoveredElements = new Map<string, { targetId: string; weight?: number }>();
            
            for (const element of testCase.coveredElements) {
                if (!uniqueCoveredElements.has(element.targetId) || 
                    (element.weight || 0) > (uniqueCoveredElements.get(element.targetId)?.weight || 0)) {
                    uniqueCoveredElements.set(element.targetId, element);
                }
            }
            
            testCase.coveredElements = Array.from(uniqueCoveredElements.values());
        }
    }

    /**
     * Parse Python tests using regex-based parsing (fallback method)
     * @param content Content of the file to parse
     * @param filePath Path to the file
     * @returns Array of test cases extracted from the file
     */
    private parsePythonTestsWithRegex(content: string, filePath: string): TestCase[] {
        Logger.debug(`Using regex-based parsing for Python test file: ${filePath}`);
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
                } else if (isPytest || true) { // Always look for pytest-style tests as fallback
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
                }
            }
            
            return testCases;
            
        } catch (error) {
            return this.handleError(filePath, error);
        }
    }

    /**
     * Identify which code elements a Python test covers
     * @param testBody Test body content
     * @param testCase Test case to update
     * @param filePath Path to the test file
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
                const moduleId = ParserUtils.generateElementId('module', importPath, importPath);
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
            const functionId = ParserUtils.generateElementId('function', calledFunctionName, '');
            
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
            const classId = ParserUtils.generateElementId('class', objectName, '');
            
            // Add class to covered elements if not already added
            if (!coveredIds.has(classId)) {
                coveredIds.add(classId);
                testCase.coveredElements.push({
                    targetId: classId,
                    weight: 0.9 // Very high confidence it's testing this class
                });
            }
            
            // Create an ID for the method
            const methodId = ParserUtils.generateElementId('method', methodName, '');
            
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
                const elementId = ParserUtils.generateElementId('function', assertedName, '');
                
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
     * Clean up any resources used by this parser
     */
    public dispose(): void {
        // Nothing to dispose for this parser
    }
}