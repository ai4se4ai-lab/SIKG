// ComparisonRunner.ts - Compare SIKG against baseline test selection approaches

import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../../utils/Logger';
import { SIKGManager } from '../../sikg/SIKGManager';
import { TestPrioritizer } from '../../sikg/TestPrioritizer';
import { ChangeAnalyzer } from '../../sikg/ChangeAnalyzer';
import { ConfigManager } from '../../utils/ConfigManager';
import { APFDCalculator } from '../../sikg/evaluation/APFDCalculator';
import { StatisticalAnalysis } from '../metrics/StatisticalAnalysis';
import { DataCollector } from '../data/DataCollector';
import { ProjectAnalyzer } from '../data/ProjectAnalyzer';
import { ExperimentConfig, SubjectProject } from '../config/ExperimentConfig';
import { 
    RandomSelector, 
    EkstaziSelector, 
    HistoryBasedSelector,
    BaselineSelector 
} from '../baseline';

/**
 * Comparison experiment result for a single iteration
 */
export interface ComparisonResult {
    iteration: number;
    projectName: string;
    commitHash: string;
    changesetSize: number;
    totalTests: number;
    approaches: {
        sikg: ApproachResult;
        random: ApproachResult;
        ekstazi: ApproachResult;
        historyBased: ApproachResult;
        impactSorted: ApproachResult;
    };
    metadata: {
        timestamp: string;
        executionTimeMs: number;
        semanticChanges: number;
        changedFiles: string[];
    };
}

/**
 * Results for a single approach
 */
export interface ApproachResult {
    selectedTests: string[];
    testSelectionTimeMs: number;
    totalExecutionTimeMs: number;
    faultsDetected: number;
    testResults: {
        passed: number;
        failed: number;
        skipped: number;
    };
    metrics: {
        apfd: number;
        precision: number;
        recall: number;
        f1Score: number;
        reductionRatio: number;
        faultDetectionRate: number;
    };
    errors?: string[];
}

/**
 * Aggregated comparison results across multiple iterations
 */
export interface AggregatedComparisonResults {
    projectName: string;
    iterations: number;
    summary: {
        [approach: string]: {
            averageMetrics: ApproachResult['metrics'];
            medianMetrics: ApproachResult['metrics'];
            standardDeviations: ApproachResult['metrics'];
            confidenceIntervals: {
                [metric: string]: { lower: number; upper: number };
            };
        };
    };
    statisticalTests: {
        [comparison: string]: {
            pValue: number;
            significant: boolean;
            effectSize: number;
            interpretation: string;
        };
    };
    rankings: {
        [metric: string]: string[]; // Approaches ranked by metric
    };
}

/**
 * Final comparison report across all projects
 */
export interface ComparisonReport {
    totalProjects: number;
    totalIterations: number;
    executionTime: number;
    projectResults: AggregatedComparisonResults[];
    overallSummary: {
        sikgAdvantages: string[];
        statisticalSignificance: { [metric: string]: number }; // Percentage of projects where SIKG is significantly better
        effectSizes: { [metric: string]: number }; // Average effect sizes
        recommendations: string[];
    };
    metadata: {
        timestamp: string;
        configuration: ExperimentConfig;
        subjects: SubjectProject[];
    };
}

/**
 * ComparisonRunner - Executes comprehensive comparison between SIKG and baseline approaches
 */
export class ComparisonRunner {
    private sikgManager: SIKGManager;
    private testPrioritizer: TestPrioritizer;
    private changeAnalyzer: ChangeAnalyzer;
    private configManager: ConfigManager;
    private apfdCalculator: APFDCalculator;
    private statisticalAnalysis: StatisticalAnalysis;
    private dataCollector: DataCollector;
    private projectAnalyzer: ProjectAnalyzer;
    
    // Baseline selectors
    private baselines: Map<string, BaselineSelector> = new Map();
    
    // Results storage
    private allResults: ComparisonResult[] = [];
    private config: ExperimentConfig;

    constructor(
        sikgManager: SIKGManager,
        configManager: ConfigManager,
        config: ExperimentConfig
    ) {
        this.sikgManager = sikgManager;
        this.configManager = configManager;
        this.config = config;
        
        this.testPrioritizer = new TestPrioritizer(sikgManager, configManager);
        this.changeAnalyzer = new ChangeAnalyzer(sikgManager, null, configManager);
        this.apfdCalculator = new APFDCalculator();
        this.statisticalAnalysis = new StatisticalAnalysis();
        this.dataCollector = new DataCollector();
        this.projectAnalyzer = new ProjectAnalyzer(config.subjects[0].localPath);
        
        this.initializeBaselines();
    }

    /**
     * Initialize baseline test selection approaches
     */
    private initializeBaselines(): void {
        this.baselines.set('random', new RandomSelector());
        this.baselines.set('ekstazi', new EkstaziSelector());
        this.baselines.set('historyBased', new HistoryBasedSelector());
        
        Logger.info(`Initialized ${this.baselines.size} baseline approaches for comparison`);
    }

    /**
     * Run comprehensive comparison experiment
     */
    public async runComparison(): Promise<ComparisonReport> {
        Logger.info('🚀 Starting SIKG vs Baseline Comparison Experiment');
        const startTime = Date.now();
        
        try {
            // Clear previous results
            this.allResults = [];
            
            // Process each subject project
            const projectResults: AggregatedComparisonResults[] = [];
            
            for (const subject of this.config.subjects) {
                Logger.info(`\n📊 Processing project: ${subject.name}`);
                
                try {
                    const projectResult = await this.runProjectComparison(subject);
                    projectResults.push(projectResult);
                    
                    // Save intermediate results
                    await this.saveIntermediateResults(subject.name, projectResult);
                    
                } catch (error) {
                    Logger.error(`❌ Error processing project ${subject.name}:`, error);
                    continue;
                }
            }
            
            // Generate final comparison report
            const report = this.generateComparisonReport(projectResults, Date.now() - startTime);
            
            // Save final results
            await this.saveComparisonResults(report);
            
            Logger.info(`✅ Comparison experiment completed in ${(Date.now() - startTime) / 1000}s`);
            return report;
            
        } catch (error) {
            Logger.error('❌ Fatal error in comparison experiment:', error);
            throw error;
        }
    }

    /**
     * Run comparison for a single project
     */
    private async runProjectComparison(subject: SubjectProject): Promise<AggregatedComparisonResults> {
        Logger.info(`Analyzing project: ${subject.name} (${subject.size}, ${subject.linesOfCode} LOC)`);
        
        // Initialize project-specific components
        await this.initializeProject(subject);
        
        // Get commits for evaluation
        const commits = await this.dataCollector.getEvaluationCommits(
            subject,
            this.config.iterations
        );
        
        Logger.info(`Processing ${commits.length} commits for ${subject.name}`);
        
        // Run iterations
        const iterationResults: ComparisonResult[] = [];
        
        for (let i = 0; i < Math.min(commits.length, this.config.iterations); i++) {
            const commit = commits[i];
            
            try {
                Logger.info(`  Iteration ${i + 1}/${this.config.iterations}: ${commit.hash.substring(0, 8)}`);
                
                const result = await this.runSingleIteration(subject, commit, i + 1);
                iterationResults.push(result);
                this.allResults.push(result);
                
                // Log progress
                if ((i + 1) % 5 === 0) {
                    Logger.info(`  Completed ${i + 1}/${this.config.iterations} iterations`);
                }
                
            } catch (error) {
                Logger.error(`Error in iteration ${i + 1} for ${subject.name}:`, error);
                continue;
            }
        }
        
        // Aggregate results for this project
        return this.aggregateProjectResults(subject.name, iterationResults);
    }

    /**
     * Run a single comparison iteration
     */
    private async runSingleIteration(
        subject: SubjectProject,
        commit: any,
        iteration: number
    ): Promise<ComparisonResult> {
        const iterationStart = Date.now();
        
        // Analyze changes for this commit
        const changedFiles = await this.dataCollector.getChangedFiles(subject, commit);
        const semanticChanges = await this.changeAnalyzer.analyzeChanges(
            changedFiles.map(f => ({ filePath: f, changeType: 'modify' as const }))
        );
        
        // Get all available tests
        const allTests = await this.dataCollector.getAllTests(subject);
        const actualTestResults = await this.dataCollector.getTestResults(subject, commit);
        
        Logger.debug(`  Changes: ${changedFiles.length} files, ${semanticChanges.length} semantic changes`);
        Logger.debug(`  Available tests: ${allTests.length}, Test results: ${actualTestResults.length}`);
        
        // Run SIKG approach
        const sikgResult = await this.runSIKGApproach(
            allTests,
            semanticChanges,
            actualTestResults
        );
        
        // Run baseline approaches
        const baselineResults: { [key: string]: ApproachResult } = {};
        
        for (const [name, selector] of this.baselines.entries()) {
            try {
                baselineResults[name] = await this.runBaselineApproach(
                    selector,
                    allTests,
                    changedFiles,
                    actualTestResults
                );
            } catch (error) {
                Logger.error(`Error running ${name} baseline:`, error);
                baselineResults[name] = this.createErrorResult(error);
            }
        }
        
        // Add impact-sorted baseline (simple impact-based prioritization)
        baselineResults.impactSorted = await this.runImpactSortedApproach(
            allTests,
            semanticChanges,
            actualTestResults
        );
        
        return {
            iteration,
            projectName: subject.name,
            commitHash: commit.hash,
            changesetSize: changedFiles.length,
            totalTests: allTests.length,
            approaches: {
                sikg: sikgResult,
                random: baselineResults.random,
                ekstazi: baselineResults.ekstazi,
                historyBased: baselineResults.historyBased,
                impactSorted: baselineResults.impactSorted
            },
            metadata: {
                timestamp: new Date().toISOString(),
                executionTimeMs: Date.now() - iterationStart,
                semanticChanges: semanticChanges.length,
                changedFiles
            }
        };
    }

    /**
     * Run SIKG test selection approach
     */
    private async runSIKGApproach(
        allTests: string[],
        semanticChanges: any[],
        actualResults: any[]
    ): Promise<ApproachResult> {
        const startTime = Date.now();
        
        try {
            // Calculate test impacts using SIKG
            const testImpacts = await this.testPrioritizer.calculateTestImpact(semanticChanges);
            
            // Select tests based on configured thresholds
            const threshold = this.configManager.getHighImpactThreshold();
            const selectedTests = Object.entries(testImpacts)
                .filter(([_, impact]) => impact.impactScore >= threshold)
                .map(([testId, _]) => testId);
            
            const selectionTime = Date.now() - startTime;
            
            // Calculate metrics
            const metrics = this.calculateMetrics(selectedTests, allTests, actualResults);
            
            return {
                selectedTests,
                testSelectionTimeMs: selectionTime,
                totalExecutionTimeMs: this.calculateExecutionTime(selectedTests, actualResults),
                faultsDetected: metrics.faultsDetected,
                testResults: metrics.testResults,
                metrics: metrics.metrics
            };
            
        } catch (error) {
            Logger.error('Error in SIKG approach:', error);
            return this.createErrorResult(error);
        }
    }

    /**
     * Run a baseline test selection approach
     */
    private async runBaselineApproach(
        selector: BaselineSelector,
        allTests: string[],
        changedFiles: string[],
        actualResults: any[]
    ): Promise<ApproachResult> {
        const startTime = Date.now();
        
        try {
            // Select tests using baseline approach
            const selectedTests = await selector.selectTests(allTests, changedFiles);
            const selectionTime = Date.now() - startTime;
            
            // Calculate metrics
            const metrics = this.calculateMetrics(selectedTests, allTests, actualResults);
            
            return {
                selectedTests,
                testSelectionTimeMs: selectionTime,
                totalExecutionTimeMs: this.calculateExecutionTime(selectedTests, actualResults),
                faultsDetected: metrics.faultsDetected,
                testResults: metrics.testResults,
                metrics: metrics.metrics
            };
            
        } catch (error) {
            Logger.error(`Error in ${selector.name} baseline:`, error);
            return this.createErrorResult(error);
        }
    }

    /**
     * Run impact-sorted baseline (simple impact prioritization)
     */
    private async runImpactSortedApproach(
        allTests: string[],
        semanticChanges: any[],
        actualResults: any[]
    ): Promise<ApproachResult> {
        const startTime = Date.now();
        
        try {
            // Calculate test impacts (same as SIKG)
            const testImpacts = await this.testPrioritizer.calculateTestImpact(semanticChanges);
            
            // Select top 30% by impact score (different strategy than SIKG's threshold)
            const sortedTests = Object.entries(testImpacts)
                .sort(([_, a], [__, b]) => b.impactScore - a.impactScore);
            
            const selectionCount = Math.ceil(allTests.length * 0.3);
            const selectedTests = sortedTests
                .slice(0, selectionCount)
                .map(([testId, _]) => testId);
            
            const selectionTime = Date.now() - startTime;
            
            // Calculate metrics
            const metrics = this.calculateMetrics(selectedTests, allTests, actualResults);
            
            return {
                selectedTests,
                testSelectionTimeMs: selectionTime,
                totalExecutionTimeMs: this.calculateExecutionTime(selectedTests, actualResults),
                faultsDetected: metrics.faultsDetected,
                testResults: metrics.testResults,
                metrics: metrics.metrics
            };
            
        } catch (error) {
            Logger.error('Error in impact-sorted approach:', error);
            return this.createErrorResult(error);
        }
    }

    /**
     * Calculate comprehensive metrics for an approach
     */
    private calculateMetrics(
        selectedTests: string[],
        allTests: string[],
        actualResults: any[]
    ): {
        faultsDetected: number;
        testResults: { passed: number; failed: number; skipped: number };
        metrics: ApproachResult['metrics'];
    } {
        const selectedSet = new Set(selectedTests);
        
        // Filter actual results to selected tests
        const selectedResults = actualResults.filter(result => 
            selectedSet.has(result.testId)
        );
        
        // Count test results
        const passed = selectedResults.filter(r => r.status === 'passed').length;
        const failed = selectedResults.filter(r => r.status === 'failed').length;
        const skipped = selectedResults.filter(r => r.status === 'skipped').length;
        
        // Count total faults in all tests
        const allFaults = actualResults.filter(r => r.status === 'failed').length;
        
        // Calculate APFD
        const apfd = this.apfdCalculator.calculateAPFD(
            selectedResults.map(r => ({
                testId: r.testId,
                status: r.status,
                executionTime: r.executionTime || 100,
                timestamp: r.timestamp || new Date().toISOString(),
                wasFaultDetected: r.status === 'failed'
            }))
        ).apfd;
        
        // Calculate precision, recall, F1
        const truePositives = failed; // Faults detected in selected tests
        const falsePositives = passed; // Selected tests that didn't detect faults
        const falseNegatives = allFaults - failed; // Faults missed by not selecting tests
        
        const precision = truePositives / Math.max(1, truePositives + falsePositives);
        const recall = truePositives / Math.max(1, truePositives + falseNegatives);
        const f1Score = (precision + recall > 0) ? 
            (2 * precision * recall) / (precision + recall) : 0;
        
        const reductionRatio = 1 - (selectedTests.length / allTests.length);
        const faultDetectionRate = failed / Math.max(1, selectedTests.length);
        
        return {
            faultsDetected: failed,
            testResults: { passed, failed, skipped },
            metrics: {
                apfd,
                precision,
                recall,
                f1Score,
                reductionRatio,
                faultDetectionRate
            }
        };
    }

    /**
     * Calculate total execution time for selected tests
     */
    private calculateExecutionTime(selectedTests: string[], actualResults: any[]): number {
        const selectedSet = new Set(selectedTests);
        return actualResults
            .filter(result => selectedSet.has(result.testId))
            .reduce((total, result) => total + (result.executionTime || 100), 0);
    }

    /**
     * Create error result for failed approaches
     */
    private createErrorResult(error: any): ApproachResult {
        return {
            selectedTests: [],
            testSelectionTimeMs: 0,
            totalExecutionTimeMs: 0,
            faultsDetected: 0,
            testResults: { passed: 0, failed: 0, skipped: 0 },
            metrics: {
                apfd: 0,
                precision: 0,
                recall: 0,
                f1Score: 0,
                reductionRatio: 0,
                faultDetectionRate: 0
            },
            errors: [error.message || String(error)]
        };
    }

    /**
     * Aggregate results for a single project
     */
    private aggregateProjectResults(
        projectName: string,
        iterationResults: ComparisonResult[]
    ): AggregatedComparisonResults {
        const approaches = ['sikg', 'random', 'ekstazi', 'historyBased', 'impactSorted'];
        const metrics = ['apfd', 'precision', 'recall', 'f1Score', 'reductionRatio', 'faultDetectionRate'];
        
        const summary: AggregatedComparisonResults['summary'] = {};
        const statisticalTests: AggregatedComparisonResults['statisticalTests'] = {};
        const rankings: AggregatedComparisonResults['rankings'] = {};
        
        // Aggregate metrics for each approach
        for (const approach of approaches) {
            const approachData = iterationResults.map(r => r.approaches[approach as keyof ComparisonResult['approaches']]);
            
            summary[approach] = {
                averageMetrics: this.calculateAverageMetrics(approachData),
                medianMetrics: this.calculateMedianMetrics(approachData),
                standardDeviations: this.calculateStandardDeviations(approachData),
                confidenceIntervals: this.calculateConfidenceIntervals(approachData)
            };
        }
        
        // Perform statistical tests (SIKG vs each baseline)
        for (const baseline of approaches.filter(a => a !== 'sikg')) {
            for (const metric of metrics) {
                const sikgValues = iterationResults.map(r => r.approaches.sikg.metrics[metric as keyof ApproachResult['metrics']]);
                const baselineValues = iterationResults.map(r => r.approaches[baseline as keyof ComparisonResult['approaches']].metrics[metric as keyof ApproachResult['metrics']]);
                
                const testResult = this.statisticalAnalysis.wilcoxonSignedRank(sikgValues, baselineValues);
                
                statisticalTests[`sikg_vs_${baseline}_${metric}`] = {
                    pValue: testResult.pValue,
                    significant: testResult.significant,
                    effectSize: testResult.effectSize,
                    interpretation: testResult.interpretation
                };
            }
        }
        
        // Calculate rankings for each metric
        for (const metric of metrics) {
            const averages = approaches.map(approach => ({
                approach,
                value: summary[approach].averageMetrics[metric as keyof ApproachResult['metrics']]
            }));
            
            averages.sort((a, b) => b.value - a.value);
            rankings[metric] = averages.map(a => a.approach);
        }
        
        return {
            projectName,
            iterations: iterationResults.length,
            summary,
            statisticalTests,
            rankings
        };
    }

    /**
     * Generate final comparison report
     */
    private generateComparisonReport(
        projectResults: AggregatedComparisonResults[],
        executionTime: number
    ): ComparisonReport {
        const totalIterations = projectResults.reduce((sum, p) => sum + p.iterations, 0);
        
        // Analyze SIKG advantages
        const sikgAdvantages: string[] = [];
        const statisticalSignificance: { [metric: string]: number } = {};
        const effectSizes: { [metric: string]: number } = {};
        
        const metrics = ['apfd', 'precision', 'recall', 'f1Score', 'reductionRatio', 'faultDetectionRate'];
        
        for (const metric of metrics) {
            let significantCount = 0;
            let totalEffectSize = 0;
            let projectCount = 0;
            
            for (const project of projectResults) {
                const baselines = ['random', 'ekstazi', 'historyBased', 'impactSorted'];
                
                for (const baseline of baselines) {
                    const testKey = `sikg_vs_${baseline}_${metric}`;
                    const test = project.statisticalTests[testKey];
                    
                    if (test) {
                        projectCount++;
                        if (test.significant && test.effectSize > 0) {
                            significantCount++;
                        }
                        totalEffectSize += Math.abs(test.effectSize);
                    }
                }
            }
            
            if (projectCount > 0) {
                statisticalSignificance[metric] = (significantCount / projectCount) * 100;
                effectSizes[metric] = totalEffectSize / projectCount;
            }
        }
        
        // Generate advantages based on analysis
        if (statisticalSignificance.apfd > 50) {
            sikgAdvantages.push(`SIKG shows significant APFD improvements in ${statisticalSignificance.apfd.toFixed(1)}% of comparisons`);
        }
        
        if (effectSizes.f1Score > 0.3) {
            sikgAdvantages.push(`Large effect size for F1-Score (${effectSizes.f1Score.toFixed(3)}), indicating practical significance`);
        }
        
        if (statisticalSignificance.reductionRatio > 40) {
            sikgAdvantages.push(`Superior test reduction while maintaining fault detection effectiveness`);
        }
        
        // Generate recommendations
        const recommendations = this.generateRecommendations(projectResults, statisticalSignificance, effectSizes);
        
        return {
            totalProjects: projectResults.length,
            totalIterations,
            executionTime,
            projectResults,
            overallSummary: {
                sikgAdvantages,
                statisticalSignificance,
                effectSizes,
                recommendations
            },
            metadata: {
                timestamp: new Date().toISOString(),
                configuration: this.config,
                subjects: this.config.subjects
            }
        };
    }

    /**
     * Generate recommendations based on experimental results
     */
    private generateRecommendations(
        projectResults: AggregatedComparisonResults[],
        significance: { [metric: string]: number },
        effectSizes: { [metric: string]: number }
    ): string[] {
        const recommendations: string[] = [];
        
        if (significance.apfd > 70) {
            recommendations.push('SIKG demonstrates consistent APFD improvements across diverse projects');
        }
        
        if (effectSizes.f1Score > 0.5) {
            recommendations.push('Large effect sizes indicate SIKG provides practically significant improvements');
        }
        
        if (significance.reductionRatio > 60) {
            recommendations.push('SIKG effectively reduces test suite size while maintaining fault detection');
        }
        
        // Identify best project types for SIKG
        const projectSizes = ['small', 'medium', 'large'];
        for (const size of projectSizes) {
            const sizeProjects = projectResults.filter(p => 
                this.config.subjects.find(s => s.name === p.projectName)?.size === size
            );
            
            if (sizeProjects.length > 0) {
                const avgApfd = sizeProjects.reduce((sum, p) => 
                    sum + p.summary.sikg.averageMetrics.apfd, 0
                ) / sizeProjects.length;
                
                if (avgApfd > 0.8) {
                    recommendations.push(`SIKG performs particularly well on ${size} projects (APFD: ${avgApfd.toFixed(3)})`);
                }
            }
        }
        
        if (recommendations.length === 0) {
            recommendations.push('Further evaluation recommended to establish clear advantages');
        }
        
        return recommendations;
    }

    /**
     * Calculate average metrics across iterations
     */
    private calculateAverageMetrics(results: ApproachResult[]): ApproachResult['metrics'] {
        const validResults = results.filter(r => !r.errors || r.errors.length === 0);
        if (validResults.length === 0) {
            return {
                apfd: 0, precision: 0, recall: 0, f1Score: 0, 
                reductionRatio: 0, faultDetectionRate: 0
            };
        }
        
        const metrics = ['apfd', 'precision', 'recall', 'f1Score', 'reductionRatio', 'faultDetectionRate'] as const;
        const averages: any = {};
        
        for (const metric of metrics) {
            const values = validResults.map(r => r.metrics[metric]);
            averages[metric] = values.reduce((sum, val) => sum + val, 0) / values.length;
        }
        
        return averages;
    }

    /**
     * Calculate median metrics across iterations
     */
    private calculateMedianMetrics(results: ApproachResult[]): ApproachResult['metrics'] {
        const validResults = results.filter(r => !r.errors || r.errors.length === 0);
        if (validResults.length === 0) {
            return {
                apfd: 0, precision: 0, recall: 0, f1Score: 0, 
                reductionRatio: 0, faultDetectionRate: 0
            };
        }
        
        const metrics = ['apfd', 'precision', 'recall', 'f1Score', 'reductionRatio', 'faultDetectionRate'] as const;
        const medians: any = {};
        
        for (const metric of metrics) {
            const values = validResults.map(r => r.metrics[metric]).sort((a, b) => a - b);
            const mid = Math.floor(values.length / 2);
            medians[metric] = values.length % 2 === 0 ? 
                (values[mid - 1] + values[mid]) / 2 : values[mid];
        }
        
        return medians;
    }

    /**
     * Calculate standard deviations
     */
    private calculateStandardDeviations(results: ApproachResult[]): ApproachResult['metrics'] {
        const validResults = results.filter(r => !r.errors || r.errors.length === 0);
        if (validResults.length <= 1) {
            return {
                apfd: 0, precision: 0, recall: 0, f1Score: 0, 
                reductionRatio: 0, faultDetectionRate: 0
            };
        }
        
        const averages = this.calculateAverageMetrics(results);
        const metrics = ['apfd', 'precision', 'recall', 'f1Score', 'reductionRatio', 'faultDetectionRate'] as const;
        const stdDevs: any = {};
        
        for (const metric of metrics) {
            const values = validResults.map(r => r.metrics[metric]);
            const variance = values.reduce((sum, val) => 
                sum + Math.pow(val - averages[metric], 2), 0
            ) / (values.length - 1);
            stdDevs[metric] = Math.sqrt(variance);
        }
        
        return stdDevs;
    }

    /**
     * Calculate confidence intervals (95%)
     */
    private calculateConfidenceIntervals(results: ApproachResult[]): { [metric: string]: { lower: number; upper: number } } {
        const validResults = results.filter(r => !r.errors || r.errors.length === 0);
        const intervals: any = {};
        
        if (validResults.length <= 1) {
            const metrics = ['apfd', 'precision', 'recall', 'f1Score', 'reductionRatio', 'faultDetectionRate'];
            for (const metric of metrics) {
                intervals[metric] = { lower: 0, upper: 0 };
            }
            return intervals;
        }
        
        const averages = this.calculateAverageMetrics(results);
        const stdDevs = this.calculateStandardDeviations(results);
        const tValue = 1.96; // 95% confidence interval
        const n = validResults.length;
        
        const metrics = ['apfd', 'precision', 'recall', 'f1Score', 'reductionRatio', 'faultDetectionRate'] as const;
        
        for (const metric of metrics) {
            const marginOfError = tValue * (stdDevs[metric] / Math.sqrt(n));
            intervals[metric] = {
                lower: Math.max(0, averages[metric] - marginOfError),
                upper: Math.min(1, averages[metric] + marginOfError)
            };
        }
        
        return intervals;
    }

    /**
     * Initialize project-specific components
     */
    private async initializeProject(subject: SubjectProject): Promise<void> {
        // This would typically involve setting up the project environment
        // For now, we'll just log the initialization
        Logger.debug(`Initializing project environment for ${subject.name}`);
        
        // Set up SIKG for this project if needed
        if (!this.sikgManager.initialized) {
            await this.sikgManager.initialize();
        }
    }

    /**
     * Save intermediate results for a project
     */
    private async saveIntermediateResults(
        projectName: string,
        results: AggregatedComparisonResults
    ): Promise<void> {
        const outputDir = path.join(this.config.outputDir, 'intermediate');
        
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        const filePath = path.join(outputDir, `${projectName}_comparison_results.json`);
        fs.writeFileSync(filePath, JSON.stringify(results, null, 2));
        
        Logger.debug(`Saved intermediate results for ${projectName} to ${filePath}`);
    }

    /**
     * Save final comparison results
     */
    private async saveComparisonResults(report: ComparisonReport): Promise<void> {
        const outputDir = this.config.outputDir;
        
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        // Save JSON results
        const jsonPath = path.join(outputDir, 'comparison_results.json');
        fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
        
        // Save CSV summary
        const csvPath = path.join(outputDir, 'comparison_summary.csv');
        this.saveCSVSummary(report, csvPath);
        
        // Save statistical analysis
        const statsPath = path.join(outputDir, 'statistical_analysis.json');
        this.saveStatisticalAnalysis(report, statsPath);
        
        Logger.info(`📊 Comparison results saved to ${outputDir}`);
        Logger.info(`   JSON: ${jsonPath}`);
        Logger.info(`   CSV: ${csvPath}`);
        Logger.info(`   Stats: ${statsPath}`);
    }

    /**
     * Save CSV summary of results
     */
    private saveCSVSummary(report: ComparisonReport, filePath: string): void {
        const headers = [
            'Project', 'Iterations', 'Approach', 'APFD', 'Precision', 'Recall', 
            'F1Score', 'ReductionRatio', 'FaultDetectionRate'
        ];
        
        const rows = [headers.join(',')];
        
        for (const project of report.projectResults) {
            const approaches = ['sikg', 'random', 'ekstazi', 'historyBased', 'impactSorted'];
            
            for (const approach of approaches) {
                const metrics = project.summary[approach]?.averageMetrics;
                if (metrics) {
                    rows.push([
                        project.projectName,
                        project.iterations.toString(),
                        approach,
                        metrics.apfd.toFixed(4),
                        metrics.precision.toFixed(4),
                        metrics.recall.toFixed(4),
                        metrics.f1Score.toFixed(4),
                        metrics.reductionRatio.toFixed(4),
                        metrics.faultDetectionRate.toFixed(4)
                    ].join(','));
                }
            }
        }
        
        fs.writeFileSync(filePath, rows.join('\n'));
    }

    /**
     * Save statistical analysis results
     */
    private saveStatisticalAnalysis(report: ComparisonReport, filePath: string): void {
        const analysis = {
            overallSummary: report.overallSummary,
            projectAnalysis: report.projectResults.map(project => ({
                project: project.projectName,
                iterations: project.iterations,
                significantImprovements: Object.entries(project.statisticalTests)
                    .filter(([_, test]) => test.significant && test.effectSize > 0)
                    .map(([comparison, test]) => ({
                        comparison,
                        pValue: test.pValue,
                        effectSize: test.effectSize,
                        interpretation: test.interpretation
                    })),
                rankings: project.rankings
            }))
        };
        
        fs.writeFileSync(filePath, JSON.stringify(analysis, null, 2));
    }

    /**
     * Get current experiment status
     */
    public getExperimentStatus(): {
        totalIterations: number;
        completedIterations: number;
        currentProject?: string;
        progressPercentage: number;
    } {
        const totalIterations = this.config.subjects.length * this.config.iterations;
        const completedIterations = this.allResults.length;
        
        return {
            totalIterations,
            completedIterations,
            currentProject: this.allResults.length > 0 ? 
                this.allResults[this.allResults.length - 1].projectName : undefined,
            progressPercentage: (completedIterations / totalIterations) * 100
        };
    }

    /**
     * Clean up resources
     */
    public dispose(): void {
        this.allResults = [];
        this.baselines.clear();
        
        Logger.info('ComparisonRunner disposed');
    }
}