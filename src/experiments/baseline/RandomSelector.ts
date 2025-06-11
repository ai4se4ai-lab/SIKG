// src/experiments/baseline/RandomSelector.ts - Random test selection baseline

import { BaselineSelector } from './BaselineSelector';
import { TestResult } from '../../sikg/GraphTypes';
import { Logger } from '../../utils/Logger';

/**
 * Random test selection baseline for SIKG evaluation
 * Implements controlled random selection with reproducible results
 */
export class RandomSelector implements BaselineSelector {
    public readonly name = 'random';
    private seed: number;
    private selectionRatio: number;
    private rngState: number;

    constructor(seed: number = 42, selectionRatio?: number) {
        this.seed = seed;
        this.rngState = seed;
        this.selectionRatio = selectionRatio || this.calculateDynamicRatio();
    }

    /**
     * Select tests randomly with controlled parameters
     */
    public async selectTests(
        allTests: string[],
        changedFiles: string[],
        historicalData?: TestResult[]
    ): Promise<string[]> {
        if (allTests.length === 0) {
            Logger.debug('RandomSelector: No tests available for selection');
            return [];
        }

        // Reset RNG state for reproducible results
        this.rngState = this.seed;

        // Calculate selection ratio if not fixed
        const ratio = this.selectionRatio || this.calculateAdaptiveRatio(allTests, changedFiles);
        const numToSelect = Math.max(1, Math.floor(allTests.length * ratio));

        // Create a copy of tests for shuffling
        const testsCopy = [...allTests];
        
        // Fisher-Yates shuffle with seeded random
        for (let i = testsCopy.length - 1; i > 0; i--) {
            const j = Math.floor(this.seededRandom() * (i + 1));
            [testsCopy[i], testsCopy[j]] = [testsCopy[j], testsCopy[i]];
        }

        // Select the first numToSelect tests after shuffling
        const selectedTests = testsCopy.slice(0, numToSelect);

        Logger.debug(
            `RandomSelector: Selected ${selectedTests.length}/${allTests.length} tests ` +
            `(${(ratio * 100).toFixed(1)}% ratio, seed: ${this.seed})`
        );

        return selectedTests;
    }

    /**
     * Select tests with stratified sampling to ensure representation
     */
    public async selectTestsStratified(
        allTests: string[],
        changedFiles: string[],
        testCategories?: Record<string, string[]>
    ): Promise<string[]> {
        if (!testCategories || Object.keys(testCategories).length === 0) {
            // Fall back to regular random selection
            return this.selectTests(allTests, changedFiles);
        }

        const selectedTests: string[] = [];
        const ratio = this.selectionRatio || 0.4;

        // Select from each category proportionally
        for (const [category, categoryTests] of Object.entries(testCategories)) {
            const categoryRatio = categoryTests.length / allTests.length;
            const targetCount = Math.max(1, Math.floor(allTests.length * ratio * categoryRatio));
            
            // Shuffle category tests
            const shuffled = [...categoryTests];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(this.seededRandom() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            
            selectedTests.push(...shuffled.slice(0, Math.min(targetCount, shuffled.length)));
        }

        Logger.debug(
            `RandomSelector (Stratified): Selected ${selectedTests.length}/${allTests.length} tests ` +
            `across ${Object.keys(testCategories).length} categories`
        );

        return selectedTests;
    }

    /**
     * Select tests with weighted random selection based on test characteristics
     */
    public async selectTestsWeighted(
        allTests: string[],
        changedFiles: string[],
        testWeights?: Record<string, number>
    ): Promise<string[]> {
        if (!testWeights || Object.keys(testWeights).length === 0) {
            return this.selectTests(allTests, changedFiles);
        }

        const ratio = this.selectionRatio || 0.4;
        const numToSelect = Math.floor(allTests.length * ratio);
        const selectedTests: string[] = [];

        // Calculate weighted selection
        const weightedTests = allTests.map(test => ({
            test,
            weight: testWeights[test] || 1.0
        }));

        // Calculate total weight
        const totalWeight = weightedTests.reduce((sum, item) => sum + item.weight, 0);

        // Select tests based on weights
        for (let i = 0; i < numToSelect && weightedTests.length > 0; i++) {
            const randomValue = this.seededRandom() * totalWeight;
            let cumulativeWeight = 0;
            let selectedIndex = 0;

            for (let j = 0; j < weightedTests.length; j++) {
                cumulativeWeight += weightedTests[j].weight;
                if (randomValue <= cumulativeWeight) {
                    selectedIndex = j;
                    break;
                }
            }

            selectedTests.push(weightedTests[selectedIndex].test);
            weightedTests.splice(selectedIndex, 1);
        }

        Logger.debug(
            `RandomSelector (Weighted): Selected ${selectedTests.length}/${allTests.length} tests ` +
            `using weighted random selection`
        );

        return selectedTests;
    }

    /**
     * Generate multiple random selections for statistical analysis
     */
    public async generateMultipleSelections(
        allTests: string[],
        changedFiles: string[],
        numSelections: number = 10
    ): Promise<string[][]> {
        const selections: string[][] = [];
        const originalSeed = this.seed;

        for (let i = 0; i < numSelections; i++) {
            // Use different seed for each selection
            this.seed = originalSeed + i;
            this.rngState = this.seed;
            
            const selection = await this.selectTests(allTests, changedFiles);
            selections.push(selection);
        }

        // Restore original seed
        this.seed = originalSeed;
        this.rngState = originalSeed;

        Logger.debug(`RandomSelector: Generated ${numSelections} different random selections`);
        return selections;
    }

    /**
     * Get selection statistics
     */
    public getSelectionStats(
        allTests: string[],
        selectedTests: string[]
    ): {
        totalTests: number;
        selectedTests: number;
        selectionRatio: number;
        seed: number;
        coverage: {
            byExtension: Record<string, number>;
            byDirectory: Record<string, number>;
        };
    } {
        const coverage = this.calculateCoverage(allTests, selectedTests);

        return {
            totalTests: allTests.length,
            selectedTests: selectedTests.length,
            selectionRatio: selectedTests.length / allTests.length,
            seed: this.seed,
            coverage
        };
    }

    /**
     * Set custom selection ratio
     */
    public setSelectionRatio(ratio: number): void {
        if (ratio < 0 || ratio > 1) {
            throw new Error('Selection ratio must be between 0 and 1');
        }
        this.selectionRatio = ratio;
        Logger.debug(`RandomSelector: Selection ratio set to ${(ratio * 100).toFixed(1)}%`);
    }

    /**
     * Reset with new seed
     */
    public resetWithSeed(newSeed: number): void {
        this.seed = newSeed;
        this.rngState = newSeed;
        Logger.debug(`RandomSelector: Reset with new seed ${newSeed}`);
    }

    // Private helper methods

    /**
     * Seeded random number generator (Linear Congruential Generator)
     */
    private seededRandom(): number {
        // LCG parameters (from Numerical Recipes)
        const a = 1664525;
        const c = 1013904223;
        const m = Math.pow(2, 32);
        
        this.rngState = (a * this.rngState + c) % m;
        return this.rngState / m;
    }

    /**
     * Calculate dynamic selection ratio based on common practices
     */
    private calculateDynamicRatio(): number {
        // Common ratios used in test selection research:
        // - Small projects: 40-60%
        // - Medium projects: 30-50% 
        // - Large projects: 20-40%
        // Default to 40% as a reasonable middle ground
        return 0.4;
    }

    /**
     * Calculate adaptive ratio based on change characteristics
     */
    private calculateAdaptiveRatio(allTests: string[], changedFiles: string[]): number {
        const baseRatio = 0.4;
        
        if (changedFiles.length === 0) {
            // No changes - select minimal set
            return Math.max(0.1, baseRatio * 0.5);
        }

        // More changes = higher ratio (but cap at 70%)
        const changeRatio = Math.min(changedFiles.length / 10, 0.3);
        return Math.min(0.7, baseRatio + changeRatio);
    }

    /**
     * Calculate test coverage statistics
     */
    private calculateCoverage(
        allTests: string[],
        selectedTests: string[]
    ): {
        byExtension: Record<string, number>;
        byDirectory: Record<string, number>;
    } {
        const selectedSet = new Set(selectedTests);
        
        // Coverage by file extension
        const extensionCounts = new Map<string, { total: number; selected: number }>();
        
        // Coverage by directory
        const directoryCounts = new Map<string, { total: number; selected: number }>();

        for (const test of allTests) {
            // Extension analysis
            const extension = test.split('.').pop() || 'unknown';
            if (!extensionCounts.has(extension)) {
                extensionCounts.set(extension, { total: 0, selected: 0 });
            }
            extensionCounts.get(extension)!.total++;
            if (selectedSet.has(test)) {
                extensionCounts.get(extension)!.selected++;
            }

            // Directory analysis
            const directory = test.substring(0, test.lastIndexOf('/')) || 'root';
            if (!directoryCounts.has(directory)) {
                directoryCounts.set(directory, { total: 0, selected: 0 });
            }
            directoryCounts.get(directory)!.total++;
            if (selectedSet.has(test)) {
                directoryCounts.get(directory)!.selected++;
            }
        }

        // Calculate coverage ratios
        const byExtension: Record<string, number> = {};
        for (const [ext, counts] of extensionCounts.entries()) {
            byExtension[ext] = counts.total > 0 ? counts.selected / counts.total : 0;
        }

        const byDirectory: Record<string, number> = {};
        for (const [dir, counts] of directoryCounts.entries()) {
            byDirectory[dir] = counts.total > 0 ? counts.selected / counts.total : 0;
        }

        return { byExtension, byDirectory };
    }

    /**
     * Validate selection parameters
     */
    public validateSelection(
        allTests: string[],
        selectedTests: string[]
    ): {
        valid: boolean;
        issues: string[];
        warnings: string[];
    } {
        const issues: string[] = [];
        const warnings: string[] = [];

        // Check for duplicates
        const uniqueSelected = new Set(selectedTests);
        if (uniqueSelected.size !== selectedTests.length) {
            issues.push('Selection contains duplicate tests');
        }

        // Check if all selected tests exist in the total set
        const allTestsSet = new Set(allTests);
        for (const test of selectedTests) {
            if (!allTestsSet.has(test)) {
                issues.push(`Selected test not found in total test set: ${test}`);
            }
        }

        // Check selection ratio
        const ratio = selectedTests.length / allTests.length;
        if (ratio < 0.1) {
            warnings.push(`Very low selection ratio: ${(ratio * 100).toFixed(1)}%`);
        } else if (ratio > 0.8) {
            warnings.push(`Very high selection ratio: ${(ratio * 100).toFixed(1)}%`);
        }

        // Check if selection is empty
        if (selectedTests.length === 0 && allTests.length > 0) {
            issues.push('No tests selected despite available tests');
        }

        return {
            valid: issues.length === 0,
            issues,
            warnings
        };
    }

    /**
     * Generate selection report
     */
    public generateSelectionReport(
        allTests: string[],
        selectedTests: string[],
        changedFiles: string[]
    ): string {
        const stats = this.getSelectionStats(allTests, selectedTests);
        const validation = this.validateSelection(allTests, selectedTests);

        return `
Random Test Selection Report
============================

Configuration:
- Seed: ${this.seed}
- Selection Ratio: ${(this.selectionRatio * 100).toFixed(1)}%

Results:
- Total Tests: ${stats.totalTests}
- Selected Tests: ${stats.selectedTests}
- Actual Ratio: ${(stats.selectionRatio * 100).toFixed(1)}%
- Changed Files: ${changedFiles.length}

Coverage by Extension:
${Object.entries(stats.coverage.byExtension)
    .map(([ext, ratio]) => `- ${ext}: ${(ratio * 100).toFixed(1)}%`)
    .join('\n')}

Coverage by Directory:
${Object.entries(stats.coverage.byDirectory)
    .map(([dir, ratio]) => `- ${dir}: ${(ratio * 100).toFixed(1)}%`)
    .join('\n')}

Validation:
- Valid: ${validation.valid ? 'Yes' : 'No'}
${validation.issues.length > 0 ? `- Issues: ${validation.issues.join(', ')}` : ''}
${validation.warnings.length > 0 ? `- Warnings: ${validation.warnings.join(', ')}` : ''}

Generated: ${new Date().toISOString()}
        `.trim();
    }
}

// Export additional interfaces
export interface RandomSelectionConfig {
    seed?: number;
    selectionRatio?: number;
    stratified?: boolean;
    weighted?: boolean;
}

export interface RandomSelectionResult {
    selectedTests: string[];
    stats: ReturnType<RandomSelector['getSelectionStats']>;
    validation: ReturnType<RandomSelector['validateSelection']>;
    report: string;
}

// Factory function for creating configured random selectors
export function createRandomSelector(config: RandomSelectionConfig = {}): RandomSelector {
    const selector = new RandomSelector(config.seed, config.selectionRatio);
    
    Logger.info(`Created RandomSelector with seed ${config.seed || 42} and ratio ${config.selectionRatio || 'dynamic'}`);
    
    return selector;
}

// Utility function for batch random selection analysis
export async function analyzeRandomSelections(
    allTests: string[],
    changedFiles: string[],
    iterations: number = 10,
    baseSeed: number = 42
): Promise<{
    selections: string[][];
    statistics: {
        averageRatio: number;
        stableTests: string[];
        variableTests: string[];
        coverage: Record<string, number>;
    };
}> {
    const selections: string[][] = [];
    const testFrequency = new Map<string, number>();

    // Generate multiple random selections
    for (let i = 0; i < iterations; i++) {
        const selector = new RandomSelector(baseSeed + i);
        const selection = await selector.selectTests(allTests, changedFiles);
        selections.push(selection);

        // Track test frequency
        for (const test of selection) {
            testFrequency.set(test, (testFrequency.get(test) || 0) + 1);
        }
    }

    // Calculate statistics
    const averageRatio = selections.reduce((sum, sel) => sum + sel.length, 0) / (selections.length * allTests.length);
    
    const stableTests = Array.from(testFrequency.entries())
        .filter(([_, freq]) => freq >= iterations * 0.8)
        .map(([test, _]) => test);
    
    const variableTests = Array.from(testFrequency.entries())
        .filter(([_, freq]) => freq <= iterations * 0.2)
        .map(([test, _]) => test);

    const coverage: Record<string, number> = {};
    for (const [test, freq] of testFrequency.entries()) {
        coverage[test] = freq / iterations;
    }

    return {
        selections,
        statistics: {
            averageRatio,
            stableTests,
            variableTests,
            coverage
        }
    };
}