// CommitProcessor.ts - Process Git commits for evaluation and historical analysis

import { execSync } from 'child_process';
import * as path from 'path';
import { ChangeType } from '../config/ExperimentConfig';
import { Logger } from '../../utils/Logger';

export interface CommitInfo {
    hash: string;
    message: string;
    author: string;
    timestamp: Date;
    changedFiles: string[];
    linesAdded: number;
    linesDeleted: number;
    semanticType: ChangeType;
    isRegression?: boolean;
    affectedTests?: string[];
}

export interface FileChangeInfo {
    filePath: string;
    changeType: 'add' | 'modify' | 'delete' | 'rename';
    linesAdded: number;
    linesDeleted: number;
    hunks: DiffHunk[];
}

export interface DiffHunk {
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    changes: LineChange[];
}

export interface LineChange {
    type: 'add' | 'delete' | 'context';
    content: string;
    lineNumber: number;
}

export interface RegressionCommit extends CommitInfo {
    fixCommit: string;
    bugIntroduced: Date;
    bugFixed: Date;
    impactedTests: string[];
    faultType: 'logic' | 'assertion' | 'null' | 'boundary' | 'exception';
}

export interface CommitAnalysisResult {
    totalCommits: number;
    bySemanticType: Record<ChangeType, number>;
    regressionCommits: RegressionCommit[];
    averageFilesChanged: number;
    averageLinesChanged: number;
    timespan: { start: Date; end: Date };
}

/**
 * Processes Git commits for SIKG evaluation experiments
 * Supports both real repository analysis and synthetic data generation
 */
export class CommitProcessor {
    private repositoryPath: string;
    private isGitRepository: boolean = false;

    constructor(repositoryPath?: string) {
        this.repositoryPath = repositoryPath || process.cwd();
        this.checkGitRepository();
    }

    /**
     * Extract commits from Git repository for historical analysis
     */
    public async extractCommits(
        maxCommits: number = 500,
        since?: Date,
        filePatterns?: string[]
    ): Promise<CommitInfo[]> {
        if (!this.isGitRepository) {
            Logger.warn('Not a Git repository, generating synthetic commits');
            return this.generateSyntheticCommits(maxCommits);
        }

        try {
            Logger.info(`Extracting up to ${maxCommits} commits from ${this.repositoryPath}`);

            // Build Git log command
            const sinceFlag = since ? `--since="${since.toISOString()}"` : '';
            const pathPattern = filePatterns ? filePatterns.join(' ') : '*.py';
            
            const gitCommand = [
                'git log',
                `--max-count=${maxCommits}`,
                '--pretty=format:"%H|%s|%an|%at"',
                '--stat',
                '--name-only',
                sinceFlag,
                '--',
                pathPattern
            ].filter(Boolean).join(' ');

            const output = execSync(gitCommand, {
                cwd: this.repositoryPath,
                encoding: 'utf8',
                maxBuffer: 10 * 1024 * 1024 // 10MB buffer
            });

            const commits = this.parseGitLogOutput(output);
            
            // Enhance commits with semantic analysis
            const enhancedCommits = await this.enhanceCommitsWithSemanticAnalysis(commits);
            
            Logger.info(`Successfully extracted ${enhancedCommits.length} commits`);
            return enhancedCommits;

        } catch (error) {
            Logger.error('Error extracting commits:', error);
            Logger.info('Falling back to synthetic commit generation');
            return this.generateSyntheticCommits(maxCommits);
        }
    }

    /**
     * Identify regression-introducing commits using simplified SZZ algorithm
     */
    public async identifyRegressionCommits(
        commits: CommitInfo[],
        testResultHistory?: Array<{ commit: string; failedTests: string[] }>
    ): Promise<RegressionCommit[]> {
        Logger.info('Identifying regression-introducing commits using SZZ-style analysis');

        const regressionCommits: RegressionCommit[] = [];
        const bugFixCommits = commits.filter(commit => 
            this.isBugFixCommit(commit.message)
        );

        Logger.info(`Found ${bugFixCommits.length} potential bug fix commits`);

        for (const fixCommit of bugFixCommits) {
            try {
                const regressionCommit = await this.findRegressionCommit(fixCommit, commits);
                if (regressionCommit) {
                    regressionCommits.push(regressionCommit);
                }
            } catch (error) {
                Logger.debug(`Error analyzing fix commit ${fixCommit.hash}:`, error);
            }
        }

        Logger.info(`Identified ${regressionCommits.length} regression-introducing commits`);
        return regressionCommits;
    }

    /**
     * Analyze file changes in a specific commit
     */
    public async analyzeCommitChanges(commitHash: string): Promise<FileChangeInfo[]> {
        if (!this.isGitRepository) {
            return this.generateSyntheticFileChanges();
        }

        try {
            // Get detailed diff information
            const diffOutput = execSync(`git show --name-status --format="" ${commitHash}`, {
                cwd: this.repositoryPath,
                encoding: 'utf8'
            });

            const fileChanges: FileChangeInfo[] = [];
            const lines = diffOutput.split('\n').filter(line => line.trim());

            for (const line of lines) {
                const parts = line.split('\t');
                if (parts.length >= 2) {
                    const status = parts[0];
                    const filePath = parts[1];

                    // Skip non-Python files for this evaluation
                    if (!filePath.endsWith('.py')) {
                        continue;
                    }

                    const changeType = this.parseChangeType(status);
                    const diffDetails = await this.getFileDiffDetails(commitHash, filePath);

                    fileChanges.push({
                        filePath,
                        changeType,
                        linesAdded: diffDetails.linesAdded,
                        linesDeleted: diffDetails.linesDeleted,
                        hunks: diffDetails.hunks
                    });
                }
            }

            return fileChanges;

        } catch (error) {
            Logger.debug(`Error analyzing commit ${commitHash}:`, error);
            return this.generateSyntheticFileChanges();
        }
    }

    /**
     * Generate synthetic commits for evaluation when real repository is not available
     */
    public generateSyntheticCommits(count: number = 500): CommitInfo[] {
        Logger.info(`Generating ${count} synthetic commits for evaluation`);

        const commits: CommitInfo[] = [];
        const now = Date.now();
        const authors = ['Alice Dev', 'Bob Coder', 'Charlie Tester', 'Diana Engineer'];
        const changeTypes: ChangeType[] = ['BUG_FIX', 'FEATURE_ADDITION', 'REFACTORING_LOGIC', 'REFACTORING_SIGNATURE', 'DEPENDENCY_UPDATE', 'PERFORMANCE_OPT'];
        
        // Distribution based on empirical studies (roughly matches the paper's statistics)
        const typeDistribution = {
            'BUG_FIX': 0.34,
            'FEATURE_ADDITION': 0.29,
            'REFACTORING_LOGIC': 0.19,
            'REFACTORING_SIGNATURE': 0.11,
            'DEPENDENCY_UPDATE': 0.05,
            'PERFORMANCE_OPT': 0.02
        };

        for (let i = 0; i < count; i++) {
            const timestamp = new Date(now - Math.random() * 365 * 24 * 60 * 60 * 1000); // Last year
            const semanticType = this.selectWeightedChangeType(typeDistribution);
            const author = authors[Math.floor(Math.random() * authors.length)];
            
            const commit: CommitInfo = {
                hash: this.generateCommitHash(),
                message: this.generateCommitMessage(semanticType),
                author,
                timestamp,
                changedFiles: this.generateChangedFiles(semanticType),
                linesAdded: this.generateLinesChanged(semanticType, 'added'),
                linesDeleted: this.generateLinesChanged(semanticType, 'deleted'),
                semanticType,
                isRegression: Math.random() < 0.15 // ~15% are regression-introducing
            };

            commits.push(commit);
        }

        // Sort by timestamp (oldest first)
        commits.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

        return commits;
    }

    /**
     * Analyze commit history to generate statistics for evaluation
     */
    public analyzeCommitHistory(commits: CommitInfo[]): CommitAnalysisResult {
        const bySemanticType: Record<ChangeType, number> = {
            'BUG_FIX': 0,
            'FEATURE_ADDITION': 0,
            'REFACTORING_LOGIC': 0,
            'REFACTORING_SIGNATURE': 0,
            'DEPENDENCY_UPDATE': 0,
            'PERFORMANCE_OPT': 0
        };

        let totalFilesChanged = 0;
        let totalLinesChanged = 0;
        const regressionCommits: RegressionCommit[] = [];

        for (const commit of commits) {
            bySemanticType[commit.semanticType]++;
            totalFilesChanged += commit.changedFiles.length;
            totalLinesChanged += commit.linesAdded + commit.linesDeleted;

            if (commit.isRegression) {
                regressionCommits.push(this.convertToRegressionCommit(commit));
            }
        }

        const timestamps = commits.map(c => c.timestamp.getTime());
        const timespan = {
            start: new Date(Math.min(...timestamps)),
            end: new Date(Math.max(...timestamps))
        };

        return {
            totalCommits: commits.length,
            bySemanticType,
            regressionCommits,
            averageFilesChanged: totalFilesChanged / commits.length,
            averageLinesChanged: totalLinesChanged / commits.length,
            timespan
        };
    }

    /**
     * Check if current directory is a Git repository
     */
    private checkGitRepository(): void {
        try {
            execSync('git rev-parse --git-dir', {
                cwd: this.repositoryPath,
                stdio: 'pipe'
            });
            this.isGitRepository = true;
            Logger.debug(`Found Git repository at: ${this.repositoryPath}`);
        } catch (error) {
            this.isGitRepository = false;
            Logger.debug(`Not a Git repository: ${this.repositoryPath}`);
        }
    }

    /**
     * Parse Git log output into CommitInfo objects
     */
    private parseGitLogOutput(output: string): CommitInfo[] {
        const commits: CommitInfo[] = [];
        const lines = output.split('\n');
        
        let currentCommit: Partial<CommitInfo> | null = null;
        let inFilesList = false;

        for (const line of lines) {
            if (line.includes('|') && !inFilesList) {
                // Commit header line: hash|message|author|timestamp
                if (currentCommit && currentCommit.hash) {
                    commits.push(this.finalizeCommit(currentCommit));
                }

                const parts = line.replace(/"/g, '').split('|');
                if (parts.length >= 4) {
                    currentCommit = {
                        hash: parts[0],
                        message: parts[1],
                        author: parts[2],
                        timestamp: new Date(parseInt(parts[3]) * 1000),
                        changedFiles: [],
                        linesAdded: 0,
                        linesDeleted: 0
                    };
                }
            } else if (line.trim() && currentCommit) {
                // File path or stats line
                if (line.includes('insertion') || line.includes('deletion')) {
                    // Stats line: "5 files changed, 12 insertions(+), 3 deletions(-)"
                    const insertionMatch = line.match(/(\d+) insertion/);
                    const deletionMatch = line.match(/(\d+) deletion/);
                    
                    currentCommit.linesAdded = insertionMatch ? parseInt(insertionMatch[1]) : 0;
                    currentCommit.linesDeleted = deletionMatch ? parseInt(deletionMatch[1]) : 0;
                    inFilesList = true;
                } else if (inFilesList && line.trim().endsWith('.py')) {
                    // File path
                    currentCommit.changedFiles = currentCommit.changedFiles || [];
                    currentCommit.changedFiles.push(line.trim());
                }
            } else if (line.trim() === '') {
                inFilesList = false;
            }
        }

        // Add the last commit
        if (currentCommit && currentCommit.hash) {
            commits.push(this.finalizeCommit(currentCommit));
        }

        return commits.filter(commit => commit.changedFiles.length > 0);
    }

    /**
     * Finalize commit object with semantic analysis
     */
    private finalizeCommit(partialCommit: Partial<CommitInfo>): CommitInfo {
        const commit = partialCommit as CommitInfo;
        commit.semanticType = this.classifyCommitMessage(commit.message);
        commit.isRegression = this.estimateRegressionProbability(commit);
        return commit;
    }

    /**
     * Enhance commits with detailed semantic analysis
     */
    private async enhanceCommitsWithSemanticAnalysis(commits: CommitInfo[]): Promise<CommitInfo[]> {
        for (const commit of commits) {
            try {
                // Analyze affected tests (simplified)
                commit.affectedTests = await this.identifyAffectedTests(commit);
            } catch (error) {
                Logger.debug(`Error enhancing commit ${commit.hash}:`, error);
                commit.affectedTests = [];
            }
        }
        return commits;
    }

    /**
     * Classify commit message to determine semantic change type
     */
    private classifyCommitMessage(message: string): ChangeType {
        const lowerMessage = message.toLowerCase();

        // Bug fix patterns
        if (this.matchesPatterns(lowerMessage, [
            'fix', 'bug', 'issue', 'problem', 'error', 'crash', 'exception',
            'resolve', 'repair', 'correct', 'patch'
        ])) {
            return 'BUG_FIX';
        }

        // Feature addition patterns
        if (this.matchesPatterns(lowerMessage, [
            'add', 'implement', 'feature', 'new', 'introduce', 'create',
            'support', 'enable', 'enhance'
        ])) {
            return 'FEATURE_ADDITION';
        }

        // Signature refactoring patterns
        if (this.matchesPatterns(lowerMessage, [
            'rename', 'signature', 'parameter', 'api', 'interface',
            'method signature', 'change signature'
        ])) {
            return 'REFACTORING_SIGNATURE';
        }

        // Dependency update patterns
        if (this.matchesPatterns(lowerMessage, [
            'update', 'upgrade', 'dependency', 'version', 'requirements',
            'pip', 'package', 'library'
        ])) {
            return 'DEPENDENCY_UPDATE';
        }

        // Performance optimization patterns
        if (this.matchesPatterns(lowerMessage, [
            'performance', 'optimize', 'speed', 'fast', 'efficient',
            'improve performance', 'optimization'
        ])) {
            return 'PERFORMANCE_OPT';
        }

        // Default to logic refactoring
        return 'REFACTORING_LOGIC';
    }

    /**
     * Check if message matches any of the given patterns
     */
    private matchesPatterns(message: string, patterns: string[]): boolean {
        return patterns.some(pattern => message.includes(pattern));
    }

    /**
     * Estimate if commit is likely to introduce a regression
     */
    private estimateRegressionProbability(commit: CommitInfo): boolean {
        // Higher probability for certain types of changes
        const regressionProbabilities = {
            'BUG_FIX': 0.2,           // Bug fixes can introduce new bugs
            'FEATURE_ADDITION': 0.15,  // New features are risky
            'REFACTORING_SIGNATURE': 0.25, // API changes are very risky
            'REFACTORING_LOGIC': 0.1,  // Logic changes have some risk
            'DEPENDENCY_UPDATE': 0.1,  // Dependency updates can break things
            'PERFORMANCE_OPT': 0.05   // Performance optimizations usually safe
        };

        const probability = regressionProbabilities[commit.semanticType];
        return Math.random() < probability;
    }

    /**
     * Identify affected tests for a commit (simplified analysis)
     */
    private async identifyAffectedTests(commit: CommitInfo): Promise<string[]> {
        const affectedTests: string[] = [];

        for (const filePath of commit.changedFiles) {
            // Simple heuristic: test files that might be affected
            const moduleName = path.basename(filePath, '.py');
            
            // Direct test file
            affectedTests.push(`test_${moduleName}.py`);
            
            // Integration tests
            if (moduleName.includes('api') || moduleName.includes('service')) {
                affectedTests.push(`test_integration_${moduleName}.py`);
            }
        }

        return affectedTests;
    }

    /**
     * Check if commit message indicates a bug fix
     */
    private isBugFixCommit(message: string): boolean {
        const lowerMessage = message.toLowerCase();
        return this.matchesPatterns(lowerMessage, [
            'fix', 'bug', 'issue', 'problem', 'error', 'resolve'
        ]);
    }

    /**
     * Find regression-introducing commit for a bug fix (simplified SZZ)
     */
    private async findRegressionCommit(fixCommit: CommitInfo, allCommits: CommitInfo[]): Promise<RegressionCommit | null> {
        // Simplified SZZ: find commits that modified the same files before the fix
        const candidateCommits = allCommits.filter(commit => 
            commit.timestamp < fixCommit.timestamp &&
            commit.changedFiles.some(file => fixCommit.changedFiles.includes(file))
        );

        if (candidateCommits.length === 0) {
            return null;
        }

        // Take the most recent candidate (simplified approach)
        const regressionCommit = candidateCommits
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];

        return this.convertToRegressionCommit(regressionCommit, fixCommit);
    }

    /**
     * Convert CommitInfo to RegressionCommit
     */
    private convertToRegressionCommit(commit: CommitInfo, fixCommit?: CommitInfo): RegressionCommit {
        return {
            ...commit,
            fixCommit: fixCommit?.hash || 'unknown',
            bugIntroduced: commit.timestamp,
            bugFixed: fixCommit?.timestamp || new Date(),
            impactedTests: commit.affectedTests || [],
            faultType: this.inferFaultType(commit.semanticType)
        };
    }

    /**
     * Infer fault type from semantic change type
     */
    private inferFaultType(semanticType: ChangeType): RegressionCommit['faultType'] {
        const faultTypeMap: Record<ChangeType, RegressionCommit['faultType']> = {
            'BUG_FIX': 'logic',
            'FEATURE_ADDITION': 'assertion',
            'REFACTORING_SIGNATURE': 'assertion',
            'REFACTORING_LOGIC': 'logic',
            'DEPENDENCY_UPDATE': 'exception',
            'PERFORMANCE_OPT': 'boundary'
        };

        return faultTypeMap[semanticType];
    }

    /**
     * Parse Git change type from status flag
     */
    private parseChangeType(status: string): FileChangeInfo['changeType'] {
        switch (status[0]) {
            case 'A': return 'add';
            case 'M': return 'modify';
            case 'D': return 'delete';
            case 'R': return 'rename';
            default: return 'modify';
        }
    }

    /**
     * Get detailed diff information for a file
     */
    private async getFileDiffDetails(commitHash: string, filePath: string): Promise<{
        linesAdded: number;
        linesDeleted: number;
        hunks: DiffHunk[];
    }> {
        try {
            const diffOutput = execSync(`git show ${commitHash} -- "${filePath}"`, {
                cwd: this.repositoryPath,
                encoding: 'utf8'
            });

            return this.parseDiffOutput(diffOutput);
        } catch (error) {
            return { linesAdded: 0, linesDeleted: 0, hunks: [] };
        }
    }

    /**
     * Parse Git diff output
     */
    private parseDiffOutput(diffOutput: string): {
        linesAdded: number;
        linesDeleted: number;
        hunks: DiffHunk[];
    } {
        const lines = diffOutput.split('\n');
        let linesAdded = 0;
        let linesDeleted = 0;
        const hunks: DiffHunk[] = [];

        let currentHunk: DiffHunk | null = null;

        for (const line of lines) {
            // Hunk header: @@ -1,4 +1,6 @@
            const hunkMatch = line.match(/^@@ -(\d+),(\d+) \+(\d+),(\d+) @@/);
            if (hunkMatch) {
                if (currentHunk) {
                    hunks.push(currentHunk);
                }

                currentHunk = {
                    oldStart: parseInt(hunkMatch[1]),
                    oldLines: parseInt(hunkMatch[2]),
                    newStart: parseInt(hunkMatch[3]),
                    newLines: parseInt(hunkMatch[4]),
                    changes: []
                };
                continue;
            }

            if (currentHunk && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))) {
                const type = line.startsWith('+') ? 'add' : line.startsWith('-') ? 'delete' : 'context';
                const content = line.substring(1);

                if (type === 'add') linesAdded++;
                if (type === 'delete') linesDeleted++;

                currentHunk.changes.push({
                    type,
                    content,
                    lineNumber: type === 'add' ? currentHunk.newStart + currentHunk.changes.length :
                               currentHunk.oldStart + currentHunk.changes.length
                });
            }
        }

        if (currentHunk) {
            hunks.push(currentHunk);
        }

        return { linesAdded, linesDeleted, hunks };
    }

    /**
     * Generate synthetic file changes for evaluation
     */
    private generateSyntheticFileChanges(): FileChangeInfo[] {
        const fileCount = Math.floor(Math.random() * 5) + 1; // 1-5 files
        const changes: FileChangeInfo[] = [];

        for (let i = 0; i < fileCount; i++) {
            const filePath = `module${i + 1}.py`;
            const changeType = Math.random() < 0.1 ? 'add' : 
                             Math.random() < 0.05 ? 'delete' : 'modify';
            
            changes.push({
                filePath,
                changeType,
                linesAdded: Math.floor(Math.random() * 20) + 1,
                linesDeleted: Math.floor(Math.random() * 10),
                hunks: [] // Simplified for synthetic data
            });
        }

        return changes;
    }

    /**
     * Select change type based on weighted distribution
     */
    private selectWeightedChangeType(distribution: Record<ChangeType, number>): ChangeType {
        const random = Math.random();
        let cumulative = 0;

        for (const [type, weight] of Object.entries(distribution)) {
            cumulative += weight;
            if (random <= cumulative) {
                return type as ChangeType;
            }
        }

        return 'REFACTORING_LOGIC'; // Fallback
    }

    /**
     * Generate realistic commit message based on change type
     */
    private generateCommitMessage(type: ChangeType): string {
        const templates = {
            'BUG_FIX': [
                'Fix null pointer exception in user validation',
                'Resolve issue with database connection timeout',
                'Fix error in data processing pipeline',
                'Correct logic bug in authentication module'
            ],
            'FEATURE_ADDITION': [
                'Add user notification system',
                'Implement new data export functionality',
                'Add support for OAuth2 authentication',
                'Introduce caching mechanism for API calls'
            ],
            'REFACTORING_LOGIC': [
                'Refactor data processing logic',
                'Simplify error handling in core module',
                'Clean up utility functions',
                'Improve code organization in service layer'
            ],
            'REFACTORING_SIGNATURE': [
                'Change method signature for better usability',
                'Rename parameters for clarity',
                'Update API interface to match requirements',
                'Modify function signature to support new features'
            ],
            'DEPENDENCY_UPDATE': [
                'Update requests library to latest version',
                'Upgrade Python dependencies',
                'Update requirements.txt with security patches',
                'Bump library versions for compatibility'
            ],
            'PERFORMANCE_OPT': [
                'Optimize database query performance',
                'Improve algorithm efficiency',
                'Reduce memory usage in data processing',
                'Optimize API response times'
            ]
        };

        const messages = templates[type];
        return messages[Math.floor(Math.random() * messages.length)];
    }

    /**
     * Generate changed files based on change type
     */
    private generateChangedFiles(type: ChangeType): string[] {
        const fileCount = type === 'DEPENDENCY_UPDATE' ? 1 : Math.floor(Math.random() * 3) + 1;
        const files: string[] = [];

        const fileTemplates = {
            'BUG_FIX': ['utils.py', 'models.py', 'services.py'],
            'FEATURE_ADDITION': ['api.py', 'handlers.py', 'models.py', 'views.py'],
            'REFACTORING_LOGIC': ['core.py', 'utils.py', 'helpers.py'],
            'REFACTORING_SIGNATURE': ['interfaces.py', 'api.py', 'services.py'],
            'DEPENDENCY_UPDATE': ['requirements.txt', 'setup.py'],
            'PERFORMANCE_OPT': ['algorithms.py', 'database.py', 'cache.py']
        };

        const candidates = fileTemplates[type];
        for (let i = 0; i < fileCount; i++) {
            const file = candidates[Math.floor(Math.random() * candidates.length)];
            if (!files.includes(file)) {
                files.push(file);
            }
        }

        return files;
    }

    /**
     * Generate realistic lines changed based on change type
     */
    private generateLinesChanged(type: ChangeType, changeType: 'added' | 'deleted'): number {
        const ranges = {
            'BUG_FIX': { added: [1, 8], deleted: [1, 5] },
            'FEATURE_ADDITION': { added: [10, 100], deleted: [0, 20] },
            'REFACTORING_LOGIC': { added: [5, 30], deleted: [5, 25] },
            'REFACTORING_SIGNATURE': { added: [2, 15], deleted: [2, 10] },
            'DEPENDENCY_UPDATE': { added: [1, 3], deleted: [1, 3] },
            'PERFORMANCE_OPT': { added: [3, 25], deleted: [5, 20] }
        };

        const [min, max] = ranges[type][changeType];
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    /**
     * Generate random commit hash
     */
    private generateCommitHash(): string {
        return Array.from({ length: 40 }, () => 
            Math.floor(Math.random() * 16).toString(16)
        ).join('');
    }

    /**
     * Get repository information
     */
    public getRepositoryInfo(): {
        path: string;
        isGitRepository: boolean;
        currentBranch?: string;
        totalCommits?: number;
    } {
        const info = {
            path: this.repositoryPath,
            isGitRepository: this.isGitRepository
        };

        if (this.isGitRepository) {
            try {
                const branch = execSync('git rev-parse --abbrev-ref HEAD', {
                    cwd: this.repositoryPath,
                    encoding: 'utf8'
                }).trim();

                const commitCount = parseInt(execSync('git rev-list --count HEAD', {
                    cwd: this.repositoryPath,
                    encoding: 'utf8'
                }).trim());

                return { ...info, currentBranch: branch, totalCommits: commitCount };
            } catch (error) {
                Logger.debug('Error getting repository info:', error);
            }
        }

        return info;
    }
}