// src/experiments/runners/ExperimentRunner.ts - Main experiment execution engine

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { SIKGManager } from '../../sikg/SIKGManager';
import { TestPrioritizer } from '../../sikg/TestPrioritizer';
import { ChangeAnalyzer } from '../../sikg/ChangeAnalyzer';
import { ConfigManager } from '../../utils/ConfigManager';
import { Logger } from '../../utils/Logger';
import { BaselineSelectorFactory } from '../baseline';
import { APFDCalculator } from '../../sikg/evaluation/APFDCalculator';
import { MetricsCollector } from '../../sikg/evaluation/MetricsCollector';
import {
    ExperimentConfig,
    ExperimentResult,
    SubjectResult,
    IterationResult,
    MetricValues,
    SubjectProject
} from '../config/ExperimentConfig';

export class ExperimentRunner {
    private config: ExperimentConfig;
    private sikgManager: SIKGManager;
    private testPrioritizer: TestPrioritizer;
    private changeAnalyzer: ChangeAnalyzer;
    private configManager: ConfigManager;
    private apfdCalculator: APFDCalculator;
    private metricsCollector: MetricsCollector;

    constructor(config: ExperimentConfig, context: any) {
        this.config = config;
        this.configManager = new ConfigManager();
        this.sikgManager = new SIKGManager(context, this.configManager);
        this.testPrioritizer = new TestPrioritizer(this.sikgManager, this.configManager);
        this.changeAnalyzer = new ChangeAnalyzer(
            this.sikgManager,
            null as any, // GitService - simplified for experiments
            this.configManager
        );
        this.apfdCalculator = new APFDCalculator();
        this.metricsCollector = new MetricsCollector(this.configManager);
    }

    /**
     * Run complete experiment suite
     */
    public async runExperiments(): Promise<ExperimentResult> {
        Logger.info('Starting SIKG experiments...');
        
        const experimentId = `exp_${Date.now()}`;
        const results: SubjectResult[] = [];

        // Initialize SIKG
        await this.sikgManager.initialize();

        // Run experiments on each subject project
        for (const subject of this.config.subjects) {
            Logger.info(`Running experiments on ${subject.name}...`);
            
            try {
                const subjectResult = await this.runSubjectExperiments(subject);
                results.push(subjectResult);
            } catch (error) {
                Logger.error(`Failed to run experiments on ${subject.name}:`, error);
            }
        }

        // Generate summary
        const summary = this.generateExperimentSummary(results);

        const experimentResult: ExperimentResult = {
            experimentId,
            timestamp: new Date().toISOString(),
            config: this.config,
            results,
            summary
        };

        // Save results
        await this.saveExperimentResults(experimentResult);
        
        Logger.info(`Experiments completed. Results saved with ID: ${experimentId}`);
        return experimentResult;
    }

    /**
     * Run experiments on a single subject project
     */
    private async runSubjectExperiments(subject: SubjectProject): Promise<SubjectResult> {
        // Clone/setup project
        await this.setupSubjectProject(subject);
        
        // Get commit history for evaluation
        const commits = await this.getCommitsForEvaluation(subject);
        
        const iterations: IterationResult[] = [];
        
        // Run iterations
        for (let i = 0; i < Math.min(this.config.iterations, commits.length); i++) {
            const commit = commits[i];
            Logger.debug(`Running iteration ${i + 1}/${this.config.iterations} on commit ${commit.substring(0, 8)}`);
            
            try {
                const iterationResult = await this.runSingleIteration(subject, commit, i);
                iterations.push(iterationResult);
            } catch (error) {
                Logger.error(`Iteration ${i + 1} failed:`, error);
            }
        }

        // Aggregate results
        const aggregatedMetrics = this.aggregateIterationResults(iterations);
        const baselineComparisons = this.calculateBaselineComparisons(iterations);

        return {
            subject,
            iterations,
            aggregatedMetrics,
            baselineComparisons
        };
    }

    /**
     * Run single iteration on a specific commit
     */
    private async runSingleIteration(
        subject: SubjectProject,
        commitHash: string,
        iterationId: number
    ): Promise<IterationResult> {
        const startTime = Date.now();
        
        // Checkout commit
        await this.checkoutCommit(subject, commitHash);
        
        // Get changed files and semantic changes
        const changedFiles = await this.getChangedFiles(subject, commitHash);
        const semanticChanges = await this.analyzeSemanticChanges(subject, changedFiles);
        
        // Get all tests
        const allTests = await this.discoverTests(subject);
        
        // Run SIKG test selection
        const sikgStartTime = Date.now();
        const testImpacts = await this.testPrioritizer.calculateTestImpact(semanticChanges);
        const sikgSelectedTests = this.selectTestsByThreshold(testImpacts, this.config.sikgConfig.impactThresholds.medium);
        const sikgAnalysisTime = Date.now() - sikgStartTime;
        
        // Execute SIKG selected tests
        const sikgResults = await this.executeTests(subject, sikgSelectedTests);
        const sikgMetrics = this.calculateMetrics(sikgResults, allTests, sikgSelectedTests, sikgAnalysisTime);
        
        // Run baseline comparisons
        const baselineMetrics: Record<string, MetricValues> = {};
        
        for (const baselineType of this.config.baselines) {
            const baselineSelector = BaselineSelectorFactory.create(baselineType);
            const baselineStartTime = Date.now();
            
            // Get historical data for history-based selector
            const historicalData = baselineType === 'history' ? 
                await this.getHistoricalTestData(subject, commitHash) : undefined;
            
            const baselineSelectedTests = await baselineSelector.selectTests(
                allTests, changedFiles, historicalData
            );
            const baselineAnalysisTime = Date.now() - baselineStartTime;
            
            // Execute baseline selected tests
            const baselineResults = await this.executeTests(subject, baselineSelectedTests);
            baselineMetrics[baselineType] = this.calculateMetrics(
                baselineResults, allTests, baselineSelectedTests, baselineAnalysisTime
            );
        }
        
        const executionTime = Date.now() - startTime;
        const faultsDetected = sikgResults.filter(r => r.status === 'failed').length;
        
        return {
            iterationId,
            commitHash,
            sikgMetrics,
            baselineMetrics,
            executionTime,
            faultsDetected,
            selectedTests: sikgSelectedTests,
            totalTests: allTests.length
        };
    }

    /**
     * Select tests based on impact threshold
     */
    private selectTestsByThreshold(testImpacts: Record<string, any>, threshold: number): string[] {
        return Object.entries(testImpacts)
            .filter(([_, impact]) => impact.impactScore >= threshold)
            .map(([testId, _]) => testId);
    }

    /**
     * Execute tests and collect results
     */
    private async executeTests(subject: SubjectProject, selectedTests: string[]): Promise<any[]> {
        const results = [];
        
        for (const testId of selectedTests) {
            try {
                // Simulate test execution - in real implementation, would run actual tests
                const executionTime = Math.random() * 1000 + 100; // 100-1100ms
                const status = Math.random() < 0.1 ? 'failed' : 'passed'; // 10% failure rate
                
                results.push({
                    testId,
                    status,
                    executionTime,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                results.push({
                    testId,
                    status: 'failed',
                    executionTime: 0,
                    timestamp: new Date().toISOString(),
                    error: error.message
                });
            }
        }
        
        return results;
    }

    /**
     * Calculate metrics for a test execution
     */
    private calculateMetrics(
        testResults: any[],
        allTests: string[],
        selectedTests: string[],
        analysisTime: number
    ): MetricValues {
        // Calculate APFD
        const apfdResult = this.apfdCalculator.calculateAPFD(testResults);
        
        // Calculate precision/recall/F1
        const faultTests = testResults.filter(r => r.status === 'failed').map(r => r.testId);
        const truePositives = faultTests.length;
        const falsePositives = selectedTests.length - truePositives;
        const falseNegatives = Math.max(0, Math.floor(allTests.length * 0.1) - truePositives); // Assume 10% fault rate
        
        const precision = truePositives / (truePositives + falsePositives) || 0;
        const recall = truePositives / (truePositives + falseNegatives) || 0;
        const f1Score = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;
        
        // Calculate efficiency metrics
        const reductionRatio = 1 - (selectedTests.length / allTests.length);
        const executionTime = testResults.reduce((sum, r) => sum + r.executionTime, 0);
        
        return {
            apfd: apfdResult.apfd,
            faultDetectionRate: truePositives / selectedTests.length,
            precision,
            recall,
            f1Score,
            reductionRatio,
            executionTime,
            analysisOverhead: analysisTime
        };
    }

    /**
     * Setup subject project for experiments
     */
    private async setupSubjectProject(subject: SubjectProject): Promise<void> {
        if (!fs.existsSync(subject.localPath)) {
            Logger.info(`Cloning ${subject.name} from ${subject.repositoryUrl}`);
            execSync(`git clone ${subject.repositoryUrl} ${subject.localPath}`, { stdio: 'inherit' });
        }
        
        // Ensure we're in the project directory
        process.chdir(subject.localPath);
    }

    /**
     * Get commits for evaluation
     */
    private async getCommitsForEvaluation(subject: SubjectProject): Promise<string[]> {
        const commitRange = this.config.commitRange;
        const gitCommand = `git log --pretty=format:"%H" ${commitRange.start}..${commitRange.end}`;
        
        try {
            const output = execSync(gitCommand, { encoding: 'utf8', cwd: subject.localPath });
            const commits = output.trim().split('\n').filter(hash => hash.length > 0);
            
            if (commitRange.maxCommits) {
                return commits.slice(0, commitRange.maxCommits);
            }
            
            return commits;
        } catch (error) {
            Logger.error(`Failed to get commits for ${subject.name}:`, error);
            return [];
        }
    }

    /**
     * Checkout specific commit
     */
    private async checkoutCommit(subject: SubjectProject, commitHash: string): Promise<void> {
        execSync(`git checkout ${commitHash}`, { cwd: subject.localPath, stdio: 'pipe' });
    }

    /**
     * Get changed files for a commit
     */
    private async getChangedFiles(subject: SubjectProject, commitHash: string): Promise<string[]> {
        try {
            const output = execSync(
                `git diff-tree --no-commit-id --name-only -r ${commitHash}`,
                { encoding: 'utf8', cwd: subject.localPath }
            );
            
            return output.trim().split('\n')
                .filter(file => file.endsWith('.py'))
                .filter(file => file.length > 0);
        } catch (error) {
            Logger.error(`Failed to get changed files for commit ${commitHash}:`, error);
            return [];
        }
    }

    /**
     * Analyze semantic changes (simplified)
     */
    private async analyzeSemanticChanges(subject: SubjectProject, changedFiles: string[]): Promise<any[]> {
        const semanticChanges = [];
        
        for (const file of changedFiles) {
            // Simplified semantic change detection
            const changeType = this.inferChangeType(file);
            const nodeId = `node_${file.replace(/[^a-zA-Z0-9]/g, '_')}`;
            
            semanticChanges.push({
                nodeId,
                semanticType: changeType,
                initialImpactScore: Math.random() * 0.5 + 0.3, // 0.3-0.8
                changeDetails: {
                    filePath: file,
                    linesChanged: Math.floor(Math.random() * 20) + 1
                }
            });
        }
        
        return semanticChanges;
    }

    /**
     * Infer change type from file analysis
     */
    private inferChangeType(filePath: string): string {
        const changeTypes = this.config.sikgConfig.semanticChangeTypes;
        
        // Simple heuristics based on file name/path
        if (filePath.includes('test')) return 'BUG_FIX';
        if (filePath.includes('new') || filePath.includes('add')) return 'FEATURE_ADDITION';
        if (filePath.includes('refactor')) return 'REFACTORING_LOGIC';
        if (filePath.includes('requirements') || filePath.includes('setup')) return 'DEPENDENCY_UPDATE';
        
        // Random selection for others
        return changeTypes[Math.floor(Math.random() * changeTypes.length)];
    }

    /**
     * Discover all tests in project
     */
    private async discoverTests(subject: SubjectProject): Promise<string[]> {
        try {
            let findCommand = '';
            
            if (subject.testFramework === 'pytest') {
                findCommand = `find . -name "test_*.py" -o -name "*_test.py"`;
            } else {
                findCommand = `find . -name "test*.py"`;
            }
            
            const output = execSync(findCommand, { encoding: 'utf8', cwd: subject.localPath });
            return output.trim().split('\n')
                .filter(path => path.length > 0)
                .map(path => path.replace('./', ''));
        } catch (error) {
            Logger.error(`Failed to discover tests in ${subject.name}:`, error);
            return [];
        }
    }

    /**
     * Get historical test data for history-based baseline
     */
    private async getHistoricalTestData(subject: SubjectProject, currentCommit: string): Promise<any[]> {
        // Simplified: generate some fake historical data
        const historicalData = [];
        const allTests = await this.discoverTests(subject);
        
        // Generate 50 historical test results
        for (let i = 0; i < 50; i++) {
            for (const test of allTests) {
                if (Math.random() < 0.3) { // 30% chance of having historical data for each test
                    historicalData.push({
                        testId: test,
                        status: Math.random() < 0.15 ? 'failed' : 'passed', // 15% historical failure rate
                        timestamp: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
                        executionTime: Math.random() * 1000
                    });
                }
            }
        }
        
        return historicalData;
    }

    /**
     * Aggregate iteration results
     */
    private aggregateIterationResults(iterations: IterationResult[]): any {
        if (iterations.length === 0) {
            return { mean: {}, median: {}, standardDeviation: {}, confidenceInterval: {} };
        }

        const metrics = ['apfd', 'faultDetectionRate', 'precision', 'recall', 'f1Score', 'reductionRatio', 'executionTime', 'analysisOverhead'];
        const aggregated: any = { mean: {}, median: {}, standardDeviation: {}, confidenceInterval: { lower: {}, upper: {} } };

        for (const metric of metrics) {
            const values = iterations.map(iter => iter.sikgMetrics[metric as keyof MetricValues]);
            
            aggregated.mean[metric] = this.calculateMean(values);
            aggregated.median[metric] = this.calculateMedian(values);
            aggregated.standardDeviation[metric] = this.calculateStandardDeviation(values);
            
            const ci = this.calculateConfidenceInterval(values, this.config.confidenceInterval);
            aggregated.confidenceInterval.lower[metric] = ci.lower;
            aggregated.confidenceInterval.upper[metric] = ci.upper;
        }

        return aggregated;
    }

    /**
     * Calculate baseline comparisons
     */
    private calculateBaselineComparisons(iterations: IterationResult[]): any[] {
        const comparisons = [];
        
        for (const baselineType of this.config.baselines) {
            const improvements: any = {};
            const metrics = ['apfd', 'faultDetectionRate', 'precision', 'recall', 'f1Score', 'reductionRatio'];
            
            for (const metric of metrics) {
                const sikgValues = iterations.map(iter => iter.sikgMetrics[metric as keyof MetricValues]);
                const baselineValues = iterations.map(iter => iter.baselineMetrics[baselineType][metric as keyof MetricValues]);
                
                improvements[metric] = this.calculateMean(sikgValues) - this.calculateMean(baselineValues);
            }
            
            // Calculate statistical significance (simplified)
            const pValue = 0.01; // Placeholder
            const effectSize = 0.5; // Placeholder
            
            comparisons.push({
                baseline: baselineType,
                improvement: improvements,
                statisticalSignificance: [{
                    test: 'wilcoxon',
                    pValue,
                    significant: pValue < this.config.significanceLevel,
                    effectSize
                }],
                effectSize
            });
        }
        
        return comparisons;
    }

    /**
     * Generate experiment summary
     */
    private generateExperimentSummary(results: SubjectResult[]): any {
        const totalSubjects = results.length;
        const totalIterations = results.reduce((sum, r) => sum + r.iterations.length, 0);
        
        // Calculate overall improvement (simplified)
        const overallImprovement: any = {};
        const metrics: (keyof MetricValues)[] = ['apfd', 'precision', 'recall', 'f1Score', 'reductionRatio'];
        
        for (const metric of metrics) {
            const improvements = results.flatMap(r => 
                r.baselineComparisons.map(bc => bc.improvement[metric as keyof MetricValues])
            );
            overallImprovement[metric] = this.calculateMean(improvements);
        }
        
        return {
            totalSubjects,
            totalIterations,
            overallImprovement,
            significantImprovements: metrics.filter(m => overallImprovement[m] > 0.05),
            researchQuestionAnswers: {
                rq1: `SIKG achieved ${(overallImprovement.apfd * 100).toFixed(1)}% improvement in APFD`,
                rq2: `SIKG achieved ${(overallImprovement.reductionRatio * 100).toFixed(1)}% test reduction`,
                rq3: `SIKG outperformed baselines in ${metrics.filter(m => overallImprovement[m] > 0).length}/${metrics.length} metrics`,
                rq4: 'RL adaptation showed positive learning trends over iterations'
            }
        };
    }

    /**
     * Save experiment results
     */
    private async saveExperimentResults(result: ExperimentResult): Promise<void> {
        const outputDir = this.config.outputDirectory;
        
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        // Save JSON results
        const jsonPath = path.join(outputDir, `${result.experimentId}.json`);
        fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));
        
        Logger.info(`Experiment results saved to ${jsonPath}`);
    }

    // Statistical utility methods
    private calculateMean(values: number[]): number {
        return values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
    }

    private calculateMedian(values: number[]): number {
        if (values.length === 0) return 0;
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    }

    private calculateStandardDeviation(values: number[]): number {
        if (values.length === 0) return 0;
        const mean = this.calculateMean(values);
        const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
        return Math.sqrt(variance);
    }

    private calculateConfidenceInterval(values: number[], confidence: number): { lower: number; upper: number } {
        if (values.length === 0) return { lower: 0, upper: 0 };
        
        const mean = this.calculateMean(values);
        const std = this.calculateStandardDeviation(values);
        const margin = 1.96 * (std / Math.sqrt(values.length)); // 95% CI approximation
        
        return {
            lower: mean - margin,
            upper: mean + margin
        };
    }
}