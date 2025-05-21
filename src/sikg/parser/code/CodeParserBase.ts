// CodeParserBase.ts - Abstract base class for code parsers

import { CodeElement } from '../../GraphTypes';
import { Logger } from '../../../utils/Logger';
import { ParserUtils } from '../util/ParserUtils';

/**
 * Abstract base class for all code parsers
 */
export abstract class CodeParserBase {
    /**
     * Parse a code file and extract code elements and relationships
     * @param content Content of the file to parse
     * @param filePath Path to the file
     * @returns Array of code elements extracted from the file
     */
    public abstract parseCodeFile(content: string, filePath: string): Promise<CodeElement[]>;

    /**
     * Clean up any resources used by this parser
     */
    public abstract dispose(): void;

    /**
     * Check if this parser can handle a given file
     * @param filePath Path to the file
     * @param content Optional content of the file
     * @returns True if this parser can handle the file
     */
    public abstract canHandle(filePath: string, content?: string): boolean;

    /**
     * Get the language supported by this parser
     */
    public abstract getLanguage(): string;

    /**
     * Generate a unique ID for a code element
     * @param kind Type of code element (function, class, method, etc.)
     * @param name Name of the code element
     * @param filePath Path to the file containing the element
     * @returns A unique identifier string
     */
    protected generateElementId(kind: string, name: string, filePath: string): string {
        return ParserUtils.generateElementId(kind, name, filePath);
    }

    /**
     * Build relationships between code elements
     * @param elements Code elements to process
     * @returns The processed code elements with unique relationships
     */
    protected buildRelationships(elements: CodeElement[]): CodeElement[] {
        // Map of element IDs to their index in the elements array
        const elementMap = new Map<string, number>();
        
        // Create a map for quick lookup
        elements.forEach((element, index) => {
            elementMap.set(element.id, index);
        });
        
        // Resolve and deduplicate relationships
        elements.forEach(element => {
            const uniqueRelations = new Map<string, { targetId: string; type: string; weight?: number }>();
            
            element.relations.forEach(relation => {
                const key = `${relation.type}-${relation.targetId}`;
                
                // If this relationship already exists, use the one with the higher weight
                if (uniqueRelations.has(key)) {
                    const existing = uniqueRelations.get(key)!;
                    if ((relation.weight || 1.0) > (existing.weight || 1.0)) {
                        uniqueRelations.set(key, relation);
                    }
                } else {
                    uniqueRelations.set(key, relation);
                }
            });
            
            // Replace with deduplicated relations
            element.relations = Array.from(uniqueRelations.values());
        });

        return elements;
    }

    /**
     * Get indentation level of a line
     * @param line Line of code to analyze
     * @returns Number of spaces in the indentation
     */
    protected getIndentation(line: string): number {
        return ParserUtils.getIndentation(line);
    }

    /**
     * Log an error and return an empty array
     * @param filePath Path of the file being processed
     * @param error Error that occurred
     * @returns Empty array of code elements
     */
    protected handleError(filePath: string, error: any): CodeElement[] {
        Logger.error(`Error parsing code file ${filePath}:`, error);
        return [];
    }
}