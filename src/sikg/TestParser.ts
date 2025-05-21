// TestParser.ts - Facade for the modular test parsing implementation

import { TestCase } from './GraphTypes';
import { Logger } from '../utils/Logger';
import { TestParserFactory } from './parser/test/TestParserFactory';

/**
 * Facade class for test parsing functionality.
 * This maintains the same interface as the original TestParser but delegates
 * to the new modular implementation.
 */
export class TestParser {
    private parserFactory: TestParserFactory;
    private initialized: boolean = false;

    constructor() {
        this.parserFactory = TestParserFactory.getInstance();
    }

    /**
     * Initialize the test parser
     */
    public async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        try {
            const success = await this.parserFactory.initialize();
            if (success) {
                this.initialized = true;
                Logger.info('TestParser initialized');
            } else {
                Logger.error('Failed to initialize TestParser');
            }
        } catch (error) {
            Logger.error('Error initializing TestParser:', error);
            throw error;
        }
    }

    /**
     * Parse a test file and extract test cases
     * @param content Content of the file to parse
     * @param filePath Path to the file
     * @returns Array of test cases extracted from the file
     */
    public async parseTestFile(content: string, filePath: string): Promise<TestCase[]> {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const parser = this.parserFactory.getParserForFile(filePath, content);
            return await parser.parseTestFile(content, filePath);
        } catch (error) {
            Logger.error(`Error parsing test file ${filePath}:`, error);
            return [];
        }
    }

    /**
     * Generate a unique ID for a test node
     * @param testName Name of the test
     * @param filePath Path to the test file
     * @returns A unique identifier string
     */
    public generateNodeId(testName: string, filePath: string): string {
        return `test_${require('crypto').createHash('md5').update(`test:${testName}:${filePath}`).digest('hex')}`;
    }

    /**
     * Clean up resources
     */
    public dispose(): void {
        if (this.initialized) {
            this.parserFactory.dispose();
            this.initialized = false;
            Logger.debug('TestParser disposed');
        }
    }
}