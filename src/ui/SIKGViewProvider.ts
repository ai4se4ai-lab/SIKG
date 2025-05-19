// SIKGViewProvider.ts - WebView for displaying SIKG results

import * as vscode from 'vscode';
import { SIKGManager } from '../sikg/SIKGManager';
import { TestPrioritizer } from '../sikg/TestPrioritizer';
import { SemanticChangeInfo, TestImpact, TestResult } from '../sikg/GraphTypes';
import { Logger } from '../utils/Logger';

/**
 * WebView provider for displaying SIKG analysis results
 */
export class SIKGViewProvider implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;
    private context: vscode.ExtensionContext;
    private sikgManager: SIKGManager;
    private testPrioritizer: TestPrioritizer;
    private latestChanges: SemanticChangeInfo[] = [];
    private latestTestImpacts: Record<string, TestImpact> = {};
    private latestTestResults: TestResult[] = [];

    constructor(
        context: vscode.ExtensionContext,
        sikgManager: SIKGManager,
        testPrioritizer: TestPrioritizer
    ) {
        this.context = context;
        this.sikgManager = sikgManager;
        this.testPrioritizer = testPrioritizer;
    }

    /**
     * Resolve the webview view
     */
    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext<unknown>,
        token: vscode.CancellationToken
    ): void | Thenable<void> {
        Logger.debug('Resolving SIKG webview');
        this.view = webviewView;

        // Configure webview options
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri]
        };

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(message => {
            switch (message.command) {
                case 'analyze':
                    Logger.debug('Webview requested analyze command');
                    vscode.commands.executeCommand('sikg.analyzeChanges');
                    break;
                    
                case 'runTests':
                    Logger.debug(`Webview requested to run tests, topN=${message.topN}`);
                    vscode.commands.executeCommand('sikg.runPrioritizedTests', message.topN);
                    break;
                    
                case 'visualizeGraph':
                    Logger.debug('Webview requested graph visualization');
                    vscode.commands.executeCommand('sikg.visualizeGraph');
                    break;
                    
                case 'openFile':
                    Logger.debug(`Webview requested to open file: ${message.filePath}:${message.line}`);
                    this.openFile(message.filePath, message.line);
                    break;
                    
                case 'rebuildGraph':
                    Logger.debug('Webview requested to rebuild graph');
                    vscode.commands.executeCommand('sikg.rebuildGraph');
                    break;
            }
        });

        // Set initial content
        webviewView.webview.html = this.getHtmlContent();
    }

    /**
     * Update the view with new results from change analysis
     */
    public updateWithResults(
        semanticChanges: SemanticChangeInfo[],
        testImpacts: Record<string, TestImpact>
    ): void {
        Logger.info(`Updating SIKG view with ${semanticChanges.length} changes and ${Object.keys(testImpacts).length} test impacts`);
        this.latestChanges = semanticChanges;
        this.latestTestImpacts = testImpacts;

        if (this.view) {
            this.view.webview.html = this.getHtmlContent();
            this.view.webview.postMessage({
                command: 'update',
                changes: semanticChanges,
                testImpacts: Object.values(testImpacts).sort((a, b) => b.impactScore - a.impactScore)
            });
        }
    }

    /**
     * Update the view with test results
     */
    public updateWithTestResults(testResults: TestResult[]): void {
        Logger.info(`Updating SIKG view with ${testResults.length} test results`);
        this.latestTestResults = testResults;

        if (this.view) {
            this.view.webview.html = this.getHtmlContent();
            this.view.webview.postMessage({
                command: 'updateTestResults',
                testResults
            });
        }
    }

    /**
     * Get the latest test impacts
     */
    public getLatestTestImpacts(): Record<string, TestImpact> {
        return this.latestTestImpacts;
    }

    /**
     * Open a file at a specific line
     */
    private openFile(filePath: string, line: number): void {
        Logger.debug(`Opening file ${filePath} at line ${line}`);
        
        if (!filePath) {
            Logger.warn('Cannot open file: no file path provided');
            return;
        }
        
        try {
            // Convert to URI if it's a relative path
            const fileUri = filePath.startsWith('/')
                ? vscode.Uri.file(filePath)
                : vscode.Uri.file(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath + '/' + filePath);
                
            vscode.workspace.openTextDocument(fileUri).then(document => {
                vscode.window.showTextDocument(document).then(editor => {
                    // Go to the specified line
                    const position = new vscode.Position(line - 1, 0);
                    editor.selection = new vscode.Selection(position, position);
                    editor.revealRange(
                        new vscode.Range(position, position),
                        vscode.TextEditorRevealType.InCenter
                    );
                });
            }, error => {
                Logger.error(`Failed to open document: ${filePath}`, error);
                vscode.window.showErrorMessage(`Could not open file: ${filePath}`);
            });
        } catch (error) {
            Logger.error(`Error opening file ${filePath}:`, error);
            vscode.window.showErrorMessage(`Error opening file: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Generate HTML content for the webview
     */
    private getHtmlContent(): string {
        try {
            // Sort test impacts by score
            const sortedTestImpacts = Object.values(this.latestTestImpacts)
                .sort((a, b) => b.impactScore - a.impactScore);

            return /* html */`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>SIKG Results</title>
                    <style>
                        body {
                            font-family: var(--vscode-font-family);
                            color: var(--vscode-editor-foreground);
                            padding: 10px;
                            line-height: 1.5;
                        }
                        h2 {
                            margin-top: 20px;
                            border-bottom: 1px solid var(--vscode-panel-border);
                            padding-bottom: 5px;
                            color: var(--vscode-editor-foreground);
                        }
                        h3 {
                            margin-top: 15px;
                            color: var(--vscode-editor-foreground);
                        }
                        .change-item, .test-item {
                            margin-bottom: 10px;
                            padding: 10px;
                            border-radius: 4px;
                            background-color: var(--vscode-editor-background);
                            border: 1px solid var(--vscode-panel-border);
                        }
                        .change-item:hover, .test-item:hover {
                            background-color: var(--vscode-list-hoverBackground);
                        }
                        .change-type {
                            font-weight: bold;
                            color: var(--vscode-terminal-ansiYellow);
                            padding: 2px 6px;
                            border-radius: 3px;
                            background-color: var(--vscode-badge-background);
                            font-size: 0.9em;
                        }
                        .change-type.BUG_FIX {
                            color: var(--vscode-terminal-ansiRed);
                        }
                        .change-type.FEATURE_ADDITION {
                            color: var(--vscode-terminal-ansiGreen);
                        }
                        .change-type.REFACTORING_SIGNATURE {
                            color: var(--vscode-terminal-ansiBlue);
                        }
                        .change-type.REFACTORING_LOGIC {
                            color: var(--vscode-terminal-ansiCyan);
                        }
                        .change-type.PERFORMANCE_OPT {
                            color: var(--vscode-terminal-ansiMagenta);
                        }
                        .change-type.DEPENDENCY_UPDATE {
                            color: var(--vscode-terminal-ansiCyan);
                        }
                        .impact-score {
                            display: inline-block;
                            width: 40px;
                            text-align: right;
                            font-weight: bold;
                        }
                        .impact-bar-container {
                            display: inline-block;
                            width: 100px;
                            height: 8px;
                            background-color: var(--vscode-editor-background);
                            margin: 0 5px;
                            border-radius: 4px;
                            vertical-align: middle;
                        }
                        .impact-bar {
                            display: inline-block;
                            height: 8px;
                            background-color: var(--vscode-terminal-ansiRed);
                            border-radius: 4px;
                        }
                        .file-link {
                            color: var(--vscode-textLink-foreground);
                            text-decoration: none;
                            cursor: pointer;
                        }
                        .file-link:hover {
                            text-decoration: underline;
                        }
                        .buttons {
                            margin: 15px 0;
                        }
                        button {
                            background-color: var(--vscode-button-background);
                            color: var(--vscode-button-foreground);
                            border: none;
                            padding: 6px 12px;
                            border-radius: 2px;
                            cursor: pointer;
                            margin-right: 8px;
                            margin-bottom: 8px;
                        }
                        button:hover {
                            background-color: var(--vscode-button-hoverBackground);
                        }
                        .no-data {
                            color: var(--vscode-disabledForeground);
                            font-style: italic;
                            padding: 10px;
                            text-align: center;
                        }
                        .test-result {
                            margin-left: 8px;
                            font-weight: bold;
                            padding: 2px 6px;
                            border-radius: 3px;
                            font-size: 0.8em;
                        }
                        .test-result.passed {
                            color: var(--vscode-terminal-ansiGreen);
                            background-color: rgba(0, 128, 0, 0.2);
                        }
                        .test-result.failed {
                            color: var(--vscode-terminal-ansiRed);
                            background-color: rgba(255, 0, 0, 0.2);
                        }
                        .impact-low {
                            color: var(--vscode-terminal-ansiGreen);
                        }
                        .impact-medium {
                            color: var(--vscode-terminal-ansiYellow);
                        }
                        .impact-high {
                            color: var(--vscode-terminal-ansiRed);
                        }
                        .tooltip {
                            position: relative;
                            display: inline-block;
                            border-bottom: 1px dotted var(--vscode-editor-foreground);
                            cursor: help;
                        }
                        .tooltip .tooltiptext {
                            visibility: hidden;
                            background-color: var(--vscode-editorWidget-background);
                            color: var(--vscode-editor-foreground);
                            border: 1px solid var(--vscode-panel-border);
                            text-align: left;
                            border-radius: 4px;
                            padding: 8px;
                            position: absolute;
                            z-index: 1;
                            bottom: 125%;
                            left: 0;
                            margin-left: -60px;
                            opacity: 0;
                            transition: opacity 0.3s;
                            width: 250px;
                            font-size: 0.9em;
                        }
                        .tooltip:hover .tooltiptext {
                            visibility: visible;
                            opacity: 1;
                        }
                        .time-info {
                            font-size: 0.8em;
                            color: var(--vscode-descriptionForeground);
                            margin-left: 10px;
                        }
                        .summary {
                            padding: 10px;
                            margin: 10px 0;
                            border-radius: 4px;
                            background-color: var(--vscode-editor-background);
                            border-left: 3px solid var(--vscode-button-background);
                        }
                        .status-dot {
                            display: inline-block;
                            width: 8px;
                            height: 8px;
                            border-radius: 50%;
                            margin-right: 5px;
                        }
                        .status-dot.passed {
                            background-color: var(--vscode-terminal-ansiGreen);
                        }
                        .status-dot.failed {
                            background-color: var(--vscode-terminal-ansiRed);
                        }
                        .status-dot.pending {
                            background-color: var(--vscode-terminal-ansiYellow);
                        }
                        .header-with-count {
                            display: flex;
                            align-items: center;
                            justify-content: space-between;
                        }
                        .count-badge {
                            background-color: var(--vscode-badge-background);
                            color: var(--vscode-badge-foreground);
                            border-radius: 10px;
                            padding: 2px 8px;
                            font-size: 0.8em;
                        }
                        .scrollable-container {
                            max-height: 300px;
                            overflow-y: auto;
                            margin-bottom: 15px;
                            border: 1px solid var(--vscode-panel-border);
                            border-radius: 4px;
                        }
                    </style>
                </head>
                <body>
                    <div class="summary">
                        <strong>SIKG Status:</strong> 
                        ${this.latestChanges.length > 0 
                            ? `<span class="status-dot pending"></span>Changes analyzed, ${Object.keys(this.latestTestImpacts).length} tests impacted` 
                            : '<span class="status-dot pending"></span>Ready for analysis'}
                        ${this.latestTestResults.length > 0 
                            ? ` • ${this.latestTestResults.filter(r => r.status === 'passed').length} passed, ${this.latestTestResults.filter(r => r.status === 'failed').length} failed` 
                            : ''}
                    </div>
                    
                    <div class="buttons">
                        <button id="analyzeBtn" title="Analyze current changes and prioritize tests">
                            <span style="margin-right: 5px;">⚡</span> Analyze Changes
                        </button>
                        <button id="visualizeBtn" title="Visualize the impact graph">
                            <span style="margin-right: 5px;">🔍</span> Visualize Graph
                        </button>
                        <button id="rebuildGraphBtn" title="Rebuild knowledge graph from scratch">
                            <span style="margin-right: 5px;">🔄</span> Rebuild Graph
                        </button>
                    </div>
                    
                    <div class="header-with-count">
                        <h2>Detected Changes</h2>
                        ${this.latestChanges.length > 0 
                            ? `<span class="count-badge">${this.latestChanges.length}</span>` 
                            : ''}
                    </div>
                    
                    ${this.latestChanges.length > 0 ? `
                    <div class="scrollable-container">
                        <div id="changes-container">
                            ${this.latestChanges.map(change => {
                                const node = this.sikgManager.getNode(change.nodeId);
                                return `
                                <div class="change-item">
                                    <div>
                                        <span class="change-type ${change.semanticType}">${change.semanticType}</span>
                                        <span class="tooltip">ℹ️
                                            <span class="tooltiptext">
                                                Impact Score: ${(change.initialImpactScore * 100).toFixed(1)}%<br>
                                                Lines Changed: ${change.changeDetails.linesChanged}<br>
                                                Changed at: ${new Date(change.changeDetails.changeTimestamp || Date.now()).toLocaleString()}
                                            </span>
                                        </span>
                                    </div>
                                    <div>
                                        Element: <span class="file-link" data-file="${node?.filePath || ''}" data-line="${node?.properties?.loc?.start?.line || 1}">
                                            ${node?.name || change.nodeId}
                                        </span>
                                        <span class="time-info">${node?.filePath || ''}</span>
                                    </div>
                                </div>
                            `}).join('')}
                        </div>
                    </div>
                    ` : '<div class="no-data">No changes detected. Click "Analyze Changes" to start.</div>'}

                    <div class="header-with-count">
                        <h2>Prioritized Tests</h2>
                        ${sortedTestImpacts.length > 0 
                            ? `<span class="count-badge">${sortedTestImpacts.length}</span>` 
                            : ''}
                    </div>
                    
                    <div class="buttons">
                        <button id="runTopTestsBtn" ${sortedTestImpacts.length === 0 ? 'disabled' : ''}>
                            <span style="margin-right: 5px;">▶️</span> Run Top 5 Tests
                        </button>
                        <button id="runAllTestsBtn" ${sortedTestImpacts.length === 0 ? 'disabled' : ''}>
                            <span style="margin-right: 5px;">▶️</span> Run All Impacted Tests
                        </button>
                    </div>
                    
                    ${sortedTestImpacts.length > 0 ? `
                    <div class="scrollable-container">
                        <div id="tests-container">
                            ${sortedTestImpacts.map(test => {
                                // Find test result if available
                                const testResult = this.latestTestResults.find(r => r.testId === test.testId);
                                const impactClass = test.impactScore > 0.7 ? 'impact-high' : test.impactScore > 0.3 ? 'impact-medium' : 'impact-low';
                                
                                return `
                                    <div class="test-item">
                                        <div>
                                            <span class="impact-score ${impactClass}">${(test.impactScore * 100).toFixed(0)}%</span>
                                            <span class="impact-bar-container">
                                                <span class="impact-bar" style="width: ${test.impactScore * 100}px"></span>
                                            </span>
                                            ${testResult ? `<span class="test-result ${testResult.status}">${testResult.status.toUpperCase()}</span>` : ''}
                                        </div>
                                        <div>
                                            <span class="file-link" data-file="${test.testPath}" data-line="${this.sikgManager.getNode(test.testId)?.properties?.loc?.start?.line || 1}">
                                                ${test.testName}
                                            </span>
                                            <span class="time-info">${test.testPath}</span>
                                        </div>
                                        ${test.contributingChanges.length > 0 ? `
                                        <div class="tooltip">🔍 Impacted by ${test.contributingChanges.length} change(s)
                                            <span class="tooltiptext">
                                                ${test.contributingChanges.map(c => `
                                                    <div>${this.sikgManager.getNode(c.nodeId)?.name || c.nodeId} (${c.semanticType})</div>
                                                `).join('')}
                                            </span>
                                        </div>
                                        ` : ''}
                                        ${testResult?.executionTime ? `<div class="time-info">Execution time: ${testResult.executionTime.toFixed(0)}ms</div>` : ''}
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                    ` : '<div class="no-data">No prioritized tests available. Run the analysis first.</div>'}

                    <script>
                        (function() {
                            // Handle button clicks
                            document.getElementById('analyzeBtn').addEventListener('click', () => {
                                vscode.postMessage({ command: 'analyze' });
                            });
                            
                            document.getElementById('visualizeBtn').addEventListener('click', () => {
                                vscode.postMessage({ command: 'visualizeGraph' });
                            });
                            
                            document.getElementById('rebuildGraphBtn').addEventListener('click', () => {
                                vscode.postMessage({ command: 'rebuildGraph' });
                            });
                            
                            const runTopTestsBtn = document.getElementById('runTopTestsBtn');
                            if (runTopTestsBtn) {
                                runTopTestsBtn.addEventListener('click', () => {
                                    vscode.postMessage({ command: 'runTests', topN: 5 });
                                });
                            }
                            
                            const runAllTestsBtn = document.getElementById('runAllTestsBtn');
                            if (runAllTestsBtn) {
                                runAllTestsBtn.addEventListener('click', () => {
                                    vscode.postMessage({ command: 'runTests' });
                                });
                            }
                            
                            // Handle file links
                            document.querySelectorAll('.file-link').forEach(link => {
                                link.addEventListener('click', () => {
                                    const filePath = link.getAttribute('data-file');
                                    const line = parseInt(link.getAttribute('data-line'), 10);
                                    if (filePath) {
                                        vscode.postMessage({
                                            command: 'openFile',
                                            filePath,
                                            line
                                        });
                                    }
                                });
                            });
                            
                            // Handle messages from the extension
                            window.addEventListener('message', event => {
                                const message = event.data;
                                
                                switch (message.command) {
                                    case 'update':
                                        // The webview is reloaded, so we don't need to handle updates
                                        break;
                                    case 'updateTestResults':
                                        // The webview is reloaded with the test results
                                        break;
                                }
                            });
                            
                            // Utility function to get vscode API
                            const vscode = acquireVsCodeApi();
                        })();
                    </script>
                </body>
                </html>
            `;
        } catch (error) {
            Logger.error('Error generating HTML content:', error);
            return `
                <html>
                <body>
                    <h1>Error</h1>
                    <p>Failed to generate content: ${error instanceof Error ? error.message : String(error)}</p>
                    <button onclick="vscode.postMessage({command: 'rebuildGraph'})">Rebuild Graph</button>
                </body>
                </html>
            `;
        }
    }
}