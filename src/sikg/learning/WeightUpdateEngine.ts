// WeightUpdateEngine.ts - Knowledge graph weight adaptation for SIKG

import { Graph, Edge, TestResult, SemanticChangeInfo } from '../GraphTypes';
import { MDPReward } from './MDPFramework';
import { Logger } from '../../utils/Logger';

/**
 * Edge contribution to prediction error
 */
export interface EdgeContribution {
    edgeId: string;
    edge: Edge;
    contribution: number;
    pathLength: number;
    pathWeight: number;
}

/**
 * Weight update configuration
 */
export interface WeightUpdateConfig {
    learningRate: number;           // η in the paper (default: 0.01)
    significanceThreshold: number;  // θ_significant (default: 0.2)
    minWeight: number;              // Minimum edge weight (default: 0.1)
    maxWeight: number;              // Maximum edge weight (default: 2.0)
    decayFactor: number;            // Weight decay to prevent overfitting (default: 0.99)
    maxPathLength: number;          // Maximum path length for contribution analysis (default: 3)
}

/**
 * Prediction error analysis
 */
export interface PredictionError {
    testId: string;
    predictedImpact: number;
    actualImpact: number;
    error: number;                  // δ = predicted - actual
    isSignificant: boolean;
    contributingPaths: EdgeContribution[][];
}

/**
 * Weight update engine for knowledge graph adaptation
 */
export class WeightUpdateEngine {
    private config: WeightUpdateConfig;
    private updateHistory: Map<string, number[]> = new Map(); // Track weight changes over time

    constructor(config?: Partial<WeightUpdateConfig>) {
        this.config = {
            learningRate: 0.01,
            significanceThreshold: 0.2,
            minWeight: 0.1,
            maxWeight: 2.0,
            decayFactor: 0.99,
            maxPathLength: 3,
            ...config
        };
    }

    /**
     * Main function to update graph weights based on test feedback
     * Implements Algorithm 5 weight update mechanism from the paper
     */
    public async updateWeights(
        graph: Graph,
        testResults: TestResult[],
        predictedImpacts: Record<string, number>
    ): Promise<Graph> {
        Logger.info(`Starting weight update for ${testResults.length} test results`);

        // Calculate prediction errors
        const predictionErrors = this.calculatePredictionErrors(testResults, predictedImpacts);
        
        // Filter for significant errors only
        const significantErrors = predictionErrors.filter(error => error.isSignificant);
        
        if (significantErrors.length === 0) {
            Logger.debug('No significant prediction errors found, skipping weight updates');
            return graph;
        }

        Logger.info(`Found ${significantErrors.length} significant prediction errors`);

        // Create a copy of the graph for updates
        const updatedGraph: Graph = {
            nodes: new Map(graph.nodes),
            edges: new Map(graph.edges)
        };

        let totalUpdates = 0;

        // Process each significant error
        for (const error of significantErrors) {
            // Find contributing paths for this error
            const contributingPaths = this.findContributingPaths(graph, error.testId);
            
            // Update weights for each contributing edge
            for (const path of contributingPaths) {
                for (const edgeContribution of path) {
                    const updatedWeight = this.updateEdgeWeight(
                        edgeContribution.edge.weight,
                        error.error,
                        edgeContribution.contribution
                    );
                    
                    // Apply the weight update
                    const edgeId = `${edgeContribution.edge.source}-${edgeContribution.edge.type}-${edgeContribution.edge.target}`;
                    const edge = updatedGraph.edges.get(edgeId);
                    
                    if (edge) {
                        const oldWeight = edge.weight;
                        edge.weight = updatedWeight;
                        
                        // Track weight change history
                        this.recordWeightChange(edgeId, oldWeight, updatedWeight);
                        totalUpdates++;
                        
                        Logger.debug(`Updated edge ${edgeId}: ${oldWeight.toFixed(3)} -> ${updatedWeight.toFixed(3)} (error: ${error.error.toFixed(3)})`);
                    }
                }
            }
        }

        // Apply weight decay to prevent overfitting
        this.applyWeightDecay(updatedGraph);

        // Apply regularization
        this.applyRegularization(updatedGraph);

        Logger.info(`Completed weight updates: ${totalUpdates} edge weights modified`);
        return updatedGraph;
    }

    /**
     * Calculate prediction errors for test results
     */
    private calculatePredictionErrors(
        testResults: TestResult[],
        predictedImpacts: Record<string, number>
    ): PredictionError[] {
        const errors: PredictionError[] = [];

        for (const result of testResults) {
            const predicted = predictedImpacts[result.testId] || 0;
            const actual = this.convertResultToImpact(result);
            const error = predicted - actual;
            
            const predictionError: PredictionError = {
                testId: result.testId,
                predictedImpact: predicted,
                actualImpact: actual,
                error,
                isSignificant: Math.abs(error) > this.config.significanceThreshold,
                contributingPaths: []
            };

            errors.push(predictionError);
        }

        return errors;
    }

    /**
     * Convert test result to impact value (0-1)
     */
    private convertResultToImpact(result: TestResult): number {
        switch (result.status) {
            case 'failed':
                return 1.0; // High actual impact - fault detected
            case 'passed':
                return 0.0; // Low actual impact - no fault
            case 'skipped':
                return 0.5; // Inconclusive
            default:
                return 0.5; // Unknown/inconclusive
        }
    }

    /**
     * Find contributing paths from changed nodes to test
     * Simplified version focusing on direct and 2-hop paths
     */
    private findContributingPaths(graph: Graph, testId: string): EdgeContribution[][] {
        const paths: EdgeContribution[][] = [];
        const visited = new Set<string>();
        
        // BFS to find paths to the test node
        const queue: { nodeId: string; path: EdgeContribution[]; depth: number }[] = [];
        
        // Start from all nodes that have edges pointing to the test
        for (const [edgeId, edge] of graph.edges) {
            if (edge.target === testId && edge.source !== testId) {
                const contribution: EdgeContribution = {
                    edgeId,
                    edge,
                    contribution: 1.0, // Direct connection has full contribution
                    pathLength: 1,
                    pathWeight: edge.weight
                };
                
                paths.push([contribution]);
                queue.push({
                    nodeId: edge.source,
                    path: [contribution],
                    depth: 1
                });
            }
        }

        // Explore 2-hop paths (limited for performance)
        while (queue.length > 0 && paths.length < 50) { // Limit to prevent explosion
            const { nodeId, path, depth } = queue.shift()!;
            
            if (depth >= this.config.maxPathLength || visited.has(nodeId)) {
                continue;
            }
            
            visited.add(nodeId);
            
            // Find edges pointing to this node
            for (const [edgeId, edge] of graph.edges) {
                if (edge.target === nodeId && edge.source !== nodeId && !visited.has(edge.source)) {
                    const pathWeight = path.reduce((sum, contrib) => sum * contrib.edge.weight, edge.weight);
                    const contribution: EdgeContribution = {
                        edgeId,
                        edge,
                        contribution: pathWeight / (depth + 1), // Attenuate by path length
                        pathLength: depth + 1,
                        pathWeight
                    };
                    
                    const newPath = [contribution, ...path];
                    paths.push(newPath);
                    
                    if (depth < this.config.maxPathLength - 1) {
                        queue.push({
                            nodeId: edge.source,
                            path: newPath,
                            depth: depth + 1
                        });
                    }
                }
            }
        }

        Logger.debug(`Found ${paths.length} contributing paths for test ${testId}`);
        return paths.slice(0, 20); // Limit paths to prevent excessive updates
    }

    /**
     * Update individual edge weight based on error and contribution
     * Implements: W'(e) = W(e) + η * δ * contribution(e, r)
     */
    private updateEdgeWeight(currentWeight: number, error: number, contribution: number): number {
        // Apply weight update formula from the paper
        const weightDelta = this.config.learningRate * error * contribution;
        const newWeight = currentWeight + weightDelta;
        
        // Clamp weight to valid range
        return Math.max(this.config.minWeight, Math.min(this.config.maxWeight, newWeight));
    }

    /**
     * Apply weight decay to prevent overfitting
     */
    private applyWeightDecay(graph: Graph): void {
        let decayedCount = 0;
        
        for (const [edgeId, edge] of graph.edges) {
            // Only apply decay to weights that are significantly different from 1.0
            if (Math.abs(edge.weight - 1.0) > 0.1) {
                const oldWeight = edge.weight;
                edge.weight = edge.weight * this.config.decayFactor + (1.0 - this.config.decayFactor);
                
                if (Math.abs(oldWeight - edge.weight) > 0.001) {
                    decayedCount++;
                }
            }
        }
        
        if (decayedCount > 0) {
            Logger.debug(`Applied weight decay to ${decayedCount} edges`);
        }
    }

    /**
     * Apply regularization to maintain reasonable weight distribution
     */
    private applyRegularization(graph: Graph): void {
        const weights: number[] = [];
        
        // Collect all weights
        for (const edge of graph.edges.values()) {
            weights.push(edge.weight);
        }
        
        if (weights.length === 0) return;
        
        // Calculate statistics
        const mean = weights.reduce((sum, w) => sum + w, 0) / weights.length;
        const variance = weights.reduce((sum, w) => sum + Math.pow(w - mean, 2), 0) / weights.length;
        const stdDev = Math.sqrt(variance);
        
        // Apply regularization if variance is too high
        if (stdDev > 0.5) {
            let regularizedCount = 0;
            
            for (const edge of graph.edges.values()) {
                // Pull extreme weights toward the mean
                if (Math.abs(edge.weight - mean) > 2 * stdDev) {
                    const direction = edge.weight > mean ? -1 : 1;
                    edge.weight += direction * 0.1 * Math.abs(edge.weight - mean);
                    edge.weight = Math.max(this.config.minWeight, Math.min(this.config.maxWeight, edge.weight));
                    regularizedCount++;
                }
            }
            
            if (regularizedCount > 0) {
                Logger.debug(`Applied regularization to ${regularizedCount} edges (stdDev: ${stdDev.toFixed(3)})`);
            }
        }
    }

    /**
     * Record weight change history for analysis
     */
    private recordWeightChange(edgeId: string, oldWeight: number, newWeight: number): void {
        if (!this.updateHistory.has(edgeId)) {
            this.updateHistory.set(edgeId, []);
        }
        
        const history = this.updateHistory.get(edgeId)!;
        history.push(newWeight);
        
        // Keep only recent history
        if (history.length > 100) {
            history.splice(0, history.length - 100);
        }
    }

    /**
     * Get weight update statistics
     */
    public getUpdateStatistics(): {
        totalEdgesTracked: number;
        averageWeightChange: number;
        mostVolatileEdges: string[];
    } {
        let totalChange = 0;
        let changeCount = 0;
        const edgeVolatility: Array<{ edgeId: string; volatility: number }> = [];

        for (const [edgeId, history] of this.updateHistory) {
            if (history.length > 1) {
                // Calculate volatility as standard deviation
                const mean = history.reduce((sum, w) => sum + w, 0) / history.length;
                const variance = history.reduce((sum, w) => sum + Math.pow(w - mean, 2), 0) / history.length;
                const volatility = Math.sqrt(variance);
                
                edgeVolatility.push({ edgeId, volatility });
                
                // Calculate recent change
                const recentChange = Math.abs(history[history.length - 1] - history[history.length - 2]);
                totalChange += recentChange;
                changeCount++;
            }
        }

        // Sort by volatility and get top 5
        edgeVolatility.sort((a, b) => b.volatility - a.volatility);
        const mostVolatileEdges = edgeVolatility.slice(0, 5).map(item => item.edgeId);

        return {
            totalEdgesTracked: this.updateHistory.size,
            averageWeightChange: changeCount > 0 ? totalChange / changeCount : 0,
            mostVolatileEdges
        };
    }

    /**
     * Reset update history (for testing or cleanup)
     */
    public resetHistory(): void {
        this.updateHistory.clear();
        Logger.debug('Weight update history reset');
    }

    /**
     * Get current configuration
     */
    public getConfig(): WeightUpdateConfig {
        return { ...this.config };
    }

    /**
     * Update configuration
     */
    public updateConfig(newConfig: Partial<WeightUpdateConfig>): void {
        this.config = { ...this.config, ...newConfig };
        Logger.info(`Weight update configuration updated: ${JSON.stringify(newConfig)}`);
    }
}