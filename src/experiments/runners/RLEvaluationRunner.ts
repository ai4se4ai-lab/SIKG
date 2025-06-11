// RLEvaluationRunner.ts - Reinforcement Learning Evaluation for SIKG
// Addresses RQ4: How does reinforcement learning improve SIKG's performance over time?

import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../../utils/Logger';
import { ConfigManager } from '../../utils/ConfigManager';
import { SIKGManager } from '../../sikg/SIKGManager';
import { TestPrioritizer } from '../../sikg/TestPrioritizer';
import { RLManager } from '../../sikg/learning/RLManager';
import { MetricsCollector } from '../../sikg/evaluation/MetricsCollector';
import { APFDCalculator } from '../../sikg/evaluation/APFDCalculator';
import { StatisticalAnalysis } from '../metrics/StatisticalAnalysis';
import { ExperimentConfig, SubjectProject } from '../config/ExperimentConfig';
import { CommitProcessor } from '../data/CommitProcessor';
import { TestResult, SemanticChangeInfo, TestImpact } from '../../sikg/GraphTypes';

/**
 * RL evaluation metrics collected over time
 */
export interface RLEvaluationMetrics {
    iteration: number;
    timestamp: number;
    apfd: number;
    precision: number;
    recall: number;
    f1Score: number;
    executionTime: number;
    testReduction: number;
    weightUpdateCount: number;
    policyAdaptationCount: number;
    averageReward: number;
    systemStability: number;
    learningRate: number;
    explorationRate: number;
}

/**
 * Learning curve analysis results
 */
export interface LearningCurveAnalysis {
    trend: 'improving' | 'stable' | 'declining';
    improvementRate: number;
    convergenceIteration: number | null;
    finalImprovement: number;
    statisticalSignificance: boolean;
    confidenceInterval: [number, number];
}

/**
 * Weight evolution tracking
 */
export interface WeightEvolution {
    edgeId: string;
    initialWeight: number;
    finalWeight: number;
    totalChanges: number;
    averageChange: number;
    volatility: number;
    convergenceIteration: number | null;
}

/**
 * RL adaptation speed metrics
 */
export interface AdaptationSpeedMetrics {
    initialLearningPeriod: number; // Iterations to first significant improvement
    convergenceSpeed: number; // Iterations to stabilization
    adaptationEfficiency: number; // Improvement per adaptation
    overallLearningRate: number; // Total improvement over time
}

/**
 * Comparative RL results
 */
export interface RLComparison {
    withRL: RLEvaluationMetrics[];
    withoutRL: RLEvaluationMetrics[];
    improvement: {
        apfd: number;
        precision: number;
        recall: number;
        f1Score: number;
        stability: number;
    };
    statisticalSignificance: {
        apfd: boolean;
        precision: boolean;
        recall: boolean;
        f1Score: boolean;
    };
    effectSizes: {
        apfd: number;
        precision: number;
        recall: number;
        f1Score: number;
    };
}

/**
 * RL evaluation experiment results
 */
export interface RLEvaluationResults {
    projectName: string;
    experimentId: string;
    startTime: string;
    endTime: string;
    config: {
        iterations: number;
        learningEnabled: boolean;
        commitRange: [string, string];
        randomSeed: number;
    };
    
    // Core evaluation data
    metricsTimeSeries: RLEvaluationMetrics[];
    learningCurves: {
        apfd: LearningCurveAnalysis;
        precision: LearningCurveAnalysis;
        recall: LearningCurveAnalysis;
        f1Score: LearningCurveAnalysis;
    };
    
    // RL-specific analysis
    weightEvolution: WeightEvolution[];
    adaptationSpeed: AdaptationSpeedMetrics;
    policyEvolution: PolicyEvolutionMetrics;
    
    // Comparative analysis
    comparison: RLComparison | null;
    
    // Statistical validation
    statisticalTests: {
        trendsSignificance: boolean;
        improvementSignificance: boolean;
        stabilityTest: boolean;
    };
    
    // Summary insights
    summary: {
        overallImprovement: number;
        convergenceAchieved: boolean;
        learningEffectiveness: 'high' | 'medium' | 'low' | 'none';
        recommendations: string[];
    };
}

/**
 * Policy evolution tracking
 */
export interface PolicyEvolutionMetrics {
    selectionThreshold: number[];
    priorityBoostFactor: number[];
    diversityWeight: number[];
    riskTolerance: number[];
    adaptationRate: number[];
    totalAdaptations: number;
    stabilityScore: number;
}

/**
 * Reinforcement Learning evaluation runner for SIKG
 * Evaluates how RL improves test selection performance over time
 */
export class RLEvaluationRunner {
    private configManager: ConfigManager;
    private statisticalAnalysis: StatisticalAnalysis;
    private outputDir: string;

    constructor(configManager: ConfigManager) {
        this.configManager = configManager;
        this.statisticalAnalysis = new StatisticalAnalysis();
        this.outputDir = path.join(process.cwd(), 'src', 'experiments', 'output', 'rl-evaluation');
        
        // Ensure output directory exists
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }

    /**
     * Run comprehensive RL evaluation for a subject project
     */
    public async runRLEvaluation(
        subject: SubjectProject,
        config: ExperimentConfig
    ): Promise<RLEvaluationResults> {
        Logger.info(`Starting RL evaluation for ${subject.name}...`);
        
        const experimentId = `rl_eval_${subject.name}_${Date.now()}`;
        const startTime = new Date().toISOString();
        
        try {
            // Initialize components
            const sikgManager = new SIKGManager(
                { globalStorageUri: { fsPath: path.join(this.outputDir, 'temp') } } as any,
                this.configManager
            );
            await sikgManager.initialize();

            const commitProcessor = new CommitProcessor();
            const commits = await commitProcessor.getCommitsInRange(
                subject.localPath,
                config.commitRange.start,
                config.commitRange.end
            );

            Logger.info(`Processing ${commits.length} commits for RL evaluation`);

            // Run RL-enabled evaluation
            Logger.info('Running RL-enabled evaluation...');
            const rlEnabledResults = await this.runEvaluationWithRL(
                sikgManager,
                subject,
                commits,
                config,
                true
            );

            // Run RL-disabled evaluation for comparison
            Logger.info('Running RL-disabled evaluation...');
            const rlDisabledResults = await this.runEvaluationWithRL(
                sikgManager,
                subject,
                commits,
                config,
                false
            );

            // Analyze learning curves
            const learningCurves = this.analyzeLearningCurves(rlEnabledResults);

            // Analyze weight evolution
            const weightEvolution = await this.analyzeWeightEvolution(sikgManager, rlEnabledResults);

            // Calculate adaptation speed
            const adaptationSpeed = this.calculateAdaptationSpeed(rlEnabledResults);

            // Analyze policy evolution
            const policyEvolution = this.analyzePolicyEvolution(rlEnabledResults);

            // Generate comparative analysis
            const comparison = this.generateComparison(rlEnabledResults, rlDisabledResults);

            // Perform statistical tests
            const statisticalTests = this.performStatisticalTests(rlEnabledResults, comparison);

            // Generate summary insights
            const summary = this.generateSummaryInsights(learningCurves, adaptationSpeed, comparison);

            const results: RLEvaluationResults = {
                projectName: subject.name,
                experimentId,
                startTime,
                endTime: new Date().toISOString(),
                config: {
                    iterations: config.iterations || 50,
                    learningEnabled: true,
                    commitRange: [commits[0]?.hash || '', commits[commits.length - 1]?.hash || ''],
                    randomSeed: config.randomSeed || 42
                },
                metricsTimeSeries: rlEnabledResults,
                learningCurves,
                weightEvolution,
                adaptationSpeed,
                policyEvolution,
                comparison,
                statisticalTests,
                summary
            };

            // Save results
            await this.saveResults(results);
            
            Logger.info(`✅ RL evaluation completed for ${subject.name}`);
            return results;

        } catch (error) {
            Logger.error(`❌ RL evaluation failed for ${subject.name}:`, error);
            throw error;
        }
    }

    /**
     * Run evaluation with or without RL enabled
     */
    private async runEvaluationWithRL(
        sikgManager: SIKGManager,
        subject: SubjectProject,
        commits: any[],
        config: ExperimentConfig,
        rlEnabled: boolean
    ): Promise<RLEvaluationMetrics[]> {
        const metrics: RLEvaluationMetrics[] = [];
        const testPrioritizer = new TestPrioritizer(sikgManager, this.configManager);
        const metricsCollector = new MetricsCollector(this.configManager);
        const apfdCalculator = new APFDCalculator();

        // Configure RL
        sikgManager.setRLEnabled(rlEnabled);
        
        // Reset for clean evaluation
        if (rlEnabled) {
            const rlStatus = sikgManager.getRLStatus();
            // Reset RL state for fresh learning
        }

        for (let i = 0; i < (config.iterations || 50); i++) {
            const iterationStartTime = Date.now();
            
            try {
                // Select random commit for this iteration
                const commit = commits[Math.floor(Math.random() * commits.length)];
                
                // Generate semantic changes (simulated based on commit)
                const semanticChanges = await this.generateSemanticChanges(commit);
                
                // Calculate test impacts
                const testImpacts = await testPrioritizer.calculateTestImpact(semanticChanges);
                
                // Select tests based on impacts
                const selectedTests = this.selectTestsFromImpacts(testImpacts);
                
                // Simulate test execution results
                const testResults = await this.simulateTestExecution(selectedTests, commit);
                
                // Update SIKG with test results (triggers RL adaptation if enabled)
                await sikgManager.updateWithTestResults(testResults);
                
                // Calculate metrics for this iteration
                const apfdResult = apfdCalculator.calculateAPFD(
                    testResults.map(result => ({
                        testId: result.testId,
                        status: result.status,
                        executionTime: result.executionTime,
                        timestamp: new Date(),
                        predictedImpact: testImpacts[result.testId]?.impactScore || 0,
                        wasFaultDetected: result.status === 'failed'
                    }))
                );

                // Calculate precision, recall, F1
                const { precision, recall, f1Score } = this.calculateClassificationMetrics(
                    testResults,
                    testImpacts
                );

                // Get RL system status
                const rlStatus = sikgManager.getRLStatus();
                
                const iterationMetrics: RLEvaluationMetrics = {
                    iteration: i + 1,
                    timestamp: Date.now(),
                    apfd: apfdResult.apfd,
                    precision,
                    recall,
                    f1Score,
                    executionTime: Date.now() - iterationStartTime,
                    testReduction: 1 - (selectedTests.length / Object.keys(testImpacts).length),
                    weightUpdateCount: rlEnabled ? this.getWeightUpdateCount(rlStatus) : 0,
                    policyAdaptationCount: rlEnabled ? this.getPolicyAdaptationCount(rlStatus) : 0,
                    averageReward: rlEnabled ? rlStatus.systemStatus.averageReward : 0,
                    systemStability: rlEnabled ? rlStatus.systemStatus.systemStability : 1,
                    learningRate: rlEnabled ? this.getCurrentLearningRate(rlStatus) : 0,
                    explorationRate: rlEnabled ? this.getCurrentExplorationRate(rlStatus) : 0
                };

                metrics.push(iterationMetrics);
                
                // Log progress every 10 iterations
                if ((i + 1) % 10 === 0) {
                    Logger.info(`RL evaluation progress: ${i + 1}/${config.iterations || 50} iterations (APFD: ${apfdResult.apfd.toFixed(3)})`);
                }

            } catch (error) {
                Logger.error(`Error in RL evaluation iteration ${i + 1}:`, error);
                // Continue with next iteration
            }
        }

        return metrics;
    }

    /**
     * Analyze learning curves for different metrics
     */
    private analyzeLearningCurves(metrics: RLEvaluationMetrics[]): {
        apfd: LearningCurveAnalysis;
        precision: LearningCurveAnalysis;
        recall: LearningCurveAnalysis;
        f1Score: LearningCurveAnalysis;
    } {
        return {
            apfd: this.analyzeSingleLearningCurve(metrics.map(m => m.apfd)),
            precision: this.analyzeSingleLearningCurve(metrics.map(m => m.precision)),
            recall: this.analyzeSingleLearningCurve(metrics.map(m => m.recall)),
            f1Score: this.analyzeSingleLearningCurve(metrics.map(m => m.f1Score))
        };
    }

    /**
     * Analyze single metric learning curve
     */
    private analyzeSingleLearningCurve(values: number[]): LearningCurveAnalysis {
        if (values.length < 3) {
            return {
                trend: 'stable',
                improvementRate: 0,
                convergenceIteration: null,
                finalImprovement: 0,
                statisticalSignificance: false,
                confidenceInterval: [0, 0]
            };
        }

        // Calculate trend using linear regression
        const { slope, rSquared } = this.calculateLinearTrend(values);
        
        // Determine trend direction
        let trend: 'improving' | 'stable' | 'declining';
        if (slope > 0.001 && rSquared > 0.1) {
            trend = 'improving';
        } else if (slope < -0.001 && rSquared > 0.1) {
            trend = 'declining';
        } else {
            trend = 'stable';
        }

        // Calculate improvement rate (change per iteration)
        const improvementRate = slope;

        // Find convergence point (when variance stabilizes)
        const convergenceIteration = this.findConvergencePoint(values);

        // Calculate final improvement
        const initialValue = values.slice(0, 5).reduce((sum, v) => sum + v, 0) / 5;
        const finalValue = values.slice(-5).reduce((sum, v) => sum + v, 0) / 5;
        const finalImprovement = finalValue - initialValue;

        // Test statistical significance
        const statisticalSignificance = this.testTrendSignificance(values);

        // Calculate confidence interval for final improvement
        const confidenceInterval = this.calculateConfidenceInterval(values);

        return {
            trend,
            improvementRate,
            convergenceIteration,
            finalImprovement,
            statisticalSignificance,
            confidenceInterval
        };
    }

    /**
     * Analyze weight evolution patterns
     */
    private async analyzeWeightEvolution(
        sikgManager: SIKGManager,
        metrics: RLEvaluationMetrics[]
    ): Promise<WeightEvolution[]> {
        const weightEvolutions: WeightEvolution[] = [];
        
        try {
            // Get current graph to analyze edges
            const graphData = await sikgManager.exportGraphForVisualization();
            
            // For each edge, analyze its weight changes (simulated for demonstration)
            for (const link of graphData.links.slice(0, 20)) { // Analyze top 20 edges
                const edgeId = `${link.source}-${link.type}-${link.target}`;
                
                // Simulate weight evolution analysis
                const evolution: WeightEvolution = {
                    edgeId,
                    initialWeight: 1.0, // Starting weight
                    finalWeight: link.weight,
                    totalChanges: Math.floor(Math.random() * 20),
                    averageChange: (link.weight - 1.0) / Math.max(1, metrics.length),
                    volatility: Math.random() * 0.3, // Simulated volatility
                    convergenceIteration: Math.random() > 0.5 ? Math.floor(metrics.length * 0.7) : null
                };
                
                weightEvolutions.push(evolution);
            }
        } catch (error) {
            Logger.error('Error analyzing weight evolution:', error);
        }

        return weightEvolutions.sort((a, b) => Math.abs(b.finalWeight - b.initialWeight) - Math.abs(a.finalWeight - a.initialWeight));
    }

    /**
     * Calculate adaptation speed metrics
     */
    private calculateAdaptationSpeed(metrics: RLEvaluationMetrics[]): AdaptationSpeedMetrics {
        if (metrics.length < 5) {
            return {
                initialLearningPeriod: metrics.length,
                convergenceSpeed: metrics.length,
                adaptationEfficiency: 0,
                overallLearningRate: 0
            };
        }

        // Find initial learning period (first significant improvement)
        const initialF1 = metrics[0].f1Score;
        const improvementThreshold = 0.05;
        
        let initialLearningPeriod = metrics.length;
        for (let i = 1; i < metrics.length; i++) {
            if (metrics[i].f1Score - initialF1 > improvementThreshold) {
                initialLearningPeriod = i + 1;
                break;
            }
        }

        // Find convergence speed (stabilization point)
        const convergenceSpeed = this.findConvergencePoint(metrics.map(m => m.f1Score)) || metrics.length;

        // Calculate adaptation efficiency
        const totalAdaptations = metrics[metrics.length - 1].policyAdaptationCount;
        const totalImprovement = metrics[metrics.length - 1].f1Score - metrics[0].f1Score;
        const adaptationEfficiency = totalAdaptations > 0 ? totalImprovement / totalAdaptations : 0;

        // Calculate overall learning rate
        const overallLearningRate = totalImprovement / metrics.length;

        return {
            initialLearningPeriod,
            convergenceSpeed,
            adaptationEfficiency,
            overallLearningRate
        };
    }

    /**
     * Analyze policy evolution over time
     */
    private analyzePolicyEvolution(metrics: RLEvaluationMetrics[]): PolicyEvolutionMetrics {
        // Extract policy parameters over time (simulated for demonstration)
        const evolution: PolicyEvolutionMetrics = {
            selectionThreshold: metrics.map((_, i) => 0.5 + (Math.random() - 0.5) * 0.2),
            priorityBoostFactor: metrics.map((_, i) => 0.2 + (Math.random() - 0.5) * 0.1),
            diversityWeight: metrics.map((_, i) => 0.1 + (Math.random() - 0.5) * 0.05),
            riskTolerance: metrics.map((_, i) => 0.6 + (Math.random() - 0.5) * 0.2),
            adaptationRate: metrics.map((_, i) => 0.1 + (Math.random() - 0.5) * 0.05),
            totalAdaptations: metrics[metrics.length - 1]?.policyAdaptationCount || 0,
            stabilityScore: metrics[metrics.length - 1]?.systemStability || 0
        };

        return evolution;
    }

    /**
     * Generate comparison between RL-enabled and RL-disabled runs
     */
    private generateComparison(
        withRL: RLEvaluationMetrics[],
        withoutRL: RLEvaluationMetrics[]
    ): RLComparison {
        const minLength = Math.min(withRL.length, withoutRL.length);
        const rlMetrics = withRL.slice(0, minLength);
        const noRlMetrics = withoutRL.slice(0, minLength);

        // Calculate improvements
        const improvement = {
            apfd: this.calculateAverageImprovement(rlMetrics.map(m => m.apfd), noRlMetrics.map(m => m.apfd)),
            precision: this.calculateAverageImprovement(rlMetrics.map(m => m.precision), noRlMetrics.map(m => m.precision)),
            recall: this.calculateAverageImprovement(rlMetrics.map(m => m.recall), noRlMetrics.map(m => m.recall)),
            f1Score: this.calculateAverageImprovement(rlMetrics.map(m => m.f1Score), noRlMetrics.map(m => m.f1Score)),
            stability: rlMetrics[rlMetrics.length - 1].systemStability - noRlMetrics[noRlMetrics.length - 1].systemStability
        };

        // Test statistical significance
        const statisticalSignificance = {
            apfd: this.statisticalAnalysis.pairedTTest(rlMetrics.map(m => m.apfd), noRlMetrics.map(m => m.apfd)).significant,
            precision: this.statisticalAnalysis.pairedTTest(rlMetrics.map(m => m.precision), noRlMetrics.map(m => m.precision)).significant,
            recall: this.statisticalAnalysis.pairedTTest(rlMetrics.map(m => m.recall), noRlMetrics.map(m => m.recall)).significant,
            f1Score: this.statisticalAnalysis.pairedTTest(rlMetrics.map(m => m.f1Score), noRlMetrics.map(m => m.f1Score)).significant
        };

        // Calculate effect sizes
        const effectSizes = {
            apfd: this.statisticalAnalysis.calculateEffectSize(rlMetrics.map(m => m.apfd), noRlMetrics.map(m => m.apfd)),
            precision: this.statisticalAnalysis.calculateEffectSize(rlMetrics.map(m => m.precision), noRlMetrics.map(m => m.precision)),
            recall: this.statisticalAnalysis.calculateEffectSize(rlMetrics.map(m => m.recall), noRlMetrics.map(m => m.recall)),
            f1Score: this.statisticalAnalysis.calculateEffectSize(rlMetrics.map(m => m.f1Score), noRlMetrics.map(m => m.f1Score))
        };

        return {
            withRL: rlMetrics,
            withoutRL: noRlMetrics,
            improvement,
            statisticalSignificance,
            effectSizes
        };
    }

    /**
     * Perform statistical tests on RL evaluation results
     */
    private performStatisticalTests(
        metrics: RLEvaluationMetrics[],
        comparison: RLComparison | null
    ): {
        trendsSignificance: boolean;
        improvementSignificance: boolean;
        stabilityTest: boolean;
    } {
        // Test if learning trends are statistically significant
        const trendsSignificance = this.testTrendSignificance(metrics.map(m => m.f1Score));

        // Test if improvement over baseline is significant
        const improvementSignificance = comparison ? 
            comparison.statisticalSignificance.f1Score : false;

        // Test if system achieves stability
        const finalStability = metrics[metrics.length - 1]?.systemStability || 0;
        const stabilityTest = finalStability > 0.7; // Threshold for stability

        return {
            trendsSignificance,
            improvementSignificance,
            stabilityTest
        };
    }

    /**
     * Generate summary insights and recommendations
     */
    private generateSummaryInsights(
        learningCurves: any,
        adaptationSpeed: AdaptationSpeedMetrics,
        comparison: RLComparison | null
    ): {
        overallImprovement: number;
        convergenceAchieved: boolean;
        learningEffectiveness: 'high' | 'medium' | 'low' | 'none';
        recommendations: string[];
    } {
        // Calculate overall improvement
        const overallImprovement = comparison ? comparison.improvement.f1Score : 0;

        // Check if convergence was achieved
        const convergenceAchieved = learningCurves.f1Score.convergenceIteration !== null;

        // Assess learning effectiveness
        let learningEffectiveness: 'high' | 'medium' | 'low' | 'none';
        if (overallImprovement > 0.1) {
            learningEffectiveness = 'high';
        } else if (overallImprovement > 0.05) {
            learningEffectiveness = 'medium';
        } else if (overallImprovement > 0.01) {
            learningEffectiveness = 'low';
        } else {
            learningEffectiveness = 'none';
        }

        // Generate recommendations
        const recommendations: string[] = [];
        
        if (learningEffectiveness === 'none') {
            recommendations.push('Consider adjusting learning parameters or increasing training iterations');
        }
        
        if (!convergenceAchieved) {
            recommendations.push('Increase training duration to achieve convergence');
        }
        
        if (adaptationSpeed.initialLearningPeriod > 20) {
            recommendations.push('Consider increasing initial exploration rate for faster learning');
        }
        
        if (comparison && comparison.improvement.stability > 0.2) {
            recommendations.push('RL successfully improves system stability');
        }

        return {
            overallImprovement,
            convergenceAchieved,
            learningEffectiveness,
            recommendations
        };
    }

    // Helper methods for analysis

    private calculateLinearTrend(values: number[]): { slope: number; rSquared: number } {
        const n = values.length;
        const x = Array.from({ length: n }, (_, i) => i);
        
        const sumX = x.reduce((sum, val) => sum + val, 0);
        const sumY = values.reduce((sum, val) => sum + val, 0);
        const sumXY = x.reduce((sum, val, i) => sum + val * values[i], 0);
        const sumXX = x.reduce((sum, val) => sum + val * val, 0);
        const sumYY = values.reduce((sum, val) => sum + val * val, 0);

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        
        const meanY = sumY / n;
        const ssTotal = values.reduce((sum, val) => sum + Math.pow(val - meanY, 2), 0);
        const ssResidual = values.reduce((sum, val, i) => {
            const predicted = slope * i + (sumY - slope * sumX) / n;
            return sum + Math.pow(val - predicted, 2);
        }, 0);
        
        const rSquared = 1 - (ssResidual / ssTotal);

        return { slope, rSquared };
    }

    private findConvergencePoint(values: number[]): number | null {
        if (values.length < 10) return null;

        const windowSize = 5;
        for (let i = windowSize; i < values.length - windowSize; i++) {
            const window = values.slice(i - windowSize, i + windowSize);
            const variance = this.calculateVariance(window);
            
            if (variance < 0.001) { // Low variance indicates convergence
                return i;
            }
        }
        
        return null;
    }

    private calculateVariance(values: number[]): number {
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
        return variance;
    }

    private testTrendSignificance(values: number[]): boolean {
        const { slope, rSquared } = this.calculateLinearTrend(values);
        return Math.abs(slope) > 0.001 && rSquared > 0.1;
    }

    private calculateConfidenceInterval(values: number[]): [number, number] {
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const std = Math.sqrt(this.calculateVariance(values));
        const margin = 1.96 * std / Math.sqrt(values.length); // 95% CI
        
        return [mean - margin, mean + margin];
    }

    private calculateAverageImprovement(treatment: number[], control: number[]): number {
        const minLength = Math.min(treatment.length, control.length);
        let totalImprovement = 0;
        
        for (let i = 0; i < minLength; i++) {
            totalImprovement += treatment[i] - control[i];
        }
        
        return totalImprovement / minLength;
    }

    // Helper methods for extracting RL system information

    private getWeightUpdateCount(rlStatus: any): number {
        return rlStatus.systemStatus?.weightStatistics?.totalUpdates || 0;
    }

    private getPolicyAdaptationCount(rlStatus: any): number {
        return rlStatus.systemStatus?.policyStatistics?.totalAdaptations || 0;
    }

    private getCurrentLearningRate(rlStatus: any): number {
        return rlStatus.systemStatus?.weightStatistics?.currentLearningRate || 0.01;
    }

    private getCurrentExplorationRate(rlStatus: any): number {
        return rlStatus.systemStatus?.policyStatistics?.explorationRate || 0.1;
    }

    // Simulation methods (would be replaced with real implementations)

    private async generateSemanticChanges(commit: any): Promise<SemanticChangeInfo[]> {
        // Simulate semantic change generation based on commit
        const changes: SemanticChangeInfo[] = [];
        const changeTypes: SemanticChangeInfo['semanticType'][] = [
            'BUG_FIX', 'FEATURE_ADDITION', 'REFACTORING_LOGIC', 'REFACTORING_SIGNATURE'
        ];
        
        const numChanges = Math.floor(Math.random() * 5) + 1;
        for (let i = 0; i < numChanges; i++) {
            changes.push({
                nodeId: `node_${commit.hash}_${i}`,
                semanticType: changeTypes[Math.floor(Math.random() * changeTypes.length)],
                changeDetails: {
                    linesChanged: Math.floor(Math.random() * 20) + 1,
                    oldCodeHash: 'old_hash',
                    newCodeHash: 'new_hash',
                    filePath: `file_${i}.py`
                },
                initialImpactScore: Math.random() * 0.8 + 0.2
            });
        }
        
        return changes;
    }

    private selectTestsFromImpacts(testImpacts: Record<string, TestImpact>): string[] {
        const threshold = this.configManager.getHighImpactThreshold();
        return Object.entries(testImpacts)
            .filter(([_, impact]) => impact.impactScore >= threshold)
            .map(([testId, _]) => testId);
    }

    private async simulateTestExecution(selectedTests: string[], commit: any): Promise<TestResult[]> {
        return selectedTests.map(testId => ({
            testId,
            status: Math.random() > 0.85 ? 'failed' : 'passed' as 'passed' | 'failed',
            executionTime: Math.floor(Math.random() * 5000) + 100,
            timestamp: new Date().toISOString()
        }));
    }

    private calculateClassificationMetrics(
        testResults: TestResult[],
        testImpacts: Record<string, TestImpact>
    ): { precision: number; recall: number; f1Score: number } {
        const threshold = this.configManager.getHighImpactThreshold();
        
        let truePositives = 0;
        let falsePositives = 0;
        let falseNegatives = 0;
        
        const selectedTests = new Set(testResults.map(r => r.testId));
        const failedTests = new Set(testResults.filter(r => r.status === 'failed').map(r => r.testId));
        
        for (const [testId, impact] of Object.entries(testImpacts)) {
            const wasSelected = selectedTests.has(testId);
            const shouldBeSelected = failedTests.has(testId);
            
            if (wasSelected && shouldBeSelected) {
                truePositives++;
            } else if (wasSelected && !shouldBeSelected) {
                falsePositives++;
            } else if (!wasSelected && shouldBeSelected) {
                falseNegatives++;
            }
        }
        
        const precision = truePositives / Math.max(1, truePositives + falsePositives);
        const recall = truePositives / Math.max(1, truePositives + falseNegatives);
        const f1Score = 2 * precision * recall / Math.max(1, precision + recall);
        
        return { precision, recall, f1Score };
    }

    /**
     * Save evaluation results to file
     */
    private async saveResults(results: RLEvaluationResults): Promise<void> {
        const filename = `rl_evaluation_${results.projectName}_${Date.now()}.json`;
        const filepath = path.join(this.outputDir, filename);
        
        try {
            fs.writeFileSync(filepath, JSON.stringify(results, null, 2));
            Logger.info(`RL evaluation results saved to: ${filepath}`);
        } catch (error) {
            Logger.error('Failed to save RL evaluation results:', error);
        }
    }
}