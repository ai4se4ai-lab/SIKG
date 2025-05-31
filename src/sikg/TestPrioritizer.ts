// ENHANCED TestPrioritizer.ts - Integrated with Reinforcement Learning

import { SIKGManager } from './SIKGManager';
import { ConfigManager } from '../utils/ConfigManager';
import { SemanticChangeInfo, TestImpact, Node, Edge } from './GraphTypes';
import { Logger } from '../utils/Logger';

// RL Integration imports
import { ActionSpace } from '../ml/reinforcement/ActionSpace';
import { 
    MDPState, 
    MDPAction, 
    ActionType,
    ThresholdSettings,
    WeightAdjustments,
    PrioritizationStrategy 
} from '../ml/types/ReinforcementTypes';

export class TestPrioritizer {
    private sikgManager: SIKGManager;
    private configManager: ConfigManager;
    private actionSpace: ActionSpace;
    private rlEnabled: boolean = false;

    constructor(sikgManager: SIKGManager, configManager: ConfigManager) {
        this.sikgManager = sikgManager;
        this.configManager = configManager;
        this.actionSpace = new ActionSpace();
        this.rlEnabled = configManager.isRLEnabled();
        
        Logger.info(`TestPrioritizer initialized with RL ${this.rlEnabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * ENHANCED: Calculate test impact scores with RL-driven prioritization
     */
    public async calculateTestImpact(
        semanticChanges: SemanticChangeInfo[]
    ): Promise<Record<string, TestImpact>> {
        Logger.info('Calculating test impact scores...');

        if (this.rlEnabled) {
            return await this.calculateTestImpactWithRL(semanticChanges);
        } else {
            return await this.calculateTestImpactTraditional(semanticChanges);
        }
    }

    /**
     * RL-enhanced test impact calculation
     */
    private async calculateTestImpactWithRL(
        semanticChanges: SemanticChangeInfo[]
    ): Promise<Record<string, TestImpact>> {
        try {
            // Start RL episode
            const context = this.buildRLContext(semanticChanges);
            const state = await this.sikgManager.startRLEpisode(context);
            
            if (!state) {
                Logger.warn('RL state creation failed, falling back to traditional approach');
                return await this.calculateTestImpactTraditional(semanticChanges);
            }

            // Get available actions from action space
            const availableActions = this.actionSpace.getValidActions(state);
            
            if (availableActions.length === 0) {
                Logger.warn('No valid RL actions available, using default configuration');
                return await this.calculateTestImpactTraditional(semanticChanges);
            }

            // Select action using RL policy
            const selectedAction = await this.sikgManager.selectRLAction(state, availableActions);
            
            if (!selectedAction) {
                Logger.warn('RL action selection failed, falling back to traditional approach');
                return await this.calculateTestImpactTraditional(semanticChanges);
            }

            Logger.info(`Selected RL action: ${selectedAction.type} (${selectedAction.id})`);

            // Calculate test impacts using selected action parameters
            const testImpacts = await this.calculateWithActionParameters(
                semanticChanges,
                selectedAction
            );

            return testImpacts;

        } catch (error) {
            Logger.error('Error in RL-enhanced test impact calculation:', error);
            return await this.calculateTestImpactTraditional(semanticChanges);
        }
    }

    /**
     * Build RL context from current state
     */
    private buildRLContext(semanticChanges: SemanticChangeInfo[]): any {
        const testNodes = this.sikgManager.getTestNodes();
        const codeNodes = this.sikgManager.getCodeNodes();

        return {
            semanticChanges: semanticChanges,
            changedFiles: semanticChanges.map(c => c.changeDetails.filePath).filter(Boolean),
            projectMetrics: {
                linesOfCode: codeNodes.length * 50, // Rough estimate
                testCount: testNodes.length,
                recentChurn: this.calculateRecentChurn(semanticChanges),
                complexity: this.calculateProjectComplexity(semanticChanges)
            },
            testSuiteMetrics: {
                totalTests: testNodes.length,
                coverage: 0.8, // Default estimate
                averageExecutionTime: 100, // Default estimate
                testTypes: this.categorizeTestTypes(testNodes)
            },
            graphMetrics: {
                density: this.calculateGraphDensity(),
                averageCentrality: 0.5, // Default estimate
                testToCodeRatio: testNodes.length / Math.max(1, codeNodes.length)
            },
            historicalMetrics: {
                accuracy: 0.7, // Default - would be learned over time
                recentTrend: 0,
                failureRate: 0.1
            }
        };
    }

    /**
     * Calculate test impacts using RL action parameters
     */
    private async calculateWithActionParameters(
        semanticChanges: SemanticChangeInfo[],
        action: MDPAction
    ): Promise<Record<string, TestImpact>> {
        const testImpactScores: Record<string, TestImpact> = {};
        
        // Use action-specific parameters
        const maxDepth = action.prioritizationStrategy.maxDepth;
        const minImpactThreshold = action.thresholds.minImpactThreshold;
        
        const allVisitedNodes = new Set<string>();
        
        for (const change of semanticChanges) {
            const visitedNodesForThisChange = new Set<string>();
            
            const queue: PropagationQueueItem[] = [{
                nodeId: change.nodeId,
                currentScore: change.initialImpactScore,
                depth: 0,
                path: [change.nodeId]
            }];
            
            visitedNodesForThisChange.add(change.nodeId);
            allVisitedNodes.add(change.nodeId);
            
            while (queue.length > 0) {
                const { nodeId, currentScore, depth, path } = queue.shift()!;
                
                const node = this.sikgManager.getNode(nodeId);
                if (!node) {
                    continue;
                }
                
                if (node.type === 'TestCase') {
                    if (!testImpactScores[nodeId]) {
                        testImpactScores[nodeId] = {
                            testId: nodeId,
                            impactScore: 0,
                            testName: node.name,
                            testPath: node.filePath,
                            contributingChanges: []
                        };
                    }
                    
                    testImpactScores[nodeId].impactScore += currentScore;
                    
                    const contribution = currentScore / (depth + 1);
                    
                    if (contribution > 0.01) {
                        const existingContribution = testImpactScores[nodeId].contributingChanges.find(
                            c => c.nodeId === change.nodeId
                        );
                        
                        if (existingContribution) {
                            if (contribution > existingContribution.contribution) {
                                existingContribution.contribution = contribution;
                            }
                        } else {
                            testImpactScores[nodeId].contributingChanges.push({
                                nodeId: change.nodeId,
                                semanticType: change.semanticType,
                                contribution
                            });
                        }
                    }
                }
                
                if (depth < maxDepth) {
                    const outgoingEdges = this.sikgManager.getOutgoingEdges(nodeId);
                    
                    for (const edge of outgoingEdges) {
                        if (visitedNodesForThisChange.has(edge.target)) {
                            continue;
                        }
                        
                        // Use RL-learned relationship weights
                        const attenuation = this.calculateRLAttenuation(
                            edge.type, 
                            depth, 
                            action.weightAdjustments
                        );
                        
                        const propagatedScore = currentScore * edge.weight * attenuation;
                        
                        if (propagatedScore > minImpactThreshold) {
                            queue.push({
                                nodeId: edge.target,
                                currentScore: propagatedScore,
                                depth: depth + 1,
                                path: [...path, edge.target]
                            });
                            
                            visitedNodesForThisChange.add(edge.target);
                            allVisitedNodes.add(edge.target);
                        }
                    }
                }
            }
        }
        
        this.normalizeTestImpactScores(testImpactScores);
        
        Logger.info(`Calculated impact scores for ${Object.keys(testImpactScores).length} tests using RL action ${action.type}`);
        
        return testImpactScores;
    }

    /**
     * Calculate attenuation using RL-learned weights
     */
    private calculateRLAttenuation(
        relationshipType: string, 
        depth: number, 
        weightAdjustments: WeightAdjustments
    ): number {
        const baseAttenuation = 1 / (depth + 1);
        
        // Use RL-learned relationship weights
        const relationshipMultiplier = weightAdjustments.relationshipWeights[
            relationshipType as keyof typeof weightAdjustments.relationshipWeights
        ] || 0.5;
        
        // Apply depth-specific attenuation factors
        const depthKey = `depth${Math.min(depth + 1, 5)}` as keyof typeof weightAdjustments.attenuationFactors;
        const depthFactor = weightAdjustments.attenuationFactors[depthKey];
        
        return baseAttenuation * relationshipMultiplier * depthFactor;
    }

    /**
     * Traditional (non-RL) test impact calculation
     */
    private async calculateTestImpactTraditional(
        semanticChanges: SemanticChangeInfo[]
    ): Promise<Record<string, TestImpact>> {
        const testImpactScores: Record<string, TestImpact> = {};
        
        const maxDepth = this.configManager.getMaxTraversalDepth();
        const minImpactThreshold = this.configManager.getMinImpactThreshold();
        
        const allVisitedNodes = new Set<string>();
        
        for (const change of semanticChanges) {
            const visitedNodesForThisChange = new Set<string>();
            
            const queue: PropagationQueueItem[] = [{
                nodeId: change.nodeId,
                currentScore: change.initialImpactScore,
                depth: 0,
                path: [change.nodeId]
            }];
            
            visitedNodesForThisChange.add(change.nodeId);
            allVisitedNodes.add(change.nodeId);
            
            while (queue.length > 0) {
                const { nodeId, currentScore, depth, path } = queue.shift()!;
                
                const node = this.sikgManager.getNode(nodeId);
                if (!node) {
                    continue;
                }
                
                if (node.type === 'TestCase') {
                    if (!testImpactScores[nodeId]) {
                        testImpactScores[nodeId] = {
                            testId: nodeId,
                            impactScore: 0,
                            testName: node.name,
                            testPath: node.filePath,
                            contributingChanges: []
                        };
                    }
                    
                    testImpactScores[nodeId].impactScore += currentScore;
                    
                    const contribution = currentScore / (depth + 1);
                    
                    if (contribution > 0.01) {
                        const existingContribution = testImpactScores[nodeId].contributingChanges.find(
                            c => c.nodeId === change.nodeId
                        );
                        
                        if (existingContribution) {
                            if (contribution > existingContribution.contribution) {
                                existingContribution.contribution = contribution;
                            }
                        } else {
                            testImpactScores[nodeId].contributingChanges.push({
                                nodeId: change.nodeId,
                                semanticType: change.semanticType,
                                contribution
                            });
                        }
                    }
                }
                
                if (depth < maxDepth) {
                    const outgoingEdges = this.sikgManager.getOutgoingEdges(nodeId);
                    
                    for (const edge of outgoingEdges) {
                        if (visitedNodesForThisChange.has(edge.target)) {
                            continue;
                        }
                        
                        const attenuation = this.calculateAttenuation(edge.type, depth);
                        const propagatedScore = currentScore * edge.weight * attenuation;
                        
                        if (propagatedScore > minImpactThreshold) {
                            queue.push({
                                nodeId: edge.target,
                                currentScore: propagatedScore,
                                depth: depth + 1,
                                path: [...path, edge.target]
                            });
                            
                            visitedNodesForThisChange.add(edge.target);
                            allVisitedNodes.add(edge.target);
                        }
                    }
                }
            }
        }
        
        this.normalizeTestImpactScores(testImpactScores);
        
        Logger.info(`Calculated impact scores for ${Object.keys(testImpactScores).length} tests using traditional approach`);
        
        return testImpactScores;
    }

    /**
     * Get prioritized tests with RL-enhanced ordering
     */
    public getPrioritizedTests(testImpacts: Record<string, TestImpact>, limit?: number): TestImpact[] {
        const testImpactArray = Object.values(testImpacts);
        
        if (this.rlEnabled) {
            // Use RL-enhanced sorting that considers learning objectives
            testImpactArray.sort((a, b) => {
                const scoreDiff = b.impactScore - a.impactScore;
                
                // Add small exploration bonus for tests with lower confidence
                const explorationBonus = this.calculateExplorationBonus(a, b);
                
                return scoreDiff + explorationBonus;
            });
        } else {
            // Traditional sorting by impact score
            testImpactArray.sort((a, b) => b.impactScore - a.impactScore);
        }
        
        if (limit && limit > 0 && limit < testImpactArray.length) {
            return testImpactArray.slice(0, limit);
        }
        
        return testImpactArray;
    }

    /**
     * Calculate exploration bonus for RL-enhanced prioritization
     */
    private calculateExplorationBonus(testA: TestImpact, testB: TestImpact): number {
        // Simple exploration bonus based on test diversity
        const diversityA = testA.contributingChanges.length;
        const diversityB = testB.contributingChanges.length;
        
        // Small bonus for tests with more diverse change contributions
        return (diversityA - diversityB) * 0.001;
    }

    /**
     * Categorize tests by impact level with RL-adapted thresholds
     */
    public categorizeTestsByImpact(testImpacts: Record<string, TestImpact>): {
        high: TestImpact[];
        medium: TestImpact[];
        low: TestImpact[];
    } {
        let highThreshold: number;
        let lowThreshold: number;

        if (this.rlEnabled) {
            // Use dynamically learned thresholds
            const avgImpact = this.calculateAverageImpact(testImpacts);
            highThreshold = Math.max(0.6, avgImpact * 1.2);
            lowThreshold = Math.max(0.2, avgImpact * 0.6);
        } else {
            // Use configured thresholds
            highThreshold = this.configManager.getHighImpactThreshold();
            lowThreshold = this.configManager.getLowImpactThreshold();
        }
        
        const high: TestImpact[] = [];
        const medium: TestImpact[] = [];
        const low: TestImpact[] = [];
        
        for (const testId in testImpacts) {
            const impact = testImpacts[testId];
            if (impact.impactScore >= highThreshold) {
                high.push(impact);
            } else if (impact.impactScore >= lowThreshold) {
                medium.push(impact);
            } else {
                low.push(impact);
            }
        }
        
        high.sort((a, b) => b.impactScore - a.impactScore);
        medium.sort((a, b) => b.impactScore - a.impactScore);
        low.sort((a, b) => b.impactScore - a.impactScore);
        
        return { high, medium, low };
    }

    /**
     * Calculate average impact score
     */
    private calculateAverageImpact(testImpacts: Record<string, TestImpact>): number {
        const impacts = Object.values(testImpacts);
        if (impacts.length === 0) return 0;
        
        const totalImpact = impacts.reduce((sum, impact) => sum + impact.impactScore, 0);
        return totalImpact / impacts.length;
    }

    /**
     * Normalize test impact scores so they fall between 0 and 1
     */
    private normalizeTestImpactScores(testImpactScores: Record<string, TestImpact>): void {
        let maxScore = 0;
        for (const testId in testImpactScores) {
            maxScore = Math.max(maxScore, testImpactScores[testId].impactScore);
        }
        
        if (maxScore === 0 || maxScore === 1) {
            return;
        }
        
        for (const testId in testImpactScores) {
            testImpactScores[testId].impactScore = testImpactScores[testId].impactScore / maxScore;
            testImpactScores[testId].impactScore = Math.round(testImpactScores[testId].impactScore * 10000) / 10000;
        }
    }

    /**
     * Calculate attenuation factor based on the relationship type and depth
     */
    private calculateAttenuation(relationshipType: string, depth: number): number {
        const baseAttenuation = 1 / (depth + 1);
        const relationshipMultiplier = this.getRelationshipMultiplier(relationshipType);
        return baseAttenuation * relationshipMultiplier;
    }

    /**
     * Get a multiplier for the relationship type
     */
    private getRelationshipMultiplier(relationshipType: string): number {
        switch (relationshipType) {
            case 'CALLS':
                return 0.9;
            case 'USES':
                return 0.8;
            case 'INHERITS_FROM':
                return 0.9;
            case 'DEPENDS_ON':
                return 0.7;
            case 'BELONGS_TO':
                return 0.8;
            case 'TESTS':
                return 1.0;
            case 'IS_TESTED_BY':
                return 1.0;
            case 'MODIFIES':
                return 0.9;
            case 'IMPORTS':
                return 0.6;
            default:
                return 0.5;
        }
    }

    // Helper methods for RL context building
    private calculateRecentChurn(semanticChanges: SemanticChangeInfo[]): number {
        const totalChanges = semanticChanges.reduce((sum, change) => 
            sum + (change.changeDetails.linesChanged || 0), 0
        );
        return Math.min(1.0, totalChanges / 1000); // Normalize to [0, 1]
    }

    private calculateProjectComplexity(semanticChanges: SemanticChangeInfo[]): number {
        const complexityMap = {
            'BUG_FIX': 0.8,
            'FEATURE_ADDITION': 0.9,
            'REFACTORING_SIGNATURE': 1.0,
            'REFACTORING_LOGIC': 0.6,
            'DEPENDENCY_UPDATE': 0.7,
            'PERFORMANCE_OPT': 0.5,
            'UNKNOWN': 0.5
        };

        if (semanticChanges.length === 0) return 0.5;

        const avgComplexity = semanticChanges.reduce((sum, change) => 
            sum + (complexityMap[change.semanticType] || 0.5), 0
        ) / semanticChanges.length;

        return avgComplexity;
    }

    private categorizeTestTypes(testNodes: Node[]): { unit: number; integration: number; e2e: number } {
        const categories = { unit: 0, integration: 0, e2e: 0 };
        
        for (const node of testNodes) {
            const testType = node.properties.testType || 'unit';
            if (testType in categories) {
                categories[testType as keyof typeof categories]++;
            } else {
                categories.unit++; // Default to unit
            }
        }
        
        return categories;
    }

    private calculateGraphDensity(): number {
        const nodes = this.sikgManager.getCodeNodes().length + this.sikgManager.getTestNodes().length;
        const edges = this.sikgManager.getOutgoingEdges('dummy').length; // This is a simplification
        
        if (nodes <= 1) return 0;
        const maxPossibleEdges = nodes * (nodes - 1);
        return Math.min(1.0, (edges * 2) / maxPossibleEdges); // *2 for undirected graph approximation
    }

    /**
     * Enable/disable RL for this prioritizer
     */
    public setRLEnabled(enabled: boolean): void {
        this.rlEnabled = enabled;
        Logger.info(`TestPrioritizer RL ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Get RL action space for external analysis
     */
    public getActionSpace(): ActionSpace {
        return this.actionSpace;
    }
}

interface PropagationQueueItem {
    nodeId: string;
    currentScore: number;
    depth: number;
    path: string[];
}