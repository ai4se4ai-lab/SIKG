// ChangeAnalyzer.ts - Fixed to properly handle language detection

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as path from 'path';
import { SIKGManager } from './SIKGManager';
import { GitService } from '../services/GitService';
import { ConfigManager } from '../utils/ConfigManager';
import { SemanticChangeInfo } from './GraphTypes';
import { Logger } from '../utils/Logger';
import { ParserUtils } from './parser/util/ParserUtils';

export class ChangeAnalyzer {
    private sikgManager: SIKGManager;
    private gitService: GitService;
    private configManager: ConfigManager;

    constructor(sikgManager: SIKGManager, gitService: GitService, configManager: ConfigManager) {
        this.sikgManager = sikgManager;
        this.gitService = gitService;
        this.configManager = configManager;
    }

    /**
     * Analyze code changes to determine their semantic nature - FIXED language detection
     */
    public async analyzeChanges(changes: FileChange[]): Promise<SemanticChangeInfo[]> {
        Logger.info(`Analyzing ${changes.length} file changes...`);
        const result: SemanticChangeInfo[] = [];
        
        for (const fileChange of changes) {
            try {
                const filePath = fileChange.filePath;
                
                // Skip irrelevant files with proper language detection
                if (this.shouldSkipFile(filePath)) {
                    Logger.debug(`Skipping file ${filePath} - not a supported code file`);
                    continue;
                }
                
                // Get language properly - FIXED
                const language = this.getFileLanguage(filePath);
                Logger.debug(`Detected language '${language}' for file: ${filePath}`);
                
                // Only process supported languages
                if (!this.isSupportedLanguage(language)) {
                    Logger.debug(`Skipping file ${filePath} - language '${language}' not supported`);
                    continue;
                }
                
                // Extract modified code snippets
                const modifiedSnippets = await this.extractModifiedSnippets(fileChange);
                
                for (const snippet of modifiedSnippets) {
                    // Find affected nodes in SIKG
                    const affectedNodeIds = await this.findAffectedNodes(filePath, snippet.location);
                    
                    for (const nodeId of affectedNodeIds) {
                        // Classify the change semantically based on language
                        const semanticType = await this.classifyChangeType(
                            snippet.before,
                            snippet.after,
                            nodeId,
                            language
                        );
                        
                        // Calculate initial impact score based on the semantic type and context
                        const initialImpactScore = this.calculateInitialImpact(semanticType, snippet, nodeId);
                        
                        // Create the semantic change info
                        const semanticChange: SemanticChangeInfo = {
                            nodeId,
                            semanticType,
                            changeDetails: {
                                linesChanged: snippet.linesChanged,
                                oldCodeHash: this.hashCode(snippet.before),
                                newCodeHash: this.hashCode(snippet.after),
                                changeLocation: snippet.location,
                                language: language, // Add language info
                                filePath: filePath
                            },
                            initialImpactScore
                        };
                        
                        result.push(semanticChange);
                    }
                }
            } catch (error) {
                Logger.error(`Error analyzing changes for file ${fileChange.filePath}:`, error);
            }
        }
        
        // Mark the affected nodes as changed in the SIKG
        this.sikgManager.markNodesAsChanged(result);
        
        Logger.info(`Identified ${result.length} semantic changes in code elements`);
        return result;
    }

    /**
     * Get file language with proper error handling - FIXED
     */
    private getFileLanguage(filePath: string): string {
        try {
            // First try to get language from VS Code if file is open
            const openDocument = vscode.workspace.textDocuments.find(doc => 
                doc.fileName === filePath || 
                doc.fileName.endsWith(filePath) ||
                doc.uri.fsPath === filePath
            );
            
            if (openDocument) {
                Logger.debug(`Found open document with language: ${openDocument.languageId}`);
                return openDocument.languageId;
            }
            
            // Fall back to extension-based detection
            const language = ParserUtils.getLanguageFromFilePath(filePath);
            Logger.debug(`Language from file path: ${language}`);
            return language;
            
        } catch (error) {
            Logger.error(`Error detecting language for ${filePath}:`, error);
            return 'plaintext';
        }
    }

    /**
     * Check if a language is supported by SIKG - FIXED
     */
    private isSupportedLanguage(language: string): boolean {
        const supportedLanguages = [
            'python',
            'javascript', 
            'typescript',
            'java',
            'csharp',
            'go'
        ];
        
        return supportedLanguages.includes(language.toLowerCase());
    }

    /**
     * Determine if a file should be skipped during analysis - ENHANCED
     */
    private shouldSkipFile(filePath: string): boolean {
        try {
            const excludePatterns = this.configManager.getExcludePatterns();
            
            // Check if the file matches any exclude pattern
            for (const pattern of excludePatterns) {
                const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
                if (regex.test(filePath)) {
                    return true;
                }
            }
            
            // Check if it's a supported code file
            const codeExtensions = this.configManager.getCodeFileExtensions();
            const extension = path.extname(filePath).substring(1).toLowerCase(); // Remove dot
            
            if (!extension || !codeExtensions.includes(extension)) {
                return true;
            }
            
            return false;
        } catch (error) {
            Logger.error(`Error checking if file should be skipped: ${filePath}`, error);
            return true; // Skip on error to be safe
        }
    }

    /**
     * Extract modified code snippets from a file change
     */
    private async extractModifiedSnippets(fileChange: FileChange): Promise<CodeSnippet[]> {
        const result: CodeSnippet[] = [];
        
        try {
            // Get the diff details from git service
            const diffDetail = await this.gitService.getDiffDetails(fileChange.filePath);
            
            if (!diffDetail) {
                return result;
            }
            
            // Process each hunk in the diff
            for (const hunk of diffDetail.hunks) {
                // Extract before and after code
                const before = hunk.lines
                    .filter(line => line.type === 'delete' || line.type === 'context')
                    .map(line => line.content)
                    .join('\n');
                    
                const after = hunk.lines
                    .filter(line => line.type === 'add' || line.type === 'context')
                    .map(line => line.content)
                    .join('\n');
                
                // Calculate the number of changed lines
                const linesChanged = hunk.lines.filter(line => 
                    line.type === 'add' || line.type === 'delete'
                ).length;
                
                // Create the code snippet
                result.push({
                    before,
                    after,
                    linesChanged,
                    location: {
                        startLine: hunk.newStart,
                        endLine: hunk.newStart + hunk.newLines - 1
                    }
                });
            }
            
        } catch (error) {
            Logger.error(`Error extracting modified snippets for ${fileChange.filePath}:`, error);
        }
        
        return result;
    }

    /**
     * Find nodes in the SIKG that correspond to the changed code
     */
    private async findAffectedNodes(filePath: string, location: { startLine: number, endLine: number }): Promise<string[]> {
        const result: string[] = [];
        
        try {
            // Get all code nodes
            const codeNodes = this.sikgManager.getCodeNodes();
            
            // Find nodes that match the file path and have an overlapping location
            for (const node of codeNodes) {
                if (this.pathsMatch(node.filePath, filePath) && node.properties.loc) {
                    const nodeLoc = node.properties.loc;
                    
                    // Check if the locations overlap
                    if (!(location.endLine < nodeLoc.start.line || location.startLine > nodeLoc.end.line)) {
                        result.push(node.id);
                    }
                }
            }
        } catch (error) {
            Logger.error(`Error finding affected nodes for ${filePath}:`, error);
        }
        
        return result;
    }

    /**
     * Check if two file paths refer to the same file
     */
    private pathsMatch(path1: string, path2: string): boolean {
        try {
            // Normalize both paths
            const normalized1 = path.resolve(path1).toLowerCase();
            const normalized2 = path.resolve(path2).toLowerCase();
            
            return normalized1 === normalized2 || 
                   normalized1.endsWith(normalized2) || 
                   normalized2.endsWith(normalized1);
        } catch (error) {
            Logger.debug(`Error comparing paths ${path1} and ${path2}:`, error);
            return path1 === path2;
        }
    }

    /**
     * Classify the type of change based on before and after code - ENHANCED with language support
     */
    private async classifyChangeType(
        beforeCode: string,
        afterCode: string,
        nodeId: string,
        language: string
    ): Promise<SemanticChangeInfo['semanticType']> {
        try {
            // Get the node and its properties
            const node = this.sikgManager.getNode(nodeId);
            
            if (!node) {
                return 'UNKNOWN';
            }
            
            // Use language-specific classification
            switch (language.toLowerCase()) {
                case 'python':
                    return this.classifyPythonChange(beforeCode, afterCode, node);
                case 'javascript':
                case 'typescript':
                    return this.classifyJavaScriptChange(beforeCode, afterCode, node);
                case 'java':
                    return this.classifyJavaChange(beforeCode, afterCode, node);
                default:
                    return this.classifyGenericChange(beforeCode, afterCode, node);
            }
        } catch (error) {
            Logger.error(`Error classifying change type:`, error);
            return 'UNKNOWN';
        }
    }

    /**
     * Classify Python-specific changes
     */
    private classifyPythonChange(beforeCode: string, afterCode: string, node: any): SemanticChangeInfo['semanticType'] {
        const lowerBody = afterCode.toLowerCase();
        
        // Check for bug fix keywords
        if (this.containsKeywords(lowerBody, ['fix', 'bug', 'issue', 'problem', 'error', 'exception', 'crash'])) {
            return 'BUG_FIX';
        }
        
        // Check for feature addition
        if (this.containsKeywords(lowerBody, ['feature', 'implement', 'add', 'new']) && 
            lowerBody.length > beforeCode.length * 1.5) {
            return 'FEATURE_ADDITION';
        }
        
        // Check for signature refactoring (function signature changes)
        const beforeSignature = this.extractPythonSignature(beforeCode);
        const afterSignature = this.extractPythonSignature(afterCode);
        
        if (beforeSignature && afterSignature && beforeSignature !== afterSignature) {
            return 'REFACTORING_SIGNATURE';
        }
        
        // Check for performance optimization
        if (this.containsKeywords(lowerBody, ['performance', 'optimize', 'speed', 'fast', 'efficient'])) {
            return 'PERFORMANCE_OPT';
        }
        
        // Check for dependency updates
        if (this.containsKeywords(lowerBody, ['import', 'dependency', 'version', 'update', 'upgrade', 'library', 'pip'])) {
            return 'DEPENDENCY_UPDATE';
        }
        
        // Default to refactoring of internal logic if none of the above
        return 'REFACTORING_LOGIC';
    }

    /**
     * Classify JavaScript/TypeScript-specific changes
     */
    private classifyJavaScriptChange(beforeCode: string, afterCode: string, node: any): SemanticChangeInfo['semanticType'] {
        const lowerBody = afterCode.toLowerCase();
        
        // Check for bug fix keywords
        if (this.containsKeywords(lowerBody, ['fix', 'bug', 'issue', 'problem', 'error'])) {
            return 'BUG_FIX';
        }
        
        // Check for signature changes
        const beforeSignature = this.extractJavaScriptSignature(beforeCode);
        const afterSignature = this.extractJavaScriptSignature(afterCode);
        
        if (beforeSignature && afterSignature && beforeSignature !== afterSignature) {
            return 'REFACTORING_SIGNATURE';
        }
        
        // Default classification
        return 'REFACTORING_LOGIC';
    }

    /**
     * Classify Java-specific changes
     */
    private classifyJavaChange(beforeCode: string, afterCode: string, node: any): SemanticChangeInfo['semanticType'] {
        const lowerBody = afterCode.toLowerCase();
        
        // Check for bug fix keywords
        if (this.containsKeywords(lowerBody, ['fix', 'bug', 'issue', 'problem', 'error'])) {
            return 'BUG_FIX';
        }
        
        // Check for method signature changes
        const beforeSignature = this.extractJavaSignature(beforeCode);
        const afterSignature = this.extractJavaSignature(afterCode);
        
        if (beforeSignature && afterSignature && beforeSignature !== afterSignature) {
            return 'REFACTORING_SIGNATURE';
        }
        
        return 'REFACTORING_LOGIC';
    }

    /**
     * Generic change classification
     */
    private classifyGenericChange(beforeCode: string, afterCode: string, node: any): SemanticChangeInfo['semanticType'] {
        const lowerBody = afterCode.toLowerCase();
        
        if (this.containsKeywords(lowerBody, ['fix', 'bug', 'issue'])) {
            return 'BUG_FIX';
        }
        
        return 'REFACTORING_LOGIC';
    }

    /**
     * Calculate the initial impact score based on semantic type and context
     */
    private calculateInitialImpact(
        semanticType: SemanticChangeInfo['semanticType'],
        snippet: CodeSnippet,
        nodeId: string
    ): number {
        try {
            // Get the node and check its importance in the graph
            const node = this.sikgManager.getNode(nodeId);
            if (!node) {
                return 0.5; // Default mid-level impact
            }
            
            // Get incoming and outgoing edges to determine the node's importance
            const incomingEdges = this.sikgManager.getIncomingEdges(nodeId);
            const outgoingEdges = this.sikgManager.getOutgoingEdges(nodeId);
            
            // More connections = more important node
            const connectivityFactor = Math.min(1, (incomingEdges.length + outgoingEdges.length) / 10);
            
            // Base impact scores by semantic type
            const baseImpactByType: Record<SemanticChangeInfo['semanticType'], number> = {
                'BUG_FIX': 0.8,               // High impact - fixes often change behavior
                'FEATURE_ADDITION': 0.7,      // Moderately high - new code may have bugs
                'REFACTORING_SIGNATURE': 0.9, // Very high - changes API/interfaces
                'REFACTORING_LOGIC': 0.5,     // Medium - internal changes may have bugs
                'DEPENDENCY_UPDATE': 0.6,     // Medium-high - may change dependencies
                'PERFORMANCE_OPT': 0.4,       // Lower - shouldn't change behavior
                'UNKNOWN': 0.5                // Medium - default
            };
            
            // Size factor - more lines changed = higher impact
            const sizeFactor = Math.min(1, snippet.linesChanged / 50);
            
            // Calculate final score combining all factors
            const rawImpact = baseImpactByType[semanticType] * 0.5 + 
                          connectivityFactor * 0.3 + 
                          sizeFactor * 0.2;
            
            // Ensure score is between 0 and 1
            return Math.min(1, Math.max(0, rawImpact));
        } catch (error) {
            Logger.error(`Error calculating initial impact:`, error);
            return 0.5;
        }
    }

    /**
     * Helper to check if code contains specific keywords
     */
    private containsKeywords(code: string, keywords: string[]): boolean {
        const lowerCode = code.toLowerCase();
        return keywords.some(keyword => lowerCode.includes(keyword.toLowerCase()));
    }

    /**
     * Extract Python function signature
     */
    private extractPythonSignature(code: string): string | null {
        const signatureRegex = /def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)/g;
        const match = signatureRegex.exec(code);
        return match ? match[0] : null;
    }

    /**
     * Extract JavaScript function signature
     */
    private extractJavaScriptSignature(code: string): string | null {
        const patterns = [
            /function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)/g,
            /([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*\(([^)]*)\)\s*=>/g,
            /const\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*\(([^)]*)\)\s*=>/g
        ];
        
        for (const pattern of patterns) {
            const match = pattern.exec(code);
            if (match) {
                return match[0];
            }
        }
        return null;
    }

    /**
     * Extract Java method signature
     */
    private extractJavaSignature(code: string): string | null {
        const signatureRegex = /(?:public|private|protected)?\s*(?:static)?\s*(?:\w+)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)/g;
        const match = signatureRegex.exec(code);
        return match ? match[0] : null;
    }

    /**
     * Create a hash of code for comparison
     */
    private hashCode(code: string): string {
        return crypto.createHash('sha256').update(code).digest('hex');
    }
}

interface FileChange {
    filePath: string;
    changeType: 'add' | 'modify' | 'delete';
}

interface CodeSnippet {
    before: string;
    after: string;
    linesChanged: number;
    location: {
        startLine: number;
        endLine: number;
    };
}