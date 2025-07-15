// Test Prioritizer - Calculates impact scores and prioritizes tests

import { SIKGManager } from './SIKGManager';
import { ConfigManager } from '../utils/ConfigManager';
import { SemanticChangeInfo, TestImpact, Node, Edge } from './GraphTypes';
import { Logger } from '../utils/Logger';

export class TestPrioritizer {
    private sikgManager: SIKGManager;
    private configManager: ConfigManager;

    constructor(sikgManager: SIKGManager, configManager: ConfigManager) {
        this.sikgManager = sikgManager;
        this.configManager = configManager;
    }

    /**
     * Calculate test impact scores based on semantic changes
     * This implements Algorithm 3 from the SIKG paper: Impact Propagation and Scoring
     */
    private async calculateTestImpactOriginal(
        semanticChanges: SemanticChangeInfo[]
    ): Promise<Record<string, TestImpact>> {
        // This contains the existing calculateTestImpact logic
        // Just rename the existing method to this
        
        Logger.info('Calculating test impact scores...');
        
        // Map to store impact scores for tests
        const testImpactScores: Record<string, TestImpact> = {};
        
        // Get max traversal depth from config
        const maxDepth = this.configManager.getMaxTraversalDepth();
        const minImpactThreshold = this.configManager.getMinImpactThreshold();
        
        // Track all tests that have been impacted and nodes visited during propagation
        const allVisitedNodes = new Set<string>();
        
        // Process each semantic change
        for (const change of semanticChanges) {
            // Track visited nodes for this propagation to avoid cycles
            const visitedNodesForThisChange = new Set<string>();
            
            // Start propagation from the changed node
            const queue: PropagationQueueItem[] = [{
                nodeId: change.nodeId,
                currentScore: change.initialImpactScore,
                depth: 0,
                path: [change.nodeId]
            }];
            
            visitedNodesForThisChange.add(change.nodeId);
            allVisitedNodes.add(change.nodeId);
            
            // Process the queue (Breadth-First Traversal)
            while (queue.length > 0) {
                const { nodeId, currentScore, depth, path } = queue.shift()!;
                
                // Get the node from the graph
                const node = this.sikgManager.getNode(nodeId);
                if (!node) {
                    continue; // Skip if node not found
                }
                
                // If this is a test case node, update its impact score
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
                    
                    // Accumulate the impact score
                    testImpactScores[nodeId].impactScore += currentScore;
                    
                    // Track which changes contributed to this test's score
                    const contribution = currentScore / (depth + 1);
                    
                    // Only add if the contribution is significant
                    if (contribution > 0.01) {
                        const existingContribution = testImpactScores[nodeId].contributingChanges.find(
                            c => c.nodeId === change.nodeId
                        );
                        
                        if (existingContribution) {
                            // Update if this path has a higher contribution
                            if (contribution > existingContribution.contribution) {
                                existingContribution.contribution = contribution;
                            }
                        } else {
                            // Add new contributing change
                            testImpactScores[nodeId].contributingChanges.push({
                                nodeId: change.nodeId,
                                semanticType: change.semanticType,
                                contribution
                            });
                        }
                    }
                }
                
                // If we haven't reached max depth, continue propagation
                if (depth < maxDepth) {
                    // Get outgoing edges (neighbors)
                    const outgoingEdges = this.sikgManager.getOutgoingEdges(nodeId);
                    
                    for (const edge of outgoingEdges) {
                        // Skip if already visited in this propagation path
                        if (visitedNodesForThisChange.has(edge.target)) {
                            continue;
                        }
                        
                        // Calculate attenuation factor based on the relationship type and depth
                        const attenuation = this.calculateAttenuation(edge.type, depth);
                        
                        // Apply historical boost if available (from reinforcement learning)
                        const historicalBoost = this.getHistoricalBoost(change.nodeId, change.semanticType, edge.target);
                        
                        // Calculate the propagated score
                        const propagatedScore = currentScore * edge.weight * attenuation + historicalBoost;
                        
                        // Only propagate if the score is still significant
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
        
        // Normalize scores and sort the results
        this.normalizeTestImpactScores(testImpactScores);
        
        Logger.info(`Calculated impact scores for ${Object.keys(testImpactScores).length} tests out of ${this.sikgManager.getTestNodes().length} total tests`);
        Logger.info(`Visited ${allVisitedNodes.size} nodes during impact propagation`);
        
        return testImpactScores;
    }

    public async calculateTestImpact(
        semanticChanges: SemanticChangeInfo[]
    ): Promise<Record<string, TestImpact>> {
        Logger.info('Calculating test impact scores with RL enhancement...');
        
        // Run original impact calculation
        const originalImpacts = await this.calculateTestImpactOriginal(semanticChanges);
        
        try {
            // Apply RL enhancements through SIKGManager
            const enhancedImpacts = await this.sikgManager.startRLTestSession(
                semanticChanges,
                originalImpacts
            );
            
            Logger.info(`RL enhanced ${Object.keys(enhancedImpacts).length} test impacts`);
            return enhancedImpacts;
            
        } catch (error) {
            Logger.error('Error in RL enhancement, using original impacts:', error);
            return originalImpacts;
        }
    }

    /**
     * Normalize test impact scores so they fall between 0 and 1
     */
    private normalizeTestImpactScores(testImpactScores: Record<string, TestImpact>): void {
        // Find the maximum score
        let maxScore = 0;
        for (const testId in testImpactScores) {
            maxScore = Math.max(maxScore, testImpactScores[testId].impactScore);
        }
        
        // If no scores, nothing to normalize
        if (maxScore === 0 || maxScore === 1) {
            return;
        }
        
        // Normalize all scores
        for (const testId in testImpactScores) {
            testImpactScores[testId].impactScore = testImpactScores[testId].impactScore / maxScore;
            
            // Round to 4 decimal places for cleaner display
            testImpactScores[testId].impactScore = Math.round(testImpactScores[testId].impactScore * 10000) / 10000;
        }
    }

    /**
     * Calculate attenuation factor based on the relationship type and depth
     */
    private calculateAttenuation(relationshipType: string, depth: number): number {
        // Base attenuation decreases with depth
        const baseAttenuation = 1 / (depth + 1);
        
        // Different relationship types have different attenuation rates
        const relationshipMultiplier = this.getRelationshipMultiplier(relationshipType);
        
        return baseAttenuation * relationshipMultiplier;
    }

    /**
     * Get a multiplier for the relationship type
     */
    private getRelationshipMultiplier(relationshipType: string): number {
        // Different relationship types have different impact weights
        switch (relationshipType) {
            case 'CALLS':
                return 0.9; // Strong connection
            case 'USES':
                return 0.8; // Strong connection
            case 'INHERITS_FROM':
                return 0.9; // Strong connection
            case 'DEPENDS_ON':
                return 0.7; // Moderate connection
            case 'BELONGS_TO':
                return 0.8; // Strong connection
            case 'TESTS':
                return 1.0; // Direct relationship
            case 'IS_TESTED_BY':
                return 1.0; // Direct relationship
            case 'MODIFIES':
                return 0.9; // Strong connection
            case 'IMPORTS':
                return 0.6; // Moderate connection
            default:
                return 0.5; // Default moderate connection
        }
    }

    /**
     * Get historical boost based on past test results
     * This implements part of Algorithm 4: Test Prioritization and SIKG Refinement
     */
    private getHistoricalBoost(
        changedNodeId: string, 
        semanticType: SemanticChangeInfo['semanticType'], 
        targetNodeId: string
    ): number {
        // This would be implemented with historical data from test executions
        // For now, return a small default value
        return 0.01;
    }

    /**
     * Get a list of prioritized tests based on impact calculation
     * This implements part of Algorithm 4: Test Prioritization and SIKG Refinement
     */
    public getPrioritizedTests(testImpacts: Record<string, TestImpact>, limit?: number): TestImpact[] {
        // Convert to array
        const testImpactArray = Object.values(testImpacts);
        
        // Sort by impact score (descending)
        testImpactArray.sort((a, b) => b.impactScore - a.impactScore);
        
        // Apply limit if specified
        if (limit && limit > 0 && limit < testImpactArray.length) {
            return testImpactArray.slice(0, limit);
        }
        
        return testImpactArray;
    }

    /**
     * Identify tests that should be run based on impact thresholds
     */
    public categorizeTestsByImpact(testImpacts: Record<string, TestImpact>): {
        high: TestImpact[];
        medium: TestImpact[];
        low: TestImpact[];
    } {
        const highThreshold = this.configManager.getHighImpactThreshold();
        const lowThreshold = this.configManager.getLowImpactThreshold();
        
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
        
        // Sort each category by impact score
        high.sort((a, b) => b.impactScore - a.impactScore);
        medium.sort((a, b) => b.impactScore - a.impactScore);
        low.sort((a, b) => b.impactScore - a.impactScore);
        
        return { high, medium, low };
    }
}

interface PropagationQueueItem {
    nodeId: string;
    currentScore: number;
    depth: number;
    path: string[];
}
