// src/experiments/config/ExperimentConfig.ts - Core experiment configuration

export interface ExperimentConfig {
    // Subject projects for evaluation
    subjects: SubjectProject[];
    
    // Experiment parameters
    iterations: number;
    commitRange: CommitRange;
    baselines: BaselineType[];
    
    // Metrics to collect
    metrics: MetricType[];
    
    // Output configuration
    outputFormat: OutputFormat[];
    outputDirectory: string;
    
    // Statistical analysis
    significanceLevel: number;
    confidenceInterval: number;
    
    // SIKG-specific parameters
    sikgConfig: SIKGExperimentConfig;
}

export interface SubjectProject {
    name: string;
    repositoryUrl: string;
    localPath: string;
    language: 'python';
    testFramework: 'pytest' | 'unittest';
    size: 'small' | 'medium' | 'large';
    linesOfCode: number;
    testCount: number;
    commitCount: number;
}

export interface CommitRange {
    start: string; // Git commit hash or relative reference
    end: string;
    maxCommits?: number;
}

export type BaselineType = 
    | 'random'
    | 'ekstazi'
    | 'history'
    | 'impact-sorted'
    | 'coverage-based';

export type MetricType =
    | 'apfd'
    | 'fault-detection-rate'
    | 'precision'
    | 'recall'
    | 'f1-score'
    | 'reduction-ratio'
    | 'execution-time'
    | 'analysis-overhead';

export type OutputFormat = 'json' | 'csv' | 'html';

export interface SIKGExperimentConfig {
    // Knowledge graph parameters
    maxTraversalDepth: number;
    impactThresholds: {
        high: number;
        medium: number;
        low: number;
    };
    
    // Reinforcement learning parameters
    rlEnabled: boolean;
    learningRate: number;
    explorationRate: number;
    
    // Semantic change classification
    semanticChangeTypes: string[];
    
    // Historical analysis
    historicalWindowDays: number;
}

export interface ExperimentResult {
    experimentId: string;
    timestamp: string;
    config: ExperimentConfig;
    results: SubjectResult[];
    summary: ExperimentSummary;
}

export interface SubjectResult {
    subject: SubjectProject;
    iterations: IterationResult[];
    aggregatedMetrics: AggregatedMetrics;
    baselineComparisons: BaselineComparison[];
}

export interface IterationResult {
    iterationId: number;
    commitHash: string;
    sikgMetrics: MetricValues;
    baselineMetrics: Record<BaselineType, MetricValues>;
    executionTime: number;
    faultsDetected: number;
    selectedTests: string[];
    totalTests: number;
}

export interface MetricValues {
    apfd: number;
    faultDetectionRate: number;
    precision: number;
    recall: number;
    f1Score: number;
    reductionRatio: number;
    executionTime: number;
    analysisOverhead: number;
}

export interface AggregatedMetrics {
    mean: MetricValues;
    median: MetricValues;
    standardDeviation: MetricValues;
    confidenceInterval: {
        lower: MetricValues;
        upper: MetricValues;
    };
}

export interface BaselineComparison {
    baseline: BaselineType;
    improvement: MetricValues;
    statisticalSignificance: StatisticalTest[];
    effectSize: number;
}

export interface StatisticalTest {
    test: 'wilcoxon' | 'mann-whitney' | 't-test';
    pValue: number;
    significant: boolean;
    effectSize: number;
}

export interface ExperimentSummary {
    totalSubjects: number;
    totalIterations: number;
    overallImprovement: MetricValues;
    significantImprovements: string[];
    researchQuestionAnswers: {
        rq1: string; // Effectiveness
        rq2: string; // Efficiency
        rq3: string; // Comparison
        rq4: string; // Reinforcement Learning
    };
}

// Default experiment configuration
export const DEFAULT_EXPERIMENT_CONFIG: ExperimentConfig = {
    subjects: [
        {
            name: 'small-project',
            repositoryUrl: 'https://github.com/example/small-python-project',
            localPath: './test-subjects/small-project',
            language: 'python',
            testFramework: 'pytest',
            size: 'small',
            linesOfCode: 500,
            testCount: 50,
            commitCount: 100
        },
        {
            name: 'medium-project',
            repositoryUrl: 'https://github.com/example/medium-python-project',
            localPath: './test-subjects/medium-project',
            language: 'python',
            testFramework: 'unittest',
            size: 'medium',
            linesOfCode: 5000,
            testCount: 200,
            commitCount: 500
        }
    ],
    
    iterations: 30,
    commitRange: {
        start: 'HEAD~50',
        end: 'HEAD',
        maxCommits: 50
    },
    
    baselines: ['random', 'ekstazi', 'history'],
    metrics: ['apfd', 'precision', 'recall', 'reduction-ratio', 'execution-time'],
    
    outputFormat: ['json', 'csv', 'html'],
    outputDirectory: './src/experiments/output',
    
    significanceLevel: 0.05,
    confidenceInterval: 0.95,
    
    sikgConfig: {
        maxTraversalDepth: 3,
        impactThresholds: {
            high: 0.7,
            medium: 0.4,
            low: 0.1
        },
        rlEnabled: true,
        learningRate: 0.01,
        explorationRate: 0.1,
        semanticChangeTypes: [
            'BUG_FIX',
            'FEATURE_ADDITION', 
            'REFACTORING_SIGNATURE',
            'REFACTORING_LOGIC',
            'DEPENDENCY_UPDATE',
            'PERFORMANCE_OPT'
        ],
        historicalWindowDays: 30
    }
};