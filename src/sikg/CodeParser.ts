// CodeParser.ts - Facade for the modular code parsing implementation

import { CodeElement } from './GraphTypes';
import { Logger } from '../utils/Logger';
import { CodeParserFactory } from './parser/code/CodeParserFactory';

/**
 * Facade class for code parsing functionality.
 * This maintains the same interface as the original CodeParser but delegates
 * to the new modular implementation.
 */
export class CodeParser {
    private parserFactory: CodeParserFactory;
    private initialized: boolean = false;

    constructor() {
        this.parserFactory = CodeParserFactory.getInstance();
    }

    /**
     * Initialize the code parser
     */
    public async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        try {
            const success = await this.parserFactory.initialize();
            if (success) {
                this.initialized = true;
                Logger.info('CodeParser initialized');
            } else {
                Logger.error('Failed to initialize CodeParser');
            }
        } catch (error) {
            Logger.error('Error initializing CodeParser:', error);
            throw error;
        }
    }

    /**
     * Parse a code file and extract code elements and relationships
     * @param content Content of the file to parse
     * @param filePath Path to the file
     * @returns Array of code elements extracted from the file
     */
    public async parseCodeFile(content: string, filePath: string): Promise<CodeElement[]> {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const parser = this.parserFactory.getParserForFile(filePath, content);
            return await parser.parseCodeFile(content, filePath);
        } catch (error) {
            Logger.error(`Error parsing code file ${filePath}:`, error);
            return [];
        }
    }

    /**
     * Generate a unique ID for a code element
     * @param kind Type of code element (function, class, method, etc.)
     * @param name Name of the code element
     * @param filePath Path to the file containing the element
     * @returns A unique identifier string
     */
    public generateElementId(kind: string, name: string, filePath: string): string {
        return `${kind}_${require('crypto').createHash('md5').update(`${kind}:${name}:${filePath}`).digest('hex')}`;
    }

    /**
     * Clean up resources
     */
    public dispose(): void {
        if (this.initialized) {
            this.parserFactory.dispose();
            this.initialized = false;
            Logger.debug('CodeParser disposed');
        }
    }
}