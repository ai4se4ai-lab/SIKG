// Test Runner Service - Runs tests and collects results

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { TestImpact, TestResult } from '../sikg/GraphTypes';
import { Logger } from '../utils/Logger';

export class TestRunnerService {
    /**
     * Run prioritized tests based on impact scores
     */
    public async runPrioritizedTests(
        testImpacts: Record<string, TestImpact>,
        topN?: number
    ): Promise<TestResult[]> {
        Logger.info(`Running prioritized tests, top ${topN || 'all'}`);
        
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
        const testsByFile: Record<string, { testId: string; testName: string }[]> = {};
        
        for (const test of testsToRun) {
            if (!testsByFile[test.testPath]) {
                testsByFile[test.testPath] = [];
            }
            
            testsByFile[test.testPath].push({
                testId: test.testId,
                testName: test.testName
            });
        }
        
        // Run tests and collect results
        const allResults: TestResult[] = [];
        
        for (const [filePath, tests] of Object.entries(testsByFile)) {
            try {
                // Prepare test execution based on file type
                const fileExt = path.extname(filePath).toLowerCase();
                let testResults: TestResult[];
                
                if (fileExt === '.ts' || fileExt === '.js' || fileExt === '.tsx' || fileExt === '.jsx') {
                    // JavaScript/TypeScript tests (Jest, Mocha, etc.)
                    testResults = await this.runJsTests(filePath, tests, testImpacts);
                } else if (fileExt === '.java') {
                    // Java tests (JUnit, etc.)
                    testResults = await this.runJavaTests(filePath, tests, testImpacts);
                } else if (fileExt === '.py') {
                    // Python tests (pytest, unittest, etc.)
                    testResults = await this.runPythonTests(filePath, tests, testImpacts);
                } else if (fileExt === '.cs') {
                    // C# tests (NUnit, MSTest, etc.)
                    testResults = await this.runCSharpTests(filePath, tests, testImpacts);
                } else if (fileExt === '.go') {
                    // Go tests
                    testResults = await this.runGoTests(filePath, tests, testImpacts);
                } else {
                    // Generic approach using VS Code Test API
                    testResults = await this.runGenericTests(filePath, tests, testImpacts);
                }
                
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
        
        return allResults;
    }

    /**
     * Parse test results from a task execution
     */
    public async parseTestResults(taskExecution: vscode.TaskExecution): Promise<TestResult[] | null> {
        // This is simplified - in a real extension, parse specific test runner output
        return null;
    }

    /**
     * Run JavaScript/TypeScript tests
     */
    private async runJsTests(
        filePath: string,
        tests: { testId: string; testName: string }[],
        testImpacts: Record<string, TestImpact>
    ): Promise<TestResult[]> {
        // Simplified implementation - in a real extension, run actual tests
        // This would use the VS Code Test API or spawn a process
        
        Logger.info(`Running JS tests in ${filePath}`);
        
        // Simulate test execution
        const results: TestResult[] = [];
        
        for (const test of tests) {
            // Simulate success/failure based on impact score
            // In a real implementation, actually run the test
            const predictedImpact = testImpacts[test.testId]?.impactScore || 0;
            const changedNodeIds = testImpacts[test.testId]?.contributingChanges.map(c => c.nodeId) || [];
            
            // Higher impact scores more likely to fail (for simulation only)
            const passProbability = 1 - Math.min(0.8, predictedImpact);
            const passed = Math.random() > passProbability;
            
            results.push({
                testId: test.testId,
                status: passed ? 'passed' : 'failed',
                executionTime: Math.random() * 1000 + 100, // Random execution time for simulation
                predictedImpact,
                changedNodeIds,
                timestamp: new Date().toISOString()
            });
        }
        
        return results;
    }

    /**
     * Run Java tests
     */
    private async runJavaTests(
        filePath: string,
        tests: { testId: string; testName: string }[],
        testImpacts: Record<string, TestImpact>
    ): Promise<TestResult[]> {
        // Similar approach as JS tests, but for Java
        return this.simulateTestResults(tests, testImpacts);
    }

    /**
     * Run Python tests
     */
    private async runPythonTests(
        filePath: string,
        tests: { testId: string; testName: string }[],
        testImpacts: Record<string, TestImpact>
    ): Promise<TestResult[]> {
        // Similar approach as JS tests, but for Python
        return this.simulateTestResults(tests, testImpacts);
    }

    /**
     * Run C# tests
     */
    private async runCSharpTests(
        filePath: string,
        tests: { testId: string; testName: string }[],
        testImpacts: Record<string, TestImpact>
    ): Promise<TestResult[]> {
        // Similar approach as JS tests, but for C#
        return this.simulateTestResults(tests, testImpacts);
    }

    /**
     * Run Go tests
     */
    private async runGoTests(
        filePath: string,
        tests: { testId: string; testName: string }[],
        testImpacts: Record<string, TestImpact>
    ): Promise<TestResult[]> {
        // Similar approach as JS tests, but for Go
        return this.simulateTestResults(tests, testImpacts);
    }

    /**
     * Run generic tests using VS Code Test API
     */
    private async runGenericTests(
        filePath: string,
        tests: { testId: string; testName: string }[],
        testImpacts: Record<string, TestImpact>
    ): Promise<TestResult[]> {
        // Use VS Code Test API
        return this.simulateTestResults(tests, testImpacts);
    }

    /**
     * Helper method to simulate test results (for demonstration only)
     */
    private simulateTestResults(
        tests: { testId: string; testName: string }[],
        testImpacts: Record<string, TestImpact>
    ): TestResult[] {
        const results: TestResult[] = [];
        
        for (const test of tests) {
            const predictedImpact = testImpacts[test.testId]?.impactScore || 0;
            const changedNodeIds = testImpacts[test.testId]?.contributingChanges.map(c => c.nodeId) || [];
            
            // Higher impact scores more likely to fail (for simulation only)
            const passProbability = 1 - Math.min(0.8, predictedImpact);
            const passed = Math.random() > passProbability;
            
            results.push({
                testId: test.testId,
                status: passed ? 'passed' : 'failed',
                executionTime: Math.random() * 1000 + 100, // Random execution time for simulation
                predictedImpact,
                changedNodeIds,
                timestamp: new Date().toISOString()
            });
        }
        
        return results;
    }
}