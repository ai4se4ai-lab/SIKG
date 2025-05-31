/**
 * RewardFunction.ts - Reward function R implementation for SIKG MDP
 * 
 * Calculates rewards based on:
 * - Prediction accuracy (precision, recall, F1-score)
 * - Test execution efficiency
 * - False positive/negative penalties
 * - Temporal consistency
 * - Resource utilization
 */

import { Logger } from '../../utils/Logger';
import { TestResult, TestImpact } from '../../sikg/GraphTypes';
import { 
    MDPState, 
    MDPAction, 
    RewardSignal, 
    RewardComponents,
    EnvironmentResponse 
} from '../types/ReinforcementTypes';

export class RewardFunction {
    private rewardHistory: RewardSignal[] = [];
    private baselineMetrics: BaselineMetrics | null = null;
    private rewardWeights: RewardWeights;

    constructor() {
        this.rewardWeights = this.initializeRewardWeights();
        Logger.debug('Reward function initialized');
    }

    /**
     * Calculate reward for a state-action pair given environment response
     * @param state Current state
     * @param action Action taken
     * @param response Environment response (test results, predictions, etc.)
     * @returns Calculated reward value
     */
    public calculateReward(
        state: MDPState,
        action: MDPAction,
        response: EnvironmentResponse
    ): number {
        try {
            // Extract components from response
            const predictions = response.predictions || [];
            const actualResults = response.actualResults || [];
            const executionMetrics = response.executionMetrics || {};

            // Calculate individual reward components
            const components = this.calculateRewardComponents(
                state,
                action,
                predictions,
                actualResults,
                executionMetrics
            );

            // Combine components using weighted sum
            const totalReward = this.combineRewardComponents(components);

            // Apply normalization and bounds
            const normalizedReward = this.normalizeReward(totalReward);

            // Record reward signal
            const signal: RewardSignal = {
                state: state,
                action: action,
                reward: normalizedReward,
                components: components,
                timestamp: new Date(),
                metadata: {
                    predictions: predictions.length,
                    actualResults: actualResults.length,
                    executionTime: executionMetrics.totalTime || 0
                }
            };

            this.rewardHistory.push(signal);

            Logger.debug(`Calculated reward: ${normalizedReward.toFixed(3)} for action ${action.id}`);
            return normalizedReward;

        } catch (error) {
            Logger.error('Error calculating reward:', error);
            return -0.5; // Penalty for errors
        }
    }

    /**
     * Calculate individual reward components
     */
    private calculateRewardComponents(
        state: MDPState,
        action: MDPAction,
        predictions: TestImpact[],
        actualResults: TestResult[],
        executionMetrics: any
    ): RewardComponents {
        const components: RewardComponents = {
            accuracy: this.calculateAccuracyReward(predictions, actualResults),
            precision: this.calculatePrecisionReward(predictions, actualResults),
            recall: this.calculateRecallReward(predictions, actualResults),
            f1Score: 0, // Will be calculated from precision and recall
            efficiency: this.calculateEfficiencyReward(predictions, actualResults, executionMetrics),
            falsePositivePenalty: this.calculateFalsePositivePenalty(predictions, actualResults),
            falseNegativePenalty: this.calculateFalseNegativePenalty(predictions, actualResults),
            consistencyBonus: this.calculateConsistencyBonus(action, actualResults),
            explorationBonus: this.calculateExplorationBonus(action, state),
            baselineImprovement: this.calculateBaselineImprovement(predictions, actualResults)
        };

        // Calculate F1-score from precision and recall
        const precision = Math.max(0.001, components.precision);
        const recall = Math.max(0.001, components.recall);
        components.f1Score = 2 * (precision * recall) / (precision + recall);

        return components;
    }

    /**
     * Calculate accuracy reward based on correct predictions
     */
    private calculateAccuracyReward(predictions: TestImpact[], actualResults: TestResult[]): number {
        if (predictions.length === 0 || actualResults.length === 0) {
            return 0;
        }

        // Create prediction map for quick lookup
        const predictionMap = new Map<string, number>();
        for (const pred of predictions) {
            predictionMap.set(pred.testId, pred.impactScore);
        }

        let correctPredictions = 0;
        let totalPredictions = 0;

        for (const result of actualResults) {
            const predictedImpact = predictionMap.get(result.testId);
            if (predictedImpact !== undefined) {
                totalPredictions++;
                
                // Define correctness based on test outcome and predicted impact
                const highImpactThreshold = 0.5;
                const predictedHigh = predictedImpact > highImpactThreshold;
                const actuallyFailed = result.status === 'failed';
                
                if ((predictedHigh && actuallyFailed) || (!predictedHigh && !actuallyFailed)) {
                    correctPredictions++;
                }
            }
        }

        return totalPredictions > 0 ? correctPredictions / totalPredictions : 0;
    }

    /**
     * Calculate precision reward (true positives / (true positives + false positives))
     */
    private calculatePrecisionReward(predictions: TestImpact[], actualResults: TestResult[]): number {
        const { truePositives, falsePositives } = this.calculateConfusionMatrix(predictions, actualResults);
        
        const totalPositivePredictions = truePositives + falsePositives;
        return totalPositivePredictions > 0 ? truePositives / totalPositivePredictions : 0;
    }

    /**
     * Calculate recall reward (true positives / (true positives + false negatives))
     */
    private calculateRecallReward(predictions: TestImpact[], actualResults: TestResult[]): number {
        const { truePositives, falseNegatives } = this.calculateConfusionMatrix(predictions, actualResults);
        
        const totalActualPositives = truePositives + falseNegatives;
        return totalActualPositives > 0 ? truePositives / totalActualPositives : 0;
    }

    /**
     * Calculate efficiency reward based on test execution time and resource usage
     */
    private calculateEfficiencyReward(
        predictions: TestImpact[],
        actualResults: TestResult[],
        executionMetrics: any
    ): number {
        if (!executionMetrics || actualResults.length === 0) {
            return 0;
        }

        // Calculate time efficiency
        const totalExecutionTime = executionMetrics.totalTime || 0;
        const averageTestTime = totalExecutionTime / actualResults.length;
        const timeEfficiency = Math.max(0, 1 - averageTestTime / 5000); // Normalize to 5 seconds max

        // Calculate resource efficiency (fewer tests selected while maintaining coverage)
        const testReductionRatio = executionMetrics.testReductionRatio || 0;
        const coveragePreserved = executionMetrics.coveragePreserved || 0;
        const resourceEfficiency = testReductionRatio * coveragePreserved;

        return (timeEfficiency + resourceEfficiency) / 2;
    }

    /**
     * Calculate penalty for false positives
     */
    private calculateFalsePositivePenalty(predictions: TestImpact[], actualResults: TestResult[]): number {
        const { falsePositives } = this.calculateConfusionMatrix(predictions, actualResults);
        const totalPredictions = predictions.length;
        
        if (totalPredictions === 0) return 0;
        
        const falsePositiveRate = falsePositives / totalPredictions;
        return -falsePositiveRate * this.rewardWeights.falsePositivePenaltyWeight;
    }

    /**
     * Calculate penalty for false negatives
     */
    private calculateFalseNegativePenalty(predictions: TestImpact[], actualResults: TestResult[]): number {
        const { falseNegatives } = this.calculateConfusionMatrix(predictions, actualResults);
        const failedTests = actualResults.filter(r => r.status === 'failed').length;
        
        if (failedTests === 0) return 0;
        
        const falseNegativeRate = falseNegatives / failedTests;
       return -falseNegativeRate * this.rewardWeights.falseNegativePenaltyWeight;
   }

   /**
    * Calculate consistency bonus for actions that produce consistent results
    */
   private calculateConsistencyBonus(action: MDPAction, actualResults: TestResult[]): number {
       // Get recent rewards for this action type
       const recentRewards = this.rewardHistory
           .filter(signal => signal.action.type === action.type)
           .slice(-10) // Last 10 uses
           .map(signal => signal.reward);

       if (recentRewards.length < 3) {
           return 0; // Need sufficient history
       }

       // Calculate variance in rewards
       const mean = recentRewards.reduce((sum, r) => sum + r, 0) / recentRewards.length;
       const variance = recentRewards.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / recentRewards.length;
       const standardDeviation = Math.sqrt(variance);

       // Consistency bonus inversely related to variance
       const consistencyScore = Math.max(0, 1 - standardDeviation);
       return consistencyScore * this.rewardWeights.consistencyBonusWeight;
   }

   /**
    * Calculate exploration bonus to encourage trying new actions
    */
   private calculateExplorationBonus(action: MDPAction, state: MDPState): number {
       const explorationFactor = action.explorationFactor || 0;
       const usageCount = action.metadata?.usageCount || 0;
       
       // Bonus decreases with usage count (diminishing returns)
       const usagePenalty = Math.min(1, usageCount / 50); // Penalty grows up to 50 uses
       const explorationBonus = explorationFactor * (1 - usagePenalty);
       
       // Additional bonus for exploring in uncertain states
       const uncertainty = 1 - state.vector.historicalAccuracy;
       const uncertaintyBonus = uncertainty * 0.2;
       
       return (explorationBonus + uncertaintyBonus) * this.rewardWeights.explorationBonusWeight;
   }

   /**
    * Calculate improvement over baseline performance
    */
   private calculateBaselineImprovement(predictions: TestImpact[], actualResults: TestResult[]): number {
       if (!this.baselineMetrics) {
           return 0; // No baseline established yet
       }

       const currentF1 = this.calculateF1Score(predictions, actualResults);
       const improvement = currentF1 - this.baselineMetrics.f1Score;
       
       return improvement * this.rewardWeights.baselineImprovementWeight;
   }

   /**
    * Calculate confusion matrix components
    */
   private calculateConfusionMatrix(predictions: TestImpact[], actualResults: TestResult[]): ConfusionMatrix {
       const predictionMap = new Map<string, number>();
       for (const pred of predictions) {
           predictionMap.set(pred.testId, pred.impactScore);
       }

       let truePositives = 0;
       let falsePositives = 0;
       let trueNegatives = 0;
       let falseNegatives = 0;

       const impactThreshold = 0.5; // Threshold for considering a test "high impact"

       for (const result of actualResults) {
           const predictedImpact = predictionMap.get(result.testId) || 0;
           const predictedPositive = predictedImpact > impactThreshold;
           const actualPositive = result.status === 'failed';

           if (predictedPositive && actualPositive) {
               truePositives++;
           } else if (predictedPositive && !actualPositive) {
               falsePositives++;
           } else if (!predictedPositive && !actualPositive) {
               trueNegatives++;
           } else if (!predictedPositive && actualPositive) {
               falseNegatives++;
           }
       }

       return { truePositives, falsePositives, trueNegatives, falseNegatives };
   }

   /**
    * Calculate F1 score for current predictions
    */
   private calculateF1Score(predictions: TestImpact[], actualResults: TestResult[]): number {
       const precision = this.calculatePrecisionReward(predictions, actualResults);
       const recall = this.calculateRecallReward(predictions, actualResults);
       
       if (precision + recall === 0) return 0;
       return 2 * (precision * recall) / (precision + recall);
   }

   /**
    * Combine individual reward components using weighted sum
    */
   private combineRewardComponents(components: RewardComponents): number {
       const weights = this.rewardWeights;
       
       return (
           components.accuracy * weights.accuracyWeight +
           components.precision * weights.precisionWeight +
           components.recall * weights.recallWeight +
           components.f1Score * weights.f1ScoreWeight +
           components.efficiency * weights.efficiencyWeight +
           components.falsePositivePenalty + // Already negative
           components.falseNegativePenalty + // Already negative
           components.consistencyBonus +
           components.explorationBonus +
           components.baselineImprovement
       );
   }

   /**
    * Normalize reward to appropriate range
    */
   private normalizeReward(rawReward: number): number {
       // Apply sigmoid-like function to bound rewards
       const bounded = 2 / (1 + Math.exp(-rawReward)) - 1; // Range: [-1, 1]
       
       // Scale to desired range [-1, 1] where:
       // -1 = worst possible performance
       //  0 = baseline performance
       //  1 = perfect performance
       return Math.max(-1, Math.min(1, bounded));
   }

   /**
    * Initialize reward weights
    */
   private initializeRewardWeights(): RewardWeights {
       return {
           accuracyWeight: 0.2,
           precisionWeight: 0.2,
           recallWeight: 0.2,
           f1ScoreWeight: 0.3, // Highest weight for balanced metric
           efficiencyWeight: 0.1,
           falsePositivePenaltyWeight: 0.3,
           falseNegativePenaltyWeight: 0.4, // Higher penalty for missing failures
           consistencyBonusWeight: 0.1,
           explorationBonusWeight: 0.05,
           baselineImprovementWeight: 0.2
       };
   }

   /**
    * Update baseline metrics based on observed performance
    */
   public updateBaseline(predictions: TestImpact[], actualResults: TestResult[]): void {
       const newMetrics: BaselineMetrics = {
           accuracy: this.calculateAccuracyReward(predictions, actualResults),
           precision: this.calculatePrecisionReward(predictions, actualResults),
           recall: this.calculateRecallReward(predictions, actualResults),
           f1Score: this.calculateF1Score(predictions, actualResults),
           timestamp: new Date()
       };

       if (!this.baselineMetrics) {
           this.baselineMetrics = newMetrics;
       } else {
           // Update baseline using exponential moving average
           const alpha = 0.1; // Learning rate for baseline update
           this.baselineMetrics.accuracy = (1 - alpha) * this.baselineMetrics.accuracy + alpha * newMetrics.accuracy;
           this.baselineMetrics.precision = (1 - alpha) * this.baselineMetrics.precision + alpha * newMetrics.precision;
           this.baselineMetrics.recall = (1 - alpha) * this.baselineMetrics.recall + alpha * newMetrics.recall;
           this.baselineMetrics.f1Score = (1 - alpha) * this.baselineMetrics.f1Score + alpha * newMetrics.f1Score;
           this.baselineMetrics.timestamp = newMetrics.timestamp;
       }

       Logger.debug(`Updated baseline metrics: F1=${this.baselineMetrics.f1Score.toFixed(3)}`);
   }

   /**
    * Adapt reward weights based on learning progress
    */
   public adaptRewardWeights(learningProgress: LearningProgress): void {
       const accuracy = learningProgress.currentAccuracy;
       const improvement = learningProgress.recentImprovement;
       
       // Increase exploration bonus if accuracy is low
       if (accuracy < 0.7) {
           this.rewardWeights.explorationBonusWeight = Math.min(0.15, this.rewardWeights.explorationBonusWeight * 1.1);
       } else {
           this.rewardWeights.explorationBonusWeight = Math.max(0.02, this.rewardWeights.explorationBonusWeight * 0.95);
       }

       // Adjust penalty weights based on improvement rate
       if (improvement > 0.05) {
           // Learning is progressing well, maintain current weights
       } else if (improvement < -0.02) {
           // Performance is degrading, increase penalties
           this.rewardWeights.falsePositivePenaltyWeight *= 1.1;
           this.rewardWeights.falseNegativePenaltyWeight *= 1.1;
       }

       // Increase consistency bonus weight as model matures
       const maturityFactor = Math.min(1, learningProgress.episodeCount / 1000);
       this.rewardWeights.consistencyBonusWeight = 0.05 + 0.1 * maturityFactor;

       Logger.debug('Adapted reward weights based on learning progress');
   }

   /**
    * Get reward statistics for analysis
    */
   public getRewardStatistics(): RewardStatistics {
       if (this.rewardHistory.length === 0) {
           return {
               totalSignals: 0,
               averageReward: 0,
               rewardTrend: 0,
               bestReward: 0,
               worstReward: 0,
               recentAverage: 0,
               componentBreakdown: {}
           };
       }

       const rewards = this.rewardHistory.map(signal => signal.reward);
       const recentRewards = rewards.slice(-50); // Last 50 rewards
       
       const averageReward = rewards.reduce((sum, r) => sum + r, 0) / rewards.length;
       const recentAverage = recentRewards.reduce((sum, r) => sum + r, 0) / recentRewards.length;
       
       // Calculate trend (recent vs overall average)
       const rewardTrend = recentAverage - averageReward;

       // Calculate component breakdown from recent signals
       const recentSignals = this.rewardHistory.slice(-20);
       const componentBreakdown: Record<string, number> = {};
       
       if (recentSignals.length > 0) {
           const componentKeys = Object.keys(recentSignals[0].components);
           for (const key of componentKeys) {
               const values = recentSignals.map(s => s.components[key as keyof RewardComponents]);
               componentBreakdown[key] = values.reduce((sum, v) => sum + v, 0) / values.length;
           }
       }

       return {
           totalSignals: this.rewardHistory.length,
           averageReward,
           rewardTrend,
           bestReward: Math.max(...rewards),
           worstReward: Math.min(...rewards),
           recentAverage,
           componentBreakdown
       };
   }

   /**
    * Export reward history for analysis
    */
   public exportRewardHistory(): RewardSignal[] {
       return [...this.rewardHistory];
   }

   /**
    * Clear old reward history to manage memory
    */
   public clearOldHistory(keepRecent: number = 1000): void {
       if (this.rewardHistory.length > keepRecent) {
           this.rewardHistory = this.rewardHistory.slice(-keepRecent);
           Logger.debug(`Cleared old reward history, keeping ${keepRecent} recent signals`);
       }
   }

   /**
    * Get reward breakdown for a specific action type
    */
   public getRewardBreakdownByActionType(actionType: string): ComponentBreakdown {
       const relevantSignals = this.rewardHistory.filter(
           signal => signal.action.type === actionType
       );

       if (relevantSignals.length === 0) {
           return { count: 0, averageComponents: {} };
       }

       const averageComponents: Record<string, number> = {};
       const componentKeys = Object.keys(relevantSignals[0].components);

       for (const key of componentKeys) {
           const values = relevantSignals.map(s => s.components[key as keyof RewardComponents]);
           averageComponents[key] = values.reduce((sum, v) => sum + v, 0) / values.length;
       }

       return {
           count: relevantSignals.length,
           averageComponents
       };
   }
}

// Supporting interfaces
interface ConfusionMatrix {
   truePositives: number;
   falsePositives: number;
   trueNegatives: number;
   falseNegatives: number;
}

interface BaselineMetrics {
   accuracy: number;
   precision: number;
   recall: number;
   f1Score: number;
   timestamp: Date;
}

interface RewardWeights {
   accuracyWeight: number;
   precisionWeight: number;
   recallWeight: number;
   f1ScoreWeight: number;
   efficiencyWeight: number;
   falsePositivePenaltyWeight: number;
   falseNegativePenaltyWeight: number;
   consistencyBonusWeight: number;
   explorationBonusWeight: number;
   baselineImprovementWeight: number;
}

interface LearningProgress {
   currentAccuracy: number;
   recentImprovement: number;
   episodeCount: number;
}

interface RewardStatistics {
   totalSignals: number;
   averageReward: number;
   rewardTrend: number;
   bestReward: number;
   worstReward: number;
   recentAverage: number;
   componentBreakdown: Record<string, number>;
}

interface ComponentBreakdown {
   count: number;
   averageComponents: Record<string, number>;
}