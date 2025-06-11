// src/experiments/baseline/HistoryBasedSelector.ts - History-based test selection baseline

import { TestResult } from '../../sikg/GraphTypes';
import { Logger } from '../../utils/Logger';
import { BaselineSelector } from './index';

/**
 * Test failure pattern for historical analysis
 */
interface TestFailurePattern {
    testId: string;
    totalRuns: number;
    failures: number;
    failureRate: number;
    lastFailure?: Date;
    consecutiveFailures: number;
    averageFailureInterval: number; // Days between failures
    failureStreak: boolean;
    contextualFailures: Map<string, number>; // Failures per file context
}

/**
 * File change impact pattern
 */
interface FileImpactPattern {
    filePath: string;
    totalChanges: number;
    causedFailures: number;
    impactRate: number;
    affectedTests: Set<string>;
    averageFailuresPerChange: number;
}

/**
 * History-based test selection using sophisticated failure pattern analysis
 * Implements state-of-the-art history-based RTS approaches from literature
 */
export class HistoryBasedSelector implements BaselineSelector {
    name = 'history';
    
    // Configuration parameters
    private readonly FAILURE_RATE_WEIGHT = 0.4;
    private readonly RECENCY_WEIGHT = 0.3;
    private readonly STREAK_WEIGHT = 0.2;
    private readonly CONTEXT_WEIGHT = 0.1;
    
    private readonly RECENCY_DECAY_DAYS = 30; // Half-life for recency scoring
    private readonly MIN_RUNS_FOR_RELIABILITY = 3;
    private readonly SELECTION_PERCENTILE = 0.6; // Select top 60% by default
    
    // Caches for performance
    private testPatternCache: Map<string, TestFailurePattern> = new Map();
    private fileImpactCache: Map<string, FileImpactPattern> = new Map();
    private lastAnalysisTime: number = 0;

    /**
     * Select tests based on historical failure patterns and file change impact
     */
    async selectTests(
        allTests: string[], 
        changedFiles: string[], 
        historicalData?: TestResult[]
    ): Promise<string[]> {
        if (!historicalData || historicalData.length === 0) {
            Logger.warn('No historical data available, selecting all tests');
            return [...allTests];
        }

        Logger.debug(`History-based selection with ${historicalData.length} historical results`);

        // Analyze historical patterns
        const testPatterns = this.analyzeTestFailurePatterns(historicalData);
        const fileImpacts = this.analyzeFileImpactPatterns(historicalData, changedFiles);
        
        // Calculate risk scores for each test
        const testRiskScores = this.calculateTestRiskScores(
            allTests, 
            testPatterns, 
            fileImpacts, 
            changedFiles
        );
        
        // Select tests based on risk scores
        const selectedTests = this.selectTestsByRisk(testRiskScores, allTests.length);
        
        Logger.debug(`History-based selector: ${selectedTests.length}/${allTests.length} tests selected`);
        
        // Log selection rationale for top tests
        this.logSelectionRationale(selectedTests.slice(0, 5), testRiskScores, testPatterns);
        
        return selectedTests;
    }

    /**
     * Analyze historical test failure patterns
     */
    private analyzeTestFailurePatterns(historicalData: TestResult[]): Map<string, TestFailurePattern> {
        const patterns = new Map<string, TestFailurePattern>();
        
        // Group results by test ID
        const testResults = this.groupResultsByTest(historicalData);
        
        for (const [testId, results] of testResults.entries()) {
            const pattern = this.analyzeIndividualTestPattern(testId, results);
            patterns.set(testId, pattern);
        }
        
        Logger.debug(`Analyzed failure patterns for ${patterns.size} tests`);
        return patterns;
    }

    /**
     * Analyze individual test failure pattern
     */
    private analyzeIndividualTestPattern(testId: string, results: TestResult[]): TestFailurePattern {
        // Sort results by timestamp
        const sortedResults = results.sort((a, b) => 
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        const totalRuns = sortedResults.length;
        const failures = sortedResults.filter(r => r.status === 'failed').length;
        const failureRate = totalRuns > 0 ? failures / totalRuns : 0;

        // Find last failure
        const failureResults = sortedResults.filter(r => r.status === 'failed');
        const lastFailure = failureResults.length > 0 ? 
            new Date(failureResults[failureResults.length - 1].timestamp) : undefined;

        // Calculate consecutive failures at the end
        let consecutiveFailures = 0;
        for (let i = sortedResults.length - 1; i >= 0; i--) {
            if (sortedResults[i].status === 'failed') {
                consecutiveFailures++;
            } else {
                break;
            }
        }

        // Calculate average failure interval
        const averageFailureInterval = this.calculateAverageFailureInterval(failureResults);
        
        // Determine if currently in a failure streak
        const failureStreak = consecutiveFailures > 0;

        // Analyze contextual failures (failures associated with specific file changes)
        const contextualFailures = this.analyzeContextualFailures(sortedResults);

        return {
            testId,
            totalRuns,
            failures,
            failureRate,
            lastFailure,
            consecutiveFailures,
            averageFailureInterval,
            failureStreak,
            contextualFailures
        };
    }

    /**
     * Analyze file impact patterns from historical data
     */
    private analyzeFileImpactPatterns(
        historicalData: TestResult[], 
        changedFiles: string[]
    ): Map<string, FileImpactPattern> {
        const patterns = new Map<string, FileImpactPattern>();
        
        // For simplification, we'll infer file changes from test IDs and results
        // In a real implementation, this would correlate with actual Git commit data
        for (const file of changedFiles) {
            const pattern = this.analyzeFileImpact(file, historicalData);
            patterns.set(file, pattern);
        }
        
        return patterns;
    }

    /**
     * Analyze impact pattern for a specific file
     */
    private analyzeFileImpact(filePath: string, historicalData: TestResult[]): FileImpactPattern {
        // Extract module name from file path for correlation
        const moduleName = this.extractModuleName(filePath);
        
        // Find tests that are likely related to this file
        const relatedTests = historicalData.filter(result => 
            this.isTestRelatedToFile(result.testId, filePath, moduleName)
        );

        const totalChanges = this.estimateFileChanges(filePath, historicalData);
        const causedFailures = relatedTests.filter(r => r.status === 'failed').length;
        const impactRate = totalChanges > 0 ? causedFailures / totalChanges : 0;
        
        const affectedTests = new Set(relatedTests.map(r => r.testId));
        const averageFailuresPerChange = totalChanges > 0 ? causedFailures / totalChanges : 0;

        return {
            filePath,
            totalChanges,
            causedFailures,
            impactRate,
            affectedTests,
            averageFailuresPerChange
        };
    }

    /**
     * Calculate risk scores for all tests
     */
    private calculateTestRiskScores(
        allTests: string[],
        testPatterns: Map<string, TestFailurePattern>,
        fileImpacts: Map<string, FileImpactPattern>,
        changedFiles: string[]
    ): Map<string, number> {
        const riskScores = new Map<string, number>();
        
        for (const testId of allTests) {
            const riskScore = this.calculateIndividualTestRisk(
                testId, 
                testPatterns, 
                fileImpacts, 
                changedFiles
            );
            riskScores.set(testId, riskScore);
        }
        
        return riskScores;
    }

    /**
     * Calculate risk score for an individual test
     */
    private calculateIndividualTestRisk(
        testId: string,
        testPatterns: Map<string, TestFailurePattern>,
        fileImpacts: Map<string, FileImpactPattern>,
        changedFiles: string[]
    ): number {
        const pattern = testPatterns.get(testId);
        
        // Base score components
        let failureRateScore = 0;
        let recencyScore = 0;
        let streakScore = 0;
        let contextScore = 0;

        if (pattern && pattern.totalRuns >= this.MIN_RUNS_FOR_RELIABILITY) {
            // 1. Failure rate score (0-1)
            failureRateScore = Math.min(1.0, pattern.failureRate * 2); // Scale up to emphasize high failure rates
            
            // 2. Recency score (0-1) - exponential decay
            recencyScore = this.calculateRecencyScore(pattern.lastFailure);
            
            // 3. Streak score (0-1) - current failure streak
            streakScore = pattern.failureStreak ? 
                Math.min(1.0, pattern.consecutiveFailures / 5) : 0; // Max at 5 consecutive failures
            
            // 4. Context score - correlation with changed files
            contextScore = this.calculateContextScore(testId, changedFiles, fileImpacts);
        } else if (pattern && pattern.totalRuns > 0) {
            // For tests with limited history, use basic failure rate with uncertainty penalty
            failureRateScore = pattern.failureRate * 0.5; // Reduce confidence
            recencyScore = this.calculateRecencyScore(pattern.lastFailure) * 0.5;
        } else {
            // For tests with no history, base score on file correlation only
            contextScore = this.calculateContextScore(testId, changedFiles, fileImpacts);
        }

        // Weighted combination
        const riskScore = 
            this.FAILURE_RATE_WEIGHT * failureRateScore +
            this.RECENCY_WEIGHT * recencyScore +
            this.STREAK_WEIGHT * streakScore +
            this.CONTEXT_WEIGHT * contextScore;

        return Math.min(1.0, riskScore); // Ensure score is capped at 1.0
    }

    /**
     * Calculate recency score based on time since last failure
     */
    private calculateRecencyScore(lastFailure?: Date): number {
        if (!lastFailure) {
            return 0;
        }
        
        const daysSinceFailure = (Date.now() - lastFailure.getTime()) / (1000 * 60 * 60 * 24);
        
        // Exponential decay with half-life of RECENCY_DECAY_DAYS
        return Math.exp(-daysSinceFailure / this.RECENCY_DECAY_DAYS);
    }

    /**
     * Calculate context score based on file change correlation
     */
    private calculateContextScore(
        testId: string,
        changedFiles: string[],
        fileImpacts: Map<string, FileImpactPattern>
    ): number {
        let maxContextScore = 0;
        
        for (const filePath of changedFiles) {
            const impact = fileImpacts.get(filePath);
            if (impact && impact.affectedTests.has(testId)) {
                // Score based on how frequently this file change causes this test to fail
                const contextScore = Math.min(1.0, impact.averageFailuresPerChange * 2);
                maxContextScore = Math.max(maxContextScore, contextScore);
            }
            
            // Also check for name-based correlation
            if (this.hasNameCorrelation(testId, filePath)) {
                maxContextScore = Math.max(maxContextScore, 0.5); // Moderate correlation
            }
        }
        
        return maxContextScore;
    }

    /**
     * Select tests based on risk scores
     */
    private selectTestsByRisk(riskScores: Map<string, number>, totalTests: number): string[] {
        // Sort tests by risk score (descending)
        const sortedTests = Array.from(riskScores.entries())
            .sort((a, b) => b[1] - a[1]);

        // Select top percentage of tests by risk
        const numToSelect = Math.max(1, Math.floor(totalTests * this.SELECTION_PERCENTILE));
        
        return sortedTests.slice(0, numToSelect).map(([testId, _]) => testId);
    }

    /**
     * Group test results by test ID
     */
    private groupResultsByTest(historicalData: TestResult[]): Map<string, TestResult[]> {
        const grouped = new Map<string, TestResult[]>();
        
        for (const result of historicalData) {
            if (!grouped.has(result.testId)) {
                grouped.set(result.testId, []);
            }
            grouped.get(result.testId)!.push(result);
        }
        
        return grouped;
    }

    /**
     * Calculate average interval between failures in days
     */
    private calculateAverageFailureInterval(failureResults: TestResult[]): number {
        if (failureResults.length < 2) {
            return Infinity;
        }
        
        const intervals: number[] = [];
        for (let i = 1; i < failureResults.length; i++) {
            const prevTime = new Date(failureResults[i - 1].timestamp).getTime();
            const currTime = new Date(failureResults[i].timestamp).getTime();
            const intervalDays = (currTime - prevTime) / (1000 * 60 * 60 * 24);
            intervals.push(intervalDays);
        }
        
        return intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    }

    /**
     * Analyze contextual failures associated with specific changes
     */
    private analyzeContextualFailures(results: TestResult[]): Map<string, number> {
        const contextualFailures = new Map<string, number>();
        
        // Group failures by time periods to infer change contexts
        const failures = results.filter(r => r.status === 'failed');
        
        for (const failure of failures) {
            // Extract potential context from test ID or error messages
            const context = this.extractFailureContext(failure);
            
            for (const ctx of context) {
                contextualFailures.set(ctx, (contextualFailures.get(ctx) || 0) + 1);
            }
        }
        
        return contextualFailures;
    }

    /**
     * Extract failure context from test result
     */
    private extractFailureContext(result: TestResult): string[] {
        const contexts: string[] = [];
        
        // Extract module/file context from test ID
        if (result.testId.includes('/')) {
            const pathParts = result.testId.split('/');
            contexts.push(pathParts[pathParts.length - 2] || 'unknown'); // Parent directory
        }
        
        // Extract error type context if available
        if (result.errorMessage) {
            const errorType = this.extractErrorType(result.errorMessage);
            if (errorType) {
                contexts.push(errorType);
            }
        }
        
        return contexts;
    }

    /**
     * Extract error type from error message
     */
    private extractErrorType(errorMessage: string): string | null {
        // Common Python error patterns
        const errorPatterns = [
            /(\w*Error):/,
            /(\w*Exception):/,
            /(AssertionError)/,
            /(TypeError)/,
            /(ValueError)/,
            /(ImportError)/
        ];
        
        for (const pattern of errorPatterns) {
            const match = errorMessage.match(pattern);
            if (match) {
                return match[1];
            }
        }
        
        return null;
    }

    /**
     * Estimate file changes from historical test data (simplified)
     */
    private estimateFileChanges(filePath: string, historicalData: TestResult[]): number {
        // Simplified estimation based on test execution frequency
        // In real implementation, this would use Git commit data
        
        const moduleName = this.extractModuleName(filePath);
        const relatedResults = historicalData.filter(result => 
            this.isTestRelatedToFile(result.testId, filePath, moduleName)
        );
        
        // Estimate changes based on test execution clusters
        const timeWindows = this.groupResultsByTimeWindows(relatedResults, 24 * 60 * 60 * 1000); // 24-hour windows
        
        return timeWindows.length; // Approximate number of change events
    }

    /**
     * Group results by time windows
     */
    private groupResultsByTimeWindows(results: TestResult[], windowSizeMs: number): TestResult[][] {
        if (results.length === 0) return [];
        
        const sorted = results.sort((a, b) => 
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        
        const windows: TestResult[][] = [];
        let currentWindow: TestResult[] = [sorted[0]];
        let windowStart = new Date(sorted[0].timestamp).getTime();
        
        for (let i = 1; i < sorted.length; i++) {
            const resultTime = new Date(sorted[i].timestamp).getTime();
            
            if (resultTime - windowStart <= windowSizeMs) {
                currentWindow.push(sorted[i]);
            } else {
                windows.push(currentWindow);
                currentWindow = [sorted[i]];
                windowStart = resultTime;
            }
        }
        
        if (currentWindow.length > 0) {
            windows.push(currentWindow);
        }
        
        return windows;
    }

    /**
     * Check if test is related to a file
     */
    private isTestRelatedToFile(testId: string, filePath: string, moduleName: string): boolean {
        const testIdLower = testId.toLowerCase();
        const filePathLower = filePath.toLowerCase();
        const moduleNameLower = moduleName.toLowerCase();
        
        // Direct file path match
        if (testIdLower.includes(filePathLower)) {
            return true;
        }
        
        // Module name correlation
        if (testIdLower.includes(moduleNameLower)) {
            return true;
        }
        
        // Test naming patterns (test_module.py tests module.py)
        if (testIdLower.includes(`test_${moduleNameLower}`) || 
            testIdLower.includes(`${moduleNameLower}_test`)) {
            return true;
        }
        
        return false;
    }

    /**
     * Extract module name from file path
     */
    private extractModuleName(filePath: string): string {
        const fileName = filePath.split('/').pop() || filePath;
        return fileName.replace(/\.(py|js|ts|java|cpp|c)$/, '');
    }

    /**
     * Check for name-based correlation between test and file
     */
    private hasNameCorrelation(testId: string, filePath: string): boolean {
        const moduleName = this.extractModuleName(filePath);
        return this.isTestRelatedToFile(testId, filePath, moduleName);
    }

    /**
     * Log selection rationale for debugging
     */
    private logSelectionRationale(
        selectedTests: string[],
        riskScores: Map<string, number>,
        testPatterns: Map<string, TestFailurePattern>
    ): void {
        if (selectedTests.length === 0) return;
        
        Logger.debug('Top selected tests by history-based analysis:');
        
        for (const testId of selectedTests.slice(0, 3)) {
            const score = riskScores.get(testId) || 0;
            const pattern = testPatterns.get(testId);
            
            const rationale = pattern ? 
                `score=${score.toFixed(3)}, rate=${pattern.failureRate.toFixed(2)}, ` +
                `runs=${pattern.totalRuns}, streak=${pattern.consecutiveFailures}` :
                `score=${score.toFixed(3)}, no-history`;
                
            Logger.debug(`  ${testId}: ${rationale}`);
        }
    }

    /**
     * Get detailed statistics about the historical analysis
     */
    public getAnalysisStatistics(): {
        testsAnalyzed: number;
        averageFailureRate: number;
        testsWithHistory: number;
        testsInFailureStreak: number;
        averageHistoryDepth: number;
    } {
        const patterns = Array.from(this.testPatternCache.values());
        
        if (patterns.length === 0) {
            return {
                testsAnalyzed: 0,
                averageFailureRate: 0,
                testsWithHistory: 0,
                testsInFailureStreak: 0,
                averageHistoryDepth: 0
            };
        }
        
        const testsWithHistory = patterns.filter(p => p.totalRuns >= this.MIN_RUNS_FOR_RELIABILITY).length;
        const testsInFailureStreak = patterns.filter(p => p.failureStreak).length;
        const averageFailureRate = patterns.reduce((sum, p) => sum + p.failureRate, 0) / patterns.length;
        const averageHistoryDepth = patterns.reduce((sum, p) => sum + p.totalRuns, 0) / patterns.length;
        
        return {
            testsAnalyzed: patterns.length,
            averageFailureRate,
            testsWithHistory,
            testsInFailureStreak,
            averageHistoryDepth
        };
    }

    /**
     * Clear caches (useful for testing)
     */
    public clearCaches(): void {
        this.testPatternCache.clear();
        this.fileImpactCache.clear();
        this.lastAnalysisTime = 0;
    }
}