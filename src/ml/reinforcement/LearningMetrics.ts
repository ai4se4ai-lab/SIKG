/**
 * LearningMetrics.ts - Learning progress tracking and metrics for SIKG RL
 * 
 * Tracks and analyzes learning progress including:
 * - Prediction accuracy over time
 * - Learning curve analysis
 * - Performance metrics
 * - Convergence detection
 * - Model confidence assessment
 */

import { Logger } from '../../utils/Logger';
import * as vscode from 'vscode';
import { 
    LearningEpisode, 
    LearningStatistics, 
    PerformanceMetrics,
    ConvergenceMetrics,
    LearningReport 
} from '../types/ReinforcementTypes';

export class LearningMetrics {
    private context: vscode.ExtensionContext;
    private episodes: LearningEpisode[] = [];
    private performanceHistory: PerformanceMetrics[] = [];
    private convergenceThreshold: number = 0.01;
    private windowSize: number = 50; // Episodes to consider for recent metrics

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.loadHistoricalData();
        Logger.debug('Learning metrics initialized');
    }

    /**
     * Record a new learning episode
     * @param episode Learning episode data
     */
    public async recordEpisode(episode: LearningEpisode): Promise<void> {
        this.episodes.push(episode);
        
        // Calculate performance metrics for this episode
        const metrics = await this.calculatePerformanceMetrics(episode);
        this.performanceHistory.push(metrics);

        // Keep only recent history to manage memory
        if (this.episodes.length > 10000) {
            this.episodes = this.episodes.slice(-5000);
            this.performanceHistory = this.performanceHistory.slice(-5000);
        }

        // Persist data
        await this.persistData();

        Logger.debug(`Recorded episode ${episode.episode} with accuracy ${episode.accuracy.toFixed(3)}`);
    }

    /**
     * Calculate performance metrics for an episode
     */
    private async calculatePerformanceMetrics(episode: LearningEpisode): Promise<PerformanceMetrics> {
        // Calculate precision, recall, F1 based on episode results
        const { precision, recall, f1Score } = this.calculateClassificationMetrics(episode);
        
        return {
            episode: episode.episode,
            timestamp: episode.timestamp,
            accuracy: episode.accuracy,
            precision: precision,
            recall: recall,
            f1Score: f1Score,
            reward: episode.reward,
            executionTime: episode.executionTime || 0,
            testsSaved: episode.testsSaved || 0,
            testsRun: episode.testsRun || 0,
            falsePositives: episode.falsePositives || 0,
            falseNegatives: episode.falseNegatives || 0,
            truePositives: episode.truePositives || 0,
            trueNegatives: episode.trueNegatives || 0
        };
    }

    /**
     * Calculate classification metrics from episode data
     */
    private calculateClassificationMetrics(episode: LearningEpisode): {
        precision: number;
        recall: number;
        f1Score: number;
    } {
        const tp = episode.truePositives || 0;
        const fp = episode.falsePositives || 0;
        const fn = episode.falseNegatives || 0;
        const tn = episode.trueNegatives || 0;

        const precision = (tp + fp) > 0 ? tp / (tp + fp) : 0;
        const recall = (tp + fn) > 0 ? tp / (tp + fn) : 0;
        const f1Score = (precision + recall) > 0 ? 2 * (precision * recall) / (precision + recall) : 0;

       return { precision, recall, f1Score };
   }

   /**
    * Get current learning statistics
    */
   public getCurrentStatistics(): LearningStatistics {
       if (this.episodes.length === 0) {
           return this.getEmptyStatistics();
       }

       const recentEpisodes = this.getRecentEpisodes();
       const allTimeMetrics = this.calculateAggregateMetrics(this.performanceHistory);
       const recentMetrics = this.calculateAggregateMetrics(
           this.performanceHistory.slice(-this.windowSize)
       );

       return {
           totalEpisodes: this.episodes.length,
           recentEpisodes: recentEpisodes.length,
           currentAccuracy: recentMetrics.accuracy,
           bestAccuracy: allTimeMetrics.bestAccuracy,
           averageAccuracy: allTimeMetrics.accuracy,
           currentF1Score: recentMetrics.f1Score,
           bestF1Score: allTimeMetrics.bestF1Score,
           averageF1Score: allTimeMetrics.f1Score,
           recentImprovement: this.calculateRecentImprovement(),
           learningRate: this.calculateLearningRate(),
           convergenceScore: this.calculateConvergenceScore(),
           stabilityScore: this.calculateStabilityScore(),
           lastUpdated: new Date()
       };
   }

   /**
    * Calculate aggregate metrics from performance history
    */
   private calculateAggregateMetrics(metrics: PerformanceMetrics[]): AggregateMetrics {
       if (metrics.length === 0) {
           return {
               accuracy: 0,
               precision: 0,
               recall: 0,
               f1Score: 0,
               bestAccuracy: 0,
               bestF1Score: 0,
               averageReward: 0
           };
       }

       const accuracy = metrics.reduce((sum, m) => sum + m.accuracy, 0) / metrics.length;
       const precision = metrics.reduce((sum, m) => sum + m.precision, 0) / metrics.length;
       const recall = metrics.reduce((sum, m) => sum + m.recall, 0) / metrics.length;
       const f1Score = metrics.reduce((sum, m) => sum + m.f1Score, 0) / metrics.length;
       const averageReward = metrics.reduce((sum, m) => sum + m.reward, 0) / metrics.length;

       const bestAccuracy = Math.max(...metrics.map(m => m.accuracy));
       const bestF1Score = Math.max(...metrics.map(m => m.f1Score));

       return {
           accuracy,
           precision,
           recall,
           f1Score,
           bestAccuracy,
           bestF1Score,
           averageReward
       };
   }

   /**
    * Calculate recent improvement trend
    */
   private calculateRecentImprovement(): number {
       if (this.performanceHistory.length < 20) {
           return 0;
       }

       const recent = this.performanceHistory.slice(-10);
       const previous = this.performanceHistory.slice(-20, -10);

       const recentAvg = recent.reduce((sum, m) => sum + m.f1Score, 0) / recent.length;
       const previousAvg = previous.reduce((sum, m) => sum + m.f1Score, 0) / previous.length;

       return recentAvg - previousAvg;
   }

   /**
    * Calculate learning rate (rate of improvement)
    */
   private calculateLearningRate(): number {
       if (this.performanceHistory.length < 10) {
           return 0;
       }

       // Calculate slope of performance over recent episodes
       const recentMetrics = this.performanceHistory.slice(-50);
       const n = recentMetrics.length;
       
       if (n < 2) return 0;

       let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
       
       for (let i = 0; i < n; i++) {
           const x = i;
           const y = recentMetrics[i].f1Score;
           sumX += x;
           sumY += y;
           sumXY += x * y;
           sumXX += x * x;
       }

       const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
       return slope;
   }

   /**
    * Calculate convergence score (how close to convergence)
    */
   private calculateConvergenceScore(): number {
       if (this.performanceHistory.length < this.windowSize) {
           return 0;
       }

       const recentMetrics = this.performanceHistory.slice(-this.windowSize);
       const f1Scores = recentMetrics.map(m => m.f1Score);
       
       // Calculate variance in recent F1 scores
       const mean = f1Scores.reduce((sum, score) => sum + score, 0) / f1Scores.length;
       const variance = f1Scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / f1Scores.length;
       const stdDev = Math.sqrt(variance);

       // Convergence score is inversely related to standard deviation
       return Math.max(0, 1 - stdDev / this.convergenceThreshold);
   }

   /**
    * Calculate stability score (consistency of performance)
    */
   private calculateStabilityScore(): number {
       if (this.performanceHistory.length < 20) {
           return 0;
       }

       const recentMetrics = this.performanceHistory.slice(-20);
       const rewards = recentMetrics.map(m => m.reward);
       
       // Calculate coefficient of variation for rewards
       const mean = rewards.reduce((sum, r) => sum + r, 0) / rewards.length;
       const variance = rewards.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / rewards.length;
       const stdDev = Math.sqrt(variance);
       
       const coefficientOfVariation = mean !== 0 ? stdDev / Math.abs(mean) : 0;
       
       // Stability score is inversely related to coefficient of variation
       return Math.max(0, 1 - coefficientOfVariation);
   }

   /**
    * Get recent episodes for analysis
    */
   private getRecentEpisodes(): LearningEpisode[] {
       return this.episodes.slice(-this.windowSize);
   }

   /**
    * Generate comprehensive learning report
    */
   public async getLearningReport(): Promise<LearningReport> {
       const statistics = this.getCurrentStatistics();
       const convergenceMetrics = this.getConvergenceMetrics();
       const trends = this.analyzeTrends();
       const recommendations = this.generateRecommendations(statistics, trends);

       return {
           summary: {
               totalEpisodes: statistics.totalEpisodes,
               currentPerformance: statistics.currentF1Score,
               bestPerformance: statistics.bestF1Score,
               improvementTrend: statistics.recentImprovement,
               convergenceStatus: this.getConvergenceStatus(convergenceMetrics)
           },
           statistics: statistics,
           convergenceMetrics: convergenceMetrics,
           trends: trends,
           recommendations: recommendations,
           charts: await this.generateChartData(),
           generatedAt: new Date()
       };
   }

   /**
    * Get convergence metrics
    */
   private getConvergenceMetrics(): ConvergenceMetrics {
       const windowSize = Math.min(100, this.performanceHistory.length);
       const recentMetrics = this.performanceHistory.slice(-windowSize);
       
       if (recentMetrics.length < 10) {
           return {
               isConverged: false,
               convergenceEpisode: null,
               plateauLength: 0,
               varianceReduction: 0,
               trendStability: 0
           };
       }

       // Check if performance has plateaued
       const f1Scores = recentMetrics.map(m => m.f1Score);
       const variance = this.calculateVariance(f1Scores);
       const isConverged = variance < this.convergenceThreshold;

       // Find convergence episode
       let convergenceEpisode: number | null = null;
       let plateauLength = 0;

       if (isConverged) {
           // Find when the plateau started
           for (let i = recentMetrics.length - 1; i >= 0; i--) {
               const windowVariance = this.calculateVariance(
                   f1Scores.slice(Math.max(0, i - 10), i + 1)
               );
               
               if (windowVariance < this.convergenceThreshold) {
                   plateauLength++;
                   convergenceEpisode = recentMetrics[i].episode;
               } else {
                   break;
               }
           }
       }

       // Calculate variance reduction over time
       const earlyVariance = this.calculateVariance(f1Scores.slice(0, Math.floor(f1Scores.length / 2)));
       const lateVariance = this.calculateVariance(f1Scores.slice(Math.floor(f1Scores.length / 2)));
       const varianceReduction = earlyVariance > 0 ? (earlyVariance - lateVariance) / earlyVariance : 0;

       // Calculate trend stability
       const trendStability = this.calculateStabilityScore();

       return {
           isConverged,
           convergenceEpisode,
           plateauLength,
           varianceReduction,
           trendStability
       };
   }

   /**
    * Calculate variance of an array
    */
   private calculateVariance(values: number[]): number {
       if (values.length < 2) return 0;
       
       const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
       const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
       
       return variance;
   }

   /**
    * Analyze performance trends
    */
   private analyzeTrends(): TrendAnalysis {
       const trends: TrendAnalysis = {
           accuracyTrend: 'stable',
           f1ScoreTrend: 'stable',
           rewardTrend: 'stable',
           learningRateTrend: 'stable',
           shortTermDirection: 'stable',
           longTermDirection: 'stable',
           cyclicalPatterns: []
       };

       if (this.performanceHistory.length < 20) {
           return trends;
       }

       // Analyze different metrics trends
       trends.accuracyTrend = this.analyzeSingleMetricTrend(
           this.performanceHistory.map(m => m.accuracy)
       );
       trends.f1ScoreTrend = this.analyzeSingleMetricTrend(
           this.performanceHistory.map(m => m.f1Score)
       );
       trends.rewardTrend = this.analyzeSingleMetricTrend(
           this.performanceHistory.map(m => m.reward)
       );

       // Analyze short-term vs long-term trends
       const recentF1 = this.performanceHistory.slice(-10).map(m => m.f1Score);
       const longTermF1 = this.performanceHistory.map(m => m.f1Score);
       
       trends.shortTermDirection = this.analyzeSingleMetricTrend(recentF1);
       trends.longTermDirection = this.analyzeSingleMetricTrend(longTermF1);

       // Detect cyclical patterns
       trends.cyclicalPatterns = this.detectCyclicalPatterns();

       return trends;
   }

   /**
    * Analyze trend for a single metric
    */
   private analyzeSingleMetricTrend(values: number[]): 'improving' | 'declining' | 'stable' {
       if (values.length < 5) return 'stable';

       const slope = this.calculateSlope(values);
       
       if (slope > 0.01) return 'improving';
       if (slope < -0.01) return 'declining';
       return 'stable';
   }

   /**
    * Calculate slope of a series of values
    */
   private calculateSlope(values: number[]): number {
       const n = values.length;
       if (n < 2) return 0;

       let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
       
       for (let i = 0; i < n; i++) {
           sumX += i;
           sumY += values[i];
           sumXY += i * values[i];
           sumXX += i * i;
       }

       return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
   }

   /**
    * Detect cyclical patterns in performance
    */
   private detectCyclicalPatterns(): CyclicalPattern[] {
       // Simplified cyclical pattern detection
       // In a full implementation, this would use FFT or autocorrelation
       const patterns: CyclicalPattern[] = [];
       
       if (this.performanceHistory.length < 50) {
           return patterns;
       }

       const f1Scores = this.performanceHistory.map(m => m.f1Score);
       
       // Look for patterns with different period lengths
       for (const period of [5, 10, 20]) {
           const correlation = this.calculateAutocorrelation(f1Scores, period);
           
           if (correlation > 0.3) {
               patterns.push({
                   period: period,
                   strength: correlation,
                   type: 'periodic'
               });
           }
       }

       return patterns;
   }

   /**
    * Calculate autocorrelation for pattern detection
    */
   private calculateAutocorrelation(values: number[], lag: number): number {
       if (values.length <= lag) return 0;

       const n = values.length - lag;
       let correlation = 0;
       
       const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
       
       for (let i = 0; i < n; i++) {
           correlation += (values[i] - mean) * (values[i + lag] - mean);
       }
       
       return correlation / n;
   }

   /**
    * Generate recommendations based on analysis
    */
   private generateRecommendations(
       statistics: LearningStatistics, 
       trends: TrendAnalysis
   ): string[] {
       const recommendations: string[] = [];

       // Performance recommendations
       if (statistics.currentF1Score < 0.7) {
           recommendations.push('Consider adjusting learning rate or exploration strategy - current F1-score is below optimal range');
       }

       if (statistics.recentImprovement < -0.05) {
           recommendations.push('Performance is declining - review recent changes and consider reverting to previous configuration');
       }

       if (statistics.convergenceScore > 0.8 && statistics.currentF1Score < 0.85) {
           recommendations.push('Model has converged to suboptimal performance - consider increasing exploration or adjusting reward function');
       }

       // Stability recommendations
       if (statistics.stabilityScore < 0.5) {
           recommendations.push('High performance variability detected - consider reducing learning rate or increasing regularization');
       }

       // Trend recommendations
       if (trends.accuracyTrend === 'declining' && trends.f1ScoreTrend === 'declining') {
           recommendations.push('Both accuracy and F1-score are declining - investigate recent changes to training data or environment');
       }

       if (trends.cyclicalPatterns.length > 0) {
           recommendations.push('Cyclical patterns detected - investigate if this corresponds to external factors or training schedule');
       }

       // Learning rate recommendations
       if (statistics.learningRate > 0.05) {
           recommendations.push('Learning rate appears high - consider gradual reduction for more stable learning');
       } else if (statistics.learningRate < 0.001) {
           recommendations.push('Learning rate may be too low - consider increasing if learning has stagnated');
       }

       return recommendations;
   }

   /**
    * Generate chart data for visualization
    */
   private async generateChartData(): Promise<ChartData> {
       const episodeNumbers = this.performanceHistory.map(m => m.episode);
       const accuracyValues = this.performanceHistory.map(m => m.accuracy);
       const f1Values = this.performanceHistory.map(m => m.f1Score);
       const rewardValues = this.performanceHistory.map(m => m.reward);

       return {
           learningCurve: {
               episodes: episodeNumbers,
               accuracy: accuracyValues,
               f1Score: f1Values,
               reward: rewardValues
           },
           recentTrend: {
               episodes: episodeNumbers.slice(-20),
               accuracy: accuracyValues.slice(-20),
               f1Score: f1Values.slice(-20)
           },
           distribution: {
               accuracyDistribution: this.calculateDistribution(accuracyValues),
               f1Distribution: this.calculateDistribution(f1Values),
               rewardDistribution: this.calculateDistribution(rewardValues)
           }
       };
   }

   /**
    * Calculate distribution for histogram data
    */
   private calculateDistribution(values: number[]): DistributionData {
       if (values.length === 0) {
           return { bins: [], counts: [], mean: 0, stdDev: 0 };
       }

       const min = Math.min(...values);
       const max = Math.max(...values);
       const binCount = Math.min(20, Math.max(5, Math.floor(values.length / 10)));
       const binWidth = (max - min) / binCount;

       const bins: number[] = [];
       const counts: number[] = [];

       for (let i = 0; i < binCount; i++) {
           bins.push(min + i * binWidth);
           counts.push(0);
       }

       // Count values in each bin
       for (const value of values) {
           const binIndex = Math.min(binCount - 1, Math.floor((value - min) / binWidth));
           counts[binIndex]++;
       }

       // Calculate statistics
       const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
       const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
       const stdDev = Math.sqrt(variance);

       return { bins, counts, mean, stdDev };
   }

   /**
    * Get convergence status description
    */
   private getConvergenceStatus(convergenceMetrics: ConvergenceMetrics): string {
       if (convergenceMetrics.isConverged) {
           return `Converged at episode ${convergenceMetrics.convergenceEpisode} (${convergenceMetrics.plateauLength} episodes stable)`;
       } else if (convergenceMetrics.plateauLength > 10) {
           return `Approaching convergence (${convergenceMetrics.plateauLength} stable episodes)`;
       } else {
           return 'Still learning - not yet converged';
       }
   }

   /**
    * Get empty statistics for initialization
    */
   private getEmptyStatistics(): LearningStatistics {
       return {
           totalEpisodes: 0,
           recentEpisodes: 0,
           currentAccuracy: 0,
           bestAccuracy: 0,
           averageAccuracy: 0,
           currentF1Score: 0,
           bestF1Score: 0,
           averageF1Score: 0,
           recentImprovement: 0,
           learningRate: 0,
           convergenceScore: 0,
           stabilityScore: 0,
           lastUpdated: new Date()
       };
   }

   /**
    * Load historical data from storage
    */
   private async loadHistoricalData(): Promise<void> {
       try {
           const episodeData = this.context.globalState.get<LearningEpisode[]>('sikg.learningEpisodes', []);
           const metricsData = this.context.globalState.get<PerformanceMetrics[]>('sikg.performanceMetrics', []);

           this.episodes = episodeData;
           this.performanceHistory = metricsData;

           Logger.debug(`Loaded ${this.episodes.length} learning episodes from storage`);
       } catch (error) {
           Logger.error('Error loading historical learning data:', error);
       }
   }

   /**
    * Persist data to storage
    */
   private async persistData(): Promise<void> {
       try {
           await this.context.globalState.update('sikg.learningEpisodes', this.episodes);
           await this.context.globalState.update('sikg.performanceMetrics', this.performanceHistory);
       } catch (error) {
           Logger.error('Error persisting learning data:', error);
       }
   }

   /**
    * Clear all learning data
    */
   public async clearHistory(): Promise<void> {
       this.episodes = [];
       this.performanceHistory = [];
       await this.persistData();
       Logger.info('Learning history cleared');
   }

   /**
    * Export learning data for analysis
    */
   public exportLearningData(): LearningDataExport {
       return {
           episodes: this.episodes,
           performanceHistory: this.performanceHistory,
           statistics: this.getCurrentStatistics(),
           convergenceMetrics: this.getConvergenceMetrics(),
           exportTimestamp: new Date()
       };
   }
}

// Supporting interfaces
interface AggregateMetrics {
   accuracy: number;
   precision: number;
   recall: number;
   f1Score: number;
   bestAccuracy: number;
   bestF1Score: number;
   averageReward: number;
}

interface TrendAnalysis {
   accuracyTrend: 'improving' | 'declining' | 'stable';
   f1ScoreTrend: 'improving' | 'declining' | 'stable';
   rewardTrend: 'improving' | 'declining' | 'stable';
   learningRateTrend: 'improving' | 'declining' | 'stable';
   shortTermDirection: 'improving' | 'declining' | 'stable';
   longTermDirection: 'improving' | 'declining' | 'stable';
   cyclicalPatterns: CyclicalPattern[];
}

interface CyclicalPattern {
   period: number;
   strength: number;
   type: 'periodic' | 'seasonal';
}

interface ChartData {
   learningCurve: {
       episodes: number[];
       accuracy: number[];
       f1Score: number[];
       reward: number[];
   };
   recentTrend: {
       episodes: number[];
       accuracy: number[];
       f1Score: number[];
   };
   distribution: {
       accuracyDistribution: DistributionData;
       f1Distribution: DistributionData;
       rewardDistribution: DistributionData;
   };
}

interface DistributionData {
   bins: number[];
   counts: number[];
   mean: number;
   stdDev: number;
}

interface LearningDataExport {
   episodes: LearningEpisode[];
   performanceHistory: PerformanceMetrics[];
   statistics: LearningStatistics;
   convergenceMetrics: ConvergenceMetrics;
   exportTimestamp: Date;
}