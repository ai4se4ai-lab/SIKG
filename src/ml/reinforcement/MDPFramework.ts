/**
 * MDPFramework.ts - Core Markov Decision Process implementation for SIKG
 * 
 * Implements the MDP framework ⟨S, A, P, R, γ⟩ as claimed in the evaluation:
 * - S: State space (project context, change characteristics, historical performance)
 * - A: Action space (test selection strategies, threshold settings)
 * - P: Transition probabilities (learned from historical data)
 * - R: Reward function (based on prediction accuracy)
 * - γ: Discount factor for future rewards
 */

import { Logger } from '../../utils/Logger';
import { ConfigManager } from '../../utils/ConfigManager';
import { StateRepresentation } from './StateRepresentation';
import { ActionSpace } from './ActionSpace';
import { RewardFunction } from './RewardFunction';
import { 
    MDPState, 
    MDPAction, 
    TransitionProbabilities, 
    RewardSignal,
    MDPConfig,
    LearningEpisode 
} from '../types/ReinforcementTypes';

export class MDPFramework {
    private config: MDPConfig;
    private stateSpace: StateRepresentation;
    private actionSpace: ActionSpace;
    private rewardFunction: RewardFunction;
    private transitionProbabilities: Map<string, TransitionProbabilities>;
    private currentState: MDPState | null = null;
    private episodeHistory: LearningEpisode[] = [];
    private discountFactor: number;

    constructor(configManager: ConfigManager) {
        this.config = configManager.getRLParameters();
        this.discountFactor = this.config.discountFactor;
        
        this.stateSpace = new StateRepresentation();
        this.actionSpace = new ActionSpace();
        this.rewardFunction = new RewardFunction();
        this.transitionProbabilities = new Map();
        
        Logger.info('MDP Framework initialized with discount factor: ' + this.discountFactor);
    }

    /**
     * Initialize a new episode in the MDP
     * @param initialContext Initial context for state construction
     * @returns Initial state
     */
    public initializeEpisode(initialContext: any): MDPState {
        this.currentState = this.stateSpace.constructState(initialContext);
        
        Logger.debug(`New MDP episode initialized with state: ${this.currentState.id}`);
        return this.currentState;
    }

    /**
     * Execute an action in the current state and transition to next state
     * @param action Action to execute
     * @param environmentResponse Response from the environment (test results)
     * @returns Next state and reward
     */
    public executeAction(
        action: MDPAction, 
        environmentResponse: any
    ): { nextState: MDPState, reward: number, done: boolean } {
        if (!this.currentState) {
            throw new Error('No current state. Call initializeEpisode first.');
        }

        // Calculate reward based on action effectiveness
        const reward = this.rewardFunction.calculateReward(
            this.currentState,
            action,
            environmentResponse
        );

        // Determine next state based on environment response
        const nextState = this.stateSpace.constructState(environmentResponse);

        // Update transition probabilities
        this.updateTransitionProbabilities(this.currentState, action, nextState);

        // Record episode step
        const episodeStep: LearningEpisode = {
            episode: this.episodeHistory.length,
            state: this.currentState,
            action: action,
            reward: reward,
            nextState: nextState,
            timestamp: new Date(),
            accuracy: environmentResponse.accuracy || 0,
            done: environmentResponse.done || false
        };
        
        this.episodeHistory.push(episodeStep);

        // Update current state
        this.currentState = nextState;

        Logger.debug(`Action executed. Reward: ${reward.toFixed(3)}, Next state: ${nextState.id}`);

        return {
            nextState: nextState,
            reward: reward,
            done: episodeStep.done
        };
    }

    /**
     * Calculate the expected value of a state using Bellman equation
     * V(s) = Σ_a π(a|s) Σ_s' P(s'|s,a) [R(s,a,s') + γV(s')]
     */
    public calculateStateValue(state: MDPState, policy: Map<string, number>): number {
        let stateValue = 0;

        // Iterate over all possible actions
        for (const [actionId, actionProbability] of policy.entries()) {
            const action = this.actionSpace.getAction(actionId);
            if (!action) continue;

            // Get transition probabilities for this state-action pair
            const transitions = this.getTransitionProbabilities(state, action);
            
            let actionValue = 0;
            for (const [nextStateId, probability] of transitions.probabilities.entries()) {
                const expectedReward = transitions.expectedRewards.get(nextStateId) || 0;
                const nextStateValue = this.getStoredStateValue(nextStateId);
                
                actionValue += probability * (expectedReward + this.discountFactor * nextStateValue);
            }

            stateValue += actionProbability * actionValue;
        }

        return stateValue;
    }

    /**
     * Calculate Q-value for a state-action pair
     * Q(s,a) = Σ_s' P(s'|s,a) [R(s,a,s') + γV(s')]
     */
    public calculateQValue(state: MDPState, action: MDPAction): number {
        const transitions = this.getTransitionProbabilities(state, action);
        let qValue = 0;

        for (const [nextStateId, probability] of transitions.probabilities.entries()) {
            const expectedReward = transitions.expectedRewards.get(nextStateId) || 0;
            const nextStateValue = this.getStoredStateValue(nextStateId);
            
            qValue += probability * (expectedReward + this.discountFactor * nextStateValue);
        }

        return qValue;
    }

    /**
     * Get all possible actions for a given state
     */
    public getValidActions(state: MDPState): MDPAction[] {
        return this.actionSpace.getValidActions(state);
    }

    /**
     * Get transition probabilities for a state-action pair
     */
    public getTransitionProbabilities(state: MDPState, action: MDPAction): TransitionProbabilities {
        const key = this.generateTransitionKey(state, action);
        
        return this.transitionProbabilities.get(key) || {
            probabilities: new Map(),
            expectedRewards: new Map(),
            count: 0
        };
    }

    /**
     * Update transition probabilities based on observed transitions
     */
    private updateTransitionProbabilities(
        state: MDPState, 
        action: MDPAction, 
        nextState: MDPState
    ): void {
        const key = this.generateTransitionKey(state, action);
        
        if (!this.transitionProbabilities.has(key)) {
            this.transitionProbabilities.set(key, {
                probabilities: new Map(),
                expectedRewards: new Map(),
                count: 0
            });
        }

        const transitions = this.transitionProbabilities.get(key)!;
        
        // Update transition count
        transitions.count++;
        
        // Update probability for this next state
        const currentProb = transitions.probabilities.get(nextState.id) || 0;
        const currentCount = currentProb * (transitions.count - 1);
        const newProb = (currentCount + 1) / transitions.count;
        
        transitions.probabilities.set(nextState.id, newProb);

        // Normalize probabilities
        this.normalizeProbabilities(transitions);
    }

    /**
     * Generate a unique key for state-action pairs
     */
    private generateTransitionKey(state: MDPState, action: MDPAction): string {
        return `${state.id}_${action.id}`;
    }

    /**
     * Normalize probability distribution
     */
    private normalizeProbabilities(transitions: TransitionProbabilities): void {
        const total = Array.from(transitions.probabilities.values()).reduce((sum, prob) => sum + prob, 0);
        
        if (total > 0) {
            for (const [stateId, prob] of transitions.probabilities.entries()) {
                transitions.probabilities.set(stateId, prob / total);
            }
        }
    }

    /**
     * Get stored state value (simplified - in practice would use value function approximation)
     */
    private getStoredStateValue(stateId: string): number {
        // Simplified implementation - in practice would maintain value function
        return 0.5; // Default value
    }

    /**
     * Get episode history for analysis
     */
    public getEpisodeHistory(): LearningEpisode[] {
        return [...this.episodeHistory];
    }

    /**
     * Get current MDP statistics
     */
    public getStatistics(): MDPStatistics {
        return {
            totalEpisodes: this.episodeHistory.length,
            averageReward: this.calculateAverageReward(),
            stateSpaceSize: this.stateSpace.getStateSpaceSize(),
            actionSpaceSize: this.actionSpace.getActionSpaceSize(),
            transitionCount: this.transitionProbabilities.size,
            discountFactor: this.discountFactor
        };
    }

    /**
     * Calculate average reward across all episodes
     */
    private calculateAverageReward(): number {
        if (this.episodeHistory.length === 0) return 0;
        
        const totalReward = this.episodeHistory.reduce((sum, episode) => sum + episode.reward, 0);
        return totalReward / this.episodeHistory.length;
    }

    /**
     * Reset the MDP for a new learning session
     */
    public reset(): void {
        this.currentState = null;
        this.episodeHistory = [];
        this.transitionProbabilities.clear();
        
        Logger.info('MDP Framework reset');
    }

    /**
     * Export MDP data for analysis or persistence
     */
    public exportMDPData(): MDPExportData {
        return {
            config: this.config,
            episodeHistory: this.episodeHistory,
            transitionProbabilities: Object.fromEntries(this.transitionProbabilities),
            statistics: this.getStatistics()
        };
    }

    /**
     * Import MDP data from previous session
     */
    public importMDPData(data: MDPExportData): void {
        this.config = data.config;
        this.episodeHistory = data.episodeHistory;
        this.transitionProbabilities = new Map(Object.entries(data.transitionProbabilities));
        
        Logger.info(`Imported MDP data with ${this.episodeHistory.length} episodes`);
    }
}

// Supporting interfaces
interface MDPStatistics {
    totalEpisodes: number;
    averageReward: number;
    stateSpaceSize: number;
    actionSpaceSize: number;
    transitionCount: number;
    discountFactor: number;
}

interface MDPExportData {
    config: MDPConfig;
    episodeHistory: LearningEpisode[];
    transitionProbabilities: Record<string, TransitionProbabilities>;
    statistics: MDPStatistics;
}