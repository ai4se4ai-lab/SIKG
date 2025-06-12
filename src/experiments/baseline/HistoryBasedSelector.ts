// HistoryBasedSelector.ts - History-based test prioritization baseline

import { BaselineSelector } from './BaselineSelector';
import { Logger } from '../../utils/Logger';

export interface TestHistoryRecord {
    testId: string;
    executionTime: number;
    status: 'passed' | 'failed' | 'skipped';
    timestamp: Date;
    commitHash?: string;
}

export interface TestStats {
    testId: string;
    failureRate: number;
    avgExecutionTime: number;
    lastFailure?: Date;
    totalExecutions: number;
    recentTrend: 'improving' | 'stable' | 'declining';
}

/**
 * History-based baseline using historical test failure rates
 * Prioritizes tests based on failure frequency and execution patterns
 */
export class HistoryBasedSelector implements BaselineSelector {
    public readonly name = 'History-TCP';
    
    private testHistory: TestHistoryRecord[] = [];
    private testStats: Map<string, TestStats> = new Map();

    /**
     * Initialize with historical test execution data
     */
    public initialize(history: TestHistoryRecord[]): void {
        this.testHistory = history;
        this.calculateTestStats();
        
        Logger.debug(`History-based selector initialized with ${history.length} records for ${this.testStats.size} tests`);
    }

    /**
     * Select tests based on historical failure rates
     */
    public async selectTests(
        allTests: string[],
        changedFiles: string[],
        historicalData?: import("../../sikg/GraphTypes").TestResult[]
    ): Promise<string[]> {
        if (allTests.length === 0) {
            return [];
        }

        // Use provided historicalData if available, otherwise use internal stats
        // For now, we keep using internal stats as before
        const targetRatio = 0.3;

        // Calculate risk scores for all tests
        const testRisks = allTests.map(testId => {
            const stats = this.testStats.get(testId);
            const riskScore = this.calculateRiskScore(stats);
            return { testId, riskScore };
        });

        // Sort by risk score and select top N
        testRisks.sort((a, b) => b.riskScore - a.riskScore);

        const targetCount = Math.max(1, Math.floor(allTests.length * targetRatio));
        const selected = testRisks.slice(0, targetCount).map(tr => tr.testId);

        Logger.debug(`History selector: ${selected.length}/${allTests.length} tests selected based on failure risk`);
        return selected;
    }

    /**
     * Prioritize tests by failure rate, recency, and execution time
     */
    public prioritizeTests(selectedTests: string[]): string[] {
        const testPriorities = selectedTests.map(testId => {
            const stats = this.testStats.get(testId);
            const priority = this.calculatePriorityScore(stats);
            
            return { testId, priority };
        });

        testPriorities.sort((a, b) => b.priority - a.priority);
        
        return testPriorities.map(tp => tp.testId);
    }

    /**
     * Calculate risk score based on test statistics
     */
    private calculateRiskScore(stats?: TestStats): number {
        if (!stats || stats.totalExecutions === 0) {
            return 0.5; // Default medium risk for unknown tests
        }

        let riskScore = 0;
        
        // Failure rate component (0-0.4)
        riskScore += Math.min(0.4, stats.failureRate);
        
        // Recent trend component (0-0.3)
        const trendScore = stats.recentTrend === 'declining' ? 0.3 : 
                          stats.recentTrend === 'stable' ? 0.15 : 0.1;
        riskScore += trendScore;
        
        // Recency of last failure (0-0.2)
        if (stats.lastFailure) {
            const daysSinceFailure = (Date.now() - stats.lastFailure.getTime()) / (1000 * 60 * 60 * 24);
            const recencyScore = Math.max(0, 0.2 * (1 - daysSinceFailure / 30)); // Decay over 30 days
            riskScore += recencyScore;
        }
        
        // Execution frequency bonus (0-0.1)
        const frequencyScore = Math.min(0.1, stats.totalExecutions / 100);
        riskScore += frequencyScore;
        
        return Math.min(1.0, riskScore);
    }

    /**
     * Calculate priority score for test ordering
     */
    private calculatePriorityScore(stats?: TestStats): number {
        if (!stats) {
            return 0.5;
        }

        // Higher priority for:
        // 1. Higher failure rates
        // 2. Faster execution (to get quick feedback)
        // 3. Recent failures
        
        const failureComponent = stats.failureRate * 0.5;
        const speedComponent = (1 / (stats.avgExecutionTime + 1)) * 0.3;
        const recencyComponent = stats.lastFailure ? 
            Math.max(0, 0.2 * (1 - (Date.now() - stats.lastFailure.getTime()) / (7 * 24 * 60 * 60 * 1000))) : 0;
        
        return failureComponent + speedComponent + recencyComponent;
    }

    /**
     * Calculate statistics for each test from history
     */
    private calculateTestStats(): void {
        this.testStats.clear();
        
        // Group records by test ID
        const testGroups = new Map<string, TestHistoryRecord[]>();
        
        for (const record of this.testHistory) {
            if (!testGroups.has(record.testId)) {
                testGroups.set(record.testId, []);
            }
            testGroups.get(record.testId)!.push(record);
        }

        // Calculate stats for each test
        for (const [testId, records] of testGroups) {
            const totalExecutions = records.length;
            const failures = records.filter(r => r.status === 'failed').length;
            const failureRate = totalExecutions > 0 ? failures / totalExecutions : 0;
            
            const avgExecutionTime = records.reduce((sum, r) => sum + r.executionTime, 0) / totalExecutions;
            
            const lastFailure = records
                .filter(r => r.status === 'failed')
                .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0]?.timestamp;
            
            const recentTrend = this.calculateRecentTrend(records);
            
            this.testStats.set(testId, {
                testId,
                failureRate,
                avgExecutionTime,
                lastFailure,
                totalExecutions,
                recentTrend
            });
        }
    }

    /**
     * Calculate recent trend based on last 10 executions
     */
    private calculateRecentTrend(records: TestHistoryRecord[]): 'improving' | 'stable' | 'declining' {
        if (records.length < 5) {
            return 'stable';
        }

        // Sort by timestamp (newest first)
        const sorted = records.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        const recent = sorted.slice(0, 10);
        
        const firstHalf = recent.slice(0, 5);
        const secondHalf = recent.slice(5, 10);
        
        const firstHalfFailures = firstHalf.filter(r => r.status === 'failed').length;
        const secondHalfFailures = secondHalf.filter(r => r.status === 'failed').length;
        
        if (firstHalfFailures < secondHalfFailures * 0.8) {
            return 'improving';
        } else if (firstHalfFailures > secondHalfFailures * 1.2) {
            return 'declining';
        } else {
            return 'stable';
        }
    }

    /**
     * Get selector statistics
     */
    public getStats(): {
        name: string;
        testsWithHistory: number;
        avgFailureRate: number;
        avgExecutionTime: number;
    } {
        const stats = Array.from(this.testStats.values());
        
        return {
            name: this.name,
            testsWithHistory: stats.length,
            avgFailureRate: stats.length > 0 ? 
                stats.reduce((sum, s) => sum + s.failureRate, 0) / stats.length : 0,
            avgExecutionTime: stats.length > 0 ?
                stats.reduce((sum, s) => sum + s.avgExecutionTime, 0) / stats.length : 0
        };
    }

    /**
     * Generate synthetic test history for evaluation
     */
    public static generateSyntheticHistory(
        testIds: string[], 
        executionCount: number = 100
    ): TestHistoryRecord[] {
        const history: TestHistoryRecord[] = [];
        const now = Date.now();
        
        for (let i = 0; i < executionCount; i++) {
            const testId = testIds[Math.floor(Math.random() * testIds.length)];
            const timestamp = new Date(now - Math.random() * 30 * 24 * 60 * 60 * 1000); // Last 30 days
            
            // Simulate test characteristics
            const isFlaky = Math.random() < 0.1; // 10% of tests are flaky
            const baseFailureRate = isFlaky ? 0.2 : 0.05; // Flaky tests fail more
            const failed = Math.random() < baseFailureRate;
            
            history.push({
                testId,
                executionTime: Math.floor(Math.random() * 5000 + 100), // 100ms to 5s
                status: failed ? 'failed' : 'passed',
                timestamp,
                commitHash: Math.random().toString(36).substring(2, 10)
            });
        }
        
        return history.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    }
}