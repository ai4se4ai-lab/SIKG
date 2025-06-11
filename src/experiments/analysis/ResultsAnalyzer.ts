// src/experiments/analysis/ResultsAnalyzer.ts - Comprehensive results analysis

import * as fs from 'fs';
import * as path from 'path';
import { StatisticalAnalysis, StatisticalTestResult } from '../metrics/StatisticalAnalysis';
import { ExperimentResult, ExperimentConfig, SubjectResult, MetricValues } from '../config/ExperimentConfig';
import { Logger } from '../../utils/Logger';

export interface AnalysisReport {
    summary: ExperimentSummary;
    researchQuestionAnalysis: ResearchQuestionAnalysis;
    statisticalResults: StatisticalResults;
    subjectAnalysis: SubjectAnalysis[];
    recommendations: string[];
    charts: ChartData[];
}

export interface ExperimentSummary {
    totalSubjects: number;
    totalIterations: number;
    successfulRuns: number;
    overallImprovement: Record<string, number>;
    significantMetrics: string[];
    effectSizes: Record<string, number>;
}

export interface ResearchQuestionAnalysis {
    rq1_effectiveness: {
        apfdImprovement: number;
        faultDetectionImprovement: number;
        significant: boolean;
        interpretation: string;
    };
    rq2_efficiency: {
        reductionAchieved: number;
        timeSavings: number;
        overhead: number;
        interpretation: string;
    };
    rq3_comparison: {
        bestBaseline: string;
        improvementOverBest: number;
        consistentWins: number;
        interpretation: string;
    };
    rq4_adaptation: {
        learningTrend: 'improving' | 'stable' | 'declining';
        adaptationSpeed: number;
        finalPerformance: number;
        interpretation: string;
    };
}

export interface StatisticalResults {
    overallComparison: StatisticalTestResult[];
    pairwiseComparisons: Record<string, StatisticalTestResult[]>;
    multipleComparisonCorrection: any;
    effectSizeAnalysis: Record<string, number>;
}

export interface SubjectAnalysis {
    subject: string;
    performance: Record<string, MetricValues>;
    bestMetrics: string[];
    challenges: string[];
    recommendations: string[];
}

export interface ChartData {
    type: 'line' | 'bar' | 'scatter' | 'box';
    title: string;
    description: string;
    data: any;
    config: any;
}

/**
 * Comprehensive analyzer for SIKG experiment results
 */
export class ResultsAnalyzer {
    private experimentResult: ExperimentResult;
    private config: ExperimentConfig;

    constructor(experimentResult: ExperimentResult) {
        this.experimentResult = experimentResult;
        this.config = experimentResult.config;
    }

    /**
     * Generate comprehensive analysis report
     */
    public generateAnalysisReport(): AnalysisReport {
        Logger.info('Generating comprehensive analysis report...');

        const summary = this.generateExperimentSummary();
        const researchQuestionAnalysis = this.analyzeResearchQuestions();
        const statisticalResults = this.performStatisticalAnalysis();
        const subjectAnalysis = this.analyzeSubjects();
        const recommendations = this.generateRecommendations(summary, researchQuestionAnalysis);
        const charts = this.generateChartData();

        return {
            summary,
            researchQuestionAnalysis,
            statisticalResults,
            subjectAnalysis,
            recommendations,
            charts
        };
    }

    /**
     * Generate experiment summary
     */
    private generateExperimentSummary(): ExperimentSummary {
        const results = this.experimentResult.results;
        const totalSubjects = results.length;
        const totalIterations = results.reduce((sum, r) => sum + r.iterations.length, 0);
        const successfulRuns = results.reduce((sum, r) => 
            sum + r.iterations.filter(iter => iter.sikgMetrics.apfd > 0).length, 0
        );

        // Calculate overall improvements
        const overallImprovement: Record<string, number> = {};
        const effectSizes: Record<string, number> = {};
        const metrics = ['apfd', 'precision', 'recall', 'f1Score', 'reductionRatio'];

        for (const metric of metrics) {
            const improvements = [];
            const sikgValues = [];
            const baselineValues = [];

            for (const result of results) {
                for (const iter of result.iterations) {
                    const sikgValue = iter.sikgMetrics[metric as keyof MetricValues];
                    sikgValues.push(sikgValue);

                    // Average across all baselines
                    const baselineAvg = Object.values(iter.baselineMetrics)
                        .reduce((sum, baseline) => sum + baseline[metric as keyof MetricValues], 0) / 
                        Object.keys(iter.baselineMetrics).length;
                    baselineValues.push(baselineAvg);
                    
                    improvements.push(sikgValue - baselineAvg);
                }
            }

            overallImprovement[metric] = improvements.reduce((sum, imp) => sum + imp, 0) / improvements.length;
            effectSizes[metric] = Math.abs(StatisticalAnalysis.cohensD(sikgValues, baselineValues));
        }

        const significantMetrics = metrics.filter(metric => Math.abs(overallImprovement[metric]) > 0.05);

        return {
            totalSubjects,
            totalIterations,
            successfulRuns,
            overallImprovement,
            significantMetrics,
            effectSizes
        };
    }

    /**
     * Analyze research questions
     */
    private analyzeResearchQuestions(): ResearchQuestionAnalysis {
        const results = this.experimentResult.results;

        // RQ1: Effectiveness Analysis
        const apfdValues = this.extractMetricValues('apfd');
        const faultDetectionValues = this.extractMetricValues('faultDetectionRate');
        
        const rq1_effectiveness = {
            apfdImprovement: this.calculateAverageImprovement('apfd'),
            faultDetectionImprovement: this.calculateAverageImprovement('faultDetectionRate'),
            significant: Math.abs(this.calculateAverageImprovement('apfd')) > 0.05,
            interpretation: this.interpretEffectiveness()
        };

        // RQ2: Efficiency Analysis
        const reductionValues = this.extractMetricValues('reductionRatio');
        const executionTimeValues = this.extractMetricValues('executionTime');
        const overheadValues = this.extractMetricValues('analysisOverhead');

        const rq2_efficiency = {
            reductionAchieved: this.calculateMean(reductionValues.sikg),
            timeSavings: this.calculateTimeSavings(),
            overhead: this.calculateMean(overheadValues.sikg),
            interpretation: this.interpretEfficiency()
        };

        // RQ3: Comparison Analysis
        const comparisonResults = this.analyzeBaselineComparisons();
        
        const rq3_comparison = {
            bestBaseline: comparisonResults.bestBaseline,
            improvementOverBest: comparisonResults.improvementOverBest,
            consistentWins: comparisonResults.consistentWins,
            interpretation: this.interpretComparison(comparisonResults)
        };

        // RQ4: Adaptation Analysis (Reinforcement Learning)
        const adaptationAnalysis = this.analyzeAdaptation();
        
        const rq4_adaptation = {
            learningTrend: adaptationAnalysis.trend,
            adaptationSpeed: adaptationAnalysis.speed,
            finalPerformance: adaptationAnalysis.finalPerformance,
            interpretation: this.interpretAdaptation(adaptationAnalysis)
        };

        return {
            rq1_effectiveness,
            rq2_efficiency,
            rq3_comparison,
            rq4_adaptation
        };
    }

    /**
     * Perform comprehensive statistical analysis
     */
    private performStatisticalAnalysis(): StatisticalResults {
        const metrics = ['apfd', 'precision', 'recall', 'f1Score', 'reductionRatio'];
        const overallComparison: StatisticalTestResult[] = [];
        const pairwiseComparisons: Record<string, StatisticalTestResult[]> = {};
        const effectSizeAnalysis: Record<string, number> = {};

        // Overall statistical tests
        for (const metric of metrics) {
            const values = this.extractMetricValues(metric);
            
            // Test SIKG vs average of all baselines
            const baselineAvg = this.calculateBaselineAverage(values);
            const comparison = StatisticalAnalysis.compareGroups(
                values.sikg, baselineAvg, ['SIKG', 'Baselines']
            );
            
            overallComparison.push(...comparison.tests);
            effectSizeAnalysis[metric] = comparison.tests[0]?.effectSize || 0;
        }

        // Pairwise comparisons with each baseline
        for (const baseline of this.config.baselines) {
            pairwiseComparisons[baseline] = [];
            
            for (const metric of metrics) {
                const values = this.extractMetricValues(metric);
                const baselineValues = values.baselines[baseline] || [];
                
                if (baselineValues.length > 0) {
                    const comparison = StatisticalAnalysis.compareGroups(
                        values.sikg, baselineValues, ['SIKG', baseline]
                    );
                    pairwiseComparisons[baseline].push(...comparison.tests);
                }
            }
        }

        // Multiple comparison correction
        const allPValues = overallComparison.map(test => test.pValue);
        const correctedPValues = StatisticalAnalysis.bonferroniCorrection(allPValues);
        
        const multipleComparisonCorrection = {
            originalPValues: allPValues,
            correctedPValues,
            significantAfterCorrection: correctedPValues.filter(p => p < 0.05).length
        };

        return {
            overallComparison,
            pairwiseComparisons,
            multipleComparisonCorrection,
            effectSizeAnalysis
        };
    }

    /**
     * Analyze individual subjects
     */
    private analyzeSubjects(): SubjectAnalysis[] {
        return this.experimentResult.results.map(result => {
            const subject = result.subject.name;
            const performance: Record<string, MetricValues> = {};
            
            // Calculate average performance for SIKG
            const metrics = ['apfd', 'precision', 'recall', 'f1Score', 'reductionRatio'];
            
            for (const metric of metrics) {
                const values = result.iterations.map(iter => 
                    iter.sikgMetrics[metric as keyof MetricValues]
                );
                
                performance[metric] = {
                    apfd: this.calculateMean(values),
                    faultDetectionRate: 0, // Placeholder
                    precision: 0, // Will be filled for respective metrics
                    recall: 0,
                    f1Score: 0,
                    reductionRatio: 0,
                    executionTime: 0,
                    analysisOverhead: 0
                };
                performance[metric][metric as keyof MetricValues] = this.calculateMean(values);
            }

            // Identify best and challenging metrics
            const bestMetrics = metrics.filter(metric => 
                performance[metric][metric as keyof MetricValues] > 0.7
            );
            
            const challenges = metrics.filter(metric => 
                performance[metric][metric as keyof MetricValues] < 0.5
            );

            const recommendations = this.generateSubjectRecommendations(result);

            return {
                subject,
                performance,
                bestMetrics,
                challenges,
                recommendations
            };
        });
    }

    /**
     * Generate recommendations based on analysis
     */
    private generateRecommendations(
        summary: ExperimentSummary,
        rqAnalysis: ResearchQuestionAnalysis
    ): string[] {
        const recommendations: string[] = [];

        // Effectiveness recommendations
        if (rqAnalysis.rq1_effectiveness.apfdImprovement > 0.1) {
            recommendations.push(
                `SIKG shows strong effectiveness with ${(rqAnalysis.rq1_effectiveness.apfdImprovement * 100).toFixed(1)}% APFD improvement. ` +
                `Consider deploying in production environments.`
            );
        } else if (rqAnalysis.rq1_effectiveness.apfdImprovement < 0.05) {
            recommendations.push(
                `Limited effectiveness improvement observed. Consider tuning semantic change classification ` +
                `or impact propagation parameters.`
            );
        }

        // Efficiency recommendations
        if (rqAnalysis.rq2_efficiency.reductionAchieved > 0.5) {
            recommendations.push(
                `Excellent test reduction of ${(rqAnalysis.rq2_efficiency.reductionAchieved * 100).toFixed(1)}%. ` +
                `SIKG effectively reduces testing overhead.`
            );
        }

        if (rqAnalysis.rq2_efficiency.overhead > 5000) {
            recommendations.push(
                `High analysis overhead detected (${rqAnalysis.rq2_efficiency.overhead}ms). ` +
                `Consider optimizing knowledge graph construction or caching mechanisms.`
            );
        }

        // Baseline comparison recommendations
        if (rqAnalysis.rq3_comparison.consistentWins >= this.config.baselines.length * 0.8) {
            recommendations.push(
                `SIKG consistently outperforms baselines. Strong evidence for practical superiority.`
            );
        }

        // Adaptation recommendations
        if (rqAnalysis.rq4_adaptation.learningTrend === 'improving') {
            recommendations.push(
                `Reinforcement learning shows positive adaptation. Continue monitoring for long-term trends.`
            );
        } else if (rqAnalysis.rq4_adaptation.learningTrend === 'declining') {
            recommendations.push(
                `RL performance declining. Review learning parameters and reward function design.`
            );
        }

        // Statistical significance recommendations
        if (summary.significantMetrics.length < 3) {
            recommendations.push(
                `Limited statistical significance. Consider increasing sample size or refining methodology.`
            );
        }

        return recommendations;
    }

    /**
     * Generate chart data for visualization
     */
    private generateChartData(): ChartData[] {
        const charts: ChartData[] = [];

        // APFD comparison chart
        charts.push(this.createAPFDComparisonChart());
        
        // Performance trends chart
        charts.push(this.createPerformanceTrendsChart());
        
        // Effect size chart
        charts.push(this.createEffectSizeChart());
        
        // Subject comparison chart
        charts.push(this.createSubjectComparisonChart());

        return charts;
    }

    // Helper methods for calculations
    private extractMetricValues(metric: string): {
        sikg: number[];
        baselines: Record<string, number[]>;
    } {
        const sikg: number[] = [];
        const baselines: Record<string, number[]> = {};
        
        // Initialize baseline arrays
        for (const baseline of this.config.baselines) {
            baselines[baseline] = [];
        }

        // Extract values from all iterations
        for (const result of this.experimentResult.results) {
            for (const iteration of result.iterations) {
                sikg.push(iteration.sikgMetrics[metric as keyof MetricValues]);
                
                for (const baseline of this.config.baselines) {
                    if (iteration.baselineMetrics[baseline]) {
                        baselines[baseline].push(
                            iteration.baselineMetrics[baseline][metric as keyof MetricValues]
                        );
                    }
                }
            }
        }

        return { sikg, baselines };
    }

    private calculateAverageImprovement(metric: string): number {
        const values = this.extractMetricValues(metric);
        const baselineAvg = this.calculateBaselineAverage(values);
        
        const sikgMean = this.calculateMean(values.sikg);
        const baselineMean = this.calculateMean(baselineAvg);
        
        return sikgMean - baselineMean;
    }

    private calculateBaselineAverage(values: { sikg: number[]; baselines: Record<string, number[]> }): number[] {
        const avgValues: number[] = [];
        const maxLength = Math.max(...Object.values(values.baselines).map(arr => arr.length));
        
        for (let i = 0; i < maxLength; i++) {
            let sum = 0;
            let count = 0;
            
            for (const baseline of Object.values(values.baselines)) {
                if (i < baseline.length) {
                    sum += baseline[i];
                    count++;
                }
            }
            
            if (count > 0) {
                avgValues.push(sum / count);
            }
        }
        
        return avgValues;
    }

    private calculateMean(values: number[]): number {
        return values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
    }

    private calculateTimeSavings(): number {
        const executionValues = this.extractMetricValues('executionTime');
        const reductionValues = this.extractMetricValues('reductionRatio');
        
        const avgReduction = this.calculateMean(reductionValues.sikg);
        return avgReduction; // Simplified calculation
    }

    private analyzeBaselineComparisons(): {
        bestBaseline: string;
        improvementOverBest: number;
        consistentWins: number;
    } {
        const baselinePerformance: Record<string, number> = {};
        
        // Calculate average APFD for each baseline
        for (const baseline of this.config.baselines) {
            const values = this.extractMetricValues('apfd');
            if (values.baselines[baseline].length > 0) {
                baselinePerformance[baseline] = this.calculateMean(values.baselines[baseline]);
            }
        }
        
        const bestBaseline = Object.entries(baselinePerformance)
            .reduce((best, [name, perf]) => perf > best[1] ? [name, perf] : best, ['', 0])[0];
        
        const sikgAPFD = this.calculateMean(this.extractMetricValues('apfd').sikg);
        const improvementOverBest = sikgAPFD - (baselinePerformance[bestBaseline] || 0);
        
        // Count consistent wins across metrics
        const metrics = ['apfd', 'precision', 'recall', 'f1Score'];
        let consistentWins = 0;
        
        for (const metric of metrics) {
            const values = this.extractMetricValues(metric);
            const sikgMean = this.calculateMean(values.sikg);
            
            let winsAgainstAll = true;
            for (const baseline of this.config.baselines) {
                const baselineMean = this.calculateMean(values.baselines[baseline] || []);
                if (sikgMean <= baselineMean) {
                    winsAgainstAll = false;
                    break;
                }
            }
            
            if (winsAgainstAll) {
                consistentWins++;
            }
        }
        
        return { bestBaseline, improvementOverBest, consistentWins };
    }

    private analyzeAdaptation(): {
        trend: 'improving' | 'stable' | 'declining';
        speed: number;
        finalPerformance: number;
    } {
        // Analyze learning trends across iterations
        const allIterations = this.experimentResult.results.flatMap(r => r.iterations);
        
        if (allIterations.length < 10) {
            return { trend: 'stable', speed: 0, finalPerformance: 0 };
        }
        
        // Sort by iteration order and calculate trend
        allIterations.sort((a, b) => a.iterationId - b.iterationId);
        const apfdValues = allIterations.map(iter => iter.sikgMetrics.apfd);
        
        // Simple linear regression to detect trend
        const n = apfdValues.length;
        const x = Array.from({ length: n }, (_, i) => i);
        const xMean = (n - 1) / 2;
        const yMean = this.calculateMean(apfdValues);
        
        const slope = x.reduce((sum, xi, i) => sum + (xi - xMean) * (apfdValues[i] - yMean), 0) /
                     x.reduce((sum, xi) => sum + Math.pow(xi - xMean, 2), 0);
        
        let trend: 'improving' | 'stable' | 'declining';
        if (slope > 0.001) trend = 'improving';
        else if (slope < -0.001) trend = 'declining';
        else trend = 'stable';
        
        const speed = Math.abs(slope);
        const finalPerformance = apfdValues[apfdValues.length - 1] || 0;
        
        return { trend, speed, finalPerformance };
    }

    private interpretEffectiveness(): string {
        const apfdImprovement = this.calculateAverageImprovement('apfd');
        const faultDetectionImprovement = this.calculateAverageImprovement('faultDetectionRate');
        
        if (apfdImprovement > 0.1 && faultDetectionImprovement > 0.1) {
            return 'SIKG demonstrates strong effectiveness in both fault detection ordering and coverage.';
        } else if (apfdImprovement > 0.05) {
            return 'SIKG shows moderate effectiveness improvement in test prioritization.';
        } else {
            return 'Limited effectiveness gains observed. Consider methodology refinements.';
        }
    }

    private interpretEfficiency(): string {
        const reductionAchieved = this.calculateMean(this.extractMetricValues('reductionRatio').sikg);
        const overhead = this.calculateMean(this.extractMetricValues('analysisOverhead').sikg);
        
        if (reductionAchieved > 0.5 && overhead < 3000) {
            return 'Excellent efficiency with high test reduction and low overhead.';
        } else if (reductionAchieved > 0.3) {
            return 'Good efficiency with meaningful test suite reduction.';
        } else {
            return 'Limited efficiency gains. Analysis overhead may offset benefits.';
        }
    }

    private interpretComparison(results: any): string {
        if (results.consistentWins >= 3) {
            return `SIKG consistently outperforms all baselines across ${results.consistentWins} metrics.`;
        } else if (results.improvementOverBest > 0.05) {
            return `SIKG shows meaningful improvement over the best baseline (${results.bestBaseline}).`;
        } else {
            return 'Mixed results compared to baselines. Performance varies by metric.';
        }
    }

    private interpretAdaptation(analysis: any): string {
        switch (analysis.trend) {
            case 'improving':
                return `Reinforcement learning shows positive adaptation with ${(analysis.speed * 100).toFixed(2)}% improvement rate.`;
            case 'declining':
                return 'Performance declining over iterations. RL parameters may need adjustment.';
            default:
                return 'Stable performance. RL maintains consistent results without significant drift.';
        }
    }

    private generateSubjectRecommendations(result: SubjectResult): string[] {
        const recommendations: string[] = [];
        const avgAPFD = this.calculateMean(result.iterations.map(iter => iter.sikgMetrics.apfd));
        const avgReduction = this.calculateMean(result.iterations.map(iter => iter.sikgMetrics.reductionRatio));
        
        if (avgAPFD < 0.6) {
            recommendations.push('Low APFD scores suggest need for better impact prediction tuning.');
        }
        
        if (avgReduction < 0.3) {
            recommendations.push('Limited test reduction. Consider adjusting selection thresholds.');
        }
        
        if (result.subject.size === 'large' && avgAPFD > 0.8) {
            recommendations.push('Excellent performance on large project. SIKG scales well.');
        }
        
        return recommendations;
    }

    // Chart generation methods
    private createAPFDComparisonChart(): ChartData {
        const values = this.extractMetricValues('apfd');
        const data = {
            labels: ['SIKG', ...this.config.baselines],
            datasets: [{
                label: 'Average APFD',
                data: [
                    this.calculateMean(values.sikg),
                    ...this.config.baselines.map(baseline => 
                        this.calculateMean(values.baselines[baseline] || [])
                    )
                ],
                backgroundColor: ['#4CAF50', '#FF9800', '#F44336', '#2196F3', '#9C27B0']
            }]
        };
        
        return {
            type: 'bar',
            title: 'APFD Comparison: SIKG vs Baselines',
            description: 'Average Percentage of Faults Detected comparison across all experiments',
            data,
            config: {
                responsive: true,
                scales: {
                    y: { beginAtZero: true, max: 1.0 }
                }
            }
        };
    }

    private createPerformanceTrendsChart(): ChartData {
        const allIterations = this.experimentResult.results.flatMap(r => r.iterations);
        allIterations.sort((a, b) => a.iterationId - b.iterationId);
        
        const data = {
            labels: allIterations.map((_, i) => `Iteration ${i + 1}`),
            datasets: [
                {
                    label: 'SIKG APFD',
                    data: allIterations.map(iter => iter.sikgMetrics.apfd),
                    borderColor: '#4CAF50',
                    fill: false
                },
                {
                    label: 'SIKG F1 Score',
                    data: allIterations.map(iter => iter.sikgMetrics.f1Score),
                    borderColor: '#2196F3',
                    fill: false
                }
            ]
        };
        
        return {
            type: 'line',
            title: 'Performance Trends Over Iterations',
            description: 'SIKG performance evolution showing learning effects',
            data,
            config: {
                responsive: true,
                scales: {
                    y: { beginAtZero: true, max: 1.0 }
                }
            }
        };
    }

    private createEffectSizeChart(): ChartData {
        const metrics = ['apfd', 'precision', 'recall', 'f1Score', 'reductionRatio'];
        const effectSizes = metrics.map(metric => {
            const values = this.extractMetricValues(metric);
            const baselineAvg = this.calculateBaselineAverage(values);
            return Math.abs(StatisticalAnalysis.cohensD(values.sikg, baselineAvg));
        });
        
        const data = {
            labels: metrics.map(m => m.toUpperCase()),
            datasets: [{
                label: 'Effect Size (Cohen\'s d)',
                data: effectSizes,
                backgroundColor: effectSizes.map(es => {
                    if (es >= 0.8) return '#4CAF50'; // Large effect
                    if (es >= 0.5) return '#FF9800'; // Medium effect
                    if (es >= 0.2) return '#FFC107'; // Small effect
                    return '#F44336'; // Negligible effect
                })
            }]
        };
        
        return {
            type: 'bar',
            title: 'Effect Sizes by Metric',
            description: 'Cohen\'s d effect sizes showing practical significance',
            data,
            config: {
                responsive: true,
                scales: {
                    y: { beginAtZero: true }
                }
            }
        };
    }

    private createSubjectComparisonChart(): ChartData {
        const subjects = this.experimentResult.results.map(r => r.subject.name);
        const apfdData = this.experimentResult.results.map(r => 
            this.calculateMean(r.iterations.map(iter => iter.sikgMetrics.apfd))
        );
        const reductionData = this.experimentResult.results.map(r => 
            this.calculateMean(r.iterations.map(iter => iter.sikgMetrics.reductionRatio))
        );
        
        const data = {
            labels: subjects,
            datasets: [
                {
                    label: 'APFD',
                    data: apfdData,
                    backgroundColor: '#4CAF50'
                },
                {
                    label: 'Reduction Ratio',
                    data: reductionData,
                    backgroundColor: '#2196F3'
                }
            ]
        };
        
        return {
            type: 'bar',
            title: 'Performance by Subject Project',
            description: 'SIKG performance across different project types and sizes',
            data,
            config: {
                responsive: true,
                scales: {
                    y: { beginAtZero: true, max: 1.0 }
                }
            }
        };
    }

    /**
     * Export analysis results to various formats
     */
    public exportResults(report: AnalysisReport, outputDir: string): void {
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Export JSON report
        const jsonPath = path.join(outputDir, 'analysis_report.json');
        fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

        // Export CSV summary
        const csvPath = path.join(outputDir, 'experiment_summary.csv');
        this.exportCSVSummary(report, csvPath);

        // Export statistical results
        const statsPath = path.join(outputDir, 'statistical_results.json');
        fs.writeFileSync(statsPath, JSON.stringify(report.statisticalResults, null, 2));

        Logger.info(`Analysis results exported to ${outputDir}`);
    }

    private exportCSVSummary(report: AnalysisReport, csvPath: string): void {
        const headers = ['Metric', 'SIKG_Mean', 'Baseline_Mean', 'Improvement', 'Effect_Size', 'P_Value'];
        const rows = [headers.join(',')];

        const metrics = ['apfd', 'precision', 'recall', 'f1Score', 'reductionRatio'];
        
        for (const metric of metrics) {
            const values = this.extractMetricValues(metric);
            const sikgMean = this.calculateMean(values.sikg);
            const baselineAvg = this.calculateBaselineAverage(values);
            const baselineMean = this.calculateMean(baselineAvg);
            const improvement = sikgMean - baselineMean;
            const effectSize = report.summary.effectSizes[metric] || 0;
            
            // Find corresponding statistical test
            const statTest = report.statisticalResults.overallComparison.find(test => 
                test.interpretation.toLowerCase().includes(metric)
            );
            const pValue = statTest?.pValue || 1.0;

            const row = [
                metric,
                sikgMean.toFixed(4),
                baselineMean.toFixed(4),
                improvement.toFixed(4),
                effectSize.toFixed(4),
                pValue.toFixed(4)
            ].join(',');
            
            rows.push(row);
        }

        fs.writeFileSync(csvPath, rows.join('\n'));
    }
}