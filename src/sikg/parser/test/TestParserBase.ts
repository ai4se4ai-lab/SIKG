// TestParserBase.ts - Abstract base class for test parsers

import { TestCase } from '../../GraphTypes';
import { Logger } from '../../../utils/Logger';
import { ParserUtils } from '../util/ParserUtils';
import { CodeParserBase } from '../code/CodeParserBase';
import * as path from 'path';

/**
 * Abstract base class for all test parsers
 */
export abstract class TestParserBase {
    protected codeParser: CodeParserBase;

    constructor(codeParser: CodeParserBase) {
        this.codeParser = codeParser;
    }

    /**
     * Parse a test file and extract test cases
     * @param content Content of the file to parse
     * @param filePath Path to the file
     * @returns Array of test cases extracted from the file
     */
    public abstract parseTestFile(content: string, filePath: string): Promise<TestCase[]>;

    /**
     * Clean up any resources used by this parser
     */
    public abstract dispose(): void;

    /**
     * Check if this parser can handle a given file
     * @param filePath Path to the file
     * @param content Optional content of the file
     * @returns True if this parser can handle the file
     */
    public abstract canHandle(filePath: string, content?: string): boolean;

    /**
     * Get the language supported by this parser
     */
    public abstract getLanguage(): string;

    /**
     * Detect the type of a test (unit, integration, e2e)
     * @param testBody The test body content
     * @param testName The name of the test
     * @returns The test type (unit, integration, e2e)
     */
    protected detectTestType(testBody: string, testName: string): TestCase['testType'] {
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
     * Generate a unique ID for a test node
     * @param testName Name of the test
     * @param filePath Path to the test file
     * @returns A unique identifier string
     */
    protected generateNodeId(testName: string, filePath: string): string {
        return ParserUtils.generateTestId(testName, filePath);
    }

    /**
     * Get indentation level of a line
     * @param line Line of code to analyze
     * @returns Number of spaces in the indentation
     */
    protected getIndentation(line: string): number {
        return ParserUtils.getIndentation(line);
    }

    /**
     * Log an error and return an empty array
     * @param filePath Path of the file being processed
     * @param error Error that occurred
     * @returns Empty array of test cases
     */
    protected handleError(filePath: string, error: any): TestCase[] {
        Logger.error(`Error parsing test file ${filePath}:`, error);
        return [];
    }

    /**
     * Check if a file is a test file
     * @param filePath Path to check
     * @param content Optional content to check
     * @returns True if the file appears to be a test file
     */
    protected isTestFile(filePath: string, content?: string): boolean {
        // Check the file name for test indicators
        const fileName = path.basename(filePath).toLowerCase();
        if (
            fileName.startsWith('test_') ||
            fileName.endsWith('_test') ||
            fileName.includes('test') ||
            fileName.includes('spec')
        ) {
            return true;
        }

        // If content is provided, check for test patterns
        if (content) {
            return (
                content.includes('test') && 
                (content.includes('assert') || 
                 content.includes('expect') || 
                 content.includes('should'))
            );
        }

        return false;
    }
}