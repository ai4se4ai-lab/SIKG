// AstScripts.ts - Complete Enhanced AST script content with better import tracking

/**
 * Enhanced Python AST scripts for code and test parsing with improved import tracking
 */
export class AstScripts {
    /**
     * Enhanced Python test AST parser script with better import tracking
     */
    public static readonly PYTHON_TEST_AST_PARSER = `#!/usr/bin/env python
import ast
import json
import sys
import re

class EnhancedTestVisitor(ast.NodeVisitor):
    def __init__(self):
        self.unittest_classes = []
        self.pytest_functions = []
        self.imports = []
        self.current_class = None
        self.current_func = None
        self.imported_modules = {}  # Maps imported names to their modules
        self.import_sources = {}    # Maps modules to file paths
    
    def visit_Import(self, node):
        for name in node.names:
            import_info = {
                'name': name.name,
                'asname': name.asname,
                'imported_names': [name.asname or name.name],
                'type': 'direct'
            }
            self.imports.append(import_info)
            
            # Track imported name to module mapping
            alias = name.asname or name.name
            self.imported_modules[alias] = name.name
    
    def visit_ImportFrom(self, node):
        module_name = node.module or ''
        imported_names = []
        
        for name in node.names:
            imported_names.append(name.name)
            # Track imported name to module mapping
            alias = name.asname or name.name
            self.imported_modules[alias] = module_name
        
        import_info = {
            'name': module_name,
            'level': node.level,
            'imported_names': imported_names,
            'type': 'from'
        }
        self.imports.append(import_info)
    
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
            'modules': [],
            'name_inferences': []  # Functions inferred from test name
        }
        
        old_func = self.current_func
        self.current_func = func_info
        
        # Add name-based inferences
        self.add_name_based_inferences(func_info)
        
        # Find assertions and calls in the function body
        self.extract_assertions_and_calls(node, func_info)
        
        self.current_func = old_func
        
        return func_info
    
    def add_name_based_inferences(self, func_info):
        """Add inferred function calls based on test naming conventions"""
        test_name = func_info['name']
        
        # Extract potential function names from test name
        potential_names = self.extract_function_names_from_test(test_name)
        
        for potential_name in potential_names:
            # Check if this name is in our imports
            if potential_name in self.imported_modules:
                module = self.imported_modules[potential_name]
                func_info['name_inferences'].append({
                    'name': potential_name,
                    'module': module,
                    'confidence': 0.95,
                    'reason': 'name_based_inference'
                })
            else:
                # Add as a potential local function
                func_info['name_inferences'].append({
                    'name': potential_name,
                    'module': '',
                    'confidence': 0.8,
                    'reason': 'name_based_inference_local'
                })
    
    def extract_function_names_from_test(self, test_name):
        """Extract likely function names from test name using naming conventions"""
        potential_names = []
        
        # Handle "test_function_name" pattern
        if test_name.startswith('test_'):
            base_name = test_name[5:]  # Remove 'test_' prefix
            if base_name:
                potential_names.append(base_name)
        
        # Handle "testFunctionName" camelCase pattern
        elif test_name.startswith('test') and len(test_name) > 4:
            camel_part = test_name[4:]
            if camel_part and camel_part[0].isupper():
                # Convert to snake_case
                snake_case = re.sub(r'(?<!^)(?=[A-Z])', '_', camel_part).lower()
                potential_names.append(snake_case)
                # Also add the original camelCase (with lowercase first letter)
                lower_camel = camel_part[0].lower() + camel_part[1:]
                potential_names.append(lower_camel)
        
        # Look for function names mentioned in the test name
        # Split by underscores and look for meaningful parts
        if '_' in test_name:
            parts = test_name.split('_')
            # Skip 'test' part and common test words
            meaningful_parts = [p for p in parts if p not in ['test', 'should', 'when', 'then', 'and', 'or']]
            if meaningful_parts:
                # Try combining parts to form function names
                for i in range(len(meaningful_parts)):
                    for j in range(i + 1, len(meaningful_parts) + 1):
                        candidate = '_'.join(meaningful_parts[i:j])
                        if len(candidate) > 2:  # Skip very short candidates
                            potential_names.append(candidate)
        
        return list(set(potential_names))  # Remove duplicates
    
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
                
                # Regular function call (not an assertion)
                elif not (isinstance(child.func, ast.Name) and child.func.id.startswith('assert')):
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
            
            # Check if this function is imported
            module = self.imported_modules.get(func_name, '')
            
            return {
                'name': func_name,
                'is_method': False,
                'module': module,
                'confidence': 0.9 if module else 0.7
            }
        
        elif isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Name):
            # Method call: obj.method()
            obj_name = node.func.value.id
            method_name = node.func.attr
            
            # Skip self.assert methods
            if obj_name == 'self' and method_name.startswith('assert'):
                return None
            
            # Check if the object is imported
            module = self.imported_modules.get(obj_name, '')
            
            return {
                'name': method_name,
                'is_method': True,
                'object': obj_name,
                'module': module,
                'confidence': 0.8 if module else 0.6
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
                    'module': self.imported_modules.get(var_name, ''),
                    'confidence': 0.8
                })
        
        elif isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
            # Attribute access like obj.attr
            obj_name = node.value.id
            attr_name = node.attr
            
            module = self.imported_modules.get(obj_name, '')
            
            functions.append({
                'name': attr_name,
                'is_method': True,
                'object': obj_name,
                'module': module,
                'confidence': 0.7 if module else 0.5
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
        visitor = EnhancedTestVisitor()
        visitor.visit(tree)
        
        return {
            'unittest_classes': visitor.unittest_classes,
            'pytest_functions': visitor.pytest_functions,
            'imports': visitor.imports,
            'imported_modules': visitor.imported_modules
        }
    except SyntaxError as e:
        return {
            'error': f"Syntax error: {str(e)}",
            'unittest_classes': [],
            'pytest_functions': [],
            'imports': [],
            'imported_modules': {}
        }

if __name__ == '__main__':
    if len(sys.argv) != 2:
        print("Usage: python_test_ast_parser.py <python_file>")
        sys.exit(1)
    
    result = parse_python_test_file(sys.argv[1])
    print(json.dumps(result))
`;

    /**
     * Python AST parser script for code analysis
     */
    public static readonly PYTHON_AST_PARSER = `#!/usr/bin/env python
import ast
import json
import sys

class AstVisitor(ast.NodeVisitor):
    def __init__(self):
        self.classes = []
        self.functions = []
        self.imports = []
        self.current_class = None
        self.end_line = 0
    
    def visit_ClassDef(self, node):
        class_info = {
            'name': node.name,
            'start_line': node.lineno,
            'start_col': node.col_offset,
            'end_line': self.get_end_line(node),
            'end_col': 0,
            'bases': [self.get_name(base) for base in node.bases],
            'methods': []
        }
        
        old_class = self.current_class
        self.current_class = class_info
        
        # Visit all child nodes
        for child in node.body:
            self.visit(child)
        
        self.current_class = old_class
        
        if old_class is None:
            self.classes.append(class_info)
        self.end_line = max(self.end_line, class_info['end_line'])
    
    def visit_FunctionDef(self, node):
        func_info = {
            'name': node.name,
            'start_line': node.lineno,
            'start_col': node.col_offset,
            'end_line': self.get_end_line(node),
            'end_col': 0,
            'params': self.get_function_params(node),
            'calls': self.extract_function_calls(node)
        }
        
        if self.current_class:
            self.current_class['methods'].append(func_info)
        else:
            self.functions.append(func_info)
        
        self.end_line = max(self.end_line, func_info['end_line'])
    
    def visit_Import(self, node):
        for name in node.names:
            self.imports.append({
                'name': name.name,
                'asname': name.asname,
                'imported_names': [],
                'type': 'direct'
            })
    
    def visit_ImportFrom(self, node):
        imported_names = [name.name for name in node.names]
        self.imports.append({
            'name': node.module or '',
            'level': node.level,
            'imported_names': imported_names,
            'type': 'from'
        })
    
    def get_function_params(self, node):
        params = []
        for arg in node.args.args:
            params.append(arg.arg)
        if node.args.vararg:
            params.append(f"*{node.args.vararg.arg}")
        if node.args.kwarg:
            params.append(f"**{node.args.kwarg.arg}")
        return params
    
    def extract_function_calls(self, node):
        calls = []
        
        for child in ast.walk(node):
            if isinstance(child, ast.Call):
                if isinstance(child.func, ast.Name):
                    # Simple function call: func()
                    calls.append(child.func.id)
                elif isinstance(child.func, ast.Attribute):
                    # Method call: obj.method()
                    if isinstance(child.func.value, ast.Name):
                        calls.append(f"{child.func.value.id}.{child.func.attr}")
        
        return calls
    
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

def parse_python_file(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        source = f.read()
    
    try:
        tree = ast.parse(source)
        visitor = AstVisitor()
        visitor.visit(tree)
        
        return {
            'classes': visitor.classes,
            'functions': visitor.functions,
            'imports': visitor.imports,
            'end_line': visitor.end_line or len(source.splitlines())
        }
    except SyntaxError as e:
        return {
            'error': f"Syntax error: {str(e)}",
            'classes': [],
            'functions': [],
            'imports': [],
            'end_line': len(source.splitlines()) if 'source' in locals() else 1
        }

if __name__ == '__main__':
    if len(sys.argv) != 2:
        print("Usage: python_ast_parser.py <python_file>")
        sys.exit(1)
    
    result = parse_python_file(sys.argv[1])
    print(json.dumps(result))
`;

    /**
     * Enhanced JavaScript/TypeScript AST parser script (for future expansion)
     */
    public static readonly JAVASCRIPT_AST_PARSER = `#!/usr/bin/env node
// JavaScript/TypeScript AST parser for SIKG
// This would be used if we expand to support JS/TS files

const fs = require('fs');
const path = require('path');

// Placeholder for JavaScript AST parsing
// Would use @babel/parser or typescript compiler API in a real implementation

function parseJavaScriptFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Basic regex-based parsing for demonstration
        // In a real implementation, would use proper AST parsing
        const functions = [];
        const classes = [];
        const imports = [];
        
        // Extract function declarations
        const functionMatches = content.matchAll(/(?:function|const|let|var)\\s+(\\w+)\\s*[=\\(]/g);
        for (const match of functionMatches) {
            functions.push({
                name: match[1],
                start_line: content.substring(0, match.index).split('\\n').length,
                type: 'function'
            });
        }
        
        // Extract class declarations
        const classMatches = content.matchAll(/class\\s+(\\w+)/g);
        for (const match of classMatches) {
            classes.push({
                name: match[1],
                start_line: content.substring(0, match.index).split('\\n').length,
                type: 'class'
            });
        }
        
        // Extract import statements
        const importMatches = content.matchAll(/import\\s+(?:{([^}]+)}|([\\w]+))\\s+from\\s+['"]([^'"]+)['"]/g);
        for (const match of importMatches) {
            const namedImports = match[1] ? match[1].split(',').map(s => s.trim()) : [];
            const defaultImport = match[2];
            const module = match[3];
            
            imports.push({
                module,
                namedImports,
                defaultImport,
                type: 'es6'
            });
        }
        
        return {
            functions,
            classes,
            imports,
            language: 'javascript'
        };
    } catch (error) {
        return {
            error: error.message,
            functions: [],
            classes: [],
            imports: [],
            language: 'javascript'
        };
    }
}

if (require.main === module) {
    if (process.argv.length !== 3) {
        console.error('Usage: javascript_ast_parser.js <javascript_file>');
        process.exit(1);
    }
    
    const result = parseJavaScriptFile(process.argv[2]);
    console.log(JSON.stringify(result, null, 2));
}

module.exports = { parseJavaScriptFile };
`;

    /**
     * Enhanced Java AST parser script (for future expansion)
     */
    public static readonly JAVA_AST_PARSER = `#!/usr/bin/env python
# Java AST parser for SIKG
# Uses a simple regex-based approach for demonstration
# In a real implementation, would use a proper Java parser

import re
import json
import sys

def parse_java_file(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        classes = []
        methods = []
        imports = []
        
        # Extract package declaration
        package_match = re.search(r'package\\s+([\\w.]+);', content)
        package_name = package_match.group(1) if package_match else ''
        
        # Extract import statements
        import_matches = re.finditer(r'import\\s+(?:static\\s+)?([\\w.*]+);', content)
        for match in import_matches:
            imports.append({
                'name': match.group(1),
                'type': 'java_import',
                'static': 'static' in match.group(0)
            })
        
        # Extract class declarations
        class_matches = re.finditer(r'(?:public|private|protected)?\\s*(?:abstract|final)?\\s*class\\s+(\\w+)(?:\\s+extends\\s+(\\w+))?(?:\\s+implements\\s+([\\w,\\s]+))?\\s*{', content)
        for match in class_matches:
            class_name = match.group(1)
            extends_class = match.group(2)
            implements_interfaces = match.group(3)
            
            start_line = content[:match.start()].count('\\n') + 1
            
            classes.append({
                'name': class_name,
                'package': package_name,
                'extends': extends_class,
                'implements': implements_interfaces.split(',') if implements_interfaces else [],
                'start_line': start_line,
                'methods': []
            })
        
        # Extract method declarations
        method_matches = re.finditer(r'(?:public|private|protected)?\\s*(?:static)?\\s*(?:final)?\\s*(?:\\w+(?:<[^>]+>)?|void)\\s+(\\w+)\\s*\\([^)]*\\)\\s*(?:throws\\s+[\\w,\\s]+)?\\s*{', content)
        for match in method_matches:
            method_name = match.group(1)
            start_line = content[:match.start()].count('\\n') + 1
            
            # Skip constructors and common patterns that aren't real methods
            if method_name in ['if', 'while', 'for', 'switch', 'try', 'catch', 'synchronized']:
                continue
            
            methods.append({
                'name': method_name,
                'start_line': start_line,
                'type': 'method'
            })
        
        return {
            'package': package_name,
            'classes': classes,
            'methods': methods,
            'imports': imports,
            'language': 'java'
        }
    
    except Exception as e:
        return {
            'error': str(e),
            'package': '',
            'classes': [],
            'methods': [],
            'imports': [],
            'language': 'java'
        }

if __name__ == '__main__':
    if len(sys.argv) != 2:
        print("Usage: java_ast_parser.py <java_file>", file=sys.stderr)
        sys.exit(1)
    
    result = parse_java_file(sys.argv[1])
    print(json.dumps(result))
`;

    /**
     * Enhanced C# AST parser script (for future expansion)
     */
    public static readonly CSHARP_AST_PARSER = `#!/usr/bin/env python
# C# AST parser for SIKG
# Uses a simple regex-based approach for demonstration
# In a real implementation, would use Roslyn or similar

import re
import json
import sys

def parse_csharp_file(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        namespaces = []
        classes = []
        methods = []
        using_statements = []
        
        # Extract using statements
        using_matches = re.finditer(r'using\\s+([\\w.]+);', content)
        for match in using_matches:
            using_statements.append({
                'name': match.group(1),
                'type': 'using'
            })
        
        # Extract namespace declarations
        namespace_matches = re.finditer(r'namespace\\s+([\\w.]+)', content)
        for match in namespace_matches:
            namespaces.append({
                'name': match.group(1),
                'start_line': content[:match.start()].count('\\n') + 1
            })
        
        # Extract class declarations
        class_matches = re.finditer(r'(?:public|private|protected|internal)?\\s*(?:abstract|sealed)?\\s*(?:partial)?\\s*class\\s+(\\w+)(?:\\s*:\\s*([\\w,\\s]+))?', content)
        for match in class_matches:
            class_name = match.group(1)
            base_classes = match.group(2)
            start_line = content[:match.start()].count('\\n') + 1
            
            classes.append({
                'name': class_name,
                'base_classes': base_classes.split(',') if base_classes else [],
                'start_line': start_line,
                'methods': []
            })
        
        # Extract method declarations
        method_matches = re.finditer(r'(?:public|private|protected|internal)?\\s*(?:static)?\\s*(?:virtual|override|abstract)?\\s*(?:\\w+(?:<[^>]+>)?|void)\\s+(\\w+)\\s*\\([^)]*\\)', content)
        for match in method_matches:
            method_name = match.group(1)
            start_line = content[:match.start()].count('\\n') + 1
            
            # Skip common keywords that might match the pattern
            if method_name in ['if', 'while', 'for', 'foreach', 'switch', 'try', 'catch', 'using', 'lock']:
                continue
            
            methods.append({
                'name': method_name,
                'start_line': start_line,
                'type': 'method'
            })
        
        return {
            'namespaces': namespaces,
            'classes': classes,
            'methods': methods,
            'using_statements': using_statements,
            'language': 'csharp'
        }
    
    except Exception as e:
        return {
            'error': str(e),
            'namespaces': [],
            'classes': [],
            'methods': [],
            'using_statements': [],
            'language': 'csharp'
        }

if __name__ == '__main__':
    if len(sys.argv) != 2:
        print("Usage: csharp_ast_parser.py <csharp_file>", file=sys.stderr)
        sys.exit(1)
    
    result = parse_csharp_file(sys.argv[1])
    print(json.dumps(result))
`;

    /**
     * Enhanced Go AST parser script (for future expansion)
     */
    public static readonly GO_AST_PARSER = `#!/usr/bin/env python
# Go AST parser for SIKG
# Uses a simple regex-based approach for demonstration
# In a real implementation, would use go/ast package

import re
import json
import sys

def parse_go_file(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        package_name = ''
        imports = []
        functions = []
        structs = []
        interfaces = []
        
        # Extract package declaration
        package_match = re.search(r'package\\s+(\\w+)', content)
        if package_match:
            package_name = package_match.group(1)
        
        # Extract import statements
        # Handle both single imports and import blocks
        single_import_matches = re.finditer(r'^import\\s+"([^"]+)"', content, re.MULTILINE)
        for match in single_import_matches:
            imports.append({
                'name': match.group(1),
                'type': 'single_import'
            })
        
        # Handle import blocks
        import_block_matches = re.finditer(r'import\\s*\\(([^)]+)\\)', content, re.DOTALL)
        for block_match in import_block_matches:
            block_content = block_match.group(1)
            import_matches = re.finditer(r'"([^"]+)"', block_content)
            for match in import_matches:
                imports.append({
                    'name': match.group(1),
                    'type': 'block_import'
                })
        
        # Extract function declarations
        func_matches = re.finditer(r'func\\s+(?:\\([^)]*\\)\\s+)?(\\w+)\\s*\\([^)]*\\)(?:\\s*[\\w\\[\\],\\s*]*)?\\s*{', content)
        for match in func_matches:
            func_name = match.group(1)
            start_line = content[:match.start()].count('\\n') + 1
            
            functions.append({
                'name': func_name,
                'start_line': start_line,
                'type': 'function'
            })
        
        # Extract struct declarations
        struct_matches = re.finditer(r'type\\s+(\\w+)\\s+struct\\s*{', content)
        for match in struct_matches:
            struct_name = match.group(1)
            start_line = content[:match.start()].count('\\n') + 1
            
            structs.append({
                'name': struct_name,
                'start_line': start_line,
                'type': 'struct'
            })
        
        # Extract interface declarations
        interface_matches = re.finditer(r'type\\s+(\\w+)\\s+interface\\s*{', content)
        for match in interface_matches:
            interface_name = match.group(1)
            start_line = content[:match.start()].count('\\n') + 1
            
            interfaces.append({
                'name': interface_name,
                'start_line': start_line,
                'type': 'interface'
            })
        
        return {
            'package': package_name,
            'imports': imports,
            'functions': functions,
            'structs': structs,
            'interfaces': interfaces,
            'language': 'go'
        }
    
    except Exception as e:
        return {
            'error': str(e),
            'package': '',
            'imports': [],
            'functions': [],
            'structs': [],
            'interfaces': [],
            'language': 'go'
        }

if __name__ == '__main__':
    if len(sys.argv) != 2:
        print("Usage: go_ast_parser.py <go_file>", file=sys.stderr)
        sys.exit(1)
    
    result = parse_go_file(sys.argv[1])
    print(json.dumps(result))
`;

    /**
     * Enhanced JavaScript/TypeScript test parser (for future expansion)
     */
    public static readonly JAVASCRIPT_TEST_AST_PARSER = `#!/usr/bin/env node
// JavaScript/TypeScript test AST parser for SIKG
// Handles Jest, Mocha, Jasmine, and other JS test frameworks

const fs = require('fs');

function parseJavaScriptTestFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        
        const testFunctions = [];
        const imports = [];
        const suites = [];
        
        // Extract import statements
        const importMatches = content.matchAll(/(?:import|const|let|var)\\s+(?:{([^}]+)}|([\\w]+))\\s+(?:from\\s+['"]([^'"]+)['"]|=\\s*require\\(['"]([^'"]+)['"]\\))/g);
        for (const match of importMatches) {
            const namedImports = match[1] ? match[1].split(',').map(s => s.trim()) : [];
            const defaultImport = match[2];
            const module = match[3] || match[4];
            
            imports.push({
                module,
                namedImports,
                defaultImport,
                type: match[3] ? 'es6' : 'commonjs'
            });
        }
        
        // Extract test suites (describe blocks)
        const describeMatches = content.matchAll(/describe\\s*\\(\\s*['"]([^'"]+)['"]\\s*,/g);
        for (const match of describeMatches) {
            suites.push({
                name: match[1],
                start_line: content.substring(0, match.index).split('\\n').length,
                type: 'suite'
            });
        }
        
        // Extract test functions (it, test blocks)
        const testMatches = content.matchAll(/(?:it|test)\\s*\\(\\s*['"]([^'"]+)['"]\\s*,/g);
        for (const match of testMatches) {
            const testName = match[1];
            const startLine = content.substring(0, match.index).split('\\n').length;
            
            // Extract potential function names from test name
            const potentialFunctions = extractJSFunctionNames(testName);
            
            testFunctions.push({
                name: testName,
                start_line: startLine,
                type: 'test',
                name_inferences: potentialFunctions,
                framework: 'jest_mocha'
            });
        }
        
        return {
            test_functions: testFunctions,
            test_suites: suites,
            imports,
            language: 'javascript'
        };
    } catch (error) {
        return {
            error: error.message,
            test_functions: [],
            test_suites: [],
            imports: [],
            language: 'javascript'
        };
    }
}

function extractJSFunctionNames(testName) {
    const potentialNames = [];
    
    // Handle common JS test patterns
    // "should test functionName" -> "functionName"
    const shouldMatch = testName.match(/should\\s+test\\s+(\\w+)/i);
    if (shouldMatch) {
        potentialNames.push(shouldMatch[1]);
    }
    
    // "test functionName" -> "functionName"
    const testMatch = testName.match(/test\\s+(\\w+)/i);
    if (testMatch) {
        potentialNames.push(testMatch[1]);
    }
    
    // "functionName should..." -> "functionName"
    const functionMatch = testName.match(/^(\\w+)\\s+should/i);
    if (functionMatch) {
        potentialNames.push(functionMatch[1]);
    }
    
    return potentialNames.map(name => ({
        name,
        confidence: 0.8,
        reason: 'name_based_inference'
    }));
}

if (require.main === module) {
    if (process.argv.length !== 3) {
        console.error('Usage: javascript_test_ast_parser.js <javascript_test_file>');
        process.exit(1);
    }
    
    const result = parseJavaScriptTestFile(process.argv[2]);
    console.log(JSON.stringify(result, null, 2));
}

module.exports = { parseJavaScriptTestFile };
`;

    /**
     * Enhanced Java test parser (for future expansion)
     */
    public static readonly JAVA_TEST_AST_PARSER = `#!/usr/bin/env python
# Java test AST parser for SIKG
# Handles JUnit and TestNG test frameworks

import re
import json
import sys

def parse_java_test_file(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        test_classes = []
        test_methods = []
        imports = []
        
        # Extract package declaration
        package_match = re.search(r'package\\s+([\\w.]+);', content)
        package_name = package_match.group(1) if package_match else ''
        
        # Extract import statements
        import_matches = re.finditer(r'import\\s+(?:static\\s+)?([\\w.*]+);', content)
        for match in import_matches:
            imports.append({
                'name': match.group(1),
                'type': 'java_import',
                'static': 'static' in match.group(0)
            })
        
        # Extract test classes
        test_class_matches = re.finditer(r'(?:public\\s+)?class\\s+(\\w*[Tt]est\\w*)(?:\\s+extends\\s+(\\w+))?', content)
        for match in test_class_matches:
            class_name = match.group(1)
            extends_class = match.group(2)
            start_line = content[:match.start()].count('\\n') + 1
            
            test_classes.append({
                'name': class_name,
                'package': package_name,
                'extends': extends_class,
                'start_line': start_line,
                'test_methods': []
            })
        
        # Extract test methods (JUnit and TestNG)
        test_method_matches = re.finditer(r'@(?:Test|org\\.junit\\.[^\\s]*\\.Test|org\\.testng\\.[^\\s]*\\.Test)(?:\\([^)]*\\))?\\s*(?:public\\s+)?(?:void\\s+)?(test\\w+|\\w*[Tt]est\\w*)\\s*\\([^)]*\\)', content)
        for match in test_method_matches:
            method_name = match.group(1)
            start_line = content[:match.start()].count('\\n') + 1
            
            # Extract potential function names from test method name
            potential_functions = extract_java_function_names(method_name)
            
            test_methods.append({
                'name': method_name,
                'start_line': start_line,
                'type': 'test_method',
                'name_inferences': potential_functions,
                'framework': 'junit_testng'
            })
        
        return {
            'package': package_name,
            'test_classes': test_classes,
            'test_methods': test_methods,
            'imports': imports,
            'language': 'java'
        }
    
    except Exception as e:
        return {
            'error': str(e),
            'package': '',
            'test_classes': [],
            'test_methods': [],
            'imports': [],
            'language': 'java'
        }

def extract_java_function_names(test_method_name):
    potential_names = []
    
    # Handle Java test naming patterns
    # "testFunctionName" -> "functionName"
    if test_method_name.startswith('test') and len(test_method_name) > 4:
        camel_part = test_method_name[4:]
        if camel_part and camel_part[0].isupper():
            function_name = camel_part[0].lower() + camel_part[1:]
            potential_names.append({
                'name': function_name,
                'confidence': 0.9,
                'reason': 'java_test_naming_convention'
            })
    
    # "shouldTestFunctionName" -> "functionName"
    should_match = re.search(r'should(?:Test)?([A-Z]\\w+)', test_method_name)
    if should_match:
        function_name = should_match.group(1)[0].lower() + should_match.group(1)[1:]
        potential_names.append({
            'name': function_name,
            'confidence': 0.8,
            'reason': 'should_test_pattern'
        })
    
    return potential_names

if __name__ == '__main__':
    if len(sys.argv) != 2:
        print("Usage: java_test_ast_parser.py <java_test_file>", file=sys.stderr)
        sys.exit(1)
    
    result = parse_java_test_file(sys.argv[1])
    print(json.dumps(result))
`;

    /**
     * Get script content by name
     * @param scriptName Name of the script to retrieve
     * @returns The script content or null if not found
     */
    public static getScript(scriptName: string): string | null {
        switch (scriptName) {
            case 'python_ast_parser.py':
                return this.PYTHON_AST_PARSER;
            case 'python_test_ast_parser.py':
                return this.PYTHON_TEST_AST_PARSER;
            case 'javascript_ast_parser.js':
                return this.JAVASCRIPT_AST_PARSER;
            case 'javascript_test_ast_parser.js':
                return this.JAVASCRIPT_TEST_AST_PARSER;
            case 'java_ast_parser.py':
                return this.JAVA_AST_PARSER;
            case 'java_test_ast_parser.py':
                return this.JAVA_TEST_AST_PARSER;
            case 'csharp_ast_parser.py':
                return this.CSHARP_AST_PARSER;
            case 'go_ast_parser.py':
                return this.GO_AST_PARSER;
            default:
                return null;
        }
    }

    /**
     * Get all available script names
     * @returns Array of available script names
     */
    public static getAvailableScripts(): string[] {
        return [
            'python_ast_parser.py',
            'python_test_ast_parser.py',
            'javascript_ast_parser.js',
            'javascript_test_ast_parser.js',
            'java_ast_parser.py',
            'java_test_ast_parser.py',
            'csharp_ast_parser.py',
            'go_ast_parser.py'
        ];
    }

    /**
     * Check if a script is available
     * @param scriptName Name of the script to check
     * @returns True if the script is available
     */
    public static hasScript(scriptName: string): boolean {
        return this.getAvailableScripts().includes(scriptName);
    }

    /**
     * Get script by language
     * @param language Programming language
     * @returns Script content or null if not found
     */
    public static getScriptByLanguage(language: string): string | null {
        const scriptMap: Record<string, string> = {
            'python': 'python_ast_parser.py',
            'javascript': 'javascript_ast_parser.js',
            'typescript': 'javascript_ast_parser.js',
            'java': 'java_ast_parser.py',
            'csharp': 'csharp_ast_parser.py',
            'go': 'go_ast_parser.py'
        };

        const scriptName = scriptMap[language.toLowerCase()];
        return scriptName ? this.getScript(scriptName) : null;
    }

    /**
     * Get test script by language
     * @param language Programming language
     * @returns Test script content or null if not found
     */
    public static getTestScriptByLanguage(language: string): string | null {
        const testScriptMap: Record<string, string> = {
            'python': 'python_test_ast_parser.py',
            'javascript': 'javascript_test_ast_parser.js',
            'typescript': 'javascript_test_ast_parser.js',
            'java': 'java_test_ast_parser.py'
        };

        const scriptName = testScriptMap[language.toLowerCase()];
        return scriptName ? this.getScript(scriptName) : null;
    }

    /**
     * Get supported languages for code parsing
     * @returns Array of supported language names
     */
    public static getSupportedLanguages(): string[] {
        return ['python', 'javascript', 'typescript', 'java', 'csharp', 'go'];
    }

    /**
     * Get supported languages for test parsing
     * @returns Array of supported language names for test parsing
     */
    public static getSupportedTestLanguages(): string[] {
        return ['python', 'javascript', 'typescript', 'java'];
    }

    /**
     * Check if a language is supported for code parsing
     * @param language Language to check
     * @returns True if the language is supported
     */
    public static isLanguageSupported(language: string): boolean {
        return this.getSupportedLanguages().includes(language.toLowerCase());
    }

    /**
     * Check if a language is supported for test parsing
     * @param language Language to check
     * @returns True if the language is supported for test parsing
     */
    public static isTestLanguageSupported(language: string): boolean {
        return this.getSupportedTestLanguages().includes(language.toLowerCase());
    }

    /**
     * Get script information for a language
     * @param language Programming language
     * @returns Information about available scripts for the language
     */
    public static getLanguageScriptInfo(language: string): {
        codeParser: string | null;
        testParser: string | null;
        supported: boolean;
        testSupported: boolean;
    } {
        const lang = language.toLowerCase();
        return {
            codeParser: this.getScriptByLanguage(lang),
            testParser: this.getTestScriptByLanguage(lang),
            supported: this.isLanguageSupported(lang),
            testSupported: this.isTestLanguageSupported(lang)
        };
    }
}