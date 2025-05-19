// Config Manager - Manages extension configuration

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
     * Get code file extensions to consider
     */
    public getCodeFileExtensions(): string[] {
        return vscode.workspace.getConfiguration('sikg').get<string[]>('codeFileExtensions', [
            'ts', 'js', 'tsx', 'jsx', 'java', 'py', 'cs', 'go'
        ]);
    }

    /**
     * Get test file patterns to identify test files
     */
    public getTestFilePatterns(): string[] {
        return vscode.workspace.getConfiguration('sikg').get<string[]>('testFilePatterns', [
            '**/*.test.{ts,js,tsx,jsx}',
            '**/*.spec.{ts,js,tsx,jsx}',
            '**/*Test.{java,kt}',
            '**/*Tests.{cs,fs}',
            '**/*_test.go',
            '**/test_*.py',
            '**/*_test.py'
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
            '**/.git/**'
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
}