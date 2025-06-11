// src/experiments/baseline/index.ts - Baseline test selection implementations

import { TestResult, SemanticChangeInfo } from '../../sikg/GraphTypes';
import { Logger } from '../../utils/Logger';

export interface BaselineSelector {
    name: string;
    selectTests(
        allTests: string[],
        changedFiles: string[],
        historicalData?: TestResult[]
    ): Promise<string[]>;
}

/**
 * Random test selection baseline
 */
export class RandomSelector implements BaselineSelector {
    name = 'random';
    private seed: number;

    constructor(seed: number = 42) {
        this.seed = seed;
    }

    async selectTests(allTests: string[], changedFiles: string[]): Promise<string[]> {
        // Seed random number generator for reproducibility
        const rng = this.createSeededRandom(this.seed);
        
        // Select random 30-50% of tests
        const selectionRatio = 0.3 + rng() * 0.2; // 30-50%
        const numToSelect = Math.floor(allTests.length * selectionRatio);
        
        // Shuffle and select
        const shuffled = [...allTests].sort(() => rng() - 0.5);
        const selected = shuffled.slice(0, numToSelect);
        
        Logger.debug(`Random selector: ${selected.length}/${allTests.length} tests selected`);
        return selected;
    }

    private createSeededRandom(seed: number): () => number {
        let x = seed;
        return () => {
            x = Math.sin(x) * 10000;
            return x - Math.floor(x);
        };
    }
}

/**
 * Ekstazi-style static dependency analysis
 */
export class EkstaziSelector implements BaselineSelector {
    name = 'ekstazi';

    async selectTests(allTests: string[], changedFiles: string[]): Promise<string[]> {
        const selected: string[] = [];
        
        // Simple file-based dependency analysis
        for (const test of allTests) {
            if (this.isTestAffectedByChanges(test, changedFiles)) {
                selected.push(test);
            }
        }
        
        Logger.debug(`Ekstazi selector: ${selected.length}/${allTests.length} tests selected`);
        return selected;
    }

    private isTestAffectedByChanges(testPath: string, changedFiles: string[]): boolean {
        // Extract module name from test path
        const testModule = this.extractModuleName(testPath);
        
        // Check if any changed file affects this test
        return changedFiles.some(changedFile => {
            const changedModule = this.extractModuleName(changedFile);
            
            // Direct dependency: test file changed
            if (changedFile === testPath) {
                return true;
            }
            
            // Module dependency: test tests the changed module
            if (testModule.includes(changedModule) || 
                testPath.includes(changedModule)) {
                return true;
            }
            
            // Import-based dependency (simplified)
            if (this.hasImportDependency(testPath, changedFile)) {
                return true;
            }
            
            return false;
        });
    }

    private extractModuleName(filePath: string): string {
        const parts = filePath.split('/');
        const filename = parts[parts.length - 1];
        return filename.replace(/\.(py|test\.py|_test\.py)$/, '');
    }

    private hasImportDependency(testPath: string, changedFile: string): boolean {
        // Simplified: assume dependency if files are in same directory
        const testDir = testPath.substring(0, testPath.lastIndexOf('/'));
        const changedDir = changedFile.substring(0, changedFile.lastIndexOf('/'));
        
        return testDir === changedDir || 
               testDir.startsWith(changedDir) || 
               changedDir.startsWith(testDir);
    }
}

/**
 * History-based test selection using past failure patterns
 */
export class HistoryBasedSelector implements BaselineSelector {
    name = 'history';

    async selectTests(
        allTests: string[], 
        changedFiles: string[], 
        historicalData?: TestResult[]
    ): Promise<string[]> {
        if (!historicalData || historicalData.length === 0) {
            // Fallback to selecting all tests if no history
            return [...allTests];
        }

        // Calculate failure rates for each test
        const testFailureRates = this.calculateFailureRates(historicalData);
        
        // Calculate recency scores (more recent failures are more important)
        const testRecencyScores = this.calculateRecencyScores(historicalData);
        
        // Combine failure rate and recency for final score
        const testScores: Record<string, number> = {};
        
        for (const test of allTests) {
            const failureRate = testFailureRates.get(test) || 0;
            const recencyScore = testRecencyScores.get(test) || 0;
            
            // Weight: 70% failure rate, 30% recency
            testScores[test] = 0.7 * failureRate + 0.3 * recencyScore;
        }
        
        // Sort tests by score and select top 60%
        const sortedTests = allTests.sort((a, b) => 
            (testScores[b] || 0) - (testScores[a] || 0)
        );
        
        const numToSelect = Math.floor(allTests.length * 0.6);
        const selected = sortedTests.slice(0, numToSelect);
        
        Logger.debug(`History-based selector: ${selected.length}/${allTests.length} tests selected`);
        return selected;
    }

    private calculateFailureRates(historicalData: TestResult[]): Map<string, number> {
        const testCounts = new Map<string, { total: number; failures: number }>();
        
        // Count total runs and failures for each test
        for (const result of historicalData) {
            const current = testCounts.get(result.testId) || { total: 0, failures: 0 };
            current.total++;
            if (result.status === 'failed') {
                current.failures++;
            }
            testCounts.set(result.testId, current);
        }
        
        // Calculate failure rates
        const failureRates = new Map<string, number>();
        for (const [testId, counts] of testCounts.entries()) {
            const rate = counts.total > 0 ? counts.failures / counts.total : 0;
            failureRates.set(testId, rate);
        }
        
        return failureRates;
    }

    private calculateRecencyScores(historicalData: TestResult[]): Map<string, number> {
        const now = Date.now();
        const recencyScores = new Map<string, number>();
        
        // Find most recent failure for each test
        for (const result of historicalData) {
            if (result.status === 'failed') {
                const resultTime = new Date(result.timestamp).getTime();
                const daysSince = (now - resultTime) / (1000 * 60 * 60 * 24);
                
                // Exponential decay: more recent = higher score
                const recencyScore = Math.exp(-daysSince / 30); // 30-day half-life
                
                const currentScore = recencyScores.get(result.testId) || 0;
                recencyScores.set(result.testId, Math.max(currentScore, recencyScore));
            }
        }
        
        return recencyScores;
    }
}

/**
 * Impact-sorted baseline (simplified impact without semantic analysis)
 */
export class ImpactSortedSelector implements BaselineSelector {
    name = 'impact-sorted';

    async selectTests(allTests: string[], changedFiles: string[]): Promise<string[]> {
        // Calculate simple impact scores based on file proximity
        const testScores: Record<string, number> = {};
        
        for (const test of allTests) {
            let score = 0;
            
            for (const changedFile of changedFiles) {
                // Direct test file change
                if (test === changedFile) {
                    score += 1.0;
                    continue;
                }
                
                // Same directory
                if (this.sameDirectory(test, changedFile)) {
                    score += 0.8;
                    continue;
                }
                
                // Name similarity (e.g., test_module.py tests module.py)
                if (this.hasNameSimilarity(test, changedFile)) {
                    score += 0.6;
                    continue;
                }
                
                // Parent directory relationship
                if (this.hasParentRelationship(test, changedFile)) {
                    score += 0.3;
                }
            }
            
            testScores[test] = score;
        }
        
        // Sort by score and select top 50%
        const sortedTests = allTests.sort((a, b) => 
            (testScores[b] || 0) - (testScores[a] || 0)
        );
        
        const numToSelect = Math.floor(allTests.length * 0.5);
        const selected = sortedTests.slice(0, numToSelect);
        
        Logger.debug(`Impact-sorted selector: ${selected.length}/${allTests.length} tests selected`);
        return selected;
    }

    private sameDirectory(file1: string, file2: string): boolean {
        const dir1 = file1.substring(0, file1.lastIndexOf('/'));
        const dir2 = file2.substring(0, file2.lastIndexOf('/'));
        return dir1 === dir2;
    }

    private hasNameSimilarity(testFile: string, sourceFile: string): boolean {
        const testName = testFile.split('/').pop()?.replace(/^test_|_test\.py$|\.py$/g, '') || '';
        const sourceName = sourceFile.split('/').pop()?.replace(/\.py$/, '') || '';
        
        return testName.includes(sourceName) || sourceName.includes(testName);
    }

    private hasParentRelationship(file1: string, file2: string): boolean {
        return file1.startsWith(file2.substring(0, file2.lastIndexOf('/'))) ||
               file2.startsWith(file1.substring(0, file1.lastIndexOf('/')));
    }
}

/**
 * Factory for creating baseline selectors
 */
export class BaselineSelectorFactory {
    static create(type: string): BaselineSelector {
        switch (type) {
            case 'random':
                return new RandomSelector();
            case 'ekstazi':
                return new EkstaziSelector();
            case 'history':
                return new HistoryBasedSelector();
            case 'impact-sorted':
                return new ImpactSortedSelector();
            default:
                throw new Error(`Unknown baseline selector type: ${type}`);
        }
    }
    
    static getAvailableTypes(): string[] {
        return ['random', 'ekstazi', 'history', 'impact-sorted'];
    }
}