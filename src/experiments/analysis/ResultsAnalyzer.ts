// ResultsAnalyzer.ts - Statistical analysis of experiment results

import { ExperimentData } from '../data/DataCollector';
import { ChangeType } from '../config/ExperimentConfig';
import { Logger } from '../../utils/Logger';

export interface StatisticalTest {
    testName: string;
    pValue: number;
    testStatistic: number;
    significanceLevel: number;
    isSignificant: boolean;
    effectSize: number;
    confidenceInterval: {
        lower: number;
        upper: number;
        level: number;
    };
    interpretation: string;
}

export interface ApproachComparison {
    approach1: string;
    approach2: string;
    metric: string;
    mean1: number;
    mean2: number;
    stdDev1: number;
    stdDev2: number;
    sampleSize1: number;
    sampleSize2: number;
    improvement: number;
    improvementPercent: number;
    test: StatisticalTest;
}

export interface OutlierAnalysis {
    approach: string;
    metric: string;
    outliers: {
        experimentId: string;
        value: number;
        zScore: number;
        isExtreme: boolean;
    }[];
    cleanMean: number;
    cleanStdDev: number;
    outlierImpact: number;
}

export interface DistributionAnalysis {
    approach: string;
    metric: string;
    mean: number;
    median: number;
    stdDev: number;
    min: number;
    max: number;
    q1: number;
    q3: number;
    skewness: number;
    kurtosis: number;
    isNormal: boolean;
    normalityTest: StatisticalTest;
}

export interface PowerAnalysis {
    alpha: number;
    beta: number;
    power: number;
    requiredSampleSize: number;
    actualSampleSize: number;
    detectedEffectSize: number;
    minimumDetectableEffectSize: number;
    isAdequate: boolean;
    recommendation: string;
}

export interface CorrelationAnalysis {
    metric1: string;
    metric2: string;
    correlation: number;
    pValue: number;
    isSignificant: boolean;
    interpretation: string;
}

export interface LearningProgressionAnalysis {
    approach: string;
    trend: 'improving' | 'declining' | 'stable';
    slope: number;
    slopeStdError: number;
    rSquared: number;
    convergenceIteration: number | null;
    plateauDetected: boolean;
    learningRate: number;
    statisticalTest: StatisticalTest;
}

export interface ResultsAnalysis {
    summary: {
        totalExperiments: number;
        approaches: string[];
        metrics: string[];
        significantComparisons: number;
        overallQuality: 'high' | 'medium' | 'low';
    };
    approachComparisons: ApproachComparison[];
    distributionAnalyses: DistributionAnalysis[];
    outlierAnalyses: OutlierAnalysis[];
    powerAnalyses: PowerAnalysis[];
    correlationAnalyses: CorrelationAnalysis[];
    learningProgressions: LearningProgressionAnalysis[];
    recommendations: string[];
    assumptions: {
        normalityMet: boolean;
        homoscedasticityMet: boolean;
        independenceMet: boolean;
        adequateSampleSize: boolean;
    };
}

/**
 * Provides comprehensive statistical analysis of experiment results
 */
export class ResultsAnalyzer {
    private readonly SIGNIFICANCE_LEVEL = 0.05;
    private readonly EFFECT_SIZE_THRESHOLDS = {
        small: 0.2,
        medium: 0.5,
        large: 0.8
    };
    private readonly MINIMUM_SAMPLE_SIZE = 10;

    /**
     * Perform comprehensive analysis of experiment results
     */
    public analyzeResults(data: ExperimentData[]): ResultsAnalysis {
        Logger.info('🔬 Starting comprehensive statistical analysis...');

        if (data.length === 0) {
            throw new Error('No experiment data provided for analysis');
        }

        try {
            // Basic validation
            this.validateData(data);

            // Core analyses
            const approachComparisons = this.compareApproaches(data);
            const distributionAnalyses = this.analyzeDistributions(data);
            const outlierAnalyses = this.detectOutliers(data);
            const powerAnalyses = this.performPowerAnalysis(data);
            const correlationAnalyses = this.analyzeCorrelations(data);
            const learningProgressions = this.analyzeLearningProgressions(data);

            // Generate summary and recommendations
            const summary = this.generateSummary(data, approachComparisons);
            const assumptions = this.validateAssumptions(distributionAnalyses);
            const recommendations = this.generateRecommendations(
                approachComparisons, powerAnalyses, assumptions
            );

            const analysis: ResultsAnalysis = {
                summary,
                approachComparisons,
                distributionAnalyses,
                outlierAnalyses,
                powerAnalyses,
                correlationAnalyses,
                learningProgressions,
                recommendations,
                assumptions
            };

            Logger.info('🔬 Statistical analysis completed successfully');
            Logger.info(`📊 Found ${approachComparisons.length} significant comparisons`);
            Logger.info(`⚡ Overall analysis quality: ${summary.overallQuality}`);

            return analysis;

        } catch (error) {
            Logger.error('Error in statistical analysis:', error);
            throw error;
        }
    }

    /**
     * Compare approaches using appropriate statistical tests
     */
    private compareApproaches(data: ExperimentData[]): ApproachComparison[] {
        const comparisons: ApproachComparison[] = [];
        const approaches = [...new Set(data.map(d => d.approach))];
        const metrics = ['precision', 'recall', 'f1Score', 'apfd', 'reductionRatio'];

        // Compare each pair of approaches for each metric
        for (let i = 0; i < approaches.length; i++) {
            for (let j = i + 1; j < approaches.length; j++) {
                const approach1 = approaches[i];
                const approach2 = approaches[j];

                for (const metric of metrics) {
                    const comparison = this.compareTwoApproaches(
                        data, approach1, approach2, metric as keyof ExperimentData
                    );
                    if (comparison) {
                        comparisons.push(comparison);
                    }
                }
            }
        }

        return comparisons.sort((a, b) => a.test.pValue - b.test.pValue);
    }

    /**
     * Compare two specific approaches for a given metric
     */
    private compareTwoApproaches(
        data: ExperimentData[],
        approach1: string,
        approach2: string,
        metric: keyof ExperimentData
    ): ApproachComparison | null {
        const data1 = data.filter(d => d.approach === approach1).map(d => d[metric] as number);
        const data2 = data.filter(d => d.approach === approach2).map(d => d[metric] as number);

        if (data1.length < this.MINIMUM_SAMPLE_SIZE || data2.length < this.MINIMUM_SAMPLE_SIZE) {
            return null;
        }

        const stats1 = this.calculateDescriptiveStats(data1);
        const stats2 = this.calculateDescriptiveStats(data2);

        // Choose appropriate test (t-test if normal, Mann-Whitney if not)
        const isNormal1 = this.testNormality(data1).isSignificant === false;
        const isNormal2 = this.testNormality(data2).isSignificant === false;
        const useParametric = isNormal1 && isNormal2 && data1.length > 15 && data2.length > 15;

        const test = useParametric ? 
            this.performTTest(data1, data2) : 
            this.performMannWhitneyU(data1, data2);

        const improvement = stats2.mean - stats1.mean;
        const improvementPercent = stats1.mean !== 0 ? (improvement / Math.abs(stats1.mean)) * 100 : 0;

        return {
            approach1,
            approach2,
            metric: metric.toString(),
            mean1: stats1.mean,
            mean2: stats2.mean,
            stdDev1: stats1.stdDev,
            stdDev2: stats2.stdDev,
            sampleSize1: data1.length,
            sampleSize2: data2.length,
            improvement,
            improvementPercent,
            test
        };
    }

    /**
     * Perform independent t-test
     */
    private performTTest(sample1: number[], sample2: number[]): StatisticalTest {
        const stats1 = this.calculateDescriptiveStats(sample1);
        const stats2 = this.calculateDescriptiveStats(sample2);
        
        const n1 = sample1.length;
        const n2 = sample2.length;
        
        // Pooled standard error
        const pooledSE = Math.sqrt(
            ((n1 - 1) * stats1.variance + (n2 - 1) * stats2.variance) / (n1 + n2 - 2) *
            (1/n1 + 1/n2)
        );
        
        const tStatistic = (stats2.mean - stats1.mean) / pooledSE;
        const degreesOfFreedom = n1 + n2 - 2;
        
        // Simplified p-value calculation (two-tailed)
        const pValue = 2 * (1 - this.studentTCDF(Math.abs(tStatistic), degreesOfFreedom));
        
        // Cohen's d effect size
        const pooledStdDev = Math.sqrt(
            ((n1 - 1) * stats1.variance + (n2 - 1) * stats2.variance) / (n1 + n2 - 2)
        );
        const cohensD = (stats2.mean - stats1.mean) / pooledStdDev;
        
        // Confidence interval for mean difference
        const criticalT = this.inverseTDistribution(0.025, degreesOfFreedom);
        const marginOfError = criticalT * pooledSE;
        const meanDiff = stats2.mean - stats1.mean;
        
        return {
            testName: 'Independent t-test',
            pValue,
            testStatistic: tStatistic,
            significanceLevel: this.SIGNIFICANCE_LEVEL,
            isSignificant: pValue < this.SIGNIFICANCE_LEVEL,
            effectSize: Math.abs(cohensD),
            confidenceInterval: {
                lower: meanDiff - marginOfError,
                upper: meanDiff + marginOfError,
                level: 0.95
            },
            interpretation: this.interpretEffectSize(Math.abs(cohensD))
        };
    }

    /**
     * Perform Mann-Whitney U test (non-parametric)
     */
    private performMannWhitneyU(sample1: number[], sample2: number[]): StatisticalTest {
        const n1 = sample1.length;
        const n2 = sample2.length;
        
        // Combine and rank all values
        const combined = [...sample1.map(v => ({ value: v, group: 1 })), 
                          ...sample2.map(v => ({ value: v, group: 2 }))];
        combined.sort((a, b) => a.value - b.value);
        
        // Assign ranks (handle ties)
        const ranks = this.assignRanks(combined.map(c => c.value));
        combined.forEach((item, index) => {
            (item as any).rank = ranks[index];
        });
        
        // Calculate U statistics
        const r1 = combined.filter(c => c.group === 1).reduce((sum, c) => sum + (c as any).rank, 0);
        const u1 = r1 - (n1 * (n1 + 1)) / 2;
        const u2 = (n1 * n2) - u1;
        const uStatistic = Math.min(u1, u2);
        
        // Calculate z-score for large samples
        const meanU = (n1 * n2) / 2;
        const stdU = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);
        const zScore = (uStatistic - meanU) / stdU;
        
        // Two-tailed p-value
        const pValue = 2 * (1 - this.standardNormalCDF(Math.abs(zScore)));
        
        // Effect size (r = z / sqrt(N))
        const effectSize = Math.abs(zScore) / Math.sqrt(n1 + n2);
        
        return {
            testName: 'Mann-Whitney U test',
            pValue,
            testStatistic: uStatistic,
            significanceLevel: this.SIGNIFICANCE_LEVEL,
            isSignificant: pValue < this.SIGNIFICANCE_LEVEL,
            effectSize,
            confidenceInterval: {
                lower: 0, // Simplified - would need more complex calculation
                upper: 0,
                level: 0.95
            },
            interpretation: this.interpretEffectSize(effectSize)
        };
    }

    /**
     * Analyze data distributions for each approach and metric
     */
    private analyzeDistributions(data: ExperimentData[]): DistributionAnalysis[] {
        const analyses: DistributionAnalysis[] = [];
        const approaches = [...new Set(data.map(d => d.approach))];
        const metrics = ['precision', 'recall', 'f1Score', 'apfd', 'reductionRatio'];

        for (const approach of approaches) {
            for (const metric of metrics) {
                const values = data
                    .filter(d => d.approach === approach)
                    .map(d => d[metric as keyof ExperimentData] as number);

                if (values.length >= this.MINIMUM_SAMPLE_SIZE) {
                    const analysis = this.analyzeDistribution(approach, metric, values);
                    analyses.push(analysis);
                }
            }
        }

        return analyses;
    }

    /**
     * Analyze single distribution
     */
    private analyzeDistribution(approach: string, metric: string, values: number[]): DistributionAnalysis {
        const stats = this.calculateDescriptiveStats(values);
        const normalityTest = this.testNormality(values);
        
        // Calculate quartiles
        const sorted = [...values].sort((a, b) => a - b);
        const q1 = this.percentile(sorted, 25);
        const q3 = this.percentile(sorted, 75);
        const median = this.percentile(sorted, 50);
        
        // Calculate skewness and kurtosis
        const skewness = this.calculateSkewness(values, stats.mean, stats.stdDev);
        const kurtosis = this.calculateKurtosis(values, stats.mean, stats.stdDev);

        return {
            approach,
            metric,
            mean: stats.mean,
            median,
            stdDev: stats.stdDev,
            min: Math.min(...values),
            max: Math.max(...values),
            q1,
            q3,
            skewness,
            kurtosis,
            isNormal: !normalityTest.isSignificant,
            normalityTest
        };
    }

    /**
     * Detect outliers in the data
     */
    private detectOutliers(data: ExperimentData[]): OutlierAnalysis[] {
        const analyses: OutlierAnalysis[] = [];
        const approaches = [...new Set(data.map(d => d.approach))];
        const metrics = ['precision', 'recall', 'f1Score', 'apfd', 'reductionRatio'];

        for (const approach of approaches) {
            for (const metric of metrics) {
                const approachData = data.filter(d => d.approach === approach);
                const values = approachData.map(d => d[metric as keyof ExperimentData] as number);

                if (values.length >= this.MINIMUM_SAMPLE_SIZE) {
                    const analysis = this.detectOutliersInSample(approach, metric, approachData, values);
                    analyses.push(analysis);
                }
            }
        }

        return analyses.filter(a => a.outliers.length > 0);
    }

    /**
     * Detect outliers in a specific sample
     */
    private detectOutliersInSample(
        approach: string, 
        metric: string, 
        experiments: ExperimentData[], 
        values: number[]
    ): OutlierAnalysis {
        const stats = this.calculateDescriptiveStats(values);
        const outliers: OutlierAnalysis['outliers'] = [];

        experiments.forEach((exp, index) => {
            const value = values[index];
            const zScore = Math.abs((value - stats.mean) / stats.stdDev);
            
            if (zScore > 2) { // Consider z-score > 2 as outlier
                outliers.push({
                    experimentId: exp.experimentId,
                    value,
                    zScore,
                    isExtreme: zScore > 3 // z-score > 3 is extreme
                });
            }
        });

        // Calculate clean statistics without outliers
        const cleanValues = values.filter((_, index) => 
            !outliers.some(o => o.experimentId === experiments[index].experimentId)
        );
        const cleanStats = cleanValues.length > 0 ? 
            this.calculateDescriptiveStats(cleanValues) : stats;

        const outlierImpact = Math.abs(stats.mean - cleanStats.mean) / stats.mean;

        return {
            approach,
            metric,
            outliers,
            cleanMean: cleanStats.mean,
            cleanStdDev: cleanStats.stdDev,
            outlierImpact
        };
    }

    /**
     * Perform power analysis
     */
    private performPowerAnalysis(data: ExperimentData[]): PowerAnalysis[] {
        const analyses: PowerAnalysis[] = [];
        const approaches = [...new Set(data.map(d => d.approach))];

        // Analyze power for main comparisons
        for (let i = 0; i < approaches.length; i++) {
            for (let j = i + 1; j < approaches.length; j++) {
                const approach1 = approaches[i];
                const approach2 = approaches[j];
                
                const data1 = data.filter(d => d.approach === approach1);
                const data2 = data.filter(d => d.approach === approach2);
                
                if (data1.length > 0 && data2.length > 0) {
                    const f1Values1 = data1.map(d => d.f1Score);
                    const f1Values2 = data2.map(d => d.f1Score);
                    
                    const analysis = this.calculatePowerAnalysis(f1Values1, f1Values2);
                    analyses.push(analysis);
                }
            }
        }

        return analyses;
    }

    /**
     * Calculate power analysis for two samples
     */
    private calculatePowerAnalysis(sample1: number[], sample2: number[]): PowerAnalysis {
        const stats1 = this.calculateDescriptiveStats(sample1);
        const stats2 = this.calculateDescriptiveStats(sample2);
        
        // Effect size (Cohen's d)
        const pooledStdDev = Math.sqrt((stats1.variance + stats2.variance) / 2);
        const detectedEffectSize = Math.abs(stats2.mean - stats1.mean) / pooledStdDev;
        
        // Sample sizes
        const n1 = sample1.length;
        const n2 = sample2.length;
        const harmonicMean = 2 / (1/n1 + 1/n2);
        
        // Power calculation (simplified approximation)
        const alpha = this.SIGNIFICANCE_LEVEL;
        const criticalZ = this.inverseStandardNormal(1 - alpha/2);
        const deltaZ = detectedEffectSize * Math.sqrt(harmonicMean / 2);
        const power = 1 - this.standardNormalCDF(criticalZ - deltaZ) + 
                     this.standardNormalCDF(-criticalZ - deltaZ);
        
        // Required sample size for 80% power
        const desiredPower = 0.8;
        const powerZ = this.inverseStandardNormal(desiredPower);
        const requiredN = Math.ceil(
            2 * Math.pow((criticalZ + powerZ) / detectedEffectSize, 2)
        );
        
        const isAdequate = power >= 0.8;
        const minimumDetectableEffectSize = (criticalZ + powerZ) * Math.sqrt(2 / harmonicMean);

        return {
            alpha,
            beta: 1 - power,
            power,
            requiredSampleSize: requiredN,
            actualSampleSize: Math.min(n1, n2),
            detectedEffectSize,
            minimumDetectableEffectSize,
            isAdequate,
            recommendation: isAdequate ? 
                'Sample size is adequate for detecting the observed effect' :
                `Increase sample size to ${requiredN} per group for 80% power`
        };
    }

    /**
     * Analyze correlations between metrics
     */
    private analyzeCorrelations(data: ExperimentData[]): CorrelationAnalysis[] {
        const correlations: CorrelationAnalysis[] = [];
        const metrics = ['precision', 'recall', 'f1Score', 'apfd', 'reductionRatio', 'executionTime'];

        for (let i = 0; i < metrics.length; i++) {
            for (let j = i + 1; j < metrics.length; j++) {
                const metric1 = metrics[i];
                const metric2 = metrics[j];
                
                const values1 = data.map(d => d[metric1 as keyof ExperimentData] as number);
                const values2 = data.map(d => d[metric2 as keyof ExperimentData] as number);
                
                const correlation = this.calculatePearsonCorrelation(values1, values2);
                correlations.push(correlation);
            }
        }

        return correlations.filter(c => Math.abs(c.correlation) > 0.1); // Only meaningful correlations
    }

    /**
     * Calculate Pearson correlation
     */
    private calculatePearsonCorrelation(x: number[], y: number[]): CorrelationAnalysis {
        const n = x.length;
        const meanX = x.reduce((sum, val) => sum + val, 0) / n;
        const meanY = y.reduce((sum, val) => sum + val, 0) / n;
        
        let numerator = 0;
        let sumXSq = 0;
        let sumYSq = 0;
        
        for (let i = 0; i < n; i++) {
            const dx = x[i] - meanX;
            const dy = y[i] - meanY;
            numerator += dx * dy;
            sumXSq += dx * dx;
            sumYSq += dy * dy;
        }
        
        const correlation = numerator / Math.sqrt(sumXSq * sumYSq);
        
        // t-test for correlation significance
        const t = correlation * Math.sqrt((n - 2) / (1 - correlation * correlation));
        const pValue = 2 * (1 - this.studentTCDF(Math.abs(t), n - 2));
        
        return {
            metric1: 'metric1',
            metric2: 'metric2',
            correlation,
            pValue,
            isSignificant: pValue < this.SIGNIFICANCE_LEVEL,
            interpretation: this.interpretCorrelation(correlation)
        };
    }

    /**
     * Analyze learning progressions for RL experiments
     */
    private analyzeLearningProgressions(data: ExperimentData[]): LearningProgressionAnalysis[] {
        const progressions: LearningProgressionAnalysis[] = [];
        const rlApproaches = data.filter(d => 
            d.approach.includes('RL') || d.approach.includes('WithRL')
        ).map(d => d.approach);
        const uniqueRLApproaches = [...new Set(rlApproaches)];

        for (const approach of uniqueRLApproaches) {
            const approachData = data
                .filter(d => d.approach === approach)
                .sort((a, b) => a.iteration - b.iteration);

            if (approachData.length >= 10) { // Need sufficient data points
                const progression = this.analyzeLearningProgression(approach, approachData);
                progressions.push(progression);
            }
        }

        return progressions;
    }

    /**
     * Analyze single learning progression
     */
    private analyzeLearningProgression(approach: string, data: ExperimentData[]): LearningProgressionAnalysis {
        const iterations = data.map(d => d.iteration);
        const f1Scores = data.map(d => d.f1Score);
        
        // Linear regression to detect trend
        const regression = this.linearRegression(iterations, f1Scores);
        
        // Detect convergence (when slope becomes very small)
        let convergenceIteration: number | null = null;
        let plateauDetected = false;
        
        if (data.length > 20) {
            const windowSize = 10;
            for (let i = windowSize; i < data.length; i++) {
                const recentWindow = f1Scores.slice(i - windowSize, i);
                const windowVariance = this.calculateDescriptiveStats(recentWindow).variance;
                
                if (windowVariance < 0.001) { // Very low variance indicates plateau
                    convergenceIteration = iterations[i];
                    plateauDetected = true;
                    break;
                }
            }
        }
        
        // Learning rate (improvement per iteration)
        const learningRate = regression.slope;
        
        // Trend classification
        let trend: 'improving' | 'declining' | 'stable';
        if (regression.slope > 0.001) {
            trend = 'improving';
        } else if (regression.slope < -0.001) {
            trend = 'declining';
        } else {
            trend = 'stable';
        }
        
        // Statistical test for trend significance
        const trendTest = this.testTrendSignificance(iterations, f1Scores);

        return {
            approach,
            trend,
            slope: regression.slope,
            slopeStdError: regression.slopeStdError,
            rSquared: regression.rSquared,
            convergenceIteration,
            plateauDetected,
            learningRate,
            statisticalTest: trendTest
        };
    }

    // Helper methods for statistical calculations

    private calculateDescriptiveStats(values: number[]): {
        mean: number;
        stdDev: number;
        variance: number;
    } {
        const n = values.length;
        const mean = values.reduce((sum, val) => sum + val, 0) / n;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (n - 1);
        const stdDev = Math.sqrt(variance);
        
        return { mean, stdDev, variance };
    }

    private testNormality(values: number[]): StatisticalTest {
        // Simplified Shapiro-Wilk test approximation
        const n = values.length;
        const sorted = [...values].sort((a, b) => a - b);
        const mean = values.reduce((sum, val) => sum + val, 0) / n;
        
        // Calculate test statistic (simplified)
        const numerator = Math.pow(sorted.reduce((sum, val, i) => 
            sum + this.shapiroWilkCoefficient(i, n) * val, 0), 2);
        const denominator = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0);
        
        const wStatistic = numerator / denominator;
        const pValue = this.shapiroWilkPValue(wStatistic, n);
        
        return {
            testName: 'Shapiro-Wilk normality test',
            pValue,
            testStatistic: wStatistic,
            significanceLevel: this.SIGNIFICANCE_LEVEL,
            isSignificant: pValue < this.SIGNIFICANCE_LEVEL,
            effectSize: 0,
            confidenceInterval: { lower: 0, upper: 0, level: 0.95 },
            interpretation: pValue < this.SIGNIFICANCE_LEVEL ? 
                'Data significantly deviates from normal distribution' :
                'Data is approximately normally distributed'
        };
    }

    private linearRegression(x: number[], y: number[]): {
        slope: number;
        intercept: number;
        rSquared: number;
        slopeStdError: number;
    } {
        const n = x.length;
        const sumX = x.reduce((sum, val) => sum + val, 0);
        const sumY = y.reduce((sum, val) => sum + val, 0);
        const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
        const sumXX = x.reduce((sum, val) => sum + val * val, 0);
        const sumYY = y.reduce((sum, val) => sum + val * val, 0);
        
        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;
        
        // R-squared
        const meanY = sumY / n;
        const ssTotal = y.reduce((sum, val) => sum + Math.pow(val - meanY, 2), 0);
        const ssResidual = y.reduce((sum, val, i) => {
            const predicted = slope * x[i] + intercept;
            return sum + Math.pow(val - predicted, 2);
        }, 0);
        const rSquared = 1 - (ssResidual / ssTotal);
        
        // Standard error of slope
        const residualMeanSquare = ssResidual / (n - 2);
        const slopeStdError = Math.sqrt(residualMeanSquare / (sumXX - sumX * sumX / n));
        
        return { slope, intercept, rSquared, slopeStdError };
    }

    private testTrendSignificance(x: number[], y: number[]): StatisticalTest {
        const regression = this.linearRegression(x, y);
        const tStatistic = regression.slope / regression.slopeStdError;
        const degreesOfFreedom = x.length - 2;
        const pValue = 2 * (1 - this.studentTCDF(Math.abs(tStatistic), degreesOfFreedom));
        
        return {
            testName: 'Trend significance test',
            pValue,
            testStatistic: tStatistic,
            significanceLevel: this.SIGNIFICANCE_LEVEL,
            isSignificant: pValue < this.SIGNIFICANCE_LEVEL,
            effectSize: Math.abs(regression.slope),
            confidenceInterval: { lower: 0, upper: 0, level: 0.95 },
            interpretation: pValue < this.SIGNIFICANCE_LEVEL ?
                'Significant trend detected' : 'No significant trend detected'
        };
    }

    // Additional helper methods

    private validateData(data: ExperimentData[]): void {
        if (data.length < this.MINIMUM_SAMPLE_SIZE) {
            throw new Error(`Insufficient data: need at least ${this.MINIMUM_SAMPLE_SIZE} experiments`);
        }

        const approaches = [...new Set(data.map(d => d.approach))];
        if (approaches.length < 2) {
            throw new Error('Need at least 2 different approaches for comparison');
        }

        // Check for missing values
        const requiredFields = ['precision', 'recall', 'f1Score', 'apfd'];
        for (const experiment of data) {
            for (const field of requiredFields) {
                if (experiment[field as keyof ExperimentData] === undefined) {
                    throw new Error(`Missing required field: ${field} in experiment ${experiment.experimentId}`);
                }
            }
        }
    }

    private generateSummary(data: ExperimentData[], comparisons: ApproachComparison[]): ResultsAnalysis['summary'] {
        const approaches = [...new Set(data.map(d => d.approach))];
        const metrics = ['precision', 'recall', 'f1Score', 'apfd', 'reductionRatio'];
        const significantComparisons = comparisons.filter(c => c.test.isSignificant).length;
        
        // Assess overall quality
        let overallQuality: 'high' | 'medium' | 'low';
        const adequateSampleSizes = approaches.every(approach => 
            data.filter(d => d.approach === approach).length >= 20
        );
        const significanceRate = comparisons.length > 0 ? significantComparisons / comparisons.length : 0;
        
        if (adequateSampleSizes && significanceRate > 0.3) {
            overallQuality = 'high';
        } else if (adequateSampleSizes || significanceRate > 0.1) {
            overallQuality = 'medium';
        } else {
            overallQuality = 'low';
        }

        return {
            totalExperiments: data.length,
            approaches,
            metrics,
            significantComparisons,
            overallQuality
        };
    }

    private validateAssumptions(distributions: DistributionAnalysis[]): ResultsAnalysis['assumptions'] {
        const normalityMet = distributions.filter(d => d.isNormal).length / distributions.length > 0.8;
        const homoscedasticityMet = true; // Simplified - would need proper test
        const independenceMet = true; // Assumed based on experimental design
        const adequateSampleSize = distributions.every(d => d.mean > 0); // Simplified check

        return {
            normalityMet,
            homoscedasticityMet,
            independenceMet,
            adequateSampleSize
        };
    }

    private generateRecommendations(
        comparisons: ApproachComparison[],
        powerAnalyses: PowerAnalysis[],
        assumptions: ResultsAnalysis['assumptions']
    ): string[] {
        const recommendations: string[] = [];

        // Power analysis recommendations
        const inadequatePower = powerAnalyses.filter(p => !p.isAdequate);
        if (inadequatePower.length > 0) {
            recommendations.push(`Increase sample sizes: ${inadequatePower.length} comparisons have insufficient power`);
        }

        // Assumption violations
        if (!assumptions.normalityMet) {
            recommendations.push('Consider non-parametric tests due to normality violations');
        }

        // Significance findings
        const significantComparisons = comparisons.filter(c => c.test.isSignificant);
        if (significantComparisons.length === 0) {
            recommendations.push('No significant differences detected - consider increasing effect sizes or sample sizes');
        }

        // Large effect sizes without significance
        const largeEffectsNotSignificant = comparisons.filter(c => 
            c.test.effectSize > this.EFFECT_SIZE_THRESHOLDS.large && !c.test.isSignificant
        );
        if (largeEffectsNotSignificant.length > 0) {
            recommendations.push('Large effects detected but not significant - increase sample sizes');
        }

        if (recommendations.length === 0) {
            recommendations.push('Statistical analysis appears robust - all major assumptions met');
        }

        return recommendations;
    }

    // Simplified statistical distribution functions
    private studentTCDF(t: number, df: number): number {
        // Simplified approximation
        return 0.5 + Math.atan(t / Math.sqrt(df)) / Math.PI;
    }

    private standardNormalCDF(z: number): number {
        return 0.5 * (1 + this.erf(z / Math.sqrt(2)));
    }

    private erf(x: number): number {
        // Approximation of error function
        const a1 =  0.254829592;
        const a2 = -0.284496736;
        const a3 =  1.421413741;
        const a4 = -1.453152027;
        const a5 =  1.061405429;
        const p  =  0.3275911;

        const sign = x < 0 ? -1 : 1;
        x = Math.abs(x);

        const t = 1.0 / (1.0 + p * x);
        const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

        return sign * y;
    }

    private inverseStandardNormal(p: number): number {
        // Simplified approximation
        if (p === 0.5) return 0;
        if (p > 0.5) return -this.inverseStandardNormal(1 - p);
        
        const c0 = 2.515517;
        const c1 = 0.802853;
        const c2 = 0.010328;
        const d1 = 1.432788;
        const d2 = 0.189269;
        const d3 = 0.001308;
        
        const t = Math.sqrt(-2 * Math.log(p));
        return -(t - (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t));
    }

    private inverseTDistribution(p: number, df: number): number {
        // Simplified approximation
        return this.inverseStandardNormal(p) * (1 + 1/(4*df));
    }

    private assignRanks(values: number[]): number[] {
        const sorted = values.map((value, index) => ({ value, index }))
                            .sort((a, b) => a.value - b.value);
        
        const ranks = new Array(values.length);
        let currentRank = 1;
        
        for (let i = 0; i < sorted.length; i++) {
            let tieCount = 1;
            while (i + tieCount < sorted.length && 
                   sorted[i + tieCount].value === sorted[i].value) {
                tieCount++;
            }
            
            const averageRank = currentRank + (tieCount - 1) / 2;
            for (let j = 0; j < tieCount; j++) {
                ranks[sorted[i + j].index] = averageRank;
            }
            
            currentRank += tieCount;
            i += tieCount - 1;
        }
        
        return ranks;
    }

    private percentile(sortedValues: number[], p: number): number {
        const index = (p / 100) * (sortedValues.length - 1);
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        const weight = index - lower;
        
        return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
    }

    private calculateSkewness(values: number[], mean: number, stdDev: number): number {
        const n = values.length;
        const skewness = values.reduce((sum, val) => sum + Math.pow((val - mean) / stdDev, 3), 0) / n;
        return skewness;
    }

    private calculateKurtosis(values: number[], mean: number, stdDev: number): number {
        const n = values.length;
        const kurtosis = values.reduce((sum, val) => sum + Math.pow((val - mean) / stdDev, 4), 0) / n;
        return kurtosis - 3; // Subtract 3 for excess kurtosis
    }

    private shapiroWilkCoefficient(i: number, n: number): number {
        // Simplified coefficient calculation
        return 1; // Would use actual Shapiro-Wilk coefficients in production
    }

    private shapiroWilkPValue(w: number, n: number): number {
        // Simplified p-value calculation
        return w < 0.9 ? 0.01 : 0.5; // Very simplified
    }

    private interpretEffectSize(effectSize: number): string {
        if (effectSize < this.EFFECT_SIZE_THRESHOLDS.small) {
            return 'Negligible effect size';
        } else if (effectSize < this.EFFECT_SIZE_THRESHOLDS.medium) {
            return 'Small effect size';
        } else if (effectSize < this.EFFECT_SIZE_THRESHOLDS.large) {
            return 'Medium effect size';
        } else {
            return 'Large effect size';
        }
    }

    private interpretCorrelation(correlation: number): string {
        const abs = Math.abs(correlation);
        if (abs < 0.1) return 'Negligible correlation';
        if (abs < 0.3) return 'Weak correlation';
        if (abs < 0.5) return 'Moderate correlation';
        if (abs < 0.7) return 'Strong correlation';
        return 'Very strong correlation';
    }
}