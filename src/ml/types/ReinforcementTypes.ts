/**
 * ReinforcementTypes.ts - Type definitions for reinforcement learning implementation
 * 
 * Contains all type definitions used throughout the RL framework including:
 * - MDP components (states, actions, rewards)
 * - Learning parameters and configurations
 * - Performance metrics and statistics
 * - Export/import data structures
 */

// Core MDP Types
export interface MDPState {
    id: string;
    vector: StateVector;
    timestamp: Date;
    context: any;
    hash: string;
}

export interface MDPAction {
    id: string;
    type: ActionType;
    vector: ActionVector;
    thresholds: ThresholdSettings;
    weightAdjustments: WeightAdjustments;
    prioritizationStrategy: PrioritizationStrategy;
    explorationFactor: number;
    expectedReward: number;
    confidence: number;
    metadata: {
        created: Date;
        usageCount: number;
        averageReward: number;
    };
}

export interface StateVector {
    // Change characteristics
    changeComplexity: number;
    changeSemanticTypes: number;
    changeScope: number;
    
    // Historical performance
    historicalAccuracy: number;
    recentTrend: number;
    failureRate: number;
    
    // Test suite characteristics
    testCoverage: number;
    testSuiteSize: number;
    averageTestTime: number;
    
    // Project metrics
    projectSize: number;
    codeChurn: number;
    complexity: number;
    
    // Graph topology features
    graphDensity: number;
    graphCentrality: number;
    testCodeRatio: number;
    
    // Temporal features
    timeOfDay: number;
    dayOfWeek: number;
    commitFrequency: number;
}

export interface ActionVector {
    thresholdVector: number[];
    weightVector: number[];
    strategyVector: number[];
}

// Action Space Types
export enum ActionType {
    CONSERVATIVE = 'conservative',
    AGGRESSIVE = 'aggressive',
    BALANCED = 'balanced',
    EXPLORATION = 'exploration',
    EXPLOITATION = 'exploitation'
}

export interface ThresholdSettings {
    highImpactThreshold: number;
    mediumImpactThreshold: number;
    lowImpactThreshold: number;
    minImpactThreshold: number;
    confidenceThreshold: number;
    maxTestsSelected: number;
}

export interface WeightAdjustments {
    relationshipWeights: {
        CALLS: number;
        USES: number;
        INHERITS_FROM: number;
        DEPENDS_ON: number;
        BELONGS_TO: number;
        TESTS: number;
        IS_TESTED_BY: number;
        MODIFIES: number;
        IMPORTS: number;
    };
    semanticTypeWeights: {
        BUG_FIX: number;
        FEATURE_ADDITION: number;
        REFACTORING_SIGNATURE: number;
        REFACTORING_LOGIC: number;
        DEPENDENCY_UPDATE: number;
        PERFORMANCE_OPT: number;
        UNKNOWN: number;
    };
    attenuationFactors: {
        depth1: number;
        depth2: number;
        depth3: number;
        depth4: number;
        depth5: number;
    };
    learningRate: number;
    momentum: number;
}

export interface PrioritizationStrategy {
    algorithm: 'weighted_scoring' | 'impact_maximization' | 'adaptive_scoring' | 'random_sampling';
    parameters: {
        impactWeight: number;
        confidenceWeight: number;
        historicalWeight: number;
        complexityWeight: number;
        executionTimeWeight: number;
        riskAversion: number;
    };
    maxDepth: number;
    useCaching: boolean;
    parallelize: boolean;
}

// Reward System Types
export interface RewardSignal {
    state: MDPState;
    action: MDPAction;
    reward: number;
    components: RewardComponents;
    timestamp: Date;
    metadata: {
        predictions: number;
        actualResults: number;
        executionTime: number;
    };
}

export interface RewardComponents {
    accuracy: number;
    precision: number;
    recall: number;
    f1Score: number;
    efficiency: number;
    falsePositivePenalty: number;
    falseNegativePenalty: number;
    consistencyBonus: number;
    explorationBonus: number;
    baselineImprovement: number;
}

export interface FeedbackSignal {
    testId: string;
    predicted: boolean;
    actual: boolean;
    correct: boolean;
    confidence: number;
    changedNodeIds: string[];
}

export interface EnvironmentResponse {
    predictions?: any[];
    actualResults?: any[];
    executionMetrics?: any;
    accuracy?: number;
    feedbackSignals?: FeedbackSignal[];
    done?: boolean;
}

// Policy Learning Types
export enum PolicyType {
    EPSILON_GREEDY = 'epsilon-greedy',
    UCB = 'ucb',
    SOFTMAX = 'softmax',
    GREEDY = 'greedy'
}

export interface Policy {
    type: PolicyType;
    parameters: PolicyParameters;
    qTable: Map<string, Map<string, QValue>>;
    actionCounts: Map<string, Map<string, number>>;
    episodeCount: number;
    learningRate: number;
    explorationRate: number;
}

export interface PolicyParameters {
    policyType: PolicyType;
    stateFeatures: string[];
    rewardShaping: boolean;
    temperature?: number;
    ucbConstant?: number;
    [key: string]: any;
}

export interface QValue {
    value: number;
    lastUpdated: Date;
    updateCount: number;
}

// Learning Episode Types
export interface LearningEpisode {
    episode: number;
    state: MDPState;
    action: MDPAction;
    reward: number;
    nextState: MDPState;
    timestamp: Date;
    accuracy: number;
    done: boolean;
    
    // Additional metrics
    executionTime?: number;
    testsSaved?: number;
    testsRun?: number;
    falsePositives?: number;
    falseNegatives?: number;
    truePositives?: number;
    trueNegatives?: number;
}

// Statistics and Metrics Types
export interface LearningStatistics {
    totalEpisodes: number;
    recentEpisodes: number;
    currentAccuracy: number;
    bestAccuracy: number;
    averageAccuracy: number;
    currentF1Score: number;
    bestF1Score: number;
    averageF1Score: number;
    recentImprovement: number;
    learningRate: number;
    convergenceScore: number;
    stabilityScore: number;
    lastUpdated: Date;
}

export interface PerformanceMetrics {
    episode: number;
    timestamp: Date;
    accuracy: number;
    precision: number;
    recall: number;
    f1Score: number;
    reward: number;
    executionTime: number;
    testsSaved: number;
    testsRun: number;
    falsePositives: number;
    falseNegatives: number;
    truePositives: number;
    trueNegatives: number;
}

export interface ConvergenceMetrics {
    isConverged: boolean;
    convergenceEpisode: number | null;
    plateauLength: number;
    varianceReduction: number;
    trendStability: number;
}

export interface LearningReport {
    summary: {
        totalEpisodes: number;
        currentPerformance: number;
        bestPerformance: number;
        improvementTrend: number;
        convergenceStatus: string;
    };
    statistics: LearningStatistics;
    convergenceMetrics: ConvergenceMetrics;
    trends: any;
    recommendations: string[];
    charts: any;
    generatedAt: Date;
}

export enum WeightUpdateStrategy {
   GRADIENT_BASED = 'gradient_based',
   REWARD_BASED = 'reward_based',
   ERROR_BASED = 'error_based',
   ADAPTIVE = 'adaptive'
}

export interface WeightUpdate {
   edgeId: string;
   oldWeight: number;
   newWeight: number;
   delta: number;
   confidence: number;
   reason: string;
   timestamp: Date;
}

export interface LearningMetrics {
   totalUpdates: number;
   updatedEdges: number;
   updateCoverage: number;
   averageUpdateMagnitude: number;
   averageVariance: number;
   learningRate: number;
   momentum: number;
   convergenceScore: number;
   stabilityScore: number;
}

// Configuration Types
export interface MDPConfig {
   learningRate: number;
   discountFactor: number;
   explorationRate: number;
   updateFrequency: number;
}

export interface RLConfig {
   learningRate: number;
   discountFactor: number;
   explorationRate: number;
   updateFrequency: number;
}

export interface PolicyConfig {
   policyType: string;
   stateFeatures: string[];
   rewardShaping: boolean;
   temperature?: number;
   ucbConstant?: number;
}

// Transition and MDP Support Types
export interface TransitionProbabilities {
   probabilities: Map<string, number>;
   expectedRewards: Map<string, number>;
   count: number;
}

// Project Context Types
export interface ProjectMetrics {
   linesOfCode: number;
   testCount: number;
   codeChurn: number;
   complexity: number;
   recentCommitFrequency: number;
}

export interface ChangeContext {
   semanticChanges: any[];
   changedFiles: string[];
   changeComplexity: number;
   changeScope: number;
}

export interface HistoricalMetrics {
   accuracy: number;
   recentTrend: number;
   failureRate: number;
   averageImpactScore: number;
   successfulPredictions: number;
   totalPredictions: number;
}

export interface TestSuiteMetrics {
   totalTests: number;
   coverage: number;
   averageExecutionTime: number;
   testTypes: {
       unit: number;
       integration: number;
       e2e: number;
   };
   recentFailureRate: number;
}

export interface GraphMetrics {
   nodeCount: number;
   edgeCount: number;
   density: number;
   averageCentrality: number;
   testToCodeRatio: number;
   componentCount: number;
   averagePathLength: number;
}

// Advanced Analytics Types
export interface ModelPerformance {
   episode: number;
   accuracy: number;
   precision: number;
   recall: number;
   f1Score: number;
   auc: number;
   specificity: number;
   sensitivity: number;
   mcc: number; // Matthews Correlation Coefficient
}

export interface LearningCurve {
   episodes: number[];
   trainingAccuracy: number[];
   validationAccuracy: number[];
   trainingLoss: number[];
   validationLoss: number[];
   learningRate: number[];
}

export interface FeatureImportance {
   featureName: string;
   importance: number;
   rank: number;
   category: 'change' | 'historical' | 'test' | 'project' | 'graph' | 'temporal';
}

export interface ModelExplainability {
   globalFeatureImportance: FeatureImportance[];
   localExplanations: LocalExplanation[];
   shap_values?: number[][];
   lime_explanations?: any[];
}

export interface LocalExplanation {
   stateId: string;
   actionId: string;
   prediction: number;
   featureContributions: {
       featureName: string;
       contribution: number;
       value: number;
   }[];
   confidence: number;
}

// Experimental and Research Types
export interface ExperimentConfiguration {
   name: string;
   description: string;
   parameters: {
       learningRate: number;
       explorationStrategy: string;
       rewardFunction: string;
       networkArchitecture?: string;
   };
   duration: number;
   evaluationMetrics: string[];
}

export interface ExperimentResult {
   configurationId: string;
   startTime: Date;
   endTime: Date;
   finalPerformance: ModelPerformance;
   learningCurve: LearningCurve;
   convergenceEpisode?: number;
   bestPerformance: ModelPerformance;
   stabilityMetrics: {
       variance: number;
       standardDeviation: number;
       coefficientOfVariation: number;
   };
}

export interface HyperparameterTuning {
   searchSpace: {
       learningRate: [number, number];
       explorationRate: [number, number];
       discountFactor: [number, number];
       networkSize?: [number, number];
   };
   searchStrategy: 'grid' | 'random' | 'bayesian' | 'evolutionary';
   maxIterations: number;
   earlyStoppingCriteria?: {
       metric: string;
       patience: number;
       minDelta: number;
   };
}

// Data Persistence Types
export interface ModelCheckpoint {
   episode: number;
   timestamp: Date;
   modelState: {
       qTable: any;
       policyParameters: PolicyParameters;
       weightHistory: any;
       statistics: LearningStatistics;
   };
   performance: ModelPerformance;
   metadata: {
       version: string;
       configHash: string;
       environmentInfo: any;
   };
}

export interface DataExport {
   formatVersion: string;
   exportTimestamp: Date;
   metadata: {
       totalEpisodes: number;
       dateRange: {
           start: Date;
           end: Date;
       };
       projectInfo: {
           name: string;
           language: string;
           size: number;
       };
   };
   learningData: {
       episodes: LearningEpisode[];
       performance: PerformanceMetrics[];
       rewards: RewardSignal[];
   };
   modelData: {
       policy: Policy;
       weights: any;
       statistics: LearningStatistics;
   };
}

// Integration Types
export interface SIKGIntegration {
   graphManager: any;
   testPrioritizer: any;
   changeAnalyzer: any;
   testRunner: any;
}

export interface VSCodeIntegration {
   context: any;
   outputChannel: any;
   statusBar: any;
   webviewProvider: any;
}

// Validation and Testing Types
export interface ValidationSet {
   states: MDPState[];
   expectedActions: MDPAction[];
   expectedRewards: number[];
   metadata: {
       createdAt: Date;
       source: 'historical' | 'synthetic' | 'expert';
       size: number;
   };
}

export interface CrossValidationResult {
   folds: number;
   averagePerformance: ModelPerformance;
   performanceVariance: number;
   foldResults: ModelPerformance[];
   statisticalSignificance: {
       pValue: number;
       confidenceInterval: [number, number];
       effectSize: number;
   };
}

// Error Handling and Monitoring Types
export interface ErrorMetrics {
   totalErrors: number;
   errorRate: number;
   errorTypes: {
       convergenceFailure: number;
       numericalInstability: number;
       invalidAction: number;
       stateTransitionError: number;
   };
   criticalErrors: number;
   recoverableErrors: number;
}

export interface MonitoringAlert {
   id: string;
   type: 'performance_degradation' | 'convergence_failure' | 'system_error' | 'data_quality';
   severity: 'low' | 'medium' | 'high' | 'critical';
   message: string;
   timestamp: Date;
   metrics: any;
   suggestedActions: string[];
}

export interface HealthCheck {
   timestamp: Date;
   status: 'healthy' | 'warning' | 'critical';
   checks: {
       modelPerformance: boolean;
       dataQuality: boolean;
       systemResources: boolean;
       convergenceStatus: boolean;
   };
   metrics: {
       memoryUsage: number;
       cpuUsage: number;
       latency: number;
       throughput: number;
   };
   alerts: MonitoringAlert[];
}

// Advanced Feature Types
export interface OnlineLearning {
   enabled: boolean;
   bufferSize: number;
   updateFrequency: number;
   adaptationRate: number;
   forgettingFactor: number;
}

export interface TransferLearning {
   sourceModel: string;
   transferStrategy: 'fine_tuning' | 'feature_extraction' | 'progressive';
   frozenLayers?: string[];
   adaptationLayers?: string[];
}

export interface MultiObjectiveOptimization {
   objectives: {
       name: string;
       weight: number;
       direction: 'maximize' | 'minimize';
   }[];
   paretoFront?: {
       solutions: any[];
       metrics: number[][];
   };
   optimizationStrategy: 'weighted_sum' | 'pareto_dominance' | 'evolutionary';
}

// Utility Types
export type StateFeatureExtractor = (context: any) => StateVector;
export type RewardCalculator = (state: MDPState, action: MDPAction, response: EnvironmentResponse) => number;
export type PolicyUpdater = (state: MDPState, action: MDPAction, reward: number, nextState?: MDPState) => Promise<void>;

export interface Serializable {
   serialize(): string;
   deserialize(data: string): void;
}

export interface Configurable {
   getConfiguration(): any;
   updateConfiguration(config: any): void;
   validateConfiguration(config: any): boolean;
}

export interface Monitorable {
   getHealthStatus(): HealthCheck;
   getMetrics(): any;
   subscribe(callback: (event: any) => void): void;
   unsubscribe(callback: (event: any) => void): void;
}

// Type Guards
export function isValidState(obj: any): obj is MDPState {
   return obj && 
          typeof obj.id === 'string' &&
          typeof obj.vector === 'object' &&
          obj.timestamp instanceof Date &&
          typeof obj.hash === 'string';
}

export function isValidAction(obj: any): obj is MDPAction {
   return obj &&
          typeof obj.id === 'string' &&
          Object.values(ActionType).includes(obj.type) &&
          typeof obj.vector === 'object' &&
          typeof obj.thresholds === 'object' &&
          typeof obj.weightAdjustments === 'object' &&
          typeof obj.prioritizationStrategy === 'object';
}

export function isValidReward(obj: any): obj is RewardSignal {
   return obj &&
          isValidState(obj.state) &&
          isValidAction(obj.action) &&
          typeof obj.reward === 'number' &&
          typeof obj.components === 'object' &&
          obj.timestamp instanceof Date;
}

// Factory Types
export interface RL_ComponentFactory {
   createState(context: any): MDPState;
   createAction(type: ActionType, parameters: any): MDPAction;
   createReward(state: MDPState, action: MDPAction, response: EnvironmentResponse): RewardSignal;
   createPolicy(type: PolicyType, parameters: PolicyParameters): Policy;
}

// Event Types
export interface RLEvent {
   type: 'episode_start' | 'episode_end' | 'convergence' | 'performance_update' | 'error';
   timestamp: Date;
   data: any;
}

export interface EpisodeStartEvent extends RLEvent {
   type: 'episode_start';
   data: {
       episode: number;
       state: MDPState;
   };
}

export interface EpisodeEndEvent extends RLEvent {
   type: 'episode_end';
   data: {
       episode: number;
       reward: number;
       performance: ModelPerformance;
   };
}

export interface ConvergenceEvent extends RLEvent {
   type: 'convergence';
   data: {
       episode: number;
       finalPerformance: ModelPerformance;
       convergenceMetrics: ConvergenceMetrics;
   };
}

// Constants
export const DEFAULT_RL_CONFIG: RLConfig = {
   learningRate: 0.01,
   discountFactor: 0.95,
   explorationRate: 0.1,
   updateFrequency: 10
};

export const DEFAULT_POLICY_CONFIG: PolicyConfig = {
   policyType: 'epsilon-greedy',
   stateFeatures: [
       'changeComplexity', 'historicalAccuracy', 'testCoverage', 
       'codeChurn', 'graphDensity', 'projectSize'
   ],
   rewardShaping: true,
   temperature: 1.0,
   ucbConstant: 2.0
};

export const PERFORMANCE_THRESHOLDS = {
   ACCURACY: {
       EXCELLENT: 0.95,
       GOOD: 0.85,
       ACCEPTABLE: 0.75,
       POOR: 0.65
   },
   F1_SCORE: {
       EXCELLENT: 0.90,
       GOOD: 0.80,
       ACCEPTABLE: 0.70,
       POOR: 0.60
   },
   CONVERGENCE: {
       VARIANCE_THRESHOLD: 0.01,
       STABILITY_EPISODES: 50,
       IMPROVEMENT_THRESHOLD: 0.001
   }
};