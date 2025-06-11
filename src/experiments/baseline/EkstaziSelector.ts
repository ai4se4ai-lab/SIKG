// src/experiments/baseline/EkstaziSelector.ts - Ekstazi-style static dependency analysis

import * as fs from 'fs';
import * as path from 'path';
import { BaselineSelector } from './index';
import { TestResult } from '../../sikg/GraphTypes';
import { Logger } from '../../utils/Logger';

/**
 * EkstaziSelector implements static dependency analysis similar to the Ekstazi tool
 * 
 * Ekstazi selects tests based on:
 * 1. Direct file dependencies (test files that changed)
 * 2. Static import/dependency analysis
 * 3. Class-level change detection
 * 4. Transitive dependency tracking
 * 
 * This implementation focuses on Python-specific patterns while maintaining
 * the core Ekstazi approach of static dependency analysis.
 */
export class EkstaziSelector implements BaselineSelector {
    name = 'ekstazi';
    
    // Cache for dependency mappings to improve performance
    private dependencyCache: Map<string, Set<string>> = new Map();
    private testToSourceMapping: Map<string, Set<string>> = new Map();
    private initialized: boolean = false;

    constructor() {
        Logger.debug('EkstaziSelector initialized with static dependency analysis');
    }

    /**
     * Select tests based on Ekstazi-style static dependency analysis
     */
    async selectTests(
        allTests: string[], 
        changedFiles: string[], 
        historicalData?: TestResult[]
    ): Promise<string[]> {
        Logger.debug(`EkstaziSelector analyzing ${changedFiles.length} changed files for ${allTests.length} tests`);
        
        if (changedFiles.length === 0) {
            return []; // No changes, no tests needed
        }

        // Initialize dependency analysis if not done
        if (!this.initialized) {
            await this.initializeDependencyAnalysis(allTests);
        }

        const selectedTests = new Set<string>();

        // Phase 1: Direct test file changes
        for (const changedFile of changedFiles) {
            if (this.isTestFile(changedFile)) {
                selectedTests.add(changedFile);
                Logger.debug(`Direct test change: ${changedFile}`);
            }
        }

        // Phase 2: Static dependency analysis
        for (const test of allTests) {
            if (selectedTests.has(test)) {
                continue; // Already selected
            }

            if (this.isTestAffectedByChanges(test, changedFiles)) {
                selectedTests.add(test);
            }
        }

        // Phase 3: Transitive dependency analysis (limited depth to avoid explosion)
        const transitivelySelected = this.analyzeTransitiveDependencies(
            Array.from(selectedTests), 
            changedFiles, 
            allTests
        );
        
        transitivelySelected.forEach(test => selectedTests.add(test));

        const result = Array.from(selectedTests);
        Logger.info(`EkstaziSelector selected ${result.length}/${allTests.length} tests (${(result.length/allTests.length*100).toFixed(1)}% reduction)`);
        
        return result;
    }

    /**
     * Initialize dependency analysis by parsing all test files
     */
    private async initializeDependencyAnalysis(allTests: string[]): Promise<void> {
        Logger.debug('Initializing Ekstazi-style dependency analysis...');
        
        for (const test of allTests) {
            try {
                const dependencies = await this.extractTestDependencies(test);
                this.testToSourceMapping.set(test, dependencies);
                
                // Build reverse mapping for faster lookup
                for (const dep of dependencies) {
                    if (!this.dependencyCache.has(dep)) {
                        this.dependencyCache.set(dep, new Set());
                    }
                    this.dependencyCache.get(dep)!.add(test);
                }
            } catch (error) {
                Logger.debug(`Failed to analyze dependencies for ${test}:`, error);
                // Continue with other tests
            }
        }
        
        this.initialized = true;
        Logger.debug(`Dependency analysis complete: ${this.testToSourceMapping.size} tests mapped`);
    }

    /**
     * Extract dependencies from a test file using static analysis
     */
    private async extractTestDependencies(testPath: string): Promise<Set<string>> {
        const dependencies = new Set<string>();
        
        try {
            if (!fs.existsSync(testPath)) {
                return dependencies;
            }

            const content = fs.readFileSync(testPath, 'utf8');
            
            // Extract Python imports and dependencies
            const importDependencies = this.extractImportDependencies(content, testPath);
            const classDependencies = this.extractClassDependencies(content, testPath);
            const functionDependencies = this.extractFunctionCallDependencies(content, testPath);
            
            // Combine all dependencies
            importDependencies.forEach(dep => dependencies.add(dep));
            classDependencies.forEach(dep => dependencies.add(dep));
            functionDependencies.forEach(dep => dependencies.add(dep));
            
        } catch (error) {
            Logger.debug(`Error extracting dependencies from ${testPath}:`, error);
        }
        
        return dependencies;
    }

    /**
     * Extract import-based dependencies (direct imports)
     */
    private extractImportDependencies(content: string, testPath: string): Set<string> {
        const dependencies = new Set<string>();
        const testDir = path.dirname(testPath);
        
        // Python import patterns
        const importPatterns = [
            // from module import something
            /^from\s+([.\w]+)\s+import/gm,
            // import module
            /^import\s+([.\w]+)/gm,
            // from .relative import something  
            /^from\s+(\.+[\w.]*)\s+import/gm
        ];

        for (const pattern of importPatterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const moduleName = match[1];
                const resolvedPath = this.resolveModulePath(moduleName, testDir);
                
                if (resolvedPath) {
                    dependencies.add(resolvedPath);
                }
            }
        }

        return dependencies;
    }

    /**
     * Extract class-based dependencies (class instantiation, inheritance)
     */
    private extractClassDependencies(content: string, testPath: string): Set<string> {
        const dependencies = new Set<string>();
        const testDir = path.dirname(testPath);

        // Pattern for class instantiation: ClassName() or module.ClassName()
        const classInstantiationPattern = /\b([A-Z][a-zA-Z0-9_]*)\s*\(/g;
        
        let match;
        while ((match = classInstantiationPattern.exec(content)) !== null) {
            const className = match[1];
            
            // Skip common test/assertion classes
            if (this.isTestOrAssertionClass(className)) {
                continue;
            }
            
            // Try to resolve class to file
            const classFile = this.findClassDefinition(className, testDir);
            if (classFile) {
                dependencies.add(classFile);
            }
        }

        // Pattern for module.Class usage
        const moduleClassPattern = /\b(\w+)\.([A-Z][a-zA-Z0-9_]*)/g;
        while ((match = moduleClassPattern.exec(content)) !== null) {
            const moduleName = match[1];
            const className = match[2];
            
            const moduleFile = this.resolveModulePath(moduleName, testDir);
            if (moduleFile) {
                dependencies.add(moduleFile);
            }
        }

        return dependencies;
    }

    /**
     * Extract function call dependencies
     */
    private extractFunctionCallDependencies(content: string, testPath: string): Set<string> {
        const dependencies = new Set<string>();
        const testDir = path.dirname(testPath);

        // Pattern for function calls that might be from imported modules
        const functionCallPattern = /\b(\w+)\.(\w+)\s*\(/g;
        
        let match;
        while ((match = functionCallPattern.exec(content)) !== null) {
            const moduleName = match[1];
            const functionName = match[2];
            
            // Skip self and common test methods
            if (moduleName === 'self' || this.isTestMethod(functionName)) {
                continue;
            }
            
            const moduleFile = this.resolveModulePath(moduleName, testDir);
            if (moduleFile) {
                dependencies.add(moduleFile);
            }
        }

        return dependencies;
    }

    /**
     * Resolve Python module name to file path
     */
    private resolveModulePath(moduleName: string, baseDir: string): string | null {
        // Handle relative imports
        if (moduleName.startsWith('.')) {
            return this.resolveRelativeImport(moduleName, baseDir);
        }

        // Handle absolute imports within the project
        const possiblePaths = [
            // Same directory
            path.join(baseDir, `${moduleName}.py`),
            // Parent directory
            path.join(path.dirname(baseDir), `${moduleName}.py`),
            // Project root patterns
            path.join(baseDir, '..', '..', 'src', `${moduleName}.py`),
            path.join(baseDir, '..', 'src', `${moduleName}.py`),
            // Module as directory with __init__.py
            path.join(baseDir, moduleName, '__init__.py'),
            path.join(path.dirname(baseDir), moduleName, '__init__.py')
        ];

        for (const possiblePath of possiblePaths) {
            if (fs.existsSync(possiblePath)) {
                return this.normalizePath(possiblePath);
            }
        }

        return null;
    }

    /**
     * Resolve relative imports (e.g., from .module import something)
     */
    private resolveRelativeImport(moduleName: string, baseDir: string): string | null {
        const dots = moduleName.match(/^\.+/)?.[0] || '.';
        const relativePath = moduleName.substring(dots.length);
        
        let targetDir = baseDir;
        
        // Move up directories based on number of dots
        for (let i = 1; i < dots.length; i++) {
            targetDir = path.dirname(targetDir);
        }
        
        if (relativePath) {
            const modulePath = path.join(targetDir, `${relativePath}.py`);
            if (fs.existsSync(modulePath)) {
                return this.normalizePath(modulePath);
            }
            
            // Try as package
            const packagePath = path.join(targetDir, relativePath, '__init__.py');
            if (fs.existsSync(packagePath)) {
                return this.normalizePath(packagePath);
            }
        }
        
        return null;
    }

    /**
     * Find class definition in nearby files
     */
    private findClassDefinition(className: string, baseDir: string): string | null {
        const searchDirs = [
            baseDir,
            path.dirname(baseDir),
            path.join(baseDir, '..', 'src'),
            path.join(baseDir, '..')
        ];

        for (const searchDir of searchDirs) {
            if (!fs.existsSync(searchDir)) continue;
            
            try {
                const files = fs.readdirSync(searchDir)
                    .filter(file => file.endsWith('.py'))
                    .map(file => path.join(searchDir, file));

                for (const file of files) {
                    if (this.fileContainsClass(file, className)) {
                        return this.normalizePath(file);
                    }
                }
            } catch (error) {
                // Continue searching other directories
            }
        }

        return null;
    }

    /**
     * Check if a file contains a class definition
     */
    private fileContainsClass(filePath: string, className: string): boolean {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const classPattern = new RegExp(`^class\\s+${className}\\b`, 'm');
            return classPattern.test(content);
        } catch (error) {
            return false;
        }
    }

    /**
     * Check if a test is affected by the changed files
     */
    private isTestAffectedByChanges(testPath: string, changedFiles: string[]): boolean {
        const testDependencies = this.testToSourceMapping.get(testPath);
        
        if (!testDependencies) {
            // If we don't have dependency info, use fallback heuristics
            return this.fallbackDependencyCheck(testPath, changedFiles);
        }

        // Check if any changed file is in the test's dependency set
        for (const changedFile of changedFiles) {
            const normalizedChanged = this.normalizePath(changedFile);
            
            if (testDependencies.has(normalizedChanged)) {
                Logger.debug(`Test ${testPath} affected by dependency ${changedFile}`);
                return true;
            }
        }

        return false;
    }

    /**
     * Fallback dependency check using heuristics when static analysis fails
     */
    private fallbackDependencyCheck(testPath: string, changedFiles: string[]): boolean {
        for (const changedFile of changedFiles) {
            // Same directory heuristic
            if (path.dirname(testPath) === path.dirname(changedFile)) {
                return true;
            }
            
            // Name similarity heuristic
            if (this.hasNameSimilarity(testPath, changedFile)) {
                return true;
            }
            
            // Parent-child directory relationship
            if (this.hasDirectoryRelationship(testPath, changedFile)) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Analyze transitive dependencies (limited depth to avoid selection explosion)
     */
    private analyzeTransitiveDependencies(
        directlySelected: string[], 
        changedFiles: string[], 
        allTests: string[]
    ): Set<string> {
        const transitivelySelected = new Set<string>();
        const maxDepth = 2; // Limit transitive depth
        
        // For each changed file, find tests that depend on files that depend on it
        for (const changedFile of changedFiles) {
            const normalizedChanged = this.normalizePath(changedFile);
            
            // Find files that import/depend on the changed file
            const dependentFiles = this.findFilesDependingOn(normalizedChanged);
            
            // Find tests that depend on those dependent files
            for (const dependentFile of dependentFiles) {
                const testsForDependent = this.dependencyCache.get(dependentFile);
                if (testsForDependent) {
                    testsForDependent.forEach(test => {
                        if (!directlySelected.includes(test) && allTests.includes(test)) {
                            transitivelySelected.add(test);
                            Logger.debug(`Transitive selection: ${test} -> ${dependentFile} -> ${changedFile}`);
                        }
                    });
                }
            }
        }
        
        return transitivelySelected;
    }

    /**
     * Find files that depend on a given file (reverse dependency lookup)
     */
    private findFilesDependingOn(targetFile: string): Set<string> {
        const dependents = new Set<string>();
        
        // This is a simplified implementation
        // In a full implementation, we would need to parse all source files
        // and build a complete dependency graph
        
        for (const [test, dependencies] of this.testToSourceMapping.entries()) {
            if (dependencies.has(targetFile)) {
                const testDir = path.dirname(test);
                
                // Add source files from the same directory that might depend on targetFile
                try {
                    const siblingFiles = fs.readdirSync(testDir)
                        .filter(file => file.endsWith('.py') && !this.isTestFile(file))
                        .map(file => this.normalizePath(path.join(testDir, file)));
                    
                    siblingFiles.forEach(file => dependents.add(file));
                } catch (error) {
                    // Continue if directory reading fails
                }
            }
        }
        
        return dependents;
    }

    // Utility methods
    
    private isTestFile(filePath: string): boolean {
        const fileName = path.basename(filePath).toLowerCase();
        return fileName.startsWith('test_') || 
               fileName.endsWith('_test.py') || 
               fileName.includes('test') ||
               filePath.includes('/test/') ||
               filePath.includes('\\test\\');
    }

    private isTestOrAssertionClass(className: string): boolean {
        const testClasses = [
            'TestCase', 'unittest', 'pytest', 'Mock', 'MagicMock', 
            'patch', 'Assert', 'Expect', 'Should'
        ];
        return testClasses.some(testClass => className.includes(testClass));
    }

    private isTestMethod(methodName: string): boolean {
        const testMethods = [
            'assertEqual', 'assertTrue', 'assertFalse', 'assertRaises',
            'assertIn', 'assertNotIn', 'setUp', 'tearDown', 'assert',
            'expect', 'should', 'mock'
        ];
        return testMethods.some(testMethod => methodName.includes(testMethod));
    }

    private hasNameSimilarity(testPath: string, sourcePath: string): boolean {
        const testName = path.basename(testPath, '.py')
            .replace(/^test_/, '')
            .replace(/_test$/, '');
        const sourceName = path.basename(sourcePath, '.py');
        
        return testName === sourceName || 
               testName.includes(sourceName) || 
               sourceName.includes(testName);
    }

    private hasDirectoryRelationship(file1: string, file2: string): boolean {
        const dir1 = path.dirname(this.normalizePath(file1));
        const dir2 = path.dirname(this.normalizePath(file2));
        
        return dir1.startsWith(dir2) || dir2.startsWith(dir1);
    }

    private normalizePath(filePath: string): string {
        return path.normalize(filePath).replace(/\\/g, '/');
    }

    /**
     * Get dependency analysis statistics
     */
    public getDependencyStats(): {
        testsAnalyzed: number;
        averageDependencies: number;
        totalDependencies: number;
        cacheSize: number;
    } {
        const totalDeps = Array.from(this.testToSourceMapping.values())
            .reduce((sum, deps) => sum + deps.size, 0);
        
        return {
            testsAnalyzed: this.testToSourceMapping.size,
            averageDependencies: this.testToSourceMapping.size > 0 ? 
                totalDeps / this.testToSourceMapping.size : 0,
            totalDependencies: totalDeps,
            cacheSize: this.dependencyCache.size
        };
    }

    /**
     * Clear dependency cache (useful for testing or memory management)
     */
    public clearCache(): void {
        this.dependencyCache.clear();
        this.testToSourceMapping.clear();
        this.initialized = false;
        Logger.debug('EkstaziSelector cache cleared');
    }
}