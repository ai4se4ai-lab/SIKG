// Fixed ChangeAnalyzer.ts - Precise change detection and impact analysis

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
     * Analyze code changes to determine their semantic nature - FIXED with precise change detection
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
                
                // Get language properly
                const language = this.getFileLanguage(filePath);
                Logger.debug(`Detected language '${language}' for file: ${filePath}`);
                
                // Only process supported languages
                if (!this.isSupportedLanguage(language)) {
                    Logger.debug(`Skipping file ${filePath} - language '${language}' not supported`);
                    continue;
                }
                
                // FIXED: Extract only ACTUALLY modified code snippets with precise line tracking
                const modifiedSnippets = await this.extractPreciseModifiedSnippets(fileChange);
                
                for (const snippet of modifiedSnippets) {
                    // FIXED: Find ONLY nodes that were actually changed in these specific lines
                    const affectedNodeIds = await this.findPreciselyAffectedNodes(filePath, snippet);
                    
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
                                language: language,
                                filePath: filePath,
                                changeTimestamp: Date.now()
                            },
                            initialImpactScore
                        };
                        
                        result.push(semanticChange);
                        Logger.info(`Found semantic change: ${semanticType} in node ${nodeId} (${snippet.location.startLine}-${snippet.location.endLine})`);
                    }
                }
            } catch (error) {
                Logger.error(`Error analyzing changes for file ${fileChange.filePath}:`, error);
            }
        }
        
        // FIXED: Mark the affected nodes as changed in the SIKG with precise tracking
        this.sikgManager.markNodesAsChanged(result);
        
        Logger.info(`Identified ${result.length} semantic changes in code elements`);
        return result;
    }

    /**
     * FIXED: Extract only the ACTUALLY modified code snippets with precise line tracking
     */
    private async extractPreciseModifiedSnippets(fileChange: FileChange): Promise<CodeSnippet[]> {
        const result: CodeSnippet[] = [];
        
        try {
            // Get the diff details from git service
            const diffDetail = await this.gitService.getDiffDetails(fileChange.filePath);
            
            if (!diffDetail) {
                return result;
            }
            
            // FIXED: Process each hunk and track ONLY changed lines, not context
            for (const hunk of diffDetail.hunks) {
                const changedLines: number[] = [];
                const beforeLines: string[] = [];
                const afterLines: string[] = [];
                
                let currentOldLine = hunk.oldStart;
                let currentNewLine = hunk.newStart;
                
                // Track which specific lines were actually changed (not context)
                for (const line of hunk.lines) {
                    if (line.type === 'delete') {
                        beforeLines.push(line.content);
                        changedLines.push(currentOldLine);
                        currentOldLine++;
                    } else if (line.type === 'add') {
                        afterLines.push(line.content);
                        changedLines.push(currentNewLine);
                        currentNewLine++;
                    } else if (line.type === 'context') {
                        // Context lines are not changes, just move line counters
                        beforeLines.push(line.content);
                        afterLines.push(line.content);
                        currentOldLine++;
                        currentNewLine++;
                    }
                }
                
                // Only create snippet if there were actual changes (not just context)
                const actualChanges = hunk.lines.filter(line => line.type === 'add' || line.type === 'delete');
                if (actualChanges.length > 0) {
                    // Calculate precise change boundaries
                    const addedLines = hunk.lines.filter(line => line.type === 'add');
                    const deletedLines = hunk.lines.filter(line => line.type === 'delete');
                    
                    // Find the actual start and end of changes
                    const changeStartLine = Math.min(hunk.newStart, hunk.oldStart);
                    const changeEndLine = Math.max(
                        hunk.newStart + addedLines.length - 1,
                        hunk.oldStart + deletedLines.length - 1
                    );
                    
                    result.push({
                        before: beforeLines.join('\n'),
                        after: afterLines.join('\n'),
                        linesChanged: actualChanges.length,
                        location: {
                            startLine: changeStartLine,
                            endLine: changeEndLine,
                            actualChangedLines: changedLines // Track exactly which lines changed
                        }
                    });
                    
                    Logger.debug(`Precise change detected: lines ${changeStartLine}-${changeEndLine}, ${actualChanges.length} actual changes`);
                }
            }
            
        } catch (error) {
            Logger.error(`Error extracting modified snippets for ${fileChange.filePath}:`, error);
        }
        
        return result;
    }

    /**
     * FIXED: Find ONLY nodes that contain code that was actually changed
     */
    private async findPreciselyAffectedNodes(filePath: string, snippet: CodeSnippet): Promise<string[]> {
        const result: string[] = [];
        
        try {
            // Get all code nodes for this file
            const codeNodes = this.sikgManager.getCodeNodes();
            const normalizedFilePath = this.normalizeFilePath(filePath);
            
            for (const node of codeNodes) {
                // FIXED: Only check nodes in the exact same file
                if (!this.pathsMatch(node.filePath, normalizedFilePath)) {
                    continue;
                }
                
                if (!node.properties.loc) {
                    continue;
                }
                
                const nodeLoc = node.properties.loc;
                
                // FIXED: Check if the node CONTAINS any of the actually changed lines
                const nodeContainsChanges = snippet.location.actualChangedLines?.some(changedLine => 
                    changedLine >= nodeLoc.start.line && changedLine <= nodeLoc.end.line
                ) || false;
                
                // LEGACY: If actualChangedLines is not available, fall back to range check
                const legacyOverlap = !snippet.location.actualChangedLines && 
                    !(snippet.location.endLine < nodeLoc.start.line || snippet.location.startLine > nodeLoc.end.line);
                
                if (nodeContainsChanges || legacyOverlap) {
                    result.push(node.id);
                    Logger.debug(`Node ${node.name} (${node.id}) contains changes at lines ${nodeLoc.start.line}-${nodeLoc.end.line}`);
                }
            }
        } catch (error) {
            Logger.error(`Error finding affected nodes for ${filePath}:`, error);
        }
        
        return result;
    }

    /**
     * FIXED: Normalize file paths for consistent comparison
     */
    private normalizeFilePath(filePath: string): string {
        try {
            // Use workspace-relative path if possible
            if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
                
                if (path.isAbsolute(filePath)) {
                    const relativePath = path.relative(workspaceRoot, filePath);
                    if (!relativePath.startsWith('..')) {
                        return relativePath.replace(/\\/g, '/');
                    }
                }
            }
            
            return path.normalize(filePath).replace(/\\/g, '/');
        } catch (error) {
            Logger.debug(`Error normalizing path ${filePath}:`, error);
            return filePath.replace(/\\/g, '/');
        }
    }

    /**
     * FIXED: Check if two file paths refer to the same file with better comparison
     */
    private pathsMatch(path1: string, path2: string): boolean {
        if (!path1 || !path2) {
            return false;
        }
        
        try {
            const normalized1 = this.normalizeFilePath(path1);
            const normalized2 = this.normalizeFilePath(path2);
            
            // Direct match
            if (normalized1 === normalized2) {
                return true;
            }
            
            // Check if one is a suffix of the other (handle relative vs absolute paths)
            return normalized1.endsWith(normalized2) || normalized2.endsWith(normalized1);
        } catch (error) {
            Logger.debug(`Error comparing paths ${path1} and ${path2}:`, error);
            return path1 === path2;
        }
    }

    /**
     * Get file language with proper error handling
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
     * Check if a language is supported by SIKG
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
     * Determine if a file should be skipped during analysis
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
     * Classify the type of change based on before and after code
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

// FIXED: Enhanced interface for precise change tracking
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
        actualChangedLines?: number[]; // ADDED: Track exactly which lines changed
    };
}