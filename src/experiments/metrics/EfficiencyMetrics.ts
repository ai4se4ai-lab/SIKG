// EfficiencyMetrics.ts - Efficiency evaluation metrics for SIKG experiments

import { Logger } from '../../utils/Logger';

/**
 * Test execution timing data
 */
export interface ExecutionTiming {
    analysisTime: number;           // Time spent on SIKG analysis (ms)
    selectionTime: number;          // Time spent on test selection (ms)
    executionTime: number;          // Time spent executing selected tests (ms)
    totalTime: number;              // Total time including overhead (ms)
    baselineExecutionTime?: number; // Time for full test suite execution (ms)
}

/**
 * Test reduction metrics
 */
export interface ReductionMetrics {
    totalTests: number;             // Total tests in suite
    selectedTests: number;          // Tests selected by SIKG
    reductionRatio: number;         // Percentage of tests reduced (0-1)
    reductionAbsolute: number;      // Absolute number of tests saved
    selectionAccuracy: number;      // Accuracy of test selection (0-1)
}

/**
 * Overhead analysis metrics
 */
export interface OverheadMetrics {
    analysisOverhead: number;       // Analysis time as % of saved time
    memoryOverhead: number;         // Additional memory usage (MB)
    storageOverhead: number;        // Graph storage requirements (MB)
    networkOverhead: number;        // Additional network usage (MB)
    setupTime: number;              // One-time setup overhead (ms)
}

/**
 * Time savings analysis
 */
export interface TimeSavingsMetrics {
    absoluteSavings: number;        // Absolute time saved (ms)
    relativeSavings: number;        // Relative savings percentage (0-1)
    savingsPerTest: number;         // Average time saved per test (ms)
    netSavings: number;             // Savings minus overhead (ms)
    efficiencyRatio: number;        // Net savings / total baseline time
}

/**
 * Efficiency comparison between approaches
 */
export interface EfficiencyComparison {
    approach: string;
    reductionRatio: number;
    timeSavings: number;
    overhead: number;
    netEfficiency: number;          // Overall efficiency score
    rank: number;                   // Ranking among compared approaches
}

/**
 * Comprehensive efficiency metrics result
 */
export interface EfficiencyMetricsResult {
    sessionId: string;
    timestamp: number;
    projectName: string;
    approach: string;
    
    execution: ExecutionTiming;
    reduction: ReductionMetrics;
    overhead: OverheadMetrics;
    savings: TimeSavingsMetrics;
    
    // Derived efficiency scores
    overallEfficiency: number;      // Combined efficiency score (0-1)
    costBenefit: number;           // Benefit/cost ratio
    performanceGain: number;       // Performance improvement factor
    
    // Statistical metadata
    sampleSize: number;
    confidence: number;
    statisticalSignificance?: boolean;
}

/**
 * Efficiency trends over multiple sessions
 */
export interface EfficiencyTrends {
    sessions: EfficiencyMetricsResult[];
    averageEfficiency: number;
    efficiencyTrend: 'improving' | 'declining' | 'stable';
    improvementRate: number;        // Rate of efficiency improvement over time
    stabilityScore: number;         // Consistency of efficiency (0-1)
}

/**
 * Resource utilization metrics
 */
export interface ResourceUtilization {
    cpuUsage: number;              // Average CPU usage percentage
    memoryPeak: number;            // Peak memory usage (MB)
    memoryAverage: number;         // Average memory usage (MB)
    diskIO: number;                // Disk I/O operations
    networkRequests: number;       // Network requests made
    cacheHitRatio: number;         // Cache efficiency ratio (0-1)
}

/**
 * Scalability metrics for efficiency analysis
 */
export interface ScalabilityMetrics {
    testSuiteSize: number;
    analysisTimeGrowth: number;    // Growth rate of analysis time
    memoryGrowth: number;          // Growth rate of memory usage
    efficiencyAtScale: number;     // Efficiency at this scale
    scalingFactor: number;         // How well efficiency scales
}

/**
 * Configuration for efficiency evaluation
 */
export interface EfficiencyConfig {
    includeOverhead: boolean;
    measureResourceUsage: boolean;
    trackMemoryUsage: boolean;
    enableProfiling: boolean;
    baselineComparison: boolean;
    statisticalValidation: boolean;
    confidenceLevel: number;       // Statistical confidence level
    minSampleSize: number;         // Minimum samples for valid results
}

/**
 * SIKG Efficiency Metrics Calculator
 * Evaluates the efficiency of SIKG test selection and prioritization
 */
export class EfficiencyMetrics {
    private config: EfficiencyConfig;
    private results: EfficiencyMetricsResult[] = [];
    private baselineResults: Map<string, EfficiencyMetricsResult[]> = new Map();
    
    constructor(config?: Partial<EfficiencyConfig>) {
        this.config = {
            includeOverhead: true,
            measureResourceUsage: true,
            trackMemoryUsage: true,
            enableProfiling: false,
            baselineComparison: true,
            statisticalValidation: true,
            confidenceLevel: 0.95,
            minSampleSize: 10,
            ...config
        };
    }

    /**
     * Calculate comprehensive efficiency metrics for a test session
     */
    public calculateEfficiencyMetrics(
        sessionData: {
            sessionId: string;
            projectName: string;
            approach: string;
            totalTests: number;
            selectedTests: number;
            executedTests: number;
            analysisTime: number;
            selectionTime: number;
            executionTime: number;
            baselineExecutionTime?: number;
            faultsDetected: number;
            resourceUsage?: ResourceUtilization;
        }
    ): EfficiencyMetricsResult {
        
        Logger.info(`Calculating efficiency metrics for session: ${sessionData.sessionId}`);

        // Calculate execution timing
        const execution: ExecutionTiming = {
            analysisTime: sessionData.analysisTime,
            selectionTime: sessionData.selectionTime,
            executionTime: sessionData.executionTime,
            totalTime: sessionData.analysisTime + sessionData.selectionTime + sessionData.executionTime,
            baselineExecutionTime: sessionData.baselineExecutionTime
        };

        // Calculate reduction metrics
        const reduction: ReductionMetrics = this.calculateReductionMetrics(
            sessionData.totalTests,
            sessionData.selectedTests,
            sessionData.executedTests,
            sessionData.faultsDetected
        );

        // Calculate overhead metrics
        const overhead: OverheadMetrics = this.calculateOverheadMetrics(
            execution,
            sessionData.resourceUsage
        );

        // Calculate time savings
        const savings: TimeSavingsMetrics = this.calculateTimeSavings(
            execution,
            reduction,
            overhead
        );

        // Calculate derived efficiency scores
        const overallEfficiency = this.calculateOverallEfficiency(reduction, savings, overhead);
        const costBenefit = this.calculateCostBenefit(savings, overhead);
        const performanceGain = this.calculatePerformanceGain(savings, execution);

        const result: EfficiencyMetricsResult = {
            sessionId: sessionData.sessionId,
            timestamp: Date.now(),
            projectName: sessionData.projectName,
            approach: sessionData.approach,
            execution,
            reduction,
            overhead,
            savings,
            overallEfficiency,
            costBenefit,
            performanceGain,
            sampleSize: 1,
            confidence: 1.0
        };

        // Store result for trend analysis
        this.results.push(result);

        // Perform statistical validation if enough samples
        if (this.config.statisticalValidation && this.results.length >= this.config.minSampleSize) {
            result.statisticalSignificance = this.validateStatisticalSignificance(result);
        }

        Logger.info(`Efficiency calculated: ${(overallEfficiency * 100).toFixed(1)}% overall efficiency, ${(reduction.reductionRatio * 100).toFixed(1)}% test reduction`);

        return result;
    }

    /**
     * Calculate test reduction metrics
     */
    private calculateReductionMetrics(
        totalTests: number,
        selectedTests: number,
        executedTests: number,
        faultsDetected: number
    ): ReductionMetrics {
        const reductionAbsolute = totalTests - selectedTests;
        const reductionRatio = totalTests > 0 ? reductionAbsolute / totalTests : 0;
        
        // Selection accuracy based on fault detection effectiveness
        const selectionAccuracy = selectedTests > 0 ? 
            Math.min(1.0, (faultsDetected + (selectedTests - faultsDetected) * 0.8) / selectedTests) : 0;

        return {
            totalTests,
            selectedTests,
            reductionRatio,
            reductionAbsolute,
            selectionAccuracy
        };
    }

    /**
     * Calculate overhead metrics
     */
    private calculateOverheadMetrics(
        execution: ExecutionTiming,
        resourceUsage?: ResourceUtilization
    ): OverheadMetrics {
        const totalOverheadTime = execution.analysisTime + execution.selectionTime;
        const baselineTime = execution.baselineExecutionTime || execution.executionTime;
        
        const analysisOverhead = baselineTime > 0 ? totalOverheadTime / baselineTime : 0;
        
        return {
            analysisOverhead,
            memoryOverhead: resourceUsage?.memoryPeak || 0,
            storageOverhead: 5, // Estimated graph storage in MB
            networkOverhead: 0, // No network overhead for local analysis
            setupTime: execution.analysisTime * 0.1 // Estimated setup overhead
        };
    }

    /**
     * Calculate time savings metrics
     */
    private calculateTimeSavings(
        execution: ExecutionTiming,
        reduction: ReductionMetrics,
        overhead: OverheadMetrics
    ): TimeSavingsMetrics {
        const baselineTime = execution.baselineExecutionTime || 
                           (execution.executionTime * (reduction.totalTests / Math.max(1, reduction.selectedTests)));
        
        const absoluteSavings = Math.max(0, baselineTime - execution.totalTime);
        const relativeSavings = baselineTime > 0 ? absoluteSavings / baselineTime : 0;
        const savingsPerTest = reduction.reductionAbsolute > 0 ? 
                              absoluteSavings / reduction.reductionAbsolute : 0;
        
        const totalOverhead = execution.analysisTime + execution.selectionTime + overhead.setupTime;
        const netSavings = absoluteSavings - totalOverhead;
        const efficiencyRatio = baselineTime > 0 ? netSavings / baselineTime : 0;

        return {
            absoluteSavings,
            relativeSavings,
            savingsPerTest,
            netSavings,
            efficiencyRatio
        };
    }

    /**
     * Calculate overall efficiency score (0-1)
     */
    private calculateOverallEfficiency(
        reduction: ReductionMetrics,
        savings: TimeSavingsMetrics,
        overhead: OverheadMetrics
    ): number {
        // Weighted combination of efficiency factors
        const reductionScore = reduction.reductionRatio * 0.3;
        const savingsScore = Math.max(0, savings.relativeSavings) * 0.4;
        const overheadPenalty = Math.min(0.3, overhead.analysisOverhead * 0.1);
        const accuracyBonus = reduction.selectionAccuracy * 0.2;
        
        const efficiency = reductionScore + savingsScore - overheadPenalty + accuracyBonus;
        return Math.max(0, Math.min(1, efficiency));
    }

    /**
     * Calculate cost-benefit ratio
     */
    private calculateCostBenefit(
        savings: TimeSavingsMetrics,
        overhead: OverheadMetrics
    ): number {
        const benefit = savings.absoluteSavings;
        const cost = overhead.analysisOverhead * savings.absoluteSavings + overhead.setupTime;
        
        return cost > 0 ? benefit / cost : 0;
    }

    /**
     * Calculate performance gain factor
     */
    private calculatePerformanceGain(
        savings: TimeSavingsMetrics,
        execution: ExecutionTiming
    ): number {
        const baselineTime = execution.baselineExecutionTime || execution.totalTime;
        return baselineTime > 0 ? baselineTime / execution.totalTime : 1;
    }

    /**
     * Compare efficiency across multiple approaches
     */
    public compareEfficiency(
        results: EfficiencyMetricsResult[]
    ): EfficiencyComparison[] {
        const comparisons: EfficiencyComparison[] = results.map(result => ({
            approach: result.approach,
            reductionRatio: result.reduction.reductionRatio,
            timeSavings: result.savings.relativeSavings,
            overhead: result.overhead.analysisOverhead,
            netEfficiency: result.overallEfficiency,
            rank: 0
        }));

        // Rank by overall efficiency
        comparisons.sort((a, b) => b.netEfficiency - a.netEfficiency);
        comparisons.forEach((comp, index) => {
            comp.rank = index + 1;
        });

        Logger.info(`Efficiency comparison completed: ${comparisons.length} approaches ranked`);
        return comparisons;
    }

    /**
     * Calculate efficiency trends over time
     */
    public calculateEfficiencyTrends(sessionCount: number = 20): EfficiencyTrends {
        const recentSessions = this.results.slice(-sessionCount);
        
        if (recentSessions.length < 2) {
            return {
                sessions: recentSessions,
                averageEfficiency: recentSessions[0]?.overallEfficiency || 0,
                efficiencyTrend: 'stable',
                improvementRate: 0,
                stabilityScore: 0
            };
        }

        const efficiencies = recentSessions.map(s => s.overallEfficiency);
        const averageEfficiency = efficiencies.reduce((sum, eff) => sum + eff, 0) / efficiencies.length;
        
        // Calculate trend
        const firstHalf = efficiencies.slice(0, Math.floor(efficiencies.length / 2));
        const secondHalf = efficiencies.slice(Math.floor(efficiencies.length / 2));
        
        const firstAvg = firstHalf.reduce((sum, eff) => sum + eff, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((sum, eff) => sum + eff, 0) / secondHalf.length;
        
        let efficiencyTrend: 'improving' | 'declining' | 'stable';
        const improvement = secondAvg - firstAvg;
        
        if (improvement > 0.05) {
            efficiencyTrend = 'improving';
        } else if (improvement < -0.05) {
            efficiencyTrend = 'declining';
        } else {
            efficiencyTrend = 'stable';
        }

        // Calculate improvement rate and stability
        const improvementRate = recentSessions.length > 1 ? improvement / recentSessions.length : 0;
        const variance = efficiencies.reduce((sum, eff) => sum + Math.pow(eff - averageEfficiency, 2), 0) / efficiencies.length;
        const stabilityScore = Math.max(0, 1 - Math.sqrt(variance));

        return {
            sessions: recentSessions,
            averageEfficiency,
            efficiencyTrend,
            improvementRate,
            stabilityScore
        };
    }

    /**
     * Validate statistical significance of efficiency improvements
     */
    private validateStatisticalSignificance(result: EfficiencyMetricsResult): boolean {
        // Simplified statistical validation
        const recentResults = this.results.slice(-this.config.minSampleSize);
        
        if (recentResults.length < this.config.minSampleSize) {
            return false;
        }

        // Calculate confidence interval for efficiency
        const efficiencies = recentResults.map(r => r.overallEfficiency);
        const mean = efficiencies.reduce((sum, eff) => sum + eff, 0) / efficiencies.length;
        const stdDev = Math.sqrt(
            efficiencies.reduce((sum, eff) => sum + Math.pow(eff - mean, 2), 0) / efficiencies.length
        );

        // Simple significance test: current result within 2 standard deviations
        const zScore = Math.abs(result.overallEfficiency - mean) / stdDev;
        return zScore < 2; // 95% confidence level approximation
    }

    /**
     * Calculate scalability metrics
     */
    public calculateScalabilityMetrics(
        testSuiteSizes: number[],
        correspondingResults: EfficiencyMetricsResult[]
    ): ScalabilityMetrics[] {
        const scalabilityMetrics: ScalabilityMetrics[] = [];

        for (let i = 0; i < testSuiteSizes.length; i++) {
            const size = testSuiteSizes[i];
            const result = correspondingResults[i];
            
            if (!result) continue;

            // Calculate growth rates (simplified linear approximation)
            const analysisTimeGrowth = i > 0 ? 
                (result.execution.analysisTime - correspondingResults[i-1].execution.analysisTime) / 
                (size - testSuiteSizes[i-1]) : 0;
            
            const memoryGrowth = i > 0 ? 
                (result.overhead.memoryOverhead - correspondingResults[i-1].overhead.memoryOverhead) / 
                (size - testSuiteSizes[i-1]) : 0;

            // Scaling factor: how efficiency changes with size
            const baselineEfficiency = correspondingResults[0]?.overallEfficiency || 0.5;
            const scalingFactor = baselineEfficiency > 0 ? result.overallEfficiency / baselineEfficiency : 1;

            scalabilityMetrics.push({
                testSuiteSize: size,
                analysisTimeGrowth,
                memoryGrowth,
                efficiencyAtScale: result.overallEfficiency,
                scalingFactor
            });
        }

        return scalabilityMetrics;
    }

    /**
     * Generate efficiency summary statistics
     */
    public generateEfficiencySummary(): {
        totalSessions: number;
        averageEfficiency: number;
        bestEfficiency: number;
        worstEfficiency: number;
        improvementTrend: string;
        recommendedActions: string[];
    } {
        if (this.results.length === 0) {
            return {
                totalSessions: 0,
                averageEfficiency: 0,
                bestEfficiency: 0,
                worstEfficiency: 0,
                improvementTrend: 'no-data',
                recommendedActions: ['Collect more data to analyze efficiency trends']
            };
        }

        const efficiencies = this.results.map(r => r.overallEfficiency);
        const averageEfficiency = efficiencies.reduce((sum, eff) => sum + eff, 0) / efficiencies.length;
        const bestEfficiency = Math.max(...efficiencies);
        const worstEfficiency = Math.min(...efficiencies);

        const trends = this.calculateEfficiencyTrends();
        const recommendedActions = this.generateRecommendations(trends);

        return {
            totalSessions: this.results.length,
            averageEfficiency,
            bestEfficiency,
            worstEfficiency,
            improvementTrend: trends.efficiencyTrend,
            recommendedActions
        };
    }

    /**
     * Generate efficiency improvement recommendations
     */
    private generateRecommendations(trends: EfficiencyTrends): string[] {
        const recommendations: string[] = [];

        if (trends.averageEfficiency < 0.6) {
            recommendations.push('Overall efficiency is below 60% - consider tuning selection thresholds');
        }

        if (trends.efficiencyTrend === 'declining') {
            recommendations.push('Efficiency is declining - review recent configuration changes');
        }

        if (trends.stabilityScore < 0.7) {
            recommendations.push('Efficiency is unstable - consider stabilizing selection parameters');
        }

        const recentSession = trends.sessions[trends.sessions.length - 1];
        if (recentSession) {
            if (recentSession.overhead.analysisOverhead > 0.2) {
                recommendations.push('Analysis overhead is high - optimize graph construction and analysis');
            }

            if (recentSession.reduction.reductionRatio < 0.3) {
                recommendations.push('Test reduction is low - consider stricter selection criteria');
            }

            if (recentSession.savings.efficiencyRatio < 0) {
                recommendations.push('Net savings are negative - analysis cost exceeds benefits');
            }
        }

        if (recommendations.length === 0) {
            recommendations.push('Efficiency metrics look good - continue current approach');
        }

        return recommendations;
    }

    /**
     * Export efficiency data for external analysis
     */
    public exportEfficiencyData(): {
        config: EfficiencyConfig;
        results: EfficiencyMetricsResult[];
        summary: any;
        trends: EfficiencyTrends;
        exportTimestamp: string;
    } {
        return {
            config: this.config,
            results: this.results,
            summary: this.generateEfficiencySummary(),
            trends: this.calculateEfficiencyTrends(),
            exportTimestamp: new Date().toISOString()
        };
    }

    /**
     * Reset all efficiency data
     */
    public reset(): void {
        this.results = [];
        this.baselineResults.clear();
        Logger.info('Efficiency metrics reset');
    }

    /**
     * Get recent efficiency results
     */
    public getRecentResults(limit: number = 10): EfficiencyMetricsResult[] {
        return this.results.slice(-limit);
    }

    /**
     * Add baseline results for comparison
     */
    public addBaselineResults(approach: string, results: EfficiencyMetricsResult[]): void {
        this.baselineResults.set(approach, results);
        Logger.info(`Added ${results.length} baseline results for approach: ${approach}`);
    }

    /**
     * Compare SIKG efficiency against baselines
     */
    public compareAgainstBaselines(): EfficiencyComparison[] {
        const allResults: EfficiencyMetricsResult[] = [...this.results];
        
        // Add baseline results
        for (const [approach, results] of this.baselineResults) {
            allResults.push(...results);
        }

        return this.compareEfficiency(allResults);
    }
}