// Change Analyzer - Analyzes code changes and determines their semantic nature

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { SIKGManager } from './SIKGManager';
import { GitService } from '../services/GitService';
import { ConfigManager } from '../utils/ConfigManager';
import { SemanticChangeInfo } from './GraphTypes';
import { Logger } from '../utils/Logger';

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
     * Analyze code changes to determine their semantic nature
     */
    public async analyzeChanges(changes: FileChange[]): Promise<SemanticChangeInfo[]> {
        Logger.info(`Analyzing ${changes.length} file changes...`);
        const result: SemanticChangeInfo[] = [];
        
        for (const fileChange of changes) {
            try {
                const filePath = fileChange.filePath;
                
                // Skip irrelevant files
                if (this.shouldSkipFile(filePath)) {
                    continue;
                }
                
                // Extract modified code snippets
                const modifiedSnippets = await this.extractModifiedSnippets(fileChange);
                
                for (const snippet of modifiedSnippets) {
                    // Find affected nodes in SIKG
                    const affectedNodeIds = await this.findAffectedNodes(filePath, snippet.location);
                    
                    for (const nodeId of affectedNodeIds) {
                        // Classify the change semantically
                        const semanticType = await this.classifyChangeType(
                            snippet.before,
                            snippet.after,
                            nodeId
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
                                changeLocation: snippet.location
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
     * Determine if a file should be skipped during analysis
     */
    private shouldSkipFile(filePath: string): boolean {
        const excludePatterns = this.configManager.getExcludePatterns();
        
        // Check if the file matches any exclude pattern
        for (const pattern of excludePatterns) {
            if (new RegExp(pattern).test(filePath)) {
                return true;
            }
        }
        
        // Check if it's a supported code file
        const codeExtensions = this.configManager.getCodeFileExtensions();
        const extension = filePath.split('.').pop()?.toLowerCase();
        
        if (!extension || !codeExtensions.includes(extension)) {
            return true;
        }
        
        return false;
    }

    /**
     * Extract modified code snippets from a file change
     */
    private async extractModifiedSnippets(fileChange: FileChange): Promise<CodeSnippet[]> {
        const result: CodeSnippet[] = [];
        
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
        
        return result;
    }

    /**
     * Find nodes in the SIKG that correspond to the changed code
     */
    private async findAffectedNodes(filePath: string, location: { startLine: number, endLine: number }): Promise<string[]> {
        const result: string[] = [];
        
        // Get all code nodes
        const codeNodes = this.sikgManager.getCodeNodes();
        
        // Find nodes that match the file path and have an overlapping location
        for (const node of codeNodes) {
            if (node.filePath === filePath && node.properties.loc) {
                const nodeLoc = node.properties.loc;
                
                // Check if the locations overlap
                if (!(location.endLine < nodeLoc.start.line || location.startLine > nodeLoc.end.line)) {
                    result.push(node.id);
                }
            }
        }
        
        return result;
    }

    /**
     * Classify the type of change based on before and after code
     */
    private async classifyChangeType(
        beforeCode: string,
        afterCode: string,
        nodeId: string
    ): Promise<SemanticChangeInfo['semanticType']> {
        // Get the node and its properties
        const node = this.sikgManager.getNode(nodeId);
        
        if (!node) {
            return 'UNKNOWN';
        }
        
        // Simple heuristics for now - this would be a good place to use ML in the future
        
        // Check for bug fix keywords
        if (this.containsKeywords(afterCode, ['fix', 'bug', 'issue', 'problem', 'error', 'exception', 'crash'])) {
            return 'BUG_FIX';
        }
        
        // Check for feature addition
        if (this.containsKeywords(afterCode, ['feature', 'implement', 'add', 'new']) && 
            afterCode.length > beforeCode.length * 1.5) {
            return 'FEATURE_ADDITION';
        }
        
        // Check for signature refactoring (method/function signature changes)
        const beforeSignature = this.extractSignature(beforeCode);
        const afterSignature = this.extractSignature(afterCode);
        
        if (beforeSignature && afterSignature && beforeSignature !== afterSignature) {
            return 'REFACTORING_SIGNATURE';
        }
        
        // Check for performance optimization
        if (this.containsKeywords(afterCode, ['performance', 'optimize', 'speed', 'fast', 'efficient'])) {
            return 'PERFORMANCE_OPT';
        }
        
        // Check for dependency updates
        if (this.containsKeywords(afterCode, ['dependency', 'version', 'update', 'upgrade', 'library'])) {
            return 'DEPENDENCY_UPDATE';
        }
        
        // Default to refactoring of internal logic if none of the above
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
    }

    /**
     * Helper to check if code contains specific keywords
     */
    private containsKeywords(code: string, keywords: string[]): boolean {
        const lowerCode = code.toLowerCase();
        return keywords.some(keyword => lowerCode.includes(keyword.toLowerCase()));
    }

    /**
     * Extract method/function signature from code
     */
    private extractSignature(code: string): string | null {
        // Simple regex to detect function/method signatures
        // This is a simplified version - a real implementation would use AST parsing
        const signatureRegex = /(?:function|class|method|def|async)\s+[\w$]+\s*\([^)]*\)/g;
        const match = code.match(signatureRegex);
        
        if (match && match.length > 0) {
            return match[0];
        }
        
        return null;
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