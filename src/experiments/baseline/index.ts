// baseline/index.ts - Baseline selector exports

import { EkstaziSelector } from './EkstaziSelector';
import { HistoryBasedSelector } from './HistoryBasedSelector';
import { BaselineSelector, RandomSelector } from './RandomSelector';

export { RandomSelector, BaselineSelector } from './RandomSelector';
export { EkstaziSelector, FileChange, TestFileMapping } from './EkstaziSelector';
export { HistoryBasedSelector, TestHistoryRecord, TestStats } from './HistoryBasedSelector';

// Baseline factory for easy instantiation
export class BaselineFactory {
    /**
     * Create all baseline selectors for comparison
     */
    public static createAllBaselines(seed?: number): {
        random: RandomSelector;
        ekstazi: EkstaziSelector;
        history: HistoryBasedSelector;
    } {
        return {
            random: new RandomSelector(seed),
            ekstazi: new EkstaziSelector(),
            history: new HistoryBasedSelector()
        };
    }

    /**
     * Get baseline names for reporting
     */
    public static getBaselineNames(): string[] {
        return ['Random', 'Ekstazi-RTS', 'History-TCP'];
    }
}

// Helper to validate baseline implementation
export async function validateBaseline(selector: BaselineSelector): Promise<boolean> {
    try {
        // Test with empty input
        const emptyResult = await selector.selectTests([], []);
        if (emptyResult.length !== 0) {
            return false;
        }

        // Test with sample data
        const sampleTests = ['test1', 'test2', 'test3', 'test4', 'test5'];
        const selected = await selector.selectTests(sampleTests, []);
        // Validate outputs
        return (
            Array.isArray(selected) &&
            selected.length <= sampleTests.length &&
            selected.every(test => sampleTests.includes(test))
        );
    } catch (error) {
        return false;
    }
}