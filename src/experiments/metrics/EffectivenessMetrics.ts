// EffectivenessMetrics.ts - Test selection effectiveness calculation and analysis

import { ExperimentData, SyntheticFault } from '../data/DataCollector';
import { ChangeType } from '../config/ExperimentConfig';
import { Logger } from '../../utils/Logger';

export interface EffectivenessMetrics {
    precision: number;
    recall: number;
    f1Score: number;
    accuracy: number;
    specificity: number;
    mcc: number; // Matthews Correlation Coefficient
    
    // Test selection specific metrics
    faultDetectionRate: number;
    reductionRatio: number;
    selectionAccuracy: number;
    
    // APFD and prioritization metrics
    apfd: number;
    avgFaultPosition: number;
    earlyDetectionRate: number;
    
    // Efficiency metrics
    avgExecutionTime: number;
    totalExecutionTime: number;
    timeToFirstFault: number;
    
    // Confidence metrics
    confidenceInterval: ConfidenceInterval;
    sampleSize: number;
}

export interface ConfidenceInterval {
    lower: number;
    upper: number;
    confidence: number; // e.g., 0.95 for 95%
}

export interface ConfusionMatrix {
    truePositives: number;
    falsePositives: number;
    trueNegatives: number;
    falseNegatives: number;
    total: number;
}

export interface FaultDetectionAnalysis {
    totalFaults: number;
    detectedFaults: number;
    missedFaults: number;
    faultsByType: Record<string, number>;
    detectionByType: Record<string, number>;
    faultPositions: number[];
    averageDetectionPosition: number;
}

export interface ComparisonResult {
    approach1: string;
    approach2: string;
    metrics1: EffectivenessMetrics;
    metrics2: EffectivenessMetrics;
    
    // Statistical comparison
    significantDifference: boolean;
    pValue: number;
    effectSize: number;
    
    // Practical differences
    f1Improvement: number;
    apfdImprovement: number;
    efficiencyImprovement: number;
    
    conclusion: string;
}

export interface TrendAnalysis {
    metric: keyof EffectivenessMetrics;
    trend: 'improving' | 'declining' | 'stable';
    changeRate: number; // Per iteration
    confidence: number;
    dataPoints: { iteration: number; value: number }[];
}

/**
 * Calculates and analyzes test selection effectiveness metrics
 */
export class EffectivenessMetricsCalculator {
    private confidenceLevel: number = 0.95;

    constructor(confidenceLevel: number = 0.95) {
        this.confidenceLevel = confidenceLevel;
    }

    /**
     * Calculate comprehensive effectiveness metrics for an approach
     */
    public calculateEffectiveness(
        experimentData: ExperimentData[],
        approach: string
    ): EffectivenessMetrics {
        const approachData = experimentData.filter(d => d.approach === approach);
        
        if (approachData.length === 0) {
            Logger.warn(`No data found for approach: ${approach}`);
            return this.createEmptyMetrics();
        }

        // Calculate confusion matrix
        const confusionMatrix = this.calculateConfusionMatrix(approachData);
        
        // Basic classification metrics
        const precision = this.calculatePrecision(confusionMatrix);
        const recall = this.calculateRecall(confusionMatrix);
        const f1Score = this.calculateF1Score(precision, recall);
        const accuracy = this.calculateAccuracy(confusionMatrix);
        const specificity = this.calculateSpecificity(confusionMatrix);
        const mcc = this.calculateMCC(confusionMatrix);

        // Test selection specific metrics
        const faultDetectionRate = this.calculateFaultDetectionRate(approachData);
        const reductionRatio = this.calculateReductionRatio(approachData);
        const selectionAccuracy = this.calculateSelectionAccuracy(approachData);

        // APFD and prioritization metrics
        const apfdMetrics = this.calculateAPFDMetrics(approachData);

        // Efficiency metrics
        const efficiencyMetrics = this.calculateEfficiencyMetrics(approachData);

        // Confidence interval for F1-score
        const confidenceInterval = this.calculateConfidenceInterval(
            approachData.map(d => d.f1Score),
            this.confidenceLevel
        );

        return {
            precision,
            recall,
            f1Score,
            accuracy,
            specificity,
            mcc,
            faultDetectionRate,
            reductionRatio,
            selectionAccuracy,
            apfd: apfdMetrics.apfd,
            avgFaultPosition: apfdMetrics.avgFaultPosition,
            earlyDetectionRate: apfdMetrics.earlyDetectionRate,
            avgExecutionTime: efficiencyMetrics.avgExecutionTime,
            totalExecutionTime: efficiencyMetrics.totalExecutionTime,
            timeToFirstFault: efficiencyMetrics.timeToFirstFault,
            confidenceInterval,
            sampleSize: approachData.length
        };
    }

    /**
     * Calculate confusion matrix from experiment data
     */
    private calculateConfusionMatrix(data: ExperimentData[]): ConfusionMatrix {
        let truePositives = 0;   // Selected tests that found faults
        let falsePositives = 0;  // Selected tests that didn't find faults
        let trueNegatives = 0;   // Non-selected tests that wouldn't find faults
        let falseNegatives = 0;  // Non-selected tests that would find faults

        for (const experiment of data) {
            const selectedTests = experiment.selectedTests;
            const totalTests = experiment.totalTests;
            const faultsDetected = experiment.faultsDetected;
            const faultsInjected = experiment.faultsInjected;

            // Estimate true positives and false positives
            if (selectedTests > 0) {
                const detectionRate = faultsDetected / Math.max(1, faultsInjected);
                const estimatedTP = Math.round(selectedTests * detectionRate);
                const estimatedFP = selectedTests - estimatedTP;
                
                truePositives += estimatedTP;
                falsePositives += estimatedFP;
            }

            // Estimate true negatives and false negatives
            const nonSelectedTests = totalTests - selectedTests;
            const missedFaults = faultsInjected - faultsDetected;
            
            // Assume some missed faults would be found by non-selected tests
            const estimatedFN = Math.min(missedFaults, Math.round(nonSelectedTests * 0.1));
            const estimatedTN = nonSelectedTests - estimatedFN;
            
            trueNegatives += estimatedTN;
            falseNegatives += estimatedFN;
        }

        return {
            truePositives,
            falsePositives,
            trueNegatives,
            falseNegatives,
            total: truePositives + falsePositives + trueNegatives + falseNegatives
        };
    }

    /**
     * Calculate precision: TP / (TP + FP)
     */
    private calculatePrecision(cm: ConfusionMatrix): number {
        const denominator = cm.truePositives + cm.falsePositives;
        return denominator > 0 ? cm.truePositives / denominator : 0;
    }

    /**
     * Calculate recall (sensitivity): TP / (TP + FN)
     */
    private calculateRecall(cm: ConfusionMatrix): number {
        const denominator = cm.truePositives + cm.falseNegatives;
        return denominator > 0 ? cm.truePositives / denominator : 0;
    }

    /**
     * Calculate F1-score: 2 * (precision * recall) / (precision + recall)
     */
    private calculateF1Score(precision: number, recall: number): number {
        const sum = precision + recall;
        return sum > 0 ? (2 * precision * recall) / sum : 0;
    }

    /**
     * Calculate accuracy: (TP + TN) / (TP + FP + TN + FN)
     */
    private calculateAccuracy(cm: ConfusionMatrix): number {
        return cm.total > 0 ? (cm.truePositives + cm.trueNegatives) / cm.total : 0;
    }

    /**
     * Calculate specificity: TN / (TN + FP)
     */
    private calculateSpecificity(cm: ConfusionMatrix): number {
        const denominator = cm.trueNegatives + cm.falsePositives;
        return denominator > 0 ? cm.trueNegatives / denominator : 0;
    }

    /**
     * Calculate Matthews Correlation Coefficient
     */
    private calculateMCC(cm: ConfusionMatrix): number {
        const { truePositives: tp, falsePositives: fp, trueNegatives: tn, falseNegatives: fn } = cm;
        
        const numerator = (tp * tn) - (fp * fn);
        const denominator = Math.sqrt((tp + fp) * (tp + fn) * (tn + fp) * (tn + fn));
        
        return denominator > 0 ? numerator / denominator : 0;
    }

    /**
     * Calculate fault detection rate: detected faults / total faults
     */
    private calculateFaultDetectionRate(data: ExperimentData[]): number {
        const totalFaultsDetected = data.reduce((sum, d) => sum + d.faultsDetected, 0);
        const totalFaultsInjected = data.reduce((sum, d) => sum + d.faultsInjected, 0);
        
        return totalFaultsInjected > 0 ? totalFaultsDetected / totalFaultsInjected : 0;
    }

    /**
     * Calculate test suite reduction ratio: 1 - (selected / total)
     */
    private calculateReductionRatio(data: ExperimentData[]): number {
        const avgSelected = data.reduce((sum, d) => sum + d.selectedTests, 0) / data.length;
        const avgTotal = data.reduce((sum, d) => sum + d.totalTests, 0) / data.length;
        
        return avgTotal > 0 ? 1 - (avgSelected / avgTotal) : 0;
    }

    /**
     * Calculate selection accuracy: correct selections / total selections
     */
    private calculateSelectionAccuracy(data: ExperimentData[]): number {
        let correctSelections = 0;
        let totalSelections = 0;

        for (const experiment of data) {
            // Estimate correct selections based on fault detection
            const selectionEffectiveness = experiment.faultsInjected > 0 ? 
                experiment.faultsDetected / experiment.faultsInjected : 0.5;
            
            correctSelections += experiment.selectedTests * selectionEffectiveness;
            totalSelections += experiment.selectedTests;
        }

        return totalSelections > 0 ? correctSelections / totalSelections : 0;
    }

    /**
     * Calculate APFD and related prioritization metrics
     */
    private calculateAPFDMetrics(data: ExperimentData[]): {
        apfd: number;
        avgFaultPosition: number;
        earlyDetectionRate: number;
    } {
        let totalAPFD = 0;
        let totalFaultPositions = 0;
        let totalFaults = 0;
        let earlyFaults = 0;

        for (const experiment of data) {
            const selectedTests = experiment.selectedTests;
            const faultsDetected = experiment.faultsDetected;
            
            if (selectedTests > 0 && faultsDetected > 0) {
                // Simulate fault positions (assume evenly distributed for simplicity)
                const faultPositions: number[] = [];
                for (let i = 0; i < faultsDetected; i++) {
                    const position = Math.floor((i + 1) * selectedTests / faultsDetected);
                    faultPositions.push(position);
                }

                // Calculate APFD for this experiment
                const sumOfPositions = faultPositions.reduce((sum, pos) => sum + pos, 0);
                const apfd = 1 - (sumOfPositions / (selectedTests * faultsDetected)) + (1 / (2 * selectedTests));
                
                totalAPFD += apfd;
                totalFaultPositions += sumOfPositions;
                totalFaults += faultsDetected;

                // Count early faults (in first 50% of tests)
                const earlyFaultCount = faultPositions.filter(pos => pos <= selectedTests / 2).length;
                earlyFaults += earlyFaultCount;
            }
        }

        const avgAPFD = data.length > 0 ? totalAPFD / data.length : 0;
        const avgFaultPosition = totalFaults > 0 ? totalFaultPositions / totalFaults : 0;
        const earlyDetectionRate = totalFaults > 0 ? earlyFaults / totalFaults : 0;

        return {
            apfd: avgAPFD,
            avgFaultPosition,
            earlyDetectionRate
        };
    }

    /**
     * Calculate efficiency metrics
     */
    private calculateEfficiencyMetrics(data: ExperimentData[]): {
        avgExecutionTime: number;
        totalExecutionTime: number;
        timeToFirstFault: number;
    } {
        const avgExecutionTime = data.reduce((sum, d) => sum + d.avgTestTime, 0) / data.length;
        const totalExecutionTime = data.reduce((sum, d) => sum + d.executionTime, 0);
        
        // Estimate time to first fault (assuming faults are detected early)
        const timeToFirstFault = data.filter(d => d.faultsDetected > 0)
            .reduce((sum, d) => sum + (d.avgTestTime * 0.3), 0) / data.length; // Assume first fault found at 30% of execution

        return {
            avgExecutionTime,
            totalExecutionTime,
            timeToFirstFault
        };
    }

    /**
     * Calculate confidence interval for a metric
     */
    private calculateConfidenceInterval(values: number[], confidence: number): ConfidenceInterval {
        if (values.length === 0) {
            return { lower: 0, upper: 0, confidence };
        }

        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (values.length - 1);
        const standardError = Math.sqrt(variance / values.length);

        // Use t-distribution for small samples, normal for large samples
        const tValue = values.length < 30 ? this.getTValue(values.length - 1, confidence) : this.getZValue(confidence);
        const margin = tValue * standardError;

        return {
            lower: Math.max(0, mean - margin),
            upper: Math.min(1, mean + margin),
            confidence
        };
    }

    /**
     * Compare effectiveness between two approaches
     */
    public compareApproaches(
        data: ExperimentData[],
        approach1: string,
        approach2: string
    ): ComparisonResult {
        const metrics1 = this.calculateEffectiveness(data, approach1);
        const metrics2 = this.calculateEffectiveness(data, approach2);

        // Statistical significance test (simplified t-test)
        const data1 = data.filter(d => d.approach === approach1).map(d => d.f1Score);
        const data2 = data.filter(d => d.approach === approach2).map(d => d.f1Score);
        const { significantDifference, pValue } = this.performTTest(data1, data2);

        // Effect size (Cohen's d)
        const effectSize = this.calculateCohenD(data1, data2);

        // Practical differences
        const f1Improvement = ((metrics1.f1Score - metrics2.f1Score) / metrics2.f1Score) * 100;
        const apfdImprovement = ((metrics1.apfd - metrics2.apfd) / metrics2.apfd) * 100;
        const efficiencyImprovement = ((metrics2.avgExecutionTime - metrics1.avgExecutionTime) / metrics2.avgExecutionTime) * 100;

        // Generate conclusion
        const conclusion = this.generateComparisonConclusion(
            approach1, approach2, f1Improvement, significantDifference, effectSize
        );

        return {
            approach1,
            approach2,
            metrics1,
            metrics2,
            significantDifference,
            pValue,
            effectSize,
            f1Improvement,
            apfdImprovement,
            efficiencyImprovement,
            conclusion
        };
    }

    /**
     * Analyze trends over iterations
     */
    public analyzeTrends(
        data: ExperimentData[],
        approach: string,
        metric: keyof EffectivenessMetrics
    ): TrendAnalysis {
        const approachData = data
            .filter(d => d.approach === approach)
            .sort((a, b) => a.iteration - b.iteration);

        if (approachData.length < 3) {
            return {
                metric,
                trend: 'stable',
                changeRate: 0,
                confidence: 0,
                dataPoints: []
            };
        }

        // Extract data points
        const dataPoints = approachData.map(d => ({
            iteration: d.iteration,
            value: this.extractMetricValue(d, metric)
        }));

        // Simple linear regression to detect trend
        const { slope, rSquared } = this.linearRegression(
            dataPoints.map(p => p.iteration),
            dataPoints.map(p => p.value)
        );

        // Determine trend direction
        let trend: 'improving' | 'declining' | 'stable';
        if (Math.abs(slope) < 0.001) {
            trend = 'stable';
        } else if (slope > 0) {
            trend = 'improving';
        } else {
            trend = 'declining';
        }

        return {
            metric,
            trend,
            changeRate: slope,
            confidence: rSquared,
            dataPoints
        };
    }

    /**
     * Analyze fault detection patterns
     */
    public analyzeFaultDetection(
        data: ExperimentData[],
        faultData?: SyntheticFault[]
    ): FaultDetectionAnalysis {
        const totalFaults = data.reduce((sum, d) => sum + d.faultsInjected, 0);
        const detectedFaults = data.reduce((sum, d) => sum + d.faultsDetected, 0);
        const missedFaults = totalFaults - detectedFaults;

        // Analyze by fault type (if fault data available)
        const faultsByType: Record<string, number> = {};
        const detectionByType: Record<string, number> = {};

        if (faultData) {
            for (const fault of faultData) {
                faultsByType[fault.type] = (faultsByType[fault.type] || 0) + 1;
                
                // Estimate detection based on detectability
                if (Math.random() < fault.detectability) {
                    detectionByType[fault.type] = (detectionByType[fault.type] || 0) + 1;
                }
            }
        }

        // Simulate fault positions
        const faultPositions: number[] = [];
        for (const experiment of data) {
            for (let i = 0; i < experiment.faultsDetected; i++) {
                const position = Math.floor(Math.random() * experiment.selectedTests) + 1;
                faultPositions.push(position);
            }
        }

        const averageDetectionPosition = faultPositions.length > 0 ?
            faultPositions.reduce((sum, pos) => sum + pos, 0) / faultPositions.length : 0;

        return {
            totalFaults,
            detectedFaults,
            missedFaults,
            faultsByType,
            detectionByType,
            faultPositions,
            averageDetectionPosition
        };
    }

    /**
     * Generate effectiveness summary report
     */
    public generateEffectivenessSummary(
        data: ExperimentData[],
        approaches: string[]
    ): {
        overall: EffectivenessMetrics;
        byApproach: Record<string, EffectivenessMetrics>;
        rankings: { approach: string; f1Score: number; rank: number }[];
        recommendations: string[];
    } {
        // Calculate overall metrics
        const overall = this.calculateEffectiveness(data, ''); // All data

        // Calculate by approach
        const byApproach: Record<string, EffectivenessMetrics> = {};
        for (const approach of approaches) {
            byApproach[approach] = this.calculateEffectiveness(data, approach);
        }

        // Create rankings
        const rankings = approaches
            .map(approach => ({
                approach,
                f1Score: byApproach[approach].f1Score,
                rank: 0
            }))
            .sort((a, b) => b.f1Score - a.f1Score)
            .map((item, index) => ({ ...item, rank: index + 1 }));

        // Generate recommendations
        const recommendations = this.generateRecommendations(byApproach, rankings);

        return {
            overall,
            byApproach,
            rankings,
            recommendations
        };
    }

    // Helper methods

    private createEmptyMetrics(): EffectivenessMetrics {
        return {
            precision: 0, recall: 0, f1Score: 0, accuracy: 0, specificity: 0, mcc: 0,
            faultDetectionRate: 0, reductionRatio: 0, selectionAccuracy: 0,
            apfd: 0, avgFaultPosition: 0, earlyDetectionRate: 0,
            avgExecutionTime: 0, totalExecutionTime: 0, timeToFirstFault: 0,
            confidenceInterval: { lower: 0, upper: 0, confidence: 0.95 },
            sampleSize: 0
        };
    }

    private getTValue(df: number, confidence: number): number {
        // Simplified t-value lookup (in practice, would use statistical library)
        const alpha = 1 - confidence;
        if (confidence === 0.95) return df >= 30 ? 1.96 : 2.045; // Approximation
        if (confidence === 0.99) return df >= 30 ? 2.576 : 2.756;
        return 1.96; // Default
    }

    private getZValue(confidence: number): number {
        if (confidence === 0.95) return 1.96;
        if (confidence === 0.99) return 2.576;
        if (confidence === 0.90) return 1.645;
        return 1.96; // Default
    }

    private performTTest(data1: number[], data2: number[]): { significantDifference: boolean; pValue: number } {
        // Simplified t-test (in practice, would use proper statistical library)
        if (data1.length < 2 || data2.length < 2) {
            return { significantDifference: false, pValue: 1.0 };
        }

        const mean1 = data1.reduce((sum, val) => sum + val, 0) / data1.length;
        const mean2 = data2.reduce((sum, val) => sum + val, 0) / data2.length;
        
        const var1 = data1.reduce((sum, val) => sum + Math.pow(val - mean1, 2), 0) / (data1.length - 1);
        const var2 = data2.reduce((sum, val) => sum + Math.pow(val - mean2, 2), 0) / (data2.length - 1);
        
        const pooledSE = Math.sqrt(var1 / data1.length + var2 / data2.length);
        const tStat = Math.abs(mean1 - mean2) / pooledSE;
        
        // Simplified p-value calculation
        const pValue = tStat > 1.96 ? 0.05 : 0.1; // Very simplified
        const significantDifference = pValue < 0.05;

        return { significantDifference, pValue };
    }

    private calculateCohenD(data1: number[], data2: number[]): number {
        if (data1.length < 2 || data2.length < 2) return 0;

        const mean1 = data1.reduce((sum, val) => sum + val, 0) / data1.length;
        const mean2 = data2.reduce((sum, val) => sum + val, 0) / data2.length;
        
        const var1 = data1.reduce((sum, val) => sum + Math.pow(val - mean1, 2), 0) / (data1.length - 1);
        const var2 = data2.reduce((sum, val) => sum + Math.pow(val - mean2, 2), 0) / (data2.length - 1);
        
        const pooledSD = Math.sqrt((var1 + var2) / 2);
        
        return pooledSD > 0 ? Math.abs(mean1 - mean2) / pooledSD : 0;
    }

    private generateComparisonConclusion(
        approach1: string, approach2: string, improvement: number, 
        significant: boolean, effectSize: number
    ): string {
        const absImprovement = Math.abs(improvement);
        const better = improvement > 0 ? approach1 : approach2;
        
        let magnitude = 'small';
        if (effectSize > 0.8) magnitude = 'large';
        else if (effectSize > 0.5) magnitude = 'medium';
        
        return `${better} performs ${absImprovement.toFixed(1)}% better with ${magnitude} effect size. ` +
               `Difference is ${significant ? 'statistically significant' : 'not statistically significant'}.`;
    }

    private extractMetricValue(data: ExperimentData, metric: keyof EffectivenessMetrics): number {
        // Map experiment data fields to effectiveness metrics
        switch (metric) {
            case 'precision': return data.precision;
            case 'recall': return data.recall;
            case 'f1Score': return data.f1Score;
            case 'apfd': return data.apfd;
            case 'faultDetectionRate': return data.faultsDetected / Math.max(1, data.faultsInjected);
            case 'reductionRatio': return data.reductionRatio;
            case 'avgExecutionTime': return data.avgTestTime;
            default: return 0;
        }
    }

    private linearRegression(x: number[], y: number[]): { slope: number; rSquared: number } {
        const n = x.length;
        if (n === 0) return { slope: 0, rSquared: 0 };

        const sumX = x.reduce((sum, val) => sum + val, 0);
        const sumY = y.reduce((sum, val) => sum + val, 0);
        const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
        const sumXX = x.reduce((sum, val) => sum + val * val, 0);
        const sumYY = y.reduce((sum, val) => sum + val * val, 0);

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        
        // Calculate R-squared
        const meanY = sumY / n;
        const ssRes = y.reduce((sum, val, i) => {
            const predicted = slope * x[i] + (sumY - slope * sumX) / n;
            return sum + Math.pow(val - predicted, 2);
        }, 0);
        const ssTot = y.reduce((sum, val) => sum + Math.pow(val - meanY, 2), 0);
        const rSquared = ssTot > 0 ? 1 - (ssRes / ssTot) : 0;

        return { slope, rSquared };
    }

    private generateRecommendations(
        byApproach: Record<string, EffectivenessMetrics>,
        rankings: { approach: string; f1Score: number; rank: number }[]
    ): string[] {
        const recommendations: string[] = [];
        
        const topApproach = rankings[0];
        const worstApproach = rankings[rankings.length - 1];
        
        recommendations.push(`Best approach: ${topApproach.approach} (F1: ${(topApproach.f1Score * 100).toFixed(1)}%)`);
        
        if (topApproach.f1Score > 0.9) {
            recommendations.push('Excellent performance achieved - consider deploying this approach');
        } else if (topApproach.f1Score > 0.8) {
            recommendations.push('Good performance - minor optimizations may help');
        } else {
            recommendations.push('Performance has room for improvement - consider parameter tuning');
        }
        
        // Check for concerning patterns
        const avgReduction = Object.values(byApproach).reduce((sum, m) => sum + m.reductionRatio, 0) / Object.keys(byApproach).length;
        if (avgReduction < 0.3) {
            recommendations.push('Low test reduction - consider more aggressive selection criteria');
        }
        
        const avgAPFD = Object.values(byApproach).reduce((sum, m) => sum + m.apfd, 0) / Object.keys(byApproach).length;
        if (avgAPFD < 0.7) {
            recommendations.push('Low APFD scores - improve test prioritization strategy');
        }
        
        return recommendations;
    }
}