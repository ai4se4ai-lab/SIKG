// PythonTestParser.ts - Python-specific test parser implementation with enhanced import tracking

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
 * Python-specific test parser implementation with enhanced import tracking and name-based inference
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
     * Convert AST data to TestCases with enhanced import tracking
     * @param astData AST data from the Python parser
     * @param filePath Path to the file
     * @returns Array of test cases extracted from the AST data
     */
    private convertAstToTestCases(astData: any, filePath: string): TestCase[] {
        const testCases: TestCase[] = [];
        
        // Create import mapping for proper ID generation
        const importMap = this.createImportMap(astData.imports, filePath);
        
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
                
                // Add covered elements using enhanced import tracking
                this.addCoveredElementsFromAst(testCase, testMethod, importMap, filePath);
                
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
            
            // Add covered elements using enhanced import tracking
            this.addCoveredElementsFromAst(testCase, testFunc, importMap, filePath);
            
            testCases.push(testCase);
        }
        
        return testCases;
    }

    /**
     * Parse Python tests using regex-based parsing (fallback method) with enhanced import tracking
     * @param content Content of the file to parse
     * @param filePath Path to the file
     * @returns Array of test cases extracted from the file
     */
    private parsePythonTestsWithRegex(content: string, filePath: string): TestCase[] {
        Logger.debug(`Using regex-based parsing for Python test file: ${filePath}`);
        const testCases: TestCase[] = [];
        const lines = content.split('\n');
        
        try {
            // First, extract import information for proper ID generation
            const importMap = this.extractImportsFromContent(content, filePath);
            
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
                            
                            const testCase = this.createTestCaseFromRegex(
                                testName, methodName, lineIndex, lines, filePath, importMap
                            );
                            
                            if (testCase) {
                                testCases.push(testCase);
                            }
                        }
                    }
                } else if (isPytest || true) { // Always look for pytest-style tests as fallback
                    // Look for pytest style test functions
                    const functionMatch = line.match(/^\s*def\s+(test\w*)\s*\(([^)]*)\):/);
                    if (functionMatch) {
                        const functionName = functionMatch[1];
                        
                        const testCase = this.createTestCaseFromRegex(
                            functionName, functionName, lineIndex, lines, filePath, importMap
                        );
                        
                        if (testCase) {
                            testCases.push(testCase);
                        }
                    }
                }
            }
            
            return testCases;
            
        } catch (error) {
            return this.handleError(filePath, error);
        }
    }

    /**
     * Create a test case from regex parsing with enhanced import tracking
     */
    private createTestCaseFromRegex(
        testName: string, 
        functionName: string, 
        lineIndex: number, 
        lines: string[], 
        filePath: string, 
        importMap: ImportMap
    ): TestCase | null {
        // Find the end of the test function
        let endLine = lineIndex;
        const functionIndentation = this.getIndentation(lines[lineIndex]);
        
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
        const testId = this.generateNodeId(testName, filePath);
        
        // Create the test case
        const testCase: TestCase = {
            id: testId,
            name: testName,
            testType: this.detectTestType(testBody, testName),
            filePath,
            loc: {
                start: { line: lineIndex + 1, column: lines[lineIndex].indexOf(functionName) },
                end: { line: endLine + 1, column: 0 }
            },
            coveredElements: []
        };
        
        // Find code elements this test covers using enhanced import tracking
        this.identifyPythonCoveredCodeEnhanced(testBody, testCase, filePath, importMap);
        
        return testCase;
    }

    /**
     * Create import mapping for proper ID generation
     */
    private createImportMap(imports: any[], filePath: string): ImportMap {
        const importMap: ImportMap = {
            moduleToFile: new Map(),
            nameToModule: new Map(),
            nameToFile: new Map()
        };
        
        const testFileDir = path.dirname(filePath);
        
        for (const importItem of imports) {
            const moduleName = importItem.name;
            
            if (importItem.imported_names && importItem.imported_names.length > 0) {
                // Handle "from module import name1, name2" imports
                for (const importedName of importItem.imported_names) {
                    // Map the imported name to its module
                    importMap.nameToModule.set(importedName, moduleName);
                    
                    // Try to resolve the module to a file path
                    const resolvedPath = this.resolveModuleToFilePath(moduleName, testFileDir);
                    if (resolvedPath) {
                        importMap.moduleToFile.set(moduleName, resolvedPath);
                        importMap.nameToFile.set(importedName, resolvedPath);
                    }
                }
            } else {
                // Handle "import module" imports
                const resolvedPath = this.resolveModuleToFilePath(moduleName, testFileDir);
                if (resolvedPath) {
                    importMap.moduleToFile.set(moduleName, resolvedPath);
                    importMap.nameToFile.set(moduleName, resolvedPath);
                }
            }
        }
        
        return importMap;
    }

    /**
     * Extract imports from content using regex (fallback method)
     */
    private extractImportsFromContent(content: string, filePath: string): ImportMap {
        const importMap: ImportMap = {
            moduleToFile: new Map(),
            nameToModule: new Map(),
            nameToFile: new Map()
        };
        
        const testFileDir = path.dirname(filePath);
        
        // Pattern for "from module import name1, name2" style imports
        const fromImportPattern = /^\s*from\s+([^\s]+)\s+import\s+([^#\n]+)/gm;
        
        // Pattern for "import module" style imports
        const directImportPattern = /^\s*import\s+([^#\n]+)/gm;
        
        let match;
        
        // Process "from ... import ..." statements
        while ((match = fromImportPattern.exec(content)) !== null) {
            const moduleName = match[1].trim();
            const importedItems = match[2].split(',').map(item => {
                // Handle "import x as y" syntax
                const asParts = item.trim().split(/\s+as\s+/);
                return asParts[0].trim();
            });
            
            for (const importedName of importedItems) {
                if (importedName && importedName !== '*') {
                    importMap.nameToModule.set(importedName, moduleName);
                    
                    const resolvedPath = this.resolveModuleToFilePath(moduleName, testFileDir);
                    if (resolvedPath) {
                        importMap.moduleToFile.set(moduleName, resolvedPath);
                        importMap.nameToFile.set(importedName, resolvedPath);
                    }
                }
            }
        }
        
        // Process direct "import ..." statements
        while ((match = directImportPattern.exec(content)) !== null) {
            const modules = match[1].split(',').map(item => {
                const asParts = item.trim().split(/\s+as\s+/);
                return asParts[0].trim();
            });
            
            for (const moduleName of modules) {
                if (moduleName) {
                    const resolvedPath = this.resolveModuleToFilePath(moduleName, testFileDir);
                    if (resolvedPath) {
                        importMap.moduleToFile.set(moduleName, resolvedPath);
                        importMap.nameToFile.set(moduleName, resolvedPath);
                    }
                }
            }
        }
        
        return importMap;
    }

    /**
     * Resolve a Python module name to a file path
     */
    private resolveModuleToFilePath(moduleName: string, testFileDir: string): string | null {
        // Handle relative imports
        if (moduleName.startsWith('.')) {
            const relativePath = moduleName.substring(1);
            const resolvedPath = path.join(testFileDir, relativePath + '.py');
            if (fs.existsSync(resolvedPath)) {
                return resolvedPath;
            }
        }
        
        // Handle absolute imports within the same directory
        const sameDirPath = path.join(testFileDir, moduleName + '.py');
        if (fs.existsSync(sameDirPath)) {
            return sameDirPath;
        }
        
        // Handle common project structure patterns
        const projectRoot = this.findProjectRoot(testFileDir);
        if (projectRoot) {
            const projectPath = path.join(projectRoot, moduleName + '.py');
            if (fs.existsSync(projectPath)) {
                return projectPath;
            }
            
            // Also check in src directory
            const srcPath = path.join(projectRoot, 'src', moduleName + '.py');
            if (fs.existsSync(srcPath)) {
                return srcPath;
            }
        }
        
        return null;
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
     * Add covered elements from AST data with enhanced import tracking
     */
    private addCoveredElementsFromAst(
        testCase: TestCase, 
        testData: any, 
        importMap: ImportMap, 
        filePath: string
    ): void {
        const coveredIds = new Set<string>();
        
        // Add name-based inference for test functions
        this.addNameBasedInferences(testCase, importMap, coveredIds);
        
        // Add covered elements based on assertions and calls
        for (const assertion of testData.assertions || []) {
            for (const func of assertion.functions || []) {
                const targetId = this.generateTargetId(func.name, func.is_method, importMap, filePath);
                
                if (targetId && !coveredIds.has(targetId)) {
                    coveredIds.add(targetId);
                    testCase.coveredElements.push({
                        targetId,
                        weight: assertion.confidence || 0.8
                    });
                }
            }
        }
        
        // Add covered elements based on direct function calls
        for (const call of testData.calls || []) {
            const targetId = this.generateTargetId(call.name, call.is_method, importMap, filePath);
            
            if (targetId && !coveredIds.has(targetId)) {
                coveredIds.add(targetId);
                testCase.coveredElements.push({
                    targetId,
                    weight: 0.7
                });
            }
        }
        
        // Add covered modules
        for (const module of testData.modules || []) {
            const targetId = ParserUtils.generateElementId('module', module, importMap.moduleToFile.get(module) || module);
            
            if (!coveredIds.has(targetId)) {
                coveredIds.add(targetId);
                testCase.coveredElements.push({
                    targetId,
                    weight: 0.5
                });
            }
        }
    }

    /**
     * Identify which code elements a Python test covers using enhanced import tracking
     */
    private identifyPythonCoveredCodeEnhanced(
        testBody: string, 
        testCase: TestCase, 
        filePath: string, 
        importMap: ImportMap
    ): void {
        const coveredIds = new Set<string>();
        
        // Add name-based inference for test functions
        this.addNameBasedInferences(testCase, importMap, coveredIds);
        
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
            
            const targetId = this.generateTargetId(calledFunctionName, false, importMap, filePath);
            
            if (targetId && !coveredIds.has(targetId)) {
                coveredIds.add(targetId);
                testCase.coveredElements.push({
                    targetId,
                    weight: 0.8
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
            
            // Try to resolve the object to a class
            const classId = this.generateTargetId(objectName, false, importMap, filePath, 'class');
            if (classId && !coveredIds.has(classId)) {
                coveredIds.add(classId);
                testCase.coveredElements.push({
                    targetId: classId,
                    weight: 0.9
                });
            }
            
            // Try to resolve the method
            const methodId = this.generateTargetId(methodName, true, importMap, filePath);
            if (methodId && !coveredIds.has(methodId)) {
                coveredIds.add(methodId);
                testCase.coveredElements.push({
                    targetId: methodId,
                    weight: 0.8
                });
            }
        }
    }

    /**
     * Add name-based inference for test functions
     */
    private addNameBasedInferences(testCase: TestCase, importMap: ImportMap, coveredIds: Set<string>): void {
        const testName = testCase.name;
        
        // Extract the base test name (remove test_ prefix and class name)
        const baseTestName = this.extractBaseTestName(testName);
        
        if (baseTestName) {
            // Look for functions with matching names in imported modules
            for (const [importedName, sourceFile] of importMap.nameToFile.entries()) {
                if (importedName.toLowerCase() === baseTestName.toLowerCase() || 
                    baseTestName.toLowerCase().includes(importedName.toLowerCase())) {
                    
                    const targetId = ParserUtils.generateElementId('function', importedName, sourceFile);
                    
                    if (!coveredIds.has(targetId)) {
                        coveredIds.add(targetId);
                        testCase.coveredElements.push({
                            targetId,
                            weight: 0.95 // High confidence for name-based inference
                        });
                        
                        Logger.debug(`Name-based inference: ${testName} -> ${importedName} (${sourceFile})`);
                    }
                }
            }
        }
    }

    /**
     * Extract the base test name for inference
     */
    private extractBaseTestName(testName: string): string | null {
        // Handle unittest style: "TestClass.test_function_name"
        if (testName.includes('.')) {
            const parts = testName.split('.');
            const methodName = parts[parts.length - 1];
            
            if (methodName.startsWith('test_')) {
                return methodName.substring(5); // Remove 'test_' prefix
            }
        }
        
        // Handle pytest style: "test_function_name"
        if (testName.startsWith('test_')) {
            return testName.substring(5); // Remove 'test_' prefix
        }
        
        return null;
    }

    /**
     * Generate target ID with proper import resolution
     */
    private generateTargetId(
        name: string, 
        isMethod: boolean, 
        importMap: ImportMap, 
        filePath: string,
        forceKind?: string
    ): string | null {
        const kind = forceKind || (isMethod ? 'method' : 'function');
        
        // First, try to resolve using import map
        const sourceFile = importMap.nameToFile.get(name);
        if (sourceFile) {
            return ParserUtils.generateElementId(kind, name, sourceFile);
        }
        
        // If not found in imports, try to resolve relative to the test file
        const testFileDir = path.dirname(filePath);
        
        // Check for common Python files in the same directory
        const commonFiles = ['main.py', 'app.py', 'core.py', '__init__.py'];
        
        for (const commonFile of commonFiles) {
            const commonFilePath = path.join(testFileDir, commonFile);
            if (fs.existsSync(commonFilePath)) {
                const targetId = ParserUtils.generateElementId(kind, name, commonFilePath);
                return targetId;
            }
        }
        
        // Fallback: generate ID with empty file path (might still match if the code parser found it)
        return ParserUtils.generateElementId(kind, name, '');
    }

    /**
     * Clean up any resources used by this parser
     */
    public dispose(): void {
        // Nothing to dispose for this parser
    }
}

/**
 * Interface for import mapping
 */
interface ImportMap {
    moduleToFile: Map<string, string>;      // Maps module name to file path
    nameToModule: Map<string, string>;      // Maps imported name to module name
    nameToFile: Map<string, string>;       // Maps imported name to source file path
}