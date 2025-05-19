// Git Service - Interface with Git repository

import * as vscode from 'vscode';
import { execSync } from 'child_process';
import { Logger } from '../utils/Logger';

export class GitService {
    /**
     * Get uncommitted changes from Git
     */
    public async getUncommittedChanges(): Promise<FileChange[]> {
        try {
            // Use Git API from VS Code if available
            const changes: FileChange[] = [];
            
            if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                const workspaceFolder = vscode.workspace.workspaceFolders[0].uri.fsPath;
                
                // Git status command
                const gitStatusOutput = this.runGitCommand('git status --porcelain', workspaceFolder);
                const lines = gitStatusOutput.split('\n').filter(line => line.trim().length > 0);
                
                for (const line of lines) {
                    const status = line.substring(0, 2).trim();
                    const filePath = line.substring(3).trim();
                    
                    // Skip untracked files
                    if (status === '??') {
                        continue;
                    }
                    
                    // Determine change type
                    let changeType: 'add' | 'modify' | 'delete' = 'modify';
                    if (status.includes('A')) {
                        changeType = 'add';
                    } else if (status.includes('D')) {
                        changeType = 'delete';
                    }
                    
                    changes.push({
                        filePath,
                        changeType
                    });
                }
            }
            
            return changes;
        } catch (error) {
            Logger.error('Error getting uncommitted changes:', error);
            return [];
        }
    }

    /**
     * Get diff details for a file
     */
    public async getDiffDetails(filePath: string): Promise<DiffDetail | null> {
        try {
            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                return null;
            }
            
            const workspaceFolder = vscode.workspace.workspaceFolders[0].uri.fsPath;
            
            // Git diff command
            const gitDiffOutput = this.runGitCommand(`git diff -- "${filePath}"`, workspaceFolder);
            
            return this.parseDiff(gitDiffOutput);
        } catch (error) {
            Logger.error(`Error getting diff details for ${filePath}:`, error);
            return null;
        }
    }

    /**
     * Parse Git diff output
     */
    private parseDiff(diffOutput: string): DiffDetail | null {
        // This is a simplified parser for demonstration
        // A real implementation would use a proper diff parser library
        
        if (!diffOutput || diffOutput.trim().length === 0) {
            return null;
        }
        
        const diffDetail: DiffDetail = {
            hunks: []
        };
        
        // Split diff output into hunks
        const hunkPattern = /@@ -(\d+),(\d+) \+(\d+),(\d+) @@/g;
        let match;
        let currentPosition = 0;
        
        while ((match = hunkPattern.exec(diffOutput)) !== null) {
            const oldStart = parseInt(match[1], 10);
            const oldLines = parseInt(match[2], 10);
            const newStart = parseInt(match[3], 10);
            const newLines = parseInt(match[4], 10);
            
            // Extract hunk content
            const hunkHeaderEnd = match.index + match[0].length;
            const nextHunkStart = hunkPattern.lastIndex;
            
            // Find the end of the current hunk
            let hunkEnd;
            if (nextHunkStart > 0) {
                // Search for the next @@ -x,y +x,y @@ line
                const nextHunkIndex = diffOutput.indexOf('@@ -', hunkHeaderEnd);
                hunkEnd = nextHunkIndex !== -1 ? nextHunkIndex : diffOutput.length;
            } else {
                hunkEnd = diffOutput.length;
            }
            
            const hunkContent = diffOutput.substring(hunkHeaderEnd, hunkEnd);
            
            // Parse lines in the hunk
            const lines: DiffLine[] = [];
            const hunkLines = hunkContent.split('\n').filter(l => l.length > 0);
            
            for (const line of hunkLines) {
                if (line.startsWith('+')) {
                    lines.push({
                        type: 'add',
                        content: line.substring(1)
                    });
                } else if (line.startsWith('-')) {
                    lines.push({
                        type: 'delete',
                        content: line.substring(1)
                    });
                } else if (line.startsWith(' ')) {
                    lines.push({
                        type: 'context',
                        content: line.substring(1)
                    });
                }
            }
            
            // Add the hunk to the diff detail
            diffDetail.hunks.push({
                oldStart,
                oldLines,
                newStart,
                newLines,
                lines
            });
            
            // Move to the next hunk
            currentPosition = hunkEnd;
        }
        
        return diffDetail;
    }

    /**
     * Run a Git command
     */
    private runGitCommand(command: string, cwd: string): string {
        try {
            return execSync(command, { cwd }).toString();
        } catch (error) {
            Logger.error(`Error running Git command: ${command}`, error);
            throw error;
        }
    }
}

export interface FileChange {
    filePath: string;
    changeType: 'add' | 'modify' | 'delete';
}

export interface DiffDetail {
    hunks: DiffHunk[];
}

export interface DiffHunk {
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: DiffLine[];
}

export interface DiffLine {
    type: 'add' | 'delete' | 'context';
    content: string;
}