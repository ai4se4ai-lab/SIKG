// RandomSelector.ts - Random test selection baseline

import { TestResult, TestImpact } from '../../sikg/GraphTypes';
import { Logger } from '../../utils/Logger';

import { BaselineSelector } from './BaselineSelector';

/**
 * Random baseline - selects tests randomly
 * Used as baseline comparison in evaluation
 */
export class RandomSelector implements BaselineSelector {
    public readonly name = 'Random';

    constructor(private seed?: number) {
        if (seed !== undefined) {
            // Simple seeded random for reproducible results
            this.random = this.seededRandom(seed);
        }
    }

    private random: () => number = Math.random;

    /**
     * Randomly select a percentage of tests
     */
    public async selectTests(
        allTests: string[],
        changedFiles: string[],
        historicalData?: TestResult[]
    ): Promise<string[]> {
        // Use a default ratio, or allow it to be set via constructor if needed
        const targetRatio = 0.3;
        if (allTests.length === 0) {
            return [];
        }

        const targetCount = Math.max(1, Math.floor(allTests.length * targetRatio));
        const shuffled = this.shuffle([...allTests]);
        
        const selected = shuffled.slice(0, targetCount);
        
        Logger.debug(`Random selector: ${selected.length}/${allTests.length} tests selected`);
        return selected;
    }

    /**
     * Randomly prioritize selected tests
     */
    public prioritizeTests(selectedTests: string[]): string[] {
        return this.shuffle([...selectedTests]);
    }

    /**
     * Fisher-Yates shuffle algorithm
     */
    private shuffle<T>(array: T[]): T[] {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(this.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    /**
     * Simple seeded random number generator for reproducible results
     */
    private seededRandom(seed: number): () => number {
        let state = seed;
        return () => {
            state = (state * 1664525 + 1013904223) % Math.pow(2, 32);
            return state / Math.pow(2, 32);
        };
    }

    /**
     * Get selection statistics
     */
    public getStats(): { name: string; deterministic: boolean } {
        return {
            name: this.name,
            deterministic: this.seed !== undefined
        };
    }
}

export { BaselineSelector };
