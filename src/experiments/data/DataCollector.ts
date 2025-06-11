// src/experiments/data/DataCollector.ts - Comprehensive data collection for SIKG experiments

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { SubjectProject } from '../config/ExperimentConfig';
import { TestResult, SemanticChangeInfo } from '../../sikg/GraphTypes';
import { Logger } from '../../utils/Logger';

export interface CommitData {
    hash: string;
    message: string;
    author: string;
    timestamp: Date;
    changedFiles: string[];
    addedLines: number;
    deletedLines: number;
    testFiles: string[];
    codeFiles: string[];
}

export interface ProjectMetrics {
    totalLines: number;
    totalFiles: number;
    pythonFiles: number;
    testFiles: number;
    testCoverage: number;
    complexity: number;
    dependencies: string[];
    testFramework: string;
}

export interface TestExecutionData {
    testId: string;
    executionTime: number;
    status: 'passed' | 'failed' | 'skipped';
    output: string;
    errorMessage?: string;
    coverage?: number;
    memoryUsage?: number;
}

export interface ChangeAnalysisData {
    commitHash: string;
    semanticChanges: SemanticChangeInfo[];
    impactedTests: string[];
    changeComplexity: number;
    riskScore: number;
}

export interface ExperimentSession {
    sessionId: string;
    startTime: Date;
    endTime?: Date;
    subject: SubjectProject;
    commits: CommitData[];
    projectMetrics: ProjectMetrics;
    testExecutions: TestExecutionData[];
    changeAnalyses: ChangeAnalysisData[];
}

/**
 * Comprehensive data collector for SIKG experiments
 */
export class DataCollector {
    private currentSession: ExperimentSession | null = null;
    private outputDirectory: string;

    constructor(outputDirectory: string = './src/experiments/output/data') {
        this.outputDirectory = outputDirectory;
        this.ensureOutputDirectory();
    }

    /**
     * Start a new data collection session
     */
    public startSession(subject: SubjectProject): string {
        const sessionId = `session_${subject.name}_${Date.now()}`;
        
        this.currentSession = {
            sessionId,
            startTime: new Date(),
            subject,
            commits: [],
            projectMetrics: this.collectProjectMetrics(subject),
            testExecutions: [],
            changeAnalyses: []
        };

        Logger.info(`📊 Started data collection session: ${sessionId}`);
        return sessionId;
    }

    /**
     * End the current session and save data
     */
    public endSession(): ExperimentSession | null {
        if (!this.currentSession) {
            Logger.warn('No active session to end');
            return null;
        }

        this.currentSession.endTime = new Date();
        
        // Save session data
        this.saveSessionData(this.currentSession);
        
        const session = this.currentSession;
        this.currentSession = null;
        
        Logger.info(`📊 Ended data collection session: ${session.sessionId}`);
        return session;
    }

    /**
     * Collect comprehensive project metrics
     */
    public collectProjectMetrics(subject: SubjectProject): ProjectMetrics {
        try {
            const projectPath = subject.localPath;
            
            // Count lines of code
            const totalLines = this.countLinesOfCode(projectPath);
            
            // Count files
            const allFiles = this.findAllFiles(projectPath);
            const pythonFiles = allFiles.filter(f => f.endsWith('.py')).length;
            const testFiles = this.findTestFiles(projectPath).length;
            
            // Analyze dependencies
            const dependencies = this.extractDependencies(projectPath);
            
            // Calculate complexity metrics
            const complexity = this.calculateComplexity(projectPath);
            
            // Estimate test coverage (simplified)
            const testCoverage = this.estimateTestCoverage(projectPath, testFiles, pythonFiles);

            return {
                totalLines,
                totalFiles: allFiles.length,
                pythonFiles,
                testFiles,
                testCoverage,
                complexity,
                dependencies,
                testFramework: subject.testFramework
            };

        } catch (error) {
            Logger.error('Error collecting project metrics:', error);
            return {
                totalLines: 0,
                totalFiles: 0,
                pythonFiles: 0,
                testFiles: 0,
                testCoverage: 0,
                complexity: 0,
                dependencies: [],
                testFramework: subject.testFramework
            };
        }
    }

    /**
     * Collect commit data for a range of commits
     */
    public async collectCommitData(
        subject: SubjectProject,
        commitHashes: string[]
    ): Promise<CommitData[]> {
        const commits: CommitData[] = [];

        for (const hash of commitHashes) {
            try {
                const commitData = await this.analyzeCommit(subject, hash);
                commits.push(commitData);
                
                // Add to current session if active
                if (this.currentSession) {
                    this.currentSession.commits.push(commitData);
                }
            } catch (error) {
                Logger.error(`Error analyzing commit ${hash}:`, error);
            }
        }

        return commits;
    }

    /**
     * Collect test execution data
     */
    public collectTestExecutionData(testResults: TestResult[]): TestExecutionData[] {
        const executions: TestExecutionData[] = [];

        for (const result of testResults) {
            const execution: TestExecutionData = {
                testId: result.testId,
                executionTime: result.executionTime,
                status: result.status,
                output: result.errorMessage || '',
                errorMessage: result.status === 'failed' ? result.errorMessage : undefined,
                coverage: undefined, // Would be filled if coverage data available
                memoryUsage: undefined // Would be filled if profiling data available
            };

            executions.push(execution);
            
            // Add to current session
            if (this.currentSession) {
                this.currentSession.testExecutions.push(execution);
            }
        }

        return executions;
    }

    /**
     * Collect change analysis data
     */
    public collectChangeAnalysisData(
        commitHash: string,
        semanticChanges: SemanticChangeInfo[],
        impactedTests: string[]
    ): ChangeAnalysisData {
        const changeComplexity = this.calculateChangeComplexity(semanticChanges);
        const riskScore = this.calculateRiskScore(semanticChanges);

        const analysisData: ChangeAnalysisData = {
            commitHash,
            semanticChanges,
            impactedTests,
            changeComplexity,
            riskScore
        };

        // Add to current session
        if (this.currentSession) {
            this.currentSession.changeAnalyses.push(analysisData);
        }

        return analysisData;
    }

    /**
     * Analyze a single commit
     */
    private async analyzeCommit(subject: SubjectProject, commitHash: string): Promise<CommitData> {
        const projectPath = subject.localPath;

        try {
            // Get commit info
            const commitInfo = execSync(
                `git show --pretty=format:"%H|%s|%an|%at" --name-only ${commitHash}`,
                { cwd: projectPath, encoding: 'utf8' }
            );

            const lines = commitInfo.trim().split('\n');
            const [hash, message, author, timestamp] = lines[0].split('|');
            const changedFiles = lines.slice(1).filter(line => line.length > 0);

            // Get diff stats
            const diffStats = execSync(
                `git show --numstat ${commitHash}`,
                { cwd: projectPath, encoding: 'utf8' }
            );

            let addedLines = 0;
            let deletedLines = 0;

            diffStats.split('\n').forEach(line => {
                const parts = line.split('\t');
                if (parts.length >= 2) {
                    const added = parseInt(parts[0]) || 0;
                    const deleted = parseInt(parts[1]) || 0;
                    addedLines += added;
                    deletedLines += deleted;
                }
            });

            // Categorize files
            const testFiles = changedFiles.filter(f => this.isTestFile(f));
            const codeFiles = changedFiles.filter(f => f.endsWith('.py') && !this.isTestFile(f));

            return {
                hash,
                message,
                author,
                timestamp: new Date(parseInt(timestamp) * 1000),
                changedFiles,
                addedLines,
                deletedLines,
                testFiles,
                codeFiles
            };

        } catch (error) {
            Logger.error(`Error analyzing commit ${commitHash}:`, error);
            throw error;
        }
    }

    /**
     * Count lines of code in project
     */
    private countLinesOfCode(projectPath: string): number {
        try {
            const result = execSync(
                `find . -name "*.py" -type f -exec wc -l {} + | tail -1`,
                { cwd: projectPath, encoding: 'utf8' }
            );
            
            const match = result.match(/(\d+)\s+total/);
            return match ? parseInt(match[1]) : 0;
        } catch (error) {
            Logger.debug('Error counting lines of code:', error);
            return 0;
        }
    }

    /**
     * Find all files in project
     */
    private findAllFiles(projectPath: string): string[] {
        try {
            const result = execSync(
                `find . -type f -name "*.py"`,
                { cwd: projectPath, encoding: 'utf8' }
            );
            
            return result.trim().split('\n').filter(line => line.length > 0);
        } catch (error) {
            Logger.debug('Error finding files:', error);
            return [];
        }
    }

    /**
     * Find test files in project
     */
    private findTestFiles(projectPath: string): string[] {
        try {
            const result = execSync(
                `find . -name "*test*.py" -o -name "test_*.py" -o -name "*_test.py"`,
                { cwd: projectPath, encoding: 'utf8' }
            );
            
            return result.trim().split('\n').filter(line => line.length > 0);
        } catch (error) {
            Logger.debug('Error finding test files:', error);
            return [];
        }
    }

    /**
     * Extract project dependencies
     */
    private extractDependencies(projectPath: string): string[] {
        const dependencies: string[] = [];

        try {
            // Check requirements.txt
            const reqPath = path.join(projectPath, 'requirements.txt');
            if (fs.existsSync(reqPath)) {
                const content = fs.readFileSync(reqPath, 'utf8');
                const deps = content.split('\n')
                    .filter(line => line.trim() && !line.startsWith('#'))
                    .map(line => line.split('==')[0].split('>=')[0].split('<=')[0].trim());
                dependencies.push(...deps);
            }

            // Check setup.py
            const setupPath = path.join(projectPath, 'setup.py');
            if (fs.existsSync(setupPath)) {
                const content = fs.readFileSync(setupPath, 'utf8');
                const installRequires = content.match(/install_requires\s*=\s*\[(.*?)\]/s);
                if (installRequires) {
                    const deps = installRequires[1]
                        .split(',')
                        .map(dep => dep.replace(/['"]/g, '').trim())
                        .filter(dep => dep.length > 0);
                    dependencies.push(...deps);
                }
            }

            // Check pyproject.toml
            const pyprojectPath = path.join(projectPath, 'pyproject.toml');
            if (fs.existsSync(pyprojectPath)) {
                const content = fs.readFileSync(pyprojectPath, 'utf8');
                const depMatch = content.match(/dependencies\s*=\s*\[(.*?)\]/s);
                if (depMatch) {
                    const deps = depMatch[1]
                        .split(',')
                        .map(dep => dep.replace(/['"]/g, '').trim())
                        .filter(dep => dep.length > 0);
                    dependencies.push(...deps);
                }
            }

        } catch (error) {
            Logger.debug('Error extracting dependencies:', error);
        }

        return [...new Set(dependencies)]; // Remove duplicates
    }

    /**
     * Calculate project complexity (simplified cyclomatic complexity)
     */
    private calculateComplexity(projectPath: string): number {
        try {
            const pythonFiles = this.findAllFiles(projectPath);
            let totalComplexity = 0;

            for (const file of pythonFiles.slice(0, 10)) { // Sample first 10 files
                const filePath = path.join(projectPath, file);
                if (fs.existsSync(filePath)) {
                    const content = fs.readFileSync(filePath, 'utf8');
                    const complexity = this.calculateFileComplexity(content);
                    totalComplexity += complexity;
                }
            }

            return totalComplexity / Math.min(pythonFiles.length, 10);
        } catch (error) {
            Logger.debug('Error calculating complexity:', error);
            return 0;
        }
    }

    /**
     * Calculate complexity for a single file
     */
    private calculateFileComplexity(content: string): number {
        // Simplified cyclomatic complexity calculation
        const complexityKeywords = [
            'if', 'elif', 'else', 'for', 'while', 'try', 'except', 'finally',
            'with', 'and', 'or', 'lambda', 'assert'
        ];

        let complexity = 1; // Base complexity

        for (const keyword of complexityKeywords) {
            const regex = new RegExp(`\\b${keyword}\\b`, 'g');
            const matches = content.match(regex);
            if (matches) {
                complexity += matches.length;
            }
        }

        return complexity;
    }

    /**
     * Estimate test coverage (simplified)
     */
    private estimateTestCoverage(projectPath: string, testFileCount: number, codeFileCount: number): number {
        if (codeFileCount === 0) return 0;
        
        // Simple heuristic: ratio of test files to code files
        const ratio = testFileCount / codeFileCount;
        
        // Convert to coverage estimate (0-1)
        return Math.min(1, ratio * 0.8); // Assume good test files cover 80% when ratio is 1:1
    }

    /**
     * Calculate change complexity
     */
    private calculateChangeComplexity(semanticChanges: SemanticChangeInfo[]): number {
        if (semanticChanges.length === 0) return 0;

        const complexityWeights = {
            'BUG_FIX': 0.8,
            'FEATURE_ADDITION': 0.9,
            'REFACTORING_SIGNATURE': 1.0,
            'REFACTORING_LOGIC': 0.6,
            'DEPENDENCY_UPDATE': 0.7,
            'PERFORMANCE_OPT': 0.5,
            'UNKNOWN': 0.7
        };

        let totalComplexity = 0;
        for (const change of semanticChanges) {
            const weight = complexityWeights[change.semanticType] || 0.7;
            const linesChanged = change.changeDetails.linesChanged || 1;
            totalComplexity += weight * Math.log(linesChanged + 1);
        }

        return totalComplexity / semanticChanges.length;
    }

    /**
     * Calculate risk score for changes
     */
    private calculateRiskScore(semanticChanges: SemanticChangeInfo[]): number {
        if (semanticChanges.length === 0) return 0;

        const riskWeights = {
            'BUG_FIX': 0.9,           // High risk - bugs often introduce new bugs
            'FEATURE_ADDITION': 0.8,   // High risk - new code is untested
            'REFACTORING_SIGNATURE': 0.9, // High risk - API changes affect many places
            'REFACTORING_LOGIC': 0.6,  // Medium risk - internal changes
            'DEPENDENCY_UPDATE': 0.7,  // Medium-high risk - external dependencies
            'PERFORMANCE_OPT': 0.4,    // Low risk - shouldn't change behavior
            'UNKNOWN': 0.8            // High risk - unknown changes
        };

        let totalRisk = 0;
        for (const change of semanticChanges) {
            const weight = riskWeights[change.semanticType] || 0.8;
            totalRisk += weight * change.initialImpactScore;
        }

        return totalRisk / semanticChanges.length;
    }

    /**
     * Check if a file is a test file
     */
    private isTestFile(filePath: string): boolean {
        const fileName = path.basename(filePath).toLowerCase();
        return fileName.includes('test') || 
               fileName.startsWith('test_') || 
               fileName.endsWith('_test.py');
    }

    /**
     * Save session data to file
     */
    private saveSessionData(session: ExperimentSession): void {
        try {
            const fileName = `${session.sessionId}.json`;
            const filePath = path.join(this.outputDirectory, fileName);
            
            fs.writeFileSync(filePath, JSON.stringify(session, null, 2));
            Logger.info(`💾 Session data saved: ${filePath}`);
        } catch (error) {
            Logger.error('Error saving session data:', error);
        }
    }

    /**
     * Ensure output directory exists
     */
    private ensureOutputDirectory(): void {
        if (!fs.existsSync(this.outputDirectory)) {
            fs.mkdirSync(this.outputDirectory, { recursive: true });
        }
    }

    /**
     * Load session data from file
     */
    public loadSessionData(sessionId: string): ExperimentSession | null {
        try {
            const filePath = path.join(this.outputDirectory, `${sessionId}.json`);
            
            if (!fs.existsSync(filePath)) {
                Logger.warn(`Session data not found: ${sessionId}`);
                return null;
            }
            
            const content = fs.readFileSync(filePath, 'utf8');
            const session = JSON.parse(content);
            
            // Convert date strings back to Date objects
            session.startTime = new Date(session.startTime);
            if (session.endTime) {
                session.endTime = new Date(session.endTime);
            }
            
            session.commits.forEach((commit: CommitData) => {
                commit.timestamp = new Date(commit.timestamp);
            });
            
            return session;
        } catch (error) {
            Logger.error(`Error loading session data for ${sessionId}:`, error);
            return null;
        }
    }

    /**
     * Get summary statistics for collected data
     */
    public getDataSummary(session: ExperimentSession): {
        projectStats: any;
        commitStats: any;
        testStats: any;
        changeStats: any;
    } {
        return {
            projectStats: {
                totalLines: session.projectMetrics.totalLines,
                pythonFiles: session.projectMetrics.pythonFiles,
                testFiles: session.projectMetrics.testFiles,
                testCoverage: session.projectMetrics.testCoverage,
                complexity: session.projectMetrics.complexity,
                dependencies: session.projectMetrics.dependencies.length
            },
            commitStats: {
                totalCommits: session.commits.length,
                averageFilesChanged: session.commits.reduce((sum, c) => sum + c.changedFiles.length, 0) / session.commits.length,
                averageLinesAdded: session.commits.reduce((sum, c) => sum + c.addedLines, 0) / session.commits.length,
                averageLinesDeleted: session.commits.reduce((sum, c) => sum + c.deletedLines, 0) / session.commits.length
            },
            testStats: {
                totalExecutions: session.testExecutions.length,
                passedTests: session.testExecutions.filter(t => t.status === 'passed').length,
                failedTests: session.testExecutions.filter(t => t.status === 'failed').length,
                skippedTests: session.testExecutions.filter(t => t.status === 'skipped').length,
                averageExecutionTime: session.testExecutions.reduce((sum, t) => sum + t.executionTime, 0) / session.testExecutions.length
            },
            changeStats: {
                totalAnalyses: session.changeAnalyses.length,
                averageComplexity: session.changeAnalyses.reduce((sum, c) => sum + c.changeComplexity, 0) / session.changeAnalyses.length,
                averageRiskScore: session.changeAnalyses.reduce((sum, c) => sum + c.riskScore, 0) / session.changeAnalyses.length,
                averageImpactedTests: session.changeAnalyses.reduce((sum, c) => sum + c.impactedTests.length, 0) / session.changeAnalyses.length
            }
        };
    }

    /**
     * Export data to CSV format
     */
    public exportToCSV(session: ExperimentSession, outputPath: string): void {
        try {
            // Export commits data
            const commitsCsv = this.generateCommitsCSV(session.commits);
            fs.writeFileSync(path.join(outputPath, 'commits.csv'), commitsCsv);
            
            // Export test executions data
            const testsCsv = this.generateTestExecutionsCSV(session.testExecutions);
            fs.writeFileSync(path.join(outputPath, 'test_executions.csv'), testsCsv);
            
            // Export change analyses data
            const changesCsv = this.generateChangeAnalysesCSV(session.changeAnalyses);
            fs.writeFileSync(path.join(outputPath, 'change_analyses.csv'), changesCsv);
            
            Logger.info(`📊 Data exported to CSV files in ${outputPath}`);
        } catch (error) {
            Logger.error('Error exporting to CSV:', error);
        }
    }

    /**
     * Generate CSV for commits data
     */
    private generateCommitsCSV(commits: CommitData[]): string {
        const headers = ['hash', 'message', 'author', 'timestamp', 'changedFiles', 'addedLines', 'deletedLines', 'testFiles', 'codeFiles'];
        const rows = [headers.join(',')];
        
        for (const commit of commits) {
            const row = [
                commit.hash,
                `"${commit.message.replace(/"/g, '""')}"`,
                commit.author,
                commit.timestamp.toISOString(),
                commit.changedFiles.length,
                commit.addedLines,
                commit.deletedLines,
                commit.testFiles.length,
                commit.codeFiles.length
            ].join(',');
            rows.push(row);
        }
        
        return rows.join('\n');
    }

    /**
     * Generate CSV for test executions data
     */
    private generateTestExecutionsCSV(executions: TestExecutionData[]): string {
        const headers = ['testId', 'executionTime', 'status', 'hasError'];
        const rows = [headers.join(',')];
        
        for (const execution of executions) {
            const row = [
                execution.testId,
                execution.executionTime,
                execution.status,
                execution.errorMessage ? 'true' : 'false'
            ].join(',');
            rows.push(row);
        }
        
        return rows.join('\n');
    }

    /**
     * Generate CSV for change analyses data
     */
    private generateChangeAnalysesCSV(analyses: ChangeAnalysisData[]): string {
        const headers = ['commitHash', 'semanticChangesCount', 'impactedTestsCount', 'changeComplexity', 'riskScore'];
        const rows = [headers.join(',')];
        
        for (const analysis of analyses) {
            const row = [
                analysis.commitHash,
                analysis.semanticChanges.length,
                analysis.impactedTests.length,
                analysis.changeComplexity.toFixed(4),
                analysis.riskScore.toFixed(4)
            ].join(',');
            rows.push(row);
        }
        
        return rows.join('\n');
    }
}