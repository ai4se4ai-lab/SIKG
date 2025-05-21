// AstScripts.ts - Contains AST script content as strings

/**
 * Python AST scripts for code and test parsing
 */
export class AstScripts {
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
                'imported_names': []
            })
    
    def visit_ImportFrom(self, node):
        imported_names = [name.name for name in node.names]
        self.imports.append({
            'name': node.module or '',
            'level': node.level,
            'imported_names': imported_names
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
            'end_line': len(source.splitlines())
        }

if __name__ == '__main__':
    if len(sys.argv) != 2:
        print("Usage: python_ast_parser.py <python_file>")
        sys.exit(1)
    
    result = parse_python_file(sys.argv[1])
    print(json.dumps(result))
`;

    /**
     * Python AST parser script for test analysis
     */
    public static readonly PYTHON_TEST_AST_PARSER = `#!/usr/bin/env python
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
            default:
                return null;
        }
    }
}