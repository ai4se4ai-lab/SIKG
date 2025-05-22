// ConfigManager.ts - Fixed language support configuration

import * as vscode from 'vscode';

export class ConfigManager {
    private context: vscode.ExtensionContext;
    private initialized: boolean = false;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * Initialize the configuration manager
     */
    public async initialize(): Promise<void> {
        // Register configuration change handlers
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('sikg')) {
                // Configuration changed, reload values
                this.loadConfiguration();
            }
        });

        // Initial configuration load
        this.loadConfiguration();
        this.initialized = true;
    }

    /**
     * Load configuration values from settings
     */
    private loadConfiguration(): void {
        // Load values into memory for faster access
    }

    /**
     * Get log level from configuration
     */
    public getLogLevel(): 'debug' | 'info' | 'warn' | 'error' {
        return vscode.workspace.getConfiguration('sikg').get<'debug' | 'info' | 'warn' | 'error'>('logLevel', 'info');
    }

    /**
     * Get code file extensions to consider - FIXED to use standard VS Code language identifiers
     */
    public getCodeFileExtensions(): string[] {
        return vscode.workspace.getConfiguration('sikg').get<string[]>('codeFileExtensions', [
            'py',      // Python files
            'js',      // JavaScript files
            'ts',      // TypeScript files
            'jsx',     // React JavaScript files
            'tsx',     // React TypeScript files
            'java',    // Java files
            'cs',      // C# files
            'go'       // Go files
        ]);
    }

    /**
     * Get test file patterns to identify test files - FIXED patterns
     */
    public getTestFilePatterns(): string[] {
        return vscode.workspace.getConfiguration('sikg').get<string[]>('testFilePatterns', [
            // Python test patterns
            '**/test_*.py',
            '**/*_test.py',
            '**/tests.py',
            '**/test*.py',
            
            // JavaScript/TypeScript test patterns
            '**/*.test.js',
            '**/*.test.ts',
            '**/*.test.jsx',
            '**/*.test.tsx',
            '**/*.spec.js',
            '**/*.spec.ts',
            '**/*.spec.jsx',
            '**/*.spec.tsx',
            
            // Java test patterns
            '**/*Test.java',
            '**/*Tests.java',
            '**/Test*.java',
            
            // C# test patterns
            '**/*Test.cs',
            '**/*Tests.cs',
            '**/Test*.cs',
            
            // Go test patterns
            '**/*_test.go'
        ]);
    }

    /**
     * Get patterns to exclude from analysis
     */
    public getExcludePatterns(): string[] {
        return vscode.workspace.getConfiguration('sikg').get<string[]>('excludePatterns', [
            '**/node_modules/**',
            '**/dist/**',
            '**/build/**',
            '**/coverage/**',
            '**/.git/**',
            '**/venv/**',
            '**/env/**',
            '**/__pycache__/**',
            '**/target/**',      // Java/Maven
            '**/bin/**',         // C#/.NET
            '**/obj/**',         // C#/.NET
            '**/vendor/**'       // Go/PHP
        ]);
    }

    /**
     * Get maximum traversal depth for impact propagation
     */
    public getMaxTraversalDepth(): number {
        return vscode.workspace.getConfiguration('sikg').get<number>('maxTraversalDepth', 5);
    }

    /**
     * Get minimum impact threshold to continue propagation
     */
    public getMinImpactThreshold(): number {
        return vscode.workspace.getConfiguration('sikg').get<number>('minImpactThreshold', 0.05);
    }

    /**
     * Get high impact threshold for feedback learning
     */
    public getHighImpactThreshold(): number {
        return vscode.workspace.getConfiguration('sikg').get<number>('highImpactThreshold', 0.7);
    }

    /**
     * Get low impact threshold for feedback learning
     */
    public getLowImpactThreshold(): number {
        return vscode.workspace.getConfiguration('sikg').get<number>('lowImpactThreshold', 0.3);
    }

    /**
     * Get supported programming languages - FIXED to use VS Code language identifiers
     */
    public getSupportedLanguages(): string[] {
        return [
            'python',      // VS Code language identifier for Python
            'javascript',  // VS Code language identifier for JavaScript
            'typescript',  // VS Code language identifier for TypeScript
            'java',        // VS Code language identifier for Java
            'csharp',      // VS Code language identifier for C#
            'go'           // VS Code language identifier for Go
        ];
    }

    /**
     * Get language from file extension - FIXED mapping
     */
    public getLanguageFromExtension(extension: string): string {
        const extensionMap: Record<string, string> = {
            '.py': 'python',
            '.js': 'javascript',
            '.jsx': 'javascript',
            '.ts': 'typescript',
            '.tsx': 'typescript',
            '.java': 'java',
            '.cs': 'csharp',
            '.go': 'go'
        };

        const normalizedExt = extension.toLowerCase();
        return extensionMap[normalizedExt] || 'plaintext';
    }

    /**
     * Check if a language is supported
     */
    public isLanguageSupported(language: string): boolean {
        return this.getSupportedLanguages().includes(language.toLowerCase());
    }

    /**
     * Get file extensions for a specific language
     */
    public getExtensionsForLanguage(language: string): string[] {
        const languageExtensions: Record<string, string[]> = {
            'python': ['.py'],
            'javascript': ['.js', '.jsx'],
            'typescript': ['.ts', '.tsx'],
            'java': ['.java'],
            'csharp': ['.cs'],
            'go': ['.go']
        };

        return languageExtensions[language.toLowerCase()] || [];
    }

    /**
     * Get test frameworks for a language
     */
    public getTestFrameworksForLanguage(language: string): string[] {
        const frameworkMap: Record<string, string[]> = {
            'python': ['unittest', 'pytest'],
            'javascript': ['jest', 'mocha', 'jasmine'],
            'typescript': ['jest', 'mocha', 'jasmine'],
            'java': ['junit', 'testng'],
            'csharp': ['nunit', 'xunit', 'mstest'],
            'go': ['testing']
        };

        return frameworkMap[language.toLowerCase()] || [];
    }
}