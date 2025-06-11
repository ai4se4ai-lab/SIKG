// CommitProcessor.ts - Git commit analysis for SIKG experimental evaluation

import * as fs from 'fs';
import * as path from 'path';
import { execSync, spawn } from 'child_process';
import { Logger } from '../../utils/Logger';
import { SemanticChangeInfo } from '../../sikg/GraphTypes';

/**
 * Commit information for experimental analysis
 */
export interface ExperimentCommit {
    hash: string;
    shortHash: string;
    message: string;
    author: string;
    date: Date;
    timestamp: number;
    changedFiles: ChangedFile[];
    addedLines: number;
    deletedLines: number;
    modifiedFiles: number;
    isTestCommit: boolean;
    isBugFix: boolean;
    semanticChanges: SemanticChangeInfo[];
    testResults?: CommitTestResults;
}

/**
 * Changed file information
 */
export interface ChangedFile {
    filePath: string;
    status: 'added' | 'modified' | 'deleted' | 'renamed';
    language: string;
    isTestFile: boolean;
    linesAdded: number;
    linesDeleted: number;
    complexity?: number;
}

/**
 * Test results for a commit (if available)
 */
export interface CommitTestResults {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    skippedTests: number;
    executionTime: number;
    failedTestNames: string[];
    coverage?: number;
}

/**
 * Commit filtering criteria
 */
export interface CommitFilter {
    startDate?: Date;
    endDate?: Date;
    maxCommits?: number;
    includeTestCommits?: boolean;
    includeBugFixes?: boolean;
    minChangedFiles?: number;
    maxChangedFiles?: number;
    languages?: string[];
    excludeAuthors?: string[];
    includeMergeCommits?: boolean;
}

/**
 * Commit analysis statistics
 */
export interface CommitAnalysisStats {
    totalCommits: number;
    processedCommits: number;
    testCommits: number;
    bugFixCommits: number;
    averageFilesChanged: number;
    averageLinesChanged: number;
    languageDistribution: Record<string, number>;
    authorDistribution: Record<string, number>;
    timeRange: {
        earliest: Date;
        latest: Date;
        spanDays: number;
    };
}

/**
 * Git commit processor for SIKG experimental evaluation
 */
export class CommitProcessor {
    private projectPath: string;
    private gitAvailable: boolean = false;
    private commitCache: Map<string, ExperimentCommit> = new Map();
    private analysisStats: CommitAnalysisStats | null = null;

    constructor(projectPath: string) {
        this.projectPath = path.resolve(projectPath);
        this.checkGitAvailability();
    }

    /**
     * Check if Git is available and the project is a Git repository
     */
    private checkGitAvailability(): void {
        try {
            // Check if git command is available
            execSync('git --version', { stdio: 'pipe' });
            
            // Check if the project directory has a .git folder
            const gitPath = path.join(this.projectPath, '.git');
            this.gitAvailable = fs.existsSync(gitPath);
            
            if (!this.gitAvailable) {
                Logger.warn(`Project at ${this.projectPath} is not a Git repository`);
            }
        } catch (error) {
            Logger.warn('Git command not available for commit processing');
            this.gitAvailable = false;
        }
    }

    /**
     * Process commits for experimental evaluation
     */
    public async processCommits(filter?: CommitFilter): Promise<ExperimentCommit[]> {
        if (!this.gitAvailable) {
            Logger.error('Git not available for commit processing');
            return [];
        }

        try {
            Logger.info(`Processing commits for experimental evaluation: ${this.projectPath}`);
            
            // Get commit list based on filter
            const commitHashes = await this.getCommitList(filter);
            Logger.info(`Found ${commitHashes.length} commits to process`);
            
            // Process commits in batches to avoid memory issues
            const commits: ExperimentCommit[] = [];
            const batchSize = 50;
            
            for (let i = 0; i < commitHashes.length; i += batchSize) {
                const batch = commitHashes.slice(i, i + batchSize);
                const batchCommits = await this.processBatch(batch, filter);
                commits.push(...batchCommits);
                
                Logger.debug(`Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(commitHashes.length / batchSize)}`);
                
                // Allow event loop to process other tasks
                await this.delay(10);
            }
            
            // Sort commits chronologically (oldest first for temporal analysis)
            commits.sort((a, b) => a.timestamp - b.timestamp);
            
            // Calculate analysis statistics
            this.analysisStats = this.calculateAnalysisStats(commits);
            
            Logger.info(`Processed ${commits.length} commits for experimental evaluation`);
            return commits;
            
        } catch (error) {
            Logger.error('Error processing commits:', error);
            return [];
        }
    }

    /**
     * Get commit list based on filter criteria
     */
    private async getCommitList(filter?: CommitFilter): Promise<string[]> {
        const gitCommand = this.buildGitLogCommand(filter);
        
        try {
            const output = execSync(gitCommand, {
                cwd: this.projectPath,
                encoding: 'utf8',
                maxBuffer: 50 * 1024 * 1024 // 50MB buffer
            });
            
            return output.trim().split('\n').filter(hash => hash.length > 0);
        } catch (error) {
            Logger.error('Error getting commit list:', error);
            return [];
        }
    }

    /**
     * Build Git log command based on filter criteria
     */
    private buildGitLogCommand(filter?: CommitFilter): string {
        let command = 'git log --format=%H';
        
        // Add date range if specified
        if (filter?.startDate) {
            command += ` --since="${filter.startDate.toISOString()}"`;
        }
        if (filter?.endDate) {
            command += ` --until="${filter.endDate.toISOString()}"`;
        }
        
        // Limit number of commits
        if (filter?.maxCommits) {
            command += ` -n ${filter.maxCommits}`;
        }
        
        // Exclude merge commits unless specifically included
        if (!filter?.includeMergeCommits) {
            command += ' --no-merges';
        }
        
        // Filter by file patterns if languages specified
        if (filter?.languages && filter.languages.length > 0) {
            const patterns = filter.languages.map(lang => `*.${lang}`).join(' ');
            command += ` -- ${patterns}`;
        }
        
        return command;
    }

    /**
     * Process a batch of commits
     */
    private async processBatch(commitHashes: string[], filter?: CommitFilter): Promise<ExperimentCommit[]> {
        const commits: ExperimentCommit[] = [];
        
        for (const hash of commitHashes) {
            try {
                // Check cache first
                if (this.commitCache.has(hash)) {
                    const cachedCommit = this.commitCache.get(hash)!;
                    if (this.matchesFilter(cachedCommit, filter)) {
                        commits.push(cachedCommit);
                    }
                    continue;
                }
                
                const commit = await this.processCommit(hash);
                if (commit && this.matchesFilter(commit, filter)) {
                    this.commitCache.set(hash, commit);
                    commits.push(commit);
                }
            } catch (error) {
                Logger.warn(`Error processing commit ${hash}:`, error);
            }
        }
        
        return commits;
    }

    /**
     * Process a single commit
     */
    private async processCommit(hash: string): Promise<ExperimentCommit | null> {
        try {
            // Get commit metadata
            const metadataCommand = `git show --format="%H|%h|%s|%an|%at" --name-status ${hash}`;
            const metadataOutput = execSync(metadataCommand, {
                cwd: this.projectPath,
                encoding: 'utf8'
            });
            
            // Get commit statistics
            const statsCommand = `git show --format="" --numstat ${hash}`;
            const statsOutput = execSync(statsCommand, {
                cwd: this.projectPath,
                encoding: 'utf8'
            });
            
            // Parse commit information
            const lines = metadataOutput.trim().split('\n');
            const metadataLine = lines[0];
            const [fullHash, shortHash, message, author, timestampStr] = metadataLine.split('|');
            
            const timestamp = parseInt(timestampStr) * 1000;
            const date = new Date(timestamp);
            
            // Parse changed files
            const changedFiles = this.parseChangedFiles(lines.slice(1), statsOutput);
            
            // Calculate aggregate statistics
            const addedLines = changedFiles.reduce((sum, file) => sum + file.linesAdded, 0);
            const deletedLines = changedFiles.reduce((sum, file) => sum + file.linesDeleted, 0);
            const modifiedFiles = changedFiles.length;
            
            // Classify commit type
            const isTestCommit = this.isTestCommit(changedFiles, message);
            const isBugFix = this.isBugFixCommit(message);
            
            // Extract semantic changes (simplified for experimental evaluation)
            const semanticChanges = await this.extractSemanticChanges(hash, changedFiles, message);
            
            const commit: ExperimentCommit = {
                hash: fullHash,
                shortHash,
                message,
                author,
                date,
                timestamp,
                changedFiles,
                addedLines,
                deletedLines,
                modifiedFiles,
                isTestCommit,
                isBugFix,
                semanticChanges
            };
            
            return commit;
            
        } catch (error) {
            Logger.warn(`Error processing commit details for ${hash}:`, error);
            return null;
        }
    }

    /**
     * Parse changed files from Git output
     */
    private parseChangedFiles(nameStatusLines: string[], numstatOutput: string): ChangedFile[] {
        const changedFiles: ChangedFile[] = [];
        const numstatLines = numstatOutput.trim().split('\n').filter(line => line.length > 0);
        
        // Create a map of file paths to line changes
        const lineChanges = new Map<string, { added: number; deleted: number }>();
        for (const line of numstatLines) {
            const parts = line.split('\t');
            if (parts.length >= 3) {
                const added = parts[0] === '-' ? 0 : parseInt(parts[0]) || 0;
                const deleted = parts[1] === '-' ? 0 : parseInt(parts[1]) || 0;
                const filePath = parts[2];
                lineChanges.set(filePath, { added, deleted });
            }
        }
        
        // Process name-status output
        for (const line of nameStatusLines) {
            if (line.length === 0) continue;
            
            const parts = line.split('\t');
            if (parts.length < 2) continue;
            
            const status = parts[0];
            const filePath = parts[1];
            
            // Map Git status to our status
            let fileStatus: ChangedFile['status'];
            if (status.startsWith('A')) fileStatus = 'added';
            else if (status.startsWith('D')) fileStatus = 'deleted';
            else if (status.startsWith('R')) fileStatus = 'renamed';
            else fileStatus = 'modified';
            
            // Get line changes
            const lines = lineChanges.get(filePath) || { added: 0, deleted: 0 };
            
            // Determine file properties
            const language = this.getFileLanguage(filePath);
            const isTestFile = this.isTestFile(filePath);
            
            changedFiles.push({
                filePath,
                status: fileStatus,
                language,
                isTestFile,
                linesAdded: lines.added,
                linesDeleted: lines.deleted
            });
        }
        
        return changedFiles;
    }

    /**
     * Extract semantic changes from commit (simplified for experiments)
     */
    private async extractSemanticChanges(
        hash: string,
        changedFiles: ChangedFile[],
        message: string
    ): Promise<SemanticChangeInfo[]> {
        const semanticChanges: SemanticChangeInfo[] = [];
        
        // Simplified semantic change classification based on heuristics
        // In a full implementation, this would use proper AST analysis
        
        for (const file of changedFiles) {
            if (file.language === 'python' && !file.isTestFile) {
                let semanticType: SemanticChangeInfo['semanticType'] = 'UNKNOWN';
                
                // Classify based on commit message and file changes
                const lowerMessage = message.toLowerCase();
                
                if (this.containsKeywords(lowerMessage, ['fix', 'bug', 'issue', 'error', 'crash'])) {
                    semanticType = 'BUG_FIX';
                } else if (this.containsKeywords(lowerMessage, ['add', 'implement', 'feature', 'new'])) {
                    semanticType = 'FEATURE_ADDITION';
                } else if (this.containsKeywords(lowerMessage, ['refactor', 'clean', 'restructure'])) {
                    semanticType = 'REFACTORING_LOGIC';
                } else if (this.containsKeywords(lowerMessage, ['update', 'upgrade', 'dependency', 'version'])) {
                    semanticType = 'DEPENDENCY_UPDATE';
                } else if (this.containsKeywords(lowerMessage, ['performance', 'optimize', 'speed', 'efficient'])) {
                    semanticType = 'PERFORMANCE_OPT';
                }
                
                // Calculate initial impact based on change size
                const changeSize = file.linesAdded + file.linesDeleted;
                const initialImpactScore = Math.min(1.0, changeSize / 100); // Normalize to 0-1
                
                semanticChanges.push({
                    nodeId: `${file.filePath}_${hash.substring(0, 8)}`,
                    semanticType,
                    changeDetails: {
                        linesChanged: changeSize,
                        oldCodeHash: '',
                        newCodeHash: hash,
                        filePath: file.filePath,
                        commitHash: hash
                    },
                    initialImpactScore
                });
            }
        }
        
        return semanticChanges;
    }

    /**
     * Check if keywords are present in text
     */
    private containsKeywords(text: string, keywords: string[]): boolean {
        return keywords.some(keyword => text.includes(keyword));
    }

    /**
     * Determine file language from extension
     */
    private getFileLanguage(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();
        const languageMap: Record<string, string> = {
            '.py': 'python',
            '.js': 'javascript',
            '.ts': 'typescript',
            '.java': 'java',
            '.cpp': 'cpp',
            '.c': 'c',
            '.cs': 'csharp',
            '.go': 'go',
            '.rb': 'ruby',
            '.php': 'php'
        };
        
        return languageMap[ext] || 'unknown';
    }

    /**
     * Check if file is a test file
     */
    private isTestFile(filePath: string): boolean {
        const fileName = path.basename(filePath).toLowerCase();
        const dirName = path.dirname(filePath).toLowerCase();
        
        return (
            fileName.includes('test') ||
            fileName.includes('spec') ||
            dirName.includes('test') ||
            dirName.includes('spec') ||
            fileName.startsWith('test_') ||
            fileName.endsWith('_test.py')
        );
    }

    /**
     * Check if commit primarily involves test files
     */
    private isTestCommit(changedFiles: ChangedFile[], message: string): boolean {
        const testFiles = changedFiles.filter(file => file.isTestFile);
        const testFileRatio = testFiles.length / Math.max(1, changedFiles.length);
        
        const messageIndicatesTest = this.containsKeywords(
            message.toLowerCase(),
            ['test', 'spec', 'unit test', 'integration test']
        );
        
        return testFileRatio > 0.5 || messageIndicatesTest;
    }

    /**
     * Check if commit is a bug fix
     */
    private isBugFixCommit(message: string): boolean {
        return this.containsKeywords(
            message.toLowerCase(),
            ['fix', 'bug', 'issue', 'error', 'crash', 'problem', 'resolve']
        );
    }

    /**
     * Check if commit matches filter criteria
     */
    private matchesFilter(commit: ExperimentCommit, filter?: CommitFilter): boolean {
        if (!filter) return true;
        
        // Test commit filter
        if (filter.includeTestCommits === false && commit.isTestCommit) {
            return false;
        }
        
        // Bug fix filter
        if (filter.includeBugFixes === false && commit.isBugFix) {
            return false;
        }
        
        // File count filters
        if (filter.minChangedFiles && commit.modifiedFiles < filter.minChangedFiles) {
            return false;
        }
        if (filter.maxChangedFiles && commit.modifiedFiles > filter.maxChangedFiles) {
            return false;
        }
        
        // Language filter
        if (filter.languages && filter.languages.length > 0) {
            const hasMatchingLanguage = commit.changedFiles.some(file =>
                filter.languages!.includes(file.language)
            );
            if (!hasMatchingLanguage) {
                return false;
            }
        }
        
        // Author filter
        if (filter.excludeAuthors && filter.excludeAuthors.includes(commit.author)) {
            return false;
        }
        
        return true;
    }

    /**
     * Calculate analysis statistics
     */
    private calculateAnalysisStats(commits: ExperimentCommit[]): CommitAnalysisStats {
        if (commits.length === 0) {
            return {
                totalCommits: 0,
                processedCommits: 0,
                testCommits: 0,
                bugFixCommits: 0,
                averageFilesChanged: 0,
                averageLinesChanged: 0,
                languageDistribution: {},
                authorDistribution: {},
                timeRange: {
                    earliest: new Date(),
                    latest: new Date(),
                    spanDays: 0
                }
            };
        }
        
        const testCommits = commits.filter(c => c.isTestCommit).length;
        const bugFixCommits = commits.filter(c => c.isBugFix).length;
        
        const totalFiles = commits.reduce((sum, c) => sum + c.modifiedFiles, 0);
        const totalLines = commits.reduce((sum, c) => sum + c.addedLines + c.deletedLines, 0);
        
        const averageFilesChanged = totalFiles / commits.length;
        const averageLinesChanged = totalLines / commits.length;
        
        // Language distribution
        const languageDistribution: Record<string, number> = {};
        commits.forEach(commit => {
            commit.changedFiles.forEach(file => {
                languageDistribution[file.language] = (languageDistribution[file.language] || 0) + 1;
            });
        });
        
        // Author distribution
        const authorDistribution: Record<string, number> = {};
        commits.forEach(commit => {
            authorDistribution[commit.author] = (authorDistribution[commit.author] || 0) + 1;
        });
        
        // Time range
        const earliest = new Date(Math.min(...commits.map(c => c.timestamp)));
        const latest = new Date(Math.max(...commits.map(c => c.timestamp)));
        const spanDays = (latest.getTime() - earliest.getTime()) / (1000 * 60 * 60 * 24);
        
        return {
            totalCommits: commits.length,
            processedCommits: commits.length,
            testCommits,
            bugFixCommits,
            averageFilesChanged,
            averageLinesChanged,
            languageDistribution,
            authorDistribution,
            timeRange: {
                earliest,
                latest,
                spanDays
            }
        };
    }

    /**
     * Get commit by hash
     */
    public getCommit(hash: string): ExperimentCommit | null {
        return this.commitCache.get(hash) || null;
    }

    /**
     * Get analysis statistics
     */
    public getAnalysisStats(): CommitAnalysisStats | null {
        return this.analysisStats;
    }

    /**
     * Filter commits for specific experiment scenarios
     */
    public filterCommitsForScenario(
        commits: ExperimentCommit[],
        scenario: 'bug-introducing' | 'feature-adding' | 'refactoring' | 'mixed'
    ): ExperimentCommit[] {
        switch (scenario) {
            case 'bug-introducing':
                return commits.filter(c => c.isBugFix);
            
            case 'feature-adding':
                return commits.filter(c => 
                    c.semanticChanges.some(sc => sc.semanticType === 'FEATURE_ADDITION')
                );
            
            case 'refactoring':
                return commits.filter(c =>
                    c.semanticChanges.some(sc => 
                        sc.semanticType === 'REFACTORING_LOGIC' || 
                        sc.semanticType === 'REFACTORING_SIGNATURE'
                    )
                );
            
            case 'mixed':
            default:
                return commits;
        }
    }

    /**
     * Get commits in temporal order for time-series analysis
     */
    public getTemporalCommits(commits: ExperimentCommit[]): ExperimentCommit[] {
        return [...commits].sort((a, b) => a.timestamp - b.timestamp);
    }

    /**
     * Split commits into training and evaluation sets
     */
    public splitCommitsForEvaluation(
        commits: ExperimentCommit[],
        trainRatio: number = 0.7
    ): { training: ExperimentCommit[]; evaluation: ExperimentCommit[] } {
        const sortedCommits = this.getTemporalCommits(commits);
        const splitIndex = Math.floor(sortedCommits.length * trainRatio);
        
        return {
            training: sortedCommits.slice(0, splitIndex),
            evaluation: sortedCommits.slice(splitIndex)
        };
    }

    /**
     * Export commits to CSV for external analysis
     */
    public exportToCSV(commits: ExperimentCommit[]): string {
        const headers = [
            'hash', 'shortHash', 'message', 'author', 'date', 'changedFiles',
            'addedLines', 'deletedLines', 'isTestCommit', 'isBugFix',
            'semanticChangeTypes', 'languages'
        ];
        
        const rows = commits.map(commit => [
            commit.hash,
            commit.shortHash,
            `"${commit.message.replace(/"/g, '""')}"`, // Escape quotes
            commit.author,
            commit.date.toISOString(),
            commit.modifiedFiles,
            commit.addedLines,
            commit.deletedLines,
            commit.isTestCommit,
            commit.isBugFix,
            commit.semanticChanges.map(sc => sc.semanticType).join(';'),
            [...new Set(commit.changedFiles.map(f => f.language))].join(';')
        ]);
        
        return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    }

    /**
     * Utility delay function
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Clear cache to free memory
     */
    public clearCache(): void {
        this.commitCache.clear();
        this.analysisStats = null;
        Logger.debug('Commit processor cache cleared');
    }

    /**
     * Get cache statistics
     */
    public getCacheStats(): { cachedCommits: number; memoryUsage: string } {
        const memoryUsage = process.memoryUsage();
        return {
            cachedCommits: this.commitCache.size,
            memoryUsage: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`
        };
    }
}