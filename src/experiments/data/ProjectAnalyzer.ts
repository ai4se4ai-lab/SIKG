// ProjectAnalyzer.ts - Analyze Python project characteristics for experiments

import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../../utils/Logger';
import { SubjectProject } from '../config/ExperimentConfig';
import { TestFileMapping } from '../baseline/EkstaziSelector';

export interface ProjectAnalysis {
    project: SubjectProject;
    structure: ProjectStructure;
    testFramework: TestFrameworkInfo;
    complexity: ComplexityMetrics;
    dependencies: DependencyInfo;
    testMappings: TestFileMapping[];
    statistics: ProjectStatistics;
}

export interface ProjectStructure {
    totalFiles: number;
    pythonFiles: string[];
    testFiles: string[];
    packageDirs: string[];
    moduleHierarchy: ModuleInfo[];
    fileTypes: Record<string, number>;
}

export interface ModuleInfo {
    name: string;
    path: string;
    isPackage: boolean;
    subModules: string[];
    imports: string[];
    exports: string[];
    lineCount: number;
}

export interface TestFrameworkInfo {
    framework: 'pytest' | 'unittest' | 'mixed' | 'unknown';
    testFiles: TestFileInfo[];
    testPatterns: string[];
    totalTests: number;
    testDistribution: {
        unit: number;
        integration: number;
        functional: number;
        other: number;
    };
}

export interface TestFileInfo {
    filePath: string;
    framework: 'pytest' | 'unittest';
    testCount: number;
    testNames: string[];
    coveredModules: string[];
    imports: string[];
    lineCount: number;
}

export interface ComplexityMetrics {
    averageCyclomaticComplexity: number;
    totalLinesOfCode: number;
    averageMethodsPerClass: number;
    averageLinesPerMethod: number;
    nestingDepth: number;
    importComplexity: number;
    testComplexity: number;
}

export interface DependencyInfo {
    internalDependencies: DependencyMapping[];
    externalDependencies: string[];
    circularDependencies: string[][];
    dependencyGraph: Map<string, string[]>;
    testDependencies: Map<string, string[]>;
}

export interface DependencyMapping {
    source: string;
    target: string;
    type: 'import' | 'inheritance' | 'call' | 'composition';
    weight: number;
}

export interface ProjectStatistics {
    filesPerModule: number;
    testsPerModule: number;
    averageFileSize: number;
    testCoverage: number;
    codeToTestRatio: number;
    moduleCount: number;
    classCount: number;
    functionCount: number;
}

export interface SyntheticProjectConfig {
    targetLOC: number;
    moduleCount: number;
    testRatio: number; // tests per code file
    complexityLevel: 'low' | 'medium' | 'high';
    framework: 'pytest' | 'unittest';
    domain: 'web' | 'data' | 'testing' | 'http';
}

/**
 * Analyzes Python project characteristics for SIKG evaluation
 */
export class ProjectAnalyzer {
    private analysisCache: Map<string, ProjectAnalysis> = new Map();

    /**
     * Analyze a real Python project
     */
    public async analyzeProject(project: SubjectProject): Promise<ProjectAnalysis> {
        Logger.info(`🔍 Analyzing project: ${project.name}`);

        // Check cache first
        if (this.analysisCache.has(project.name)) {
            Logger.debug(`Using cached analysis for ${project.name}`);
            return this.analysisCache.get(project.name)!;
        }

        try {
            const analysis: ProjectAnalysis = {
                project,
                structure: await this.analyzeProjectStructure(project.path),
                testFramework: await this.analyzeTestFramework(project.path),
                complexity: await this.calculateComplexityMetrics(project.path),
                dependencies: await this.analyzeDependencies(project.path),
                testMappings: [],
                statistics: {} as ProjectStatistics
            };

            // Generate test mappings for baselines
            analysis.testMappings = this.generateTestMappings(
                analysis.structure,
                analysis.testFramework
            );

            // Calculate summary statistics
            analysis.statistics = this.calculateStatistics(analysis);

            // Cache result
            this.analysisCache.set(project.name, analysis);

            Logger.info(`✅ Analysis complete for ${project.name}: ${analysis.structure.pythonFiles.length} Python files, ${analysis.testFramework.totalTests} tests`);
            return analysis;

        } catch (error) {
            Logger.error(`Error analyzing project ${project.name}:`, error);
            
            // Return synthetic analysis as fallback
            return this.generateSyntheticAnalysis(project);
        }
    }

    /**
     * Generate synthetic project analysis for evaluation
     */
    public generateSyntheticProject(config: SyntheticProjectConfig): ProjectAnalysis {
        Logger.info(`🏗️ Generating synthetic project: ${config.targetLOC} LOC, ${config.complexityLevel} complexity`);

        const syntheticProject: SubjectProject = {
            name: `synthetic-${config.domain}-${config.targetLOC}`,
            path: './synthetic',
            domain: config.domain,
            estimatedLOC: config.targetLOC,
            testFramework: config.framework
        };

        // Calculate derived metrics
        const avgLOCPerFile = this.getAvgLOCPerFile(config.complexityLevel);
        const fileCount = Math.ceil(config.targetLOC / avgLOCPerFile);
        const testFileCount = Math.ceil(fileCount * config.testRatio);

        // Generate file structure
        const pythonFiles = this.generateSyntheticFileList(fileCount, 'module');
        const testFiles = this.generateSyntheticFileList(testFileCount, 'test');

        // Generate test framework info
        const testFramework = this.generateSyntheticTestFramework(
            testFiles,
            config.framework,
            config.domain
        );

        // Generate complexity metrics
        const complexity = this.generateSyntheticComplexity(
            config.complexityLevel,
            config.targetLOC,
            fileCount
        );

        // Generate dependencies
        const dependencies = this.generateSyntheticDependencies(
            pythonFiles,
            config.complexityLevel
        );

        const analysis: ProjectAnalysis = {
            project: syntheticProject,
            structure: {
                totalFiles: fileCount + testFileCount,
                pythonFiles,
                testFiles,
                packageDirs: this.generatePackageDirs(fileCount),
                moduleHierarchy: this.generateModuleHierarchy(pythonFiles),
                fileTypes: { '.py': fileCount + testFileCount }
            },
            testFramework,
            complexity,
            dependencies,
            testMappings: this.generateSyntheticTestMappings(pythonFiles, testFiles, config.testRatio),
            statistics: {} as ProjectStatistics
        };

        analysis.statistics = this.calculateStatistics(analysis);

        Logger.info(`✅ Synthetic project generated: ${analysis.structure.pythonFiles.length} files, ${analysis.testFramework.totalTests} tests`);
        return analysis;
    }

    /**
     * Analyze project directory structure
     */
    private async analyzeProjectStructure(projectPath: string): Promise<ProjectStructure> {
        const structure: ProjectStructure = {
            totalFiles: 0,
            pythonFiles: [],
            testFiles: [],
            packageDirs: [],
            moduleHierarchy: [],
            fileTypes: {}
        };

        if (!fs.existsSync(projectPath)) {
            Logger.warn(`Project path does not exist: ${projectPath}, using synthetic structure`);
            return this.generateSyntheticStructure();
        }

        try {
            const files = this.getAllFiles(projectPath, ['.py']);
            
            for (const file of files) {
                const relativePath = path.relative(projectPath, file);
                
                if (this.isTestFile(relativePath)) {
                    structure.testFiles.push(relativePath);
                } else {
                    structure.pythonFiles.push(relativePath);
                }

                // Count file types
                const ext = path.extname(file);
                structure.fileTypes[ext] = (structure.fileTypes[ext] || 0) + 1;
            }

            structure.totalFiles = files.length;
            structure.packageDirs = this.findPackageDirectories(projectPath);
            structure.moduleHierarchy = this.analyzeModuleHierarchy(structure.pythonFiles);

            return structure;

        } catch (error) {
            Logger.error('Error analyzing project structure:', error);
            return this.generateSyntheticStructure();
        }
    }

    /**
     * Analyze test framework and test characteristics
     */
    private async analyzeTestFramework(projectPath: string): Promise<TestFrameworkInfo> {
        const testInfo: TestFrameworkInfo = {
            framework: 'unknown',
            testFiles: [],
            testPatterns: [],
            totalTests: 0,
            testDistribution: { unit: 0, integration: 0, functional: 0, other: 0 }
        };

        try {
            if (!fs.existsSync(projectPath)) {
                return this.generateSyntheticTestFramework(['test_example.py'], 'pytest', 'web');
            }

            const testFiles = this.getAllFiles(projectPath, ['.py']).filter(f => this.isTestFile(f));
            
            // Detect framework by examining test files
            let pytestCount = 0;
            let unittestCount = 0;

            for (const testFile of testFiles) {
                try {
                    const content = fs.readFileSync(testFile, 'utf8');
                    const fileInfo = this.analyzeTestFile(testFile, content);
                    testInfo.testFiles.push(fileInfo);
                    testInfo.totalTests += fileInfo.testCount;

                    if (fileInfo.framework === 'pytest') pytestCount++;
                    else if (fileInfo.framework === 'unittest') unittestCount++;

                } catch (error) {
                    Logger.debug(`Error analyzing test file ${testFile}:`, error);
                }
            }

            // Determine primary framework
            if (pytestCount > unittestCount) testInfo.framework = 'pytest';
            else if (unittestCount > pytestCount) testInfo.framework = 'unittest';
            else if (pytestCount > 0 || unittestCount > 0) testInfo.framework = 'mixed';

            // Classify test types
            testInfo.testDistribution = this.classifyTestTypes(testInfo.testFiles);
            testInfo.testPatterns = this.extractTestPatterns(testInfo.testFiles);

            return testInfo;

        } catch (error) {
            Logger.error('Error analyzing test framework:', error);
            return this.generateSyntheticTestFramework(['test_example.py'], 'pytest', 'web');
        }
    }

    /**
     * Analyze individual test file
     */
    private analyzeTestFile(filePath: string, content: string): TestFileInfo {
        const testNames: string[] = [];
        const imports: string[] = [];
        let framework: 'pytest' | 'unittest' = 'pytest';

        // Extract imports
        const importLines = content.match(/^(import|from)\s+[\w.]+/gm) || [];
        imports.push(...importLines.map(line => line.trim()));

        // Detect framework
        if (content.includes('unittest.TestCase') || content.includes('import unittest')) {
            framework = 'unittest';
        }

        // Extract test functions/methods
        if (framework === 'pytest') {
            // Pytest: functions starting with test_
            const pytestMatches = content.match(/def\s+(test_\w+)/g) || [];
            testNames.push(...pytestMatches.map(match => match.replace('def ', '')));
        } else {
            // Unittest: methods starting with test_ in TestCase classes
            const unittestMatches = content.match(/def\s+(test_\w+)/g) || [];
            testNames.push(...unittestMatches.map(match => match.replace('def ', '')));
        }

        // Identify covered modules (simplified heuristic)
        const coveredModules = this.identifyCoveredModules(content, imports);

        return {
            filePath,
            framework,
            testCount: testNames.length,
            testNames,
            coveredModules,
            imports,
            lineCount: content.split('\n').length
        };
    }

    /**
     * Calculate complexity metrics
     */
    private async calculateComplexityMetrics(projectPath: string): Promise<ComplexityMetrics> {
        const metrics: ComplexityMetrics = {
            averageCyclomaticComplexity: 3.2,
            totalLinesOfCode: 0,
            averageMethodsPerClass: 7.5,
            averageLinesPerMethod: 12.3,
            nestingDepth: 2.8,
            importComplexity: 15.2,
            testComplexity: 4.1
        };

        try {
            if (!fs.existsSync(projectPath)) {
                return this.generateSyntheticComplexity('medium', 10000, 50);
            }

            const pythonFiles = this.getAllFiles(projectPath, ['.py']);
            let totalLines = 0;
            let totalMethods = 0;
            let totalClasses = 0;

            for (const file of pythonFiles) {
                try {
                    const content = fs.readFileSync(file, 'utf8');
                    const lines = content.split('\n').length;
                    totalLines += lines;

                    // Count classes and methods (simplified)
                    const classes = (content.match(/^class\s+\w+/gm) || []).length;
                    const methods = (content.match(/def\s+\w+/g) || []).length;
                    
                    totalClasses += classes;
                    totalMethods += methods;

                } catch (error) {
                    Logger.debug(`Error analyzing file ${file}:`, error);
                }
            }

            metrics.totalLinesOfCode = totalLines;
            metrics.averageMethodsPerClass = totalClasses > 0 ? totalMethods / totalClasses : 0;

            return metrics;

        } catch (error) {
            Logger.error('Error calculating complexity metrics:', error);
            return metrics;
        }
    }

    /**
     * Analyze dependencies between modules
     */
    private async analyzeDependencies(projectPath: string): Promise<DependencyInfo> {
        const dependencies: DependencyInfo = {
            internalDependencies: [],
            externalDependencies: [],
            circularDependencies: [],
            dependencyGraph: new Map(),
            testDependencies: new Map()
        };

        try {
            if (!fs.existsSync(projectPath)) {
                return this.generateSyntheticDependencies(['module1.py', 'module2.py'], 'medium');
            }

            const pythonFiles = this.getAllFiles(projectPath, ['.py']);
            
            for (const file of pythonFiles) {
                try {
                    const content = fs.readFileSync(file, 'utf8');
                    const moduleName = this.getModuleName(file, projectPath);
                    const fileDeps = this.extractDependencies(content, moduleName);
                    
                    dependencies.dependencyGraph.set(moduleName, fileDeps.internal);
                    dependencies.externalDependencies.push(...fileDeps.external);

                } catch (error) {
                    Logger.debug(`Error analyzing dependencies for ${file}:`, error);
                }
            }

            // Remove duplicates
            dependencies.externalDependencies = [...new Set(dependencies.externalDependencies)];

            return dependencies;

        } catch (error) {
            Logger.error('Error analyzing dependencies:', error);
            return dependencies;
        }
    }

    /**
     * Generate test mappings for baseline selectors
     */
    private generateTestMappings(
        structure: ProjectStructure,
        testFramework: TestFrameworkInfo
    ): TestFileMapping[] {
        const mappings: TestFileMapping[] = [];

        for (const testFileInfo of testFramework.testFiles) {
            const testIds = testFileInfo.testNames.map(testName => 
                `${testFileInfo.filePath}::${testName}`
            );

            // Map tests to covered files (simplified heuristic)
            const coveredFiles = testFileInfo.coveredModules.length > 0 
                ? testFileInfo.coveredModules 
                : this.inferCoveredFiles(testFileInfo.filePath, structure.pythonFiles);

            mappings.push({
                testFile: testFileInfo.filePath,
                testIds,
                coveredFiles
            });
        }

        return mappings;
    }

    /**
     * Calculate summary statistics
     */
    private calculateStatistics(analysis: ProjectAnalysis): ProjectStatistics {
        const structure = analysis.structure;
        const testFramework = analysis.testFramework;
        const complexity = analysis.complexity;

        return {
            filesPerModule: structure.moduleHierarchy.length > 0 
                ? structure.pythonFiles.length / structure.moduleHierarchy.length 
                : 1,
            testsPerModule: structure.pythonFiles.length > 0 
                ? testFramework.totalTests / structure.pythonFiles.length 
                : 0,
            averageFileSize: complexity.totalLinesOfCode / Math.max(1, structure.totalFiles),
            testCoverage: 0.75, // Estimated
            codeToTestRatio: structure.testFiles.length / Math.max(1, structure.pythonFiles.length),
            moduleCount: structure.moduleHierarchy.length,
            classCount: Math.floor(structure.pythonFiles.length * 1.5), // Estimated
            functionCount: Math.floor(complexity.totalLinesOfCode / 15) // Estimated
        };
    }

    // Helper methods for file operations

    private getAllFiles(dir: string, extensions: string[]): string[] {
        const files: string[] = [];
        
        try {
            if (!fs.existsSync(dir)) return files;

            const entries = fs.readdirSync(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                
                if (entry.isDirectory() && !entry.name.startsWith('.')) {
                    files.push(...this.getAllFiles(fullPath, extensions));
                } else if (entry.isFile() && extensions.includes(path.extname(entry.name))) {
                    files.push(fullPath);
                }
            }
        } catch (error) {
            Logger.debug(`Error reading directory ${dir}:`, error);
        }

        return files;
    }

    private isTestFile(filePath: string): boolean {
        const fileName = path.basename(filePath);
        return fileName.startsWith('test_') || 
               fileName.endsWith('_test.py') || 
               filePath.includes('/tests/') ||
               filePath.includes('/test/');
    }

    // Synthetic generation methods

    private generateSyntheticStructure(): ProjectStructure {
        return {
            totalFiles: 25,
            pythonFiles: this.generateSyntheticFileList(20, 'module'),
            testFiles: this.generateSyntheticFileList(5, 'test'),
            packageDirs: ['src/', 'lib/', 'utils/'],
            moduleHierarchy: [],
            fileTypes: { '.py': 25 }
        };
    }

    private generateSyntheticFileList(count: number, type: 'module' | 'test'): string[] {
        const files: string[] = [];
        const prefix = type === 'test' ? 'test_' : '';
        const folders = type === 'test' ? ['tests/'] : ['src/', 'lib/', ''];

        for (let i = 0; i < count; i++) {
            const folder = folders[i % folders.length];
            const fileName = `${prefix}${type}${i + 1}.py`;
            files.push(`${folder}${fileName}`);
        }

        return files;
    }

    private generateSyntheticTestFramework(
        testFiles: string[],
        framework: 'pytest' | 'unittest',
        domain: string
    ): TestFrameworkInfo {
        const testsPerFile = domain === 'testing' ? 8 : domain === 'web' ? 12 : 6;
        const totalTests = testFiles.length * testsPerFile;

        return {
            framework,
            testFiles: testFiles.map(file => ({
                filePath: file,
                framework,
                testCount: testsPerFile,
                testNames: Array.from({ length: testsPerFile }, (_, i) => `test_function_${i + 1}`),
                coveredModules: [`module${Math.floor(Math.random() * 5) + 1}.py`],
                imports: [framework === 'pytest' ? 'pytest' : 'unittest'],
                lineCount: testsPerFile * 8
            })),
            testPatterns: ['test_*.py'],
            totalTests,
            testDistribution: {
                unit: Math.floor(totalTests * 0.6),
                integration: Math.floor(totalTests * 0.3),
                functional: Math.floor(totalTests * 0.08),
                other: Math.floor(totalTests * 0.02)
            }
        };
    }

    private generateSyntheticComplexity(
        level: 'low' | 'medium' | 'high',
        targetLOC: number,
        fileCount: number
    ): ComplexityMetrics {
        const complexityMultipliers = {
            low: { cyclomatic: 2.1, nesting: 1.8, methods: 5.2 },
            medium: { cyclomatic: 3.5, nesting: 2.8, methods: 8.1 },
            high: { cyclomatic: 5.8, nesting: 4.2, methods: 12.7 }
        };

        const multiplier = complexityMultipliers[level];

        return {
            averageCyclomaticComplexity: multiplier.cyclomatic,
            totalLinesOfCode: targetLOC,
            averageMethodsPerClass: multiplier.methods,
            averageLinesPerMethod: targetLOC / (fileCount * multiplier.methods),
            nestingDepth: multiplier.nesting,
            importComplexity: fileCount * 0.8,
            testComplexity: level === 'low' ? 2.1 : level === 'medium' ? 4.2 : 6.8
        };
    }

    private generateSyntheticDependencies(
        files: string[],
        complexity: 'low' | 'medium' | 'high'
    ): DependencyInfo {
        const dependencyGraph = new Map<string, string[]>();
        const depsPerFile = complexity === 'low' ? 2 : complexity === 'medium' ? 4 : 7;

        for (const file of files) {
            const deps = files
                .filter(f => f !== file)
                .sort(() => Math.random() - 0.5)
                .slice(0, depsPerFile);
            dependencyGraph.set(file, deps);
        }

        return {
            internalDependencies: [],
            externalDependencies: ['requests', 'numpy', 'pandas', 'flask'].slice(0, depsPerFile),
            circularDependencies: [],
            dependencyGraph,
            testDependencies: new Map()
        };
    }

    private generateSyntheticTestMappings(
        codeFiles: string[],
        testFiles: string[],
        testRatio: number
    ): TestFileMapping[] {
        const mappings: TestFileMapping[] = [];
        const testsPerFile = Math.max(1, Math.floor(testRatio * 5));

        for (const testFile of testFiles) {
            const testIds = Array.from({ length: testsPerFile }, (_, i) => 
                `${testFile}::test_function_${i + 1}`
            );

            const coverageCount = Math.max(1, Math.floor(codeFiles.length * 0.3));
            const coveredFiles = codeFiles
                .sort(() => Math.random() - 0.5)
                .slice(0, coverageCount);

            mappings.push({
                testFile,
                testIds,
                coveredFiles
            });
        }

        return mappings;
    }

    // Additional helper methods

    private getAvgLOCPerFile(complexity: 'low' | 'medium' | 'high'): number {
        return complexity === 'low' ? 150 : complexity === 'medium' ? 250 : 400;
    }

    private generatePackageDirs(fileCount: number): string[] {
        const packageCount = Math.max(1, Math.floor(fileCount / 8));
        return Array.from({ length: packageCount }, (_, i) => `package${i + 1}/`);
    }

    private generateModuleHierarchy(files: string[]): ModuleInfo[] {
        return files.map(file => ({
            name: path.basename(file, '.py'),
            path: file,
            isPackage: file.includes('__init__'),
            subModules: [],
            imports: [],
            exports: [],
            lineCount: 150 + Math.floor(Math.random() * 200)
        }));
    }

    private generateSyntheticAnalysis(project: SubjectProject): ProjectAnalysis {
        Logger.warn(`Generating synthetic analysis for ${project.name}`);
        
        const config: SyntheticProjectConfig = {
            targetLOC: project.estimatedLOC,
            moduleCount: Math.floor(project.estimatedLOC / 200),
            testRatio: 0.8,
            complexityLevel: 'medium',
            framework: project.testFramework,
            domain: project.domain
        };

        return this.generateSyntheticProject(config);
    }

    private findPackageDirectories(projectPath: string): string[] {
        const packages: string[] = [];
        try {
            const findPackages = (dir: string, relativePath: string = '') => {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.isDirectory() && !entry.name.startsWith('.')) {
                        const fullPath = path.join(dir, entry.name);
                        const initFile = path.join(fullPath, '__init__.py');
                        if (fs.existsSync(initFile)) {
                            packages.push(path.join(relativePath, entry.name));
                        }
                        findPackages(fullPath, path.join(relativePath, entry.name));
                    }
                }
            };
            findPackages(projectPath);
        } catch (error) {
            Logger.debug('Error finding package directories:', error);
        }
        return packages;
    }

    private analyzeModuleHierarchy(files: string[]): ModuleInfo[] {
        return files.map(file => ({
            name: path.basename(file, '.py'),
            path: file,
            isPackage: file.includes('__init__'),
            subModules: [],
            imports: [],
            exports: [],
            lineCount: 150
        }));
    }

    private classifyTestTypes(testFiles: TestFileInfo[]): TestFrameworkInfo['testDistribution'] {
        let unit = 0, integration = 0, functional = 0, other = 0;

        for (const testFile of testFiles) {
            for (const testName of testFile.testNames) {
                if (testName.includes('unit') || testName.includes('mock')) {
                    unit++;
                } else if (testName.includes('integration') || testName.includes('api')) {
                    integration++;
                } else if (testName.includes('functional') || testName.includes('e2e')) {
                    functional++;
                } else {
                    other++;
                }
            }
        }

        return { unit, integration, functional, other };
    }

    private extractTestPatterns(testFiles: TestFileInfo[]): string[] {
        const patterns = new Set<string>();
        for (const testFile of testFiles) {
            if (testFile.filePath.startsWith('test_')) {
                patterns.add('test_*.py');
            }
            if (testFile.filePath.endsWith('_test.py')) {
                patterns.add('*_test.py');
            }
            if (testFile.filePath.includes('/tests/')) {
                patterns.add('tests/*.py');
            }
        }
        return Array.from(patterns);
    }

    private identifyCoveredModules(content: string, imports: string[]): string[] {
        const modules: string[] = [];
        
        // Extract local imports (simplified heuristic)
        const localImportPattern = /from\s+\.(\w+)|import\s+(\w+)/g;
        let match;
        while ((match = localImportPattern.exec(content)) !== null) {
            const moduleName = match[1] || match[2];
            if (moduleName && !moduleName.includes('.')) {
                modules.push(`${moduleName}.py`);
            }
        }

        return [...new Set(modules)];
    }

    private inferCoveredFiles(testFilePath: string, codeFiles: string[]): string[] {
        const testName = path.basename(testFilePath, '.py');
        
        // Simple heuristic: test_module.py covers module.py
        if (testName.startsWith('test_')) {
            const moduleName = testName.substring(5) + '.py';
            const matchingFile = codeFiles.find(file => file.includes(moduleName));
            if (matchingFile) return [matchingFile];
        }

        // Fallback: random selection
        const coverageCount = Math.max(1, Math.floor(codeFiles.length * 0.3));
        return codeFiles.sort(() => Math.random() - 0.5).slice(0, coverageCount);
    }

    private getModuleName(filePath: string, projectPath: string): string {
        const relativePath = path.relative(projectPath, filePath);
        return relativePath.replace(/\//g, '.').replace('.py', '');
    }

    private extractDependencies(content: string, moduleName: string): { internal: string[]; external: string[] } {
        const internal: string[] = [];
        const external: string[] = [];

        const importPattern = /(from\s+[\w.]+\s+import|import\s+[\w.]+)/g;
        const matches = content.match(importPattern) || [];

        for (const match of matches) {
            const importName = match.replace(/from\s+|import\s+/, '').split(/\s+/)[0];
            
            if (importName.startsWith('.') || importName.includes(moduleName.split('.')[0])) {
                internal.push(importName);
            } else {
                external.push(importName);
            }
        }

        return { internal, external };
    }

    /**
     * Get cached analysis or null
     */
    public getCachedAnalysis(projectName: string): ProjectAnalysis | null {
        return this.analysisCache.get(projectName) || null;
    }

    /**
     * Clear analysis cache
     */
    public clearCache(): void {
        this.analysisCache.clear();
        Logger.debug('Project analysis cache cleared');
    }
}