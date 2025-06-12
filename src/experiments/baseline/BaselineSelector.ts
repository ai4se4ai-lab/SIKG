// src/experiments/baseline/BaselineSelector.ts - Interface for all baseline test selectors

import { TestResult } from '../../sikg/GraphTypes';

/**
 * Base interface for all test selection baseline implementations
 * Used for comparing SIKG against established approaches
 */
export interface BaselineSelector {
    /** Unique name identifying this baseline selector */
    readonly name: string;

    /**
     * Select tests based on changed files and optional historical data
     * 
     * @param allTests - Complete list of available tests
     * @param changedFiles - List of files that have been modified
     * @param historicalData - Optional historical test execution results
     * @returns Promise resolving to array of selected test identifiers
     */
    selectTests(
        allTests: string[],
        changedFiles: string[],
        historicalData?: TestResult[]
    ): Promise<string[]>;
}

/**
 * Extended interface for advanced baseline selectors
 */
export interface AdvancedBaselineSelector extends BaselineSelector {
    /**
     * Configure selector parameters
     */
    configure?(config: BaselineSelectorConfig): void;

    /**
     * Get selection statistics and metadata
     */
    getSelectionStats?(
        allTests: string[],
        selectedTests: string[]
    ): BaselineSelectionStats;

    /**
     * Validate the selection results
     */
    validateSelection?(
        allTests: string[],
        selectedTests: string[]
    ): ValidationResult;
}

/**
 * Configuration options for baseline selectors
 */
export interface BaselineSelectorConfig {
    /** Selection ratio (0.0 to 1.0) */
    selectionRatio?: number;
    
    /** Random seed for reproducible results */
    seed?: number;
    
    /** Maximum number of tests to select */
    maxTests?: number;
    
    /** Minimum number of tests to select */
    minTests?: number;
    
    /** Custom weights for different test types */
    testTypeWeights?: Record<string, number>;
    
    /** Time window for historical analysis (in days) */
    historicalWindowDays?: number;
    
    /** Additional selector-specific parameters */
    customParams?: Record<string, any>;
}

/**
 * Statistics about test selection
 */
export interface BaselineSelectionStats {
    /** Total number of available tests */
    totalTests: number;
    
    /** Number of tests selected */
    selectedTests: number;
    
    /** Actual selection ratio achieved */
    selectionRatio: number;
    
    /** Time taken for selection (milliseconds) */
    selectionTime: number;
    
    /** Coverage statistics */
    coverage?: {
        byFileType: Record<string, number>;
        byDirectory: Record<string, number>;
        byTestType: Record<string, number>;
    };
    
    /** Selector-specific metadata */
    metadata?: Record<string, any>;
}

/**
 * Validation result for test selection
 */
export interface ValidationResult {
    /** Whether the selection is valid */
    valid: boolean;
    
    /** Critical issues that make selection invalid */
    errors: string[];
    
    /** Non-critical warnings */
    warnings: string[];
    
    /** Informational messages */
    info: string[];
}

/**
 * Test execution context for selection
 */
export interface TestSelectionContext {
    /** Project information */
    project: {
        name: string;
        language: string;
        testFramework: string;
        size: 'small' | 'medium' | 'large';
    };
    
    /** Change context */
    changes: {
        commitHash?: string;
        changedFiles: string[];
        changeType: 'feature' | 'bugfix' | 'refactor' | 'maintenance';
        linesChanged: number;
    };
    
    /** Available resources */
    resources: {
        maxExecutionTime?: number; // milliseconds
        maxTests?: number;
        parallelism?: number;
    };
    
    /** Historical context */
    history?: {
        recentFailures: TestResult[];
        executionTrends: Record<string, number>;
        changePatterns: Record<string, string[]>;
    };
}

/**
 * Base abstract class providing common functionality for baseline selectors
 */
export abstract class AbstractBaselineSelector implements AdvancedBaselineSelector {
    public abstract readonly name: string;
    protected config: BaselineSelectorConfig = {};
    protected selectionStartTime: number = 0;

    /**
     * Configure the selector with provided options
     */
    public configure(config: BaselineSelectorConfig): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * Main selection method - must be implemented by subclasses
     */
    public abstract selectTests(
        allTests: string[],
        changedFiles: string[],
        historicalData?: TestResult[]
    ): Promise<string[]>;

    /**
     * Prioritize the selected tests - must be implemented by subclasses
     * @param selectedTests Array of selected test identifiers
     * @returns Array of prioritized test identifiers
     */
    public abstract prioritizeTests(selectedTests: string[]): string[];

    /**
     * Get basic selection statistics
     */
    public getSelectionStats(
        allTests: string[],
        selectedTests: string[]
    ): BaselineSelectionStats {
        const selectionTime = Date.now() - this.selectionStartTime;
        
        return {
            totalTests: allTests.length,
            selectedTests: selectedTests.length,
            selectionRatio: allTests.length > 0 ? selectedTests.length / allTests.length : 0,
            selectionTime,
            coverage: this.calculateCoverage(allTests, selectedTests),
            metadata: {
                selectorName: this.name,
                config: this.config
            }
        };
    }

    /**
     * Validate selection results
     */
    public validateSelection(
        allTests: string[],
        selectedTests: string[]
    ): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];
        const info: string[] = [];

        // Check for basic validity
        if (selectedTests.length === 0 && allTests.length > 0) {
            warnings.push('No tests selected despite available tests');
        }

        // Check for duplicates
        const uniqueTests = new Set(selectedTests);
        if (uniqueTests.size !== selectedTests.length) {
            errors.push('Selection contains duplicate tests');
        }

        // Check if all selected tests exist
        const allTestsSet = new Set(allTests);
        const invalidTests = selectedTests.filter(test => !allTestsSet.has(test));
        if (invalidTests.length > 0) {
            errors.push(`Selected tests not found in test suite: ${invalidTests.slice(0, 3).join(', ')}${invalidTests.length > 3 ? '...' : ''}`);
        }

        // Check selection ratio
        const ratio = allTests.length > 0 ? selectedTests.length / allTests.length : 0;
        if (ratio > 0.9) {
            warnings.push(`Very high selection ratio: ${(ratio * 100).toFixed(1)}%`);
        } else if (ratio < 0.05 && allTests.length > 20) {
            warnings.push(`Very low selection ratio: ${(ratio * 100).toFixed(1)}%`);
        }

        // Add informational messages
        info.push(`Selected ${selectedTests.length}/${allTests.length} tests (${(ratio * 100).toFixed(1)}%)`);

        return {
            valid: errors.length === 0,
            errors,
            warnings,
            info
        };
    }

    /**
     * Start timing for selection operation
     */
    protected startTiming(): void {
        this.selectionStartTime = Date.now();
    }

    /**
     * Calculate coverage statistics
     */
    protected calculateCoverage(
        allTests: string[],
        selectedTests: string[]
    ): BaselineSelectionStats['coverage'] {
        const selectedSet = new Set(selectedTests);
        
        // Coverage by file type
        const fileTypes = new Map<string, { total: number; selected: number }>();
        
        // Coverage by directory
        const directories = new Map<string, { total: number; selected: number }>();
        
        // Coverage by test type (heuristic)
        const testTypes = new Map<string, { total: number; selected: number }>();

        for (const test of allTests) {
            const isSelected = selectedSet.has(test);
            
            // File type analysis
            const extension = test.split('.').pop()?.toLowerCase() || 'unknown';
            if (!fileTypes.has(extension)) {
                fileTypes.set(extension, { total: 0, selected: 0 });
            }
            fileTypes.get(extension)!.total++;
            if (isSelected) fileTypes.get(extension)!.selected++;

            // Directory analysis
            const directory = test.includes('/') ? 
                test.substring(0, test.lastIndexOf('/')) : 'root';
            if (!directories.has(directory)) {
                directories.set(directory, { total: 0, selected: 0 });
            }
            directories.get(directory)!.total++;
            if (isSelected) directories.get(directory)!.selected++;

            // Test type analysis (heuristic based on naming)
            let testType = 'unit';
            if (test.includes('integration') || test.includes('api')) {
                testType = 'integration';
            } else if (test.includes('e2e') || test.includes('browser')) {
                testType = 'e2e';
            } else if (test.includes('performance') || test.includes('load')) {
                testType = 'performance';
            }
            
            if (!testTypes.has(testType)) {
                testTypes.set(testType, { total: 0, selected: 0 });
            }
            testTypes.get(testType)!.total++;
            if (isSelected) testTypes.get(testType)!.selected++;
        }

        // Calculate ratios
        const byFileType: Record<string, number> = {};
        for (const [type, counts] of fileTypes.entries()) {
            byFileType[type] = counts.total > 0 ? counts.selected / counts.total : 0;
        }

        const byDirectory: Record<string, number> = {};
        for (const [dir, counts] of directories.entries()) {
            byDirectory[dir] = counts.total > 0 ? counts.selected / counts.total : 0;
        }

        const byTestType: Record<string, number> = {};
        for (const [type, counts] of testTypes.entries()) {
            byTestType[type] = counts.total > 0 ? counts.selected / counts.total : 0;
        }

        return {
            byFileType,
            byDirectory,
            byTestType
        };
    }

    /**
     * Filter tests based on patterns
     */
    protected filterTestsByPattern(
        tests: string[],
        includePatterns: string[] = [],
        excludePatterns: string[] = []
    ): string[] {
        let filtered = tests;

        // Apply include patterns
        if (includePatterns.length > 0) {
            filtered = filtered.filter(test => 
                includePatterns.some(pattern => {
                    const regex = new RegExp(pattern.replace(/\*/g, '.*'), 'i');
                    return regex.test(test);
                })
            );
        }

        // Apply exclude patterns
        if (excludePatterns.length > 0) {
            filtered = filtered.filter(test => 
                !excludePatterns.some(pattern => {
                    const regex = new RegExp(pattern.replace(/\*/g, '.*'), 'i');
                    return regex.test(test);
                })
            );
        }

        return filtered;
    }

    /**
     * Utility method to extract file name from test path
     */
    protected getTestFileName(testPath: string): string {
        return testPath.split('/').pop() || testPath;
    }

    /**
     * Utility method to extract directory from test path
     */
    protected getTestDirectory(testPath: string): string {
        const parts = testPath.split('/');
        return parts.length > 1 ? parts.slice(0, -1).join('/') : '';
    }

    /**
     * Utility method to check if two file paths are related
     */
    protected arePathsRelated(path1: string, path2: string): boolean {
        const dir1 = this.getTestDirectory(path1);
        const dir2 = this.getTestDirectory(path2);
        
        return dir1 === dir2 || 
               dir1.startsWith(dir2) || 
               dir2.startsWith(dir1) ||
               this.getTestFileName(path1).includes(this.getTestFileName(path2).replace(/\.(py|js|ts)$/, '')) ||
               this.getTestFileName(path2).includes(this.getTestFileName(path1).replace(/\.(py|js|ts)$/, ''));
    }
}