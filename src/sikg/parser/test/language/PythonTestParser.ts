// FIXED PythonTestParser.ts - Properly links tests to code with consistent ID generation

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
 * FIXED Python-specific test parser with proper test-to-code linking
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
     * Parse a Python test file and extract test cases with FIXED test-to-code linking
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
     * Parse Python tests using AST-based analysis with FIXED import resolution
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
            
            // Convert the AST data to TestCases with FIXED linking
            return this.convertAstToTestCasesFixed(astData, filePath);
        } catch (error) {
            Logger.error(`Error parsing Python test file with AST ${filePath}:`, error);
            // Fallback to the regex-based parser
            Logger.debug(`Falling back to regex-based parser for test file ${filePath}`);
            return this.parsePythonTestsWithRegex(content, filePath);
        }
    }

    /**
     * FIXED: Convert AST data to TestCases with proper test-to-code linking
     */
    private convertAstToTestCasesFixed(astData: any, filePath: string): TestCase[] {
        const testCases: TestCase[] = [];
        
        // FIXED: Create proper import mapping for consistent ID generation
        const importMap = this.createFixedImportMap(astData.imports, filePath);
        
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
                
                // FIXED: Add covered elements with proper ID generation
                this.addCoveredElementsFixed(testCase, testMethod, importMap, filePath);
                
                testCases.push(testCase);
                Logger.debug(`Created unittest test case: ${testName} with ${testCase.coveredElements.length} covered elements`);
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
            
            // FIXED: Add covered elements with proper ID generation
            this.addCoveredElementsFixed(testCase, testFunc, importMap, filePath);
            
            testCases.push(testCase);
            Logger.debug(`Created pytest test case: ${testFunc.name} with ${testCase.coveredElements.length} covered elements`);
        }
        
        return testCases;
    }

    /**
     * FIXED: Create import mapping with proper file path resolution
     */
    private createFixedImportMap(imports: any[], filePath: string): ImportMap {
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
                    
                    // FIXED: Try to resolve the module to a file path using better logic
                    const resolvedPath = this.resolveModuleToFilePathFixed(moduleName, testFileDir);
                    if (resolvedPath) {
                        importMap.moduleToFile.set(moduleName, resolvedPath);
                        importMap.nameToFile.set(importedName, resolvedPath);
                        Logger.debug(`Resolved import: ${importedName} from ${moduleName} -> ${resolvedPath}`);
                    } else {
                        // FIXED: Create a fallback mapping for common imports
                        const fallbackPath = this.createFallbackPath(moduleName, testFileDir);
                        if (fallbackPath) {
                            importMap.moduleToFile.set(moduleName, fallbackPath);
                            importMap.nameToFile.set(importedName, fallbackPath);
                            Logger.debug(`Fallback import mapping: ${importedName} -> ${fallbackPath}`);
                        }
                    }
                }
            } else {
                // Handle "import module" imports
                const resolvedPath = this.resolveModuleToFilePathFixed(moduleName, testFileDir);
                if (resolvedPath) {
                    importMap.moduleToFile.set(moduleName, resolvedPath);
                    importMap.nameToFile.set(moduleName, resolvedPath);
                    Logger.debug(`Resolved direct import: ${moduleName} -> ${resolvedPath}`);
                }
            }
        }
        
        return importMap;
    }

    /**
     * FIXED: Better module to file path resolution
     */
    private resolveModuleToFilePathFixed(moduleName: string, testFileDir: string): string | null {
        // Handle relative imports
        if (moduleName.startsWith('.')) {
            const relativePath = moduleName.substring(1);
            const resolvedPath = path.join(testFileDir, relativePath + '.py');
            if (fs.existsSync(resolvedPath)) {
                return this.normalizePathForSIKG(resolvedPath);
            }
        }
        
        // FIXED: Check same directory first (most common case)
        const sameDirPath = path.join(testFileDir, moduleName + '.py');
        if (fs.existsSync(sameDirPath)) {
            return this.normalizePathForSIKG(sameDirPath);
        }
        
        // FIXED: Look for common Python file names in the same directory
        const commonVariations = [
            `${moduleName}.py`,
            `${moduleName}/main.py`,
            `${moduleName}/__init__.py`
        ];
        
        for (const variation of commonVariations) {
            const variationPath = path.join(testFileDir, variation);
            if (fs.existsSync(variationPath)) {
                return this.normalizePathForSIKG(variationPath);
            }
        }
        
        // FIXED: Search in parent directories for project structure
        const projectRoot = this.findProjectRoot(testFileDir);
        if (projectRoot) {
            // Check project root
            const projectPath = path.join(projectRoot, moduleName + '.py');
            if (fs.existsSync(projectPath)) {
                return this.normalizePathForSIKG(projectPath);
            }
            
            // Check src directory
            const srcPath = path.join(projectRoot, 'src', moduleName + '.py');
            if (fs.existsSync(srcPath)) {
                return this.normalizePathForSIKG(srcPath);
            }
            
            // Check common subdirectories
            const commonDirs = ['lib', 'app', 'core', 'modules'];
            for (const dir of commonDirs) {
                const subDirPath = path.join(projectRoot, dir, moduleName + '.py');
                if (fs.existsSync(subDirPath)) {
                    return this.normalizePathForSIKG(subDirPath);
                }
            }
        }
        
        return null;
    }

    /**
     * FIXED: Create fallback path for common imports based on test file location
     */
    private createFallbackPath(moduleName: string, testFileDir: string): string | null {
        // For test files like test_main.py, assume main.py is in the same directory
        if (testFileDir) {
            const commonPatterns = [
                `${moduleName}.py`,
                `main.py`,  // Common fallback for tests
                `app.py`,   // Common fallback for apps
                `core.py`   // Common fallback for core modules
            ];
            
            for (const pattern of commonPatterns) {
                const candidatePath = path.join(testFileDir, pattern);
                if (fs.existsSync(candidatePath)) {
                    return this.normalizePathForSIKG(candidatePath);
                }
            }
        }
        
        return null;
    }

    /**
     * FIXED: Normalize path for consistent SIKG ID generation
     */
    private normalizePathForSIKG(filePath: string): string {
        return ParserUtils.getWorkspaceRelativePath(filePath);
    }

    /**
     * FIXED: Add covered elements with proper ID generation that matches code parser
     */
    private addCoveredElementsFixed(
        testCase: TestCase, 
        testData: any, 
        importMap: ImportMap, 
        filePath: string
    ): void {
        const coveredIds = new Set<string>();
        
        // FIXED: Add name-based inference with proper ID generation
        this.addNameBasedInferencesFixed(testCase, importMap, coveredIds);
        
        // Add covered elements based on assertions and calls
        for (const assertion of testData.assertions || []) {
            for (const func of assertion.functions || []) {
                const targetId = this.generateTargetIdFixed(func.name, func.is_method, importMap, filePath);
                
                if (targetId && !coveredIds.has(targetId)) {
                    coveredIds.add(targetId);
                    testCase.coveredElements.push({
                        targetId,
                        weight: assertion.confidence || 0.8
                    });
                    Logger.debug(`Added assertion-based coverage: ${testCase.name} -> ${func.name} (${targetId})`);
                }
            }
        }
        
        // Add covered elements based on direct function calls
        for (const call of testData.calls || []) {
            const targetId = this.generateTargetIdFixed(call.name, call.is_method, importMap, filePath);
            
            if (targetId && !coveredIds.has(targetId)) {
                coveredIds.add(targetId);
                testCase.coveredElements.push({
                    targetId,
                    weight: 0.7
                });
                Logger.debug(`Added call-based coverage: ${testCase.name} -> ${call.name} (${targetId})`);
            }
        }
        
        // Add covered modules
        for (const module of testData.modules || []) {
            const moduleFile = importMap.moduleToFile.get(module);
            if (moduleFile) {
                const targetId = ParserUtils.generateElementId('module', module, moduleFile);
                
                if (!coveredIds.has(targetId)) {
                    coveredIds.add(targetId);
                    testCase.coveredElements.push({
                        targetId,
                        weight: 0.5
                    });
                    Logger.debug(`Added module coverage: ${testCase.name} -> ${module} (${targetId})`);
                }
            }
        }
        
        // FIXED: Add name inferences from AST data
        for (const inference of testData.name_inferences || []) {
            const targetId = this.generateTargetIdFixed(inference.name, false, importMap, filePath);
            
            if (targetId && !coveredIds.has(targetId)) {
                coveredIds.add(targetId);
                testCase.coveredElements.push({
                    targetId,
                    weight: inference.confidence || 0.9
                });
                Logger.debug(`Added name-based inference: ${testCase.name} -> ${inference.name} (${targetId})`);
            }
        }
    }

    /**
     * FIXED: Add name-based inference with proper ID generation
     */
    private addNameBasedInferencesFixed(testCase: TestCase, importMap: ImportMap, coveredIds: Set<string>): void {
        const testName = testCase.name;
        
        // FIXED: Extract the base test name using multiple strategies
        const possibleFunctionNames = this.extractPossibleFunctionNamesFixed(testName);
        
        for (const functionName of possibleFunctionNames) {
            // Look for functions with matching names in imported modules
            for (const [importedName, sourceFile] of importMap.nameToFile.entries()) {
                if (importedName.toLowerCase() === functionName.toLowerCase()) {
                    const targetId = ParserUtils.generateElementId('function', importedName, sourceFile);
                    
                    if (!coveredIds.has(targetId)) {
                        coveredIds.add(targetId);
                        testCase.coveredElements.push({
                            targetId,
                            weight: 0.95 // High confidence for name-based inference
                        });
                        
                        Logger.info(`Name-based inference: ${testName} -> ${importedName} (${sourceFile})`);
                    }
                }
            }
            
            // FIXED: Also check for functions in the same directory (common pattern)
            const testFileDir = path.dirname(testCase.filePath);
            const possibleSourceFiles = [
                path.join(testFileDir, 'main.py'),
                path.join(testFileDir, `${functionName}.py`),
                path.join(testFileDir, 'app.py'),
                path.join(testFileDir, 'core.py')
            ];
            
            for (const sourceFile of possibleSourceFiles) {
                if (fs.existsSync(sourceFile)) {
                    const normalizedSourceFile = this.normalizePathForSIKG(sourceFile);
                    const targetId = ParserUtils.generateElementId('function', functionName, normalizedSourceFile);
                    
                    if (!coveredIds.has(targetId)) {
                        coveredIds.add(targetId);
                        testCase.coveredElements.push({
                            targetId,
                            weight: 0.85
                        });
                        
                        Logger.info(`Local name-based inference: ${testName} -> ${functionName} (${normalizedSourceFile})`);
                    }
                }
            }
        }
    }

    /**
     * FIXED: Extract possible function names with multiple strategies
     */
    private extractPossibleFunctionNamesFixed(testName: string): string[] {
        const possibleNames: string[] = [];
        
        // Handle unittest style: "TestClass.test_function_name"
        if (testName.includes('.')) {
            const parts = testName.split('.');
            const methodName = parts[parts.length - 1];
            
            if (methodName.startsWith('test_')) {
                const baseName = methodName.substring(5); // Remove 'test_' prefix
                possibleNames.push(baseName);
                
                // Also try camelCase version
                const camelCase = this.toCamelCase(baseName);
                if (camelCase !== baseName) {
                    possibleNames.push(camelCase);
                }
            }
        }
        
        // Handle pytest style: "test_function_name"
        if (testName.startsWith('test_')) {
            const baseName = testName.substring(5); // Remove 'test_' prefix
            possibleNames.push(baseName);
            
            // Also try camelCase version
            const camelCase = this.toCamelCase(baseName);
            if (camelCase !== baseName) {
                possibleNames.push(camelCase);
            }
        }
        
        // FIXED: Handle camelCase test names like "testHello"
        if (testName.startsWith('test') && testName.length > 4) {
            const camelPart = testName.substring(4);
            if (camelPart && camelPart[0] === camelPart[0].toUpperCase()) {
                const snakeCase = this.toSnakeCase(camelPart);
                possibleNames.push(snakeCase);
                
                // Also add the camelCase version with lowercase first letter
                const lowerCamelCase = camelPart[0].toLowerCase() + camelPart.slice(1);
                possibleNames.push(lowerCamelCase);
            }
        }
        
        return [...new Set(possibleNames)]; // Remove duplicates
    }

    /**
     * Convert snake_case to camelCase
     */
    private toCamelCase(snakeCase: string): string {
        return snakeCase.split('_').map((word, index) => 
            index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)
        ).join('');
    }

    /**
     * Convert CamelCase to snake_case
     */
    private toSnakeCase(camelCase: string): string {
        return camelCase.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
    }

    /**
     * FIXED: Generate target ID with proper import resolution that matches code parser
     */
    private generateTargetIdFixed(
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
            const targetId = ParserUtils.generateElementId(kind, name, sourceFile);
            Logger.debug(`Generated ID from import map: ${name} -> ${targetId} (${sourceFile})`);
            return targetId;
        }
        
        // FIXED: If not found in imports, try to resolve relative to the test file
        const testFileDir = path.dirname(filePath);
        
        // Check for common Python files in the same directory
        const commonFiles = [
            'main.py',
            'app.py', 
            'core.py',
            '__init__.py',
            `${name}.py` // Try file named after the function
        ];
        
        for (const commonFile of commonFiles) {
            const commonFilePath = path.join(testFileDir, commonFile);
            if (fs.existsSync(commonFilePath)) {
                const normalizedPath = this.normalizePathForSIKG(commonFilePath);
                const targetId = ParserUtils.generateElementId(kind, name, normalizedPath);
                Logger.debug(`Generated ID from common file: ${name} -> ${targetId} (${normalizedPath})`);
                return targetId;
            }
        }
        
        // FIXED: Last resort - generate ID with workspace-relative path of test directory
        // This helps match cases where the code parser found the function
        const fallbackFilePath = this.normalizePathForSIKG(path.join(testFileDir, 'main.py'));
        const targetId = ParserUtils.generateElementId(kind, name, fallbackFilePath);
        Logger.debug(`Generated fallback ID: ${name} -> ${targetId} (${fallbackFilePath})`);
        return targetId;
    }

    /**
     * Parse Python tests using regex-based parsing with FIXED linking
     */
    private parsePythonTestsWithRegex(content: string, filePath: string): TestCase[] {
        Logger.debug(`Using regex-based parsing for Python test file: ${filePath}`);
        const testCases: TestCase[] = [];
        const lines = content.split('\n');
        
        try {
            // FIXED: Extract import information for proper ID generation
            const importMap = this.extractImportsFromContentFixed(content, filePath);
            
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
                            
                            const testCase = this.createTestCaseFromRegexFixed(
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
                        
                        const testCase = this.createTestCaseFromRegexFixed(
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
     * FIXED: Extract imports from content using regex with better resolution
     */
    private extractImportsFromContentFixed(content: string, filePath: string): ImportMap {
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
                    
                    const resolvedPath = this.resolveModuleToFilePathFixed(moduleName, testFileDir);
                    if (resolvedPath) {
                        importMap.moduleToFile.set(moduleName, resolvedPath);
                        importMap.nameToFile.set(importedName, resolvedPath);
                        Logger.debug(`Regex import resolution: ${importedName} from ${moduleName} -> ${resolvedPath}`);
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
                    const resolvedPath = this.resolveModuleToFilePathFixed(moduleName, testFileDir);
                    if (resolvedPath) {
                        importMap.moduleToFile.set(moduleName, resolvedPath);
                        importMap.nameToFile.set(moduleName, resolvedPath);
                        Logger.debug(`Regex direct import resolution: ${moduleName} -> ${resolvedPath}`);
                    }
                }
            }
        }
        
        return importMap;
    }

    /**
     * FIXED: Create test case from regex parsing with proper linking
     */
    private createTestCaseFromRegexFixed(
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
        
        // FIXED: Find code elements this test covers using enhanced import tracking
        this.identifyPythonCoveredCodeFixed(testBody, testCase, filePath, importMap);
        
        return testCase;
    }

    /**
     * FIXED: Identify covered code with proper ID generation
     */
    private identifyPythonCoveredCodeFixed(
        testBody: string, 
        testCase: TestCase, 
        filePath: string, 
        importMap: ImportMap
    ): void {
        const coveredIds = new Set<string>();
        
        // FIXED: Add name-based inference for test functions
        this.addNameBasedInferencesFixed(testCase, importMap, coveredIds);
        
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
            
            const targetId = this.generateTargetIdFixed(calledFunctionName, false, importMap, filePath);
            
            if (targetId && !coveredIds.has(targetId)) {
                coveredIds.add(targetId);
                testCase.coveredElements.push({
                    targetId,
                    weight: 0.8
                });
                Logger.debug(`Function call coverage: ${testCase.name} -> ${calledFunctionName} (${targetId})`);
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
            const classId = this.generateTargetIdFixed(objectName, false, importMap, filePath, 'class');
            if (classId && !coveredIds.has(classId)) {
                coveredIds.add(classId);
                testCase.coveredElements.push({
                    targetId: classId,
                    weight: 0.9
                });
                Logger.debug(`Object usage coverage: ${testCase.name} -> ${objectName} (${classId})`);
            }
            
            // Try to resolve the method
            const methodId = this.generateTargetIdFixed(methodName, true, importMap, filePath);
            if (methodId && !coveredIds.has(methodId)) {
                coveredIds.add(methodId);
                testCase.coveredElements.push({
                    targetId: methodId,
                    weight: 0.8
                });
                Logger.debug(`Method call coverage: ${testCase.name} -> ${methodName} (${methodId})`);
            }
        }
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