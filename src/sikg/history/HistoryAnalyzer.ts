// HistoryAnalyzer.ts - Main history analysis coordinator for Python projects

import * as vscode from 'vscode';
import { Logger } from '../../utils/Logger';
import { ConfigManager } from '../../utils/ConfigManager';
import { CommitTracker } from './CommitTracker';
import { CoChangeDetector } from './CoChangeDetector';
import { FaultCorrelator } from './FaultCorrelator';
import { EmpiricalWeightCalculator } from './EmpiricalWeightCalculator';

/**
 * Main coordinator for historical analysis of Python projects
 * Implements the EnrichWeights function from Algorithm 2 in the paper
 */
export class HistoryAnalyzer {
    private commitTracker: CommitTracker;
    private coChangeDetector: CoChangeDetector;
    private faultCorrelator: FaultCorrelator;
    private empiricalCalculator: EmpiricalWeightCalculator;
    private configManager: ConfigManager;
    private initialized: boolean = false;

    constructor(configManager: ConfigManager) {
        this.configManager = configManager;
        this.commitTracker = new CommitTracker();
        this.coChangeDetector = new CoChangeDetector();
        this.faultCorrelator = new FaultCorrelator();
        this.empiricalCalculator = new EmpiricalWeightCalculator();
    }

    /**
     * Initialize the history analyzer
     */
    public async initialize(): Promise<boolean> {
        try {
            if (this.initialized) {
                return true;
            }

            // Check if we're in a Git repository
            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                Logger.warn('No workspace folder found for history analysis');
                return false;
            }

            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            
            // No explicit initialization needed for commitTracker
            this.initialized = true;
            Logger.info('History analyzer initialized successfully');
            return true;
        } catch (error) {
            Logger.error('Failed to initialize history analyzer:', error);
            return false;
        }
    }

    /**
     * Enhance knowledge graph weights using historical evidence
     * Implements Algorithm 2 (EnrichWeights) from the paper
     */
    public async enhanceWeights(graph: KnowledgeGraph): Promise<EnhancedWeights> {
        if (!this.initialized) {
            Logger.warn('History analyzer not initialized - returning original weights');
            return this.createDefaultWeights(graph);
        }

        try {
            Logger.info('Starting historical weight enhancement...');

            // Step 1: Extract historical data (Algorithm 2, lines 3-4)
            const commits = await this.commitTracker.extractCommits();
            const testHistory = await this.commitTracker.extractTestResults();

            Logger.info(`Extracted ${commits.length} commits and ${testHistory.length} test results`);

            // Step 2: Calculate empirical metrics for each edge
            const enhancedWeights: Map<string, number> = new Map();
            let processedEdges = 0;

            for (const [edgeId, edge] of graph.edges.entries()) {
                try {
                    // Only process edges for Python files
                    if (!this.isPythonRelated(edge, graph)) {
                        enhancedWeights.set(edgeId, edge.weight);
                        continue;
                    }

                    // Calculate co-change frequency (Algorithm 2, lines 6-8)
                    const coChangeFreq = await this.coChangeDetector.calculateCoChangeFrequency(
                        edge.source, edge.target, commits
                    );

                    // Calculate empirical strength (Algorithm 2, lines 10-12)
                    const empiricalStrength = await this.calculateEmpiricalStrength(
                        edge.source, edge.target, commits
                    );

                    // Calculate fault correlation (Algorithm 2, lines 14-16)
                    const faultCorrelation = await this.faultCorrelator.calculateFaultCorrelation(
                        edge.source, edge.target, testHistory
                    );

                    // Apply empirical weight formula (Algorithm 2, line 18)
                    const enhancedWeight = this.empiricalCalculator.calculateEnhancedWeight(
                        edge.weight,
                        empiricalStrength,
                        coChangeFreq,
                        faultCorrelation
                    );

                    enhancedWeights.set(edgeId, enhancedWeight);
                    processedEdges++;

                    if (processedEdges % 100 === 0) {
                        Logger.debug(`Processed ${processedEdges} edges...`);
                    }

                } catch (error) {
                    Logger.error(`Error processing edge ${edgeId}:`, error);
                    enhancedWeights.set(edgeId, edge.weight); // Fallback to original weight
                }
            }

            Logger.info(`Enhanced weights for ${processedEdges} edges`);

            return {
                weights: enhancedWeights,
                metrics: {
                    totalEdges: graph.edges.size,
                    processedEdges,
                    commitsAnalyzed: commits.length,
                    testResultsAnalyzed: testHistory.length
                }
            };

        } catch (error) {
            Logger.error('Error during weight enhancement:', error);
            return this.createDefaultWeights(graph);
        }
    }

    /**
     * Calculate empirical strength between two nodes
     */
    private async calculateEmpiricalStrength(
        sourceId: string, 
        targetId: string, 
        commits: CommitInfo[]
    ): Promise<number> {
        try {
            const sourceChanges = this.commitTracker.countChanges(sourceId, commits);
            const directImpacts = this.commitTracker.countDirectImpacts(sourceId, targetId, commits);

            if (sourceChanges === 0) {
                return 0;
            }

            return directImpacts / (sourceChanges + 1); // +1 for smoothing
        } catch (error) {
            Logger.error('Error calculating empirical strength:', error);
            return 0;
        }
    }

    /**
     * Check if an edge is related to Python files
     */
    private isPythonRelated(edge: any, graph: KnowledgeGraph): boolean {
        try {
            const sourceNode = graph.nodes.get(edge.source);
            const targetNode = graph.nodes.get(edge.target);

            if (!sourceNode || !targetNode) {
                return false;
            }

            // Check if either node is from a Python file
            const isPythonSource = sourceNode.filePath?.endsWith('.py') || false;
            const isPythonTarget = targetNode.filePath?.endsWith('.py') || false;

            return isPythonSource || isPythonTarget;
        } catch (error) {
            Logger.debug('Error checking Python relation:', error);
            return false;
        }
    }

    /**
     * Create default weights when historical analysis is not available
     */
    private createDefaultWeights(graph: KnowledgeGraph): EnhancedWeights {
        const weights = new Map<string, number>();
        
        for (const [edgeId, edge] of graph.edges.entries()) {
            weights.set(edgeId, edge.weight);
        }

        return {
            weights,
            metrics: {
                totalEdges: graph.edges.size,
                processedEdges: 0,
                commitsAnalyzed: 0,
                testResultsAnalyzed: 0
            }
        };
    }

    /**
     * Get analysis statistics
     */
    public getAnalysisStats(): AnalysisStats {
        return {
            initialized: this.initialized,
            commitsAvailable: this.commitTracker.getCommitCount(),
            testResultsAvailable: this.faultCorrelator.getTestResultCount(),
            lastAnalysisTime: new Date().toISOString()
        };
    }

    /**
     * Clean up resources
     */
    public dispose(): void {
        this.commitTracker.dispose();
        this.coChangeDetector.dispose();
        this.faultCorrelator.dispose();
        this.empiricalCalculator.dispose();
        this.initialized = false;
        Logger.debug('History analyzer disposed');
    }
}

// Interfaces for the history analysis system
export interface KnowledgeGraph {
    nodes: Map<string, any>;
    edges: Map<string, any>;
}

export interface CommitInfo {
    hash: string;
    message: string;
    timestamp: Date;
    changedFiles: string[];
    author: string;
}

export interface TestResultInfo {
    testId: string;
    status: 'passed' | 'failed' | 'skipped';
    timestamp: Date;
    executionTime: number;
    commitHash?: string;
}

export interface EnhancedWeights {
    weights: Map<string, number>;
    metrics: {
        totalEdges: number;
        processedEdges: number;
        commitsAnalyzed: number;
        testResultsAnalyzed: number;
    };
}

export interface AnalysisStats {
    initialized: boolean;
    commitsAvailable: number;
    testResultsAvailable: number;
    lastAnalysisTime: string;
}