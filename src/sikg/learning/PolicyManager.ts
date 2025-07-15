// PolicyManager.ts - Test selection policy management for SIKG

import { TestImpact, SemanticChangeInfo } from '../GraphTypes';
import { MDPState, MDPAction, TestSelectionPolicy } from './MDPFramework';
import { LearningSignal, SessionPerformanceMetrics } from './FeedbackProcessor';
import { ConfigManager } from '../../utils/ConfigManager';
import { Logger } from '../../utils/Logger';

/**
 * Policy adaptation parameters
 */
export interface PolicyParameters {
    selectionThreshold: number;     // Minimum impact score for test selection
    priorityBoostFactor: number;    // Multiplier for high-priority change types
    diversityWeight: number;        // Weight for test diversity in selection
    riskTolerance: number;          // Risk tolerance for false negatives
    adaptationRate: number;         // Rate of policy parameter adaptation
    contextSensitivity: number;     // How much context affects decisions
}

/**
 * Policy decision context
 */
export interface PolicyContext {
    semanticChanges: SemanticChangeInfo[];
    changeComplexity: number;
    timeConstraints: number;        // Available execution time (ms)
    historicalSuccess: number;      // Recent success rate (0-1)
    projectCharacteristics: {
        testSuiteSize: number;
        averageTestTime: number;
        faultDensity: number;
    };
}

/**
 * Policy decision result
 */
export interface PolicyDecision {
    adjustedImpacts: Record<string, TestImpact>;
    selectionThreshold: number;
    priorityBoosts: Record<string, number>;
    reasoning: string[];
    confidence: number;
}

/**
 * Adaptive policy state
 */
export interface AdaptivePolicyState {
    parameters: PolicyParameters;
    performance: SessionPerformanceMetrics | null;
    adaptationHistory: PolicyAdaptation[];
    lastUpdate: number;
    stability: number; // How stable the policy has been (0-1)
}

/**
 * Policy adaptation record
 */
export interface PolicyAdaptation {
    timestamp: number;
    parameter: keyof PolicyParameters;
    oldValue: number;
    newValue: number;
    reason: string;
    expectedImprovement: number;
}

/**
 * Policy manager for adaptive test selection
 */
export class PolicyManager {
    private configManager: ConfigManager;
    private policies: Map<string, AdaptivePolicyState> = new Map();
    private defaultPolicyId: string = 'default';
    private adaptationCounter: number = 0;

    constructor(configManager: ConfigManager) {
        this.configManager = configManager;
        this.initializeDefaultPolicy();
    }

    /**
     * Apply adaptive policy to test impacts
     */
    public async applyPolicy(
        testImpacts: Record<string, TestImpact>,
        semanticChanges: SemanticChangeInfo[],
        context?: Partial<PolicyContext>
    ): Promise<Record<string, TestImpact>> {
        // Get current policy
        const policy = this.getCurrentPolicy();
        
        // Build full context
        const fullContext = this.buildPolicyContext(semanticChanges, testImpacts, context);
        
        // Make policy decision
        const decision = this.makePolicyDecision(policy, testImpacts, fullContext);
        
        Logger.info(`Applied policy decision: threshold=${decision.selectionThreshold.toFixed(3)}, confidence=${decision.confidence.toFixed(3)}`);
        Logger.debug(`Policy reasoning: ${decision.reasoning.join('; ')}`);
        
        return decision.adjustedImpacts;
    }

    /**
     * Update policy based on learning signals
     */
    public updatePolicy(learningSignals: LearningSignal[], performanceMetrics: SessionPerformanceMetrics): void {
        const policy = this.getCurrentPolicy();
        let adaptationsMade = 0;

        // Group signals by type and target
        const signalGroups = this.groupLearningSignals(learningSignals);
        
        // Process policy adjustment signals
        const policySignals = signalGroups.get('POLICY_ADJUSTMENT') || [];
        for (const signal of policySignals) {
            if (this.shouldApplySignal(signal, policy)) {
                this.adaptPolicyParameter(policy, signal);
                adaptationsMade++;
            }
        }

        // Process threshold change signals
        const thresholdSignals = signalGroups.get('THRESHOLD_CHANGE') || [];
        for (const signal of thresholdSignals) {
            if (this.shouldApplySignal(signal, policy)) {
                this.adaptThreshold(policy, signal);
                adaptationsMade++;
            }
        }

        // Update performance and stability
        policy.performance = performanceMetrics;
        policy.lastUpdate = Date.now();
        this.updatePolicyStability(policy, adaptationsMade);

        if (adaptationsMade > 0) {
            Logger.info(`Updated policy with ${adaptationsMade} adaptations based on ${learningSignals.length} signals`);
        }
    }

    /**
     * Get current adaptive policy
     */
    public getCurrentPolicy(): AdaptivePolicyState {
        let policy = this.policies.get(this.defaultPolicyId);
        if (!policy) {
            this.initializeDefaultPolicy();
            policy = this.policies.get(this.defaultPolicyId)!;
        }
        return policy;
    }

    /**
     * Make policy decision with adaptive parameters
     */
    private makePolicyDecision(
        policy: AdaptivePolicyState,
        testImpacts: Record<string, TestImpact>,
        context: PolicyContext
    ): PolicyDecision {
        const adjustedImpacts: Record<string, TestImpact> = {};
        const priorityBoosts: Record<string, number> = {};
        const reasoning: string[] = [];
        
        // Calculate adaptive threshold
        let selectionThreshold = policy.parameters.selectionThreshold;
        
        // Adjust threshold based on context
        if (context.timeConstraints < 600000) { // Less than 10 minutes
            selectionThreshold *= 1.2; // Be more selective with limited time
            reasoning.push('Increased threshold due to time constraints');
        }
        
        if (context.changeComplexity > 0.7) {
            selectionThreshold *= 0.9; // Be less selective for complex changes
            reasoning.push('Decreased threshold due to high change complexity');
        }

        // Adjust threshold based on recent performance
        if (policy.performance) {
            if (policy.performance.recall < 0.6) {
                selectionThreshold *= 0.85; // Lower threshold to improve recall
                reasoning.push('Decreased threshold to improve recall');
            } else if (policy.performance.precision < 0.6) {
                selectionThreshold *= 1.15; // Raise threshold to improve precision
                reasoning.push('Increased threshold to improve precision');
            }
        }

        // Apply semantic change type boosts
        const changeTypeBoosts = this.calculateChangeTypeBoosts(context.semanticChanges, policy);
        
        // Process each test impact
        for (const [testId, impact] of Object.entries(testImpacts)) {
            let adjustedScore = impact.impactScore;
            let boost = 1.0;

            // Apply change type boosts
            for (const change of impact.contributingChanges) {
                const typeBoost = changeTypeBoosts.get(change.semanticType as import("../GraphTypes").SemanticChangeInfo['semanticType']) || 1.0;
                boost *= typeBoost;
            }

            // Apply diversity bonus for different test types
            if (impact.testPath.includes('integration')) {
                boost *= (1 + policy.parameters.diversityWeight * 0.1);
                reasoning.push(`Applied integration test boost to ${testId}`);
            }

            // Apply risk tolerance adjustment
            if (policy.parameters.riskTolerance < 0.5 && adjustedScore > 0.8) {
                boost *= 1.1; // Boost high-impact tests when risk-averse
            }

            adjustedScore *= boost;
            priorityBoosts[testId] = boost;

            // Create adjusted impact
            adjustedImpacts[testId] = {
                ...impact,
                impactScore: Math.min(1.0, adjustedScore)
            };
        }

        // Calculate decision confidence
        const confidence = this.calculateDecisionConfidence(policy, context, adjustedImpacts);

        return {
            adjustedImpacts,
            selectionThreshold,
            priorityBoosts,
            reasoning,
            confidence
        };
    }

    /**
     * Calculate change type boost factors
     */
    private calculateChangeTypeBoosts(
        semanticChanges: SemanticChangeInfo[],
        policy: AdaptivePolicyState
    ): Map<SemanticChangeInfo['semanticType'], number> {
        const boosts = new Map<SemanticChangeInfo['semanticType'], number>();
        const boostFactor = policy.parameters.priorityBoostFactor;

        // Default boosts based on change type risk
        boosts.set('BUG_FIX', 1.0 + boostFactor * 0.3);        // High risk
        boosts.set('FEATURE_ADDITION', 1.0 + boostFactor * 0.2); // Medium-high risk
        boosts.set('REFACTORING_SIGNATURE', 1.0 + boostFactor * 0.25); // High risk
        boosts.set('REFACTORING_LOGIC', 1.0 + boostFactor * 0.1);     // Medium risk
        boosts.set('DEPENDENCY_UPDATE', 1.0 + boostFactor * 0.15);    // Medium risk
        boosts.set('PERFORMANCE_OPT', 1.0 + boostFactor * 0.05);      // Low risk
        boosts.set('UNKNOWN', 1.0 + boostFactor * 0.2);              // Medium-high risk (unknown)

        return boosts;
    }

    /**
     * Calculate decision confidence
     */
    private calculateDecisionConfidence(
        policy: AdaptivePolicyState,
        context: PolicyContext,
        adjustedImpacts: Record<string, TestImpact>
    ): number {
        let confidence = 0.7; // Base confidence

        // Adjust based on policy stability
        confidence += policy.stability * 0.2;

        // Adjust based on historical performance
        if (policy.performance) {
            confidence += (policy.performance.f1Score - 0.5) * 0.2;
        }

        // Adjust based on impact score distribution
        const scores = Object.values(adjustedImpacts).map(impact => impact.impactScore);
        if (scores.length > 0) {
            const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
            const variance = scores.reduce((sum, score) => sum + Math.pow(score - avgScore, 2), 0) / scores.length;
            
            // Higher confidence when scores have clear separation
            if (variance > 0.1) {
                confidence += 0.1;
            }
        }

        // Adjust based on context complexity
        confidence -= context.changeComplexity * 0.1;

        return Math.max(0.1, Math.min(1.0, confidence));
    }

    /**
     * Build complete policy context
     */
    private buildPolicyContext(
        semanticChanges: SemanticChangeInfo[],
        testImpacts: Record<string, TestImpact>,
        context?: Partial<PolicyContext>
    ): PolicyContext {
        // Calculate change complexity
        const complexChangeTypes = ['BUG_FIX', 'FEATURE_ADDITION', 'REFACTORING_SIGNATURE'];
        const complexChanges = semanticChanges.filter(change => 
            complexChangeTypes.includes(change.semanticType)
        );
        const changeComplexity = Math.min(1.0, complexChanges.length / Math.max(1, semanticChanges.length));

        // Calculate historical success (simplified)
        const policy = this.getCurrentPolicy();
        const historicalSuccess = policy.performance ? policy.performance.f1Score : 0.7;

        // Calculate project characteristics
        const testSuiteSize = Object.keys(testImpacts).length;
        const averageTestTime = 5000; // Default 5 seconds
        const faultDensity = 0.1; // Default 10% failure rate

        return {
            semanticChanges,
            changeComplexity,
            timeConstraints: context?.timeConstraints || 300000, // 5 minutes default
            historicalSuccess,
            projectCharacteristics: {
                testSuiteSize,
                averageTestTime,
                faultDensity
            },
            ...context
        };
    }

    /**
     * Group learning signals by type
     */
    private groupLearningSignals(signals: LearningSignal[]): Map<string, LearningSignal[]> {
        const groups = new Map<string, LearningSignal[]>();
        
        for (const signal of signals) {
            if (!groups.has(signal.signalType)) {
                groups.set(signal.signalType, []);
            }
            groups.get(signal.signalType)!.push(signal);
        }
        
        return groups;
    }

    /**
     * Determine if a learning signal should be applied
     */
    private shouldApplySignal(signal: LearningSignal, policy: AdaptivePolicyState): boolean {
        // Check signal confidence
        if (signal.confidence < 0.6) {
            return false;
        }

        // Check if policy is too unstable for more changes
        if (policy.stability < 0.3 && signal.strength > 0.5) {
            Logger.debug(`Skipping strong signal due to policy instability: ${signal.signalType}`);
            return false;
        }

        // Check if we've made too many recent adaptations
        const recentAdaptations = policy.adaptationHistory.filter(
            adaptation => Date.now() - adaptation.timestamp < 600000 // 10 minutes
        );
        
        if (recentAdaptations.length > 5) {
            Logger.debug('Skipping signal due to too many recent adaptations');
            return false;
        }

        return true;
    }

    /**
     * Adapt policy parameter based on learning signal
     */
    private adaptPolicyParameter(policy: AdaptivePolicyState, signal: LearningSignal): void {
        const currentParams = policy.parameters;
        let parameter: keyof PolicyParameters;
        let currentValue: number;
        let newValue: number;

        // Map signal target to policy parameter
        switch (signal.targetComponent) {
            case 'selection_sensitivity':
                parameter = 'selectionThreshold';
                currentValue = currentParams.selectionThreshold;
                break;
            case 'priority_boost':
                parameter = 'priorityBoostFactor';
                currentValue = currentParams.priorityBoostFactor;
                break;
            case 'risk_tolerance':
                parameter = 'riskTolerance';
                currentValue = currentParams.riskTolerance;
                break;
            case 'diversity_weight':
                parameter = 'diversityWeight';
                currentValue = currentParams.diversityWeight;
                break;
            default:
                Logger.debug(`Unknown policy parameter target: ${signal.targetComponent}`);
                return;
        }

        // Calculate adaptation amount
        const adaptationAmount = signal.strength * currentParams.adaptationRate;
        
        // Apply directional change
        switch (signal.direction) {
            case 'INCREASE':
                newValue = Math.min(1.0, currentValue + adaptationAmount);
                break;
            case 'DECREASE':
                newValue = Math.max(0.0, currentValue - adaptationAmount);
                break;
            case 'MAINTAIN':
                newValue = currentValue; // No change but record the decision
                break;
            default:
                return;
        }

        // Apply the change
        currentParams[parameter] = newValue;

        // Record the adaptation
        this.recordAdaptation(policy, {
            timestamp: Date.now(),
            parameter,
            oldValue: currentValue,
            newValue,
            reason: signal.reason,
            expectedImprovement: signal.strength * signal.confidence
        });

        Logger.debug(`Adapted ${parameter}: ${currentValue.toFixed(3)} -> ${newValue.toFixed(3)} (${signal.reason})`);
    }

    /**
     * Adapt selection threshold based on learning signal
     */
    private adaptThreshold(policy: AdaptivePolicyState, signal: LearningSignal): void {
        const currentThreshold = policy.parameters.selectionThreshold;
        const adaptationAmount = signal.strength * policy.parameters.adaptationRate * 0.1;
        
        let newThreshold: number;
        switch (signal.direction) {
            case 'INCREASE':
                newThreshold = Math.min(0.95, currentThreshold + adaptationAmount);
                break;
            case 'DECREASE':
                newThreshold = Math.max(0.05, currentThreshold - adaptationAmount);
                break;
            case 'MAINTAIN':
                newThreshold = currentThreshold;
                break;
            default:
                return;
        }

        policy.parameters.selectionThreshold = newThreshold;

        this.recordAdaptation(policy, {
            timestamp: Date.now(),
            parameter: 'selectionThreshold',
            oldValue: currentThreshold,
            newValue: newThreshold,
            reason: signal.reason,
            expectedImprovement: signal.strength * signal.confidence
        });

        Logger.debug(`Adapted threshold: ${currentThreshold.toFixed(3)} -> ${newThreshold.toFixed(3)}`);
    }

    /**
     * Record policy adaptation
     */
    private recordAdaptation(policy: AdaptivePolicyState, adaptation: PolicyAdaptation): void {
        policy.adaptationHistory.push(adaptation);
        
        // Keep only recent history
        const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
        policy.adaptationHistory = policy.adaptationHistory.filter(
            a => a.timestamp > cutoffTime
        );
        
        this.adaptationCounter++;
    }

    /**
     * Update policy stability metric
     */
    private updatePolicyStability(policy: AdaptivePolicyState, adaptationsMade: number): void {
        const recentAdaptations = policy.adaptationHistory.filter(
            adaptation => Date.now() - adaptation.timestamp < 3600000 // 1 hour
        );

        // Calculate stability based on recent adaptation frequency
        const adaptationRate = recentAdaptations.length / 6; // Per 10-minute period
        let stabilityScore = Math.max(0, 1 - adaptationRate);

        // Factor in performance consistency
        if (policy.performance) {
            const performanceStability = policy.performance.f1Score > 0.6 ? 0.2 : -0.1;
            stabilityScore += performanceStability;
        }

        // Smooth the stability metric
        policy.stability = policy.stability * 0.8 + stabilityScore * 0.2;
        policy.stability = Math.max(0, Math.min(1, policy.stability));
    }

    /**
     * Initialize default policy
     */
    private initializeDefaultPolicy(): void {
        const defaultParameters: PolicyParameters = {
            selectionThreshold: this.configManager.getHighImpactThreshold() * 0.8, // Start slightly below high threshold
            priorityBoostFactor: 0.2,
            diversityWeight: 0.1,
            riskTolerance: 0.6,
            adaptationRate: 0.1,
            contextSensitivity: 0.7
        };

        const defaultPolicy: AdaptivePolicyState = {
            parameters: defaultParameters,
            performance: null,
            adaptationHistory: [],
            lastUpdate: Date.now(),
            stability: 0.8 // Start with good stability
        };

        this.policies.set(this.defaultPolicyId, defaultPolicy);
        Logger.info('Initialized default adaptive policy');
    }

    /**
     * Get policy statistics
     */
    public getPolicyStatistics(): {
        totalAdaptations: number;
        currentStability: number;
        recentPerformance: SessionPerformanceMetrics | null;
        parameterValues: PolicyParameters;
        adaptationFrequency: number;
    } {
        const policy = this.getCurrentPolicy();
        
        // Calculate recent adaptation frequency
        const recentAdaptations = policy.adaptationHistory.filter(
            adaptation => Date.now() - adaptation.timestamp < 3600000 // 1 hour
        );
        
        return {
            totalAdaptations: this.adaptationCounter,
            currentStability: policy.stability,
            recentPerformance: policy.performance,
            parameterValues: { ...policy.parameters },
            adaptationFrequency: recentAdaptations.length
        };
    }

    /**
     * Reset policy to defaults (for testing)
     */
    public resetToDefaults(): void {
        this.policies.clear();
        this.adaptationCounter = 0;
        this.initializeDefaultPolicy();
        Logger.info('Policy manager reset to defaults');
    }

    /**
     * Export policy state for persistence
     */
    public exportPolicyState(): any {
        const policy = this.getCurrentPolicy();
        return {
            parameters: policy.parameters,
            performance: policy.performance,
            stability: policy.stability,
            lastUpdate: policy.lastUpdate,
            adaptationCount: this.adaptationCounter
        };
    }

    /**
     * Import policy state from persistence
     */
    public importPolicyState(state: any): void {
        try {
            const policy = this.getCurrentPolicy();
            
            if (state.parameters) {
                policy.parameters = { ...policy.parameters, ...state.parameters };
            }
            
            if (state.performance) {
                policy.performance = state.performance;
            }
            
            if (typeof state.stability === 'number') {
                policy.stability = Math.max(0, Math.min(1, state.stability));
            }
            
            if (state.lastUpdate) {
                policy.lastUpdate = state.lastUpdate;
            }
            
            if (typeof state.adaptationCount === 'number') {
                this.adaptationCounter = state.adaptationCount;
            }
            
            Logger.info('Imported policy state successfully');
        } catch (error) {
            Logger.error('Failed to import policy state:', error);
            this.resetToDefaults();
        }
    }

    /**
     * Get parameter adjustment recommendations
     */
    public getParameterRecommendations(performanceMetrics: SessionPerformanceMetrics): string[] {
        const recommendations: string[] = [];
        const policy = this.getCurrentPolicy();
        
        // Analyze performance and suggest adjustments
        if (performanceMetrics.precision < 0.6) {
            recommendations.push('Consider increasing selection threshold to reduce false positives');
        }
        
        if (performanceMetrics.recall < 0.6) {
            recommendations.push('Consider decreasing selection threshold to reduce false negatives');
        }
        
        if (performanceMetrics.f1Score < 0.5) {
            recommendations.push('Consider adjusting risk tolerance and priority boost factors');
        }
        
        if (policy.stability < 0.4) {
            recommendations.push('Policy is unstable - consider reducing adaptation rate');
        }
        
        if (performanceMetrics.faultDetectionRate > 0.2) {
            recommendations.push('High fault detection suggests current policy is effective');
        }
        
        return recommendations;
    }
}