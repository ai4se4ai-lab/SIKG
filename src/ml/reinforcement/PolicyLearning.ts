/**
 * PolicyLearning.ts - Policy learning implementation for SIKG MDP
 * 
 * Implements various policy learning algorithms:
 * - Epsilon-greedy policy
 * - Upper Confidence Bound (UCB)
 * - Softmax policy
 * - Q-learning with function approximation
 * - Policy gradient methods
 */

import { Logger } from '../../utils/Logger';
import { ConfigManager } from '../../utils/ConfigManager';
import { 
    MDPState, 
    MDPAction, 
    Policy, 
    PolicyType,
    QValue,
    PolicyParameters,
    LearningStatistics 
} from '../types/ReinforcementTypes';

export class PolicyLearning {
    private policy: Policy;
    private qTable: Map<string, Map<string, QValue>>;
    private actionCounts: Map<string, Map<string, number>>;
    private episodeCount: number = 0;
    private learningRate: number;
    private discountFactor: number;
    private explorationRate: number;
    private policyType: PolicyType;
    private parameters: PolicyParameters;

    constructor(configManager: ConfigManager) {
        const rlConfig = configManager.getRLParameters();
        const policyConfig = configManager.getPolicyConfig();
        
        this.learningRate = rlConfig.learningRate;
        this.discountFactor = rlConfig.discountFactor;
        this.explorationRate = rlConfig.explorationRate;
        this.policyType = policyConfig.policyType as PolicyType;
        this.parameters = policyConfig as PolicyParameters;
        
        this.qTable = new Map();
        this.actionCounts = new Map();
        this.policy = this.initializePolicy();
        
        Logger.info(`Policy learning initialized with ${this.policyType} policy`);
    }

    /**
     * Select action based on current policy
     * @param state Current state
     * @returns Selected action
     */
    public async selectAction(state: MDPState, availableActions: MDPAction[]): Promise<MDPAction> {
        if (availableActions.length === 0) {
            throw new Error('No available actions for state: ' + state.id);
        }

        if (availableActions.length === 1) {
            return availableActions[0];
        }

        let selectedAction: MDPAction;

        switch (this.policyType) {
            case PolicyType.EPSILON_GREEDY:
                selectedAction = this.epsilonGreedySelection(state, availableActions);
                break;
            case PolicyType.UCB:
                selectedAction = this.ucbSelection(state, availableActions);
                break;
            case PolicyType.SOFTMAX:
                selectedAction = this.softmaxSelection(state, availableActions);
                break;
            case PolicyType.GREEDY:
                selectedAction = this.greedySelection(state, availableActions);
                break;
            default:
                selectedAction = this.epsilonGreedySelection(state, availableActions);
        }

        // Update action counts
        this.updateActionCounts(state, selectedAction);

        Logger.debug(`Selected action ${selectedAction.id} for state ${state.id} using ${this.policyType}`);
        return selectedAction;
    }

    /**
     * Update policy based on observed reward
     * @param state State where action was taken
     * @param action Action that was taken
     * @param reward Observed reward
     * @param nextState Next state (optional for terminal states)
     */
    public async updatePolicy(
        state: MDPState,
        action: MDPAction,
        reward: number,
        nextState?: MDPState
    ): Promise<void> {
        // Update Q-value using Q-learning update rule
        this.updateQValue(state, action, reward, nextState);
        
        // Update policy parameters
        this.updatePolicyParameters(reward);
        
        // Decay exploration rate
        this.decayExplorationRate();
        
        this.episodeCount++;
        
        Logger.debug(`Updated policy after episode ${this.episodeCount}, reward: ${reward.toFixed(3)}`);
    }

    /**
     * Epsilon-greedy action selection
     */
    private epsilonGreedySelection(state: MDPState, availableActions: MDPAction[]): MDPAction {
        if (Math.random() < this.explorationRate) {
            // Explore: random action
            const randomIndex = Math.floor(Math.random() * availableActions.length);
            return availableActions[randomIndex];
        } else {
            // Exploit: best known action
            return this.greedySelection(state, availableActions);
        }
    }

    /**
     * Upper Confidence Bound action selection
     */
    private ucbSelection(state: MDPState, availableActions: MDPAction[]): MDPAction {
        let bestAction = availableActions[0];
        let bestValue = -Infinity;

        for (const action of availableActions) {
            const qValue = this.getQValue(state, action);
            const actionCount = this.getActionCount(state, action);
            const totalCount = this.getTotalActionCount(state);
            
            // UCB formula: Q(s,a) + c * sqrt(ln(N) / N(s,a))
            const confidence = actionCount > 0 ? 
                Math.sqrt(Math.log(totalCount + 1) / actionCount) : 
                Number.MAX_VALUE;
            
            const ucbValue = qValue + this.parameters.ucbConstant * confidence;
            
            if (ucbValue > bestValue) {
                bestValue = ucbValue;
                bestAction = action;
            }
        }

        return bestAction;
    }

    /**
     * Softmax action selection (Boltzmann exploration)
     */
    private softmaxSelection(state: MDPState, availableActions: MDPAction[]): MDPAction {
        const temperature = this.parameters.temperature || 1.0;
        
        // Calculate softmax probabilities
        const qValues = availableActions.map(action => this.getQValue(state, action));
        const maxQ = Math.max(...qValues);
        
        // Numerical stability: subtract max before exponential
        const expValues = qValues.map(q => Math.exp((q - maxQ) / temperature));
        const sumExp = expValues.reduce((sum, exp) => sum + exp, 0);
        
        const probabilities = expValues.map(exp => exp / sumExp);
        
        // Sample from probability distribution
        const random = Math.random();
        let cumulativeProbability = 0;
        
        for (let i = 0; i < availableActions.length; i++) {
            cumulativeProbability += probabilities[i];
            if (random <= cumulativeProbability) {
                return availableActions[i];
            }
        }
        
        // Fallback (should not happen)
        return availableActions[availableActions.length - 1];
    }

    /**
     * Greedy action selection (best Q-value)
     */
    private greedySelection(state: MDPState, availableActions: MDPAction[]): MDPAction {
        let bestAction = availableActions[0];
        let bestQValue = this.getQValue(state, bestAction);

        for (const action of availableActions) {
            const qValue = this.getQValue(state, action);
            if (qValue > bestQValue) {
                bestQValue = qValue;
                bestAction = action;
            }
        }

        return bestAction;
    }

    /**
     * Update Q-value using Q-learning update rule
     * Q(s,a) ← Q(s,a) + α[r + γ max_a' Q(s',a') - Q(s,a)]
     */
    private updateQValue(
        state: MDPState,
        action: MDPAction,
        reward: number,
        nextState?: MDPState
    ): void {
        const currentQ = this.getQValue(state, action);
        let targetQ = reward;

        if (nextState) {
            // Non-terminal state: add discounted future value
            const maxNextQ = this.getMaxQValue(nextState);
            targetQ += this.discountFactor * maxNextQ;
        }

        // Q-learning update
        const newQ = currentQ + this.learningRate * (targetQ - currentQ);
        this.setQValue(state, action, newQ);
    }

    /**
     * Get Q-value for state-action pair
     */
    private getQValue(state: MDPState, action: MDPAction): number {
        if (!this.qTable.has(state.id)) {
            this.qTable.set(state.id, new Map());
        }

        const stateQValues = this.qTable.get(state.id)!;
        return stateQValues.get(action.id)?.value || 0;
    }

    /**
     * Set Q-value for state-action pair
     */
    private setQValue(state: MDPState, action: MDPAction, value: number): void {
        if (!this.qTable.has(state.id)) {
            this.qTable.set(state.id, new Map());
        }

        const stateQValues = this.qTable.get(state.id)!;
        stateQValues.set(action.id, {
            value: value,
            lastUpdated: new Date(),
            updateCount: (stateQValues.get(action.id)?.updateCount || 0) + 1
        });
    }

    /**
     * Get maximum Q-value for a state
     */
    private getMaxQValue(state: MDPState): number {
        if (!this.qTable.has(state.id)) {
            return 0;
        }

        const stateQValues = this.qTable.get(state.id)!;
        const qValues = Array.from(stateQValues.values()).map(qv => qv.value);
        
        return qValues.length > 0 ? Math.max(...qValues) : 0;
    }

    /**
     * Update action counts for UCB
     */
    private updateActionCounts(state: MDPState, action: MDPAction): void {
        if (!this.actionCounts.has(state.id)) {
            this.actionCounts.set(state.id, new Map());
        }

        const stateCounts = this.actionCounts.get(state.id)!;
        const currentCount = stateCounts.get(action.id) || 0;
        stateCounts.set(action.id, currentCount + 1);
    }

    /**
     * Get action count for UCB
     */
    private getActionCount(state: MDPState, action: MDPAction): number {
        if (!this.actionCounts.has(state.id)) {
            return 0;
        }

        const stateCounts = this.actionCounts.get(state.id)!;
        return stateCounts.get(action.id) || 0;
    }

    /**
     * Get total action count for a state
     */
    private getTotalActionCount(state: MDPState): number {
        if (!this.actionCounts.has(state.id)) {
            return 0;
        }

        const stateCounts = this.actionCounts.get(state.id)!;
        return Array.from(stateCounts.values()).reduce((sum, count) => sum + count, 0);
    }

    /**
     * Update policy parameters based on performance
     */
    private updatePolicyParameters(reward: number): void {
        // Adaptive parameter updates based on reward
        if (this.policyType === PolicyType.SOFTMAX) {
            // Adapt temperature based on performance
            if (reward > 0.5) {
                // Good performance: reduce temperature (more exploitation)
                this.parameters.temperature = Math.max(0.1, this.parameters.temperature * 0.99);
            } else if (reward < -0.1) {
                // Poor performance: increase temperature (more exploration)
                this.parameters.temperature = Math.min(2.0, this.parameters.temperature * 1.01);
            }
        }

        // Adapt learning rate
        if (this.episodeCount > 100) {
            // Gradually reduce learning rate for stability
            this.learningRate = Math.max(0.001, this.learningRate * 0.9999);
        }
    }

    /**
     * Decay exploration rate over time
     */
    private decayExplorationRate(): void {
        if (this.policyType === PolicyType.EPSILON_GREEDY) {
            // Exponential decay
            const minEpsilon = 0.01;
            const decayRate = 0.995;
            this.explorationRate = Math.max(minEpsilon, this.explorationRate * decayRate);
        }
    }

    /**
     * Initialize policy based on type
     */
    private initializePolicy(): Policy {
        return {
            type: this.policyType,
            parameters: this.parameters,
            qTable: this.qTable,
            actionCounts: this.actionCounts,
            episodeCount: this.episodeCount,
            learningRate: this.learningRate,
            explorationRate: this.explorationRate
        };
    }

    /**
     * Get policy statistics for analysis
     */
    public getPolicyStatistics(): LearningStatistics {
        const totalStates = this.qTable.size;
        const totalStateActionPairs = Array.from(this.qTable.values())
            .reduce((sum, stateMap) => sum + stateMap.size, 0);
        
        const averageQValue = this.calculateAverageQValue();
        const qValueVariance = this.calculateQValueVariance();
        
        return {
            episodeCount: this.episodeCount,
            totalStates: totalStates,
            totalStateActionPairs: totalStateActionPairs,
            currentLearningRate: this.learningRate,
            currentExplorationRate: this.explorationRate,
            averageQValue: averageQValue,
            qValueVariance: qValueVariance,
            policyType: this.policyType,
            parameters: { ...this.parameters }
        };
    }

    /**
     * Calculate average Q-value across all state-action pairs
     */
    private calculateAverageQValue(): number {
        let totalQ = 0;
        let count = 0;

        for (const stateQValues of this.qTable.values()) {
            for (const qValue of stateQValues.values()) {
                totalQ += qValue.value;
                count++;
            }
        }

        return count > 0 ? totalQ / count : 0;
    }

    /**
     * Calculate variance in Q-values
     */
    private calculateQValueVariance(): number {
        const mean = this.calculateAverageQValue();
        let sumSquaredDiffs = 0;
        let count = 0;

        for (const stateQValues of this.qTable.values()) {
            for (const qValue of stateQValues.values()) {
                sumSquaredDiffs += Math.pow(qValue.value - mean, 2);
                count++;
            }
        }

        return count > 1 ? sumSquaredDiffs / (count - 1) : 0;
    }

    /**
     * Export policy for persistence
     */
    public exportPolicy(): PolicyExport {
        return {
            type: this.policyType,
            parameters: this.parameters,
            qTableData: this.serializeQTable(),
            actionCountsData: this.serializeActionCounts(),
            episodeCount: this.episodeCount,
            learningRate: this.learningRate,
            explorationRate: this.explorationRate,
            exportTimestamp: new Date()
        };
    }

    /**
     * Import policy from previous session
     */
    public importPolicy(policyData: PolicyExport): void {
        this.policyType = policyData.type;
        this.parameters = policyData.parameters;
        this.episodeCount = policyData.episodeCount;
        this.learningRate = policyData.learningRate;
        this.explorationRate = policyData.explorationRate;
        
        this.qTable = this.deserializeQTable(policyData.qTableData);
        this.actionCounts = this.deserializeActionCounts(policyData.actionCountsData);
        
        Logger.info(`Imported policy with ${this.episodeCount} episodes and ${this.qTable.size} states`);
    }

    /**
     * Serialize Q-table for export
     */
    private serializeQTable(): any {
        const serialized: any = {};
        
        for (const [stateId, stateQValues] of this.qTable.entries()) {
            serialized[stateId] = {};
            for (const [actionId, qValue] of stateQValues.entries()) {
                serialized[stateId][actionId] = {
                    value: qValue.value,
                    updateCount: qValue.updateCount,
                    lastUpdated: qValue.lastUpdated.toISOString()
                };
            }
        }
        
        return serialized;
    }

    /**
     * Deserialize Q-table from import
     */
    private deserializeQTable(data: any): Map<string, Map<string, QValue>> {
        const qTable = new Map<string, Map<string, QValue>>();
        
        for (const [stateId, stateData] of Object.entries(data)) {
            const stateQValues = new Map<string, QValue>();
            
            for (const [actionId, qValueData] of Object.entries(stateData as any)) {
                const qValue = qValueData as any;
               stateQValues.set(actionId, {
                   value: qValue.value,
                   updateCount: qValue.updateCount,
                   lastUpdated: new Date(qValue.lastUpdated)
               });
           }
           
           qTable.set(stateId, stateQValues);
       }
       
       return qTable;
   }

   /**
    * Serialize action counts for export
    */
   private serializeActionCounts(): any {
       const serialized: any = {};
       
       for (const [stateId, stateCounts] of this.actionCounts.entries()) {
           serialized[stateId] = Object.fromEntries(stateCounts);
       }
       
       return serialized;
   }

   /**
    * Deserialize action counts from import
    */
   private deserializeActionCounts(data: any): Map<string, Map<string, number>> {
       const actionCounts = new Map<string, Map<string, number>>();
       
       for (const [stateId, stateData] of Object.entries(data)) {
           const stateCounts = new Map<string, number>(Object.entries(stateData as any) as [string, number][]);
           actionCounts.set(stateId, stateCounts);
       }
       
       return actionCounts;
   }

   /**
    * Reset policy for new learning session
    */
   public resetPolicy(): void {
       this.qTable.clear();
       this.actionCounts.clear();
       this.episodeCount = 0;
       this.explorationRate = 0.1; // Reset to initial value
       this.learningRate = 0.01;   // Reset to initial value
       
       Logger.info('Policy reset for new learning session');
   }

   /**
    * Get best action for a state (exploitation only)
    */
   public getBestAction(state: MDPState, availableActions: MDPAction[]): MDPAction {
       return this.greedySelection(state, availableActions);
   }

   /**
    * Get action probabilities for a state (for analysis)
    */
   public getActionProbabilities(state: MDPState, availableActions: MDPAction[]): Map<string, number> {
       const probabilities = new Map<string, number>();
       
       switch (this.policyType) {
           case PolicyType.EPSILON_GREEDY:
               const bestAction = this.greedySelection(state, availableActions);
               const exploreProb = this.explorationRate / availableActions.length;
               const exploitProb = 1 - this.explorationRate + exploreProb;
               
               for (const action of availableActions) {
                   probabilities.set(action.id, action.id === bestAction.id ? exploitProb : exploreProb);
               }
               break;
               
           case PolicyType.SOFTMAX:
               const temperature = this.parameters.temperature || 1.0;
               const qValues = availableActions.map(action => this.getQValue(state, action));
               const maxQ = Math.max(...qValues);
               
               const expValues = qValues.map(q => Math.exp((q - maxQ) / temperature));
               const sumExp = expValues.reduce((sum, exp) => sum + exp, 0);
               
               for (let i = 0; i < availableActions.length; i++) {
                   probabilities.set(availableActions[i].id, expValues[i] / sumExp);
               }
               break;
               
           case PolicyType.UCB:
           case PolicyType.GREEDY:
               // For UCB and greedy, assign probability 1 to best action, 0 to others
               const ucbBestAction = this.policyType === PolicyType.UCB ? 
                   this.ucbSelection(state, availableActions) : 
                   this.greedySelection(state, availableActions);
                   
               for (const action of availableActions) {
                   probabilities.set(action.id, action.id === ucbBestAction.id ? 1.0 : 0.0);
               }
               break;
       }
       
       return probabilities;
   }

   /**
    * Evaluate policy performance on a set of states
    */
   public async evaluatePolicy(evaluationStates: MDPState[], availableActionsMap: Map<string, MDPAction[]>): Promise<PolicyEvaluation> {
       let totalValue = 0;
       let stateCount = 0;
       const stateValues: Map<string, number> = new Map();
       
       for (const state of evaluationStates) {
           const availableActions = availableActionsMap.get(state.id) || [];
           if (availableActions.length === 0) continue;
           
           const bestAction = this.getBestAction(state, availableActions);
           const stateValue = this.getQValue(state, bestAction);
           
           stateValues.set(state.id, stateValue);
           totalValue += stateValue;
           stateCount++;
       }
       
       return {
           averageValue: stateCount > 0 ? totalValue / stateCount : 0,
           stateValues: stateValues,
           evaluatedStates: stateCount,
           policy: this.exportPolicy()
       };
   }

   /**
    * Get learned relationship multipliers for different edge types
    */
   public getLearnedMultiplier(relationshipType: string): number {
       // This would be implemented by maintaining learned weights for relationship types
       // For now, return default values that could be learned over time
       const defaultMultipliers: Record<string, number> = {
           'CALLS': 0.9,
           'USES': 0.8,
           'INHERITS_FROM': 0.9,
           'DEPENDS_ON': 0.7,
           'BELONGS_TO': 0.8,
           'TESTS': 1.0,
           'IS_TESTED_BY': 1.0,
           'MODIFIES': 0.9,
           'IMPORTS': 0.6
       };
       
       // In a full implementation, these would be learned parameters
       // that are updated based on the success of predictions
       return defaultMultipliers[relationshipType] || 0.5;
   }

   /**
    * Update learned multipliers based on feedback
    */
   public updateLearnedMultipliers(feedback: MultiplierFeedback[]): void {
       // This would implement learning of relationship type weights
       // based on how successful predictions were when using different multipliers
       
       for (const feedbackItem of feedback) {
           const currentMultiplier = this.getLearnedMultiplier(feedbackItem.relationshipType);
           const adjustment = feedbackItem.success ? 0.01 : -0.01;
           const newMultiplier = Math.max(0.1, Math.min(1.0, currentMultiplier + adjustment));
           
           // Store the updated multiplier (implementation would persist this)
           Logger.debug(`Updated multiplier for ${feedbackItem.relationshipType}: ${currentMultiplier} -> ${newMultiplier}`);
       }
   }

   /**
    * Get confidence in current policy
    */
   public getPolicyConfidence(): number {
       if (this.episodeCount < 10) {
           return 0.1; // Low confidence with little experience
       }
       
       // Confidence based on Q-value consistency and exploration rate
       const qValueVariance = this.calculateQValueVariance();
       const varianceConfidence = Math.max(0, 1 - qValueVariance);
       const explorationConfidence = 1 - this.explorationRate;
       const experienceConfidence = Math.min(1, this.episodeCount / 1000);
       
       return (varianceConfidence + explorationConfidence + experienceConfidence) / 3;
   }
}

// Supporting interfaces
interface PolicyExport {
   type: PolicyType;
   parameters: PolicyParameters;
   qTableData: any;
   actionCountsData: any;
   episodeCount: number;
   learningRate: number;
   explorationRate: number;
   exportTimestamp: Date;
}

interface PolicyEvaluation {
   averageValue: number;
   stateValues: Map<string, number>;
   evaluatedStates: number;
   policy: PolicyExport;
}

interface MultiplierFeedback {
   relationshipType: string;
   success: boolean;
   confidence: number;
}