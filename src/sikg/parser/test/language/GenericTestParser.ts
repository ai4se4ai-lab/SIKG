// GenericTestParser.ts - Generic fallback parser for any language

import * as path from 'path';
import { TestCase } from './../../../GraphTypes';
import { Logger } from '../../../../utils/Logger';
import { ParserUtils } from '../../util/ParserUtils';
import { TestParserBase } from './../TestParserBase';
import { CodeParserBase } from '../../code/CodeParserBase';

/**
 * Generic test parser that provides basic parsing for any language
 * This is used as a fallback when no language-specific parser is available
 */
export class GenericTestParser extends TestParserBase {
    /**
     * Get the language supported by this parser
     */
    public getLanguage(): string {
        return 'generic';
    }

    /**
     * Check if this parser can handle a given file
     * It only returns true if the file appears to be a test file
     */
    public canHandle(filePath: string, content?: string): boolean {
        return this.isTestFile(filePath, content);
    }

    /**
     * Parse a test file using generic patterns that work across languages
     * @param content Content of the file to parse
     * @param filePath Path to the file
     * @returns Array of test cases extracted from the file
     */
    public async parseTestFile(content: string, filePath: string): Promise<TestCase[]> {
        Logger.debug(`Parsing test file with generic parser: ${filePath}`);
        return this.parseGenericTests(content, filePath);
    }

    /**
     * Generic test parser that works across multiple languages
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
                        const endLine = this.findScopeEnd(lines, lineIndex);
                        
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
                        this.identifyCoveredCode(testBody, testCase);
                        
                        testCases.push(testCase);
                        
                        // Skip to the end of this test to avoid detecting nested functions as tests
                        lineIndex = endLine;
                        break;
                    }
                }
            }
            
            return testCases;
            
        } catch (error) {
            return this.handleError(filePath, error);
        }
    }

    /**
     * Find the end of a scope (method, function, etc.)
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
     * Identify which code elements a test covers
     * @param testBody Test body content
     * @param testCase Test case to update
     */
    private identifyCoveredCode(testBody: string, testCase: TestCase): void {
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
            const functionId = ParserUtils.generateElementId('function', calledFunction, '');
            
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
            const classId = ParserUtils.generateElementId('class', className, '');
            
            // Add to covered elements if not already added
            if (!coveredIds.has(classId)) {
                coveredIds.add(classId);
                testCase.coveredElements.push({
                    targetId: classId,
                    weight: 0.9 // Very high confidence it's testing this class
                });
            }
        }
        
        // Look for method calls on objects (obj.method())
        const methodCallPattern = /(\w+)\.(\w+)\s*\(/g;
        while ((match = methodCallPattern.exec(testBody)) !== null) {
            const objectName = match[1];
            const methodName = match[2];
            
            // Skip assertion methods
            if (['assert', 'expect', 'should'].includes(objectName)) {
                continue;
            }
            
            // Create an ID for the object class
            const classId = ParserUtils.generateElementId('class', objectName, '');
            
            // Add class to covered elements if not already added
            if (!coveredIds.has(classId)) {
                coveredIds.add(classId);
                testCase.coveredElements.push({
                    targetId: classId,
                    weight: 0.7 // Good confidence it's testing this class
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
        
        // Look for assertions
        const assertionPattern = /\b(?:assert|expect|should|verify|check|must)\b[^;]*?[\s\(](\w+)[^\w]/g;
        while ((match = assertionPattern.exec(testBody)) !== null) {
            if (match[1]) {
                const assertedName = match[1];
                
                // Skip common test keywords
                if (['true', 'false', 'null', 'undefined', 'equal', 'equals'].includes(assertedName)) {
                    continue;
                }
                
                // Create an ID for the possible element being tested
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