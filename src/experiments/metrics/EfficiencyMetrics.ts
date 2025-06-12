// EfficiencyMetrics.ts - Test execution efficiency and performance metrics

import { ExperimentData } from '../data/DataCollector';
import { Logger } from '../../utils/Logger';

export interface TimingBreakdown {
    kgConstruction: number;       // ms
    semanticAnalysis: number;     // ms
    impactPropagation: number;    // ms
    testSelection: number;        // ms
    rlAdaptation: number;         // ms
    total: number;                // ms
}

export interface ResourceUsage {
    peakMemoryMB: number;         // Peak memory usage in MB
    avgMemoryMB: number;          // Average memory usage in MB
    cpuUtilization: number;       // CPU utilization percentage (0-100)
    diskIOKB: number;             // Disk I/O in KB
    graphSizeKB: number;          // Knowledge graph size in KB
}

export interface EfficiencyMetrics {
    // Timing metrics
    timing: TimingBreakdown;
    
    // Resource usage
    resources: ResourceUsage;
    
    // Test execution efficiency
    testExecutionSavings: number;         // ms saved compared to full suite
    earlyFaultDetectionTime: number;     // ms to detect first fault
    timeToFirstFault: number;             // ms from start to first fault detection
    
    // Throughput metrics
    testsPerSecond: number;               // Tests analyzed per second
    changesPerSecond: number;             // Code changes processed per second
    nodesPerSecond: number;               // Graph nodes processed per second
    
    // Efficiency ratios
    analysisOverhead: number;             // Analysis time / Test execution time saved
    reductionEfficiency: number;          // Tests reduced / Analysis time
    costBenefitRatio: number;             // Time saved / Time invested
    
    // Scalability indicators
    timeComplexity: string;               // Observed time complexity (O(n), O(n²), etc.)
    memoryComplexity: string;             // Observed memory complexity
    scalingFactor: number;                // Performance degradation factor with size
}

export interface PerformanceProfile {
    approach: string;
    projectSize: number;                  // LOC
    testSuiteSize: number;               // Number of tests
    metrics: EfficiencyMetrics;
    timestamp: Date;
}

export interface EfficiencyComparison {
    baseline: EfficiencyMetrics;
    sikg: EfficiencyMetrics;
    improvement: {
        timeReduction: number;            // % faster
        memoryReduction: number;          // % less memory
        throughputIncrease: number;       // % more throughput
    };
    significance: 'high' | 'medium' | 'low' | 'none';
}

/**
 * Calculates and analyzes efficiency metrics for test selection approaches
 */
export class EfficiencyMetricsCalculator {
    private performanceProfiles: PerformanceProfile[] = [];
    private baselineProfiles: Map<string, PerformanceProfile[]> = new Map();

    constructor() {
        this.initializeBaselines();
    }

    /**
     * Calculate efficiency metrics from experiment data
     */
    public calculateEfficiencyMetrics(data: ExperimentData, timing?: TimingBreakdown, resources?: ResourceUsage): EfficiencyMetrics {
        // Use provided timing or extract from experiment data
        const timingData = timing || this.extractTimingFromData(data);
        const resourceData = resources || this.estimateResourceUsage(data);
        
        // Calculate test execution savings
        const testExecutionSavings = this.calculateTestExecutionSavings(data);
        const earlyFaultDetectionTime = this.calculateEarlyFaultDetectionTime(data);
        
        // Calculate throughput metrics
        const testsPerSecond = data.totalTests / Math.max(1, timingData.total / 1000);
        const changesPerSecond = (data.changedFiles?.length || 1) / Math.max(1, timingData.total / 1000);
        const nodesPerSecond = this.estimateNodesProcessed(data) / Math.max(1, timingData.total / 1000);
        
        // Calculate efficiency ratios
        const analysisOverhead = timingData.total / Math.max(1, testExecutionSavings);
        const reductionEfficiency = (data.totalTests - data.selectedTests) / Math.max(1, timingData.total / 1000);
        const costBenefitRatio = testExecutionSavings / Math.max(1, timingData.total);
        
        // Analyze complexity (simplified)
        const timeComplexity = this.analyzeTimeComplexity(data);
        const memoryComplexity = this.analyzeMemoryComplexity(resourceData);
        const scalingFactor = this.calculateScalingFactor(data);

        return {
            timing: timingData,
            resources: resourceData,
            testExecutionSavings,
            earlyFaultDetectionTime,
            timeToFirstFault: earlyFaultDetectionTime + timingData.total,
            testsPerSecond,
            changesPerSecond,
            nodesPerSecond,
            analysisOverhead,
            reductionEfficiency,
            costBenefitRatio,
            timeComplexity,
            memoryComplexity,
            scalingFactor
        };
    }

    /**
     * Record performance profile for analysis
     */
    public recordPerformanceProfile(
        approach: string,
        projectSize: number,
        testSuiteSize: number,
        metrics: EfficiencyMetrics
    ): void {
        const profile: PerformanceProfile = {
            approach,
            projectSize,
            testSuiteSize,
            metrics,
            timestamp: new Date()
        };

        this.performanceProfiles.push(profile);
        
        // Store as baseline if it's a baseline approach
        if (this.isBaselineApproach(approach)) {
            if (!this.baselineProfiles.has(approach)) {
                this.baselineProfiles.set(approach, []);
            }
            this.baselineProfiles.get(approach)!.push(profile);
        }

        Logger.debug(`Recorded performance profile for ${approach}: ${metrics.timing.total}ms, ${metrics.resources.peakMemoryMB}MB`);
    }

    /**
     * Compare efficiency between SIKG and baseline approaches
     */
    public compareEfficiency(sikgMetrics: EfficiencyMetrics, baselineApproach: string): EfficiencyComparison | null {
        const baselineProfiles = this.baselineProfiles.get(baselineApproach);
        if (!baselineProfiles || baselineProfiles.length === 0) {
            Logger.warn(`No baseline data for ${baselineApproach}`);
            return null;
        }

        // Use most recent baseline profile
        const baselineMetrics = baselineProfiles[baselineProfiles.length - 1].metrics;

        // Calculate improvements
        const timeReduction = this.calculatePercentageImprovement(
            baselineMetrics.timing.total, 
            sikgMetrics.timing.total
        );
        
        const memoryReduction = this.calculatePercentageImprovement(
            baselineMetrics.resources.peakMemoryMB,
            sikgMetrics.resources.peakMemoryMB
        );
        
        const throughputIncrease = this.calculatePercentageImprovement(
            sikgMetrics.testsPerSecond,
            baselineMetrics.testsPerSecond
        ) - 100; // Convert to increase rather than decrease

        // Assess significance
        const significance = this.assessSignificance(timeReduction, memoryReduction, throughputIncrease);

        return {
            baseline: baselineMetrics,
            sikg: sikgMetrics,
            improvement: {
                timeReduction,
                memoryReduction,
                throughputIncrease
            },
            significance
        };
    }

    /**
     * Analyze scalability across different project sizes
     */
    public analyzeScalability(approach: string): {
        scalabilityTrend: 'linear' | 'quadratic' | 'exponential' | 'constant';
        performanceGrowth: number;  // Factor of performance degradation per 10K LOC
        memoryGrowth: number;       // Factor of memory growth per 10K LOC
        optimalProjectSize?: number; // LOC where performance is optimal
    } {
        const profiles = this.performanceProfiles.filter(p => p.approach === approach);
        if (profiles.length < 3) {
            return {
                scalabilityTrend: 'constant',
                performanceGrowth: 1.0,
                memoryGrowth: 1.0
            };
        }

        // Sort by project size
        profiles.sort((a, b) => a.projectSize - b.projectSize);

        // Analyze time growth
        const timeGrowthFactors: number[] = [];
        const memoryGrowthFactors: number[] = [];

        for (let i = 1; i < profiles.length; i++) {
            const current = profiles[i];
            const previous = profiles[i - 1];
            
            const sizeRatio = current.projectSize / previous.projectSize;
            const timeRatio = current.metrics.timing.total / previous.metrics.timing.total;
            const memoryRatio = current.metrics.resources.peakMemoryMB / previous.metrics.resources.peakMemoryMB;
            
            // Normalize to per 10K LOC growth
            const sizeFactor = sizeRatio * (10000 / (current.projectSize - previous.projectSize));
            timeGrowthFactors.push(timeRatio / sizeFactor);
            memoryGrowthFactors.push(memoryRatio / sizeFactor);
        }

        const avgTimeGrowth = this.average(timeGrowthFactors);
        const avgMemoryGrowth = this.average(memoryGrowthFactors);

        // Determine scalability trend
        let scalabilityTrend: 'linear' | 'quadratic' | 'exponential' | 'constant';
        if (avgTimeGrowth < 1.1) {
            scalabilityTrend = 'constant';
        } else if (avgTimeGrowth < 1.5) {
            scalabilityTrend = 'linear';
        } else if (avgTimeGrowth < 2.5) {
            scalabilityTrend = 'quadratic';
        } else {
            scalabilityTrend = 'exponential';
        }

        // Find optimal project size (if any)
        const optimalProjectSize = this.findOptimalProjectSize(profiles);

        return {
            scalabilityTrend,
            performanceGrowth: avgTimeGrowth,
            memoryGrowth: avgMemoryGrowth,
            optimalProjectSize
        };
    }

    /**
     * Calculate cost-benefit analysis
     */
    public calculateCostBenefit(metrics: EfficiencyMetrics, fullSuiteExecutionTime: number): {
        analysisTime: number;
        timeSaved: number;
        netBenefit: number;
        roi: number; // Return on investment (time saved / time invested)
        breakEvenPoint: number; // How many test runs to break even
    } {
        const analysisTime = metrics.timing.total;
        const timeSaved = metrics.testExecutionSavings;
        const netBenefit = timeSaved - analysisTime;
        const roi = timeSaved / Math.max(1, analysisTime);
        const breakEvenPoint = analysisTime / Math.max(1, timeSaved);

        return {
            analysisTime,
            timeSaved,
            netBenefit,
            roi,
            breakEvenPoint
        };
    }

    /**
     * Generate efficiency summary report
     */
    public generateEfficiencySummary(approach: string): {
        totalProfiles: number;
        avgExecutionTime: number;
        avgMemoryUsage: number;
        avgThroughput: number;
        bestPerformance: PerformanceProfile | null;
        worstPerformance: PerformanceProfile | null;
        scalabilityAnalysis: any;
    } {
        const profiles = this.performanceProfiles.filter(p => p.approach === approach);
        
        if (profiles.length === 0) {
            return {
                totalProfiles: 0,
                avgExecutionTime: 0,
                avgMemoryUsage: 0,
                avgThroughput: 0,
                bestPerformance: null,
                worstPerformance: null,
                scalabilityAnalysis: null
            };
        }

        const avgExecutionTime = this.average(profiles.map(p => p.metrics.timing.total));
        const avgMemoryUsage = this.average(profiles.map(p => p.metrics.resources.peakMemoryMB));
        const avgThroughput = this.average(profiles.map(p => p.metrics.testsPerSecond));

        // Find best and worst performing profiles
        const bestPerformance = profiles.reduce((best, current) => 
            current.metrics.timing.total < best.metrics.timing.total ? current : best
        );
        
        const worstPerformance = profiles.reduce((worst, current) => 
            current.metrics.timing.total > worst.metrics.timing.total ? current : worst
        );

        const scalabilityAnalysis = this.analyzeScalability(approach);

        return {
            totalProfiles: profiles.length,
            avgExecutionTime,
            avgMemoryUsage,
            avgThroughput,
            bestPerformance,
            worstPerformance,
            scalabilityAnalysis
        };
    }

    /**
     * Extract timing data from experiment data
     */
    private extractTimingFromData(data: ExperimentData): TimingBreakdown {
        // Use provided timing or estimate based on execution time
        const total = data.executionTime;
        
        // Estimate breakdown (these would be measured in real implementation)
        return {
            kgConstruction: total * 0.3,      // 30% for KG construction
            semanticAnalysis: total * 0.2,    // 20% for semantic analysis
            impactPropagation: total * 0.25,  // 25% for impact propagation
            testSelection: total * 0.15,      // 15% for test selection
            rlAdaptation: total * 0.1,        // 10% for RL adaptation
            total: total
        };
    }

    /**
     * Estimate resource usage from experiment data
     */
    private estimateResourceUsage(data: ExperimentData): ResourceUsage {
        // Estimate based on project characteristics
        const baseMemory = 50; // 50MB base
        const memoryPerTest = 0.1; // 0.1MB per test
        const memoryPerFile = 2; // 2MB per file
        
        const estimatedMemory = baseMemory + 
            (data.totalTests * memoryPerTest) + 
            ((data.changedFiles?.length || 1) * memoryPerFile);

        return {
            peakMemoryMB: estimatedMemory,
            avgMemoryMB: estimatedMemory * 0.8,
            cpuUtilization: Math.min(100, 20 + (data.totalTests / 10)), // Estimate CPU usage
            diskIOKB: (data.changedFiles?.length || 1) * 100, // Estimate disk I/O
            graphSizeKB: data.totalTests * 2 // Estimate graph size
        };
    }

    /**
     * Calculate test execution savings
     */
    private calculateTestExecutionSavings(data: ExperimentData): number {
        const avgTestTime = data.avgTestTime || 1000; // Default 1 second per test
        const testsSkipped = data.totalTests - data.selectedTests;
        return testsSkipped * avgTestTime;
    }

    /**
     * Calculate early fault detection time
     */
    private calculateEarlyFaultDetectionTime(data: ExperimentData): number {
        if (data.faultsDetected === 0) {
            return 0;
        }
        
        // Assume faults are detected in the first 30% of selected tests on average
        const avgTestTime = data.avgTestTime || 1000;
        const testsToFirstFault = Math.ceil(data.selectedTests * 0.3);
        return testsToFirstFault * avgTestTime;
    }

    /**
     * Estimate nodes processed during analysis
     */
    private estimateNodesProcessed(data: ExperimentData): number {
        // Estimate based on project size and test count
        const nodesPerTest = 5; // Assume 5 nodes per test on average
        const nodesPerFile = 20; // Assume 20 nodes per changed file
        
        return (data.totalTests * nodesPerTest) + 
               ((data.changedFiles?.length || 1) * nodesPerFile);
    }

    /**
     * Analyze time complexity based on data patterns
     */
    private analyzeTimeComplexity(data: ExperimentData): string {
        // Simplified complexity analysis based on input size
        const inputSize = data.totalTests + (data.changedFiles?.length || 1);
        const executionTime = data.executionTime;
        
        // Very rough heuristic
        const timePerInput = executionTime / inputSize;
        
        if (timePerInput < 1) return 'O(1)';
        if (timePerInput < 10) return 'O(log n)';
        if (timePerInput < 100) return 'O(n)';
        if (timePerInput < 1000) return 'O(n log n)';
        return 'O(n²)';
    }

    /**
     * Analyze memory complexity
     */
    private analyzeMemoryComplexity(resources: ResourceUsage): string {
        // Simplified memory complexity analysis
        if (resources.peakMemoryMB < 100) return 'O(1)';
        if (resources.peakMemoryMB < 500) return 'O(n)';
        if (resources.peakMemoryMB < 2000) return 'O(n log n)';
        return 'O(n²)';
    }

    /**
     * Calculate scaling factor based on project characteristics
     */
    private calculateScalingFactor(data: ExperimentData): number {
        // How much slower per additional 1000 tests
        const basePerformance = 100; // ms for 100 tests
        const currentPerformance = data.executionTime;
        const testRatio = data.totalTests / 100;
        
        return currentPerformance / (basePerformance * testRatio);
    }

    /**
     * Calculate percentage improvement
     */
    private calculatePercentageImprovement(baseline: number, improved: number): number {
        if (baseline === 0) return 0;
        return ((baseline - improved) / baseline) * 100;
    }

    /**
     * Assess significance of improvements
     */
    private assessSignificance(timeReduction: number, memoryReduction: number, throughputIncrease: number): 'high' | 'medium' | 'low' | 'none' {
        const significantChanges = [timeReduction, memoryReduction, throughputIncrease].filter(change => Math.abs(change) > 10).length;
        
        if (significantChanges >= 3) return 'high';
        if (significantChanges >= 2) return 'medium';
        if (significantChanges >= 1) return 'low';
        return 'none';
    }

    /**
     * Check if approach is a baseline approach
     */
    private isBaselineApproach(approach: string): boolean {
        const baselineApproaches = ['Random', 'Ekstazi-RTS', 'History-TCP'];
        return baselineApproaches.includes(approach);
    }

    /**
     * Find optimal project size for performance
     */
    private findOptimalProjectSize(profiles: PerformanceProfile[]): number | undefined {
        if (profiles.length < 3) return undefined;
        
        // Find the size with the best cost-benefit ratio
        let bestRatio = 0;
        let optimalSize = undefined;
        
        for (const profile of profiles) {
            const ratio = profile.metrics.costBenefitRatio;
            if (ratio > bestRatio) {
                bestRatio = ratio;
                optimalSize = profile.projectSize;
            }
        }
        
        return optimalSize;
    }

    /**
     * Calculate average of numbers
     */
    private average(numbers: number[]): number {
        if (numbers.length === 0) return 0;
        return numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
    }

    /**
     * Initialize baseline data structures
     */
    private initializeBaselines(): void {
        const baselineApproaches = ['Random', 'Ekstazi-RTS', 'History-TCP'];
        for (const approach of baselineApproaches) {
            this.baselineProfiles.set(approach, []);
        }
    }

    /**
     * Clear all recorded data
     */
    public clear(): void {
        this.performanceProfiles = [];
        this.baselineProfiles.clear();
        this.initializeBaselines();
        Logger.debug('Efficiency metrics data cleared');
    }

    /**
     * Export efficiency data for analysis
     */
    public exportData(): string {
        const exportData = {
            profiles: this.performanceProfiles,
            baselines: Array.from(this.baselineProfiles.entries()),
            summary: {
                totalProfiles: this.performanceProfiles.length,
                approaches: [...new Set(this.performanceProfiles.map(p => p.approach))],
                exportTime: new Date().toISOString()
            }
        };
        
        return JSON.stringify(exportData, null, 2);
    }
}