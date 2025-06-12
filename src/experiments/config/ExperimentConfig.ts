// ExperimentConfig.ts - Experiment configuration and constants

export interface ExperimentConfig {
    // Subject projects configuration
    subjects: SubjectProject[];
    
    // Experiment parameters
    iterations: number;
    mutationCount: number;
    maxDepth: number;
    
    // Thresholds
    selectionThreshold: number;
    highImpactThreshold: number;
    lowImpactThreshold: number;
    
    // RL parameters
    learningRate: number;
    explorationRate: number;
    
    // Output settings
    outputDir: string;
    generateCharts: boolean;
}

export interface SubjectProject {
    name: string;
    path: string;
    domain: 'web' | 'data' | 'testing' | 'http';
    estimatedLOC: number;
    testFramework: 'pytest' | 'unittest';
}

export const DEFAULT_CONFIG: ExperimentConfig = {
    subjects: [
        {
            name: 'requests',
            path: './test-subjects/requests',
            domain: 'http',
            estimatedLOC: 10000,
            testFramework: 'pytest'
        },
        {
            name: 'flask',
            path: './test-subjects/flask', 
            domain: 'web',
            estimatedLOC: 34000,
            testFramework: 'pytest'
        },
        {
            name: 'pytest',
            path: './test-subjects/pytest',
            domain: 'testing',
            estimatedLOC: 5000,
            testFramework: 'pytest'
        }
    ],
    
    iterations: 100,
    mutationCount: 50,
    maxDepth: 3,
    
    selectionThreshold: 0.3,
    highImpactThreshold: 0.7,
    lowImpactThreshold: 0.3,
    
    learningRate: 0.01,
    explorationRate: 0.1,
    
    outputDir: './src/experiments/output',
    generateCharts: true
};

export const CHANGE_TYPES = [
    'BUG_FIX',
    'FEATURE_ADDITION', 
    'REFACTORING_LOGIC',
    'REFACTORING_SIGNATURE',
    'DEPENDENCY_UPDATE',
    'PERFORMANCE_OPT'
] as const;

export type ChangeType = typeof CHANGE_TYPES[number];