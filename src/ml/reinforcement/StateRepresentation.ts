/**
 * StateRepresentation.ts - State space S implementation for SIKG MDP
 * 
 * Defines the state representation that captures:
 * - Project context and metrics
 * - Change characteristics (semantic types, complexity)
 * - Historical performance patterns
 * - Test suite characteristics
 * - Graph topology features
 */

import { Logger } from '../../utils/Logger';
import { SemanticChangeInfo } from '../../sikg/GraphTypes';
import { 
    MDPState, 
    StateVector, 
    ProjectMetrics, 
    ChangeContext, 
    HistoricalMetrics, 
    TestSuiteMetrics,
    GraphMetrics 
} from '../types/ReinforcementTypes';
import * as crypto from 'crypto';

export class StateRepresentation {
    private stateCache: Map<string, MDPState> = new Map();
    private featureNormalizers: Map<string, FeatureNormalizer> = new Map();

    constructor() {
        this.initializeFeatureNormalizers();
        Logger.debug('State representation initialized');
    }

    /**
     * Construct MDP state from current context
     * @param context Current context including changes, project metrics, etc.
     * @returns Constructed MDP state
     */
    public constructState(context: any): MDPState {
        try {
            // Extract state features from context
            const stateVector = this.extractStateFeatures(context);
            
            // Generate unique state ID
            const stateId = this.generateStateId(stateVector);
            
            // Check cache first
            if (this.stateCache.has(stateId)) {
                return this.stateCache.get(stateId)!;
            }

            // Create new state
            const state: MDPState = {
                id: stateId,
                vector: stateVector,
                timestamp: new Date(),
                context: context,
                hash: this.computeStateHash(stateVector)
            };

            // Cache the state
            this.stateCache.set(stateId, state);
            
            Logger.debug(`Constructed state ${stateId} with ${Object.keys(stateVector).length} features`);
            return state;

        } catch (error) {
            Logger.error('Error constructing state:', error);
            return this.getDefaultState();
        }
    }

    /**
     * Extract numerical features from context to form state vector
     */
    private extractStateFeatures(context: any): StateVector {
        const features: StateVector = {
            // Change characteristics
            changeComplexity: this.calculateChangeComplexity(context.semanticChanges || []),
            changeSemanticTypes: this.encodeSemanticTypes(context.semanticChanges || []),
            changeScope: this.calculateChangeScope(context.changedFiles || []),
            
            // Historical performance
            historicalAccuracy: context.historicalMetrics?.accuracy || 0.5,
            recentTrend: context.historicalMetrics?.recentTrend || 0,
            failureRate: context.historicalMetrics?.failureRate || 0.1,
            
            // Test suite characteristics
            testCoverage: context.testSuiteMetrics?.coverage || 0.8,
            testSuiteSize: this.normalizeTestSuiteSize(context.testSuiteMetrics?.totalTests || 100),
            averageTestTime: this.normalizeTestTime(context.testSuiteMetrics?.averageExecutionTime || 100),
            
            // Project metrics
            projectSize: this.normalizeProjectSize(context.projectMetrics?.linesOfCode || 10000),
            codeChurn: context.projectMetrics?.recentChurn || 0,
            complexity: context.projectMetrics?.complexity || 0.5,
            
            // Graph topology features
            graphDensity: context.graphMetrics?.density || 0.1,
            graphCentrality: context.graphMetrics?.averageCentrality || 0.5,
            testCodeRatio: context.graphMetrics?.testToCodeRatio || 0.3,
            
            // Temporal features
            timeOfDay: this.encodeTimeOfDay(new Date()),
            dayOfWeek: this.encodeDayOfWeek(new Date()),
            commitFrequency: context.temporalMetrics?.recentCommitFrequency || 0.5
        };

        // Normalize all features to [0, 1] range
        return this.normalizeStateVector(features);
    }

    /**
     * Calculate complexity of changes based on semantic types and scope
     */
    private calculateChangeComplexity(semanticChanges: SemanticChangeInfo[]): number {
        if (semanticChanges.length === 0) return 0;

        let complexityScore = 0;
        const weights = {
            'BUG_FIX': 0.8,
            'FEATURE_ADDITION': 0.9,
            'REFACTORING_SIGNATURE': 1.0,
            'REFACTORING_LOGIC': 0.6,
            'DEPENDENCY_UPDATE': 0.7,
            'PERFORMANCE_OPT': 0.5,
            'UNKNOWN': 0.5
        };

        for (const change of semanticChanges) {
            const typeWeight = weights[change.semanticType] || 0.5;
            const impactWeight = change.initialImpactScore;
            const linesWeight = Math.min(1.0, (change.changeDetails.linesChanged || 1) / 50);
            
            complexityScore += typeWeight * impactWeight * (0.7 + 0.3 * linesWeight);
        }

        return Math.min(1.0, complexityScore / semanticChanges.length);
    }

    /**
     * Encode semantic change types as a numerical vector
     */
    private encodeSemanticTypes(semanticChanges: SemanticChangeInfo[]): number {
        if (semanticChanges.length === 0) return 0;

        const typeDistribution = {
            'BUG_FIX': 0,
            'FEATURE_ADDITION': 0,
            'REFACTORING_SIGNATURE': 0,
            'REFACTORING_LOGIC': 0,
            'DEPENDENCY_UPDATE': 0,
            'PERFORMANCE_OPT': 0,
            'UNKNOWN': 0
        };

        // Count occurrences of each type
        for (const change of semanticChanges) {
            typeDistribution[change.semanticType]++;
        }

        // Create weighted encoding based on type importance
        let encodedValue = 0;
        const typeWeights = [0.9, 0.8, 1.0, 0.6, 0.7, 0.4, 0.3]; // Corresponding to types above
        const typeNames = Object.keys(typeDistribution);
        
        for (let i = 0; i < typeNames.length; i++) {
            const count = typeDistribution[typeNames[i] as keyof typeof typeDistribution];
            encodedValue += (count / semanticChanges.length) * typeWeights[i];
        }

        return Math.min(1.0, encodedValue);
    }

    /**
     * Calculate scope of changes (how many different areas affected)
     */
    private calculateChangeScope(changedFiles: string[]): number {
        if (changedFiles.length === 0) return 0;

        // Analyze file paths to determine scope
        const directories = new Set<string>();
        const fileTypes = new Set<string>();
        
        for (const file of changedFiles) {
            directories.add(file.split('/')[0] || '');
            const extension = file.split('.').pop() || '';
            fileTypes.add(extension);
        }

        // Scope increases with number of directories and file types affected
        const directoryScore = Math.min(1.0, directories.size / 10);
        const typeScore = Math.min(1.0, fileTypes.size / 5);
        const fileScore = Math.min(1.0, changedFiles.length / 20);

        return (directoryScore + typeScore + fileScore) / 3;
    }

    /**
     * Normalize various metrics to [0, 1] range
     */
    private normalizeTestSuiteSize(size: number): number {
        return Math.min(1.0, size / 10000); // Assume max 10k tests
    }

    private normalizeTestTime(timeMs: number): number {
        return Math.min(1.0, timeMs / 5000); // Assume max 5 seconds per test
    }

    private normalizeProjectSize(loc: number): number {
        return Math.min(1.0, loc / 1000000); // Assume max 1M LOC
    }

    /**
     * Encode time of day as a continuous feature
     */
    private encodeTimeOfDay(date: Date): number {
        const hours = date.getHours();
        const minutes = date.getMinutes();
        const totalMinutes = hours * 60 + minutes;
        return totalMinutes / (24 * 60); // Normalize to [0, 1]
    }

    /**
     * Encode day of week as a continuous feature
     */
    private encodeDayOfWeek(date: Date): number {
        const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
        return dayOfWeek / 6; // Normalize to [0, 1]
    }

    /**
     * Normalize entire state vector using learned normalizers
     */
    private normalizeStateVector(vector: StateVector): StateVector {
        const normalized: StateVector = { ...vector };

        for (const [feature, value] of Object.entries(vector)) {
            const normalizer = this.featureNormalizers.get(feature);
            if (normalizer) {
                normalized[feature as keyof StateVector] = normalizer.normalize(value);
            }
        }

        return normalized;
    }

    /**
     * Generate unique state ID based on discretized features
     */
    private generateStateId(stateVector: StateVector): string {
        // Discretize continuous features for state identification
        const discretized = {
            changeComplexity: Math.floor(stateVector.changeComplexity * 10),
            changeTypes: Math.floor(stateVector.changeSemanticTypes * 5),
            historicalAccuracy: Math.floor(stateVector.historicalAccuracy * 10),
            testCoverage: Math.floor(stateVector.testCoverage * 10),
            projectSize: Math.floor(stateVector.projectSize * 5)
        };

        const stateString = Object.values(discretized).join('_');
        return `state_${crypto.createHash('md5').update(stateString).digest('hex').substring(0, 8)}`;
    }

    /**
     * Compute hash of state vector for equality checking
     */
    private computeStateHash(stateVector: StateVector): string {
        const vectorString = JSON.stringify(stateVector);
        return crypto.createHash('sha256').update(vectorString).digest('hex');
    }

    /**
     * Initialize feature normalizers with default ranges
     */
    private initializeFeatureNormalizers(): void {
        const features = [
            'changeComplexity', 'changeSemanticTypes', 'changeScope',
            'historicalAccuracy', 'recentTrend', 'failureRate',
            'testCoverage', 'testSuiteSize', 'averageTestTime',
            'projectSize', 'codeChurn', 'complexity',
            'graphDensity', 'graphCentrality', 'testCodeRatio',
            'timeOfDay', 'dayOfWeek', 'commitFrequency'
        ];

        for (const feature of features) {
            this.featureNormalizers.set(feature, new FeatureNormalizer());
        }
    }

    /**
     * Get default state for error cases
     */
    private getDefaultState(): MDPState {
        const defaultVector: StateVector = {
            changeComplexity: 0.5,
            changeSemanticTypes: 0.5,
            changeScope: 0.5,
            historicalAccuracy: 0.5,
            recentTrend: 0,
            failureRate: 0.1,
            testCoverage: 0.8,
            testSuiteSize: 0.5,
            averageTestTime: 0.5,
            projectSize: 0.5,
            codeChurn: 0.5,
            complexity: 0.5,
            graphDensity: 0.1,
            graphCentrality: 0.5,
            testCodeRatio: 0.3,
            timeOfDay: 0.5,
            dayOfWeek: 0.5,
            commitFrequency: 0.5
        };

        return {
            id: 'default_state',
            vector: defaultVector,
            timestamp: new Date(),
            context: {},
            hash: this.computeStateHash(defaultVector)
        };
    }

    /**
     * Get size of state space (number of unique states seen)
     */
    public getStateSpaceSize(): number {
        return this.stateCache.size;
    }

    /**
     * Update feature normalizers with new observations
     */
    public updateNormalizers(stateVector: StateVector): void {
        for (const [feature, value] of Object.entries(stateVector)) {
            const normalizer = this.featureNormalizers.get(feature);
            if (normalizer) {
                normalizer.update(value);
            }
        }
    }

    /**
     * Clear state cache (useful for memory management)
     */
    public clearCache(): void {
        this.stateCache.clear();
        Logger.debug('State cache cleared');
    }
}

/**
 * Online feature normalizer that adapts to observed value ranges
 */
class FeatureNormalizer {
    private min: number = Infinity;
    private max: number = -Infinity;
    private count: number = 0;
    private mean: number = 0;
    private variance: number = 0;

    public update(value: number): void {
        this.count++;
        this.min = Math.min(this.min, value);
        this.max = Math.max(this.max, value);
        
        // Online mean and variance calculation
        const delta = value - this.mean;
        this.mean += delta / this.count;
        const delta2 = value - this.mean;
        this.variance += delta * delta2;
    }

    public normalize(value: number): number {
        if (this.count === 0 || this.max === this.min) {
            return 0.5; // Default normalization
        }

        // Min-max normalization
        return (value - this.min) / (this.max - this.min);
    }

    public getStatistics(): { min: number, max: number, mean: number, stddev: number } {
        return {
            min: this.min,
            max: this.max,
            mean: this.mean,
            stddev: this.count > 1 ? Math.sqrt(this.variance / (this.count - 1)) : 0
        };
    }
}