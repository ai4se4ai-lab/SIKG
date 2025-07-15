// MetricsCollector.ts - Performance metrics collection for Python projects

import * as vscode from 'vscode';
import { Logger } from '../../utils/Logger';
import { ConfigManager } from '../../utils/ConfigManager';
import { TestResult } from '../GraphTypes';

/**
 * Collects and manages performance metrics for SIKG test selection
 * Focuses on Python test execution and fault detection metrics
 */
export class MetricsCollector {
    private configManager: ConfigManager;
    private metrics: PerformanceMetrics = this.initializeMetrics();
    private sessionStartTime: number = Date.now();
    private testExecutions: TestExecution[] = [];

    constructor(configManager: ConfigManager) {
        this.configManager = configManager;
    }

    /**
     * Initialize empty metrics structure
     */
    private initializeMetrics(): PerformanceMetrics {
        return {
            totalTests: 0,
            selectedTests: 0,
            executedTests: 0,
            passedTests: 0,
            failedTests: 0,
            skippedTests: 0,
            totalExecutionTime: 0,
            faultsDetected: 0,
            selectionAccuracy: 0,
            reductionRatio: 0,
            pythonFilesAnalyzed: 0,
            averageTestTime: 0,
            sessionMetrics: {
                startTime: new Date().toISOString(),
                analysisCount: 0,
                testRunCount: 0
            }
        };
    }

    /**
     * Record test selection metrics for a Python project
     */
    public recordTestSelection(
        totalTests: number,
        selectedTests: string[],
        pythonFilesCount: number
    ): void {
        try {
            this.metrics.totalTests = totalTests;
            this.metrics.selectedTests = selectedTests.length;
            this.metrics.pythonFilesAnalyzed = pythonFilesCount;
            
            // Calculate selection reduction ratio
            this.metrics.reductionRatio = totalTests > 0 ? 
                1 - (selectedTests.length / totalTests) : 0;

            this.metrics.sessionMetrics.analysisCount++;

            Logger.info(`Test selection recorded: ${selectedTests.length}/${totalTests} tests selected (${(this.metrics.reductionRatio * 100).toFixed(1)}% reduction)`);

        } catch (error) {
            Logger.error('Error recording test selection metrics:', error);
        }
    }

    /**
     * Record test execution results from Python test runs
     */
    public recordTestExecution(testResults: TestResult[]): void {
        try {
            const startTime = Date.now();
            let totalExecutionTime = 0;
            let faultsDetected = 0;

            for (const result of testResults) {
                const execution: TestExecution = {
                    testId: result.testId,
                    status: result.status,
                    executionTime: result.executionTime,
                    timestamp: new Date(result.timestamp),
                    predictedImpact: result.predictedImpact || 0,
                    wasFaultDetected: result.status === 'failed'
                };

                this.testExecutions.push(execution);
                totalExecutionTime += result.executionTime;

                if (result.status === 'failed') {
                    faultsDetected++;
                    this.metrics.failedTests++;
                } else if (result.status === 'passed') {
                    this.metrics.passedTests++;
                } else if (result.status === 'skipped') {
                    this.metrics.skippedTests++;
                }
            }

            // Update aggregate metrics
            this.metrics.executedTests += testResults.length;
            this.metrics.totalExecutionTime += totalExecutionTime;
            this.metrics.faultsDetected += faultsDetected;
            this.metrics.averageTestTime = this.metrics.executedTests > 0 ? 
                this.metrics.totalExecutionTime / this.metrics.executedTests : 0;

            this.metrics.sessionMetrics.testRunCount++;

            // Calculate selection accuracy
            this.calculateSelectionAccuracy();

            Logger.info(`Test execution recorded: ${testResults.length} tests, ${faultsDetected} faults detected, ${totalExecutionTime}ms total time`);

        } catch (error) {
            Logger.error('Error recording test execution metrics:', error);
        }
    }

    /**
     * Calculate selection accuracy based on fault detection
     */
    private calculateSelectionAccuracy(): void {
        if (this.testExecutions.length === 0) {
            this.metrics.selectionAccuracy = 0;
            return;
        }

        // Accuracy = (tests that found faults + tests that passed correctly) / total tests
        const correctPredictions = this.testExecutions.filter(execution => {
            const highImpactPredicted = execution.predictedImpact > 0.5;
            const faultFound = execution.wasFaultDetected;
            
            // Correct if: high impact predicted and fault found, or low impact predicted and no fault
            return (highImpactPredicted && faultFound) || (!highImpactPredicted && !faultFound);
        }).length;

        this.metrics.selectionAccuracy = correctPredictions / this.testExecutions.length;
    }

    /**
     * Record Python-specific analysis metrics
     */
    public recordPythonAnalysis(
        pythonFiles: string[],
        testFiles: string[],
        analysisTimeMs: number
    ): void {
        try {
            const pythonMetrics = {
                pythonFilesAnalyzed: pythonFiles.length,
                testFilesFound: testFiles.length,
                analysisTime: analysisTimeMs,
                timestamp: new Date().toISOString()
            };

            Logger.debug(`Python analysis: ${pythonFiles.length} .py files, ${testFiles.length} test files, ${analysisTimeMs}ms`);

        } catch (error) {
            Logger.error('Error recording Python analysis metrics:', error);
        }
    }

    /**
     * Get current performance metrics
     */
    public getMetrics(): PerformanceMetrics {
        // Update session duration
        const sessionDuration = Date.now() - this.sessionStartTime;
        
        return {
            ...this.metrics,
            sessionMetrics: {
                ...this.metrics.sessionMetrics,
                sessionDurationMs: sessionDuration
            }
        };
    }

    /**
     * Get test execution history for analysis
     */
    public getTestExecutions(limit?: number): TestExecution[] {
        if (limit) {
            return this.testExecutions.slice(-limit);
        }
        return [...this.testExecutions];
    }

    /**
     * Calculate time-based metrics for Python tests
     */
    public getTimeBasedMetrics(): TimeMetrics {
        const executions = this.testExecutions;
        
        if (executions.length === 0) {
            return {
                totalTime: 0,
                averageTime: 0,
                medianTime: 0,
                minTime: 0,
                maxTime: 0,
                timeDistribution: []
            };
        }

        const times = executions.map(e => e.executionTime).sort((a, b) => a - b);
        const totalTime = times.reduce((sum, time) => sum + time, 0);
        const averageTime = totalTime / times.length;
        const medianTime = times[Math.floor(times.length / 2)];
        const minTime = times[0];
        const maxTime = times[times.length - 1];

        // Create time distribution buckets
        const buckets = [
            { range: '0-100ms', count: 0 },
            { range: '100-500ms', count: 0 },
            { range: '500ms-2s', count: 0 },
            { range: '2s-10s', count: 0 },
            { range: '10s+', count: 0 }
        ];

        times.forEach(time => {
            if (time <= 100) buckets[0].count++;
            else if (time <= 500) buckets[1].count++;
            else if (time <= 2000) buckets[2].count++;
            else if (time <= 10000) buckets[3].count++;
            else buckets[4].count++;
        });

        return {
            totalTime,
            averageTime,
            medianTime,
            minTime,
            maxTime,
            timeDistribution: buckets
        };
    }

    /**
     * Get fault detection trends over time
     */
    public getFaultDetectionTrends(): FaultTrend[] {
        const trends: FaultTrend[] = [];
        const groupSize = 10; // Group by 10 test executions
        
        for (let i = 0; i < this.testExecutions.length; i += groupSize) {
            const group = this.testExecutions.slice(i, i + groupSize);
            const faults = group.filter(e => e.wasFaultDetected).length;
            const accuracy = group.length > 0 ? faults / group.length : 0;
            
            trends.push({
                period: `Tests ${i + 1}-${i + group.length}`,
                faultsDetected: faults,
                totalTests: group.length,
                detectionRate: accuracy,
                averageExecutionTime: group.reduce((sum, e) => sum + e.executionTime, 0) / group.length
            });
        }
        
        return trends;
    }

    /**
     * Reset metrics for a new session
     */
    public resetSession(): void {
        this.metrics = this.initializeMetrics();
        this.testExecutions = [];
        this.sessionStartTime = Date.now();
        
        Logger.info('Performance metrics session reset');
    }

    /**
     * Export metrics for external analysis
     */
    public exportMetrics(): string {
        const exportData = {
            metrics: this.getMetrics(),
            executions: this.getTestExecutions(),
            timeMetrics: this.getTimeBasedMetrics(),
            trends: this.getFaultDetectionTrends(),
            exportTime: new Date().toISOString()
        };
        
        return JSON.stringify(exportData, null, 2);
    }

    /**
     * Clean up resources
     */
    public dispose(): void {
        this.testExecutions = [];
        this.metrics = this.initializeMetrics();
        Logger.debug('Metrics collector disposed');
    }
}

// Interfaces for metrics data structures
export interface PerformanceMetrics {
    totalTests: number;
    selectedTests: number;
    executedTests: number;
    passedTests: number;
    failedTests: number;
    skippedTests: number;
    totalExecutionTime: number;
    faultsDetected: number;
    selectionAccuracy: number;
    reductionRatio: number;
    pythonFilesAnalyzed: number;
    averageTestTime: number;
    sessionMetrics: {
        startTime: string;
        analysisCount: number;
        testRunCount: number;
        sessionDurationMs?: number;
    };
}

export interface TestExecution {
    testId: string;
    status: 'passed' | 'failed' | 'skipped';
    executionTime: number;
    timestamp: Date;
    predictedImpact: number;
    wasFaultDetected: boolean;
}

export interface TimeMetrics {
    totalTime: number;
    averageTime: number;
    medianTime: number;
    minTime: number;
    maxTime: number;
    timeDistribution: { range: string; count: number }[];
}

export interface FaultTrend {
    period: string;
    faultsDetected: number;
    totalTests: number;
    detectionRate: number;
    averageExecutionTime: number;
}