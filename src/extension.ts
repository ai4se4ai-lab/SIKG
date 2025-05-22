// extension.ts - Fixed extension entry point with proper error handling

import * as vscode from 'vscode';
import { SIKGManager } from './sikg/SIKGManager';
import { TestPrioritizer } from './sikg/TestPrioritizer';
import { ChangeAnalyzer } from './sikg/ChangeAnalyzer';
import { StatusBarManager } from './ui/StatusBarManager';
import { SIKGViewProvider } from './ui/SIKGViewProvider';
import { GitService } from './services/GitService';
import { TestRunnerService } from './services/TestRunnerService';
import { Logger } from './utils/Logger';
import { ConfigManager } from './utils/ConfigManager';

// Global extension state
let sikgManager: SIKGManager;
let testPrioritizer: TestPrioritizer;
let changeAnalyzer: ChangeAnalyzer;
let statusBarManager: StatusBarManager;
let sikgViewProvider: SIKGViewProvider;
let gitService: GitService;
let testRunnerService: TestRunnerService;
let configManager: ConfigManager;

export async function activate(context: vscode.ExtensionContext) {
    try {
        // Initialize configuration first
        configManager = new ConfigManager(context);
        await configManager.initialize();
        
        // Initialize logger with enhanced error handling
        Logger.init(context, configManager.getLogLevel());
        Logger.info('🚀 Activating SIKG Extension...');
        
        // Check for required extensions
        await checkRequiredExtensions();
        
        // Initialize core components with error handling
        statusBarManager = new StatusBarManager(context);
        statusBarManager.updateStatus('Initializing...', true);
        
        gitService = new GitService();
        testRunnerService = new TestRunnerService();
        
        // Initialize SIKG manager with proper error handling
        try {
            sikgManager = new SIKGManager(context, configManager);
            await sikgManager.initialize();
            Logger.info('✅ SIKG Manager initialized successfully');
        } catch (error) {
            Logger.error('❌ Failed to initialize SIKG Manager:', error);
            throw error;
        }
        
        // Initialize change analyzer and test prioritizer
        try {
            changeAnalyzer = new ChangeAnalyzer(sikgManager, gitService, configManager);
            testPrioritizer = new TestPrioritizer(sikgManager, configManager);
            Logger.info('✅ Analysis components initialized successfully');
        } catch (error) {
            Logger.error('❌ Failed to initialize analysis components:', error);
            throw error;
        }
        
        // Register UI components with error handling
        try {
            sikgViewProvider = new SIKGViewProvider(context, sikgManager, testPrioritizer);
            context.subscriptions.push(
                vscode.window.registerWebviewViewProvider('sikgView', sikgViewProvider)
            );
            Logger.info('✅ UI components registered successfully');
        } catch (error) {
            Logger.error('❌ Failed to register UI components:', error);
            throw error;
        }
        
        // Register commands with enhanced error handling
        registerCommands(context);
        
        // Setup event listeners with error handling
        setupEventListeners(context);
        
        // Show success status
        statusBarManager.updateStatus('Ready');
        Logger.info('🎉 SIKG Extension activated successfully');
        
        // Show welcome message for first-time users
        showWelcomeMessage(context);
        
    } catch (error) {
        Logger.error('💥 Critical error during SIKG activation:', error);
        
        // Update status to show error
        if (statusBarManager) {
            statusBarManager.updateStatus('Activation Failed', false);
        }
        
        // Show user-friendly error message
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(
            `SIKG Extension failed to activate: ${errorMessage}. Check the output panel for details.`,
            'Open Output Panel',
            'Retry'
        ).then(action => {
            if (action === 'Open Output Panel') {
                vscode.commands.executeCommand('workbench.panel.output.focus');
            } else if (action === 'Retry') {
                vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
        });
        
        // Don't throw - let extension load in degraded mode
    }
}

/**
 * Check for required VS Code extensions
 */
async function checkRequiredExtensions(): Promise<void> {
    const requiredExtensions = [
        { id: 'ms-python.python', name: 'Python', required: false }
    ];
    
    const missingExtensions: string[] = [];
    
    for (const ext of requiredExtensions) {
        const extension = vscode.extensions.getExtension(ext.id);
        if (!extension) {
            if (ext.required) {
                missingExtensions.push(ext.name);
            } else {
                Logger.warn(`📦 Recommended extension '${ext.name}' is not installed. SIKG functionality may be limited.`);
            }
        } else if (!extension.isActive) {
            try {
                await extension.activate();
                Logger.info(`✅ Activated extension: ${ext.name}`);
            } catch (error) {
                Logger.warn(`⚠️ Failed to activate extension ${ext.name}:`, error);
            }
        }
    }
    
    if (missingExtensions.length > 0) {
        const message = `SIKG requires the following extensions: ${missingExtensions.join(', ')}`;
        const action = await vscode.window.showWarningMessage(
            message,
            'Install Extensions',
            'Continue Anyway'
        );
        
        if (action === 'Install Extensions') {
            vscode.commands.executeCommand('workbench.extensions.search', missingExtensions[0]);
        }
    }
}

/**
 * Show welcome message for first-time users
 */
function showWelcomeMessage(context: vscode.ExtensionContext): void {
    const hasShownWelcome = context.globalState.get('sikg.hasShownWelcome', false);
    
    if (!hasShownWelcome) {
        vscode.window.showInformationMessage(
            'Welcome to SIKG! Ready to intelligently prioritize your tests based on code changes.',
            'Get Started',
            'Learn More'
        ).then(action => {
            if (action === 'Get Started') {
                vscode.commands.executeCommand('sikg.analyzeChanges');
            } else if (action === 'Learn More') {
                vscode.env.openExternal(vscode.Uri.parse('https://github.com/your-repo/sikg'));
            }
        });
        
        context.globalState.update('sikg.hasShownWelcome', true);
    }
}

function registerCommands(context: vscode.ExtensionContext) {
    // Command to analyze the current changes and suggest tests with enhanced error handling
    context.subscriptions.push(
        vscode.commands.registerCommand('sikg.analyzeChanges', async () => {
            try {
                Logger.info('🔍 Starting change analysis...');
                statusBarManager.updateStatus('Analyzing changes...', true);
                
                // Get current changes from git with error handling
                let changes;
                try {
                    changes = await gitService.getUncommittedChanges();
                } catch (error) {
                    Logger.error('Failed to get uncommitted changes from Git:', error);
                    vscode.window.showErrorMessage('Failed to get Git changes. Make sure you\'re in a Git repository.');
                    statusBarManager.updateStatus('Git error');
                    return;
                }
                
                if (!changes || changes.length === 0) {
                    vscode.window.showInformationMessage('No changes detected to analyze.');
                    statusBarManager.updateStatus('No changes detected');
                    return;
                }
                
                Logger.info(`📄 Found ${changes.length} changed files`);
                
                // Analyze semantic changes with enhanced error handling
                let semanticChanges;
                try {
                    semanticChanges = await changeAnalyzer.analyzeChanges(changes);
                } catch (error) {
                    Logger.error('Failed to analyze semantic changes:', error);
                    
                    // Check if it's the language detection error
                    if (error instanceof Error && error.message.includes('unknown language')) {
                        vscode.window.showErrorMessage(
                            'Language detection error. Try running "SIKG: Fix Language Issues" command.',
                            'Fix Language Issues'
                        ).then(action => {
                            if (action === 'Fix Language Issues') {
                                vscode.commands.executeCommand('sikg.fixLanguageIssues');
                            }
                        });
                    } else {
                        if (error instanceof Error) {
                            vscode.window.showErrorMessage(`Failed to analyze changes: ${error.message}`);
                        } else {
                            vscode.window.showErrorMessage(`Failed to analyze changes: ${String(error)}`);
                        }
                    }
                    
                    statusBarManager.updateStatus('Analysis failed');
                    return;
                }
                
                if (semanticChanges.length === 0) {
                    vscode.window.showInformationMessage('No semantic changes found in supported code files.');
                    statusBarManager.updateStatus('No semantic changes');
                    return;
                }
                
                Logger.info(`🧠 Found ${semanticChanges.length} semantic changes`);
                
                // Calculate test impact with error handling
                let testImpacts;
                try {
                    testImpacts = await testPrioritizer.calculateTestImpact(semanticChanges);
                } catch (error) {
                    Logger.error('Failed to calculate test impact:', error);
                    vscode.window.showErrorMessage(`Failed to prioritize tests: ${error instanceof Error ? error.message : String(error)}`);
                    statusBarManager.updateStatus('Prioritization failed');
                    return;
                }
                
                // Display results in SIKG view
                sikgViewProvider.updateWithResults(semanticChanges, testImpacts);
                
                // Show success message
                const testCount = Object.keys(testImpacts).length;
                const message = testCount > 0 
                    ? `SIKG analysis complete. ${testCount} tests prioritized based on changes.`
                    : 'SIKG analysis complete. No tests found to prioritize.';
                    
                vscode.window.showInformationMessage(message);
                statusBarManager.updateStatus(testCount > 0 ? `${testCount} tests prioritized` : 'No tests prioritized');
                
            } catch (error) {
                Logger.error('❌ Unexpected error during change analysis:', error);
                vscode.window.showErrorMessage(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
                statusBarManager.updateStatus('Analysis failed');
            }
        })
    );
    
    // Command to run prioritized tests with enhanced error handling
    context.subscriptions.push(
        vscode.commands.registerCommand('sikg.runPrioritizedTests', async (topN?: number) => {
            try {
                Logger.info(`🧪 Starting prioritized test run (top ${topN || 'all'})`);
                
                const testImpacts = sikgViewProvider.getLatestTestImpacts();
                if (!testImpacts || Object.keys(testImpacts).length === 0) {
                    vscode.window.showInformationMessage('No prioritized tests available. Run analysis first.');
                    return;
                }
                
                // Run the prioritized tests with error handling
                statusBarManager.updateStatus('Running tests...', true);
                let results;
                try {
                    results = await testRunnerService.runPrioritizedTests(testImpacts, topN);
                } catch (error) {
                    Logger.error('Failed to run prioritized tests:', error);
                    vscode.window.showErrorMessage(`Failed to run tests: ${error instanceof Error ? error.message : String(error)}`);
                    statusBarManager.updateStatus('Test run failed');
                    return;
                }
                
                // Update SIKG with test results
                try {
                    await sikgManager.updateWithTestResults(results);
                } catch (error) {
                    Logger.warn('Failed to update SIKG with test results:', error);
                    // Continue - this is not critical
                }
                
                // Display results
                sikgViewProvider.updateWithTestResults(results);
                
                // Show success message
                const passedCount = results.filter(r => r.status === 'passed').length;
                const failedCount = results.filter(r => r.status === 'failed').length;
                const totalCount = results.length;
                
                const message = `Test run complete. ${passedCount} passed, ${failedCount} failed out of ${totalCount} tests.`;
                
                if (failedCount > 0) {
                    vscode.window.showWarningMessage(message);
                } else {
                    vscode.window.showInformationMessage(message);
                }
                
                statusBarManager.updateStatus(`Tests: ${passedCount}/${totalCount} passed`);
                
            } catch (error) {
                Logger.error('❌ Unexpected error during test run:', error);
                vscode.window.showErrorMessage(`Test run failed: ${error instanceof Error ? error.message : String(error)}`);
                statusBarManager.updateStatus('Test run failed');
            }
        })
    );
    
    // Command to visualize the impact graph with error handling
    context.subscriptions.push(
        vscode.commands.registerCommand('sikg.visualizeGraph', async () => {
            try {
                Logger.info('🔍 Creating graph visualization...');
                
                // Get the current semantic impact knowledge graph
                let graph;
                try {
                    graph = await sikgManager.exportGraphForVisualization();
                } catch (error) {
                    Logger.error('Failed to export graph for visualization:', error);
                    vscode.window.showErrorMessage('Failed to export graph data for visualization.');
                    return;
                }
                
                // Open the visualization in a webview
                const panel = vscode.window.createWebviewPanel(
                    'sikgVisualization',
                    'SIKG Visualization',
                    vscode.ViewColumn.Two,
                    { 
                        enableScripts: true,
                        retainContextWhenHidden: true
                    }
                );
                
                panel.webview.html = createGraphVisualizationHtml(graph);
                
                Logger.info('✅ Graph visualization opened');
                
            } catch (error) {
                Logger.error('❌ Error creating graph visualization:', error);
                vscode.window.showErrorMessage(`Failed to create visualization: ${error instanceof Error ? error.message : String(error)}`);
            }
        })
    );
    
    // Command to rebuild the knowledge graph with enhanced error handling
    context.subscriptions.push(
        vscode.commands.registerCommand('sikg.rebuildGraph', async () => {
            try {
                Logger.info('🔄 Starting knowledge graph rebuild...');
                statusBarManager.updateStatus('Rebuilding knowledge graph...', true);
                
                // Ask for confirmation
                const confirm = await vscode.window.showWarningMessage(
                    'This will rebuild the entire knowledge graph from scratch. This may take a while.',
                    'Rebuild',
                    'Cancel'
                );
                
                if (confirm !== 'Rebuild') {
                    statusBarManager.updateStatus('Rebuild cancelled');
                    return;
                }
                
                // Rebuild the entire graph
                await sikgManager.rebuildGraph();
                
                vscode.window.showInformationMessage('SIKG Knowledge Graph rebuilt successfully.');
                statusBarManager.updateStatus('Knowledge graph rebuilt');
                Logger.info('✅ Knowledge graph rebuild completed');
                
            } catch (error) {
                Logger.error('❌ Error rebuilding knowledge graph:', error);
                vscode.window.showErrorMessage(`Failed to rebuild graph: ${error instanceof Error ? error.message : String(error)}`);
                statusBarManager.updateStatus('Rebuild failed');
            }
        })
    );
    
    // Command to show results panel
    context.subscriptions.push(
        vscode.commands.registerCommand('sikg.showResults', async () => {
            try {
                // Focus on the SIKG view
                await vscode.commands.executeCommand('workbench.view.extension.sikg-sidebar');
            } catch (error) {
                Logger.error('Error showing results panel:', error);
            }
        })
    );
    
    // Add diagnostic commands for troubleshooting
    context.subscriptions.push(
        vscode.commands.registerCommand('sikg.diagnoseLangaugeIssues', async () => {
            try {
                await diagnoseLangaugeIssues();
            } catch (error) {
                Logger.error('Error running language diagnostics:', error);
                vscode.window.showErrorMessage('Failed to run diagnostics. Check the output panel for details.');
            }
        })
    );
    
    context.subscriptions.push(
        vscode.commands.registerCommand('sikg.fixLanguageIssues', async () => {
            try {
                await fixLanguageIssues();
            } catch (error) {
                Logger.error('Error applying language fixes:', error);
                vscode.window.showErrorMessage('Failed to apply fixes. Check the output panel for details.');
            }
        })
    );
}

function setupEventListeners(context: vscode.ExtensionContext) {
    // Listen for git changes when users save files with error handling
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(async (document) => {
            try {
                const config = vscode.workspace.getConfiguration('sikg');
                const analyzeOnSave = config.get<boolean>('analyzeOnSave', false);
                
                if (analyzeOnSave) {
                    Logger.debug(`📄 File saved: ${document.fileName}, triggering analysis`);
                    // Run change analysis on save
                    await vscode.commands.executeCommand('sikg.analyzeChanges');
                }
            } catch (error) {
                Logger.error('Error in onDidSaveTextDocument handler:', error);
            }
        })
    );
    
    // Listen for test executions to gather feedback data with error handling
    context.subscriptions.push(
        vscode.tasks.onDidEndTaskProcess(async (event) => {
            try {
                // Check if this is a test run task
                if (event.execution.task.group === vscode.TaskGroup.Test) {
                    Logger.debug('Test task completed, processing results...');
                    
                    // Get test results and update the SIKG
                    const results = await testRunnerService.parseTestResults(event.execution);
                    if (results && results.length > 0) {
                        await sikgManager.updateWithTestResults(results);
                        Logger.info(`Updated SIKG with ${results.length} test results`);
                    }
                }
            } catch (error) {
                Logger.error('Error processing test results:', error);
            }
        })
    );
    
    // Listen for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(async (event) => {
            try {
                if (event.affectsConfiguration('sikg')) {
                    Logger.info('SIKG configuration changed, reinitializing...');
                    
                    // Reinitialize config manager
                    await configManager.initialize();
                    
                    // Update logger level if changed
                    const newLogLevel = configManager.getLogLevel();
                    Logger.init(context, newLogLevel);
                    
                    Logger.info('✅ Configuration reloaded');
                }
            } catch (error) {
                Logger.error('Error handling configuration change:', error);
            }
        })
    );
}

/**
 * Diagnostic function to identify language issues
 */
async function diagnoseLangaugeIssues(): Promise<void> {
    Logger.info('🔍 Running SIKG language diagnostics...');
    
    // Check VS Code language support
    try {
        const languages = await vscode.languages.getLanguages();
        const pythonSupported = languages.includes('python');
        
        Logger.info(`VS Code languages: ${languages.length} total, Python supported: ${pythonSupported}`);
        
        if (!pythonSupported) {
            vscode.window.showWarningMessage(
                'Python language not supported by VS Code. Install the Python extension.',
                'Install Python Extension'
            ).then(action => {
                if (action === 'Install Python Extension') {
                    vscode.commands.executeCommand('workbench.extensions.search', 'ms-python.python');
                }
            });
        }
    } catch (error) {
        Logger.error('Error checking language support:', error);
    }
    
    // Check workspace for Python files
    try {
        const pythonFiles = await vscode.workspace.findFiles('**/*.py', '**/node_modules/**', 5);
        Logger.info(`Found ${pythonFiles.length} Python files in workspace`);
        
        if (pythonFiles.length > 0) {
            const firstFile = pythonFiles[0];
            const doc = await vscode.workspace.openTextDocument(firstFile);
            Logger.info(`Sample file ${firstFile.fsPath} detected as language: ${doc.languageId}`);
        }
    } catch (error) {
        Logger.error('Error analyzing workspace files:', error);
    }
    
    vscode.window.showInformationMessage('Language diagnostics complete. Check the output panel for details.');
}

/**
 * Apply fixes for common language issues
 */
async function fixLanguageIssues(): Promise<void> {
    Logger.info('🔧 Applying language detection fixes...');
    
    try {
        // Update SIKG configuration
        const config = vscode.workspace.getConfiguration('sikg');
        
        await config.update('supportedLanguages', ['python', 'javascript', 'typescript', 'java', 'csharp', 'go'], vscode.ConfigurationTarget.Global);
        await config.update('codeFileExtensions', ['py', 'js', 'jsx', 'ts', 'tsx', 'java', 'cs', 'go'], vscode.ConfigurationTarget.Global);
        
        Logger.info('✅ Updated SIKG configuration');
        
        // Check Python extension
        const pythonExt = vscode.extensions.getExtension('ms-python.python');
        if (!pythonExt) {
            const action = await vscode.window.showWarningMessage(
                'Python extension is required. Install it now?',
                'Install',
                'Skip'
            );
            
            if (action === 'Install') {
                await vscode.commands.executeCommand('workbench.extensions.search', 'ms-python.python');
            }
        } else if (!pythonExt.isActive) {
            await pythonExt.activate();
            Logger.info('✅ Activated Python extension');
        }
        
        vscode.window.showInformationMessage('Language fixes applied. Please reload the window.');
        
    } catch (error) {
        Logger.error('Error applying language fixes:', error);
        vscode.window.showErrorMessage(`Failed to apply fixes: ${error instanceof Error ? error.message : String(error)}`);
    }
}

function createGraphVisualizationHtml(graph: any): string {
    // First, ensure all referenced nodes exist
    const referencedNodeIds = new Set<string>();
    
    // Collect all node IDs referenced in links
    graph.links.forEach((link: any) => {
        referencedNodeIds.add(link.source);
        referencedNodeIds.add(link.target);
    });
    
    // Get all existing node IDs
    const existingNodeIds = new Set(graph.nodes.map((node: any) => node.id));
    
    // Find missing nodes
    const missingNodeIds = [...referencedNodeIds].filter(id => !existingNodeIds.has(id));
    
    // Add placeholder nodes for missing references
    missingNodeIds.forEach(id => {
        graph.nodes.push({
            id: id,
            label: `Unknown (${id.split('_')[0]})`, // Extract prefix like "function" from the ID
            type: "Unknown",
            impact: 0.1, // Low impact for placeholder nodes
            changed: false
        });
    });
    
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>SIKG Visualization</title>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js"></script>
            <style>
                body, html { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
                svg { width: 100%; height: 100%; }
                .node { cursor: pointer; }
                .link { stroke: #999; stroke-opacity: 0.6; }
                .test-node { fill: #6baed6; }
                .code-node { fill: #fd8d3c; }
                .unknown-node { fill: #969696; } /* Gray for unknown nodes */
                .changed-node { fill: #e31a1c; stroke: #b10026; stroke-width: 2px; }
                .node text { font-size: 10px; }
                .tooltip {
                    position: absolute;
                    text-align: center;
                    padding: 8px;
                    font: 12px sans-serif;
                    background: rgba(0, 0, 0, 0.8);
                    color: white;
                    border: 0px;
                    border-radius: 4px;
                    pointer-events: none;
                    opacity: 0;
                    transition: opacity 0.3s;
                }
                .controls {
                    position: absolute;
                    top: 10px;
                    left: 10px;
                    background: rgba(255, 255, 255, 0.8);
                    padding: 10px;
                    border-radius: 5px;
                }
            </style>
        </head>
        <body>
            <div class="controls">
                <button id="zoom-in">Zoom In</button>
                <button id="zoom-out">Zoom Out</button>
                <button id="reset-zoom">Reset</button>
                <div>
                    <input type="checkbox" id="show-changed-only" />
                    <label for="show-changed-only">Show changed nodes only</label>
                </div>
            </div>
            <div class="tooltip" id="tooltip"></div>
            <svg id="graph"></svg>
            <script>
                // Graph visualization code
                const graph = ${JSON.stringify(graph)};
                
                // D3 visualization code for the graph
                const svg = d3.select("#graph");
                const width = window.innerWidth;
                const height = window.innerHeight;
                
                // Add zoom behavior
                const zoom = d3.zoom()
                    .scaleExtent([0.1, 10])
                    .on("zoom", (event) => {
                        container.attr("transform", event.transform);
                    });
                
                svg.call(zoom);
                
                // Create a container for the graph elements
                const container = svg.append("g");
                
                // Tooltip setup
                const tooltip = d3.select("#tooltip");
                
                // Create force simulation
                const simulation = d3.forceSimulation(graph.nodes)
                    .force("link", d3.forceLink(graph.links).id(d => d.id).distance(100))
                    .force("charge", d3.forceManyBody().strength(-300))
                    .force("center", d3.forceCenter(width / 2, height / 2));
                
                // Create links
                const link = container.append("g")
                    .selectAll("line")
                    .data(graph.links)
                    .enter().append("line")
                    .attr("class", "link")
                    .attr("stroke-width", d => Math.sqrt(d.weight || 1));
                
                // Create nodes
                const node = container.append("g")
                    .selectAll("g")
                    .data(graph.nodes)
                    .enter().append("g")
                    .attr("class", d => {
                        let classes = "node";
                        if (d.type === "TestCase") classes += " test-node";
                        else if (d.type === "CodeElement") classes += " code-node";
                        else classes += " unknown-node";
                        if (d.changed) classes += " changed-node";
                        return classes;
                    })
                    .call(d3.drag()
                        .on("start", dragstarted)
                        .on("drag", dragged)
                        .on("end", dragended))
                    .on("mouseover", function(event, d) {
                        tooltip.transition()
                            .duration(200)
                            .style("opacity", .9);
                        tooltip.html(\`<strong>\${d.label || d.id}</strong><br/>
                                        Type: \${d.type}<br/>
                                        \${d.changed ? "Changed: Yes<br/>" : ""}
                                        \${d.impact ? "Impact: " + (d.impact * 100).toFixed(0) + "%" : ""}\`)
                            .style("left", (event.pageX + 10) + "px")
                            .style("top", (event.pageY - 28) + "px");
                    })
                    .on("mouseout", function() {
                        tooltip.transition()
                            .duration(500)
                            .style("opacity", 0);
                    });
                
                // Add circles to nodes
                node.append("circle")
                    .attr("r", d => d.impact ? 5 + d.impact * 5 : 5);
                
                // Add text labels
                node.append("text")
                    .attr("dx", 12)
                    .attr("dy", ".35em")
                    .text(d => d.label || d.id);
                
                // Update positions on simulation tick
                simulation.on("tick", () => {
                    link
                        .attr("x1", d => d.source.x)
                        .attr("y1", d => d.source.y)
                        .attr("x2", d => d.target.x)
                        .attr("y2", d => d.target.y);
                    
                    node
                        .attr("transform", d => \`translate(\${d.x},\${d.y})\`);
                });
                
                // Drag functions
                function dragstarted(event, d) {
                    if (!event.active) simulation.alphaTarget(0.3).restart();
                    d.fx = d.x;
                    d.fy = d.y;
                }
                
                function dragged(event, d) {
                    d.fx = event.x;
                    d.fy = event.y;
                }
                
                function dragended(event, d) {
                    if (!event.active) simulation.alphaTarget(0);
                    d.fx = null;
                    d.fy = null;
                }
                
                // Controls
                document.getElementById("zoom-in").addEventListener("click", () => {
                    svg.transition().call(zoom.scaleBy, 1.5);
                });
                
                document.getElementById("zoom-out").addEventListener("click", () => {
                    svg.transition().call(zoom.scaleBy, 0.75);
                });
                
                document.getElementById("reset-zoom").addEventListener("click", () => {
                    svg.transition().call(zoom.transform, d3.zoomIdentity);
                });
                
                document.getElementById("show-changed-only").addEventListener("change", function() {
                    if (this.checked) {
                        // Show only changed nodes and their direct connections
                        const changedNodeIds = new Set(graph.nodes.filter(n => n.changed).map(n => n.id));
                        const connectedNodeIds = new Set(changedNodeIds);
                        
                        // Add nodes directly connected to changed nodes
                        graph.links.forEach(link => {
                            if (changedNodeIds.has(link.source.id || link.source)) {
                                connectedNodeIds.add(link.target.id || link.target);
                            } else if (changedNodeIds.has(link.target.id || link.target)) {
                                connectedNodeIds.add(link.source.id || link.source);
                            }
                        });
                        
                        // Filter nodes
                        node.style("visibility", d => 
                            connectedNodeIds.has(d.id) ? "visible" : "hidden");
                        
                        // Filter links
                        link.style("visibility", d => {
                            const sourceId = d.source.id || d.source;
                            const targetId = d.target.id || d.target;
                            return connectedNodeIds.has(sourceId) && connectedNodeIds.has(targetId) 
                                ? "visible" : "hidden";
                        });
                    } else {
                        // Show all nodes and links
                        node.style("visibility", "visible");
                        link.style("visibility", "visible");
                    }
                });
            </script>
        </body>
        </html>
    `;
}

export function deactivate() {
    // Clean up resources with error handling
    Logger.info('🔄 Deactivating SIKG Extension...');
    
    try {
        if (sikgManager) {
            sikgManager.dispose();
        }
    } catch (error) {
        Logger.error('Error disposing SIKG Manager:', error);
    }
    
    Logger.info('✅ SIKG Extension deactivated');
}