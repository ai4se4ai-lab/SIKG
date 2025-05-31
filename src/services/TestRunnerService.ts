// ENHANCED TestRunnerService.ts - Integrated with RL Feedback Collection

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { TestImpact, TestResult } from '../sikg/GraphTypes';
import { Logger } from '../utils/Logger';

// RL Integration imports
import { FeedbackSignal, EnvironmentResponse } from '../ml/types/ReinforcementTypes';

export class TestRunnerService {
    private feedbackCollector: FeedbackCollector;

    constructor() {
        this.feedbackCollector = new FeedbackCollector();
    }

    /**
     * ENHANCED: Run prioritized tests with RL feedback collection
     */
    public async runPrioritizedTests(
        testImpacts: Record<string, TestImpact>,
        topN?: number
    ): Promise<TestResult[]> {
        Logger.info(`Running prioritized tests, top ${topN || 'all'}`);
        
        const startTime = Date.now();
        
        // Sort tests by impact score
        const sortedTests = Object.values(testImpacts)
            .sort((a, b) => b.impactScore - a.impactScore);
        
        // Apply limit if specified
        const testsToRun = topN ? sortedTests.slice(0, topN) : sortedTests;
        
        if (testsToRun.length === 0) {
            Logger.info('No tests to run');
            return [];
        }
        
        Logger.info(`Running ${testsToRun.length} prioritized tests`);
        
        // Group tests by file for more efficient execution
        const testsByFile: Record<string, { testId: string; testName: string; predictedImpact: number }[]> = {};
        
        for (const test of testsToRun) {
            if (!testsByFile[test.testPath]) {
                testsByFile[test.testPath] = [];
            }
            
            testsByFile[test.testPath].push({
                testId: test.testId,
                testName: test.testName,
                predictedImpact: test.impactScore
            });
        }
        
        // Run tests and collect results with feedback
        const allResults: TestResult[] = [];
        const feedbackSignals: FeedbackSignal[] = [];
        
        for (const [filePath, tests] of Object.entries(testsByFile)) {
            try {
                const fileExt = path.extname(filePath).toLowerCase();
                let testResults: TestResult[];
                
                if (fileExt === '.py') {
                    testResults = await this.runPythonTests(filePath, tests, testImpacts);
                } else {
                    testResults = await this.simulateTestResults(tests, testImpacts);
                }
                
                // Collect feedback signals for RL
                const signals = this.collectFeedbackSignals(tests, testResults, testImpacts);
                feedbackSignals.push(...signals);
                
                allResults.push(...testResults);
                
            } catch (error) {
                Logger.error(`Error running tests in ${filePath}:`, error);
                
                // Create failed results for all tests in this file
                const failedResults = tests.map(test => ({
                    testId: test.testId,
                    status: 'failed' as const,
                    executionTime: 0,
                    predictedImpact: testImpacts[test.testId]?.impactScore,
                    changedNodeIds: testImpacts[test.testId]?.contributingChanges.map(c => c.nodeId),
                    errorMessage: `Failed to run test: ${error instanceof Error ? error.message : String(error)}`,
                    timestamp: new Date().toISOString()
                }));
                
                allResults.push(...failedResults);
            }
        }
        
        const totalTime = Date.now() - startTime;
        
        // Create environment response for RL
        const environmentResponse = this.createEnvironmentResponse(
            allResults,
            testsToRun.map(t => ({
                testId: t.testId,
                testName: t.testName,
                predictedImpact: t.impactScore
            })),
            totalTime,
            feedbackSignals
        );
        
        // Store feedback for RL system
        this.feedbackCollector.storeFeedback(environmentResponse);
        
        Logger.info(`Completed test execution in ${totalTime}ms with ${allResults.length} results`);
        
        return allResults;
    }

    /**
     * Collect feedback signals from test execution
     */
    private collectFeedbackSignals(
        testsToRun: { testId: string; testName: string; predictedImpact: number }[],
        testResults: TestResult[],
        testImpacts: Record<string, TestImpact>
    ): FeedbackSignal[] {
        const signals: FeedbackSignal[] = [];
        
        // Create result map for quick lookup
        const resultMap = new Map<string, TestResult>();
        for (const result of testResults) {
            resultMap.set(result.testId, result);
        }
        
        for (const test of testsToRun) {
            const result = resultMap.get(test.testId);
            const testImpact = testImpacts[test.testId];
            
            if (result && testImpact) {
                // Determine if prediction was correct
                const predicted = test.predictedImpact > 0.5; // High impact threshold
                const actual = result.status === 'failed'; // Test actually failed
                const correct = (predicted && actual) || (!predicted && !actual);
                
                const signal: FeedbackSignal = {
                    testId: test.testId,
                    predicted: predicted,
                    actual: actual,
                    correct: correct,
                    confidence: test.predictedImpact,
                    changedNodeIds: testImpact.contributingChanges.map(c => c.nodeId)
                };
                
                signals.push(signal);
            }
        }
        
        return signals;
    }

    /**
     * Create environment response for RL system
     */
    private createEnvironmentResponse(
        testResults: TestResult[],
        testsToRun: { testId: string; testName: string; predictedImpact: number }[],
        totalTime: number,
        feedbackSignals: FeedbackSignal[]
    ): EnvironmentResponse {
        // Calculate accuracy metrics
        const correctPredictions = feedbackSignals.filter(s => s.correct).length;
        const accuracy = feedbackSignals.length > 0 ? correctPredictions / feedbackSignals.length : 0;
        
        // Calculate precision, recall, F1
        const truePositives = feedbackSignals.filter(s => s.predicted && s.actual).length;
        const falsePositives = feedbackSignals.filter(s => s.predicted && !s.actual).length;
        const falseNegatives = feedbackSignals.filter(s => !s.predicted && s.actual).length;
        const trueNegatives = feedbackSignals.filter(s => !s.predicted && !s.actual).length;
        
        const precision = (truePositives + falsePositives) > 0 ? truePositives / (truePositives + falsePositives) : 0;
        const recall = (truePositives + falseNegatives) > 0 ? truePositives / (truePositives + falseNegatives) : 0;
        
        return {
            predictions: testsToRun.map(t => ({ testId: t.testId, impactScore: t.predictedImpact })),
            actualResults: testResults,
            executionMetrics: {
                totalTime: totalTime,
                testsRun: testResults.length,
                testsPredicted: testsToRun.length,
                accuracy: accuracy,
                precision: precision,
                recall: recall,
                truePositives: truePositives,
                falsePositives: falsePositives,
                trueNegatives: trueNegatives,
                falseNegatives: falseNegatives
            },
            accuracy: accuracy,
            feedbackSignals: feedbackSignals,
            done: true
        };
    }

    /**
     * Parse test results from a task execution
     */
    public async parseTestResults(taskExecution: vscode.TaskExecution): Promise<TestResult[] | null> {
        // This is simplified - in a real extension, parse specific test runner output
        return null;
    }

    /**
     * Run Python tests using pytest or unittest
     */
    private async runPythonTests(
        filePath: string,
        tests: { testId: string; testName: string; predictedImpact: number }[],
        testImpacts: Record<string, TestImpact>
    ): Promise<TestResult[]> {
        Logger.info(`Running Python tests in ${filePath}`);
        
        try {
            // Determine if we should use pytest or unittest
            const isPytest = filePath.includes('test_') || filePath.includes('_test');
            const content = fs.readFileSync(filePath, 'utf8');
            const isUnittest = content.includes('import unittest') || content.includes('unittest.TestCase');
            
            const results: TestResult[] = [];
            
            for (const test of tests) {
                const testName = test.testName;
                const predictedImpact = test.predictedImpact;
                const changedNodeIds = testImpacts[test.testId]?.contributingChanges.map(c => c.nodeId) || [];
                
                let command = '';
                if (isPytest) {
                    command = `pytest ${filePath}::${testName} -v`;
                } else if (isUnittest) {
                    if (testName.includes('.')) {
                        const [className, methodName] = testName.split('.');
                        command = `python -m unittest ${filePath.replace(/\.py$/, '')}.${className}.${methodName}`;
                    } else {
                        command = `python -m unittest ${filePath.replace(/\.py$/, '')}.${testName}`;
                    }
                } else {
                    command = `python ${filePath} ${testName}`;
                }
                
                Logger.debug(`Test command (simulated): ${command}`);
                
                // Enhanced simulation based on impact score
                const failureProbability = Math.min(0.9, predictedImpact * 0.8 + 0.1);
                const passed = Math.random() > failureProbability;
                
                // Simulate execution time based on test complexity
                const baseTime = 100;
                const complexityMultiplier = 1 + (predictedImpact * 2);
                const executionTime = baseTime * complexityMultiplier + (Math.random() * 50);
                
                results.push({
                    testId: test.testId,
                    status: passed ? 'passed' : 'failed',
                    executionTime,
                    predictedImpact,
                    changedNodeIds,
                    timestamp: new Date().toISOString(),
                    errorMessage: !passed ? `Simulated test failure for ${testName}` : undefined
                });
            }
            
            return results;
            
        } catch (error) {
            Logger.error(`Error running Python tests in ${filePath}:`, error);
            
            return tests.map(test => ({
                testId: test.testId,
                status: 'failed' as const,
                executionTime: 0,
                predictedImpact: testImpacts[test.testId]?.impactScore,
                changedNodeIds: testImpacts[test.testId]?.contributingChanges.map(c => c.nodeId),
                errorMessage: `Failed to run test: ${error instanceof Error ? error.message : String(error)}`,
                timestamp: new Date().toISOString()
            }));
        }
    }

    /**
     * Simulate test results for non-Python or when actual execution is not available
     */
    private async simulateTestResults(
        tests: { testId: string; testName: string; predictedImpact: number }[],
        testImpacts: Record<string, TestImpact>
    ): Promise<TestResult[]> {
        const results: TestResult[] = [];
        
        for (const test of tests) {
            const predictedImpact = test.predictedImpact;
            const changedNodeIds = testImpacts[test.testId]?.contributingChanges.map(c => c.nodeId) || [];
            
            // Enhanced simulation: higher impact scores more likely to fail
            const failureProbability = Math.min(0.8, predictedImpact * 0.7 + 0.1);
            const passed = Math.random() > failureProbability;
            
            // Simulate realistic execution times
            const baseTime = 50;
            const complexityMultiplier = 1 + predictedImpact;
            const executionTime = baseTime * complexityMultiplier + (Math.random() * 100);
            
            results.push({
                testId: test.testId,
                status: passed ? 'passed' : 'failed',
                executionTime,
                predictedImpact,
                changedNodeIds,
                timestamp: new Date().toISOString(),
                errorMessage: !passed ? `Simulated failure for ${test.testName}` : undefined
            });
        }
        
        return results;
    }

    /**
     * Get feedback collector for external access
     */
    public getFeedbackCollector(): FeedbackCollector {
        return this.feedbackCollector;
    }

    /**
     * Run specific test configuration for RL evaluation
     */
    public async runTestConfiguration(
        testConfiguration: TestConfiguration
    ): Promise<EnvironmentResponse> {
        const startTime = Date.now();
        
        try {
            const testResults: TestResult[] = [];
            const feedbackSignals: FeedbackSignal[] = [];
            
            for (const testGroup of testConfiguration.testGroups) {
                const groupResults = await this.simulateTestResults(
                    testGroup.tests,
                    testConfiguration.testImpacts
                );
                
                const groupSignals = this.collectFeedbackSignals(
                    testGroup.tests,
                    groupResults,
                    testConfiguration.testImpacts
                );
                
                testResults.push(...groupResults);
                feedbackSignals.push(...groupSignals);
            }
            
            const totalTime = Date.now() - startTime;
            
            return this.createEnvironmentResponse(
                testResults,
                testConfiguration.testGroups.flatMap(g => g.tests),
                totalTime,
                feedbackSignals
            );
            
        } catch (error) {
            Logger.error('Error running test configuration:', error);
            
            return {
                predictions: [],
                actualResults: [],
                executionMetrics: { totalTime: Date.now() - startTime },
                accuracy: 0,
                feedbackSignals: [],
                done: true
            };
        }
    }

    /**
     * Evaluate test selection strategy
     */
    public async evaluateStrategy(
        strategy: TestSelectionStrategy,
        testImpacts: Record<string, TestImpact>
    ): Promise<StrategyEvaluation> {
        const startTime = Date.now();
        
        // Apply strategy to select tests
        const selectedTests = this.applySelectionStrategy(strategy, testImpacts);
        
        // Run selected tests
        const results = await this.runPrioritizedTests(testImpacts, selectedTests.length);
        
        // Calculate metrics
        const accuracy = this.calculateAccuracy(selectedTests, results, testImpacts);
        const efficiency = this.calculateEfficiency(selectedTests, results);
        const coverage = this.calculateCoverage(selectedTests, testImpacts);
        
        const totalTime = Date.now() - startTime;
        
        return {
            strategy: strategy,
            selectedTestCount: selectedTests.length,
            totalTestCount: Object.keys(testImpacts).length,
            accuracy: accuracy,
            efficiency: efficiency,
            coverage: coverage,
            executionTime: totalTime,
            results: results
        };
    }

    /**
     * Apply test selection strategy
     */
    private applySelectionStrategy(
        strategy: TestSelectionStrategy,
        testImpacts: Record<string, TestImpact>
    ): string[] {
        const allTests = Object.values(testImpacts);
        
        switch (strategy.type) {
            case 'top_n':
                if (
                    !strategy.parameters ||
                    typeof strategy.parameters.n !== 'number'
                ) {
                    throw new Error("Missing or invalid 'n' parameter for 'top_n' strategy.");
                }
                return allTests
                    .sort((a, b) => b.impactScore - a.impactScore)
                    .slice(0, strategy.parameters.n)
                    .map(t => t.testId);
                    
            case 'threshold':
                if (
                    !strategy.parameters ||
                    typeof strategy.parameters.threshold !== 'number'
                ) {
                    throw new Error("Missing or invalid 'threshold' parameter for 'threshold' strategy.");
                }
                const threshold = strategy.parameters.threshold;
                return allTests
                    .filter(t => t.impactScore >= threshold)
                    .map(t => t.testId);
                    
            case 'percentage':
                if (
                    !strategy.parameters ||
                    typeof strategy.parameters.percentage !== 'number'
                ) {
                    throw new Error("Missing or invalid 'percentage' parameter for 'percentage' strategy.");
                }
                const count = Math.ceil(allTests.length * strategy.parameters.percentage);
                return allTests
                    .sort((a, b) => b.impactScore - a.impactScore)
                    .slice(0, count)
                    .map(t => t.testId);
                    
            default:
                return allTests.map(t => t.testId);
        }
    }

    /**
     * Calculate strategy accuracy
     */
    private calculateAccuracy(
        selectedTests: string[],
        results: TestResult[],
        testImpacts: Record<string, TestImpact>
    ): number {
        const resultMap = new Map(results.map(r => [r.testId, r]));
        let correct = 0;
        let total = 0;
        
        for (const testId of selectedTests) {
            const result = resultMap.get(testId);
            const impact = testImpacts[testId];
            
            if (result && impact) {
                const predicted = impact.impactScore > 0.5;
                const actual = result.status === 'failed';
                
                if ((predicted && actual) || (!predicted && !actual)) {
                    correct++;
                }
                total++;
            }
        }
        
        return total > 0 ? correct / total : 0;
    }

    /**
     * Calculate strategy efficiency
     */
    private calculateEfficiency(selectedTests: string[], results: TestResult[]): number {
        const totalTime = results.reduce((sum, r) => sum + r.executionTime, 0);
        const avgTime = totalTime / Math.max(1, results.length);
        
        // Efficiency is inversely related to execution time
        return Math.max(0, 1 - (avgTime / 5000)); // Normalize against 5 second baseline
    }

    /**
     * Calculate test coverage
     */
    private calculateCoverage(selectedTests: string[], testImpacts: Record<string, TestImpact>): number {
        const totalTests = Object.keys(testImpacts).length;
        return totalTests > 0 ? selectedTests.length / totalTests : 0;
    }
}

/**
 * Feedback collector for RL learning
 */
class FeedbackCollector {
    private feedbackHistory: EnvironmentResponse[] = [];
    private maxHistorySize: number = 1000;

    /**
     * Store feedback from test execution
     */
    public storeFeedback(response: EnvironmentResponse): void {
        this.feedbackHistory.push(response);
        
        // Limit history size
        if (this.feedbackHistory.length > this.maxHistorySize) {
            this.feedbackHistory = this.feedbackHistory.slice(-this.maxHistorySize);
        }
        
        Logger.debug(`Stored feedback with accuracy: ${(response.accuracy || 0).toFixed(3)}`);
    }

    /**
     * Get recent feedback for RL analysis
     */
    public getRecentFeedback(count: number = 10): EnvironmentResponse[] {
        return this.feedbackHistory.slice(-count);
    }

    /**
     * Get all feedback history
     */
    public getAllFeedback(): EnvironmentResponse[] {
        return [...this.feedbackHistory];
    }

    /**
     * Clear feedback history
     */
    public clearHistory(): void {
        this.feedbackHistory = [];
        Logger.debug('Cleared feedback history');
    }

    /**
     * Get feedback statistics
     */
    public getStatistics(): FeedbackStatistics {
        if (this.feedbackHistory.length === 0) {
            return {
                totalFeedback: 0,
                averageAccuracy: 0,
                averagePrecision: 0,
                averageRecall: 0,
                recentTrend: 0
            };
        }

        const accuracies = this.feedbackHistory.map(f => f.accuracy || 0);
        const precisions = this.feedbackHistory.map(f => f.executionMetrics?.precision || 0);
        const recalls = this.feedbackHistory.map(f => f.executionMetrics?.recall || 0);

        const averageAccuracy = accuracies.reduce((sum, a) => sum + a, 0) / accuracies.length;
        const averagePrecision = precisions.reduce((sum, p) => sum + p, 0) / precisions.length;
        const averageRecall = recalls.reduce((sum, r) => sum + r, 0) / recalls.length;

        // Calculate recent trend
        const recentCount = Math.min(10, this.feedbackHistory.length);
        const recentAccuracies = accuracies.slice(-recentCount);
        const olderAccuracies = accuracies.slice(-recentCount * 2, -recentCount);
        
        let recentTrend = 0;
        if (olderAccuracies.length > 0 && recentAccuracies.length > 0) {
            const recentAvg = recentAccuracies.reduce((sum, a) => sum + a, 0) / recentAccuracies.length;
            const olderAvg = olderAccuracies.reduce((sum, a) => sum + a, 0) / olderAccuracies.length;
            recentTrend = recentAvg - olderAvg;
        }

        return {
            totalFeedback: this.feedbackHistory.length,
            averageAccuracy,
            averagePrecision,
            averageRecall,
            recentTrend
        };
    }
}

// Supporting interfaces
interface TestConfiguration {
    testGroups: {
        tests: { testId: string; testName: string; predictedImpact: number }[];
    }[];
    testImpacts: Record<string, TestImpact>;
}

interface TestSelectionStrategy {
    type: 'top_n' | 'threshold' | 'percentage' | 'all';
    parameters: {
        n?: number;
        threshold?: number;
        percentage?: number;
    };
}

interface StrategyEvaluation {
    strategy: TestSelectionStrategy;
    selectedTestCount: number;
    totalTestCount: number;
    accuracy: number;
    efficiency: number;
    coverage: number;
    executionTime: number;
    results: TestResult[];
}

interface FeedbackStatistics {
    totalFeedback: number;
    averageAccuracy: number;
    averagePrecision: number;
    averageRecall: number;
    recentTrend: number;
}