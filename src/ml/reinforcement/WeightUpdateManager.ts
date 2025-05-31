/**
 * WeightUpdateManager.ts - Dynamic weight update management for SIKG
 * 
 * Manages the updating of graph edge weights based on reinforcement learning feedback.
 * Implements the weight update mechanism W'(e) = W(e) + η·δ·contribution(e,r)
 * as described in the evaluation section.
 */

import { Logger } from '../../utils/Logger';
import { Graph, Edge } from '../../sikg/GraphTypes';
import { 
    WeightUpdate, 
    FeedbackSignal, 
    WeightUpdateStrategy,
    LearningMetrics 
} from '../types/ReinforcementTypes';

export class WeightUpdateManager {
    private graph: Graph;
    private weightHistory: Map<string, WeightHistoryEntry[]> = new Map();
    private updateStrategy: WeightUpdateStrategy;
    private learningRate: number = 0.01;
    private momentum: number = 0.9;
    private totalUpdates: number = 0;

    constructor(graph: Graph, strategy: WeightUpdateStrategy = WeightUpdateStrategy.GRADIENT_BASED) {
        this.graph = graph;
        this.updateStrategy = strategy;
        Logger.debug('Weight update manager initialized');
    }

    /**
     * Update graph weights based on reinforcement learning feedback
     * @param feedbackSignals Array of feedback signals from test execution
     * @returns Array of weight updates applied
     */
    public async updateWeights(feedbackSignals: FeedbackSignal[]): Promise<WeightUpdate[]> {
        const updates: WeightUpdate[] = [];
        
        try {
            for (const signal of feedbackSignals) {
                const edgeUpdates = await this.processFeedbackSignal(signal);
                updates.push(...edgeUpdates);
            }

            // Apply momentum and regularization
            this.applyMomentumUpdates(updates);
            
            // Record update history
            this.recordWeightUpdates(updates);
            
            this.totalUpdates++;
            Logger.info(`Applied ${updates.length} weight updates from ${feedbackSignals.length} feedback signals`);
            
            return updates;

        } catch (error) {
            Logger.error('Error updating weights:', error);
            return [];
        }
    }

    /**
     * Process individual feedback signal to determine weight updates
     */
    private async processFeedbackSignal(signal: FeedbackSignal): Promise<WeightUpdate[]> {
        const updates: WeightUpdate[] = [];
        
        // Find paths that contributed to the prediction
        const contributingPaths = this.findContributingPaths(
            signal.testId, 
            signal.changedNodeIds
        );

        for (const path of contributingPaths) {
            const pathContribution = this.calculatePathContribution(path, signal);
            
            for (const edgeId of path.edgeIds) {
                const edge = this.graph.edges.get(edgeId);
                if (!edge) continue;

                const weightDelta = this.calculateWeightDelta(
                    edge,
                    signal,
                    pathContribution
                );

                if (Math.abs(weightDelta) > 0.001) { // Minimum update threshold
                    updates.push({
                        edgeId: edgeId,
                        oldWeight: edge.weight,
                        newWeight: edge.weight + weightDelta,
                        delta: weightDelta,
                        confidence: signal.confidence,
                        reason: this.determineUpdateReason(signal),
                        timestamp: new Date()
                    });
                }
            }
        }

        return updates;
    }

    /**
     * Find paths from changed nodes to test node that contributed to prediction
     */
    private findContributingPaths(testId: string, changedNodeIds: string[]): ContributingPath[] {
        const paths: ContributingPath[] = [];
        const maxDepth = 5;

        for (const changedNodeId of changedNodeIds) {
            const pathsFromNode = this.findPathsBFS(changedNodeId, testId, maxDepth);
            paths.push(...pathsFromNode);
        }

        return paths;
    }

    /**
     * Find paths using breadth-first search
     */
    private findPathsBFS(sourceId: string, targetId: string, maxDepth: number): ContributingPath[] {
        const paths: ContributingPath[] = [];
        const queue: PathSearchItem[] = [{
            currentNode: sourceId,
            path: [],
            depth: 0
        }];
        
        const visited = new Set<string>();

        while (queue.length > 0) {
            const item = queue.shift()!;
            
            if (item.currentNode === targetId) {
                // Found path to target
                paths.push({
                    sourceNode: sourceId,
                    targetNode: targetId,
                    edgeIds: item.path,
                    length: item.depth,
                    strength: this.calculatePathStrength(item.path)
                });
                continue;
            }

            if (item.depth >= maxDepth || visited.has(item.currentNode)) {
                continue;
            }

            visited.add(item.currentNode);

            // Explore outgoing edges
            for (const [edgeId, edge] of this.graph.edges.entries()) {
                if (edge.source === item.currentNode && !visited.has(edge.target)) {
                    queue.push({
                        currentNode: edge.target,
                        path: [...item.path, edgeId],
                        depth: item.depth + 1
                    });
                }
            }
        }

        return paths;
    }

    /**
     * Calculate the strength of a path based on edge weights
     */
    private calculatePathStrength(edgeIds: string[]): number {
        let strength = 1.0;
        
        for (const edgeId of edgeIds) {
            const edge = this.graph.edges.get(edgeId);
            if (edge) {
                strength *= edge.weight;
            }
        }
        
        return strength;
    }

    /**
     * Calculate how much a path contributed to the prediction
     */
    private calculatePathContribution(path: ContributingPath, signal: FeedbackSignal): number {
        // Contribution based on path strength and prediction accuracy
        const pathStrength = path.strength;
        const lengthPenalty = Math.pow(0.8, path.length - 1); // Decay with length
        const accuracyBonus = signal.correct ? 1.0 : -0.5; // Bonus for correct predictions
        
        return pathStrength * lengthPenalty * accuracyBonus;
    }

    /**
     * Calculate weight delta for an edge based on feedback
     */
    private calculateWeightDelta(
        edge: Edge, 
        signal: FeedbackSignal, 
        pathContribution: number
    ): number {
        let delta = 0;

        switch (this.updateStrategy) {
            case WeightUpdateStrategy.GRADIENT_BASED:
                delta = this.calculateGradientBasedDelta(edge, signal, pathContribution);
                break;
            case WeightUpdateStrategy.REWARD_BASED:
                delta = this.calculateRewardBasedDelta(edge, signal, pathContribution);
                break;
            case WeightUpdateStrategy.ERROR_BASED:
                delta = this.calculateErrorBasedDelta(edge, signal, pathContribution);
                break;
            case WeightUpdateStrategy.ADAPTIVE:
                delta = this.calculateAdaptiveDelta(edge, signal, pathContribution);
                break;
        }

        // Apply learning rate
        delta *= this.learningRate;

        // Apply bounds to prevent extreme weights
        const newWeight = edge.weight + delta;
        if (newWeight < 0.1) {
            delta = 0.1 - edge.weight;
        } else if (newWeight > 2.0) {
            delta = 2.0 - edge.weight;
        }

        return delta;
    }

    /**
     * Calculate gradient-based weight delta
     */
    private calculateGradientBasedDelta(
        edge: Edge, 
        signal: FeedbackSignal, 
        pathContribution: number
    ): number {
        // Gradient of prediction error with respect to edge weight
        const predictionError = signal.correct ? 0 : (signal.predicted ? 1 : -1);
        const gradient = predictionError * pathContribution;
        
        return -gradient; // Negative gradient for gradient descent
    }

    /**
     * Calculate reward-based weight delta
     */
    private calculateRewardBasedDelta(
        edge: Edge, 
        signal: FeedbackSignal, 
        pathContribution: number
    ): number {
        // Update based on reward signal
        const reward = signal.correct ? 1.0 : -0.5;
        return reward * pathContribution * 0.1; // Scale factor
    }

    /**
     * Calculate error-based weight delta
     */
    private calculateErrorBasedDelta(
        edge: Edge, 
        signal: FeedbackSignal, 
        pathContribution: number
    ): number {
        // Update based on prediction error magnitude
        const error = signal.predicted && !signal.actual ? 1.0 : // False positive
                     !signal.predicted && signal.actual ? -1.0 : // False negative
                     0.0; // Correct prediction
        
        return error * pathContribution * 0.05;
    }

    /**
     * Calculate adaptive weight delta based on edge history
     */
    private calculateAdaptiveDelta(
        edge: Edge, 
        signal: FeedbackSignal, 
        pathContribution: number
    ): number {
        // Get edge update history
        const edgeId = this.getEdgeId(edge);
        const history = this.weightHistory.get(edgeId) || [];
        
        // Calculate adaptive learning rate based on history
        const adaptiveLearningRate = this.calculateAdaptiveLearningRate(history);
        
        // Use gradient-based update with adaptive rate
        const baselineError = signal.correct ? 0 : (signal.predicted ? 1 : -1);
        const gradient = baselineError * pathContribution;
        
        return -gradient * adaptiveLearningRate;
    }

    /**
     * Calculate adaptive learning rate based on update history
     */
    private calculateAdaptiveLearningRate(history: WeightHistoryEntry[]): number {
        if (history.length < 2) {
            return this.learningRate;
        }

        // Calculate variance in recent updates
        const recentUpdates = history.slice(-10);
        const deltas = recentUpdates.map(entry => entry.delta);
        const mean = deltas.reduce((sum, d) => sum + d, 0) / deltas.length;
        const variance = deltas.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / deltas.length;
        
        // Reduce learning rate if updates are highly variable
        const stabilityFactor = Math.max(0.1, 1.0 - variance);
        return this.learningRate * stabilityFactor;
    }

    /**
     * Apply momentum to weight updates
     */
    private applyMomentumUpdates(updates: WeightUpdate[]): void {
        for (const update of updates) {
            const history = this.weightHistory.get(update.edgeId) || [];
            
            if (history.length > 0) {
                // Apply momentum based on previous update
                const lastUpdate = history[history.length - 1];
                const momentumTerm = this.momentum * lastUpdate.delta;
                update.delta = update.delta + momentumTerm;
                update.newWeight = update.oldWeight + update.delta;
            }

            // Apply the update to the graph
            const edge = this.findEdgeById(update.edgeId);
            if (edge) {
                edge.weight = update.newWeight;
            }
        }
    }

    /**
     * Record weight updates in history
     */
    private recordWeightUpdates(updates: WeightUpdate[]): void {
        for (const update of updates) {
            if (!this.weightHistory.has(update.edgeId)) {
                this.weightHistory.set(update.edgeId, []);
            }

            const history = this.weightHistory.get(update.edgeId)!;
            history.push({
                timestamp: update.timestamp,
                oldWeight: update.oldWeight,
                newWeight: update.newWeight,
                delta: update.delta,
                confidence: update.confidence,
                reason: update.reason
            });

            // Keep only recent history to manage memory
            if (history.length > 100) {
                history.splice(0, history.length - 100);
            }
        }
    }

    /**
     * Determine reason for weight update
     */
    private determineUpdateReason(signal: FeedbackSignal): string {
        if (signal.correct) {
            return 'reinforcement';
        } else if (signal.predicted && !signal.actual) {
            return 'false_positive_correction';
        } else if (!signal.predicted && signal.actual) {
            return 'false_negative_correction';
        } else {
            return 'general_adjustment';
        }
    }

    /**
     * Get edge ID for consistent identification
     */
    private getEdgeId(edge: Edge): string {
        return `${edge.source}_${edge.type}_${edge.target}`;
    }

    /**
     * Find edge by ID
     */
    private findEdgeById(edgeId: string): Edge | undefined {
        for (const [id, edge] of this.graph.edges.entries()) {
            if (id === edgeId || this.getEdgeId(edge) === edgeId) {
                return edge;
            }
        }
        return undefined;
    }

    /**
     * Get weight update statistics
     */
    public getUpdateStatistics(): WeightUpdateStatistics {
        const totalEdges = this.graph.edges.size;
        const updatedEdges = this.weightHistory.size;
        const totalUpdates = Array.from(this.weightHistory.values())
            .reduce((sum, history) => sum + history.length, 0);

        // Calculate average weight change
        let totalWeightChange = 0;
        let changeCount = 0;

        for (const history of this.weightHistory.values()) {
            if (history.length > 0) {
                const firstWeight = history[0].oldWeight;
                const lastWeight = history[history.length - 1].newWeight;
                totalWeightChange += Math.abs(lastWeight - firstWeight);
                changeCount++;
            }
        }

        const averageWeightChange = changeCount > 0 ? totalWeightChange / changeCount : 0;

        return {
            totalEdges,
            updatedEdges,
            updateCoverage: totalEdges > 0 ? updatedEdges / totalEdges : 0,
            totalUpdates,
            averageUpdatesPerEdge: updatedEdges > 0 ? totalUpdates / updatedEdges : 0,
            averageWeightChange,
            updateSessions: this.totalUpdates
        };
    }

    /**
     * Get learning metrics for analysis
     */
    public getLearningMetrics(): LearningMetrics {
        const stats = this.getUpdateStatistics();
        
        // Calculate convergence metrics
        const recentUpdates = this.getRecentUpdates(100);
        const updateMagnitudes = recentUpdates.map(update => Math.abs(update.delta));
        const averageUpdateMagnitude = updateMagnitudes.length > 0 ? 
            updateMagnitudes.reduce((sum, mag) => sum + mag, 0) / updateMagnitudes.length : 0;

        // Calculate stability metrics
        const weightVariances = this.calculateWeightVariances();
        const averageVariance = weightVariances.length > 0 ?
            weightVariances.reduce((sum, var_) => sum + var_, 0) / weightVariances.length : 0;

        return {
            totalUpdates: stats.totalUpdates,
            updatedEdges: stats.updatedEdges,
            updateCoverage: stats.updateCoverage,
            averageUpdateMagnitude,
            averageVariance,
            learningRate: this.learningRate,
            momentum: this.momentum,
            convergenceScore: Math.max(0, 1 - averageUpdateMagnitude * 10), // Higher when updates are smaller
            stabilityScore: Math.max(0, 1 - averageVariance) // Higher when weights are more stable
        };
    }

    /**
     * Get recent weight updates
     */
    private getRecentUpdates(count: number): WeightUpdate[] {
        const allUpdates: WeightUpdate[] = [];
        
        for (const [edgeId, history] of this.weightHistory.entries()) {
            for (const entry of history) {
                allUpdates.push({
                    edgeId,
                    oldWeight: entry.oldWeight,
                    newWeight: entry.newWeight,
                    delta: entry.delta,
                    confidence: entry.confidence,
                    reason: entry.reason,
                    timestamp: entry.timestamp
                });
            }
        }

        // Sort by timestamp and return most recent
        allUpdates.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        return allUpdates.slice(0, count);
    }

    /**
     * Calculate variance in weights for each edge
     */
    private calculateWeightVariances(): number[] {
        const variances: number[] = [];

        for (const history of this.weightHistory.values()) {
            if (history.length > 1) {
                const weights = history.map(entry => entry.newWeight);
                const mean = weights.reduce((sum, w) => sum + w, 0) / weights.length;
                const variance = weights.reduce((sum, w) => sum + Math.pow(w - mean, 2), 0) / weights.length;
                variances.push(variance);
            }
        }

        return variances;
    }

    /**
     * Reset weight update history
     */
    public resetHistory(): void {
        this.weightHistory.clear();
        this.totalUpdates = 0;
        Logger.info('Weight update history reset');
    }

    /**
     * Export weight update data for analysis
     */
    public exportUpdateData(): WeightUpdateExport {
        return {
            weightHistory: Object.fromEntries(this.weightHistory),
            updateStatistics: this.getUpdateStatistics(),
            learningMetrics: this.getLearningMetrics(),
            configuration: {
                learningRate: this.learningRate,
                momentum: this.momentum,
                updateStrategy: this.updateStrategy
            },
            exportTimestamp: new Date()
        };
    }
}

// Supporting interfaces
interface ContributingPath {
    sourceNode: string;
    targetNode: string;
    edgeIds: string[];
    length: number;
    strength: number;
}

interface PathSearchItem {
    currentNode: string;
    path: string[];
    depth: number;
}

interface WeightHistoryEntry {
    timestamp: Date;
    oldWeight: number;
    newWeight: number;
    delta: number;
    confidence: number;
    reason: string;
}

interface WeightUpdateStatistics {
    totalEdges: number;
    updatedEdges: number;
    updateCoverage: number;
    totalUpdates: number;
    averageUpdatesPerEdge: number;
    averageWeightChange: number;
    updateSessions: number;
}

interface WeightUpdateExport {
    weightHistory: Record<string, WeightHistoryEntry[]>;
    updateStatistics: WeightUpdateStatistics;
    learningMetrics: LearningMetrics;
    configuration: {
        learningRate: number;
        momentum: number;
        updateStrategy: WeightUpdateStrategy;
    };
    exportTimestamp: Date;
}