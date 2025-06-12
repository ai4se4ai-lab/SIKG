// EkstaziSelector.ts - Static analysis baseline similar to Ekstazi

import { BaselineSelector } from './RandomSelector';
import { Logger } from '../../utils/Logger';

export interface FileChange {
    filePath: string;
    changeType: 'add' | 'modify' | 'delete';
}

export interface TestFileMapping {
    testFile: string;
    testIds: string[];
    coveredFiles: string[];
}

/**
 * Ekstazi-style baseline using static dependency analysis
 * Selects tests that statically depend on changed files
 */
export class EkstaziSelector implements BaselineSelector {
    public readonly name = 'Ekstazi-RTS';
    
    private testFileMappings: Map<string, TestFileMapping> = new Map();
    private fileDependencies: Map<string, Set<string>> = new Map();

    /**
     * Initialize with test-file mappings
     */
    public initialize(testMappings: TestFileMapping[]): void {
        this.testFileMappings.clear();
        this.fileDependencies.clear();

        for (const mapping of testMappings) {
            this.testFileMappings.set(mapping.testFile, mapping);
            
            // Build reverse dependency map
            for (const coveredFile of mapping.coveredFiles) {
                if (!this.fileDependencies.has(coveredFile)) {
                    this.fileDependencies.set(coveredFile, new Set());
                }
                this.fileDependencies.get(coveredFile)!.add(mapping.testFile);
            }
        }

        Logger.debug(`Ekstazi initialized with ${testMappings.length} test mappings`);
    }

    /**
     * Select tests based on static dependency analysis
     */
    public async selectTests(
        allTests: string[],
        changedFiles: string[],
        historicalData?: import("../../sikg/GraphTypes").TestResult[]
    ): Promise<string[]> {
        if (!changedFiles || changedFiles.length === 0) {
            Logger.warn('No changed files provided, selecting all tests');
            return allTests;
        }

        const selectedTestFiles = new Set<string>();
        const selectedTestIds = new Set<string>();

        // Find tests that depend on changed files
        for (const changedFile of changedFiles) {
            const dependentTestFiles = this.fileDependencies.get(changedFile);
            if (dependentTestFiles) {
                dependentTestFiles.forEach(testFile => selectedTestFiles.add(testFile));
            }
        }

        // Extract individual test IDs from selected test files
        for (const testFile of selectedTestFiles) {
            const mapping = this.testFileMappings.get(testFile);
            if (mapping) {
                mapping.testIds.forEach(testId => {
                    if (allTests.includes(testId)) {
                        selectedTestIds.add(testId);
                    }
                });
            }
        }

        const selected = Array.from(selectedTestIds);

        Logger.debug(`Ekstazi selector: ${selected.length}/${allTests.length} tests selected for ${changedFiles.length} changed files`);
        return selected;
    }

    /**
     * Prioritize tests by dependency depth (closer dependencies first)
     */
    public prioritizeTests(selectedTests: string[]): string[] {
        // Simple prioritization: tests that cover fewer files are more focused
        const testPriorities = selectedTests.map(testId => {
            const testFile = this.findTestFileForId(testId);
            const mapping = testFile ? this.testFileMappings.get(testFile) : null;
            const coverageCount = mapping ? mapping.coveredFiles.length : Infinity;
            
            return {
                testId,
                priority: 1 / (coverageCount + 1) // Smaller coverage = higher priority
            };
        });

        testPriorities.sort((a, b) => b.priority - a.priority);
        
        return testPriorities.map(tp => tp.testId);
    }

    /**
     * Find which test file contains a specific test ID
     */
    private findTestFileForId(testId: string): string | null {
        for (const [testFile, mapping] of this.testFileMappings) {
            if (mapping.testIds.includes(testId)) {
                return testFile;
            }
        }
        return null;
    }

    /**
     * Get selection statistics
     */
    public getStats(): { 
        name: string; 
        testMappingsCount: number; 
        avgCoveragePerTest: number 
    } {
        const mappings = Array.from(this.testFileMappings.values());
        const avgCoverage = mappings.length > 0 
            ? mappings.reduce((sum, m) => sum + m.coveredFiles.length, 0) / mappings.length 
            : 0;

        return {
            name: this.name,
            testMappingsCount: this.testFileMappings.size,
            avgCoveragePerTest: avgCoverage
        };
    }

    /**
     * Create synthetic test-file mappings for evaluation
     */
    public static createSyntheticMappings(
        testIds: string[], 
        codeFiles: string[], 
        coverageRatio: number = 0.3
    ): TestFileMapping[] {
        const mappings: TestFileMapping[] = [];
        
        // Group tests by file (assume test file naming convention)
        const testFileGroups = new Map<string, string[]>();
        
        for (const testId of testIds) {
            // Extract test file from test ID (e.g., "test_user.py::test_login" -> "test_user.py")
            const testFile = testId.includes('::') ? testId.split('::')[0] : `test_${testId}.py`;
            
            if (!testFileGroups.has(testFile)) {
                testFileGroups.set(testFile, []);
            }
            testFileGroups.get(testFile)!.push(testId);
        }

        // Create mappings with synthetic coverage
        for (const [testFile, testIds] of testFileGroups) {
            const coverageCount = Math.max(1, Math.floor(codeFiles.length * coverageRatio));
            const coveredFiles = codeFiles
                .sort(() => Math.random() - 0.5) // Shuffle
                .slice(0, coverageCount);

            mappings.push({
                testFile,
                testIds,
                coveredFiles
            });
        }

        return mappings;
    }
}