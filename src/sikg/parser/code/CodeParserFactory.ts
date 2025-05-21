// CodeParserFactory.ts - Factory for creating language-specific code parsers

import { CodeParserBase } from './CodeParserBase';
import { PythonCodeParser } from './language/PythonCodeParser';
import { GenericCodeParser } from './language/GenericCodeParser';
import { AstProcessorManager } from '../util/AstProcessorManager';
import { Logger } from '../../../utils/Logger';
import { ParserUtils } from '../util/ParserUtils';

/**
 * Factory for creating language-specific code parsers
 */
export class CodeParserFactory {
    private static instance: CodeParserFactory;
    private parsers: Map<string, CodeParserBase> = new Map();
    private astProcessorManager: AstProcessorManager;
    public initialized: boolean = false;

    private constructor() {
        this.astProcessorManager = new AstProcessorManager();
    }

    /**
     * Get the singleton instance of the factory
     */
    public static getInstance(): CodeParserFactory {
        if (!CodeParserFactory.instance) {
            CodeParserFactory.instance = new CodeParserFactory();
        }
        return CodeParserFactory.instance;
    }

    /**
     * Initialize the factory and parsers
     */
    public async initialize(): Promise<boolean> {
        try {
            if (this.initialized) {
                return true;
            }

            // Initialize the AST processor manager
            const astInitialized = await this.astProcessorManager.initialize();
            
            if (astInitialized) {
                Logger.info('AST processor initialized successfully for code parsing');
            } else {
                Logger.warn('AST processor initialization failed, using regex-based parsing only');
            }

            // Create and register language-specific parsers
            this.registerParser(new PythonCodeParser(this.astProcessorManager));
            
            // Register generic parser last as a fallback
            this.registerParser(new GenericCodeParser());

            this.initialized = true;
            Logger.info('CodeParserFactory initialized with parsers for: ' + 
                        Array.from(this.parsers.keys()).join(', '));
            return true;
        } catch (error) {
            Logger.error('Failed to initialize CodeParserFactory:', error);
            return false;
        }
    }

    /**
     * Register a parser with the factory
     * @param parser Parser to register
     */
    private registerParser(parser: CodeParserBase): void {
        this.parsers.set(parser.getLanguage(), parser);
    }

    /**
     * Get a parser for a specific file
     * @param filePath Path to the file
     * @param content Optional content of the file
     * @returns The appropriate parser for the file
     */
    public getParserForFile(filePath: string, content?: string): CodeParserBase {
        if (!this.initialized) {
            throw new Error('CodeParserFactory is not initialized');
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
    public getParserForLanguage(language: string): CodeParserBase {
        if (!this.initialized) {
            throw new Error('CodeParserFactory is not initialized');
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
        Logger.debug('CodeParserFactory disposed');
    }
}