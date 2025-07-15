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
import { RLManager } from './sikg/learning/RLManager';
import { MetricsCollector, APFDCalculator, EffectivenessTracker, ReportGenerator } from './sikg/evaluation';
import type { PerformanceReport } from './sikg/evaluation';


// Global extension state
let sikgManager: SIKGManager;
let testPrioritizer: TestPrioritizer;
let changeAnalyzer: ChangeAnalyzer;
let statusBarManager: StatusBarManager;
let sikgViewProvider: SIKGViewProvider;
let gitService: GitService;
let testRunnerService: TestRunnerService;
let configManager: ConfigManager;
let metricsCollector: MetricsCollector;
let apfdCalculator: APFDCalculator;
let effectivenessTracker: EffectivenessTracker;
let reportGenerator: ReportGenerator;

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

        // Initialize evaluation system
        try {
            metricsCollector = new MetricsCollector(configManager);
            apfdCalculator = new APFDCalculator();
            effectivenessTracker = new EffectivenessTracker();
            reportGenerator = new ReportGenerator(context);
            
            Logger.info('✅ Performance evaluation system initialized');
        } catch (error) {
            Logger.error('❌ Failed to initialize evaluation system:', error);
            // Continue without evaluation system
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
        ).then((action: string | undefined) => {
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
        ).then((action: string | undefined) => {
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
                        ).then((action: string | undefined) => {
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
                
                // Record test selection if evaluation system is available
                if (metricsCollector) {
                    try {
                        // Find all Python files that were analyzed
                        const pythonFiles = await vscode.workspace.findFiles('**/*.py', '**/node_modules/**');
                        
                        metricsCollector.recordTestSelection(
                            sikgManager.getTestNodes().length, // Total tests
                            Object.keys(testImpacts), // Selected tests
                            pythonFiles.length // Python files analyzed
                        );
                        
                        Logger.debug('Recorded test selection metrics');
                    } catch (error) {
                        Logger.error('Error recording test selection metrics:', error);
                    }
                }    
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

                    // Record metrics if evaluation system is available
                    if (metricsCollector && apfdCalculator && effectivenessTracker) {
                        try {
                            // Record test execution
                            metricsCollector.recordTestExecution(results);
                            
                            // Calculate and record effectiveness
                            const metrics = metricsCollector.getMetrics();
                            const testExecutions = metricsCollector.getTestExecutions();
                            const apfdResult = apfdCalculator.calculateAPFD(testExecutions);
                            const trends = effectivenessTracker.getEffectivenessTrends();
                            
                            effectivenessTracker.recordEffectiveness(testExecutions, metrics, apfdResult);
                            
                            Logger.info(`Recorded metrics: APFD=${apfdResult.apfd.toFixed(3)}, Accuracy=${metrics.selectionAccuracy.toFixed(3)}`);
                        } catch (error) {
                            Logger.error('Error recording evaluation metrics:', error);
                        }
                    }

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

    context.subscriptions.push(
    vscode.commands.registerCommand('sikg.analyzeHistory', async () => {
        try {
            Logger.info('🕐 Starting historical analysis...');
            statusBarManager.updateStatus('Analyzing history...', true);
            
            // Get historical analysis statistics
            const historyStats = sikgManager.getHistoryStats();
            
            if (!historyStats.initialized) {
                vscode.window.showWarningMessage('Historical analysis not available. Make sure you\'re in a Git repository.');
                statusBarManager.updateStatus('History analysis unavailable');
                return;
            }
            
            // Show analysis results
            const message = `Historical Analysis Complete:\n` +
                          `• Commits analyzed: ${historyStats.commitsAvailable}\n` +
                          `• Test results found: ${historyStats.testResultsAvailable}\n` +
                          `• Last analysis: ${new Date(historyStats.lastAnalysisTime).toLocaleString()}`;
            
            vscode.window.showInformationMessage(message);
            statusBarManager.updateStatus('History analysis complete');
            
            // Optionally trigger a re-analysis with enhanced weights
            await vscode.commands.executeCommand('sikg.analyzeChanges');
            
        } catch (error) {
            Logger.error('❌ Error during historical analysis:', error);
            vscode.window.showErrorMessage(`Historical analysis failed: ${error instanceof Error ? error.message : String(error)}`);
            statusBarManager.updateStatus('History analysis failed');
        }
    })
);

    // Command to view RL system status
    context.subscriptions.push(
        vscode.commands.registerCommand('sikg.showRLStatus', async () => {
            try {
                Logger.info('📊 Showing RL system status...');
                
                const rlStatus = sikgManager.getRLStatus();
                
                // Create and show RL status panel
                const panel = vscode.window.createWebviewPanel(
                    'sikgRLStatus',
                    'SIKG RL System Status',
                    vscode.ViewColumn.Two,
                    { 
                        enableScripts: true,
                        retainContextWhenHidden: true
                    }
                );
                
                panel.webview.html = createRLStatusHtml(rlStatus);
                
                Logger.info('✅ RL status panel opened');
                
            } catch (error) {
                Logger.error('❌ Error showing RL status:', error);
                vscode.window.showErrorMessage(`Failed to show RL status: ${error instanceof Error ? error.message : String(error)}`);
            }
        })
    );

    // Command to enable/disable RL
    context.subscriptions.push(
        vscode.commands.registerCommand('sikg.toggleRL', async () => {
            try {
                const rlStatus = sikgManager.getRLStatus();
                const currentState = rlStatus.isEnabled;
                
                const action = await vscode.window.showQuickPick([
                    { label: currentState ? '❌ Disable RL' : '✅ Enable RL', value: !currentState },
                    { label: '📊 Show Status', value: 'status' },
                    { label: '🔄 Reset RL', value: 'reset' }
                ], {
                    placeHolder: `RL is currently ${currentState ? 'enabled' : 'disabled'}. What would you like to do?`
                });
                
                if (!action) return;
                
                if (action.value === 'status') {
                    vscode.commands.executeCommand('sikg.showRLStatus');
                } else if (action.value === 'reset') {
                    const confirm = await vscode.window.showWarningMessage(
                        'This will reset all RL learning progress. Continue?',
                        'Reset',
                        'Cancel'
                    );
                    if (confirm === 'Reset') {
                        // Reset RL would need to be implemented in SIKGManager
                        vscode.window.showInformationMessage('RL system reset (not implemented in this minimal version)');
                    }
                } else {
                    sikgManager.setRLEnabled(action.value as boolean);
                    vscode.window.showInformationMessage(`RL system ${action.value ? 'enabled' : 'disabled'}`);
                }
                
            } catch (error) {
                Logger.error('❌ Error toggling RL:', error);
                vscode.window.showErrorMessage(`Failed to toggle RL: ${error instanceof Error ? error.message : String(error)}`);
            }
        })
    );

    // Command to show RL recommendations
    context.subscriptions.push(
        vscode.commands.registerCommand('sikg.showRLRecommendations', async () => {
            try {
                const rlStatus = sikgManager.getRLStatus();
                const recommendations = rlStatus.recommendations;
                
                if (recommendations.length === 0) {
                    vscode.window.showInformationMessage('No RL recommendations available at this time.');
                    return;
                }
                
                const selectedRec = await vscode.window.showQuickPick(
                    recommendations.map(rec => ({ label: rec, description: 'RL Recommendation' })),
                    { placeHolder: 'RL Performance Recommendations' }
                );
                
                if (selectedRec) {
                    vscode.window.showInformationMessage(selectedRec.label);
                }
                
            } catch (error) {
                Logger.error('❌ Error showing RL recommendations:', error);
                vscode.window.showErrorMessage(`Failed to show recommendations: ${error instanceof Error ? error.message : String(error)}`);
            }
        })
    );

    // Enhanced analyze command with RL integration
    context.subscriptions.push(
        vscode.commands.registerCommand('sikg.analyzeChangesWithRL', async () => {
            try {
                Logger.info('🔍 Starting RL-enhanced change analysis...');
                statusBarManager.updateStatus('Analyzing with RL...', true);
                
                // Get current changes from git
                const changes = await gitService.getUncommittedChanges();
                
                if (!changes || changes.length === 0) {
                    vscode.window.showInformationMessage('No changes detected to analyze.');
                    statusBarManager.updateStatus('No changes detected');
                    return;
                }
                
                // Analyze semantic changes
                const semanticChanges = await changeAnalyzer.analyzeChanges(changes);
                
                if (semanticChanges.length === 0) {
                    vscode.window.showInformationMessage('No semantic changes found in supported code files.');
                    statusBarManager.updateStatus('No semantic changes');
                    return;
                }
                
                // Calculate test impact with RL enhancement
                const testImpacts = await testPrioritizer.calculateTestImpact(semanticChanges);
                
                // Display results in SIKG view
                sikgViewProvider.updateWithResults(semanticChanges, testImpacts);
                
                // Get RL insights
                const rlStatus = sikgManager.getRLStatus();
                const testCount = Object.keys(testImpacts).length;
                
                let message = `RL-enhanced analysis complete. ${testCount} tests prioritized.`;
                if (rlStatus.recommendations.length > 0) {
                    message += ` ${rlStatus.recommendations.length} recommendations available.`;
                }
                
                vscode.window.showInformationMessage(message, 'Show RL Status', 'Show Recommendations')
                    .then((action: string | undefined) => {
                        if (action === 'Show RL Status') {
                            vscode.commands.executeCommand('sikg.showRLStatus');
                        } else if (action === 'Show Recommendations') {
                            vscode.commands.executeCommand('sikg.showRLRecommendations');
                        }
                    });
                
                statusBarManager.updateStatus(`RL: ${testCount} tests prioritized`);
                
            } catch (error) {
                Logger.error('❌ Error in RL-enhanced analysis:', error);
                vscode.window.showErrorMessage(`RL analysis failed: ${error instanceof Error ? error.message : String(error)}`);
                statusBarManager.updateStatus('RL analysis failed');
            }
        })
    );

    context.subscriptions.push(
    vscode.commands.registerCommand('sikg.generateReport', async () => {
        try {
            Logger.info('📊 Generating SIKG performance report...');
            statusBarManager.updateStatus('Generating report...', true);
            
            if (!metricsCollector || !apfdCalculator || !effectivenessTracker || !reportGenerator) {
                vscode.window.showErrorMessage('Performance evaluation system not initialized');
                return;
            }

            // Get current metrics and data
            const metrics = metricsCollector.getMetrics();
            const testExecutions = metricsCollector.getTestExecutions();
            
            if (testExecutions.length === 0) {
                vscode.window.showInformationMessage('No test execution data available. Run some tests first.');
                statusBarManager.updateStatus('No data for report');
                return;
            }

            // Calculate APFD and trends
            const apfdResults = apfdCalculator.calculateAPFD(testExecutions);
            const trends = effectivenessTracker.getEffectivenessTrends();
            const pythonInsights = effectivenessTracker.getPythonEffectivenessInsights();

            // Generate comprehensive report
            const report = await reportGenerator.generateReport(
                metrics,
                apfdResults,
                trends,
                pythonInsights,
                testExecutions
            );

            // Save report and show options
            const action = await vscode.window.showInformationMessage(
                `Performance report generated. APFD: ${(apfdResults.apfd * 100).toFixed(1)}%, ` +
                `Efficiency: ${(metrics.reductionRatio * 100).toFixed(1)}%`,
                'View HTML Report',
                'Save JSON Report',
                'Save HTML Report'
            );

            if (action === 'View HTML Report') {
                // Create and show HTML report in webview
                const html = await reportGenerator.generateHTMLReport(report);
                const panel = vscode.window.createWebviewPanel(
                    'sikgReport',
                    'SIKG Performance Report',
                    vscode.ViewColumn.Two,
                    { enableScripts: true }
                );
                panel.webview.html = html;
                
            } else if (action === 'Save JSON Report') {
                const filePath = await reportGenerator.saveReport(report, 'json');
                if (filePath) {
                    vscode.window.showInformationMessage(`Report saved to: ${filePath}`);
                }
                
            } else if (action === 'Save HTML Report') {
                const filePath = await reportGenerator.saveReport(report, 'html');
                if (filePath) {
                    vscode.window.showInformationMessage(`HTML report saved to: ${filePath}`);
                }
            }

            statusBarManager.updateStatus('Report generated');
            
        } catch (error) {
            Logger.error('❌ Error generating performance report:', error);
            vscode.window.showErrorMessage(`Failed to generate report: ${error instanceof Error ? error.message : String(error)}`);
            statusBarManager.updateStatus('Report generation failed');
        }
    })
    );

    context.subscriptions.push(
    vscode.commands.registerCommand('sikg.showMetrics', async () => {
        try {
            if (!metricsCollector) {
                vscode.window.showErrorMessage('Metrics collector not initialized');
                return;
            }

            const metrics = metricsCollector.getMetrics();
            const timeMetrics = metricsCollector.getTimeBasedMetrics();

            const message = `SIKG Performance Metrics:\n\n` +
                          `📊 Test Selection:\n` +
                          `• Selected: ${metrics.selectedTests}/${metrics.totalTests} tests\n` +
                          `• Reduction: ${(metrics.reductionRatio * 100).toFixed(1)}%\n` +
                          `• Accuracy: ${(metrics.selectionAccuracy * 100).toFixed(1)}%\n\n` +
                          `🐛 Fault Detection:\n` +
                          `• Faults found: ${metrics.faultsDetected}\n` +
                          `• Detection rate: ${metrics.executedTests > 0 ? (metrics.faultsDetected / metrics.executedTests * 100).toFixed(1) : 0}%\n\n` +
                          `⏱️ Execution:\n` +
                          `• Average time: ${(timeMetrics.averageTime / 1000).toFixed(2)}s\n` +
                          `• Total time: ${(timeMetrics.totalTime / 1000).toFixed(1)}s\n\n` +
                          `🐍 Python Analysis:\n` +
                          `• Files analyzed: ${metrics.pythonFilesAnalyzed}`;

            vscode.window.showInformationMessage(message, { modal: false });
            
        } catch (error) {
            Logger.error('Error showing metrics:', error);
            vscode.window.showErrorMessage('Failed to retrieve metrics');
        }
    })
    );

}

/**
 * Create HTML for RL status display
 */
function createRLStatusHtml(rlStatus: any): string {
    const { systemStatus, recommendations, isEnabled } = rlStatus;
    
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>SIKG RL System Status</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-editor-foreground);
                    padding: 20px;
                    line-height: 1.6;
                }
                .status-card {
                    background-color: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 8px;
                    padding: 16px;
                    margin-bottom: 16px;
                }
                .status-header {
                    font-size: 18px;
                    font-weight: bold;
                    margin-bottom: 12px;
                    color: var(--vscode-textLink-foreground);
                }
                .metric {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 8px;
                }
                .metric-label {
                    color: var(--vscode-descriptionForeground);
                }
                .metric-value {
                    font-weight: bold;
                }
                .status-enabled {
                    color: var(--vscode-terminal-ansiGreen);
                }
                .status-disabled {
                    color: var(--vscode-terminal-ansiRed);
                }
                .recommendation {
                    background-color: var(--vscode-textBlockQuote-background);
                    border-left: 4px solid var(--vscode-textLink-foreground);
                    padding: 8px 12px;
                    margin-bottom: 8px;
                    font-size: 14px;
                }
                .progress-bar {
                    width: 100%;
                    height: 8px;
                    background-color: var(--vscode-progressBar-background);
                    border-radius: 4px;
                    overflow: hidden;
                    margin-top: 4px;
                }
                .progress-fill {
                    height: 100%;
                    background-color: var(--vscode-progressBar-foreground);
                    transition: width 0.3s ease;
                }
            </style>
        </head>
        <body>
            <h1>🤖 SIKG Reinforcement Learning Status</h1>
            
            <div class="status-card">
                <div class="status-header">System Status</div>
                <div class="metric">
                    <span class="metric-label">Status:</span>
                    <span class="metric-value ${isEnabled ? 'status-enabled' : 'status-disabled'}">
                        ${isEnabled ? '✅ Enabled' : '❌ Disabled'}
                    </span>
                </div>
                <div class="metric">
                    <span class="metric-label">Average Reward:</span>
                    <span class="metric-value">${(systemStatus.averageReward * 100).toFixed(1)}%</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${(systemStatus.averageReward * 100)}%"></div>
                </div>
                
                <div class="metric">
                    <span class="metric-label">System Stability:</span>
                    <span class="metric-value">${(systemStatus.systemStability * 100).toFixed(1)}%</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${(systemStatus.systemStability * 100)}%"></div>
                </div>
                
                <div class="metric">
                    <span class="metric-label">Total Adaptations:</span>
                    <span class="metric-value">${systemStatus.totalAdaptations}</span>
                </div>
            </div>

            ${systemStatus.recentPerformance ? `
            <div class="status-card">
                <div class="status-header">Recent Performance</div>
                <div class="metric">
                    <span class="metric-label">F1 Score:</span>
                    <span class="metric-value">${(systemStatus.recentPerformance.f1Score * 100).toFixed(1)}%</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Precision:</span>
                    <span class="metric-value">${(systemStatus.recentPerformance.precision * 100).toFixed(1)}%</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Recall:</span>
                    <span class="metric-value">${(systemStatus.recentPerformance.recall * 100).toFixed(1)}%</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Fault Detection Rate:</span>
                    <span class="metric-value">${(systemStatus.recentPerformance.faultDetectionRate * 100).toFixed(1)}%</span>
                </div>
            </div>
            ` : ''}

            ${systemStatus.policyStatistics ? `
            <div class="status-card">
                <div class="status-header">Policy Status</div>
                <div class="metric">
                    <span class="metric-label">Selection Threshold:</span>
                    <span class="metric-value">${systemStatus.policyStatistics.parameterValues.selectionThreshold.toFixed(3)}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Priority Boost Factor:</span>
                    <span class="metric-value">${systemStatus.policyStatistics.parameterValues.priorityBoostFactor.toFixed(3)}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Policy Stability:</span>
                    <span class="metric-value">${(systemStatus.policyStatistics.currentStability * 100).toFixed(1)}%</span>
                </div>
            </div>
            ` : ''}

            ${recommendations.length > 0 ? `
            <div class="status-card">
                <div class="status-header">💡 Recommendations</div>
                ${recommendations.map((rec: string) => `<div class="recommendation">${rec}</div>`).join('')}
            </div>
            ` : ''}
            
            <div class="status-card">
                <div class="status-header">Actions</div>
                <button onclick="vscode.postMessage({command: 'toggle-rl'})">
                    ${isEnabled ? 'Disable' : 'Enable'} RL System
                </button>
                <button onclick="vscode.postMessage({command: 'refresh'})">
                    🔄 Refresh Status
                </button>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                
                // Handle button clicks
                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.command) {
                        case 'toggle-rl':
                            vscode.postMessage({command: 'sikg.toggleRL'});
                            break;
                        case 'refresh':
                            location.reload();
                            break;
                    }
                });
            </script>
        </body>
        </html>
    `;
}

function setupEventListeners(context: vscode.ExtensionContext) {
    // Listen for git changes when users save files with error handling
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(async (document: vscode.TextDocument) => {
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
        vscode.tasks.onDidEndTaskProcess(async (event: vscode.TaskProcessEndEvent) => {
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
        vscode.workspace.onDidChangeConfiguration(async (event: vscode.ConfigurationChangeEvent) => {
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
            ).then((action: string | undefined) => {
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