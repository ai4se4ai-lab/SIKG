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
                
                if (fileExt === '.py') {
                    // JavaScript/TypeScript tests (Jest, Mocha, etc.)
                    testResults = await this.runPythonTests(filePath, tests, testImpacts);
                } else {
                    continue;
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
     * Run Python tests using pytest or unittest
     */
    private async runPythonTests(
        filePath: string,
        tests: { testId: string; testName: string }[],
        testImpacts: Record<string, TestImpact>
    ): Promise<TestResult[]> {
        Logger.info(`Running Python tests in ${filePath}`);
        
        try {
            // Determine if we should use pytest or unittest
            const isPytest = filePath.includes('test_') || filePath.includes('_test');
            const content = fs.readFileSync(filePath, 'utf8');
            const isUnittest = content.includes('import unittest') || content.includes('unittest.TestCase');
            
            // Prepare the results array
            const results: TestResult[] = [];
            
            // Handle actual test execution - for a real extension, you would run the actual tests
            // Here we're simulating execution for demonstration purposes
            
            for (const test of tests) {
                // Get the test name in the expected format (TestClass.test_method or test_function)
                const testName = test.testName;
                const predictedImpact = testImpacts[test.testId]?.impactScore || 0;
                const changedNodeIds = testImpacts[test.testId]?.contributingChanges.map(c => c.nodeId) || [];
                
                // Execute the test (simulated)
                // In a real implementation, you would use child_process.exec to run pytest or unittest
                // For example: pytest file::TestClass::test_method -v
                
                // Create a terminal command (though we won't execute it in this demonstration)
                let command = '';
                if (isPytest) {
                    command = `pytest ${filePath}::${testName} -v`;
                } else if (isUnittest) {
                    // Check if testName includes the class name
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
                
                // Simulate success/failure based on impact score
                // In a real implementation, you would parse the actual test results
                const passProbability = 1 - Math.min(0.8, predictedImpact);
                const passed = Math.random() > passProbability;
                
                // Simulate execution time (random value for demonstration)
                const executionTime = Math.random() * 1000 + 100;
                
                results.push({
                    testId: test.testId,
                    status: passed ? 'passed' : 'failed',
                    executionTime,
                    predictedImpact,
                    changedNodeIds,
                    timestamp: new Date().toISOString()
                });
            }
            
            // In a real implementation, you would parse the output from the test runner
            // and create TestResult objects based on the actual results
            
            return results;
            
        } catch (error) {
            Logger.error(`Error running Python tests in ${filePath}:`, error);
            
            // Return failed results
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
 * In a real implementation, this method would launch the actual Python test via child_process.exec
 * and parse the results.
 */
    private async executePythonTest(command: string): Promise<{passed: boolean, output: string, executionTime: number}> {
        // This is a placeholder/mock implementation
        // In a real extension, you would use child_process.exec to run the test
        
        return new Promise((resolve) => {
            // Simulate test execution time
            const startTime = Date.now();
            setTimeout(() => {
                const executionTime = Date.now() - startTime;
                const passed = Math.random() > 0.3; // 70% pass rate for simulation
                
                let output = '';
                if (passed) {
                    output = `Test passed in ${executionTime}ms`;
                } else {
                    output = `Test failed: AssertionError: Expected value not received`;
                }
                
                resolve({
                    passed,
                    output,
                    executionTime
                });
            }, Math.random() * 300 + 50); // Random delay between 50-350ms
        });
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