// Extension Entry Point

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

export async function activate(context: vscode.ExtensionContext) {
    // Initialize configuration
    const configManager = new ConfigManager(context);
    await configManager.initialize();
    
    // Initialize components
    Logger.init(context, configManager.getLogLevel());
    Logger.info('Activating SIKG Extension...');
    
    statusBarManager = new StatusBarManager(context);
    
    gitService = new GitService();
    testRunnerService = new TestRunnerService();
    
    sikgManager = new SIKGManager(context, configManager);
    await sikgManager.initialize();
    
    changeAnalyzer = new ChangeAnalyzer(sikgManager, gitService, configManager);
    testPrioritizer = new TestPrioritizer(sikgManager, configManager);
    
    // Register UI components
    sikgViewProvider = new SIKGViewProvider(context, sikgManager, testPrioritizer);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('sikgView', sikgViewProvider)
    );
    
    // Register commands
    registerCommands(context);
    
    // Setup event listeners
    setupEventListeners(context);
    
    Logger.info('SIKG Extension activated');
    statusBarManager.updateStatus('SIKG Ready');
}

function registerCommands(context: vscode.ExtensionContext) {
    // Command to analyze the current changes and suggest tests
    context.subscriptions.push(
        vscode.commands.registerCommand('sikg.analyzeChanges', async () => {
            try {
                statusBarManager.updateStatus('Analyzing changes...', true);
                
                // Get current changes from git
                const changes = await gitService.getUncommittedChanges();
                if (!changes || changes.length === 0) {
                    vscode.window.showInformationMessage('No changes detected to analyze.');
                    statusBarManager.updateStatus('No changes detected');
                    return;
                }
                
                // Analyze semantic changes
                const semanticChanges = await changeAnalyzer.analyzeChanges(changes);
                
                // Calculate test impact
                const testImpacts = await testPrioritizer.calculateTestImpact(semanticChanges);
                
                // Display results in SIKG view
                sikgViewProvider.updateWithResults(semanticChanges, testImpacts);
                
                // Show success message
                const testCount = Object.keys(testImpacts).length;
                vscode.window.showInformationMessage(
                    `SIKG analysis complete. ${testCount} tests prioritized based on changes.`
                );
                statusBarManager.updateStatus(`${testCount} tests prioritized`);
                
            } catch (error) {
                Logger.error('Error analyzing changes:', error);
                vscode.window.showErrorMessage(`Error analyzing changes: ${error instanceof Error ? error.message : String(error)}`);
                statusBarManager.updateStatus('Analysis failed', false);
            }
        })
    );
    
    // Command to run prioritized tests
    context.subscriptions.push(
        vscode.commands.registerCommand('sikg.runPrioritizedTests', async (topN?: number) => {
            try {
                const testImpacts = sikgViewProvider.getLatestTestImpacts();
                if (!testImpacts || Object.keys(testImpacts).length === 0) {
                    vscode.window.showInformationMessage('No prioritized tests available. Run analysis first.');
                    return;
                }
                
                // Run the prioritized tests
                statusBarManager.updateStatus('Running tests...', true);
                const results = await testRunnerService.runPrioritizedTests(testImpacts, topN);
                
                // Update SIKG with test results
                await sikgManager.updateWithTestResults(results);
                
                // Display results
                sikgViewProvider.updateWithTestResults(results);
                
                // Show success message
                const passedCount = results.filter(r => r.status === 'passed').length;
                const failedCount = results.filter(r => r.status === 'failed').length;
                vscode.window.showInformationMessage(
                    `Test run complete. ${passedCount} passed, ${failedCount} failed.`
                );
                statusBarManager.updateStatus(`Tests: ${passedCount}/${results.length} passed`);
                
            } catch (error) {
                Logger.error('Error running prioritized tests:', error);
                vscode.window.showErrorMessage(`Error running tests: ${error instanceof Error ? error.message : String(error)}`);
                statusBarManager.updateStatus('Test run failed', false);
            }
        })
    );
    
    // Command to visualize the impact graph
    context.subscriptions.push(
        vscode.commands.registerCommand('sikg.visualizeGraph', async () => {
            try {
                // Get the current semantic impact knowledge graph
                const graph = await sikgManager.exportGraphForVisualization();
                
                // Open the visualization in a webview
                const panel = vscode.window.createWebviewPanel(
                    'sikgVisualization',
                    'SIKG Visualization',
                    vscode.ViewColumn.Two,
                    { enableScripts: true }
                );
                
                panel.webview.html = createGraphVisualizationHtml(graph);
                
            } catch (error) {
                Logger.error('Error visualizing graph:', error);
                vscode.window.showErrorMessage(`Error visualizing graph: ${error instanceof Error ? error.message : String(error)}`);
            }
        })
    );
    
    // Command to rebuild the knowledge graph
    context.subscriptions.push(
        vscode.commands.registerCommand('sikg.rebuildGraph', async () => {
            try {
                statusBarManager.updateStatus('Rebuilding knowledge graph...', true);
                
                // Rebuild the entire graph
                await sikgManager.rebuildGraph();
                
                vscode.window.showInformationMessage('SIKG Knowledge Graph rebuilt successfully.');
                statusBarManager.updateStatus('Knowledge graph rebuilt');
                
            } catch (error) {
                Logger.error('Error rebuilding knowledge graph:', error);
                vscode.window.showErrorMessage(`Error rebuilding graph: ${error instanceof Error ? error.message : String(error)}`);
                statusBarManager.updateStatus('Rebuild failed', false);
            }
        })
    );
}

function setupEventListeners(context: vscode.ExtensionContext) {
    // Listen for git changes when users save files
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(async (document) => {
            const config = vscode.workspace.getConfiguration('sikg');
            const analyzeOnSave = config.get<boolean>('analyzeOnSave');
            
            if (analyzeOnSave) {
                // Run change analysis on save
                vscode.commands.executeCommand('sikg.analyzeChanges');
            }
        })
    );
    
    // Listen for test executions to gather feedback data
    context.subscriptions.push(
        vscode.tasks.onDidEndTaskProcess(async (event) => {
            // Check if this is a test run task
            if (event.execution.task.group === vscode.TaskGroup.Test) {
                try {
                    // Get test results and update the SIKG
                    const results = await testRunnerService.parseTestResults(event.execution);
                    if (results && results.length > 0) {
                        await sikgManager.updateWithTestResults(results);
                    }
                } catch (error) {
                    Logger.error('Error processing test results:', error);
                }
            }
        })
    );
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
    // Clean up resources
    Logger.info('Deactivating SIKG Extension...');
    if (sikgManager) {
        sikgManager.dispose();
    }
}