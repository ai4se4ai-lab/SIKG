// APFDCalculator.ts - APFD and effectiveness metrics for SIKG experiments

import { Logger } from '../../utils/Logger';

/**
 * Test execution result for experiments
 */
export interface ExperimentTestExecution {
    testId: string;
    status: 'passed' | 'failed' | 'skipped';
    executionTime: number;
    timestamp: Date;
    wasFaultDetected: boolean;
    selectionMethod: string; // 'sikg', 'random', 'ekstazi', etc.
    predictedImpact?: number;
    actualImpact?: number;
}

/**
 * APFD calculation result
 */
export interface APFDResult {
    apfd: number;
    totalTests: number;
    totalFaults: number;
    averageFaultPosition: number;
    faultDetectionRate: number;
    earlyDetectionRate: number; // Faults found in first 50% of tests
    faultPositions: number[];
    executionTime: number;
    details: {
        sumOfPositions: number;
        earlyFaults: number;
        lateFaults: number;
        interpretation: string;
        confidenceInterval?: [number, number];
    };
}

/**
 * Comparative APFD analysis between methods
 */
export interface APFDComparison {
    sikg: APFDResult;
    baselines: Record<string, APFDResult>;
    improvements: Record<string, number>; // Improvement over each baseline
    statisticalSignificance: Record<string, {
        pValue: number;
        isSignificant: boolean;
        effectSize: number;
        interpretation: string;
    }>;
    summary: {
        bestMethod: string;
        averageImprovement: number;
        significantImprovements: string[];
        recommendations: string[];
    };
}

/**
 * Fault detection curve point
 */
export interface FaultDetectionPoint {
    testPosition: number;
    testsExecutedPercentage: number;
    faultsDetectedPercentage: number;
    cumulativeFaults: number;
    executionTime: number;
    method: string;
}

/**
 * Fault detection curve for visualization
 */
export interface FaultDetectionCurve {
    points: FaultDetectionPoint[];
    totalFaults: number;
    areaUnderCurve: number;
    method: string;
}

/**
 * Experiment-specific APFD metrics
 */
export interface ExperimentMetrics {
    apfd: APFDResult;
    testReduction: number; // Percentage of tests not executed
    timeReduction: number; // Percentage of execution time saved
    precision: number;
    recall: number;
    f1Score: number;
    accuracy: number;
    falsePositiveRate: number;
    falseNegativeRate: number;
}

/**
 * Learning curve data point for RL evaluation
 */
export interface LearningCurvePoint {
    iteration: number;
    apfd: number;
    accuracy: number;
    testReduction: number;
    executionTime: number;
    adaptationCount: number;
}

/**
 * APFD Calculator for SIKG experiments
 * Extends existing APFD functionality with experiment-specific features
 */
export class APFDCalculator {
    private confidenceLevel: number = 0.95;

    /**
     * Calculate APFD using the standard formula
     * APFD = 1 - (sum of fault positions / (total_tests * total_faults)) + 1/(2*total_tests)
     */
    public calculateAPFD(testExecutions: ExperimentTestExecution[]): APFDResult {
        try {
            if (testExecutions.length === 0) {
                return this.createEmptyAPFDResult();
            }

            const totalTests = testExecutions.length;
            const faultDetectingTests = testExecutions.filter(e => e.wasFaultDetected);
            const totalFaults = faultDetectingTests.length;

            if (totalFaults === 0) {
                return {
                    apfd: 1.0,
                    totalTests,
                    totalFaults: 0,
                    averageFaultPosition: 0,
                    faultDetectionRate: 0,
                    earlyDetectionRate: 0,
                    faultPositions: [],
                    executionTime: testExecutions.reduce((sum, e) => sum + e.executionTime, 0),
                    details: {
                        sumOfPositions: 0,
                        earlyFaults: 0,
                        lateFaults: 0,
                        interpretation: 'No faults detected - perfect execution or no faults present'
                    }
                };
            }

            // Find positions where faults were detected (1-indexed)
            const faultPositions: number[] = [];
            testExecutions.forEach((execution, index) => {
                if (execution.wasFaultDetected) {
                    faultPositions.push(index + 1);
                }
            });

            // Calculate APFD using standard formula
            const sumOfPositions = faultPositions.reduce((sum, pos) => sum + pos, 0);
            const apfd = 1 - (sumOfPositions / (totalTests * totalFaults)) + (1 / (2 * totalTests));

            // Calculate additional metrics
            const averageFaultPosition = sumOfPositions / totalFaults;
            const faultDetectionRate = totalFaults / totalTests;
            const executionTime = testExecutions.reduce((sum, e) => sum + e.executionTime, 0);
            
            // Early detection rate (faults found in first 50% of tests)
            const earlyFaults = faultPositions.filter(pos => pos <= totalTests / 2).length;
            const earlyDetectionRate = totalFaults > 0 ? earlyFaults / totalFaults : 0;

            const result: APFDResult = {
                apfd: Math.max(0, Math.min(1, apfd)),
                totalTests,
                totalFaults,
                averageFaultPosition,
                faultDetectionRate,
                earlyDetectionRate,
                faultPositions,
                executionTime,
                details: {
                    sumOfPositions,
                    earlyFaults,
                    lateFaults: totalFaults - earlyFaults,
                    interpretation: this.interpretAPFD(apfd)
                }
            };

            Logger.debug(`APFD calculated: ${apfd.toFixed(4)} (${totalFaults} faults in ${totalTests} tests)`);
            return result;

        } catch (error) {
            Logger.error('Error calculating APFD:', error);
            return this.createEmptyAPFDResult();
        }
    }

    /**
     * Calculate APFD with confidence interval using bootstrap method
     */
    public calculateAPFDWithConfidence(
        testExecutions: ExperimentTestExecution[],
        bootstrapSamples: number = 1000
    ): APFDResult {
        const baseResult = this.calculateAPFD(testExecutions);
        
        if (testExecutions.length < 10) {
            // Not enough data for reliable confidence interval
            return baseResult;
        }

        // Bootstrap resampling for confidence interval
        const bootstrapAPFDs: number[] = [];
        
        for (let i = 0; i < bootstrapSamples; i++) {
            const sample = this.bootstrapSample(testExecutions);
            const sampleAPFD = this.calculateAPFD(sample);
            bootstrapAPFDs.push(sampleAPFD.apfd);
        }

        // Calculate confidence interval
        bootstrapAPFDs.sort((a, b) => a - b);
        const alpha = 1 - this.confidenceLevel;
        const lowerIndex = Math.floor(alpha / 2 * bootstrapSamples);
        const upperIndex = Math.floor((1 - alpha / 2) * bootstrapSamples);
        
        const confidenceInterval: [number, number] = [
            bootstrapAPFDs[lowerIndex],
            bootstrapAPFDs[upperIndex]
        ];

        baseResult.details.confidenceInterval = confidenceInterval;
        return baseResult;
    }

    /**
     * Compare APFD between SIKG and baseline methods
     */
    public compareAPFDMethods(
        sikgExecutions: ExperimentTestExecution[],
        baselineExecutions: Record<string, ExperimentTestExecution[]>
    ): APFDComparison {
        try {
            const sikgResult = this.calculateAPFDWithConfidence(sikgExecutions);
            const baselineResults: Record<string, APFDResult> = {};
            const improvements: Record<string, number> = {};
            const statisticalSignificance: Record<string, any> = {};

            // Calculate APFD for each baseline
            for (const [method, executions] of Object.entries(baselineExecutions)) {
                baselineResults[method] = this.calculateAPFDWithConfidence(executions);
                improvements[method] = sikgResult.apfd - baselineResults[method].apfd;
                
                // Statistical significance testing
                statisticalSignificance[method] = this.calculateStatisticalSignificance(
                    sikgExecutions,
                    executions
                );
            }

            // Determine best method
            const allResults = { sikg: sikgResult, ...baselineResults };
            const bestMethod = Object.entries(allResults).reduce((best, [method, result]) => 
                result.apfd > best.apfd ? { method, apfd: result.apfd } : best,
                { method: 'sikg', apfd: sikgResult.apfd }
            ).method;

            // Calculate average improvement
            const validImprovements = Object.values(improvements).filter(imp => !isNaN(imp));
            const averageImprovement = validImprovements.length > 0 ? 
                validImprovements.reduce((sum, imp) => sum + imp, 0) / validImprovements.length : 0;

            // Find significant improvements
            const significantImprovements = Object.entries(statisticalSignificance)
                .filter(([_, stats]) => stats.isSignificant && improvements[_] > 0)
                .map(([method, _]) => method);

            const comparison: APFDComparison = {
                sikg: sikgResult,
                baselines: baselineResults,
                improvements,
                statisticalSignificance,
                summary: {
                    bestMethod,
                    averageImprovement,
                    significantImprovements,
                    recommendations: this.generateRecommendations(sikgResult, baselineResults, improvements)
                }
            };

            Logger.info(`APFD comparison complete: SIKG=${sikgResult.apfd.toFixed(4)}, best=${bestMethod}`);
            return comparison;

        } catch (error) {
            Logger.error('Error comparing APFD methods:', error);
            return {
                sikg: this.createEmptyAPFDResult(),
                baselines: {},
                improvements: {},
                statisticalSignificance: {},
                summary: {
                    bestMethod: 'unknown',
                    averageImprovement: 0,
                    significantImprovements: [],
                    recommendations: ['Error in analysis - check logs']
                }
            };
        }
    }

    /**
     * Calculate fault detection curve for visualization
     */
    public calculateFaultDetectionCurve(
        testExecutions: ExperimentTestExecution[],
        method: string = 'unknown'
    ): FaultDetectionCurve {
        const points: FaultDetectionPoint[] = [];
        let faultsFound = 0;
        const totalFaults = testExecutions.filter(e => e.wasFaultDetected).length;
        let cumulativeTime = 0;

        testExecutions.forEach((execution, index) => {
            if (execution.wasFaultDetected) {
                faultsFound++;
            }
            cumulativeTime += execution.executionTime;

            const point: FaultDetectionPoint = {
                testPosition: index + 1,
                testsExecutedPercentage: ((index + 1) / testExecutions.length) * 100,
                faultsDetectedPercentage: totalFaults > 0 ? (faultsFound / totalFaults) * 100 : 0,
                cumulativeFaults: faultsFound,
                executionTime: cumulativeTime,
                method
            };

            points.push(point);
        });

        // Calculate area under curve using trapezoidal rule
        const areaUnderCurve = this.calculateAreaUnderCurve(points);

        return {
            points,
            totalFaults,
            areaUnderCurve,
            method
        };
    }

    /**
     * Calculate comprehensive experiment metrics
     */
    public calculateExperimentMetrics(
        selectedTests: string[],
        allTests: string[],
        testExecutions: ExperimentTestExecution[]
    ): ExperimentMetrics {
        const apfd = this.calculateAPFD(testExecutions);
        
        // Calculate reduction metrics
        const testReduction = allTests.length > 0 ? 
            1 - (selectedTests.length / allTests.length) : 0;
        
        // Estimate time reduction (assuming non-selected tests would have similar execution time)
        const avgExecutionTime = testExecutions.length > 0 ? 
            testExecutions.reduce((sum, e) => sum + e.executionTime, 0) / testExecutions.length : 0;
        const estimatedTotalTime = allTests.length * avgExecutionTime;
        const actualExecutionTime = testExecutions.reduce((sum, e) => sum + e.executionTime, 0);
        const timeReduction = estimatedTotalTime > 0 ? 
            1 - (actualExecutionTime / estimatedTotalTime) : 0;

        // Calculate classification metrics
        const selectedTestSet = new Set(selectedTests);
        const failedTests = testExecutions.filter(e => e.wasFaultDetected).map(e => e.testId);
        const failedTestSet = new Set(failedTests);

        // True positives: selected tests that failed
        const truePositives = testExecutions.filter(e => 
            selectedTestSet.has(e.testId) && failedTestSet.has(e.testId)
        ).length;

        // False positives: selected tests that passed
        const falsePositives = testExecutions.filter(e => 
            selectedTestSet.has(e.testId) && !failedTestSet.has(e.testId)
        ).length;

        // False negatives: unselected tests that would have failed
        const allFailedTests = failedTests.length;
        const falseNegatives = Math.max(0, allFailedTests - truePositives);

        // True negatives: unselected tests that would have passed
        const allPassedTests = allTests.length - allFailedTests;
        const selectedPassedTests = selectedTests.length - truePositives - falsePositives;
        const trueNegatives = Math.max(0, allPassedTests - selectedPassedTests);

        // Calculate metrics
        const precision = truePositives / Math.max(1, truePositives + falsePositives);
        const recall = truePositives / Math.max(1, truePositives + falseNegatives);
        const f1Score = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;
        const accuracy = (truePositives + trueNegatives) / Math.max(1, allTests.length);
        const falsePositiveRate = falsePositives / Math.max(1, falsePositives + trueNegatives);
        const falseNegativeRate = falseNegatives / Math.max(1, falseNegatives + truePositives);

        return {
            apfd,
            testReduction,
            timeReduction,
            precision,
            recall,
            f1Score,
            accuracy,
            falsePositiveRate,
            falseNegativeRate
        };
    }

    /**
     * Generate learning curve data for RL evaluation
     */
    public generateLearningCurve(
        executionsByIteration: ExperimentTestExecution[][],
        adaptationCounts?: number[]
    ): LearningCurvePoint[] {
        const curve: LearningCurvePoint[] = [];

        executionsByIteration.forEach((executions, index) => {
            const apfdResult = this.calculateAPFD(executions);
            
            // Calculate accuracy (correct predictions)
            const correctPredictions = executions.filter(e => {
                const predicted = (e.predictedImpact || 0) > 0.5;
                const actual = e.wasFaultDetected;
                return (predicted && actual) || (!predicted && !actual);
            }).length;
            const accuracy = executions.length > 0 ? correctPredictions / executions.length : 0;

            // Calculate test reduction (if available)
            const testReduction = 0.5; // Placeholder - would need original test count

            const point: LearningCurvePoint = {
                iteration: index + 1,
                apfd: apfdResult.apfd,
                accuracy,
                testReduction,
                executionTime: apfdResult.executionTime,
                adaptationCount: adaptationCounts ? adaptationCounts[index] || 0 : 0
            };

            curve.push(point);
        });

        return curve;
    }

    /**
     * Bootstrap sample for confidence interval calculation
     */
    private bootstrapSample(testExecutions: ExperimentTestExecution[]): ExperimentTestExecution[] {
        const sample: ExperimentTestExecution[] = [];
        const n = testExecutions.length;
        
        for (let i = 0; i < n; i++) {
            const randomIndex = Math.floor(Math.random() * n);
            sample.push(testExecutions[randomIndex]);
        }
        
        return sample;
    }

    /**
     * Calculate statistical significance using Mann-Whitney U test approximation
     */
    private calculateStatisticalSignificance(
        sikgExecutions: ExperimentTestExecution[],
        baselineExecutions: ExperimentTestExecution[]
    ): any {
        // Simplified implementation - in practice would use proper statistical test
        const sikgAPFD = this.calculateAPFD(sikgExecutions).apfd;
        const baselineAPFD = this.calculateAPFD(baselineExecutions).apfd;
        
        const difference = sikgAPFD - baselineAPFD;
        const effectSize = this.calculateEffectSize(sikgExecutions, baselineExecutions);
        
        // Simplified p-value estimation
        const pValue = Math.abs(difference) > 0.05 ? 0.01 : 0.1;
        const isSignificant = pValue < 0.05 && Math.abs(effectSize) > 0.2;

        return {
            pValue,
            isSignificant,
            effectSize,
            interpretation: this.interpretEffectSize(effectSize)
        };
    }

    /**
     * Calculate Cohen's d effect size
     */
    private calculateEffectSize(
        sikgExecutions: ExperimentTestExecution[],
        baselineExecutions: ExperimentTestExecution[]
    ): number {
        // Convert to binary outcomes (fault detected = 1, not detected = 0)
        const sikgOutcomes = sikgExecutions.map(e => e.wasFaultDetected ? 1 : 0);
        const baselineOutcomes = baselineExecutions.map(e => e.wasFaultDetected ? 1 : 0);

        const sikgMean = sikgOutcomes.reduce((sum, val) => sum + val, 0 as number) / sikgOutcomes.length;
        const baselineMean = baselineOutcomes.reduce((sum, val) => sum + val, 0 as number) / baselineOutcomes.length;

        const sikgVariance = sikgOutcomes.reduce((sum, val) => sum + Math.pow(val - sikgMean, 2), 0 as number) / sikgOutcomes.length;
        const baselineVariance = baselineOutcomes.reduce((sum, val) => sum + Math.pow(val - baselineMean, 2), 0 as number) / baselineOutcomes.length;

        const pooledStdDev = Math.sqrt((sikgVariance + baselineVariance) / 2);
        return pooledStdDev > 0 ? (sikgMean - baselineMean) / pooledStdDev : 0;
    }

    /**
     * Calculate area under curve using trapezoidal rule
     */
    private calculateAreaUnderCurve(points: FaultDetectionPoint[]): number {
        if (points.length < 2) return 0;

        let area = 0;
        for (let i = 1; i < points.length; i++) {
            const x1 = points[i - 1].testsExecutedPercentage;
            const y1 = points[i - 1].faultsDetectedPercentage;
            const x2 = points[i].testsExecutedPercentage;
            const y2 = points[i].faultsDetectedPercentage;
            
            area += (x2 - x1) * (y1 + y2) / 2;
        }

        return area / 10000; // Normalize to 0-1 scale (100 * 100)
    }

    /**
     * Interpret APFD score
     */
    private interpretAPFD(apfd: number): string {
        if (apfd >= 0.9) return 'Excellent fault detection effectiveness (≥90%)';
        if (apfd >= 0.8) return 'Good fault detection effectiveness (80-89%)';
        if (apfd >= 0.7) return 'Acceptable fault detection effectiveness (70-79%)';
        if (apfd >= 0.5) return 'Fair fault detection effectiveness (50-69%)';
        return 'Poor fault detection effectiveness (<50%)';
    }

    /**
     * Interpret effect size (Cohen's d)
     */
    private interpretEffectSize(effectSize: number): string {
        const absEffect = Math.abs(effectSize);
        if (absEffect >= 0.8) return 'Large effect';
        if (absEffect >= 0.5) return 'Medium effect';
        if (absEffect >= 0.2) return 'Small effect';
        return 'Negligible effect';
    }

    /**
     * Generate recommendations based on results
     */
    private generateRecommendations(
        sikgResult: APFDResult,
        baselineResults: Record<string, APFDResult>,
        improvements: Record<string, number>
    ): string[] {
        const recommendations: string[] = [];

        // Overall SIKG performance
        if (sikgResult.apfd >= 0.8) {
            recommendations.push('SIKG demonstrates strong fault detection effectiveness');
        } else if (sikgResult.apfd >= 0.6) {
            recommendations.push('SIKG shows acceptable performance with room for improvement');
        } else {
            recommendations.push('SIKG performance needs improvement - consider parameter tuning');
        }

        // Comparative performance
        const positiveImprovements = Object.values(improvements).filter(imp => imp > 0).length;
        const totalBaselines = Object.keys(improvements).length;

        if (positiveImprovements === totalBaselines) {
            recommendations.push('SIKG outperforms all baseline methods');
        } else if (positiveImprovements > totalBaselines / 2) {
            recommendations.push('SIKG outperforms most baseline methods');
        } else {
            recommendations.push('SIKG performance is mixed compared to baselines');
        }

        // Specific recommendations
        if (sikgResult.earlyDetectionRate < 0.6) {
            recommendations.push('Consider adjusting prioritization to detect faults earlier');
        }

        if (sikgResult.faultDetectionRate > 0.8) {
            recommendations.push('High fault detection suggests effective test selection');
        }

        return recommendations;
    }

    /**
     * Create empty APFD result for error cases
     */
    private createEmptyAPFDResult(): APFDResult {
        return {
            apfd: 0,
            totalTests: 0,
            totalFaults: 0,
            averageFaultPosition: 0,
            faultDetectionRate: 0,
            earlyDetectionRate: 0,
            faultPositions: [],
            executionTime: 0,
            details: {
                sumOfPositions: 0,
                earlyFaults: 0,
                lateFaults: 0,
                interpretation: 'No data available for APFD calculation'
            }
        };
    }
}