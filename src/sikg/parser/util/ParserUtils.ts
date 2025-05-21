// ParserUtils.ts - Common utilities for all parsers

import * as path from 'path';
import * as crypto from 'crypto';
import { Logger } from '../../../utils/Logger';

/**
 * Utility functions for parsing and analyzing code and test files
 */
export class ParserUtils {
    /**
     * Generate a unique ID for a code element
     * @param kind Type of code element (function, class, method, etc.)
     * @param name Name of the code element
     * @param filePath Path to the file containing the element
     * @returns A unique identifier string
     */
    public static generateElementId(kind: string, name: string, filePath: string): string {
        const input = `${kind}:${name}:${filePath}`;
        const hash = crypto.createHash('md5').update(input).digest('hex');
        return `${kind}_${hash}`;
    }

    /**
     * Generate a unique ID for a test node
     * @param testName Name of the test
     * @param filePath Path to the test file
     * @returns A unique identifier string
     */
    public static generateTestId(testName: string, filePath: string): string {
        const input = `test:${testName}:${filePath}`;
        const hash = crypto.createHash('md5').update(input).digest('hex');
        return `test_${hash}`;
    }

    /**
     * Get indentation level of a line
     * @param line Line of code to analyze
     * @returns Number of spaces in the indentation
     */
    public static getIndentation(line: string): number {
        const match = line.match(/^(\s*)/);
        return match ? match[1].length : 0;
    }

    /**
     * Check if a file is a Python file
     * @param filePath Path to the file
     * @returns True if the file is a Python file
     */
    public static isPythonFile(filePath: string): boolean {
        return path.extname(filePath).toLowerCase() === '.py';
    }

    /**
     * Check if a file is a JavaScript/TypeScript file
     * @param filePath Path to the file
     * @returns True if the file is a JS/TS file
     */
    public static isJavaScriptFile(filePath: string): boolean {
        const ext = path.extname(filePath).toLowerCase();
        return ext === '.js' || ext === '.jsx' || ext === '.ts' || ext === '.tsx';
    }

    /**
     * Check if a file is a Java file
     * @param filePath Path to the file
     * @returns True if the file is a Java file
     */
    public static isJavaFile(filePath: string): boolean {
        return path.extname(filePath).toLowerCase() === '.java';
    }

    /**
     * Check if a file is a C# file
     * @param filePath Path to the file
     * @returns True if the file is a C# file
     */
    public static isCSharpFile(filePath: string): boolean {
        return path.extname(filePath).toLowerCase() === '.cs';
    }

    /**
     * Check if a file is a Go file
     * @param filePath Path to the file
     * @returns True if the file is a Go file
     */
    public static isGoFile(filePath: string): boolean {
        return path.extname(filePath).toLowerCase() === '.go';
    }

    /**
     * Extract the language from a file path
     * @param filePath Path to the file
     * @returns The language name or 'generic' if not recognized
     */
    public static getLanguageFromFilePath(filePath: string): string {
        if (this.isPythonFile(filePath)) return 'python';
        if (this.isJavaScriptFile(filePath)) return 'javascript';
        if (this.isJavaFile(filePath)) return 'java';
        if (this.isCSharpFile(filePath)) return 'csharp';
        if (this.isGoFile(filePath)) return 'go';
        return 'generic';
    }

    /**
     * Detect if text content looks like a Python file
     * @param content File content to analyze
     * @returns True if the content appears to be Python code
     */
    public static detectPythonContent(content: string): boolean {
        // Check for common Python patterns
        return content.includes('import ') || 
               content.includes('def ') || 
               content.includes('class ') ||
               content.includes('if __name__ == ') ||
               content.includes('print(');
    }

    /**
     * Detect if content appears to be a test file
     * @param content File content to analyze
     * @param filePath Path to the file
     * @returns True if the content appears to be a test file
     */
    public static detectTestFile(content: string, filePath: string): boolean {
        const filename = path.basename(filePath).toLowerCase();
        const isTestFilename = filename.includes('test') || 
                              filename.startsWith('test_') ||
                              filename.endsWith('_test');
        
        const hasTestContent = content.includes('test') &&
                             (content.includes('assert') || 
                              content.includes('expect') ||
                              content.includes('should'));
        
        return isTestFilename || hasTestContent;
    }

    /**
     * Safely execute a function with error logging
     * @param func Function to execute
     * @param errorMessage Message to log if an error occurs
     * @param defaultValue Default value to return if an error occurs
     * @returns Result of the function or default value if error
     */
    public static safeExecute<T>(func: () => T, errorMessage: string, defaultValue: T): T {
        try {
            return func();
        } catch (error) {
            Logger.error(errorMessage, error);
            return defaultValue;
        }
    }
}