// RLManager.ts - Main RL coordinator for SIKG

import { Graph, TestResult, SemanticChangeInfo, TestImpact } from '../GraphTypes';
import { ConfigManager } from '../../utils/ConfigManager';
import { Logger } from '../../utils/Logger';

import { MDPFramework, MDPState, MDPAction, MDPReward } from './MDPFramework';
import { WeightUpdateEngine, WeightUpdateConfig } from './WeightUpdateEngine';
import { PolicyManager } from './PolicyManager';
import { FeedbackProcessor, ProcessedFeedback, SessionPerformanceMetrics } from './FeedbackProcessor';

/**
 * RL Manager configuration
 */
export interface RLManagerConfig {
    enabled: boolean;
    learningRate: number;
    explorationRate: number;
    weightUpdateConfig: Partial<WeightUpdateConfig>;
    performanceThreshold: number;
    adaptationInterval: number; // ms between adaptations
    maxHistorySize: number;
}

/**
 * RL system state
 */
export interface RLSystemState {
    isEnabled: boolean;
    currentPerformance: SessionPerformanceMetrics | null;
    totalAdaptations: number;
    lastAdaptation: number;
    averageReward: number;
    systemStability: number;
}

/**
 * Main reinforcement learning coordinator for SIKG
 * Implements Algorithm 5 from the paper
 */
export class RLManager {
    private config: RLManagerConfig;
    private mdpFramework: MDPFramework;
    private weightUpdateEngine: WeightUpdateEngine;
    private policyManager: PolicyManager;
    private feedbackProcessor: FeedbackProcessor;
    
    private currentState: MDPState | null = null;
    private currentAction: MDPAction | null = null;
    private currentSessionId: string | null = null;
    private systemState: RLSystemState;
    
    private adaptationCounter: number = 0;
    private lastPerformanceCheck: number = 0;

    constructor(configManager: ConfigManager) {
        // Initialize configuration
        this.config = {
            enabled: true,
            learningRate: 0.01,
            explorationRate: 0.1,
            weightUpdateConfig: {
                learningRate: 0.01,
                significanceThreshold: 0.2,
                minWeight: 0.1,
                maxWeight: 2.0
            },
            performanceThreshold: 0.6,
            adaptationInterval: 300000, // 5 minutes
            maxHistorySize: 1000
        };

        // Initialize components
        this.mdpFramework = new MDPFramework();
        this.weightUpdateEngine = new WeightUpdateEngine(this.config.weightUpdateConfig);
        this.policyManager = new PolicyManager(configManager);
        this.feedbackProcessor = new FeedbackProcessor();

        // Initialize system state
        this.systemState = {
            isEnabled: this.config.enabled,
            currentPerformance: null,
            totalAdaptations: 0,
            lastAdaptation: 0,
            averageReward: 0.5,
            systemStability: 0.8
        };

        Logger.info('RL Manager initialized');
    }

    /**
     * Start RL session for test selection
     */
    public async startRLSession(
        semanticChanges: SemanticChangeInfo[],
        testImpacts: Record<string, TestImpact>,
        availableTests: string[]
    ): Promise<Record<string, TestImpact>> {
        if (!this.config.enabled) {
            Logger.debug('RL disabled, returning original impacts');
            return testImpacts;
        }

        try {
            // Create MDP state
            this.currentState = this.mdpFramework.createState(
                semanticChanges,
                [], // No test history yet for this session
                Object.keys(testImpacts).map(testId => testImpacts[testId].testPath)
            );

            // Apply adaptive policy to test impacts
            const adjustedImpacts = await this.policyManager.applyPolicy(
                testImpacts,
                semanticChanges
            );

            // Create MDP action
            this.currentAction = this.mdpFramework.createAction(
                'SELECT_TESTS',
                adjustedImpacts,
                this.policyManager.getCurrentPolicy().parameters.selectionThreshold
            );

            // Start feedback session
            this.currentSessionId = this.feedbackProcessor.startSession(
                this.currentState,
                this.currentAction,
                adjustedImpacts
            );

            Logger.info(`Started RL session: ${this.currentSessionId} with ${this.currentAction.selectedTests.length} selected tests`);
            return adjustedImpacts;

        } catch (error) {
            Logger.error('Error in RL session start:', error);
            return testImpacts; // Fallback to original impacts
        }
    }

    /**
     * Process test execution feedback and update RL components
     */
    public async processTestFeedback(testResults: TestResult[]): Promise<void> {
        if (!this.config.enabled || !this.currentSessionId) {
            Logger.debug('RL disabled or no active session, skipping feedback processing');
            return;
        }

        try {
            // Process feedback through feedback processor
            const feedback = this.feedbackProcessor.processTestResults(this.currentSessionId, testResults);
            
            if (!feedback) {
                Logger.warn('No feedback generated from test results');
                return;
            }

            // Calculate MDP reward
            const reward = this.calculateReward(feedback, testResults);
            
            // Update system state
            this.updateSystemState(feedback, reward);

            // Apply learning signals to policy
            this.policyManager.updatePolicy(feedback.learningSignals, feedback.performanceMetrics);

            // Check if adaptation is needed
            await this.checkAndApplyAdaptations(feedback);

            // Cleanup session
            this.currentSessionId = null;
            this.currentAction = null;

            Logger.info(`Processed RL feedback: reward=${reward.totalReward.toFixed(3)}, F1=${feedback.performanceMetrics.f1Score.toFixed(3)}`);

        } catch (error) {
            Logger.error('Error processing test feedback:', error);
        }
    }

    /**
     * Update knowledge graph weights based on feedback
     */
    public async updateGraphWeights(graph: Graph): Promise<Graph> {
        if (!this.config.enabled) {
            return graph;
        }

        try {
            // Get recent feedback
            const recentFeedback = this.feedbackProcessor.getRecentFeedback(5);
            
            if (recentFeedback.length === 0) {
                Logger.debug('No recent feedback for weight updates');
                return graph;
            }

            // Collect all test results and predictions
            const allTestResults: TestResult[] = [];
            const allPredictions: Record<string, number> = {};

            for (const feedback of recentFeedback) {
                allTestResults.push(...feedback.testResults);
                Object.assign(allPredictions, feedback.predictedImpacts);
            }

            // Apply weight updates
            const updatedGraph = await this.weightUpdateEngine.updateWeights(
                graph,
                allTestResults,
                allPredictions
            );

            Logger.debug('Applied RL-based weight updates to knowledge graph');
            return updatedGraph;

        } catch (error) {
            Logger.error('Error updating graph weights:', error);
            return graph; // Return original graph on error
        }
    }

    /**
     * Get current RL system status
     */
    public getSystemStatus(): RLSystemState & {
        policyStatistics: any;
        weightStatistics: any;
        recentPerformance: SessionPerformanceMetrics | null;
    } {
        const policyStats = this.policyManager.getPolicyStatistics();
        const weightStats = this.weightUpdateEngine.getUpdateStatistics();
        const recentPerformance = this.feedbackProcessor.getAveragePerformanceMetrics(10);

        return {
            ...this.systemState,
            policyStatistics: policyStats,
            weightStatistics: weightStats,
            recentPerformance
        };
    }

    /**
     * Enable or disable RL system
     */
    public setEnabled(enabled: boolean): void {
        this.config.enabled = enabled;
        this.systemState.isEnabled = enabled;
        
        if (enabled) {
            Logger.info('RL system enabled');
        } else {
            Logger.info('RL system disabled');
            // Clean up active session
            this.currentSessionId = null;
            this.currentAction = null;
        }
    }

    /**
     * Update RL configuration
     */
    public updateConfig(newConfig: Partial<RLManagerConfig>): void {
        this.config = { ...this.config, ...newConfig };
        
        if (newConfig.weightUpdateConfig) {
            this.weightUpdateEngine.updateConfig(newConfig.weightUpdateConfig);
        }
        
        Logger.info(`RL configuration updated: ${JSON.stringify(newConfig)}`);
    }

    /**
     * Reset RL system (for testing)
     */
    public reset(): void {
        this.mdpFramework.cleanupHistory(0);
        this.feedbackProcessor.reset();
        this.policyManager.resetToDefaults();
        this.weightUpdateEngine.resetHistory();
        
        this.currentState = null;
        this.currentAction = null;
        this.currentSessionId = null;
        this.adaptationCounter = 0;
        this.lastPerformanceCheck = 0;

        this.systemState = {
            isEnabled: this.config.enabled,
            currentPerformance: null,
            totalAdaptations: 0,
            lastAdaptation: 0,
            averageReward: 0.5,
            systemStability: 0.8
        };

        Logger.info('RL system reset');
    }

    /**
     * Calculate MDP reward from feedback
     */
    private calculateReward(feedback: ProcessedFeedback, testResults: TestResult[]): MDPReward {
        const totalExecutionTime = testResults.reduce((sum, result) => sum + result.executionTime, 0);
        const targetExecutionTime = 300000; // 5 minutes target

        return this.mdpFramework.calculateReward(
            this.currentAction!,
            testResults,
            totalExecutionTime,
            targetExecutionTime
        );
    }

    /**
     * Update system state based on feedback
     */
    private updateSystemState(feedback: ProcessedFeedback, reward: MDPReward): void {
        // Update performance
        this.systemState.currentPerformance = feedback.performanceMetrics;

        // Update average reward with exponential moving average
        this.systemState.averageReward = this.systemState.averageReward * 0.9 + reward.totalReward * 0.1;

        // Update stability based on performance consistency
        const performanceScore = feedback.performanceMetrics.f1Score;
        const stabilityDelta = Math.abs(performanceScore - 0.7) < 0.1 ? 0.05 : -0.02;
        this.systemState.systemStability = Math.max(0, Math.min(1, 
            this.systemState.systemStability + stabilityDelta
        ));

        this.lastPerformanceCheck = Date.now();
    }

    /**
     * Check if adaptations are needed and apply them
     */
    private async checkAndApplyAdaptations(feedback: ProcessedFeedback): Promise<void> {
        const now = Date.now();
        
        // Check if enough time has passed since last adaptation
        if (now - this.systemState.lastAdaptation < this.config.adaptationInterval) {
            return;
        }

        // Check if performance is below threshold
        const needsAdaptation = 
            feedback.performanceMetrics.f1Score < this.config.performanceThreshold ||
            feedback.learningSignals.length > 3;

        if (needsAdaptation) {
            await this.applySystemAdaptations(feedback);
            
            this.systemState.lastAdaptation = now;
            this.systemState.totalAdaptations++;
            this.adaptationCounter++;
            
            Logger.info(`Applied system adaptations #${this.adaptationCounter}`);
        }
    }

    /**
     * Apply system-level adaptations based on feedback
     */
    private async applySystemAdaptations(feedback: ProcessedFeedback): Promise<void> {
        const performance = feedback.performanceMetrics;
        
        // Adapt learning rate based on performance stability
        if (this.systemState.systemStability < 0.5) {
            // Reduce learning rate when system is unstable
            this.config.learningRate *= 0.9;
            Logger.debug('Reduced learning rate due to instability');
        } else if (performance.f1Score > 0.8 && this.systemState.systemStability > 0.8) {
            // Increase learning rate when system is stable and performing well
            this.config.learningRate = Math.min(0.05, this.config.learningRate * 1.05);
            Logger.debug('Increased learning rate due to stable good performance');
        }

        // Adapt exploration rate
        if (performance.recall < 0.5) {
            // Increase exploration when missing too many faults
            this.config.explorationRate = Math.min(0.3, this.config.explorationRate * 1.1);
            Logger.debug('Increased exploration rate to improve recall');
        } else if (performance.precision > 0.9) {
            // Decrease exploration when selection is very precise
            this.config.explorationRate = Math.max(0.05, this.config.explorationRate * 0.95);
            Logger.debug('Decreased exploration rate due to high precision');
        }

        // Update weight update engine configuration
        this.weightUpdateEngine.updateConfig({
            learningRate: this.config.learningRate,
            significanceThreshold: performance.f1Score < 0.5 ? 0.15 : 0.2 // Lower threshold when struggling
        });
    }

    /**
     * Get performance recommendations
     */
    public getPerformanceRecommendations(): string[] {
        const recommendations: string[] = [];
        const recentPerformance = this.feedbackProcessor.getAveragePerformanceMetrics(5);
        
        if (!recentPerformance) {
            recommendations.push('No recent performance data available');
            return recommendations;
        }

        // Add policy-based recommendations
        recommendations.push(...this.policyManager.getParameterRecommendations(recentPerformance));

        // Add system-level recommendations
        if (this.systemState.averageReward < 0.4) {
            recommendations.push('Low average reward - consider adjusting selection strategy');
        }

        if (this.systemState.systemStability < 0.5) {
            recommendations.push('System instability detected - reduce adaptation frequency');
        }

        if (recentPerformance.executionTimeMs > 600000) {
            recommendations.push('Long execution times - consider more aggressive test selection');
        }

        return recommendations;
    }

    /**
     * Export RL state for persistence
     */
    public exportState(): any {
        return {
            config: this.config,
            systemState: this.systemState,
            adaptationCounter: this.adaptationCounter,
            policyState: this.policyManager.exportPolicyState(),
            averageReward: this.mdpFramework.getAverageReward()
        };
    }

    /**
     * Import RL state from persistence
     */
    public importState(state: any): void {
        try {
            if (state.config) {
                this.config = { ...this.config, ...state.config };
            }
            
            if (state.systemState) {
                this.systemState = { ...this.systemState, ...state.systemState };
            }
            
            if (typeof state.adaptationCounter === 'number') {
                this.adaptationCounter = state.adaptationCounter;
            }
            
            if (state.policyState) {
                this.policyManager.importPolicyState(state.policyState);
            }
            
            Logger.info('RL state imported successfully');
        } catch (error) {
            Logger.error('Failed to import RL state:', error);
        }
    }
}