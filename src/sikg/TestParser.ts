// TestParser.ts - Enhanced with Abstract Syntax Tree Processing
// This version uses AST-based parsing for more accurate test analysis

import * as path from 'path';
import * as crypto from 'crypto';
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import { TestCase } from './GraphTypes';
import { Logger } from '../utils/Logger';
import { CodeParser } from './CodeParser';

/**
 * Enhanced TestParser that uses AST-based parsing for more accurate test case identification
 */
export class TestParser {
    private codeParser: CodeParser;
    private tempDir: string;

    constructor() {
        this.codeParser = new CodeParser();
        // Create a temporary directory for AST processing scripts
        this.tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sikg-test-ast-'));
        this.initializeAstProcessors();
    }

    /**
     * Initialize AST processor scripts
     */
    private initializeAstProcessors(): void {
        // Write Python test AST parser script to temporary directory
        const pythonTestAstParserPath = path.join(this.tempDir, 'python_test_ast_parser.py');
        fs.writeFileSync(pythonTestAstParserPath, this.getPythonTestAstParserScript());
    }

    /**
     * Parse a test file and extract test cases
     */
    public async parseTestFile(content: string, filePath: string): Promise<TestCase[]> {
        Logger.debug(`Parsing test file: ${filePath}`);
        
        try {
            // Determine the language based on file extension
            const extension = path.extname(filePath).toLowerCase();
            
            if (extension === '.py' && (content.includes('unittest') || 
                                      content.includes('pytest') || 
                                      content.includes('test_') || 
                                      content.includes('Test'))) {
                return this.parsePythonTestsWithAst(content, filePath);
            } else {
                // Use generic parser as fallback
                Logger.debug(`Using generic parser for test file: ${filePath}`);
                return this.parseGenericTests(content, filePath);
            }
        } catch (error) {
            Logger.error(`Error parsing test file ${filePath}:`, error);
            // Fallback to generic parser if AST parsing fails
            Logger.debug(`Falling back to generic parser for test file: ${filePath}`);
            return this.parseGenericTests(content, filePath);
        }
    }

    /**
     * Parse Python tests using AST-based analysis
     */
    private async parsePythonTestsWithAst(content: string, filePath: string): Promise<TestCase[]> {
        Logger.debug(`Parsing Python test file with AST: ${filePath}`);
        
        try {
            // Write the content to a temporary file for processing
            const tempFilePath = path.join(this.tempDir, `temp_test_${Date.now()}.py`);
            fs.writeFileSync(tempFilePath, content);
            
            // Execute the Python test AST parser on the temporary file
            const pythonTestAstParserPath = path.join(this.tempDir, 'python_test_ast_parser.py');
            const command = `python "${pythonTestAstParserPath}" "${tempFilePath}"`;
            
            Logger.debug(`Executing test AST parser command: ${command}`);
            const output = child_process.execSync(command, { encoding: 'utf8' });
            
            // Clean up the temporary file
            fs.unlinkSync(tempFilePath);
            
            // Parse the JSON output from the AST parser
            const astData = JSON.parse(output);
            
            // Convert the AST data to TestCases
            return this.convertAstToTestCases(astData, filePath);
        } catch (error) {
            Logger.error(`Error parsing Python test file with AST ${filePath}:`, error);
            // Fallback to the regex-based parser
            Logger.debug(`Falling back to regex-based parser for test file: ${filePath}`);
            return this.parsePythonTests(content, filePath);
        }
    }

    /**
     * Convert AST data to TestCases
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
                        const targetId = this.codeParser.generateElementId(
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
                    const targetId = this.codeParser.generateElementId(
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
                    const targetId = this.codeParser.generateElementId(
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
                    const targetId = this.codeParser.generateElementId(
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
                const targetId = this.codeParser.generateElementId(
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
                const targetId = this.codeParser.generateElementId(
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
        
        return testCases;
    }

    /**
     * Generate Python test AST parser script content
     */
    private getPythonTestAstParserScript(): string {
        return `#!/usr/bin/env python
import ast
import json
import sys
import re

class TestVisitor(ast.NodeVisitor):
    def __init__(self):
        self.unittest_classes = []
        self.pytest_functions = []
        self.imports = []
        self.current_class = None
        self.current_func = None
        self.imported_modules = {}  # Maps imported names to their modules
    
    def visit_Import(self, node):
        for name in node.names:
            self.imports.append({
                'name': name.name,
                'asname': name.asname,
                'imported_names': []
            })
            # Track imported name to module mapping
            self.imported_modules[name.asname or name.name] = name.name
    
    def visit_ImportFrom(self, node):
        imported_names = [name.name for name in node.names]
        self.imports.append({
            'name': node.module or '',
            'level': node.level,
            'imported_names': imported_names
        })
        # Track imported name to module mapping
        for name in node.names:
            self.imported_modules[name.asname or name.name] = node.module
    
    def visit_ClassDef(self, node):
        # Check if this is a unittest class
        is_unittest = False
        for base in node.bases:
            base_name = self.get_name(base)
            if 'TestCase' in base_name or 'unittest' in base_name:
                is_unittest = True
                break
        
        if is_unittest:
            class_info = {
                'name': node.name,
                'start_line': node.lineno,
                'start_col': node.col_offset,
                'end_line': self.get_end_line(node),
                'end_col': 0,
                'test_methods': []
            }
            
            old_class = self.current_class
            self.current_class = class_info
            
            # Visit all methods in the class
            for child in node.body:
                self.visit(child)
            
            self.current_class = old_class
            
            if class_info['test_methods']:
                self.unittest_classes.append(class_info)
    
    def visit_FunctionDef(self, node):
        func_name = node.name
        
        # Handle pytest test functions (test_ prefix)
        if func_name.startswith('test_') and self.current_class is None:
            func_info = self.extract_test_func_info(node)
            self.pytest_functions.append(func_info)
        
        # Handle unittest test methods
        elif func_name.startswith('test') and self.current_class is not None:
            method_info = self.extract_test_func_info(node)
            self.current_class['test_methods'].append(method_info)
    
    def extract_test_func_info(self, node):
        func_name = node.name
        
        # Extract function info
        func_info = {
            'name': func_name,
            'start_line': node.lineno,
            'start_col': node.col_offset,
            'end_line': self.get_end_line(node),
            'end_col': 0,
            'params': self.get_function_params(node),
            'body': self.get_source_segment(node),
            'assertions': [],
            'calls': [],
            'modules': []
        }
        
        old_func = self.current_func
        self.current_func = func_info
        
        # Find assertions and calls in the function body
        self.extract_assertions_and_calls(node, func_info)
        
        self.current_func = old_func
        
        return func_info
    
    def extract_assertions_and_calls(self, node, func_info):
        # Extract all assert statements and function calls
        for child in ast.walk(node):
            if isinstance(child, ast.Assert):
                # This is a pytest-style assertion
                assertion = {
                    'type': 'assert',
                    'line': child.lineno,
                    'functions': self.extract_functions_from_node(child.test),
                    'confidence': 0.9,
                    'module': ''
                }
                func_info['assertions'].append(assertion)
            
            elif isinstance(child, ast.Call):
                # Check if this is a unittest assertion method
                if isinstance(child.func, ast.Attribute) and isinstance(child.func.value, ast.Name) and child.func.value.id == 'self':
                    if child.func.attr.startswith('assert'):
                        assertion = {
                            'type': 'unittest_assert',
                            'name': child.func.attr,
                            'line': child.lineno,
                            'functions': [],
                            'confidence': 0.9,
                            'module': ''
                        }
                        
                        # Extract functions being tested in the assertion
                        for arg in child.args:
                            assertion['functions'].extend(self.extract_functions_from_node(arg))
                        
                        func_info['assertions'].append(assertion)
                
                # Regular function call
                elif not isinstance(child.func, ast.Name) or not child.func.id.startswith('assert'):
                    call_info = self.extract_call_info(child)
                    if call_info:
                        func_info['calls'].append(call_info)
        
        # Extract imported modules used in test
        for module_name in self.imported_modules.values():
            if module_name and module_name not in func_info['modules']:
                func_info['modules'].append(module_name)
    
    def extract_call_info(self, node):
        if isinstance(node.func, ast.Name):
            # Regular function call: func()
            func_name = node.func.id
            
            # Skip assertion functions and test framework functions
            if func_name.startswith('assert') or func_name in ['describe', 'it', 'test', 'suite', 'fixture']:
                return None
            
            return {
                'name': func_name,
                'is_method': False,
                'module': self.imported_modules.get(func_name, '')
            }
        
        elif isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Name):
            # Method call: obj.method()
            obj_name = node.func.value.id
            method_name = node.func.attr
            
            # Skip self.assert methods
            if obj_name == 'self' and method_name.startswith('assert'):
                return None
            
            return {
                'name': method_name,
                'is_method': True,
                'object': obj_name,
                'module': self.imported_modules.get(obj_name, '')
            }
        
        return None
    
    def extract_functions_from_node(self, node):
        functions = []
        
        if isinstance(node, ast.Call):
            call_info = self.extract_call_info(node)
            if call_info:
                functions.append(call_info)
        
        elif isinstance(node, ast.Name):
            # Variable references
            var_name = node.id
            if var_name in self.imported_modules:
                functions.append({
                    'name': var_name,
                    'is_method': False,
                    'module': self.imported_modules.get(var_name, '')
                })
        
        elif isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
            # Attribute access like obj.attr
            obj_name = node.value.id
            attr_name = node.attr
            
            functions.append({
                'name': attr_name,
                'is_method': True,
                'object': obj_name,
                'module': self.imported_modules.get(obj_name, '')
            })
        
        # Recursively extract functions from binary operations
        elif isinstance(node, ast.BinOp):
            functions.extend(self.extract_functions_from_node(node.left))
            functions.extend(self.extract_functions_from_node(node.right))
        
        # Recursively extract functions from comparisons
        elif isinstance(node, ast.Compare):
            functions.extend(self.extract_functions_from_node(node.left))
            for comparator in node.comparators:
                functions.extend(self.extract_functions_from_node(comparator))
        
        return functions
    
    def get_function_params(self, node):
        params = []
        for arg in node.args.args:
            params.append(arg.arg)
        if node.args.vararg:
            params.append(f"*{node.args.vararg.arg}")
        if node.args.kwarg:
            params.append(f"**{node.args.kwarg.arg}")
        return params
    
    def get_end_line(self, node):
        # Try to get the end line number from the node
        if hasattr(node, 'end_lineno') and node.end_lineno is not None:
            return node.end_lineno
        
        # If end_lineno is not available, find the maximum line number in child nodes
        max_line = node.lineno
        for child in ast.iter_child_nodes(node):
            if hasattr(child, 'lineno'):
                child_end = self.get_end_line(child)
                max_line = max(max_line, child_end)
        
        return max_line
    
    def get_name(self, node):
        if isinstance(node, ast.Name):
            return node.id
        elif isinstance(node, ast.Attribute):
            return f"{self.get_name(node.value)}.{node.attr}"
        return "unknown"
    
    def get_source_segment(self, node):
        # This is a placeholder. In a real implementation, you would 
        # extract the source code segment for the node using the source code.
        return f"Body of {node.name} (line {node.lineno})"

def parse_python_test_file(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        source = f.read()
    
    try:
        tree = ast.parse(source)
        visitor = TestVisitor()
        visitor.visit(tree)
        
        return {
            'unittest_classes': visitor.unittest_classes,
            'pytest_functions': visitor.pytest_functions,
            'imports': visitor.imports
        }
    except SyntaxError as e:
        return {
            'error': f"Syntax error: {str(e)}",
            'unittest_classes': [],
            'pytest_functions': [],
            'imports': []
        }

if __name__ == '__main__':
    if len(sys.argv) != 2:
        print("Usage: python_test_ast_parser.py <python_file>")
        sys.exit(1)
    
    result = parse_python_test_file(sys.argv[1])
    print(json.dumps(result))
`;
    }

    /**
     * Clean up resources used by the parser
     */
    public dispose(): void {
        try {
            // Delete the temporary directory and its contents
            if (fs.existsSync(this.tempDir)) {
                const files = fs.readdirSync(this.tempDir);
                for (const file of files) {
                    fs.unlinkSync(path.join(this.tempDir, file));
                }
                fs.rmdirSync(this.tempDir);
            }
        } catch (error) {
            Logger.error('Error cleaning up TestParser resources:', error);
        }
    }

    /**
     * Parse Python tests (legacy regex-based implementation, used as fallback)
     */
    private parsePythonTests(content: string, filePath: string): TestCase[] {
        Logger.debug(`Falling back to regex-based parsing for Python test file: ${filePath}`);
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
     * Generate a unique ID for a test node
     */
    public generateNodeId(testName: string, filePath: string): string {
        const input = `test:${testName}:${filePath}`;
        const hash = crypto.createHash('md5').update(input).digest('hex');
        return `test_${hash}`;
    }
}