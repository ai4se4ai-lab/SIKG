// MDPFramework.ts - MDP state/action/reward definitions for SIKG

import { SemanticChangeInfo, TestResult, TestImpact } from '../GraphTypes';
import { Logger } from '../../utils/Logger';

/**
 * State representation in the MDP framework
 */
export interface MDPState {
    id: string;
    changeTypes: SemanticChangeInfo['semanticType'][];
    impactedFiles: string[];
    testHistory: TestExecutionHistory[];
    codeComplexity: number;
    timestamp: number;
}

/**
 * Action representation for test selection decisions
 */
export interface MDPAction {
    actionType: 'SELECT_TESTS' | 'PRIORITIZE_TESTS' | 'ADJUST_THRESHOLD';
    selectedTests: string[];
    priorityOrder: string[];
    selectionThreshold: number;
    confidence: number;
}

/**
 * Reward signal for RL feedback
 */
export interface MDPReward {
    faultDetectionScore: number;  // 0-1 based on faults found
    efficiencyScore: number;      // 0-1 based on execution time savings
    accuracyScore: number;        // 0-1 based on prediction accuracy
    totalReward: number;          // Weighted combination
}

/**
 * Test execution history for state tracking
 */
export interface TestExecutionHistory {
    testId: string;
    executionTime: number;
    status: 'passed' | 'failed' | 'skipped';
    timestamp: number;
    changeContext: string[];
}

/**
 * Policy for test selection decisions
 */
export interface TestSelectionPolicy {
    stateId: string;
    actionProbabilities: Map<string, number>;
    lastUpdate: number;
    performanceMetrics: {
        averageReward: number;
        successRate: number;
        adaptationCount: number;
    };
}

/**
 * MDP Framework implementation for SIKG reinforcement learning
 */
export class MDPFramework {
    private states: Map<string, MDPState> = new Map();
    private actionHistory: MDPAction[] = [];
    private rewardHistory: MDPReward[] = [];
    private currentState: MDPState | null = null;

    /**
     * Create a state representation from current system context
     */
    public createState(
        semanticChanges: SemanticChangeInfo[],
        testHistory: TestResult[],
        codeFiles: string[]
    ): MDPState {
        // Extract change types
        const changeTypes = semanticChanges.map(change => change.semanticType);
        
        // Extract impacted files
        const impactedFiles = [...new Set(semanticChanges.map(change => 
            change.changeDetails.filePath || ''
        ).filter(path => path.length > 0))];
        
        // Convert test results to execution history
        const executionHistory: TestExecutionHistory[] = testHistory.slice(-50).map(result => ({
            testId: result.testId,
            executionTime: result.executionTime,
            status: result.status,
            timestamp: new Date(result.timestamp).getTime(),
            changeContext: result.changedNodeIds || []
        }));
        
        // Calculate code complexity (simplified metric)
        const codeComplexity = this.calculateCodeComplexity(impactedFiles, semanticChanges);
        
        // Create state ID based on key characteristics
        const stateId = this.generateStateId(changeTypes, impactedFiles, codeComplexity);
        
        const state: MDPState = {
            id: stateId,
            changeTypes,
            impactedFiles,
            testHistory: executionHistory,
            codeComplexity,
            timestamp: Date.now()
        };
        
        this.states.set(stateId, state);
        this.currentState = state;
        
        Logger.debug(`Created MDP state: ${stateId} with ${changeTypes.length} change types`);
        return state;
    }

    /**
     * Create an action for test selection decisions
     */
    public createAction(
        actionType: MDPAction['actionType'],
        testImpacts: Record<string, TestImpact>,
        threshold: number = 0.5
    ): MDPAction {
        // Select tests based on impact scores above threshold
        const selectedTests = Object.entries(testImpacts)
            .filter(([_, impact]) => impact.impactScore >= threshold)
            .map(([testId, _]) => testId);
        
        // Create priority order based on impact scores
        const priorityOrder = Object.entries(testImpacts)
            .sort(([_, a], [__, b]) => b.impactScore - a.impactScore)
            .map(([testId, _]) => testId);
        
        // Calculate confidence based on impact score distribution
        const scores = Object.values(testImpacts).map(impact => impact.impactScore);
        const confidence = this.calculateActionConfidence(scores, threshold);
        
        const action: MDPAction = {
            actionType,
            selectedTests,
            priorityOrder,
            selectionThreshold: threshold,
            confidence
        };
        
        this.actionHistory.push(action);
        Logger.debug(`Created MDP action: ${actionType} selecting ${selectedTests.length} tests`);
        
        return action;
    }

    /**
     * Calculate reward based on test execution results
     */
    public calculateReward(
        action: MDPAction,
        testResults: TestResult[],
        totalExecutionTime: number,
        targetExecutionTime: number = 300000 // 5 minutes default
    ): MDPReward {
        const executedTests = testResults.length;
        const failedTests = testResults.filter(r => r.status === 'failed').length;
        const selectedTests = action.selectedTests.length;
        
        // Calculate fault detection score (0-1)
        const faultDetectionScore = failedTests > 0 ? 
            Math.min(1.0, failedTests / Math.max(1, selectedTests * 0.1)) : 0.5;
        
        // Calculate efficiency score based on execution time savings
        const efficiencyScore = targetExecutionTime > 0 ? 
            Math.max(0, 1 - (totalExecutionTime / targetExecutionTime)) : 0.5;
        
        // Calculate accuracy score based on prediction vs actual
        const accuracyScore = this.calculatePredictionAccuracy(action, testResults);
        
        // Weighted combination of scores
        const totalReward = 
            0.4 * faultDetectionScore +  // Prioritize fault detection
            0.3 * efficiencyScore +      // Balance with efficiency
            0.3 * accuracyScore;         // Include prediction accuracy
        
        const reward: MDPReward = {
            faultDetectionScore,
            efficiencyScore,
            accuracyScore,
            totalReward
        };
        
        this.rewardHistory.push(reward);
        Logger.debug(`Calculated reward: ${totalReward.toFixed(3)} (fault: ${faultDetectionScore.toFixed(3)}, efficiency: ${efficiencyScore.toFixed(3)}, accuracy: ${accuracyScore.toFixed(3)})`);
        
        return reward;
    }

    /**
     * Get current state
     */
    public getCurrentState(): MDPState | null {
        return this.currentState;
    }

    /**
     * Get action history for learning
     */
    public getActionHistory(limit: number = 100): MDPAction[] {
        return this.actionHistory.slice(-limit);
    }

    /**
     * Get reward history for learning
     */
    public getRewardHistory(limit: number = 100): MDPReward[] {
        return this.rewardHistory.slice(-limit);
    }

    /**
     * Calculate average reward over recent history
     */
    public getAverageReward(windowSize: number = 20): number {
        const recentRewards = this.rewardHistory.slice(-windowSize);
        if (recentRewards.length === 0) return 0.5; // Default neutral reward
        
        const sum = recentRewards.reduce((acc, reward) => acc + reward.totalReward, 0);
        return sum / recentRewards.length;
    }

    /**
     * Clear old history to prevent memory bloat
     */
    public cleanupHistory(maxHistorySize: number = 1000): void {
        if (this.actionHistory.length > maxHistorySize) {
            this.actionHistory = this.actionHistory.slice(-maxHistorySize);
        }
        if (this.rewardHistory.length > maxHistorySize) {
            this.rewardHistory = this.rewardHistory.slice(-maxHistorySize);
        }
        
        // Cleanup old states
        const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days
        for (const [stateId, state] of this.states.entries()) {
            if (state.timestamp < cutoffTime) {
                this.states.delete(stateId);
            }
        }
        
        Logger.debug(`Cleaned up MDP history: ${this.actionHistory.length} actions, ${this.rewardHistory.length} rewards`);
    }

    /**
     * Generate unique state ID based on context
     */
    private generateStateId(
        changeTypes: SemanticChangeInfo['semanticType'][],
        impactedFiles: string[],
        complexity: number
    ): string {
        const changeSignature = changeTypes.sort().join('|');
        const fileSignature = impactedFiles.length.toString();
        const complexityBucket = Math.floor(complexity * 10).toString();
        
        return `${changeSignature}_${fileSignature}_${complexityBucket}`;
    }

    /**
     * Calculate simplified code complexity metric
     */
    private calculateCodeComplexity(
        impactedFiles: string[],
        semanticChanges: SemanticChangeInfo[]
    ): number {
        // Simplified complexity based on number of changes and change types
        const fileCount = impactedFiles.length;
        const changeCount = semanticChanges.length;
        const complexChangeTypes = semanticChanges.filter(change => 
            ['BUG_FIX', 'FEATURE_ADDITION', 'REFACTORING_SIGNATURE'].includes(change.semanticType)
        ).length;
        
        // Normalize to 0-1 range
        const rawComplexity = (fileCount * 0.1) + (changeCount * 0.2) + (complexChangeTypes * 0.3);
        return Math.min(1.0, rawComplexity / 10);
    }

    /**
     * Calculate action confidence based on impact score distribution
     */
    private calculateActionConfidence(scores: number[], threshold: number): number {
        if (scores.length === 0) return 0.5;
        
        const aboveThreshold = scores.filter(score => score >= threshold).length;
        const belowThreshold = scores.filter(score => score < threshold).length;
        
        // Higher confidence when there's clear separation around threshold
        const separation = Math.abs(aboveThreshold - belowThreshold) / scores.length;
        const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
        
        // Combine separation and average score for confidence
        return Math.min(1.0, (separation * 0.6) + (avgScore * 0.4));
    }

    /**
     * Calculate prediction accuracy comparing action predictions with actual results
     */
    private calculatePredictionAccuracy(action: MDPAction, results: TestResult[]): number {
        if (results.length === 0) return 0.5;
        
        const selectedTestIds = new Set(action.selectedTests);
        const failedTestIds = new Set(results.filter(r => r.status === 'failed').map(r => r.testId));
        
        // True positives: selected tests that failed
        const truePositives = results.filter(r => 
            selectedTestIds.has(r.testId) && failedTestIds.has(r.testId)
        ).length;
        
        // False positives: selected tests that passed
        const falsePositives = results.filter(r => 
            selectedTestIds.has(r.testId) && !failedTestIds.has(r.testId)
        ).length;
        
        // False negatives: unselected tests that failed
        const falseNegatives = results.filter(r => 
            !selectedTestIds.has(r.testId) && failedTestIds.has(r.testId)
        ).length;
        
        // Calculate F1 score as accuracy metric
        const precision = truePositives / Math.max(1, truePositives + falsePositives);
        const recall = truePositives / Math.max(1, truePositives + falseNegatives);
        
        if (precision + recall === 0) return 0.5;
        
        const f1Score = 2 * (precision * recall) / (precision + recall);
        return Math.min(1.0, f1Score);
    }
}