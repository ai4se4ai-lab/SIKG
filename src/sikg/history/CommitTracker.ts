// CommitTracker.ts - Git commit history analysis for Python projects

import * as vscode from 'vscode';
import { execSync } from 'child_process';
import { Logger } from '../../utils/Logger';
import { CommitInfo, TestResultInfo } from './HistoryAnalyzer';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Tracks and analyzes Git commit history for Python projects
 * Implements commit extraction and analysis for Algorithm 2
 */
export class CommitTracker {
    private workspaceRoot: string = '';
    private commitCache: CommitInfo[] = [];
    private testResultCache: TestResultInfo[] = [];
    private initialized: boolean = false;

    /**
     * Initialize the commit tracker with workspace root
     */
    public async initialize(workspaceRoot: string): Promise<boolean> {
        try {
            this.workspaceRoot = workspaceRoot;
            
            // Check if this is a Git repository
            const gitDir = path.join(workspaceRoot, '.git');
            if (!fs.existsSync(gitDir)) {
                Logger.warn('Not a Git repository - commit tracking disabled');
                return false;
            }

            // Test Git command availability
            try {
                execSync('git --version', { cwd: workspaceRoot, stdio: 'pipe' });
            } catch (error) {
                Logger.warn('Git command not available - commit tracking disabled');
                return false;
            }

            this.initialized = true;
            Logger.info('Commit tracker initialized successfully');
            return true;
        } catch (error) {
            Logger.error('Failed to initialize commit tracker:', error);
            return false;
        }
    }

    /**
     * Extract commits from Git history (Algorithm 2, line 3)
     * Focuses on Python file changes only
     */
    public async extractCommits(maxCommits: number = 200): Promise<CommitInfo[]> {
        if (!this.initialized) {
            return [];
        }

        try {
            // Use cached commits if available and recent
            if (this.commitCache.length > 0) {
                return this.commitCache;
            }

            Logger.info(`Extracting up to ${maxCommits} commits with Python file changes...`);

            // Git log command to get commit information for Python files
            const gitCommand = [
                'git log',
                `--max-count=${maxCommits}`,
                '--pretty=format:"%H|%s|%an|%at"',
                '--name-only',
                '--',
                '*.py'  // Only Python files
            ].join(' ');

            const output = execSync(gitCommand, {
                cwd: this.workspaceRoot,
                encoding: 'utf8',
                maxBuffer: 10 * 1024 * 1024 // 10MB buffer
            });

            const commits = this.parseGitLogOutput(output);
            this.commitCache = commits;

            Logger.info(`Extracted ${commits.length} commits with Python file changes`);
            return commits;

        } catch (error) {
            Logger.error('Error extracting commits:', error);
            return [];
        }
    }

    /**
     * Extract test results from Git history and CI artifacts
     */
    public async extractTestResults(): Promise<TestResultInfo[]> {
        if (!this.initialized) {
            return [];
        }

        try {
            // Use cached results if available
            if (this.testResultCache.length > 0) {
                return this.testResultCache;
            }

            Logger.info('Extracting test results from history...');

            // Look for test result patterns in commit messages
            const commits = await this.extractCommits();
            const testResults: TestResultInfo[] = [];

            for (const commit of commits) {
                // Parse commit messages for test failure patterns
                const parsedResults = this.parseTestResultsFromCommit(commit);
                testResults.push(...parsedResults);
            }

            // Look for pytest/unittest output files in the repository
            const additionalResults = await this.extractTestResultsFromFiles();
            testResults.push(...additionalResults);

            this.testResultCache = testResults;
            Logger.info(`Extracted ${testResults.length} test results`);
            return testResults;

        } catch (error) {
            Logger.error('Error extracting test results:', error);
            return [];
        }
    }

    /**
     * Count changes for a specific node (file/function) in commits
     */
    public countChanges(nodeId: string, commits: CommitInfo[]): number {
        try {
            // Extract file path from node ID (simplified approach)
            const filePath = this.extractFilePathFromNodeId(nodeId);
            if (!filePath) {
                return 0;
            }

            let changeCount = 0;
            for (const commit of commits) {
                if (commit.changedFiles.some(file => file.includes(filePath))) {
                    changeCount++;
                }
            }

            return changeCount;
        } catch (error) {
            Logger.debug('Error counting changes:', error);
            return 0;
        }
    }

    /**
     * Count direct impacts between two nodes
     */
    public countDirectImpacts(sourceId: string, targetId: string, commits: CommitInfo[]): number {
        try {
            const sourceFile = this.extractFilePathFromNodeId(sourceId);
            const targetFile = this.extractFilePathFromNodeId(targetId);

            if (!sourceFile || !targetFile) {
                return 0;
            }

            let impactCount = 0;
            
            // Look for commits where source changed and target changed within a short timeframe
            for (let i = 0; i < commits.length - 1; i++) {
                const commit = commits[i];
                const nextCommit = commits[i + 1];

                // Check if source file changed in this commit
                const sourceChanged = commit.changedFiles.some(file => file.includes(sourceFile));
                
                if (sourceChanged) {
                    // Check if target file changed in the next few commits (within 7 days)
                    const timeDiff = commit.timestamp.getTime() - nextCommit.timestamp.getTime();
                    const withinTimeWindow = timeDiff <= 7 * 24 * 60 * 60 * 1000; // 7 days

                    if (withinTimeWindow) {
                        const targetChanged = nextCommit.changedFiles.some(file => file.includes(targetFile));
                        if (targetChanged) {
                            impactCount++;
                        }
                    }
                }
            }

            return impactCount;
        } catch (error) {
            Logger.debug('Error counting direct impacts:', error);
            return 0;
        }
    }

    /**
     * Get total commit count
     */
    public getCommitCount(): number {
        return this.commitCache.length;
    }

    /**
     * Parse Git log output into CommitInfo objects
     */
    private parseGitLogOutput(output: string): CommitInfo[] {
        const commits: CommitInfo[] = [];
        const lines = output.split('\n');
        
        let currentCommit: Partial<CommitInfo> | null = null;
        
        for (const line of lines) {
            if (line.includes('|')) {
                // Commit info line: hash|message|author|timestamp
                if (currentCommit) {
                    commits.push(currentCommit as CommitInfo);
                }
                
                const parts = line.replace(/"/g, '').split('|');
                if (parts.length >= 4) {
                    currentCommit = {
                        hash: parts[0],
                        message: parts[1],
                        author: parts[2],
                        timestamp: new Date(parseInt(parts[3]) * 1000),
                        changedFiles: []
                    };
                }
            } else if (line.trim() && currentCommit) {
                // File name line
                currentCommit.changedFiles = currentCommit.changedFiles || [];
                currentCommit.changedFiles.push(line.trim());
            }
        }
        
        // Add the last commit
        if (currentCommit) {
            commits.push(currentCommit as CommitInfo);
        }
        
        return commits.filter(commit => 
            commit.changedFiles && commit.changedFiles.length > 0
        );
    }

    /**
     * Parse test results from commit messages
     */
    private parseTestResultsFromCommit(commit: CommitInfo): TestResultInfo[] {
        const results: TestResultInfo[] = [];
        const message = commit.message.toLowerCase();

        // Look for test failure patterns in commit messages
        const failurePatterns = [
            /fix(?:ed)?\s+test/,
            /test(?:s)?\s+fail/,
            /broke(?:n)?\s+test/,
            /failing\s+test/,
            /test\s+error/
        ];

        const hasTestFailure = failurePatterns.some(pattern => pattern.test(message));
        
        if (hasTestFailure) {
            // Create a synthetic test result indicating a failure was fixed
            results.push({
                testId: `commit_${commit.hash.substring(0, 8)}`,
                status: 'failed',
                timestamp: commit.timestamp,
                executionTime: 0,
                commitHash: commit.hash
            });
        }

        return results;
    }

    /**
     * Extract test results from files in the repository
     */
    private async extractTestResultsFromFiles(): Promise<TestResultInfo[]> {
        const results: TestResultInfo[] = [];
        
        try {
            // Look for common test result file patterns
            const testResultPatterns = [
                'test-results.xml',
                'pytest-results.xml',
                '.pytest_cache/',
                'test_results.json'
            ];

            for (const pattern of testResultPatterns) {
                const filePath = path.join(this.workspaceRoot, pattern);
                if (fs.existsSync(filePath)) {
                    // For now, just indicate that test results exist
                    results.push({
                        testId: `file_${pattern}`,
                        status: 'passed',
                        timestamp: new Date(),
                        executionTime: 100
                    });
                }
            }
        } catch (error) {
            Logger.debug('Error extracting test results from files:', error);
        }

        return results;
    }

    /**
     * Extract file path from node ID (simplified)
     */
    private extractFilePathFromNodeId(nodeId: string): string | null {
        try {
            // Node IDs typically contain file information
            // This is a simplified extraction - real implementation would be more sophisticated
            if (nodeId.includes('.py')) {
                const match = nodeId.match(/([^/\\]+\.py)/);
                return match ? match[1] : null;
            }
            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Clean up resources
     */
    public dispose(): void {
        this.commitCache = [];
        this.testResultCache = [];
        this.initialized = false;
    }
}