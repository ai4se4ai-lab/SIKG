/**
 * ActionSpace.ts - Action space A implementation for SIKG MDP
 * 
 * Defines the action space that includes:
 * - Test selection strategies (thresholds, prioritization methods)
 * - Weight adjustment parameters
 * - Exploration vs exploitation decisions
 * - Dynamic threshold adaptation
 */

import { Logger } from '../../utils/Logger';
import { 
    MDPAction, 
    MDPState, 
    ActionVector, 
    ThresholdSettings, 
    WeightAdjustments, 
    PrioritizationStrategy,
    ActionType
} from '../types/ReinforcementTypes';

export class ActionSpace {
    private availableActions: Map<string, MDPAction> = new Map();
    private actionTemplates: ActionTemplate[] = [];
    private actionHistory: ActionHistoryEntry[] = [];

    constructor() {
        this.initializeActionSpace();
        Logger.debug('Action space initialized with ' + this.availableActions.size + ' actions');
    }

    /**
     * Get valid actions for a given state
     * @param state Current MDP state
     * @returns Array of valid actions
     */
    public getValidActions(state: MDPState): MDPAction[] {
        const validActions: MDPAction[] = [];

        for (const action of this.availableActions.values()) {
            if (this.isActionValid(action, state)) {
                validActions.push(action);
            }
        }

        // If no predefined actions are valid, generate adaptive actions
        if (validActions.length === 0) {
            validActions.push(...this.generateAdaptiveActions(state));
        }

        Logger.debug(`Found ${validActions.length} valid actions for state ${state.id}`);
        return validActions;
    }

    /**
     * Get specific action by ID
     */
    public getAction(actionId: string): MDPAction | undefined {
        return this.availableActions.get(actionId);
    }

    /**
     * Create new action based on parameters
     */
    public createAction(
        type: ActionType,
        thresholds: ThresholdSettings,
        weights: WeightAdjustments,
        strategy: PrioritizationStrategy
    ): MDPAction {
        const actionId = this.generateActionId(type, thresholds, weights, strategy);
        
        const action: MDPAction = {
            id: actionId,
            type: type,
            vector: this.createActionVector(thresholds, weights, strategy),
            thresholds: thresholds,
            weightAdjustments: weights,
            prioritizationStrategy: strategy,
            explorationFactor: this.calculateExplorationFactor(type),
            expectedReward: 0, // Will be learned
            confidence: 0.5,   // Initial confidence
            metadata: {
                created: new Date(),
                usageCount: 0,
                averageReward: 0
            }
        };

        this.availableActions.set(actionId, action);
        Logger.debug(`Created new action: ${actionId}`);
        
        return action;
    }

    /**
     * Generate adaptive actions based on current state
     */
    private generateAdaptiveActions(state: MDPState): MDPAction[] {
        const adaptiveActions: MDPAction[] = [];

        // Generate conservative action
        adaptiveActions.push(this.createAction(
            ActionType.CONSERVATIVE,
            this.generateConservativeThresholds(state),
            this.generateConservativeWeights(state),
            this.generateConservativePrioritization(state)
        ));

        // Generate aggressive action
        adaptiveActions.push(this.createAction(
            ActionType.AGGRESSIVE,
            this.generateAggressiveThresholds(state),
            this.generateAggressiveWeights(state),
            this.generateAggressivePrioritization(state)
        ));

        // Generate balanced action
        adaptiveActions.push(this.createAction(
            ActionType.BALANCED,
            this.generateBalancedThresholds(state),
            this.generateBalancedWeights(state),
            this.generateBalancedPrioritization(state)
        ));

        // Generate exploration action if warranted
        if (this.shouldExplore(state)) {
            adaptiveActions.push(this.createAction(
                ActionType.EXPLORATION,
                this.generateExplorationThresholds(state),
                this.generateExplorationWeights(state),
                this.generateExplorationPrioritization(state)
            ));
        }

        return adaptiveActions;
    }

    /**
     * Check if an action is valid for a given state
     */
    private isActionValid(action: MDPAction, state: MDPState): boolean {
        // Check if action type is appropriate for state characteristics
        const changeComplexity = state.vector.changeComplexity;
        const historicalAccuracy = state.vector.historicalAccuracy;

        switch (action.type) {
            case ActionType.CONSERVATIVE:
                // Conservative actions are always valid but may not be optimal
                return true;

            case ActionType.AGGRESSIVE:
                // Aggressive actions are valid when we have high confidence
                return historicalAccuracy > 0.7;

            case ActionType.BALANCED:
                // Balanced actions are generally valid
                return true;

            case ActionType.EXPLORATION:
               // Exploration is valid when uncertainty is high or accuracy is low
               return historicalAccuracy < 0.8 || changeComplexity > 0.6;

           case ActionType.EXPLOITATION:
               // Exploitation is valid when we have high confidence in our model
               return historicalAccuracy > 0.8 && changeComplexity < 0.5;

           default:
               return true;
       }
   }

   /**
    * Generate conservative thresholds (high precision, lower recall)
    */
   private generateConservativeThresholds(state: MDPState): ThresholdSettings {
       return {
           highImpactThreshold: 0.8,
           mediumImpactThreshold: 0.6,
           lowImpactThreshold: 0.4,
           minImpactThreshold: 0.1,
           confidenceThreshold: 0.9,
           maxTestsSelected: Math.floor(100 * (1 - state.vector.changeComplexity))
       };
   }

   /**
    * Generate aggressive thresholds (higher recall, lower precision)
    */
   private generateAggressiveThresholds(state: MDPState): ThresholdSettings {
       return {
           highImpactThreshold: 0.4,
           mediumImpactThreshold: 0.2,
           lowImpactThreshold: 0.1,
           minImpactThreshold: 0.02,
           confidenceThreshold: 0.5,
           maxTestsSelected: Math.floor(200 * (0.5 + state.vector.changeComplexity))
       };
   }

   /**
    * Generate balanced thresholds
    */
   private generateBalancedThresholds(state: MDPState): ThresholdSettings {
       const complexityFactor = state.vector.changeComplexity;
       const accuracyFactor = state.vector.historicalAccuracy;
       
       return {
           highImpactThreshold: 0.6 + 0.2 * accuracyFactor,
           mediumImpactThreshold: 0.4 + 0.1 * accuracyFactor,
           lowImpactThreshold: 0.2 + 0.1 * accuracyFactor,
           minImpactThreshold: 0.05,
           confidenceThreshold: 0.7 + 0.2 * accuracyFactor,
           maxTestsSelected: Math.floor(150 * (0.7 + 0.3 * complexityFactor))
       };
   }

   /**
    * Generate exploration thresholds (designed to discover new patterns)
    */
   private generateExplorationThresholds(state: MDPState): ThresholdSettings {
       // Add randomness for exploration
       const randomFactor = 0.8 + 0.4 * Math.random();
       
       return {
           highImpactThreshold: 0.5 * randomFactor,
           mediumImpactThreshold: 0.3 * randomFactor,
           lowImpactThreshold: 0.15 * randomFactor,
           minImpactThreshold: 0.01,
           confidenceThreshold: 0.3 + 0.4 * Math.random(),
           maxTestsSelected: Math.floor(100 + 200 * Math.random())
       };
   }

   /**
    * Generate conservative weight adjustments
    */
   private generateConservativeWeights(state: MDPState): WeightAdjustments {
       return {
           relationshipWeights: {
               CALLS: 0.9,
               USES: 0.8,
               INHERITS_FROM: 0.9,
               DEPENDS_ON: 0.7,
               BELONGS_TO: 0.8,
               TESTS: 1.0,
               IS_TESTED_BY: 1.0,
               MODIFIES: 0.85,
               IMPORTS: 0.6
           },
           semanticTypeWeights: {
               BUG_FIX: 0.9,
               FEATURE_ADDITION: 0.8,
               REFACTORING_SIGNATURE: 1.0,
               REFACTORING_LOGIC: 0.6,
               DEPENDENCY_UPDATE: 0.7,
               PERFORMANCE_OPT: 0.4,
               UNKNOWN: 0.5
           },
           attenuationFactors: {
               depth1: 0.9,
               depth2: 0.7,
               depth3: 0.5,
               depth4: 0.3,
               depth5: 0.1
           },
           learningRate: 0.01,
           momentum: 0.9
       };
   }

   /**
    * Generate aggressive weight adjustments
    */
   private generateAggressiveWeights(state: MDPState): WeightAdjustments {
       return {
           relationshipWeights: {
               CALLS: 1.0,
               USES: 0.9,
               INHERITS_FROM: 1.0,
               DEPENDS_ON: 0.8,
               BELONGS_TO: 0.9,
               TESTS: 1.0,
               IS_TESTED_BY: 1.0,
               MODIFIES: 0.95,
               IMPORTS: 0.7
           },
           semanticTypeWeights: {
               BUG_FIX: 1.0,
               FEATURE_ADDITION: 0.9,
               REFACTORING_SIGNATURE: 1.0,
               REFACTORING_LOGIC: 0.8,
               DEPENDENCY_UPDATE: 0.8,
               PERFORMANCE_OPT: 0.6,
               UNKNOWN: 0.7
           },
           attenuationFactors: {
               depth1: 1.0,
               depth2: 0.8,
               depth3: 0.6,
               depth4: 0.4,
               depth5: 0.2
           },
           learningRate: 0.05,
           momentum: 0.7
       };
   }

   /**
    * Generate balanced weight adjustments
    */
   private generateBalancedWeights(state: MDPState): WeightAdjustments {
       const accuracyFactor = state.vector.historicalAccuracy;
       
       return {
           relationshipWeights: {
               CALLS: 0.9 + 0.1 * accuracyFactor,
               USES: 0.8 + 0.1 * accuracyFactor,
               INHERITS_FROM: 0.9 + 0.1 * accuracyFactor,
               DEPENDS_ON: 0.7 + 0.1 * accuracyFactor,
               BELONGS_TO: 0.8 + 0.1 * accuracyFactor,
               TESTS: 1.0,
               IS_TESTED_BY: 1.0,
               MODIFIES: 0.85 + 0.1 * accuracyFactor,
               IMPORTS: 0.6 + 0.1 * accuracyFactor
           },
           semanticTypeWeights: {
               BUG_FIX: 0.8 + 0.2 * accuracyFactor,
               FEATURE_ADDITION: 0.7 + 0.2 * accuracyFactor,
               REFACTORING_SIGNATURE: 0.9 + 0.1 * accuracyFactor,
               REFACTORING_LOGIC: 0.5 + 0.2 * accuracyFactor,
               DEPENDENCY_UPDATE: 0.6 + 0.2 * accuracyFactor,
               PERFORMANCE_OPT: 0.4 + 0.1 * accuracyFactor,
               UNKNOWN: 0.5
           },
           attenuationFactors: {
               depth1: 0.95,
               depth2: 0.75,
               depth3: 0.55,
               depth4: 0.35,
               depth5: 0.15
           },
           learningRate: 0.02 + 0.02 * (1 - accuracyFactor),
           momentum: 0.8 + 0.1 * accuracyFactor
       };
   }

   /**
    * Generate exploration weight adjustments (with randomness)
    */
   private generateExplorationWeights(state: MDPState): WeightAdjustments {
       const randomize = (base: number, variance: number = 0.3) => {
           return Math.max(0.1, Math.min(1.0, base + (Math.random() - 0.5) * variance));
       };

       return {
           relationshipWeights: {
               CALLS: randomize(0.9),
               USES: randomize(0.8),
               INHERITS_FROM: randomize(0.9),
               DEPENDS_ON: randomize(0.7),
               BELONGS_TO: randomize(0.8),
               TESTS: randomize(1.0, 0.1), // Less variance for critical relationships
               IS_TESTED_BY: randomize(1.0, 0.1),
               MODIFIES: randomize(0.85),
               IMPORTS: randomize(0.6)
           },
           semanticTypeWeights: {
               BUG_FIX: randomize(0.8),
               FEATURE_ADDITION: randomize(0.7),
               REFACTORING_SIGNATURE: randomize(0.9),
               REFACTORING_LOGIC: randomize(0.5),
               DEPENDENCY_UPDATE: randomize(0.6),
               PERFORMANCE_OPT: randomize(0.4),
               UNKNOWN: randomize(0.5)
           },
           attenuationFactors: {
               depth1: randomize(0.9, 0.2),
               depth2: randomize(0.7, 0.3),
               depth3: randomize(0.5, 0.3),
               depth4: randomize(0.3, 0.3),
               depth5: randomize(0.1, 0.2)
           },
           learningRate: 0.01 + 0.09 * Math.random(),
           momentum: 0.5 + 0.4 * Math.random()
       };
   }

   /**
    * Generate conservative prioritization strategy
    */
   private generateConservativePrioritization(state: MDPState): PrioritizationStrategy {
       return {
           algorithm: 'weighted_scoring',
           parameters: {
               impactWeight: 0.8,
               confidenceWeight: 0.2,
               historicalWeight: 0.1,
               complexityWeight: 0.1,
               executionTimeWeight: 0.3,
               riskAversion: 0.9
           },
           maxDepth: 3,
           useCaching: true,
           parallelize: false
       };
   }

   /**
    * Generate aggressive prioritization strategy
    */
   private generateAggressivePrioritization(state: MDPState): PrioritizationStrategy {
       return {
           algorithm: 'impact_maximization',
           parameters: {
               impactWeight: 0.9,
               confidenceWeight: 0.1,
               historicalWeight: 0.2,
               complexityWeight: 0.2,
               executionTimeWeight: 0.1,
               riskAversion: 0.3
           },
           maxDepth: 5,
           useCaching: true,
           parallelize: true
       };
   }

   /**
    * Generate balanced prioritization strategy
    */
   private generateBalancedPrioritization(state: MDPState): PrioritizationStrategy {
       const accuracyFactor = state.vector.historicalAccuracy;
       
       return {
           algorithm: 'adaptive_scoring',
           parameters: {
               impactWeight: 0.7 + 0.2 * accuracyFactor,
               confidenceWeight: 0.3 - 0.1 * accuracyFactor,
               historicalWeight: 0.1 + 0.1 * accuracyFactor,
               complexityWeight: 0.15,
               executionTimeWeight: 0.2,
               riskAversion: 0.5 + 0.3 * accuracyFactor
           },
           maxDepth: 4,
           useCaching: true,
           parallelize: state.vector.projectSize > 0.5
       };
   }

   /**
    * Generate exploration prioritization strategy
    */
   private generateExplorationPrioritization(state: MDPState): PrioritizationStrategy {
       return {
           algorithm: 'random_sampling',
           parameters: {
               impactWeight: 0.3 + 0.4 * Math.random(),
               confidenceWeight: 0.1 + 0.3 * Math.random(),
               historicalWeight: 0.05 + 0.15 * Math.random(),
               complexityWeight: 0.1 + 0.2 * Math.random(),
               executionTimeWeight: 0.1 + 0.3 * Math.random(),
               riskAversion: 0.2 + 0.6 * Math.random()
           },
           maxDepth: Math.floor(2 + 4 * Math.random()),
           useCaching: Math.random() > 0.5,
           parallelize: Math.random() > 0.3
       };
   }

   /**
    * Create action vector from components
    */
   private createActionVector(
       thresholds: ThresholdSettings,
       weights: WeightAdjustments,
       strategy: PrioritizationStrategy
   ): ActionVector {
       // Flatten all parameters into a numerical vector for ML algorithms
       return {
           // Threshold parameters
           thresholdVector: [
               thresholds.highImpactThreshold,
               thresholds.mediumImpactThreshold,
               thresholds.lowImpactThreshold,
               thresholds.minImpactThreshold,
               thresholds.confidenceThreshold,
               thresholds.maxTestsSelected / 1000 // Normalize
           ],
           
           // Weight parameters
           weightVector: [
               ...Object.values(weights.relationshipWeights),
               ...Object.values(weights.semanticTypeWeights),
               ...Object.values(weights.attenuationFactors),
               weights.learningRate,
               weights.momentum
           ],
           
           // Strategy parameters
           strategyVector: [
               ...Object.values(strategy.parameters),
               strategy.maxDepth / 10, // Normalize
               strategy.useCaching ? 1 : 0,
               strategy.parallelize ? 1 : 0
           ]
       };
   }

   /**
    * Generate unique action ID
    */
   private generateActionId(
       type: ActionType,
       thresholds: ThresholdSettings,
       weights: WeightAdjustments,
       strategy: PrioritizationStrategy
   ): string {
       const hash = require('crypto').createHash('md5');
       hash.update(JSON.stringify({ type, thresholds, weights, strategy }));
       return `action_${type}_${hash.digest('hex').substring(0, 8)}`;
   }

   /**
    * Calculate exploration factor based on action type
    */
   private calculateExplorationFactor(type: ActionType): number {
       switch (type) {
           case ActionType.EXPLORATION:
               return 0.9;
           case ActionType.CONSERVATIVE:
               return 0.1;
           case ActionType.AGGRESSIVE:
               return 0.3;
           case ActionType.BALANCED:
               return 0.2;
           case ActionType.EXPLOITATION:
               return 0.05;
           default:
               return 0.2;
       }
   }

   /**
    * Determine if exploration should be encouraged
    */
   private shouldExplore(state: MDPState): boolean {
       const lowAccuracy = state.vector.historicalAccuracy < 0.7;
       const highComplexity = state.vector.changeComplexity > 0.6;
       const lowConfidence = state.vector.recentTrend < 0;
       
       return lowAccuracy || highComplexity || lowConfidence;
   }

   /**
    * Initialize predefined action templates
    */
   private initializeActionSpace(): void {
       // Create basic action templates
       this.actionTemplates = [
           {
               name: 'high_precision',
               type: ActionType.CONSERVATIVE,
               description: 'Conservative approach favoring precision over recall'
           },
           {
               name: 'high_recall',
               type: ActionType.AGGRESSIVE,
               description: 'Aggressive approach favoring recall over precision'
           },
           {
               name: 'balanced',
               type: ActionType.BALANCED,
               description: 'Balanced approach optimizing F1-score'
           },
           {
               name: 'exploration',
               type: ActionType.EXPLORATION,
               description: 'Exploration strategy for learning new patterns'
           },
           {
               name: 'exploitation',
               type: ActionType.EXPLOITATION,
               description: 'Exploitation strategy leveraging learned knowledge'
           }
       ];

       // Create initial set of actions
       for (const template of this.actionTemplates) {
           const defaultState = this.createDefaultState();
           let action: MDPAction;

           switch (template.type) {
               case ActionType.CONSERVATIVE:
                   action = this.createAction(
                       template.type,
                       this.generateConservativeThresholds(defaultState),
                       this.generateConservativeWeights(defaultState),
                       this.generateConservativePrioritization(defaultState)
                   );
                   break;
               case ActionType.AGGRESSIVE:
                   action = this.createAction(
                       template.type,
                       this.generateAggressiveThresholds(defaultState),
                       this.generateAggressiveWeights(defaultState),
                       this.generateAggressivePrioritization(defaultState)
                   );
                   break;
               case ActionType.BALANCED:
                   action = this.createAction(
                       template.type,
                       this.generateBalancedThresholds(defaultState),
                       this.generateBalancedWeights(defaultState),
                       this.generateBalancedPrioritization(defaultState)
                   );
                   break;
               case ActionType.EXPLORATION:
                   action = this.createAction(
                       template.type,
                       this.generateExplorationThresholds(defaultState),
                       this.generateExplorationWeights(defaultState),
                       this.generateExplorationPrioritization(defaultState)
                   );
                   break;
               case ActionType.EXPLOITATION:
                   action = this.createAction(
                       template.type,
                       this.generateConservativeThresholds(defaultState), // Safe exploitation
                       this.generateBalancedWeights(defaultState),
                       this.generateBalancedPrioritization(defaultState)
                   );
                   break;
           }
       }
   }

   /**
    * Create default state for initialization
    */
   private createDefaultState(): MDPState {
       return {
           id: 'default',
           vector: {
               changeComplexity: 0.5,
               changeSemanticTypes: 0.5,
               changeScope: 0.5,
               historicalAccuracy: 0.7,
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
           },
           timestamp: new Date(),
           context: {},
           hash: 'default'
       };
   }

   /**
    * Update action statistics based on observed rewards
    */
   public updateActionStatistics(actionId: string, reward: number): void {
       const action = this.availableActions.get(actionId);
       if (!action) return;

       action.metadata.usageCount++;
       
       // Update running average reward
       const count = action.metadata.usageCount;
       const oldAverage = action.metadata.averageReward;
       action.metadata.averageReward = oldAverage + (reward - oldAverage) / count;
       
       // Update expected reward (weighted average with decay)
       const alpha = 0.1; // Learning rate
       action.expectedReward = (1 - alpha) * action.expectedReward + alpha * reward;

       // Update confidence based on consistency of rewards
       const variance = Math.abs(reward - action.metadata.averageReward);
       action.confidence = Math.max(0.1, action.confidence - 0.01 * variance + 0.005);

       // Record action history
       this.actionHistory.push({
           actionId: actionId,
           reward: reward,
           timestamp: new Date(),
           state: action.metadata
       });

       Logger.debug(`Updated action ${actionId}: reward=${reward.toFixed(3)}, avgReward=${action.metadata.averageReward.toFixed(3)}`);
   }

   /**
    * Get action space size
    */
   public getActionSpaceSize(): number {
       return this.availableActions.size;
   }

   /**
    * Get action statistics for analysis
    */
   public getActionStatistics(): ActionStatistics {
       const actions = Array.from(this.availableActions.values());
       
       return {
           totalActions: actions.length,
           averageUsage: actions.reduce((sum, a) => sum + a.metadata.usageCount, 0) / actions.length,
           bestAction: actions.reduce((best, current) => 
               current.metadata.averageReward > best.metadata.averageReward ? current : best
           ),
           actionTypeDistribution: this.getActionTypeDistribution(actions),
           recentHistory: this.actionHistory.slice(-100) // Last 100 actions
       };
   }

   /**
    * Get distribution of action types
    */
   private getActionTypeDistribution(actions: MDPAction[]): Record<ActionType, number> {
       const distribution: Record<ActionType, number> = {
           [ActionType.CONSERVATIVE]: 0,
           [ActionType.AGGRESSIVE]: 0,
           [ActionType.BALANCED]: 0,
           [ActionType.EXPLORATION]: 0,
           [ActionType.EXPLOITATION]: 0
       };

       for (const action of actions) {
           distribution[action.type]++;
       }

       return distribution;
   }
}

// Supporting interfaces and types
interface ActionTemplate {
   name: string;
   type: ActionType;
   description: string;
}

interface ActionHistoryEntry {
   actionId: string;
   reward: number;
   timestamp: Date;
   state: any;
}

interface ActionStatistics {
   totalActions: number;
   averageUsage: number;
   bestAction: MDPAction;
   actionTypeDistribution: Record<ActionType, number>;
   recentHistory: ActionHistoryEntry[];
}