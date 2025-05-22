// ParserUtils.ts - Common utilities for all parsers with enhanced ID generation consistency

import * as path from 'path';
import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { Logger } from '../../../utils/Logger';

/**
 * Utility functions for parsing and analyzing code and test files
 */
export class ParserUtils {
    /**
     * Generate a unique ID for a code element with consistent path handling
     * @param kind Type of code element (function, class, method, etc.)
     * @param name Name of the code element
     * @param filePath Path to the file containing the element
     * @returns A unique identifier string
     */
    public static generateElementId(kind: string, name: string, filePath: string): string {
        // Normalize the file path for consistent ID generation
        const normalizedPath = this.normalizeFilePath(filePath);
        const input = `${kind}:${name}:${normalizedPath}`;
        const hash = crypto.createHash('md5').update(input).digest('hex');
        return `${kind}_${hash}`;
    }

    /**
     * Generate a unique ID for a test node with consistent path handling
     * @param testName Name of the test
     * @param filePath Path to the test file
     * @returns A unique identifier string
     */
    public static generateTestId(testName: string, filePath: string): string {
        // Normalize the file path for consistent ID generation
        const normalizedPath = this.normalizeFilePath(filePath);
        const input = `test:${testName}:${normalizedPath}`;
        const hash = crypto.createHash('md5').update(input).digest('hex');
        return `test_${hash}`;
    }

    /**
     * Normalize file path for consistent ID generation across different contexts
     * @param filePath Path to normalize
     * @returns Normalized path
     */
    private static normalizeFilePath(filePath: string): string {
        if (!filePath) {
            return '';
        }

        // Convert to absolute path if possible
        let normalizedPath = filePath;

        try {
            // If we have a workspace, resolve relative to workspace
            if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
                
                if (path.isAbsolute(filePath)) {
                    // If the path is already absolute, check if it's within the workspace
                    const relativePath = path.relative(workspaceRoot, filePath);
                    if (!relativePath.startsWith('..')) {
                        // Path is within workspace, use relative path for consistency
                        normalizedPath = relativePath;
                    } else {
                        // Path is outside workspace, use absolute path
                        normalizedPath = path.normalize(filePath);
                    }
                } else {
                    // Path is relative, keep it relative but normalize
                    normalizedPath = path.normalize(filePath);
                }
            } else {
                // No workspace, normalize the path as-is
                normalizedPath = path.normalize(filePath);
            }
        } catch (error) {
            Logger.debug(`Error normalizing path ${filePath}:`, error);
            normalizedPath = path.normalize(filePath);
        }

        // Always use forward slashes for consistency across platforms
        return normalizedPath.replace(/\\/g, '/');
    }

    /**
     * Get workspace-relative path if possible, otherwise return the original path
     * @param filePath Path to convert
     * @returns Workspace-relative path or original path
     */
    public static getWorkspaceRelativePath(filePath: string): string {
        if (!filePath) {
            return '';
        }

        try {
            if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
                
                if (path.isAbsolute(filePath)) {
                    const relativePath = path.relative(workspaceRoot, filePath);
                    if (!relativePath.startsWith('..')) {
                        return relativePath.replace(/\\/g, '/');
                    }
                }
            }
        } catch (error) {
            Logger.debug(`Error getting workspace relative path for ${filePath}:`, error);
        }

        return filePath.replace(/\\/g, '/');
    }

    /**
     * Convert workspace-relative path to absolute path
     * @param relativePath Workspace-relative path
     * @returns Absolute path
     */
    public static resolveWorkspacePath(relativePath: string): string {
        if (!relativePath) {
            return '';
        }

        if (path.isAbsolute(relativePath)) {
            return relativePath;
        }

        try {
            if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
                return path.resolve(workspaceRoot, relativePath);
            }
        } catch (error) {
            Logger.debug(`Error resolving workspace path ${relativePath}:`, error);
        }

        return path.resolve(relativePath);
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

    // /**
    //  * Check if a file is a Python file
    //  * @param filePath Path to the file
    //  * @returns True if the file is a Python file
    //  */
    // public static isPythonFile(filePath: string): boolean {
    //     return path.extname(filePath).toLowerCase() === '.py';
    // }

    // /**
    //  * Check if a file is a JavaScript/TypeScript file
    //  * @param filePath Path to the file
    //  * @returns True if the file is a JS/TS file
    //  */
    // public static isJavaScriptFile(filePath: string): boolean {
    //     const ext = path.extname(filePath).toLowerCase();
    //     return ext === '.js' || ext === '.jsx' || ext === '.ts' || ext === '.tsx';
    // }

    // /**
    //  * Check if a file is a Java file
    //  * @param filePath Path to the file
    //  * @returns True if the file is a Java file
    //  */
    // public static isJavaFile(filePath: string): boolean {
    //     return path.extname(filePath).toLowerCase() === '.java';
    // }

    // /**
    //  * Check if a file is a C# file
    //  * @param filePath Path to the file
    //  * @returns True if the file is a C# file
    //  */
    // public static isCSharpFile(filePath: string): boolean {
    //     return path.extname(filePath).toLowerCase() === '.cs';
    // }

    // /**
    //  * Check if a file is a Go file
    //  * @param filePath Path to the file
    //  * @returns True if the file is a Go file
    //  */
    // public static isGoFile(filePath: string): boolean {
    //     return path.extname(filePath).toLowerCase() === '.go';
    // }

    /**
     * Extract the language from a file path
     * @param filePath Path to the file
     * @returns The language name or 'generic' if not recognized
     */
    // public static getLanguageFromFilePath(filePath: string): string {
    //     if (this.isPythonFile(filePath)) return 'python';
    //     if (this.isJavaScriptFile(filePath)) return 'javascript';
    //     if (this.isJavaFile(filePath)) return 'java';
    //     if (this.isCSharpFile(filePath)) return 'csharp';
    //     if (this.isGoFile(filePath)) return 'go';
    //     return 'generic';
    // }

    /**
     * Detect if text content looks like a Python file
     * @param content File content to analyze
     * @returns True if the content appears to be Python code
     */
    // public static detectPythonContent(content: string): boolean {
    //     // Check for common Python patterns
    //     return content.includes('import ') || 
    //            content.includes('def ') || 
    //            content.includes('class ') ||
    //            content.includes('if __name__ == ') ||
    //            content.includes('print(');
    // }

    /**
     * Detect if content appears to be a test file
     * @param content File content to analyze
     * @param filePath Path to the file
     * @returns True if the content appears to be a test file
     */
    // public static detectTestFile(content: string, filePath: string): boolean {
    //     const filename = path.basename(filePath).toLowerCase();
    //     const isTestFilename = filename.includes('test') || 
    //                           filename.startsWith('test_') ||
    //                           filename.endsWith('_test');
        
    //     const hasTestContent = content.includes('test') &&
    //                          (content.includes('assert') || 
    //                           content.includes('expect') ||
    //                           content.includes('should'));
        
    //     return isTestFilename || hasTestContent;
    // }

    /**
     * Extract function name from test name using naming conventions
     * @param testName Name of the test function
     * @returns Likely function name being tested, or null if not found
     */
    public static extractTestedFunctionName(testName: string): string | null {
        // Handle unittest style: "TestClass.test_function_name"
        if (testName.includes('.')) {
            const parts = testName.split('.');
            const methodName = parts[parts.length - 1];
            
            if (methodName.startsWith('test_')) {
                return methodName.substring(5); // Remove 'test_' prefix
            }
            
            if (methodName.startsWith('test')) {
                // Handle camelCase: testFunctionName -> functionName
                const withoutTest = methodName.substring(4);
                if (withoutTest.length > 0) {
                    return withoutTest.charAt(0).toLowerCase() + withoutTest.slice(1);
                }
            }
        }
        
        // Handle pytest style: "test_function_name"
        if (testName.startsWith('test_')) {
            return testName.substring(5); // Remove 'test_' prefix
        }
        
        // Handle camelCase pytest style: "testFunctionName"
        if (testName.startsWith('test') && testName.length > 4) {
            const withoutTest = testName.substring(4);
            if (withoutTest.length > 0 && withoutTest.charAt(0) === withoutTest.charAt(0).toUpperCase()) {
                return withoutTest.charAt(0).toLowerCase() + withoutTest.slice(1);
            }
        }
        
        return null;
    }

    /**
     * Generate multiple possible function names from a test name
     * @param testName Name of the test function
     * @returns Array of possible function names being tested
     */
    public static generatePossibleFunctionNames(testName: string): string[] {
        const possibleNames: string[] = [];
        
        // Primary extraction
        const primaryName = this.extractTestedFunctionName(testName);
        if (primaryName) {
            possibleNames.push(primaryName);
        }
        
        // Additional variations
        const baseName = testName.replace(/^test_?/i, '').replace(/^Test/, '');
        
        if (baseName && baseName !== primaryName) {
            // Snake case variation
            possibleNames.push(baseName.toLowerCase());
            
            // Camel case variation
            if (baseName.includes('_')) {
                const camelCase = baseName.split('_')
                    .map((word, index) => index === 0 ? word.toLowerCase() : 
                         word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                    .join('');
                possibleNames.push(camelCase);
            }
            
            // As-is variation
            possibleNames.push(baseName);
        }
        
        // Remove duplicates and empty strings
        return [...new Set(possibleNames.filter(name => name && name.length > 0))];
    }

    /**
     * Check if two file paths refer to the same file (accounting for different representations)
     * @param path1 First file path
     * @param path2 Second file path
     * @returns True if the paths refer to the same file
     */
    public static isSameFile(path1: string, path2: string): boolean {
        if (!path1 || !path2) {
            return false;
        }
        
        // Normalize both paths
        const normalized1 = this.normalizeFilePath(path1);
        const normalized2 = this.normalizeFilePath(path2);
        
        return normalized1 === normalized2;
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

    /**
     * Find common patterns in import statements to improve name resolution
     * @param content File content to analyze
     * @returns Object containing import information
     */
    public static analyzeImports(content: string): ImportAnalysis {
        const analysis: ImportAnalysis = {
            directImports: new Map(),
            fromImports: new Map(),
            aliasedImports: new Map()
        };
        
        // Pattern for "import module" or "import module as alias"
        const directImportPattern = /^\s*import\s+([^\s#]+)(?:\s+as\s+([^\s#]+))?/gm;
        
        // Pattern for "from module import name" or "from module import name as alias"
        const fromImportPattern = /^\s*from\s+([^\s]+)\s+import\s+([^#\n]+)/gm;
        
        let match;
        
        // Process direct imports
        while ((match = directImportPattern.exec(content)) !== null) {
            const moduleName = match[1].trim();
            const alias = match[2] ? match[2].trim() : null;
            
            if (alias) {
                analysis.aliasedImports.set(alias, moduleName);
            } else {
                analysis.directImports.set(moduleName, moduleName);
            }
        }
        
        // Process from imports
        while ((match = fromImportPattern.exec(content)) !== null) {
            const moduleName = match[1].trim();
            const importedItems = match[2].split(',').map(item => {
                const parts = item.trim().split(/\s+as\s+/);
                const name = parts[0].trim();
                const alias = parts[1] ? parts[1].trim() : null;
                return { name, alias };
            });
            
            for (const item of importedItems) {
                if (item.name && item.name !== '*') {
                    const key = item.alias || item.name;
                    if (!analysis.fromImports.has(moduleName)) {
                        analysis.fromImports.set(moduleName, new Map());
                    }
                    analysis.fromImports.get(moduleName)!.set(key, item.name);
                }
            }
        }
        
        return analysis;
    }

    /**
     * Resolve a name to its likely source module and file path
     * @param name Name to resolve
     * @param importAnalysis Import analysis for the current file
     * @param currentFilePath Path of the current file
     * @returns Resolved information about the name
     */
    public static resolveName(
        name: string, 
        importAnalysis: ImportAnalysis, 
        currentFilePath: string
    ): NameResolution | null {
        const currentDir = path.dirname(currentFilePath);
        
        // Check if it's a direct import or alias
        if (importAnalysis.aliasedImports.has(name)) {
            const moduleName = importAnalysis.aliasedImports.get(name)!;
            return {
                name,
                moduleName,
                filePath: this.resolveModuleToFile(moduleName, currentDir),
                confidence: 0.9
            };
        }
        
        if (importAnalysis.directImports.has(name)) {
            const moduleName = importAnalysis.directImports.get(name)!;
            return {
                name,
                moduleName,
                filePath: this.resolveModuleToFile(moduleName, currentDir),
                confidence: 0.9
            };
        }
        
        // Check if it's from a "from ... import ..." statement
        for (const [moduleName, imports] of importAnalysis.fromImports.entries()) {
            if (imports.has(name)) {
                const originalName = imports.get(name)!;
                return {
                    name: originalName,
                    moduleName,
                    filePath: this.resolveModuleToFile(moduleName, currentDir),
                    confidence: 0.95
                };
            }
        }
        
        return null;
    }

    /**
     * Resolve a module name to a file path
     * @param moduleName Name of the module
     * @param currentDir Directory to search from
     * @returns File path if found, null otherwise
     */
    private static resolveModuleToFile(moduleName: string, currentDir: string): string | null {
        // Handle relative imports
        if (moduleName.startsWith('.')) {
            const relativePath = moduleName.substring(1);
            const resolvedPath = path.join(currentDir, relativePath + '.py');
            try {
                if (require('fs').existsSync(resolvedPath)) {
                    return resolvedPath;
                }
            } catch (error) {
                // Ignore file system errors
            }
        }
        
        // Handle absolute imports within the same directory
        const sameDirPath = path.join(currentDir, moduleName + '.py');
        try {
            if (require('fs').existsSync(sameDirPath)) {
                return sameDirPath;
            }
        } catch (error) {
            // Ignore file system errors
        }
        
        return null;
    }


     /**
     * Extract the language from a file path - FIXED to use VS Code language identifiers
     * @param filePath Path to the file
     * @returns The VS Code language identifier or 'plaintext' if not recognized
     */
    public static getLanguageFromFilePath(filePath: string): string {
        const extension = path.extname(filePath).toLowerCase();
        
        // Map file extensions to VS Code language identifiers
        const extensionToLanguage: Record<string, string> = {
            '.py': 'python',
            '.js': 'javascript', 
            '.jsx': 'javascript',
            '.ts': 'typescript',
            '.tsx': 'typescript',
            '.java': 'java',
            '.cs': 'csharp',
            '.go': 'go',
            '.php': 'php',
            '.rb': 'ruby',
            '.cpp': 'cpp',
            '.c': 'c',
            '.h': 'c',
            '.hpp': 'cpp',
            '.kt': 'kotlin',
            '.scala': 'scala',
            '.swift': 'swift',
            '.rs': 'rust'
        };

        const language = extensionToLanguage[extension];
        if (language) {
            return language;
        }

        // Try to get language from VS Code's language service
        try {
            const document = vscode.workspace.textDocuments.find(doc => 
                doc.fileName === filePath || doc.fileName.endsWith(filePath)
            );
            
            if (document) {
                return document.languageId;
            }
        } catch (error) {
            Logger.debug(`Could not determine language from VS Code for ${filePath}:`, error);
        }

        // Default fallback
        return 'plaintext';
    }

    /**
     * Get language from VS Code document
     * @param document VS Code text document
     * @returns Language identifier
     */
    public static getLanguageFromDocument(document: vscode.TextDocument): string {
        return document.languageId;
    }

    /**
     * Check if a language is supported by SIKG
     * @param language Language identifier
     * @returns True if supported
     */
    public static isSupportedLanguage(language: string): boolean {
        const supportedLanguages = [
            'python',
            'javascript', 
            'typescript',
            'java',
            'csharp',
            'go'
        ];
        
        return supportedLanguages.includes(language.toLowerCase());
    }

    /**
     * Get parser type for a language
     * @param language Language identifier
     * @returns Parser type ('ast' or 'regex')
     */
    public static getParserTypeForLanguage(language: string): 'ast' | 'regex' {
        const astSupportedLanguages = ['python', 'javascript', 'typescript'];
        return astSupportedLanguages.includes(language.toLowerCase()) ? 'ast' : 'regex';
    }

    /**
     * Check if a file is a Python file - UPDATED
     * @param filePath Path to the file
     * @returns True if the file is a Python file
     */
    public static isPythonFile(filePath: string): boolean {
        return this.getLanguageFromFilePath(filePath) === 'python';
    }

    /**
     * Check if a file is a JavaScript/TypeScript file - UPDATED
     * @param filePath Path to the file
     * @returns True if the file is a JS/TS file
     */
    // public static isJavaScriptFile(filePath: string): boolean {
    //     const language = this.getLanguageFromFilePath(filePath);
    //     return language === 'javascript' || language === 'typescript';
    // }

    /**
     * Check if a file is a Java file - UPDATED
     * @param filePath Path to the file
     * @returns True if the file is a Java file
     */
    // public static isJavaFile(filePath: string): boolean {
    //     return this.getLanguageFromFilePath(filePath) === 'java';
    // }

    /**
     * Check if a file is a C# file - UPDATED
     * @param filePath Path to the file
     * @returns True if the file is a C# file
     */
    // public static isCSharpFile(filePath: string): boolean {
    //     return this.getLanguageFromFilePath(filePath) === 'csharp';
    // }

    /**
     * Check if a file is a Go file - UPDATED
     * @param filePath Path to the file
     * @returns True if the file is a Go file
     */
    // public static isGoFile(filePath: string): boolean {
    //     return this.getLanguageFromFilePath(filePath) === 'go';
    // }

    /**
     * Detect if text content looks like a Python file - ENHANCED
     * @param content File content to analyze
     * @returns True if the content appears to be Python code
     */
    public static detectPythonContent(content: string): boolean {
        // Check for common Python patterns
        const pythonPatterns = [
            /\bimport\s+\w+/,
            /\bfrom\s+\w+\s+import\s+/,
            /\bdef\s+\w+\s*\(/,
            /\bclass\s+\w+\s*[\(:]/, 
            /\bif\s+__name__\s*==\s*['"']__main__['"']/,
            /\bprint\s*\(/,
            /\blen\s*\(/,
            /^\s*#.*$/m, // Python comments
            /:\s*$/m     // Colon at end of line (Python syntax)
        ];
        
        let matchCount = 0;
        for (const pattern of pythonPatterns) {
            if (pattern.test(content)) {
                matchCount++;
            }
        }
        
        // If we have at least 2 Python patterns, likely Python
        return matchCount >= 2;
    }

    /**
     * Detect if content appears to be a test file - ENHANCED
     * @param content File content to analyze
     * @param filePath Path to the file
     * @returns True if the content appears to be a test file
     */
    public static detectTestFile(content: string, filePath: string): boolean {
        const filename = path.basename(filePath).toLowerCase();
        
        // Check filename patterns
        const testFilenamePatterns = [
            /test/,
            /spec/,
            /_test\./,
            /\.test\./,
            /\.spec\./,
            /^test_/,
            /Test\./
        ];
        
        const isTestFilename = testFilenamePatterns.some(pattern => pattern.test(filename));
        
        // Check content patterns
        const language = this.getLanguageFromFilePath(filePath);
        const hasTestContent = this.hasTestContentForLanguage(content, language);
        
        return isTestFilename || hasTestContent;
    }

    /**
     * Check if content has test patterns for a specific language
     * @param content File content
     * @param language Programming language
     * @returns True if content has test patterns
     */
    private static hasTestContentForLanguage(content: string, language: string): boolean {
        const testPatterns: Record<string, RegExp[]> = {
            'python': [
                /\bimport\s+unittest\b/,
                /\bimport\s+pytest\b/,
                /\bfrom\s+unittest\s+import\b/,
                /\bclass\s+\w*[Tt]est\w*\s*\(/,
                /\bdef\s+test_\w+\s*\(/,
                /\bassert\s+/,
                /\bself\.assert\w+\s*\(/
            ],
            'javascript': [
                /\bdescribe\s*\(/,
                /\bit\s*\(/,
                /\btest\s*\(/,
                /\bexpect\s*\(/,
                /\bjest\./,
                /\brequire\s*\(\s*['"]jest['"]/, 
                /\bimport.*from\s*['"]jest['"]/, 
                /\b(?:before|after)(?:Each|All)?\s*\(/
            ],
            'typescript': [
                /\bdescribe\s*\(/,
                /\bit\s*\(/,
                /\btest\s*\(/,
                /\bexpect\s*\(/,
                /\bjest\./,
                /\bimport.*from\s*['"]jest['"]/, 
                /\b(?:before|after)(?:Each|All)?\s*\(/
            ],
            'java': [
                /\bimport\s+org\.junit\./,
                /\bimport\s+org\.testng\./,
                /\b@Test\b/,
                /\b@TestMethod\b/,
                /\bclass\s+\w*[Tt]est\w*/,
                /\bpublic\s+void\s+test\w+\s*\(/,
                /\bassert(?:True|False|Equals|NotNull)\s*\(/
            ],
            'csharp': [
                /\busing\s+NUnit\./,
                /\busing\s+Xunit\b/,
                /\busing\s+Microsoft\.VisualStudio\.TestTools\./,
                /\b\[Test\]\b/,
                /\b\[TestMethod\]\b/,
                /\b\[Fact\]\b/,
                /\bclass\s+\w*[Tt]est\w*/,
                /\bAssert\.\w+\s*\(/
            ],
            'go': [
                /\bimport\s+['"]testing['"]/, 
                /\bfunc\s+Test\w+\s*\(/,
                /\bt\s*\*testing\.T\b/,
                /\bt\.Error\(/,
                /\bt\.Fatal\(/
            ]
        };

        const patterns = testPatterns[language.toLowerCase()];
        if (!patterns) {
            return false;
        }

        return patterns.some(pattern => pattern.test(content));
    }
}

/**
 * Interface for import analysis results
 */
export interface ImportAnalysis {
    directImports: Map<string, string>;      // Maps import name to module name
    fromImports: Map<string, Map<string, string>>; // Maps module to (alias -> original name)
    aliasedImports: Map<string, string>;     // Maps alias to original module name
}

/**
 * Interface for name resolution results
 */
export interface NameResolution {
    name: string;           // The resolved name
    moduleName: string;     // The module it comes from
    filePath: string | null; // The file path if resolvable
    confidence: number;     // Confidence level (0-1)
}