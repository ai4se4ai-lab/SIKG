// CodeParserFactory.ts - Fixed language registration and detection

import { CodeParserBase } from './CodeParserBase';
import { PythonCodeParser } from './language/PythonCodeParser';
import { GenericCodeParser } from './language/GenericCodeParser';
import { AstProcessorManager } from '../util/AstProcessorManager';
import { Logger } from '../../../utils/Logger';
import { ParserUtils } from '../util/ParserUtils';
import * as vscode from 'vscode';

/**
 * Factory for creating language-specific code parsers with fixed language detection
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
     * Initialize the factory and parsers with proper language registration
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

            // Register language-specific parsers using VS Code language identifiers
            this.registerParser('python', new PythonCodeParser(this.astProcessorManager));
            
            // Register generic parser as fallback
            this.registerParser('generic', new GenericCodeParser());
            this.registerParser('plaintext', new GenericCodeParser());

            // Log registered parsers
            const registeredLanguages = Array.from(this.parsers.keys());
            Logger.info(`CodeParserFactory initialized with parsers for: ${registeredLanguages.join(', ')}`);
            
            this.initialized = true;
            return true;
        } catch (error) {
            Logger.error('Failed to initialize CodeParserFactory:', error);
            return false;
        }
    }

    /**
     * Register a parser with the factory using language identifier
     * @param languageId VS Code language identifier
     * @param parser Parser to register
     */
    private registerParser(languageId: string, parser: CodeParserBase): void {
        this.parsers.set(languageId.toLowerCase(), parser);
        Logger.debug(`Registered parser for language: ${languageId}`);
    }

    /**
     * Get a parser for a specific file with enhanced language detection
     * @param filePath Path to the file
     * @param content Optional content of the file
     * @returns The appropriate parser for the file
     */
    public getParserForFile(filePath: string, content?: string): CodeParserBase {
        if (!this.initialized) {
            throw new Error('CodeParserFactory is not initialized');
        }

        try {
            // First, try to get language from VS Code if the file is open
            const language = this.getLanguageFromVSCode(filePath) || 
                            ParserUtils.getLanguageFromFilePath(filePath);
            
            Logger.debug(`Detected language '${language}' for file: ${filePath}`);

            // Check each registered parser to see if it can handle this file
            for (const [langId, parser] of this.parsers.entries()) {
                if (langId !== 'generic' && langId !== 'plaintext' && 
                    parser.canHandle && parser.canHandle(filePath, content)) {
                    Logger.debug(`Using specific parser for language: ${langId}`);
                    return parser;
                }
            }

            // Try to get parser by detected language
            const parser = this.parsers.get(language.toLowerCase());
            if (parser) {
                Logger.debug(`Using registered parser for language: ${language}`);
                return parser;
            }

            // Fall back to generic parser
            Logger.debug(`Using generic parser for file: ${filePath}`);
            return this.parsers.get('generic')!;
            
        } catch (error) {
            Logger.error(`Error getting parser for file ${filePath}:`, error);
            return this.parsers.get('generic')!;
        }
    }

    /**
     * Get language from VS Code's language service
     * @param filePath Path to the file
     * @returns Language identifier or null if not found
     */
    private getLanguageFromVSCode(filePath: string): string | null {
        try {
            // Check if the file is currently open in VS Code
            const document = vscode.workspace.textDocuments.find(doc => 
                doc.fileName === filePath || 
                doc.fileName.endsWith(filePath) ||
                doc.uri.fsPath === filePath
            );
            
            if (document) {
                Logger.debug(`Found open document with language: ${document.languageId}`);
                return document.languageId;
            }
        } catch (error) {
            Logger.debug(`Could not get language from VS Code for ${filePath}:`, error);
        }
        
        return null;
    }

    /**
     * Get a parser for a specific language
     * @param language Language identifier
     * @returns The parser for the language or the generic parser if not found
     */
    public getParserForLanguage(language: string): CodeParserBase {
        if (!this.initialized) {
            throw new Error('CodeParserFactory is not initialized');
        }

        const normalizedLanguage = language.toLowerCase();
        const parser = this.parsers.get(normalizedLanguage);
        
        if (parser) {
            Logger.debug(`Retrieved parser for language: ${normalizedLanguage}`);
            return parser;
        }

        // Fall back to generic parser
        Logger.debug(`No specific parser found for language '${language}', using generic parser`);
        return this.parsers.get('generic')!;
    }

    /**
     * Check if a language is supported
     * @param language Language identifier
     * @returns True if a specific parser exists for the language
     */
    public isLanguageSupported(language: string): boolean {
        if (!this.initialized) {
            return false;
        }
        
        const normalizedLanguage = language.toLowerCase();
        return this.parsers.has(normalizedLanguage) && 
               normalizedLanguage !== 'generic' && 
               normalizedLanguage !== 'plaintext';
    }

    /**
     * Get all supported languages
     * @returns Array of supported language identifiers
     */
    public getSupportedLanguages(): string[] {
        if (!this.initialized) {
            return [];
        }
        
        return Array.from(this.parsers.keys()).filter(lang => 
            lang !== 'generic' && lang !== 'plaintext'
        );
    }

    /**
     * Register additional parsers for other languages
     * @param language Language identifier
     * @param parser Parser instance
     */
    public registerLanguageParser(language: string, parser: CodeParserBase): void {
        if (!this.initialized) {
            throw new Error('CodeParserFactory is not initialized');
        }
        
        this.registerParser(language, parser);
        Logger.info(`Registered additional parser for language: ${language}`);
    }

    /**
     * Get factory statistics
     * @returns Object with factory statistics
     */
    public getStatistics(): {
        initialized: boolean;
        supportedLanguages: string[];
        totalParsers: number;
        astEnabled: boolean;
    } {
        return {
            initialized: this.initialized,
            supportedLanguages: this.getSupportedLanguages(),
            totalParsers: this.parsers.size,
            astEnabled: this.astProcessorManager.initialized
        };
    }

    /**
     * Clean up resources
     */
    public dispose(): void {
        // Dispose all parsers
        for (const parser of this.parsers.values()) {
            try {
                if (parser.dispose) {
                    parser.dispose();
                }
            } catch (error) {
                Logger.error('Error disposing parser:', error);
            }
        }

        // Clear parser map
        this.parsers.clear();

        // Dispose AST processor
        try {
            this.astProcessorManager.dispose();
        } catch (error) {
            Logger.error('Error disposing AST processor:', error);
        }

        this.initialized = false;
        Logger.debug('CodeParserFactory disposed');
    }
}