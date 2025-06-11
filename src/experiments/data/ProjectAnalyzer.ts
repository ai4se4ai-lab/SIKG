// src/experiments/data/ProjectAnalyzer.ts - Analyze project characteristics for experiments

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { Logger } from '../../utils/Logger';
import { SubjectProject } from '../config/ExperimentConfig';

export interface ProjectCharacteristics {
    project: SubjectProject;
    codeMetrics: CodeMetrics;
    testMetrics: TestMetrics;
    gitMetrics: GitMetrics;
    complexityMetrics: ComplexityMetrics;
    dependencyMetrics: DependencyMetrics;
    qualityMetrics: QualityMetrics;
}

export interface CodeMetrics {
    totalFiles: number;
    pythonFiles: number;
    linesOfCode: number;
    linesOfComments: number;
    blankLines: number;
    averageFileSize: number;
    largestFile: { name: string; lines: number };
    fileDistribution: Record<string, number>; // By directory
}

export interface TestMetrics {
    totalTestFiles: number;
    totalTestCases: number;
    testFrameworks: string[];
    testTypes: {
        unit: number;
        integration: number;
        e2e: number;
        unknown: number;
    };
    testCoverage: {
        linesCovered: number;
        totalLines: number;
        percentage: number;
    };
    averageTestsPerFile: number;
    testFileDistribution: Record<string, number>;
}

export interface GitMetrics {
    totalCommits: number;
    commitsLastYear: number;
    commitsLastMonth: number;
    contributors: number;
    activeContributors: number; // Last 6 months
    averageCommitsPerMonth: number;
    commitFrequency: 'high' | 'medium' | 'low';
    mostActiveFiles: Array<{ file: string; changes: number }>;
    commitTypes: Record<string, number>; // Based on conventional commits
}

export interface ComplexityMetrics {
    cyclomaticComplexity: {
        average: number;
        maximum: number;
        distribution: Record<string, number>; // low, medium, high, very-high
    };
    nestingDepth: {
        average: number;
        maximum: number;
    };
    functionMetrics: {
        totalFunctions: number;
        averageLength: number;
        averageParameters: number;
        longestFunction: { name: string; lines: number };
    };
    classMetrics: {
        totalClasses: number;
        averageMethods: number;
        averageAttributes: number;
        largestClass: { name: string; methods: number };
    };
}

export interface DependencyMetrics {
    externalDependencies: number;
    internalDependencies: number;
    dependencyDepth: number;
    circularDependencies: number;
    dependencyTypes: Record<string, number>; // dev, prod, test
    topDependencies: Array<{ name: string; usage: number }>;
    outdatedDependencies: number;
}

export interface QualityMetrics {
    codeSmells: {
        longMethods: number;
        largeClasses: number;
        duplicatedCode: number;
        complexConditions: number;
    };
    maintainabilityIndex: number; // 0-100
    technicalDebt: {
        estimated: string; // time estimate
        severity: 'low' | 'medium' | 'high';
        issues: number;
    };
    testQuality: {
        assertionDensity: number;
        testSmells: number;
        flakyTests: number;
    };
}

/**
 * Comprehensive project analyzer for experiment subject characterization
 */
export class ProjectAnalyzer {
    private projectPath: string;
    private characteristics: Partial<ProjectCharacteristics> = {};

    constructor(projectPath: string) {
        this.projectPath = projectPath;
    }

    /**
     * Analyze complete project characteristics
     */
    public async analyzeProject(project: SubjectProject): Promise<ProjectCharacteristics> {
        Logger.info(`Analyzing project characteristics: ${project.name}`);

        try {
            // Change to project directory
            const originalCwd = process.cwd();
            process.chdir(this.projectPath);

            const characteristics: ProjectCharacteristics = {
                project,
                codeMetrics: await this.analyzeCodeMetrics(),
                testMetrics: await this.analyzeTestMetrics(),
                gitMetrics: await this.analyzeGitMetrics(),
                complexityMetrics: await this.analyzeComplexityMetrics(),
                dependencyMetrics: await this.analyzeDependencyMetrics(),
                qualityMetrics: await this.analyzeQualityMetrics()
            };

            // Restore original directory
            process.chdir(originalCwd);

            Logger.info(`Project analysis completed for ${project.name}`);
            return characteristics;

        } catch (error) {
            Logger.error(`Failed to analyze project ${project.name}:`, error);
            throw error;
        }
    }

    /**
     * Analyze code structure and metrics
     */
    private async analyzeCodeMetrics(): Promise<CodeMetrics> {
        const pythonFiles = await this.findPythonFiles();
        let totalLines = 0;
        let totalComments = 0;
        let totalBlank = 0;
        let largestFile = { name: '', lines: 0 };
        const fileDistribution: Record<string, number> = {};

        for (const file of pythonFiles) {
            try {
                const content = fs.readFileSync(file, 'utf8');
                const lines = content.split('\n');
                const codeLines = lines.filter(line => line.trim() && !line.trim().startsWith('#')).length;
                const commentLines = lines.filter(line => line.trim().startsWith('#')).length;
                const blankLines = lines.filter(line => !line.trim()).length;

                totalLines += codeLines;
                totalComments += commentLines;
                totalBlank += blankLines;

                if (codeLines > largestFile.lines) {
                    largestFile = { name: file, lines: codeLines };
                }

                // Distribution by directory
                const dir = path.dirname(file);
                fileDistribution[dir] = (fileDistribution[dir] || 0) + 1;

            } catch (error) {
                Logger.debug(`Error analyzing file ${file}:`, error);
            }
        }

        return {
            totalFiles: await this.countAllFiles(),
            pythonFiles: pythonFiles.length,
            linesOfCode: totalLines,
            linesOfComments: totalComments,
            blankLines: totalBlank,
            averageFileSize: pythonFiles.length > 0 ? totalLines / pythonFiles.length : 0,
            largestFile,
            fileDistribution
        };
    }

    /**
     * Analyze test characteristics
     */
    private async analyzeTestMetrics(): Promise<TestMetrics> {
        const testFiles = await this.findTestFiles();
        let totalTestCases = 0;
        const testFrameworks = new Set<string>();
        const testTypes = { unit: 0, integration: 0, e2e: 0, unknown: 0 };
        const testFileDistribution: Record<string, number> = {};

        for (const file of testFiles) {
            try {
                const content = fs.readFileSync(file, 'utf8');
                
                // Detect test framework
                if (content.includes('import pytest') || content.includes('from pytest')) {
                    testFrameworks.add('pytest');
                } else if (content.includes('import unittest') || content.includes('from unittest')) {
                    testFrameworks.add('unittest');
                }

                // Count test cases
                const testFunctions = content.match(/def test_\w+/g) || [];
                const testMethods = content.match(/def test\w+\(/g) || [];
                const fileCases = testFunctions.length + testMethods.length;
                totalTestCases += fileCases;

                // Classify test types
                if (content.toLowerCase().includes('integration') || file.includes('integration')) {
                    testTypes.integration += fileCases;
                } else if (content.toLowerCase().includes('e2e') || content.toLowerCase().includes('end to end')) {
                    testTypes.e2e += fileCases;
                } else if (fileCases > 0) {
                    testTypes.unit += fileCases;
                } else {
                    testTypes.unknown += fileCases;
                }

                // Distribution by directory
                const dir = path.dirname(file);
                testFileDistribution[dir] = (testFileDistribution[dir] || 0) + 1;

            } catch (error) {
                Logger.debug(`Error analyzing test file ${file}:`, error);
            }
        }

        // Simple coverage estimation (would use actual coverage tool in production)
        const estimatedCoverage = this.estimateTestCoverage(testFiles.length, totalTestCases);

        return {
            totalTestFiles: testFiles.length,
            totalTestCases,
            testFrameworks: Array.from(testFrameworks),
            testTypes,
            testCoverage: estimatedCoverage,
            averageTestsPerFile: testFiles.length > 0 ? totalTestCases / testFiles.length : 0,
            testFileDistribution
        };
    }

    /**
     * Analyze Git repository metrics
     */
    private async analyzeGitMetrics(): Promise<GitMetrics> {
        try {
            // Total commits
            const totalCommits = parseInt(
                execSync('git rev-list --count HEAD', { encoding: 'utf8' }).trim()
            );

            // Recent commits
            const commitsLastYear = parseInt(
                execSync('git rev-list --count --since="1 year ago" HEAD', { encoding: 'utf8' }).trim()
            );

            const commitsLastMonth = parseInt(
                execSync('git rev-list --count --since="1 month ago" HEAD', { encoding: 'utf8' }).trim()
            );

            // Contributors
            const allContributors = execSync('git log --format="%an" | sort | uniq', { encoding: 'utf8' })
                .trim().split('\n').filter(name => name.length > 0);

            const activeContributors = execSync(
                'git log --since="6 months ago" --format="%an" | sort | uniq',
                { encoding: 'utf8' }
            ).trim().split('\n').filter(name => name.length > 0);

            // Most active files
            const fileChanges = execSync(
                'git log --name-only --pretty=format: | grep -E "\\.py$" | sort | uniq -c | sort -rn | head -10',
                { encoding: 'utf8' }
            ).trim().split('\n');

            const mostActiveFiles = fileChanges
                .filter(line => line.trim().length > 0)
                .map(line => {
                    const parts = line.trim().split(/\s+/);
                    const changes = parseInt(parts[0]);
                    const file = parts.slice(1).join(' ');
                    return { file, changes };
                })
                .slice(0, 5);

            // Commit frequency classification
            const averageCommitsPerMonth = commitsLastYear / 12;
            let commitFrequency: 'high' | 'medium' | 'low';
            if (averageCommitsPerMonth > 50) commitFrequency = 'high';
            else if (averageCommitsPerMonth > 10) commitFrequency = 'medium';
            else commitFrequency = 'low';

            // Analyze commit types (simplified)
            const commitTypes = await this.analyzeCommitTypes();

            return {
                totalCommits,
                commitsLastYear,
                commitsLastMonth,
                contributors: allContributors.length,
                activeContributors: activeContributors.length,
                averageCommitsPerMonth,
                commitFrequency,
                mostActiveFiles,
                commitTypes
            };

        } catch (error) {
            Logger.debug('Error analyzing Git metrics:', error);
            return this.getDefaultGitMetrics();
        }
    }

    /**
     * Analyze code complexity metrics
     */
    private async analyzeComplexityMetrics(): Promise<ComplexityMetrics> {
        const pythonFiles = await this.findPythonFiles();
        let totalFunctions = 0;
        let totalLines = 0;
        let totalClasses = 0;
        let totalMethods = 0;
        let maxComplexity = 0;
        let maxNesting = 0;
        let longestFunction = { name: '', lines: 0 };
        let largestClass = { name: '', methods: 0 };
        const complexityDistribution = { low: 0, medium: 0, high: 0, 'very-high': 0 };

        for (const file of pythonFiles) {
            try {
                const content = fs.readFileSync(file, 'utf8');
                const analysis = this.analyzeFileComplexity(content, file);
                
                totalFunctions += analysis.functions.length;
                totalClasses += analysis.classes.length;
                
                for (const func of analysis.functions) {
                    totalLines += func.lines;
                    if (func.lines > longestFunction.lines) {
                        longestFunction = { name: func.name, lines: func.lines };
                    }
                    
                    maxComplexity = Math.max(maxComplexity, func.complexity);
                    maxNesting = Math.max(maxNesting, func.nesting);
                    
                    // Classify complexity
                    if (func.complexity <= 5) complexityDistribution.low++;
                    else if (func.complexity <= 10) complexityDistribution.medium++;
                    else if (func.complexity <= 20) complexityDistribution.high++;
                    else complexityDistribution['very-high']++;
                }

                for (const cls of analysis.classes) {
                    totalMethods += cls.methods;
                    if (cls.methods > largestClass.methods) {
                        largestClass = { name: cls.name, methods: cls.methods };
                    }
                }

            } catch (error) {
                Logger.debug(`Error analyzing complexity for ${file}:`, error);
            }
        }

        return {
            cyclomaticComplexity: {
                average: totalFunctions > 0 ? maxComplexity / totalFunctions : 0,
                maximum: maxComplexity,
                distribution: complexityDistribution
            },
            nestingDepth: {
                average: totalFunctions > 0 ? maxNesting / totalFunctions : 0,
                maximum: maxNesting
            },
            functionMetrics: {
                totalFunctions,
                averageLength: totalFunctions > 0 ? totalLines / totalFunctions : 0,
                averageParameters: 2.5, // Simplified estimate
                longestFunction
            },
            classMetrics: {
                totalClasses,
                averageMethods: totalClasses > 0 ? totalMethods / totalClasses : 0,
                averageAttributes: 3.0, // Simplified estimate
                largestClass
            }
        };
    }

    /**
     * Analyze dependency metrics
     */
    private async analyzeDependencyMetrics(): Promise<DependencyMetrics> {
        const dependencies = await this.extractDependencies();
        
        return {
            externalDependencies: dependencies.external.length,
            internalDependencies: dependencies.internal.length,
            dependencyDepth: dependencies.maxDepth,
            circularDependencies: dependencies.circular,
            dependencyTypes: dependencies.types,
            topDependencies: dependencies.top,
            outdatedDependencies: dependencies.outdated
        };
    }

    /**
     * Analyze code quality metrics
     */
    private async analyzeQualityMetrics(): Promise<QualityMetrics> {
        const pythonFiles = await this.findPythonFiles();
        let longMethods = 0;
        let largeClasses = 0;
        let complexConditions = 0;
        let totalMaintainability = 0;

        for (const file of pythonFiles) {
            try {
                const content = fs.readFileSync(file, 'utf8');
                const quality = this.analyzeFileQuality(content);
                
                longMethods += quality.longMethods;
                largeClasses += quality.largeClasses;
                complexConditions += quality.complexConditions;
                totalMaintainability += quality.maintainabilityIndex;

            } catch (error) {
                Logger.debug(`Error analyzing quality for ${file}:`, error);
            }
        }

        const avgMaintainability = pythonFiles.length > 0 ? totalMaintainability / pythonFiles.length : 50;
        
        return {
            codeSmells: {
                longMethods,
                largeClasses,
                duplicatedCode: 0, // Would need sophisticated analysis
                complexConditions
            },
            maintainabilityIndex: avgMaintainability,
            technicalDebt: {
                estimated: this.estimateTechnicalDebt(longMethods + largeClasses + complexConditions),
                severity: avgMaintainability > 70 ? 'low' : avgMaintainability > 50 ? 'medium' : 'high',
                issues: longMethods + largeClasses + complexConditions
            },
            testQuality: {
                assertionDensity: 0.7, // Simplified estimate
                testSmells: 0,
                flakyTests: 0
            }
        };
    }

    // Helper methods
    private async findPythonFiles(): Promise<string[]> {
        try {
            const output = execSync('find . -name "*.py" -type f', { encoding: 'utf8' });
            return output.trim().split('\n')
                .filter(file => file.length > 0)
                .filter(file => !file.includes('__pycache__'))
                .filter(file => !file.includes('.pyc'));
        } catch (error) {
            return [];
        }
    }

    private async findTestFiles(): Promise<string[]> {
        try {
            const output = execSync('find . -name "test_*.py" -o -name "*_test.py" -o -name "test*.py"', { encoding: 'utf8' });
            return output.trim().split('\n').filter(file => file.length > 0);
        } catch (error) {
            return [];
        }
    }

    private async countAllFiles(): Promise<number> {
        try {
            const output = execSync('find . -type f | wc -l', { encoding: 'utf8' });
            return parseInt(output.trim());
        } catch (error) {
            return 0;
        }
    }

    private estimateTestCoverage(testFiles: number, testCases: number): TestMetrics['testCoverage'] {
        // Simplified estimation based on test files and cases
        const estimatedCovered = Math.min(testFiles * 50 + testCases * 10, 1000);
        const estimatedTotal = 1000; // Placeholder
        
        return {
            linesCovered: estimatedCovered,
            totalLines: estimatedTotal,
            percentage: (estimatedCovered / estimatedTotal) * 100
        };
    }

    private async analyzeCommitTypes(): Promise<Record<string, number>> {
        try {
            const commits = execSync('git log --oneline -100', { encoding: 'utf8' })
                .trim().split('\n');
            
            const types = { feat: 0, fix: 0, docs: 0, style: 0, refactor: 0, test: 0, other: 0 };
            
            for (const commit of commits) {
                const message = commit.toLowerCase();
                if (message.includes('feat') || message.includes('feature')) types.feat++;
                else if (message.includes('fix') || message.includes('bug')) types.fix++;
                else if (message.includes('doc')) types.docs++;
                else if (message.includes('style') || message.includes('format')) types.style++;
                else if (message.includes('refactor')) types.refactor++;
                else if (message.includes('test')) types.test++;
                else types.other++;
            }
            
            return types;
        } catch (error) {
            return { feat: 0, fix: 0, docs: 0, style: 0, refactor: 0, test: 0, other: 0 };
        }
    }

    private analyzeFileComplexity(content: string, filePath: string): {
        functions: Array<{ name: string; lines: number; complexity: number; nesting: number; parameters: number }>;
        classes: Array<{ name: string; methods: number; attributes: number }>;
    } {
        const lines = content.split('\n');
        const functions = [];
        const classes = [];
        
        let inFunction = false;
        let inClass = false;
        let currentFunction: any = null;
        let currentClass: any = null;
        let braceDepth = 0;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            
            // Function detection
            const funcMatch = trimmed.match(/def\s+(\w+)\s*\(([^)]*)\):/);
            if (funcMatch) {
                if (currentFunction) {
                    currentFunction.lines = i - currentFunction.startLine;
                    functions.push(currentFunction);
                }
                
                currentFunction = {
                    name: funcMatch[1],
                    startLine: i,
                    lines: 0,
                    complexity: 1, // Base complexity
                    nesting: 0,
                    parameters: funcMatch[2] ? funcMatch[2].split(',').length : 0
                };
                inFunction = true;
            }
            
            // Class detection
            const classMatch = trimmed.match(/class\s+(\w+)/);
            if (classMatch) {
                if (currentClass) {
                    classes.push(currentClass);
                }
                
                currentClass = {
                    name: classMatch[1],
                    methods: 0,
                    attributes: 0
                };
                inClass = true;
            }
            
            if (inFunction && currentFunction) {
                // Count complexity indicators
                if (trimmed.includes('if ') || trimmed.includes('elif ')) currentFunction.complexity++;
                if (trimmed.includes('for ') || trimmed.includes('while ')) currentFunction.complexity++;
                if (trimmed.includes('try:') || trimmed.includes('except ')) currentFunction.complexity++;
                if (trimmed.includes('and ') || trimmed.includes('or ')) currentFunction.complexity++;
                
                // Track nesting depth
                const indent = line.length - line.trimStart().length;
                currentFunction.nesting = Math.max(currentFunction.nesting, Math.floor(indent / 4));
            }
            
            if (inClass && currentClass) {
                if (trimmed.startsWith('def ')) currentClass.methods++;
                if (trimmed.includes('self.') && trimmed.includes('=')) currentClass.attributes++;
            }
        }
        
        // Finalize last function/class
        if (currentFunction) {
            currentFunction.lines = lines.length - currentFunction.startLine;
            functions.push(currentFunction);
        }
        if (currentClass) {
            classes.push(currentClass);
        }
        
        return { functions, classes };
    }

    private async extractDependencies(): Promise<{
        external: string[];
        internal: string[];
        maxDepth: number;
        circular: number;
        types: Record<string, number>;
        top: Array<{ name: string; usage: number }>;
        outdated: number;
    }> {
        const external: string[] = [];
        const internal: string[] = [];
        const types = { dev: 0, prod: 0, test: 0 };
        
        // Check for requirements.txt
        if (fs.existsSync('requirements.txt')) {
            const requirements = fs.readFileSync('requirements.txt', 'utf8');
            const deps = requirements.split('\n')
                .filter(line => line.trim() && !line.startsWith('#'))
                .map(line => line.split('==')[0].split('>=')[0].split('<=')[0].trim());
            external.push(...deps);
            types.prod = deps.length;
        }
        
        // Check for setup.py or pyproject.toml (simplified)
        if (fs.existsSync('setup.py')) {
            types.prod += 5; // Estimate
        }
        
        return {
            external,
            internal,
            maxDepth: 3,
            circular: 0,
            types,
            top: external.slice(0, 5).map(name => ({ name, usage: Math.random() * 10 })),
            outdated: Math.floor(external.length * 0.2)
        };
    }

    private analyzeFileQuality(content: string): {
        longMethods: number;
        largeClasses: number;
        complexConditions: number;
        maintainabilityIndex: number;
    } {
        const lines = content.split('\n');
        let longMethods = 0;
        let largeClasses = 0;
        let complexConditions = 0;
        
        let inMethod = false;
        let inClass = false;
        let methodLines = 0;
        let classLines = 0;
        
        for (const line of lines) {
            const trimmed = line.trim();
            
            if (trimmed.startsWith('def ')) {
                if (inMethod && methodLines > 50) longMethods++;
                inMethod = true;
                methodLines = 0;
            }
            
            if (trimmed.startsWith('class ')) {
                if (inClass && classLines > 200) largeClasses++;
                inClass = true;
                classLines = 0;
            }
            
            if (inMethod) methodLines++;
            if (inClass) classLines++;
            
            // Complex conditions
            if (trimmed.includes('and') && trimmed.includes('or')) complexConditions++;
            if ((trimmed.match(/and|or/g) || []).length > 3) complexConditions++;
        }
        
        // Final checks
        if (inMethod && methodLines > 50) longMethods++;
        if (inClass && classLines > 200) largeClasses++;
        
        // Simple maintainability index calculation
        const totalIssues = longMethods + largeClasses + complexConditions;
        const maintainabilityIndex = Math.max(0, 100 - totalIssues * 5);
        
        return { longMethods, largeClasses, complexConditions, maintainabilityIndex };
    }

    private estimateTechnicalDebt(issues: number): string {
        if (issues < 5) return '< 1 day';
        if (issues < 15) return '1-3 days';
        if (issues < 30) return '1-2 weeks';
        return '> 2 weeks';
    }

    private getDefaultGitMetrics(): GitMetrics {
        return {
            totalCommits: 0,
            commitsLastYear: 0,
            commitsLastMonth: 0,
            contributors: 1,
            activeContributors: 1,
            averageCommitsPerMonth: 0,
            commitFrequency: 'low',
            mostActiveFiles: [],
            commitTypes: { feat: 0, fix: 0, docs: 0, style: 0, refactor: 0, test: 0, other: 0 }
        };
    }

    /**
     * Generate project characterization summary
     */
    public generateCharacterizationSummary(characteristics: ProjectCharacteristics): string {
        const { project, codeMetrics, testMetrics, gitMetrics, complexityMetrics } = characteristics;
        
        return `# Project Characterization: ${project.name}

## Overview
- **Size**: ${project.size} (${codeMetrics.linesOfCode.toLocaleString()} LOC)
- **Language**: Python
- **Test Framework**: ${testMetrics.testFrameworks.join(', ') || 'Unknown'}

## Code Metrics
- **Files**: ${codeMetrics.pythonFiles} Python files
- **Average File Size**: ${Math.round(codeMetrics.averageFileSize)} lines
- **Comments Ratio**: ${((codeMetrics.linesOfComments / codeMetrics.linesOfCode) * 100).toFixed(1)}%

## Test Metrics  
- **Test Files**: ${testMetrics.totalTestFiles}
- **Test Cases**: ${testMetrics.totalTestCases}
- **Test Types**: ${testMetrics.testTypes.unit} unit, ${testMetrics.testTypes.integration} integration
- **Estimated Coverage**: ${testMetrics.testCoverage.percentage.toFixed(1)}%

## Complexity
- **Functions**: ${complexityMetrics.functionMetrics.totalFunctions}
- **Classes**: ${complexityMetrics.classMetrics.totalClasses}
- **Avg Complexity**: ${complexityMetrics.cyclomaticComplexity.average.toFixed(1)}
- **Max Complexity**: ${complexityMetrics.cyclomaticComplexity.maximum}

## Activity
- **Total Commits**: ${gitMetrics.totalCommits}
- **Contributors**: ${gitMetrics.contributors}
- **Activity Level**: ${gitMetrics.commitFrequency}
- **Recent Commits**: ${gitMetrics.commitsLastMonth} (last month)

## Suitability for SIKG Experiments
${this.assessExperimentSuitability(characteristics)}
`;
    }

    private assessExperimentSuitability(characteristics: ProjectCharacteristics): string {
        const assessments = [];
        
        if (characteristics.testMetrics.totalTestCases >= 50) {
            assessments.push('✅ Sufficient test cases for meaningful evaluation');
        } else {
            assessments.push('⚠️ Limited test cases may affect result significance');
        }
        
        if (characteristics.gitMetrics.totalCommits >= 100) {
            assessments.push('✅ Rich commit history for historical analysis');
        } else {
            assessments.push('⚠️ Limited commit history may affect RL evaluation');
        }
        
        if (characteristics.complexityMetrics.cyclomaticComplexity.average <= 10) {
            assessments.push('✅ Moderate complexity suitable for impact analysis');
        } else {
            assessments.push('⚠️ High complexity may challenge impact prediction');
        }
        
        if (characteristics.codeMetrics.linesOfCode > 1000) {
            assessments.push('✅ Sufficient codebase size for realistic evaluation');
        } else {
            assessments.push('⚠️ Small codebase may limit generalizability');
        }
        
        return assessments.join('\n');
    }
}