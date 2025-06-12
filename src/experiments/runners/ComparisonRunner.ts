// ComparisonRunner.ts - Compare SIKG against baseline approaches

import { ExperimentConfig, ChangeType } from '../config/ExperimentConfig';
import { BaselineFactory, BaselineSelector } from '../baseline';
import { DataCollector, SyntheticChange, ExperimentData } from '../data/DataCollector';
import { Logger } from '../../utils/Logger';

// Import existing SIKG components
import { SIKGManager } from '../../sikg/SIKGManager';
import { TestPrioritizer } from '../../sikg/TestPrioritizer';
import { ConfigManager } from '../../utils/ConfigManager';
import { TestResult, TestImpact } from '../../sikg/GraphTypes';

export interface ComparisonResult {
    scenario: string;
    changeType: ChangeType;
    subjectProject: string;
    
    // Approach results
    sikgResult: ApproachResult;
    randomResult: ApproachResult;
    ekstaziResult: ApproachResult;
    historyResult: ApproachResult;
    
    // Comparison metrics
    sikgImprovement: {
        overRandom: number;
        overEkstazi: number;
        overHistory: number;
    };
    
    // Statistical significance
    significance: {
        vsRandom: boolean;
        vsEkstazi: boolean;
        vsHistory: boolean;
    };
    
    // Winner
    bestApproach: string;
    bestF1Score: number;
}

export interface ApproachResult {
    approach: string;
    precision: number;
    recall: number;
    f1Score: number;
    apfd: number;
    reductionRatio: number;
    executionTime: number;
    selectedTests: number;
    faultsDetected: number;
    totalFaults: number;
}

export interface ComparisonSummary {
    totalComparisons: number;
    sikgWins: number;
    sikgWinRate: number;
    avgImprovement: {
        overRandom: number;
        overEkstazi: number;
        overHistory: number;
    };
    byChangeType: Record<ChangeType, {
        comparisons: number;
        sikgWins: number;
        avgImprovement: number;
    }>;
    bySubject: Record<string, {
        comparisons: number;
        sikgWins: number;
        avgF1Score: number;
    }>;
    statisticalSignificance: {
        vsRandom: number; // percentage of comparisons with significant difference
        vsEkstazi: number;
        vsHistory: number;
    };
}

/**
 * Runs comprehensive comparisons between SIKG and baseline approaches
 */
export class ComparisonRunner {
    private config: ExperimentConfig;
    private dataCollector: DataCollector;
    private sikgManager: SIKGManager;
    private testPrioritizer: TestPrioritizer;
    private configManager: ConfigManager;
    private baselines: {
        random: BaselineSelector;
        ekstazi: BaselineSelector;
        history: BaselineSelector;
    };

    constructor(config: ExperimentConfig, context: any) {
        this.config = config;
        this.dataCollector = new DataCollector(config.outputDir);
        this.configManager = new ConfigManager(context);
        
        // Initialize SIKG components
        this.sikgManager = new SIKGManager(context, this.configManager);
        this.testPrioritizer = new TestPrioritizer(this.sikgManager, this.configManager);
        
        // Initialize baselines with fixed seed for reproducibility
        this.baselines = BaselineFactory.createAllBaselines(42);
    }

    /**
     * Run comprehensive comparison across all subjects and change types
     */
    public async runFullComparison(): Promise<ComparisonSummary> {
        Logger.info('🔥 Starting comprehensive SIKG vs Baselines comparison...');
        
        try {
            await this.sikgManager.initialize();
            await this.initializeBaselines();
            
            const results: ComparisonResult[] = [];
            
            // Run comparisons for each subject and change type
            for (const subject of this.config.subjects) {
                Logger.info(`Comparing approaches on ${subject.name}...`);
                
                for (const changeType of ['BUG_FIX', 'FEATURE_ADDITION', 'REFACTORING_LOGIC'] as ChangeType[]) {
                    const scenarioResults = await this.runScenarioComparison(
                        subject, changeType, 20 // 20 comparisons per scenario
                    );
                    results.push(...scenarioResults);
                }
            }
            
            // Generate summary
            const summary = this.generateComparisonSummary(results);
            
            // Save detailed results
            this.saveComparisonResults(results, summary);
            
            Logger.info(`🔥 Comparison complete: SIKG won ${summary.sikgWinRate.toFixed(1)}% of ${summary.totalComparisons} comparisons`);
            return summary;
            
        } catch (error) {
            Logger.error('Error in comparison runner:', error);
            throw error;
        }
    }

    /**
     * Run head-to-head comparison for specific scenario
     */
    public async runHeadToHeadComparison(
        subjectProject: any,
        changeType: ChangeType,
        iterations: number = 10
    ): Promise<ComparisonResult[]> {
        Logger.info(`🎯 Running head-to-head comparison: ${changeType} on ${subjectProject.name}`);
        
        const results: ComparisonResult[] = [];
        
        for (let i = 0; i < iterations; i++) {
            // Generate synthetic change
            const change = this.generateSyntheticChange(subjectProject, changeType);
            const availableTests = this.generateSyntheticTests(subjectProject, 100);
            
            // Run all approaches on the same scenario
            const sikgResult = await this.runSIKGApproach(change, availableTests, subjectProject);
            const randomResult = await this.runRandomBaseline(change, availableTests, subjectProject);
            const ekstaziResult = await this.runEkstaziBaseline(change, availableTests, subjectProject);
            const historyResult = await this.runHistoryBaseline(change, availableTests, subjectProject);
            
            // Calculate improvements and significance
            const comparison: ComparisonResult = {
                scenario: `${subjectProject.name}_${changeType}_${i}`,
                changeType,
                subjectProject: subjectProject.name,
                sikgResult,
                randomResult,
                ekstaziResult,
                historyResult,
                sikgImprovement: {
                    overRandom: this.calculateImprovement(sikgResult.f1Score, randomResult.f1Score),
                    overEkstazi: this.calculateImprovement(sikgResult.f1Score, ekstaziResult.f1Score),
                    overHistory: this.calculateImprovement(sikgResult.f1Score, historyResult.f1Score)
                },
                significance: {
                    vsRandom: this.isStatisticallySignificant(sikgResult, randomResult),
                    vsEkstazi: this.isStatisticallySignificant(sikgResult, ekstaziResult),
                    vsHistory: this.isStatisticallySignificant(sikgResult, historyResult)
                },
                bestApproach: this.determineBestApproach([sikgResult, randomResult, ekstaziResult, historyResult]),
                bestF1Score: Math.max(sikgResult.f1Score, randomResult.f1Score, ekstaziResult.f1Score, historyResult.f1Score)
            };
            
            results.push(comparison);
            
            // Record individual experiment data
            this.recordComparisonExperiment(comparison, i);
        }
        
        return results;
    }

    /**
     * Run comparison for specific change types across all subjects
     */
    public async runChangeTypeComparison(changeType: ChangeType): Promise<ComparisonResult[]> {
        Logger.info(`📊 Running change type comparison for: ${changeType}`);
        
        const results: ComparisonResult[] = [];
        
        for (const subject of this.config.subjects) {
            const scenarioResults = await this.runHeadToHeadComparison(subject, changeType, 15);
            results.push(...scenarioResults);
        }
        
        return results;
    }

    /**
     * Run scalability comparison across different project sizes
     */
    public async runScalabilityComparison(): Promise<{
        small: ComparisonResult[];
        medium: ComparisonResult[];
        large: ComparisonResult[];
    }> {
        Logger.info('⚡ Running scalability comparison...');
        
        const projectSizes = [
            { name: 'small', loc: 1000, testCount: 50 },
            { name: 'medium', loc: 10000, testCount: 200 },
            { name: 'large', loc: 50000, testCount: 500 }
        ];
        
        const results: any = {};
        
        for (const size of projectSizes) {
            Logger.info(`Testing ${size.name} project (${size.loc} LOC, ${size.testCount} tests)`);
            
            const syntheticProject = {
                name: `synthetic-${size.name}`,
                domain: 'synthetic',
                estimatedLOC: size.loc,
                testFramework: 'pytest'
            };
            
            const sizeResults = await this.runHeadToHeadComparison(
                syntheticProject, 'BUG_FIX', 10
            );
            
            results[size.name] = sizeResults;
        }
        
        return results;
    }

    /**
     * Run scenario comparison for specific subject and change type
     */
    private async runScenarioComparison(
        subject: any,
        changeType: ChangeType,
        iterations: number
    ): Promise<ComparisonResult[]> {
        return await this.runHeadToHeadComparison(subject, changeType, iterations);
    }

    /**
     * Run SIKG approach
     */
    private async runSIKGApproach(
        change: SyntheticChange,
        availableTests: string[],
        subject: any
    ): Promise<ApproachResult> {
        const startTime = Date.now();
        
        // Simulate SIKG test selection
        const semanticChanges = [{
            nodeId: `node_${change.id}`,
            semanticType: change.type,
            changeDetails: {
                filePath: change.filePath,
                linesChanged: change.linesChanged,
                language: 'python',
                changeTimestamp: Date.now()
            },
            initialImpactScore: change.semanticComplexity
        }];
        
        // Calculate test impacts (simplified simulation)
        const testImpacts: Record<string, TestImpact> = {};
        for (const testId of availableTests) {
            const distance = Math.random() * 3; // Simulate graph distance
            const impact = change.semanticComplexity * Math.exp(-distance * 0.5);
            
            testImpacts[testId] = {
                testId,
                impactScore: impact,
                testName: testId,
                testPath: `${subject.name}/${testId}.py`,
                contributingChanges: [{
                    nodeId: semanticChanges[0].nodeId,
                    semanticType: change.type,
                    contribution: impact
                }]
            };
        }
        
        // Select tests above threshold
        const threshold = this.config.selectionThreshold;
        const selectedTests = Object.values(testImpacts)
            .filter(impact => impact.impactScore > threshold)
            .map(impact => impact.testId);
        
        // Simulate test execution and fault detection
        const faultsDetected = this.simulateFaultDetection(selectedTests, change.injectedFaults);
        const executionTime = Date.now() - startTime;
        
        return this.calculateApproachResult(
            'SIKG',
            selectedTests,
            availableTests,
            change.injectedFaults,
            faultsDetected,
            executionTime
        );
    }

    /**
     * Run random baseline
     */
    private async runRandomBaseline(
        change: SyntheticChange,
        availableTests: string[],
        subject: any
    ): Promise<ApproachResult> {
        const startTime = Date.now();
        
        const selectedTests = await this.baselines.random.selectTests(
            availableTests,
            [change.filePath]
        );
        
        const faultsDetected = this.simulateFaultDetection(selectedTests, change.injectedFaults);
        const executionTime = Date.now() - startTime;
        
        return this.calculateApproachResult(
            'Random',
            selectedTests,
            availableTests,
            change.injectedFaults,
            faultsDetected,
            executionTime
        );
    }

    /**
     * Run Ekstazi-style baseline
     */
    private async runEkstaziBaseline(
        change: SyntheticChange,
        availableTests: string[],
        subject: any
    ): Promise<ApproachResult> {
        const startTime = Date.now();
        
        const selectedTests = await this.baselines.ekstazi.selectTests(
            availableTests,
            [change.filePath] // Changed files
        );
        
        const faultsDetected = this.simulateFaultDetection(selectedTests, change.injectedFaults);
        const executionTime = Date.now() - startTime;
        
        return this.calculateApproachResult(
            'Ekstazi-RTS',
            selectedTests,
            availableTests,
            change.injectedFaults,
            faultsDetected,
            executionTime
        );
    }

    /**
     * Run history-based baseline
     */
    private async runHistoryBaseline(
        change: SyntheticChange,
        availableTests: string[],
        subject: any
    ): Promise<ApproachResult> {
        const startTime = Date.now();
        
        const selectedTests = await this.baselines.history.selectTests(
            availableTests,
            [change.filePath]
        );
        
        const faultsDetected = this.simulateFaultDetection(selectedTests, change.injectedFaults);
        const executionTime = Date.now() - startTime;
        
        return this.calculateApproachResult(
            'History-TCP',
            selectedTests,
            availableTests,
            change.injectedFaults,
            faultsDetected,
            executionTime
        );
    }

    /**
     * Calculate approach result metrics
     */
    private calculateApproachResult(
        approach: string,
        selectedTests: string[],
        availableTests: string[],
        injectedFaults: any[],
        faultsDetected: number,
        executionTime: number
    ): ApproachResult {
        const totalFaults = injectedFaults.length;
        
        // Calculate precision and recall
        const truePositives = faultsDetected;
        const falsePositives = Math.max(0, selectedTests.length - truePositives);
        const falseNegatives = Math.max(0, totalFaults - truePositives);
        
        const precision = selectedTests.length > 0 ? truePositives / selectedTests.length : 0;
        const recall = totalFaults > 0 ? truePositives / totalFaults : 0;
        const f1Score = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;
        
        // Calculate APFD (simplified)
        const apfd = this.calculateSimpleAPFD(selectedTests.length, faultsDetected);
        
        // Calculate reduction ratio
        const reductionRatio = availableTests.length > 0 ? 1 - (selectedTests.length / availableTests.length) : 0;
        
        return {
            approach,
            precision: Math.min(1, precision),
            recall: Math.min(1, recall),
            f1Score: Math.min(1, f1Score),
            apfd,
            reductionRatio,
            executionTime,
            selectedTests: selectedTests.length,
            faultsDetected,
            totalFaults
        };
    }

    /**
     * Simulate fault detection based on test selection and fault characteristics
     */
    private simulateFaultDetection(selectedTests: string[], injectedFaults: any[]): number {
        let detected = 0;
        
        for (const fault of injectedFaults) {
            // Base detection probability based on fault detectability
            let detectionProb = fault.detectability || 0.7;
            
            // Increase probability based on number of selected tests
            const coverageBonus = Math.min(0.3, selectedTests.length / 100);
            detectionProb += coverageBonus;
            
            // Random factor to simulate real-world variability
            if (Math.random() < detectionProb) {
                detected++;
            }
        }
        
        return detected;
    }

    /**
     * Calculate improvement percentage
     */
    private calculateImprovement(sikgScore: number, baselineScore: number): number {
        if (baselineScore === 0) return sikgScore > 0 ? 100 : 0;
        return ((sikgScore - baselineScore) / baselineScore) * 100;
    }

    /**
     * Check if difference is statistically significant (simplified)
     */
    private isStatisticallySignificant(result1: ApproachResult, result2: ApproachResult): boolean {
        // Simplified significance test - in practice would use proper statistical tests
        const difference = Math.abs(result1.f1Score - result2.f1Score);
        return difference > 0.05; // 5% difference threshold
    }

    /**
     * Determine best performing approach
     */
    private determineBestApproach(results: ApproachResult[]): string {
        return results.reduce((best, current) => 
            current.f1Score > best.f1Score ? current : best
        ).approach;
    }

    /**
     * Generate comparison summary
     */
    private generateComparisonSummary(results: ComparisonResult[]): ComparisonSummary {
        const totalComparisons = results.length;
        const sikgWins = results.filter(r => r.bestApproach === 'SIKG').length;
        
        // Calculate average improvements
        const avgImprovement = {
            overRandom: this.average(results.map(r => r.sikgImprovement.overRandom)),
            overEkstazi: this.average(results.map(r => r.sikgImprovement.overEkstazi)),
            overHistory: this.average(results.map(r => r.sikgImprovement.overHistory))
        };
        
        // Group by change type
        const changeTypes = [...new Set(results.map(r => r.changeType))];
        const byChangeType: Record<ChangeType, any> = {
            BUG_FIX: null,
            FEATURE_ADDITION: null,
            REFACTORING_LOGIC: null,
            REFACTORING_SIGNATURE: null,
            DEPENDENCY_UPDATE: null,
            PERFORMANCE_OPT: null
        };
        
        for (const changeType of changeTypes) {
            const typeResults = results.filter(r => r.changeType === changeType);
            byChangeType[changeType] = {
                comparisons: typeResults.length,
                sikgWins: typeResults.filter(r => r.bestApproach === 'SIKG').length,
                avgImprovement: this.average(typeResults.map(r => r.sikgImprovement.overRandom))
            };
        }
        
        // Group by subject
        const subjects = [...new Set(results.map(r => r.subjectProject))];
        const bySubject: Record<string, any> = {};
        
        for (const subject of subjects) {
            const subjectResults = results.filter(r => r.subjectProject === subject);
            bySubject[subject] = {
                comparisons: subjectResults.length,
                sikgWins: subjectResults.filter(r => r.bestApproach === 'SIKG').length,
                avgF1Score: this.average(subjectResults.map(r => r.sikgResult.f1Score))
            };
        }
        
        // Statistical significance
        const statisticalSignificance = {
            vsRandom: (results.filter(r => r.significance.vsRandom).length / totalComparisons) * 100,
            vsEkstazi: (results.filter(r => r.significance.vsEkstazi).length / totalComparisons) * 100,
            vsHistory: (results.filter(r => r.significance.vsHistory).length / totalComparisons) * 100
        };
        
        return {
            totalComparisons,
            sikgWins,
            sikgWinRate: (sikgWins / totalComparisons) * 100,
            avgImprovement,
            byChangeType,
            bySubject,
            statisticalSignificance
        };
    }

    /**
     * Initialize baselines with synthetic data
     */
    private async initializeBaselines(): Promise<void> {
        // Initialize Ekstazi with synthetic test-file mappings
        const testIds = Array.from({length: 100}, (_, i) => `test_${i}`);
        const codeFiles = Array.from({length: 50}, (_, i) => `module_${i}.py`);
        const testMappings = (this.baselines.ekstazi as any).constructor.createSyntheticMappings(
            testIds, codeFiles, 0.3
        );
        (this.baselines.ekstazi as any).initialize(testMappings);
        
        // Initialize History baseline with synthetic test history
        const testHistory = (this.baselines.history as any).constructor.generateSyntheticHistory(
            testIds, 200
        );
        (this.baselines.history as any).initialize(testHistory);
        
        Logger.debug('Baselines initialized with synthetic data');
    }

    /**
     * Generate synthetic change for comparison
     */
    private generateSyntheticChange(subject: any, changeType: ChangeType): SyntheticChange {
        const changes = this.dataCollector.generateSyntheticChanges(
            [`${subject.name}/module.py`], [changeType], 1
        );
        return changes[0];
    }

    /**
     * Generate synthetic test suite
     */
    private generateSyntheticTests(subject: any, count: number): string[] {
        return Array.from({length: count}, (_, i) => `test_${subject.name}_${i}`);
    }

    /**
     * Calculate simple APFD
     */
    private calculateSimpleAPFD(selectedTests: number, faultsDetected: number): number {
        if (selectedTests === 0 || faultsDetected === 0) return 0;
        
        // Simplified APFD assuming uniform fault distribution
        const avgFaultPosition = selectedTests / 2;
        return 1 - (avgFaultPosition / selectedTests) + (1 / (2 * selectedTests));
    }

    /**
     * Record comparison experiment data
     */
    private recordComparisonExperiment(comparison: ComparisonResult, iteration: number): void {
        const baseData = {
            timestamp: '',
            experimentId: `comparison_${comparison.scenario}_${iteration}`,
            subjectProject: comparison.subjectProject,
            changeType: comparison.changeType,
            iteration,
            changedFiles: ['synthetic_file.py'],
            configuration: { comparisonMode: true }
        };
        
        // Record each approach
        for (const result of [comparison.sikgResult, comparison.randomResult, comparison.ekstaziResult, comparison.historyResult]) {
            const experimentData: ExperimentData = {
                ...baseData,
                approach: result.approach,
                totalTests: 100, // Assuming 100 total tests
                selectedTests: result.selectedTests,
                executionTime: result.executionTime,
                faultsDetected: result.faultsDetected,
                faultsInjected: result.totalFaults,
                precision: result.precision,
                recall: result.recall,
                f1Score: result.f1Score,
                apfd: result.apfd,
                reductionRatio: result.reductionRatio,
                avgTestTime: 1000
            };
            
            this.dataCollector.recordExperiment(experimentData);
        }
    }

    /**
     * Save comparison results
     */
    private saveComparisonResults(results: ComparisonResult[], summary: ComparisonSummary): void {
        const filename = `comparison_results_${Date.now()}.json`;
        const exportData = {
            metadata: {
                generatedAt: new Date().toISOString(),
                totalComparisons: results.length,
                version: '1.0.0'
            },
            summary,
            detailedResults: results
        };
        
        this.dataCollector.exportData(filename);
        
        Logger.info('📊 Comparison results saved');
        Logger.info(`  SIKG Win Rate: ${summary.sikgWinRate.toFixed(1)}%`);
        Logger.info(`  Avg Improvement over Random: ${summary.avgImprovement.overRandom.toFixed(1)}%`);
        Logger.info(`  Avg Improvement over Ekstazi: ${summary.avgImprovement.overEkstazi.toFixed(1)}%`);
        Logger.info(`  Avg Improvement over History: ${summary.avgImprovement.overHistory.toFixed(1)}%`);
    }

    /**
     * Calculate average of array
     */
    private average(numbers: number[]): number {
        if (numbers.length === 0) return 0;
        return numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
    }

    /**
     * Get comparison statistics
     */
    public getComparisonStats(): any {
        return {
            baselines: Object.keys(this.baselines),
            initialized: true,
            config: this.config
        };
    }
}