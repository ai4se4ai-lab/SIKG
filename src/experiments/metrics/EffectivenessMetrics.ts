// EffectivenessMetrics.ts - Test selection effectiveness calculation for SIKG experiments

import { Logger } from '../../utils/Logger';
import { APFDCalculator, APFDResult } from '../../sikg/evaluation/APFDCalculator';

/**
 * Test execution result for effectiveness calculation
 */
export interface TestExecutionResult {
    testId: string;
    selected: boolean;
    executed: boolean;
    status: 'passed' | 'failed' | 'skipped' | 'error';
    executionTime: number;
    technique: string;
    iteration: number;
    commit: string;
    faultDetected: boolean;
    predictedImpact?: number;
    actualImpact?: number;
}

/**
 * Fault information for effectiveness analysis
 */
export interface FaultInfo {
    faultId: string;
    commit: string;
    affectedFiles: string[];
    detectedByTests: string[];
    severity: 'low' | 'medium' | 'high' | 'critical';
    faultType: 'logic' | 'integration' | 'performance' | 'security' | 'other';
}

/**
 * Effectiveness metrics for a single technique
 */
export interface TechniqueEffectiveness {
    technique: string;
    iteration: number;
    commit: string;
    
    // Primary effectiveness metrics
    precision: number;              // TP / (TP + FP)
    recall: number;                 // TP / (TP + FN)
    f1Score: number;               // 2 * (precision * recall) / (precision + recall)
    specificity: number;           // TN / (TN + FP)
    accuracy: number;              // (TP + TN) / (TP + TN + FP + FN)
    
    // Test selection metrics
    totalTests: number;
    selectedTests: number;
    executedTests: number;
    selectionRatio: number;        // selectedTests / totalTests
    
    // Fault detection metrics
    faultsDetected: number;
    totalFaults: number;
    faultDetectionRate: number;    // faultsDetected / totalFaults
    
    // APFD metrics
    apfd: number;
    apfdResult?: APFDResult;
    
    // Time and efficiency
    totalExecutionTime: number;
    averageTestTime: number;
    analysisTime: number;
    
    // Confusion matrix values
    truePositives: number;
    falsePositives: number;
    trueNegatives: number;
    falseNegatives: number;
    
    // Additional metrics
    matthewsCorrelationCoefficient: number;  // MCC
    balancedAccuracy: number;               // (sensitivity + specificity) / 2
    informedness: number;                   // sensitivity + specificity - 1
    markedness: number;                     // precision + npv - 1
}

/**
 * Comparative effectiveness analysis
 */
export interface ComparativeEffectiveness {
    baseline: string;
    sikg: string;
    metric: string;
    baselineValue: number;
    sikgValue: number;
    improvement: number;           // (sikg - baseline) / baseline
    absoluteImprovement: number;   // sikg - baseline
    statisticallySignificant: boolean;
    pValue: number;
    effectSize: number;           // Cohen's d
    confidenceInterval: [number, number];
}

/**
 * Trend analysis for effectiveness over time
 */
export interface EffectivenessTrend {
    technique: string;
    metric: string;
    trend: 'improving' | 'declining' | 'stable';
    slope: number;                // Linear regression slope
    rSquared: number;            // Goodness of fit
    changeRate: number;          // Average change per iteration
    volatility: number;          // Standard deviation of changes
    significance: number;        // Trend significance (p-value)
}

/**
 * Effectiveness analysis configuration
 */
export interface EffectivenessConfig {
    calculateAPFD: boolean;
    includeTimeMetrics: boolean;
    includeTrendAnalysis: boolean;
    minimumIterations: number;
    significanceLevel: number;    // For statistical tests (default: 0.05)
    effectSizeThreshold: number;  // Minimum effect size to consider meaningful
    trendWindow: number;         // Number of iterations for trend analysis
}

/**
 * Main effectiveness metrics calculator for SIKG experiments
 */
export class EffectivenessMetrics {
    private apfdCalculator: APFDCalculator;
    private config: EffectivenessConfig;

    constructor(config?: Partial<EffectivenessConfig>) {
        this.apfdCalculator = new APFDCalculator();
        this.config = {
            calculateAPFD: true,
            includeTimeMetrics: true,
            includeTrendAnalysis: true,
            minimumIterations: 3,
            significanceLevel: 0.05,
            effectSizeThreshold: 0.2,
            trendWindow: 10,
            ...config
        };
    }

    /**
     * Calculate effectiveness metrics for a single technique iteration
     */
    public calculateTechniqueEffectiveness(
        results: TestExecutionResult[],
        faults: FaultInfo[],
        technique: string,
        iteration: number,
        commit: string
    ): TechniqueEffectiveness {
        Logger.debug(`Calculating effectiveness for ${technique} iteration ${iteration}`);

        try {
            // Filter results for this technique
            const techniqueResults = results.filter(r => r.technique === technique);
            
            if (techniqueResults.length === 0) {
                throw new Error(`No results found for technique: ${technique}`);
            }

            // Calculate basic metrics
            const totalTests = techniqueResults.length;
            const selectedTests = techniqueResults.filter(r => r.selected).length;
            const executedTests = techniqueResults.filter(r => r.executed).length;
            const selectionRatio = totalTests > 0 ? selectedTests / totalTests : 0;

            // Calculate confusion matrix
            const confusionMatrix = this.calculateConfusionMatrix(techniqueResults, faults);
            const { truePositives, falsePositives, trueNegatives, falseNegatives } = confusionMatrix;

            // Calculate primary effectiveness metrics
            const precision = this.calculatePrecision(truePositives, falsePositives);
            const recall = this.calculateRecall(truePositives, falseNegatives);
            const f1Score = this.calculateF1Score(precision, recall);
            const specificity = this.calculateSpecificity(trueNegatives, falsePositives);
            const accuracy = this.calculateAccuracy(truePositives, trueNegatives, falsePositives, falseNegatives);

            // Calculate fault detection metrics
            const faultMetrics = this.calculateFaultDetectionMetrics(techniqueResults, faults);

            // Calculate APFD if enabled
            let apfd = 0;
            let apfdResult: APFDResult | undefined;
            if (this.config.calculateAPFD) {
                const testExecutions = techniqueResults.map(r => ({
                    testId: r.testId,
                    status: r.status,
                    executionTime: r.executionTime,
                    timestamp: new Date(),
                    predictedImpact: r.predictedImpact || 0,
                    wasFaultDetected: r.faultDetected
                }));
                
                apfdResult = this.apfdCalculator.calculateAPFD(testExecutions);
                apfd = apfdResult.apfd;
            }

            // Calculate time metrics
            const timeMetrics = this.calculateTimeMetrics(techniqueResults);

            // Calculate advanced metrics
            const mcc = this.calculateMatthewsCorrelationCoefficient(
                truePositives, trueNegatives, falsePositives, falseNegatives
            );
            const balancedAccuracy = (recall + specificity) / 2;
            const informedness = recall + specificity - 1;
            const npv = this.calculateNegativePredictiveValue(trueNegatives, falseNegatives);
            const markedness = precision + npv - 1;

            const effectiveness: TechniqueEffectiveness = {
                technique,
                iteration,
                commit,
                
                // Primary metrics
                precision,
                recall,
                f1Score,
                specificity,
                accuracy,
                
                // Test selection metrics
                totalTests,
                selectedTests,
                executedTests,
                selectionRatio,
                
                // Fault detection metrics
                faultsDetected: faultMetrics.faultsDetected,
                totalFaults: faultMetrics.totalFaults,
                faultDetectionRate: faultMetrics.faultDetectionRate,
                
                // APFD metrics
                apfd,
                apfdResult,
                
                // Time metrics
                totalExecutionTime: timeMetrics.totalExecutionTime,
                averageTestTime: timeMetrics.averageTestTime,
                analysisTime: timeMetrics.analysisTime,
                
                // Confusion matrix
                truePositives,
                falsePositives,
                trueNegatives,
                falseNegatives,
                
                // Advanced metrics
                matthewsCorrelationCoefficient: mcc,
                balancedAccuracy,
                informedness,
                markedness
            };

            Logger.debug(`Effectiveness calculated: F1=${f1Score.toFixed(3)}, APFD=${apfd.toFixed(3)}, FDR=${faultMetrics.faultDetectionRate.toFixed(3)}`);
            return effectiveness;

        } catch (error) {
            Logger.error(`Error calculating effectiveness for ${technique}:`, error);
            throw error;
        }
    }

    /**
     * Calculate comparative effectiveness between techniques
     */
    public calculateComparativeEffectiveness(
        baselineResults: TechniqueEffectiveness[],
        sikgResults: TechniqueEffectiveness[],
        baseline: string = 'baseline',
        sikg: string = 'SIKG'
    ): ComparativeEffectiveness[] {
        Logger.info(`Calculating comparative effectiveness: ${baseline} vs ${sikg}`);

        const comparisons: ComparativeEffectiveness[] = [];
        const metrics = ['precision', 'recall', 'f1Score', 'apfd', 'faultDetectionRate', 'accuracy'];

        for (const metric of metrics) {
            try {
                const baselineValues = baselineResults.map(r => (r as any)[metric]).filter(v => v !== undefined);
                const sikgValues = sikgResults.map(r => (r as any)[metric]).filter(v => v !== undefined);

                if (baselineValues.length === 0 || sikgValues.length === 0) {
                    Logger.warn(`Insufficient data for metric ${metric}`);
                    continue;
                }

                const baselineValue = this.calculateMean(baselineValues);
                const sikgValue = this.calculateMean(sikgValues);
                const improvement = baselineValue > 0 ? (sikgValue - baselineValue) / baselineValue : 0;
                const absoluteImprovement = sikgValue - baselineValue;

                // Statistical significance testing
                const { pValue, effectSize } = this.performTTest(baselineValues, sikgValues);
                const statisticallySignificant = pValue < this.config.significanceLevel;
                const confidenceInterval = this.calculateConfidenceInterval(sikgValues, 0.95);

                comparisons.push({
                    baseline,
                    sikg,
                    metric,
                    baselineValue,
                    sikgValue,
                    improvement,
                    absoluteImprovement,
                    statisticallySignificant,
                    pValue,
                    effectSize,
                    confidenceInterval
                });

                Logger.debug(`${metric}: ${baseline}=${baselineValue.toFixed(3)}, ${sikg}=${sikgValue.toFixed(3)}, improvement=${(improvement*100).toFixed(1)}%`);

            } catch (error) {
                Logger.error(`Error calculating comparison for metric ${metric}:`, error);
            }
        }

        return comparisons;
    }

    /**
     * Analyze effectiveness trends over iterations
     */
    public analyzeTrends(
        effectivenessHistory: TechniqueEffectiveness[],
        technique: string
    ): EffectivenessTrend[] {
        if (!this.config.includeTrendAnalysis || effectivenessHistory.length < this.config.minimumIterations) {
            return [];
        }

        Logger.debug(`Analyzing trends for ${technique} over ${effectivenessHistory.length} iterations`);

        const trends: EffectivenessTrend[] = [];
        const metrics = ['precision', 'recall', 'f1Score', 'apfd', 'faultDetectionRate'];

        for (const metric of metrics) {
            try {
                const values = effectivenessHistory.map(h => (h as any)[metric]).filter(v => v !== undefined);
                
                if (values.length < this.config.minimumIterations) {
                    continue;
                }

                // Calculate linear regression
                const regression = this.calculateLinearRegression(values);
                
                // Determine trend direction
                let trend: 'improving' | 'declining' | 'stable' = 'stable';
                if (regression.slope > 0.001) {
                    trend = 'improving';
                } else if (regression.slope < -0.001) {
                    trend = 'declining';
                }

                // Calculate volatility
                const volatility = this.calculateStandardDeviation(values);
                
                // Calculate change rate
                const changeRate = values.length > 1 ? 
                    (values[values.length - 1] - values[0]) / (values.length - 1) : 0;

                trends.push({
                    technique,
                    metric,
                    trend,
                    slope: regression.slope,
                    rSquared: regression.rSquared,
                    changeRate,
                    volatility,
                    significance: regression.pValue
                });

            } catch (error) {
                Logger.error(`Error analyzing trend for metric ${metric}:`, error);
            }
        }

        return trends;
    }

    /**
     * Generate effectiveness summary report
     */
    public generateEffectivenessSummary(
        allResults: TechniqueEffectiveness[],
        comparisons: ComparativeEffectiveness[],
        trends: EffectivenessTrend[]
    ): {
        summary: Record<string, any>;
        recommendations: string[];
        insights: string[];
    } {
        const techniques = [...new Set(allResults.map(r => r.technique))];
        const summary: Record<string, any> = {};
        const recommendations: string[] = [];
        const insights: string[] = [];

        // Calculate averages by technique
        for (const technique of techniques) {
            const techniqueResults = allResults.filter(r => r.technique === technique);
            summary[technique] = {
                avgPrecision: this.calculateMean(techniqueResults.map(r => r.precision)),
                avgRecall: this.calculateMean(techniqueResults.map(r => r.recall)),
                avgF1Score: this.calculateMean(techniqueResults.map(r => r.f1Score)),
                avgAPFD: this.calculateMean(techniqueResults.map(r => r.apfd)),
                avgFaultDetectionRate: this.calculateMean(techniqueResults.map(r => r.faultDetectionRate)),
                avgSelectionRatio: this.calculateMean(techniqueResults.map(r => r.selectionRatio)),
                iterations: techniqueResults.length
            };
        }

        // Generate insights from comparisons
        const significantImprovements = comparisons.filter(c => 
            c.statisticallySignificant && c.improvement > this.config.effectSizeThreshold
        );

        if (significantImprovements.length > 0) {
            insights.push(`SIKG shows statistically significant improvements in ${significantImprovements.length} metrics`);
            
            const bestImprovement = significantImprovements.reduce((best, current) => 
                current.improvement > best.improvement ? current : best
            );
            insights.push(`Best improvement: ${(bestImprovement.improvement * 100).toFixed(1)}% in ${bestImprovement.metric}`);
        }

        // Generate recommendations from trends
        const improvingTrends = trends.filter(t => t.trend === 'improving' && t.significance < 0.05);
        const decliningTrends = trends.filter(t => t.trend === 'declining' && t.significance < 0.05);

        if (improvingTrends.length > 0) {
            insights.push(`${improvingTrends.length} metrics show significant improvement trends`);
        }

        if (decliningTrends.length > 0) {
            recommendations.push(`Monitor declining trends in: ${decliningTrends.map(t => t.metric).join(', ')}`);
        }

        // Performance-based recommendations
        const sikgResults = allResults.filter(r => r.technique.toLowerCase().includes('sikg'));
        if (sikgResults.length > 0) {
            const avgF1 = this.calculateMean(sikgResults.map(r => r.f1Score));
            if (avgF1 < 0.7) {
                recommendations.push('Consider tuning SIKG parameters - F1 score below 0.7');
            }
            
            const avgSelectionRatio = this.calculateMean(sikgResults.map(r => r.selectionRatio));
            if (avgSelectionRatio > 0.8) {
                recommendations.push('Consider more aggressive test selection - current selection ratio is high');
            } else if (avgSelectionRatio < 0.2) {
                recommendations.push('Consider less aggressive test selection - may miss important tests');
            }
        }

        return { summary, recommendations, insights };
    }

    /**
     * Calculate confusion matrix for test selection effectiveness
     */
    private calculateConfusionMatrix(
        results: TestExecutionResult[],
        faults: FaultInfo[]
    ): { truePositives: number; falsePositives: number; trueNegatives: number; falseNegatives: number } {
        let truePositives = 0;   // Selected tests that detected faults
        let falsePositives = 0;  // Selected tests that didn't detect faults
        let trueNegatives = 0;   // Unselected tests that wouldn't detect faults
        let falseNegatives = 0;  // Unselected tests that would detect faults

        // Create fault detection mapping
        const faultDetectingTests = new Set<string>();
        faults.forEach(fault => {
            fault.detectedByTests.forEach(testId => faultDetectingTests.add(testId));
        });

        for (const result of results) {
            const isSelected = result.selected;
            const wouldDetectFault = faultDetectingTests.has(result.testId) || result.faultDetected;

            if (isSelected && wouldDetectFault) {
                truePositives++;
            } else if (isSelected && !wouldDetectFault) {
                falsePositives++;
            } else if (!isSelected && !wouldDetectFault) {
                trueNegatives++;
            } else if (!isSelected && wouldDetectFault) {
                falseNegatives++;
            }
        }

        return { truePositives, falsePositives, trueNegatives, falseNegatives };
    }

    /**
     * Calculate fault detection metrics
     */
    private calculateFaultDetectionMetrics(
        results: TestExecutionResult[],
        faults: FaultInfo[]
    ): { faultsDetected: number; totalFaults: number; faultDetectionRate: number } {
        const selectedTests = new Set(results.filter(r => r.selected).map(r => r.testId));
        
        let faultsDetected = 0;
        const totalFaults = faults.length;

        for (const fault of faults) {
            // Check if any selected test can detect this fault
            const canDetect = fault.detectedByTests.some(testId => selectedTests.has(testId));
            if (canDetect) {
                faultsDetected++;
            }
        }

        const faultDetectionRate = totalFaults > 0 ? faultsDetected / totalFaults : 0;
        return { faultsDetected, totalFaults, faultDetectionRate };
    }

    /**
     * Calculate time-related metrics
     */
    private calculateTimeMetrics(results: TestExecutionResult[]): {
        totalExecutionTime: number;
        averageTestTime: number;
        analysisTime: number;
    } {
        const executedTests = results.filter(r => r.executed);
        const totalExecutionTime = executedTests.reduce((sum, r) => sum + r.executionTime, 0);
        const averageTestTime = executedTests.length > 0 ? totalExecutionTime / executedTests.length : 0;
        
        // Analysis time is estimated as a fixed overhead per test
        const analysisTime = results.length * 10; // 10ms per test estimate
        
        return { totalExecutionTime, averageTestTime, analysisTime };
    }

    /**
     * Calculate precision (Positive Predictive Value)
     */
    private calculatePrecision(truePositives: number, falsePositives: number): number {
        const denominator = truePositives + falsePositives;
        return denominator > 0 ? truePositives / denominator : 0;
    }

    /**
     * Calculate recall (Sensitivity)
     */
    private calculateRecall(truePositives: number, falseNegatives: number): number {
        const denominator = truePositives + falseNegatives;
        return denominator > 0 ? truePositives / denominator : 0;
    }

    /**
     * Calculate F1 score
     */
    private calculateF1Score(precision: number, recall: number): number {
        const denominator = precision + recall;
        return denominator > 0 ? (2 * precision * recall) / denominator : 0;
    }

    /**
     * Calculate specificity (True Negative Rate)
     */
    private calculateSpecificity(trueNegatives: number, falsePositives: number): number {
        const denominator = trueNegatives + falsePositives;
        return denominator > 0 ? trueNegatives / denominator : 0;
    }

    /**
     * Calculate accuracy
     */
    private calculateAccuracy(
        truePositives: number,
        trueNegatives: number,
        falsePositives: number,
        falseNegatives: number
    ): number {
        const total = truePositives + trueNegatives + falsePositives + falseNegatives;
        return total > 0 ? (truePositives + trueNegatives) / total : 0;
    }

    /**
     * Calculate Negative Predictive Value
     */
    private calculateNegativePredictiveValue(trueNegatives: number, falseNegatives: number): number {
        const denominator = trueNegatives + falseNegatives;
        return denominator > 0 ? trueNegatives / denominator : 0;
    }

    /**
     * Calculate Matthews Correlation Coefficient
     */
    private calculateMatthewsCorrelationCoefficient(
        tp: number, tn: number, fp: number, fn: number
    ): number {
        const numerator = (tp * tn) - (fp * fn);
        const denominator = Math.sqrt((tp + fp) * (tp + fn) * (tn + fp) * (tn + fn));
        return denominator > 0 ? numerator / denominator : 0;
    }

    /**
     * Calculate mean of an array
     */
    private calculateMean(values: number[]): number {
        return values.length > 0 ? values.reduce((sum, val) => sum + val, 0) / values.length : 0;
    }

    /**
     * Calculate standard deviation
     */
    private calculateStandardDeviation(values: number[]): number {
        if (values.length <= 1) return 0;
        
        const mean = this.calculateMean(values);
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (values.length - 1);
        return Math.sqrt(variance);
    }

    /**
     * Perform t-test between two samples
     */
    private performTTest(sample1: number[], sample2: number[]): { pValue: number; effectSize: number } {
        if (sample1.length === 0 || sample2.length === 0) {
            return { pValue: 1, effectSize: 0 };
        }

        const mean1 = this.calculateMean(sample1);
        const mean2 = this.calculateMean(sample2);
        const std1 = this.calculateStandardDeviation(sample1);
        const std2 = this.calculateStandardDeviation(sample2);
        
        // Cohen's d (effect size)
        const pooledStd = Math.sqrt(((sample1.length - 1) * std1 * std1 + (sample2.length - 1) * std2 * std2) / 
                                   (sample1.length + sample2.length - 2));
        const effectSize = pooledStd > 0 ? (mean2 - mean1) / pooledStd : 0;

        // Simplified t-test (assumes equal variances)
        const standardError = pooledStd * Math.sqrt(1/sample1.length + 1/sample2.length);
        const tStatistic = standardError > 0 ? (mean2 - mean1) / standardError : 0;
        
        // Approximate p-value calculation (simplified)
        const degreesOfFreedom = sample1.length + sample2.length - 2;
        const pValue = this.approximateTDistribution(Math.abs(tStatistic), degreesOfFreedom);

        return { pValue, effectSize };
    }

    /**
     * Calculate confidence interval
     */
    private calculateConfidenceInterval(values: number[], confidence: number): [number, number] {
        if (values.length === 0) return [0, 0];
        
        const mean = this.calculateMean(values);
        const std = this.calculateStandardDeviation(values);
        const marginOfError = 1.96 * (std / Math.sqrt(values.length)); // 95% CI approximation
        
        return [mean - marginOfError, mean + marginOfError];
    }

    /**
     * Calculate linear regression for trend analysis
     */
    private calculateLinearRegression(values: number[]): {
        slope: number;
        intercept: number;
        rSquared: number;
        pValue: number;
    } {
        const n = values.length;
        if (n < 2) return { slope: 0, intercept: 0, rSquared: 0, pValue: 1 };

        const x = Array.from({ length: n }, (_, i) => i);
        const xMean = this.calculateMean(x);
        const yMean = this.calculateMean(values);

        let numerator = 0;
        let denominator = 0;
        
        for (let i = 0; i < n; i++) {
            numerator += (x[i] - xMean) * (values[i] - yMean);
            denominator += (x[i] - xMean) * (x[i] - xMean);
        }

        const slope = denominator > 0 ? numerator / denominator : 0;
        const intercept = yMean - slope * xMean;

        // Calculate R-squared
        let ssRes = 0;
        let ssTot = 0;
        for (let i = 0; i < n; i++) {
            const predicted = slope * x[i] + intercept;
            ssRes += (values[i] - predicted) * (values[i] - predicted);
            ssTot += (values[i] - yMean) * (values[i] - yMean);
        }
        const rSquared = ssTot > 0 ? 1 - (ssRes / ssTot) : 0;

        // Simplified p-value calculation for slope significance
        const standardError = Math.sqrt(ssRes / (n - 2)) / Math.sqrt(denominator);
        const tStatistic = standardError > 0 ? Math.abs(slope) / standardError : 0;
        const pValue = this.approximateTDistribution(tStatistic, n - 2);

        return { slope, intercept, rSquared, pValue };
    }

    /**
     * Approximate t-distribution p-value (simplified)
     */
    private approximateTDistribution(t: number, df: number): number {
        // Very simplified approximation
        if (df >= 30) {
            // Use normal approximation for large df
            return 2 * (1 - this.normalCDF(Math.abs(t)));
        } else {
            // Crude approximation for small df
            return Math.min(1, 2 * Math.exp(-0.5 * t * t) / Math.sqrt(2 * Math.PI));
        }
    }

    /**
     * Normal cumulative distribution function approximation
     */
    private normalCDF(x: number): number {
        // Approximation using error function
        return 0.5 * (1 + this.erf(x / Math.sqrt(2)));
    }

    /**
     * Error function approximation
     */
    private erf(x: number): number {
        // Abramowitz and Stegun approximation
        const a1 =  0.254829592;
        const a2 = -0.284496736;
        const a3 =  1.421413741;
        const a4 = -1.453152027;
        const a5 =  1.061405429;
        const p  =  0.3275911;

        const sign = x >= 0 ? 1 : -1;
        x = Math.abs(x);

        const t = 1.0 / (1.0 + p * x);
        const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

        return sign * y;
    }

    /**
     * Export effectiveness data for external analysis
     */
    public exportEffectivenessData(
        effectiveness: TechniqueEffectiveness[],
        comparisons: ComparativeEffectiveness[],
        trends: EffectivenessTrend[]
    ): string {
        const exportData = {
            effectiveness,
            comparisons,
            trends,
            metadata: {
                exportTime: new Date().toISOString(),
                config: this.config,
                totalIterations: effectiveness.length,
                techniques: [...new Set(effectiveness.map(e => e.technique))]
            }
        };

        return JSON.stringify(exportData, null, 2);
    }

    /**
     * Validate effectiveness calculation results
     */
    public validateResults(effectiveness: TechniqueEffectiveness): string[] {
        const issues: string[] = [];

        // Check for invalid metric values
        if (effectiveness.precision < 0 || effectiveness.precision > 1) {
            issues.push('Precision out of valid range [0,1]');
        }
        if (effectiveness.recall < 0 || effectiveness.recall > 1) {
            issues.push('Recall out of valid range [0,1]');
        }
        if (effectiveness.f1Score < 0 || effectiveness.f1Score > 1) {
            issues.push('F1 score out of valid range [0,1]');
        }
        if (effectiveness.apfd < 0 || effectiveness.apfd > 1) {
            issues.push('APFD out of valid range [0,1]');
        }

        // Check for logical inconsistencies
        if (effectiveness.selectedTests > effectiveness.totalTests) {
            issues.push('Selected tests cannot exceed total tests');
        }
        if (effectiveness.executedTests > effectiveness.selectedTests) {
            issues.push('Executed tests cannot exceed selected tests');
        }
        if (effectiveness.faultsDetected > effectiveness.totalFaults) {
            issues.push('Detected faults cannot exceed total faults');
        }

        // Check confusion matrix
        const total = effectiveness.truePositives + effectiveness.falsePositives + 
                     effectiveness.trueNegatives + effectiveness.falseNegatives;
        if (total !== effectiveness.totalTests && total > 0) {
            issues.push('Confusion matrix does not sum to total tests');
        }

        return issues;
    }
}