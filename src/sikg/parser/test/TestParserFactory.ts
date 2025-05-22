// TestParserFactory.ts - Factory for creating language-specific test parsers

import { TestParserBase } from './TestParserBase';
import { PythonTestParser } from './language/PythonTestParser';
import { GenericTestParser } from './language/GenericTestParser';
import { AstProcessorManager } from '../util/AstProcessorManager';
import { Logger } from '../../../utils/Logger';
import { ParserUtils } from '../util/ParserUtils';
import { CodeParserFactory } from '../code/CodeParserFactory';

/**
 * Factory for creating language-specific test parsers
 */
export class TestParserFactory {
    private static instance: TestParserFactory;
    private parsers: Map<string, TestParserBase> = new Map();
    private astProcessorManager: AstProcessorManager;
    private codeParserFactory: CodeParserFactory;
    private initialized: boolean = false;

    private constructor() {
        this.astProcessorManager = new AstProcessorManager();
        this.codeParserFactory = CodeParserFactory.getInstance();
    }

    /**
     * Get the singleton instance of the factory
     */
    public static getInstance(): TestParserFactory {
        if (!TestParserFactory.instance) {
            TestParserFactory.instance = new TestParserFactory();
        }
        return TestParserFactory.instance;
    }

    /**
     * Initialize the factory and parsers
     */
    public async initialize(): Promise<boolean> {
        try {
            if (this.initialized) {
                return true;
            }

            // Make sure code parser factory is initialized
            if (!this.codeParserFactory.initialized) {
                await this.codeParserFactory.initialize();
            }

            // Initialize the AST processor manager
            const astInitialized = await this.astProcessorManager.initialize();
            
            if (astInitialized) {
                Logger.info('AST processor initialized successfully for test parsing');
            } else {
                Logger.warn('AST processor initialization failed, using regex-based parsing only for tests');
            }

            // Create and register language-specific test parsers
            this.registerParser(new PythonTestParser(
                this.codeParserFactory.getParserForLanguage('python'),
                this.astProcessorManager
            ));
            
            // Register generic parser last as a fallback
            this.registerParser(new GenericTestParser(
                this.codeParserFactory.getParserForLanguage('generic')
            ));

            this.initialized = true;
            Logger.info('TestParserFactory initialized with parsers for: ' + 
                        Array.from(this.parsers.keys()).join(', '));
            return true;
        } catch (error) {
            Logger.error('Failed to initialize TestParserFactory:', error);
            return false;
        }
    }

    /**
     * Register a parser with the factory
     * @param parser Parser to register
     */
    private registerParser(parser: TestParserBase): void {
        this.parsers.set(parser.getLanguage(), parser);
    }

    /**
     * Get a parser for a specific file
     * @param filePath Path to the file
     * @param content Optional content of the file
     * @returns The appropriate parser for the file
     */
    public getParserForFile(filePath: string, content?: string): TestParserBase {
        if (!this.initialized) {
            throw new Error('TestParserFactory is not initialized');
        }

        // Check each registered parser to see if it can handle this file
        for (const parser of this.parsers.values()) {
            if (parser.canHandle(filePath, content)) {
                return parser;
            }
        }

        // Get language from file extension
        const language = ParserUtils.getLanguageFromFilePath(filePath);
        const parser = this.parsers.get(language);
        if (parser) {
            return parser;
        }

        // Fall back to generic parser
        return this.parsers.get('generic')!;
    }

    /**
     * Get a parser for a specific language
     * @param language Language to get a parser for
     * @returns The parser for the language or the generic parser if not found
     */
    public getParserForLanguage(language: string): TestParserBase {
        if (!this.initialized) {
            throw new Error('TestParserFactory is not initialized');
        }

        const parser = this.parsers.get(language.toLowerCase());
        if (parser) {
            return parser;
        }

        // Fall back to generic parser
        return this.parsers.get('generic')!;
    }

    /**
     * Clean up resources
     */
    public dispose(): void {
        // Dispose all parsers
        for (const parser of this.parsers.values()) {
            parser.dispose();
        }

        // Clear parser map
        this.parsers.clear();

        // Dispose AST processor
        this.astProcessorManager.dispose();

        this.initialized = false;
        Logger.debug('TestParserFactory disposed');
    }
}