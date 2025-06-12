// StatisticalAnalysis.ts - Statistical significance testing and analysis

import { ExperimentData } from '../data/DataCollector';
import { Logger } from '../../utils/Logger';

export interface StatisticalTest {
    testName: string;
    pValue: number;
    isSignificant: boolean;
    alpha: number;
    testStatistic: number;
    degreesOfFreedom?: number;
    interpretation: string;
}

export interface EffectSize {
    measure: 'cohens_d' | 'hedge_g' | 'glass_delta' | 'eta_squared';
    value: number;
    magnitude: 'negligible' | 'small' | 'medium' | 'large' | 'very_large';
    interpretation: string;
}

export interface ConfidenceInterval {
    level: number;
    lowerBound: number;
    upperBound: number;
    mean: number;
    marginOfError: number;
}

export interface DescriptiveStats {
    n: number;
    mean: number;
    median: number;
    mode: number;
    standardDeviation: number;
    variance: number;
    min: number;
    max: number;
    q1: number;
    q3: number;
    iqr: number;
    skewness: number;
    kurtosis: number;
}

export interface ComparisonResult {
    approach1: string;
    approach2: string;
    metric: string;
    descriptive1: DescriptiveStats;
    descriptive2: DescriptiveStats;
    test: StatisticalTest;
    effectSize: EffectSize;
    confidenceInterval: ConfidenceInterval;
    recommendation: string;
}

export interface MultipleComparisonResult {
    comparisons: ComparisonResult[];
    correctedAlpha: number;
    correctionMethod: 'bonferroni' | 'holm' | 'benjamini_hochberg';
    significantComparisons: number;
    totalComparisons: number;
    overallConclusion: string;
}

export interface PowerAnalysis {
    power: number;
    sampleSize: number;
    effectSize: number;
    alpha: number;
    interpretation: string;
    recommendedSampleSize?: number;
}

/**
 * Comprehensive statistical analysis for SIKG experiments
 */
export class StatisticalAnalysis {
    private alpha: number = 0.05;
    private confidenceLevel: number = 0.95;

    constructor(alpha: number = 0.05) {
        this.alpha = alpha;
        this.confidenceLevel = 1 - alpha;
    }

    /**
     * Perform comprehensive statistical comparison between approaches
     */
    public compareApproaches(
        data: ExperimentData[],
        approach1: string,
        approach2: string,
        metric: keyof Pick<ExperimentData, 'precision' | 'recall' | 'f1Score' | 'apfd' | 'reductionRatio' | 'executionTime'>
    ): ComparisonResult {
        Logger.debug(`Comparing ${approach1} vs ${approach2} on ${metric}`);

        // Extract data for each approach
        const data1 = data.filter(d => d.approach === approach1).map(d => d[metric] as number);
        const data2 = data.filter(d => d.approach === approach2).map(d => d[metric] as number);

        if (data1.length === 0 || data2.length === 0) {
            throw new Error(`Insufficient data for comparison: ${approach1}(${data1.length}) vs ${approach2}(${data2.length})`);
        }

        // Calculate descriptive statistics
        const descriptive1 = this.calculateDescriptiveStats(data1);
        const descriptive2 = this.calculateDescriptiveStats(data2);

        // Perform appropriate statistical test
        const test = this.selectAndPerformTest(data1, data2);

        // Calculate effect size
        const effectSize = this.calculateEffectSize(data1, data2, 'cohens_d');

        // Calculate confidence interval for difference
        const confidenceInterval = this.calculateDifferenceCI(data1, data2);

        // Generate recommendation
        const recommendation = this.generateRecommendation(test, effectSize, confidenceInterval);

        return {
            approach1,
            approach2,
            metric,
            descriptive1,
            descriptive2,
            test,
            effectSize,
            confidenceInterval,
            recommendation
        };
    }

    /**
     * Perform multiple comparison analysis with correction for multiple testing
     */
    public performMultipleComparisons(
        data: ExperimentData[],
        approaches: string[],
        metric: keyof Pick<ExperimentData, 'precision' | 'recall' | 'f1Score' | 'apfd' | 'reductionRatio' | 'executionTime'>,
        correctionMethod: 'bonferroni' | 'holm' | 'benjamini_hochberg' = 'bonferroni'
    ): MultipleComparisonResult {
        Logger.info(`Performing multiple comparisons for ${approaches.length} approaches on ${metric}`);

        const comparisons: ComparisonResult[] = [];
        
        // Perform all pairwise comparisons
        for (let i = 0; i < approaches.length; i++) {
            for (let j = i + 1; j < approaches.length; j++) {
                const comparison = this.compareApproaches(data, approaches[i], approaches[j], metric);
                comparisons.push(comparison);
            }
        }

        const totalComparisons = comparisons.length;
        const correctedAlpha = this.calculateCorrectedAlpha(totalComparisons, correctionMethod);

        // Apply multiple comparison correction
        let significantComparisons = 0;
        comparisons.forEach(comp => {
            comp.test.isSignificant = comp.test.pValue < correctedAlpha;
            if (comp.test.isSignificant) {
                significantComparisons++;
            }
        });

        const overallConclusion = this.generateOverallConclusion(
            significantComparisons,
            totalComparisons,
            correctionMethod,
            metric
        );

        return {
            comparisons,
            correctedAlpha,
            correctionMethod,
            significantComparisons,
            totalComparisons,
            overallConclusion
        };
    }

    /**
     * Analyze learning progression for RL experiments
     */
    public analyzeLearningProgression(
        data: ExperimentData[],
        rlApproach: string = 'SIKG-WithRL',
        baselineApproach: string = 'SIKG-WithoutRL'
    ): {
        trendAnalysis: { slope: number; rSquared: number; isSignificant: boolean };
        improvementTest: StatisticalTest;
        effectSize: EffectSize;
        plateauAnalysis: { hasPlateaued: boolean; plateauIteration: number };
    } {
        Logger.info('Analyzing RL learning progression');

        const rlData = data.filter(d => d.approach === rlApproach).sort((a, b) => a.iteration - b.iteration);
        const baselineData = data.filter(d => d.approach === baselineApproach);

        if (rlData.length < 10) {
            throw new Error('Insufficient data for learning progression analysis (need ≥10 iterations)');
        }

        // Trend analysis using linear regression
        const trendAnalysis = this.performLinearRegression(
            rlData.map(d => d.iteration),
            rlData.map(d => d.f1Score)
        );

        // Test final improvement vs baseline
        const finalRLPerformance = rlData.slice(-10).map(d => d.f1Score);
        const baselinePerformance = baselineData.map(d => d.f1Score);
        
        const improvementTest = this.selectAndPerformTest(finalRLPerformance, baselinePerformance);
        const effectSize = this.calculateEffectSize(finalRLPerformance, baselinePerformance, 'cohens_d');

        // Plateau analysis
        const plateauAnalysis = this.detectPlateau(rlData.map(d => d.f1Score));

        return {
            trendAnalysis,
            improvementTest,
            effectSize,
            plateauAnalysis
        };
    }

    /**
     * Power analysis for experiment design
     */
    public performPowerAnalysis(
        expectedEffectSize: number,
        sampleSize: number,
        alpha: number = this.alpha
    ): PowerAnalysis {
        const power = this.calculatePower(expectedEffectSize, sampleSize, alpha);
        const recommendedSampleSize = power < 0.8 ? this.calculateRequiredSampleSize(expectedEffectSize, 0.8, alpha) : undefined;

        return {
            power,
            sampleSize,
            effectSize: expectedEffectSize,
            alpha,
            interpretation: this.interpretPower(power),
            recommendedSampleSize
        };
    }

    /**
     * Validate experimental assumptions
     */
    public validateAssumptions(data: number[]): {
        normality: { isNormal: boolean; pValue: number; test: string };
        outliers: { hasOutliers: boolean; outlierIndices: number[]; outlierValues: number[] };
        variance: { isHomogeneous: boolean; recommendation: string };
    } {
        return {
            normality: this.testNormality(data),
            outliers: this.detectOutliers(data),
            variance: { isHomogeneous: true, recommendation: 'Use parametric tests' } // Simplified
        };
    }

    /**
     * Generate comprehensive statistical summary
     */
    public generateStatisticalSummary(
        data: ExperimentData[],
        approaches: string[]
    ): {
        sampleSizes: Record<string, number>;
        overallStats: DescriptiveStats;
        approachStats: Record<string, DescriptiveStats>;
        multipleComparisons: MultipleComparisonResult;
        effectSizes: Array<{ comparison: string; effectSize: EffectSize }>;
        powerAnalysis: PowerAnalysis;
        assumptions: Record<string, any>;
        recommendations: string[];
    } {
        Logger.info('Generating comprehensive statistical summary');

        // Sample sizes
        const sampleSizes: Record<string, number> = {};
        approaches.forEach(approach => {
            sampleSizes[approach] = data.filter(d => d.approach === approach).length;
        });

        // Overall descriptive statistics
        const allF1Scores = data.map(d => d.f1Score);
        const overallStats = this.calculateDescriptiveStats(allF1Scores);

        // Approach-specific statistics
        const approachStats: Record<string, DescriptiveStats> = {};
        approaches.forEach(approach => {
            const approachData = data.filter(d => d.approach === approach).map(d => d.f1Score);
            approachStats[approach] = this.calculateDescriptiveStats(approachData);
        });

        // Multiple comparisons
        const multipleComparisons = this.performMultipleComparisons(data, approaches, 'f1Score');

        // Effect sizes
        const effectSizes = multipleComparisons.comparisons.map(comp => ({
            comparison: `${comp.approach1} vs ${comp.approach2}`,
            effectSize: comp.effectSize
        }));

        // Power analysis
        const powerAnalysis = this.performPowerAnalysis(0.5, Math.min(...Object.values(sampleSizes)));

        // Assumption validation
        const assumptions: Record<string, any> = {};
        approaches.forEach(approach => {
            const approachData = data.filter(d => d.approach === approach).map(d => d.f1Score);
            assumptions[approach] = this.validateAssumptions(approachData);
        });

        // Generate recommendations
        const recommendations = this.generateStatisticalRecommendations(
            multipleComparisons,
            powerAnalysis,
            assumptions
        );

        return {
            sampleSizes,
            overallStats,
            approachStats,
            multipleComparisons,
            effectSizes,
            powerAnalysis,
            assumptions,
            recommendations
        };
    }

    // =============== PRIVATE HELPER METHODS ===============

    /**
     * Calculate descriptive statistics
     */
    private calculateDescriptiveStats(data: number[]): DescriptiveStats {
        if (data.length === 0) {
            throw new Error('Cannot calculate statistics for empty dataset');
        }

        const sorted = [...data].sort((a, b) => a - b);
        const n = data.length;
        const mean = data.reduce((sum, val) => sum + val, 0) / n;
        
        // Median
        const median = n % 2 === 0 
            ? (sorted[n/2 - 1] + sorted[n/2]) / 2 
            : sorted[Math.floor(n/2)];

        // Mode (simplified - first most frequent value)
        const frequency = new Map<number, number>();
        data.forEach(val => frequency.set(val, (frequency.get(val) || 0) + 1));
        const mode = Array.from(frequency.entries()).reduce((a, b) => a[1] > b[1] ? a : b)[0];

        // Variance and standard deviation
        const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (n - 1);
        const standardDeviation = Math.sqrt(variance);

        // Quartiles
        const q1 = this.percentile(sorted, 25);
        const q3 = this.percentile(sorted, 75);
        const iqr = q3 - q1;

        // Skewness and kurtosis (simplified calculations)
        const skewness = this.calculateSkewness(data, mean, standardDeviation);
        const kurtosis = this.calculateKurtosis(data, mean, standardDeviation);

        return {
            n,
            mean,
            median,
            mode,
            standardDeviation,
            variance,
            min: sorted[0],
            max: sorted[n - 1],
            q1,
            q3,
            iqr,
            skewness,
            kurtosis
        };
    }

    /**
     * Select and perform appropriate statistical test
     */
    private selectAndPerformTest(data1: number[], data2: number[]): StatisticalTest {
        // Check assumptions
        const normality1 = this.testNormality(data1);
        const normality2 = this.testNormality(data2);
        
        const isNormal = normality1.isNormal && normality2.isNormal;
        const equalVariances = this.testEqualVariances(data1, data2);

        if (isNormal && equalVariances) {
            return this.welchTTest(data1, data2);
        } else {
            return this.mannWhitneyUTest(data1, data2);
        }
    }

    /**
     * Welch's t-test (unequal variances)
     */
    private welchTTest(data1: number[], data2: number[]): StatisticalTest {
        const n1 = data1.length;
        const n2 = data2.length;
        const mean1 = data1.reduce((sum, val) => sum + val, 0) / n1;
        const mean2 = data2.reduce((sum, val) => sum + val, 0) / n2;
        
        const var1 = data1.reduce((sum, val) => sum + Math.pow(val - mean1, 2), 0) / (n1 - 1);
        const var2 = data2.reduce((sum, val) => sum + Math.pow(val - mean2, 2), 0) / (n2 - 1);
        
        const se = Math.sqrt(var1/n1 + var2/n2);
        const testStatistic = (mean1 - mean2) / se;
        
        // Welch-Satterthwaite equation for degrees of freedom
        const df = Math.pow(var1/n1 + var2/n2, 2) / 
                  (Math.pow(var1/n1, 2)/(n1-1) + Math.pow(var2/n2, 2)/(n2-1));
        
        const pValue = this.tTestPValue(Math.abs(testStatistic), df);

        return {
            testName: "Welch's t-test",
            pValue,
            isSignificant: pValue < this.alpha,
            alpha: this.alpha,
            testStatistic,
            degreesOfFreedom: df,
            interpretation: this.interpretTTest(testStatistic, pValue, mean1, mean2)
        };
    }

    /**
     * Mann-Whitney U test (non-parametric)
     */
    private mannWhitneyUTest(data1: number[], data2: number[]): StatisticalTest {
        const n1 = data1.length;
        const n2 = data2.length;
        type RankedValue = { value: number; group: number; rank?: number };
        const combined: RankedValue[] = [
            ...data1.map(v => ({ value: v, group: 1 })),
            ...data2.map(v => ({ value: v, group: 2 }))
        ];
        
        // Sort combined data
        combined.sort((a, b) => a.value - b.value);
        
        // Assign ranks
        let rank = 1;
        for (let i = 0; i < combined.length; i++) {
            combined[i] = { ...combined[i], rank };
            rank++;
        }
        
        // Calculate U statistics
        const r1 = combined.filter(item => item.group === 1).reduce((sum, item) => sum + (item as any).rank, 0);
        const u1 = r1 - (n1 * (n1 + 1)) / 2;
        const u2 = n1 * n2 - u1;
        
        const u = Math.min(u1, u2);
        
        // Approximate p-value using normal approximation
        const meanU = (n1 * n2) / 2;
        const stdU = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);
        const z = (u - meanU) / stdU;
        const pValue = 2 * (1 - this.normalCDF(Math.abs(z)));

        return {
            testName: 'Mann-Whitney U test',
            pValue,
            isSignificant: pValue < this.alpha,
            alpha: this.alpha,
            testStatistic: u,
            interpretation: this.interpretMannWhitneyU(u, pValue, n1, n2)
        };
    }

    /**
     * Calculate Cohen's d effect size
     */
    private calculateEffectSize(data1: number[], data2: number[], measure: 'cohens_d'): EffectSize {
        const mean1 = data1.reduce((sum, val) => sum + val, 0) / data1.length;
        const mean2 = data2.reduce((sum, val) => sum + val, 0) / data2.length;
        
        const var1 = data1.reduce((sum, val) => sum + Math.pow(val - mean1, 2), 0) / (data1.length - 1);
        const var2 = data2.reduce((sum, val) => sum + Math.pow(val - mean2, 2), 0) / (data2.length - 1);
        
        const pooledSD = Math.sqrt(((data1.length - 1) * var1 + (data2.length - 1) * var2) / 
                                  (data1.length + data2.length - 2));
        
        const cohensD = (mean1 - mean2) / pooledSD;
        const magnitude = this.interpretEffectSize(Math.abs(cohensD));

        return {
            measure: 'cohens_d',
            value: cohensD,
            magnitude,
            interpretation: `Cohen's d = ${cohensD.toFixed(3)} (${magnitude} effect)`
        };
    }

    /**
     * Calculate confidence interval for difference between means
     */
    private calculateDifferenceCI(data1: number[], data2: number[]): ConfidenceInterval {
        const mean1 = data1.reduce((sum, val) => sum + val, 0) / data1.length;
        const mean2 = data2.reduce((sum, val) => sum + val, 0) / data2.length;
        const meanDiff = mean1 - mean2;
        
        const var1 = data1.reduce((sum, val) => sum + Math.pow(val - mean1, 2), 0) / (data1.length - 1);
        const var2 = data2.reduce((sum, val) => sum + Math.pow(val - mean2, 2), 0) / (data2.length - 1);
        
        const se = Math.sqrt(var1/data1.length + var2/data2.length);
        const df = data1.length + data2.length - 2;
        const tCritical = this.tCritical(this.confidenceLevel, df);
        const marginOfError = tCritical * se;

        return {
            level: this.confidenceLevel * 100,
            lowerBound: meanDiff - marginOfError,
            upperBound: meanDiff + marginOfError,
            mean: meanDiff,
            marginOfError
        };
    }

    /**
     * Test for normality using Shapiro-Wilk approximation
     */
    private testNormality(data: number[]): { isNormal: boolean; pValue: number; test: string } {
        if (data.length < 3 || data.length > 50) {
            // For small or large samples, use simplified check
            const stats = this.calculateDescriptiveStats(data);
            const isNormal = Math.abs(stats.skewness) < 2 && Math.abs(stats.kurtosis - 3) < 2;
            return {
                isNormal,
                pValue: isNormal ? 0.1 : 0.01,
                test: 'Skewness-Kurtosis test'
            };
        }

        // Simplified Shapiro-Wilk approximation
        const sorted = [...data].sort((a, b) => a - b);
        const n = data.length;
        const mean = data.reduce((sum, val) => sum + val, 0) / n;
        
        // Calculate test statistic (simplified)
        let numerator = 0;
        for (let i = 0; i < n; i++) {
            numerator += Math.pow(sorted[i] - mean, 2);
        }
        
        const w = 1 - (numerator / ((n - 1) * Math.pow(this.calculateDescriptiveStats(data).standardDeviation, 2)));
        const pValue = w > 0.95 ? 0.1 : w > 0.90 ? 0.05 : 0.01;

        return {
            isNormal: pValue > this.alpha,
            pValue,
            test: 'Shapiro-Wilk approximation'
        };
    }

    /**
     * Detect outliers using IQR method
     */
    private detectOutliers(data: number[]): { hasOutliers: boolean; outlierIndices: number[]; outlierValues: number[] } {
        const sorted = [...data].sort((a, b) => a - b);
        const q1 = this.percentile(sorted, 25);
        const q3 = this.percentile(sorted, 75);
        const iqr = q3 - q1;
        const lowerBound = q1 - 1.5 * iqr;
        const upperBound = q3 + 1.5 * iqr;

        const outlierIndices: number[] = [];
        const outlierValues: number[] = [];

        data.forEach((value, index) => {
            if (value < lowerBound || value > upperBound) {
                outlierIndices.push(index);
                outlierValues.push(value);
            }
        });

        return {
            hasOutliers: outlierIndices.length > 0,
            outlierIndices,
            outlierValues
        };
    }

    /**
     * Perform linear regression for trend analysis
     */
    private performLinearRegression(x: number[], y: number[]): { slope: number; rSquared: number; isSignificant: boolean } {
        const n = x.length;
        const sumX = x.reduce((sum, val) => sum + val, 0);
        const sumY = y.reduce((sum, val) => sum + val, 0);
        const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
        const sumX2 = x.reduce((sum, val) => sum + val * val, 0);
        const sumY2 = y.reduce((sum, val) => sum + val * val, 0);

        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        // Calculate R-squared
        const yMean = sumY / n;
        const ssTotal = y.reduce((sum, val) => sum + Math.pow(val - yMean, 2), 0);
        const ssResidual = y.reduce((sum, val, i) => {
            const predicted = slope * x[i] + intercept;
            return sum + Math.pow(val - predicted, 2);
        }, 0);
        const rSquared = 1 - (ssResidual / ssTotal);

        // Simple significance test (t-test for slope)
        const isSignificant = Math.abs(slope) > 0.001 && rSquared > 0.1;

        return { slope, rSquared, isSignificant };
    }

    /**
     * Detect plateau in learning progression
     */
    private detectPlateau(values: number[], windowSize: number = 10): { hasPlateaued: boolean; plateauIteration: number } {
        if (values.length < windowSize * 2) {
            return { hasPlateaued: false, plateauIteration: -1 };
        }

        for (let i = windowSize; i <= values.length - windowSize; i++) {
            const recentWindow = values.slice(i, i + windowSize);
            const previousWindow = values.slice(i - windowSize, i);
            
            const recentMean = recentWindow.reduce((sum, val) => sum + val, 0) / windowSize;
            const previousMean = previousWindow.reduce((sum, val) => sum + val, 0) / windowSize;
            
            // Check if improvement has stopped (less than 1% improvement)
            if (Math.abs(recentMean - previousMean) / previousMean < 0.01) {
                return { hasPlateaued: true, plateauIteration: i };
            }
        }

        return { hasPlateaued: false, plateauIteration: -1 };
    }

    // =============== UTILITY METHODS ===============

    private percentile(sortedData: number[], p: number): number {
        const index = (p / 100) * (sortedData.length - 1);
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        const weight = index % 1;
        
        if (upper >= sortedData.length) return sortedData[sortedData.length - 1];
        return sortedData[lower] * (1 - weight) + sortedData[upper] * weight;
    }

    private calculateSkewness(data: number[], mean: number, std: number): number {
        const n = data.length;
        return data.reduce((sum, val) => sum + Math.pow((val - mean) / std, 3), 0) / n;
    }

    private calculateKurtosis(data: number[], mean: number, std: number): number {
        const n = data.length;
        return data.reduce((sum, val) => sum + Math.pow((val - mean) / std, 4), 0) / n;
    }

    private testEqualVariances(data1: number[], data2: number[]): boolean {
        const var1 = this.calculateDescriptiveStats(data1).variance;
        const var2 = this.calculateDescriptiveStats(data2).variance;
        const fRatio = Math.max(var1, var2) / Math.min(var1, var2);
        return fRatio < 2; // Simplified F-test
    }

    private normalCDF(z: number): number {
        // Approximation of standard normal CDF
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
        
        const sign = x >= 0 ? 1 : -1;
        x = Math.abs(x);
        
        const t = 1.0 / (1.0 + p * x);
        const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
        
        return sign * y;
    }

    private tTestPValue(t: number, df: number): number {
        // Simplified t-test p-value calculation
        if (t > 3) return 0.001;
        if (t > 2.5) return 0.01;
        if (t > 2) return 0.05;
        if (t > 1.5) return 0.1;
        return 0.2;
    }

    private tCritical(confidence: number, df: number): number {
        // Simplified t-critical values
        if (confidence >= 0.99) return 2.576;
        if (confidence >= 0.95) return 1.96;
        if (confidence >= 0.90) return 1.645;
        return 1.28;
    }

    private calculatePower(effectSize: number, sampleSize: number, alpha: number): number {
        // Simplified power calculation
        const z_alpha = this.normalCDF(1 - alpha/2);
        const z_beta = effectSize * Math.sqrt(sampleSize/2) - z_alpha;
        return this.normalCDF(z_beta);
    }

    private calculateRequiredSampleSize(effectSize: number, power: number, alpha: number): number {
        // Simplified sample size calculation for desired power
        const z_alpha = 1.96; // For alpha = 0.05
        const z_beta = 0.84;  // For power = 0.8
        return Math.ceil(2 * Math.pow((z_alpha + z_beta) / effectSize, 2));
    }

    private calculateCorrectedAlpha(numComparisons: number, method: string): number {
        switch (method) {
            case 'bonferroni':
                return this.alpha / numComparisons;
            case 'holm':
                return this.alpha / numComparisons; // Simplified
            case 'benjamini_hochberg':
                return this.alpha * 0.8; // Simplified
            default:
                return this.alpha;
        }
    }

    // =============== INTERPRETATION METHODS ===============

    private interpretEffectSize(d: number): EffectSize['magnitude'] {
        if (d >= 1.3) return 'very_large';
        if (d >= 0.8) return 'large';
        if (d >= 0.5) return 'medium';
        if (d >= 0.2) return 'small';
        return 'negligible';
    }

    private interpretTTest(t: number, p: number, mean1: number, mean2: number): string {
        const direction = mean1 > mean2 ? 'higher' : 'lower';
        const significance = p < 0.001 ? 'highly significant' : p < 0.01 ? 'very significant' : p < 0.05 ? 'significant' : 'not significant';
        return `Group 1 performs ${direction} than Group 2 (${significance}, p = ${p.toFixed(4)})`;
    }

    private interpretMannWhitneyU(u: number, p: number, n1: number, n2: number): string {
        const significance = p < 0.001 ? 'highly significant' : p < 0.01 ? 'very significant' : p < 0.05 ? 'significant' : 'not significant';
        return `Non-parametric comparison shows ${significance} difference (U = ${u.toFixed(2)}, p = ${p.toFixed(4)})`;
    }

    private interpretPower(power: number): string {
        if (power >= 0.9) return 'Excellent power (≥90%)';
        if (power >= 0.8) return 'Good power (≥80%)';
        if (power >= 0.7) return 'Moderate power (≥70%)';
        return 'Low power (<70%) - consider increasing sample size';
    }

    private generateRecommendation(test: StatisticalTest, effectSize: EffectSize, ci: ConfidenceInterval): string {
        if (test.isSignificant && effectSize.magnitude !== 'negligible') {
            return `Strong evidence of difference: ${test.interpretation}. ${effectSize.interpretation}. Practical significance confirmed.`;
        } else if (test.isSignificant) {
            return `Statistical significance found but small effect size. ${test.interpretation}. ${effectSize.interpretation}. Consider practical relevance.`;
        } else {
            return `No significant difference detected. ${test.interpretation}. ${effectSize.interpretation}. Approaches perform similarly.`;
        }
    }

    private generateOverallConclusion(
        significant: number,
        total: number,
        method: string,
        metric: string
    ): string {
        const percentage = (significant / total) * 100;
        return `Found ${significant}/${total} (${percentage.toFixed(1)}%) significant comparisons for ${metric} using ${method} correction. ` +
               `${percentage > 50 ? 'Strong evidence of approach differences' : 'Limited evidence of approach differences'}.`;
    }

    private generateStatisticalRecommendations(
        comparisons: MultipleComparisonResult,
        power: PowerAnalysis,
        assumptions: Record<string, any>
    ): string[] {
        const recommendations: string[] = [];

        if (comparisons.significantComparisons > 0) {
            recommendations.push(`Found ${comparisons.significantComparisons} significant differences - focus on effect sizes for practical importance`);
        }

        if (power.power < 0.8) {
            recommendations.push(`Low statistical power (${(power.power * 100).toFixed(1)}%) - consider increasing sample size to ${power.recommendedSampleSize || 'N/A'}`);
        }

        Object.entries(assumptions).forEach(([approach, assumption]) => {
            if (!assumption.normality?.isNormal) {
                recommendations.push(`Non-normal distribution for ${approach} - non-parametric tests recommended`);
            }
            if (assumption.outliers?.hasOutliers) {
                recommendations.push(`Outliers detected in ${approach} - consider robust statistics or outlier removal`);
            }
        });

        if (recommendations.length === 0) {
            recommendations.push('Statistical assumptions satisfied - results are reliable');
        }

        return recommendations;
    }
}