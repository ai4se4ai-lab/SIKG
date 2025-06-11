// src/experiments/metrics/StatisticalAnalysis.ts - Statistical significance testing

import { Logger } from '../../utils/Logger';

export interface StatisticalTestResult {
    testName: string;
    pValue: number;
    significant: boolean;
    effectSize: number;
    confidence: number;
    interpretation: string;
}

export interface WilcoxonResult extends StatisticalTestResult {
    testName: 'wilcoxon';
    wStatistic: number;
    nPairs: number;
}

export interface MannWhitneyResult extends StatisticalTestResult {
    testName: 'mann-whitney';
    uStatistic: number;
    n1: number;
    n2: number;
}

export interface TTestResult extends StatisticalTestResult {
    testName: 't-test';
    tStatistic: number;
    degreesOfFreedom: number;
    paired: boolean;
}

/**
 * Statistical analysis utilities for experiment evaluation
 */
export class StatisticalAnalysis {
    private static readonly SIGNIFICANCE_LEVELS = {
        'highly-significant': 0.001,
        'very-significant': 0.01,
        'significant': 0.05,
        'marginally-significant': 0.1
    };

    /**
     * Wilcoxon signed-rank test for paired samples (SIKG vs baseline on same commits)
     */
    public static wilcoxonSignedRank(
        sikgValues: number[],
        baselineValues: number[],
        alpha: number = 0.05
    ): WilcoxonResult {
        if (sikgValues.length !== baselineValues.length) {
            throw new Error('Arrays must have equal length for paired test');
        }

        const n = sikgValues.length;
        if (n < 5) {
            Logger.warn('Sample size too small for reliable Wilcoxon test');
        }

        // Calculate differences and their absolute values
        const differences = sikgValues.map((sikg, i) => sikg - baselineValues[i]);
        const nonZeroDiffs = differences.filter(d => d !== 0);
        const absDiffs = nonZeroDiffs.map(d => Math.abs(d));

        if (nonZeroDiffs.length === 0) {
            return {
                testName: 'wilcoxon',
                pValue: 1.0,
                significant: false,
                effectSize: 0,
                confidence: 1 - alpha,
                interpretation: 'No differences detected',
                wStatistic: 0,
                nPairs: n
            };
        }

        // Rank absolute differences
        const ranks = this.calculateRanks(absDiffs);
        
        // Sum ranks for positive and negative differences
        let wPlus = 0;
        let wMinus = 0;
        
        nonZeroDiffs.forEach((diff, i) => {
            if (diff > 0) {
                wPlus += ranks[i];
            } else {
                wMinus += ranks[i];
            }
        });

        const wStatistic = Math.min(wPlus, wMinus);
        
        // Calculate p-value (approximation for large samples)
        const pValue = this.calculateWilcoxonPValue(wStatistic, nonZeroDiffs.length);
        
        // Calculate effect size (r = Z / sqrt(N))
        const zScore = this.calculateZScore(wStatistic, nonZeroDiffs.length);
        const effectSize = Math.abs(zScore) / Math.sqrt(n);

        return {
            testName: 'wilcoxon',
            pValue,
            significant: pValue < alpha,
            effectSize,
            confidence: 1 - alpha,
            interpretation: this.interpretWilcoxonResult(pValue, effectSize, wPlus > wMinus),
            wStatistic,
            nPairs: n
        };
    }

    /**
     * Mann-Whitney U test for independent samples
     */
    public static mannWhitneyU(
        group1: number[],
        group2: number[],
        alpha: number = 0.05
    ): MannWhitneyResult {
        const n1 = group1.length;
        const n2 = group2.length;

        if (n1 < 3 || n2 < 3) {
            Logger.warn('Sample sizes too small for reliable Mann-Whitney test');
        }

        // Combine and rank all values
        const combined = [...group1.map(v => ({ value: v, group: 1 })),
                          ...group2.map(v => ({ value: v, group: 2 }))];
        
        combined.sort((a, b) => a.value - b.value);
        
        // Calculate ranks (handle ties)
        const ranks = this.calculateRanksWithTies(combined.map(item => item.value));
        
        // Sum ranks for group 1
        let r1 = 0;
        combined.forEach((item, i) => {
            if (item.group === 1) {
                r1 += ranks[i];
            }
        });

        // Calculate U statistics
        const u1 = r1 - (n1 * (n1 + 1)) / 2;
        const u2 = n1 * n2 - u1;
        const uStatistic = Math.min(u1, u2);

        // Calculate p-value
        const pValue = this.calculateMannWhitneyPValue(uStatistic, n1, n2);
        
        // Calculate effect size (r = Z / sqrt(N))
        const zScore = this.calculateMannWhitneyZScore(u1, n1, n2);
        const effectSize = Math.abs(zScore) / Math.sqrt(n1 + n2);

        return {
            testName: 'mann-whitney',
            pValue,
            significant: pValue < alpha,
            effectSize,
            confidence: 1 - alpha,
            interpretation: this.interpretMannWhitneyResult(pValue, effectSize, u1 > u2),
            uStatistic,
            n1,
            n2
        };
    }

    /**
     * Paired t-test for normally distributed data
     */
    public static pairedTTest(
        sikgValues: number[],
        baselineValues: number[],
        alpha: number = 0.05
    ): TTestResult {
        if (sikgValues.length !== baselineValues.length) {
            throw new Error('Arrays must have equal length for paired t-test');
        }

        const n = sikgValues.length;
        const differences = sikgValues.map((sikg, i) => sikg - baselineValues[i]);
        
        const meanDiff = differences.reduce((sum, d) => sum + d, 0) / n;
        const stdDiff = Math.sqrt(
            differences.reduce((sum, d) => sum + Math.pow(d - meanDiff, 2), 0) / (n - 1)
        );
        
        const tStatistic = meanDiff / (stdDiff / Math.sqrt(n));
        const degreesOfFreedom = n - 1;
        
        // Calculate p-value (two-tailed)
        const pValue = this.calculateTPValue(Math.abs(tStatistic), degreesOfFreedom);
        
        // Calculate effect size (Cohen's d)
        const effectSize = meanDiff / stdDiff;

        return {
            testName: 't-test',
            pValue,
            significant: pValue < alpha,
            effectSize: Math.abs(effectSize),
            confidence: 1 - alpha,
            interpretation: this.interpretTTestResult(pValue, effectSize, meanDiff > 0),
            tStatistic,
            degreesOfFreedom,
            paired: true
        };
    }

    /**
     * Calculate Cohen's d effect size
     */
    public static cohensD(group1: number[], group2: number[]): number {
        const mean1 = group1.reduce((sum, v) => sum + v, 0) / group1.length;
        const mean2 = group2.reduce((sum, v) => sum + v, 0) / group2.length;
        
        const var1 = group1.reduce((sum, v) => sum + Math.pow(v - mean1, 2), 0) / (group1.length - 1);
        const var2 = group2.reduce((sum, v) => sum + Math.pow(v - mean2, 2), 0) / (group2.length - 1);
        
        const pooledSD = Math.sqrt(((group1.length - 1) * var1 + (group2.length - 1) * var2) / 
                                   (group1.length + group2.length - 2));
        
        return (mean1 - mean2) / pooledSD;
    }

    /**
     * Multiple comparison correction (Bonferroni)
     */
    public static bonferroniCorrection(pValues: number[], alpha: number = 0.05): number[] {
        const adjustedAlpha = alpha / pValues.length;
        return pValues.map(p => Math.min(p * pValues.length, 1.0));
    }

    /**
     * Calculate confidence interval for mean
     */
    public static confidenceInterval(
        values: number[],
        confidence: number = 0.95
    ): { lower: number; upper: number; mean: number } {
        const n = values.length;
        const mean = values.reduce((sum, v) => sum + v, 0) / n;
        const std = Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (n - 1));
        
        // Use t-distribution for small samples, normal for large
        const tValue = n < 30 ? this.getTValue(confidence, n - 1) : this.getZValue(confidence);
        const margin = tValue * (std / Math.sqrt(n));
        
        return {
            lower: mean - margin,
            upper: mean + margin,
            mean
        };
    }

    /**
     * Comprehensive statistical comparison
     */
    public static compareGroups(
        sikgValues: number[],
        baselineValues: number[],
        groupNames: [string, string] = ['SIKG', 'Baseline'],
        alpha: number = 0.05
    ): {
        descriptive: any;
        tests: StatisticalTestResult[];
        recommendation: string;
    } {
        // Descriptive statistics
        const descriptive = {
            [groupNames[0]]: this.descriptiveStats(sikgValues),
            [groupNames[1]]: this.descriptiveStats(baselineValues)
        };

        const tests: StatisticalTestResult[] = [];

        // Choose appropriate test based on data characteristics
        if (sikgValues.length === baselineValues.length) {
            // Paired samples - use Wilcoxon (non-parametric)
            tests.push(this.wilcoxonSignedRank(sikgValues, baselineValues, alpha));
            
            // Also run paired t-test if sample is large enough
            if (sikgValues.length >= 30) {
                tests.push(this.pairedTTest(sikgValues, baselineValues, alpha));
            }
        } else {
            // Independent samples - use Mann-Whitney
            tests.push(this.mannWhitneyU(sikgValues, baselineValues, alpha));
        }

        // Generate recommendation
        const significantTests = tests.filter(t => t.significant);
        const recommendation = this.generateRecommendation(significantTests, descriptive, groupNames);

        return { descriptive, tests, recommendation };
    }

    // Private helper methods
    private static calculateRanks(values: number[]): number[] {
        const indexed = values.map((value, i) => ({ value, index: i }));
        indexed.sort((a, b) => a.value - b.value);
        
        const ranks = new Array(values.length);
        let currentRank = 1;
        
        for (let i = 0; i < indexed.length; i++) {
            ranks[indexed[i].index] = currentRank++;
        }
        
        return ranks;
    }

    private static calculateRanksWithTies(values: number[]): number[] {
        const indexed = values.map((value, i) => ({ value, index: i }));
        indexed.sort((a, b) => a.value - b.value);
        
        const ranks = new Array(values.length);
        let i = 0;
        
        while (i < values.length) {
            let j = i;
            while (j < values.length && indexed[j].value === indexed[i].value) {
                j++;
            }
            
            const rank = (i + j + 1) / 2; // Average rank for ties
            for (let k = i; k < j; k++) {
                ranks[indexed[k].index] = rank;
            }
            
            i = j;
        }
        
        return ranks;
    }

    private static calculateWilcoxonPValue(wStatistic: number, n: number): number {
        // Simplified p-value calculation (normal approximation for large n)
        if (n < 10) {
            return 0.05; // Placeholder for small samples
        }
        
        const mean = n * (n + 1) / 4;
        const variance = n * (n + 1) * (2 * n + 1) / 24;
        const zScore = (wStatistic - mean) / Math.sqrt(variance);
        
        return 2 * (1 - this.normalCDF(Math.abs(zScore))); // Two-tailed
    }

    private static calculateZScore(wStatistic: number, n: number): number {
        const mean = n * (n + 1) / 4;
        const variance = n * (n + 1) * (2 * n + 1) / 24;
        return (wStatistic - mean) / Math.sqrt(variance);
    }

    private static calculateMannWhitneyPValue(uStatistic: number, n1: number, n2: number): number {
        // Normal approximation for large samples
        if (n1 < 8 || n2 < 8) {
            return 0.05; // Placeholder for small samples
        }
        
        const mean = (n1 * n2) / 2;
        const variance = (n1 * n2 * (n1 + n2 + 1)) / 12;
        const zScore = (uStatistic - mean) / Math.sqrt(variance);
        
        return 2 * (1 - this.normalCDF(Math.abs(zScore))); // Two-tailed
    }

    private static calculateMannWhitneyZScore(u1: number, n1: number, n2: number): number {
        const mean = (n1 * n2) / 2;
        const variance = (n1 * n2 * (n1 + n2 + 1)) / 12;
        return (u1 - mean) / Math.sqrt(variance);
    }

    private static calculateTPValue(tStatistic: number, df: number): number {
        // Simplified t-distribution p-value calculation
        // This is an approximation - in production, use proper statistical library
        if (df >= 30) {
            return 2 * (1 - this.normalCDF(tStatistic)); // Normal approximation
        }
        
        // Rough approximation for t-distribution
        const factor = 1 + (tStatistic * tStatistic) / df;
        return 2 / (Math.PI * Math.sqrt(df) * Math.pow(factor, (df + 1) / 2));
    }

    private static normalCDF(x: number): number {
        // Approximation of the standard normal cumulative distribution function
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

        return 0.5 * (1.0 + sign * y);
    }

    private static getTValue(confidence: number, df: number): number {
        // Critical t-values for common confidence levels and degrees of freedom
        // This is a simplified lookup - in production, use proper statistical library
        const alpha = 1 - confidence;
        
        if (df >= 30) {
            return this.getZValue(confidence);
        }
        
        // Simplified t-table lookup
        const tTable: Record<number, number> = {
            1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571,
            10: 2.228, 15: 2.131, 20: 2.086, 25: 2.060, 30: 2.042
        };
        
        const closestDf = Object.keys(tTable)
            .map(Number)
            .reduce((prev, curr) => Math.abs(curr - df) < Math.abs(prev - df) ? curr : prev);
        
        return tTable[closestDf] || 2.0;
    }

    private static getZValue(confidence: number): number {
        // Critical z-values for common confidence levels
        const zTable: Record<number, number> = {
            0.90: 1.645,
            0.95: 1.960,
            0.99: 2.576,
            0.999: 3.291
        };
        
        return zTable[confidence] || 1.960;
    }

    private static descriptiveStats(values: number[]): any {
        if (values.length === 0) {
            return { count: 0, mean: 0, median: 0, std: 0, min: 0, max: 0 };
        }

        const sorted = [...values].sort((a, b) => a - b);
        const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
        const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (values.length - 1);
        const std = Math.sqrt(variance);
        
        return {
            count: values.length,
            mean: Number(mean.toFixed(4)),
            median: Number(sorted[Math.floor(sorted.length / 2)].toFixed(4)),
            std: Number(std.toFixed(4)),
            min: Number(sorted[0].toFixed(4)),
            max: Number(sorted[sorted.length - 1].toFixed(4))
        };
    }

    private static interpretWilcoxonResult(pValue: number, effectSize: number, sikgBetter: boolean): string {
        const significance = this.getSignificanceLevel(pValue);
        const effectMagnitude = this.getEffectMagnitude(effectSize);
        const direction = sikgBetter ? 'SIKG performs better' : 'Baseline performs better';
        
        return `${significance} difference detected (p=${pValue.toFixed(4)}). ${direction} with ${effectMagnitude} effect size (r=${effectSize.toFixed(3)}).`;
    }

    private static interpretMannWhitneyResult(pValue: number, effectSize: number, sikgBetter: boolean): string {
        const significance = this.getSignificanceLevel(pValue);
        const effectMagnitude = this.getEffectMagnitude(effectSize);
        const direction = sikgBetter ? 'SIKG group has higher values' : 'Baseline group has higher values';
        
        return `${significance} difference between groups (p=${pValue.toFixed(4)}). ${direction} with ${effectMagnitude} effect size (r=${effectSize.toFixed(3)}).`;
    }

    private static interpretTTestResult(pValue: number, effectSize: number, sikgBetter: boolean): string {
        const significance = this.getSignificanceLevel(pValue);
        const effectMagnitude = this.getEffectMagnitude(effectSize);
        const direction = sikgBetter ? 'SIKG shows improvement' : 'Baseline shows better performance';
        
        return `${significance} difference in means (p=${pValue.toFixed(4)}). ${direction} with ${effectMagnitude} effect size (d=${effectSize.toFixed(3)}).`;
    }

    private static getSignificanceLevel(pValue: number): string {
        if (pValue < this.SIGNIFICANCE_LEVELS['highly-significant']) return 'Highly significant';
        if (pValue < this.SIGNIFICANCE_LEVELS['very-significant']) return 'Very significant';
        if (pValue < this.SIGNIFICANCE_LEVELS['significant']) return 'Significant';
        if (pValue < this.SIGNIFICANCE_LEVELS['marginally-significant']) return 'Marginally significant';
        return 'Non-significant';
    }

    private static getEffectMagnitude(effectSize: number): string {
        // Cohen's conventions for effect size interpretation
        if (effectSize >= 0.8) return 'large';
        if (effectSize >= 0.5) return 'medium';
        if (effectSize >= 0.2) return 'small';
        return 'negligible';
    }

    private static generateRecommendation(
        significantTests: StatisticalTestResult[],
        descriptive: any,
        groupNames: [string, string]
    ): string {
        if (significantTests.length === 0) {
            return `No statistically significant differences found between ${groupNames[0]} and ${groupNames[1]}. ` +
                   `Both approaches perform similarly on the measured metrics.`;
        }

        const bestTest = significantTests.reduce((best, current) => 
            current.effectSize > best.effectSize ? current : best
        );

        const [sikg, baseline] = groupNames;
        const sikgMean = descriptive[sikg].mean;
        const baselineMean = descriptive[baseline].mean;
        const improvement = ((sikgMean - baselineMean) / baselineMean * 100).toFixed(1);
        const betterApproach = sikgMean > baselineMean ? sikg : baseline;

        return `${bestTest.interpretation} ` +
               `${betterApproach} shows ${Math.abs(Number(improvement))}% ${Number(improvement) > 0 ? 'improvement' : 'decline'} ` +
               `with ${this.getEffectMagnitude(bestTest.effectSize)} practical significance. ` +
               `Recommendation: ${betterApproach} is statistically superior for this metric.`;
    }

    /**
     * Perform comprehensive multiple comparison analysis
     */
    public static multipleComparison(
        sikgValues: number[],
        baselineGroups: Record<string, number[]>,
        alpha: number = 0.05
    ): {
        comparisons: Array<{
            baseline: string;
            result: StatisticalTestResult;
            adjusted: StatisticalTestResult;
        }>;
        overallRecommendation: string;
    } {
        const comparisons = [];
        const pValues = [];

        // Perform pairwise comparisons
        for (const [baselineName, baselineValues] of Object.entries(baselineGroups)) {
            const result = this.wilcoxonSignedRank(sikgValues, baselineValues, alpha);
            pValues.push(result.pValue);
            
            comparisons.push({
                baseline: baselineName,
                result,
                adjusted: { ...result } // Will be updated with correction
            });
        }

        // Apply Bonferroni correction
        const adjustedPValues = this.bonferroniCorrection(pValues, alpha);
        
        // Update adjusted results
        comparisons.forEach((comp, i) => {
            comp.adjusted.pValue = adjustedPValues[i];
            comp.adjusted.significant = adjustedPValues[i] < alpha;
            comp.adjusted.interpretation = `Bonferroni-corrected: ${comp.adjusted.interpretation}`;
        });

        // Generate overall recommendation
        const significantComparisons = comparisons.filter(c => c.adjusted.significant);
        const overallRecommendation = significantComparisons.length > 0 ?
            `SIKG significantly outperforms ${significantComparisons.length}/${comparisons.length} baseline(s) ` +
            `after multiple comparison correction: ${significantComparisons.map(c => c.baseline).join(', ')}.` :
            `No significant differences remain after multiple comparison correction. ` +
            `SIKG performance is comparable to baseline approaches.`;

        return { comparisons, overallRecommendation };
    }
}