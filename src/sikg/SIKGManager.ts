// ENHANCED SIKGManager.ts - Integrated with Reinforcement Learning

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../utils/Logger';
import { ConfigManager } from '../utils/ConfigManager';
import { CodeParser } from './CodeParser';
import { TestParser } from './TestParser';
import { Graph, Node, Edge, SemanticChangeInfo, TestResult } from './GraphTypes';

// RL Integration imports
import { MDPFramework } from '../ml/reinforcement/MDPFramework';
import { PolicyLearning } from '../ml/reinforcement/PolicyLearning';
import { WeightUpdateManager } from '../ml/reinforcement/WeightUpdateManager';
import { LearningMetrics } from '../ml/reinforcement/LearningMetrics';
import { 
    MDPState, 
    MDPAction, 
    FeedbackSignal,
    LearningEpisode,
    WeightUpdateStrategy 
} from '../ml/types/ReinforcementTypes';

/**
 * ENHANCED SIKGManager with Reinforcement Learning Integration
 */
export class SIKGManager {
    private graph: Graph;
    private context: vscode.ExtensionContext;
    private configManager: ConfigManager;
    private codeParser: CodeParser;
    private testParser: TestParser;
    private graphPath: string;
    private initialized: boolean = false;

    // RL Components
    private mdpFramework: MDPFramework;
    private policyLearning: PolicyLearning;
    private weightUpdateManager: WeightUpdateManager;
    private learningMetrics: LearningMetrics;
    private rlEnabled: boolean = false;
    private currentEpisode: LearningEpisode | null = null;

    constructor(context: vscode.ExtensionContext, configManager: ConfigManager) {
        this.context = context;
        this.configManager = configManager;
        this.graph = { nodes: new Map(), edges: new Map() };
        this.codeParser = new CodeParser();
        this.testParser = new TestParser();
        
        // Initialize RL components
        this.mdpFramework = new MDPFramework(configManager);
        this.policyLearning = new PolicyLearning(configManager);
        this.weightUpdateManager = new WeightUpdateManager(this.graph, WeightUpdateStrategy.ADAPTIVE);
        this.learningMetrics = new LearningMetrics(context);
        
        // Check if RL is enabled
        this.rlEnabled = configManager.isRLEnabled();
        
        // Set up storage path for the graph
        const storagePath = context.globalStorageUri.fsPath;
        if (!fs.existsSync(storagePath)) {
            fs.mkdirSync(storagePath, { recursive: true });
        }
        this.graphPath = path.join(storagePath, 'sikg-graph.json');

        Logger.info(`SIKG Manager initialized with RL ${this.rlEnabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Initialize the SIKG with RL capability
     */
    public async initialize(): Promise<void> {
        try {
            if (fs.existsSync(this.graphPath)) {
                await this.loadGraph();
                Logger.info('Loaded existing SIKG graph');
                
                const needsUpdate = await this.checkForGraphUpdate();
                if (needsUpdate) {
                    Logger.info('Updating SIKG graph with new files');
                    await this.updateGraph();
                }
            } else {
                await this.rebuildGraph();
                Logger.info('Built new SIKG graph');
            }

            // Initialize RL components if enabled
            if (this.rlEnabled) {
                await this.initializeRLComponents();
            }

            this.initialized = true;
        } catch (error) {
            Logger.error('Failed to initialize SIKG:', error);
            throw error;
        }
    }

    /**
     * Initialize RL components
     */
    private async initializeRLComponents(): Promise<void> {
        try {
            // Load previous learning data if available
            const savedPolicyData = this.context.globalState.get('sikg.policyData');
            if (savedPolicyData) {
                this.policyLearning.importPolicy(savedPolicyData);
                Logger.info('Loaded previous RL policy data');
            }

            Logger.info('RL components initialized successfully');
        } catch (error) {
            Logger.error('Failed to initialize RL components:', error);
            // Continue without RL if initialization fails
            this.rlEnabled = false;
        }
    }

    /**
     * ENHANCED: Start a new RL episode for test prioritization
     */
    public async startRLEpisode(context: any): Promise<MDPState | null> {
        if (!this.rlEnabled) {
            return null;
        }

        try {
            const state = this.mdpFramework.initializeEpisode(context);
            
            this.currentEpisode = {
                episode: this.learningMetrics.getCurrentStatistics().totalEpisodes,
                state: state,
                action: null as any, // Will be set when action is selected
                reward: 0,
                nextState: null as any,
                timestamp: new Date(),
                accuracy: 0,
                done: false
            };

            Logger.debug(`Started RL episode ${this.currentEpisode.episode}`);
            return state;
        } catch (error) {
            Logger.error('Error starting RL episode:', error);
            return null;
        }
    }

    /**
     * ENHANCED: Select action using RL policy
     */
    public async selectRLAction(state: MDPState, availableActions: MDPAction[]): Promise<MDPAction | null> {
        if (!this.rlEnabled || !state) {
            return null;
        }

        try {
            const selectedAction = await this.policyLearning.selectAction(state, availableActions);
            
            if (this.currentEpisode) {
                this.currentEpisode.action = selectedAction;
            }

            Logger.debug(`Selected RL action: ${selectedAction.id}`);
            return selectedAction;
        } catch (error) {
            Logger.error('Error selecting RL action:', error);
            return null;
        }
    }

    /**
     * ENHANCED: End RL episode and update learning
     */
    public async endRLEpisode(environmentResponse: any): Promise<void> {
        if (!this.rlEnabled || !this.currentEpisode) {
            return;
        }

        try {
            const { nextState, reward, done } = this.mdpFramework.executeAction(
                this.currentEpisode.action,
                environmentResponse
            );

            // Complete episode data
            this.currentEpisode.nextState = nextState;
            this.currentEpisode.reward = reward;
            this.currentEpisode.done = done;
            this.currentEpisode.accuracy = environmentResponse.accuracy || 0;

            // Extract additional metrics from environment response
            if (environmentResponse.testResults) {
                const results = environmentResponse.testResults;
                this.currentEpisode.testsRun = results.length;
                this.currentEpisode.truePositives = results.filter((r: any) => r.predicted && r.actual).length;
                this.currentEpisode.falsePositives = results.filter((r: any) => r.predicted && !r.actual).length;
                this.currentEpisode.trueNegatives = results.filter((r: any) => !r.predicted && !r.actual).length;
                this.currentEpisode.falseNegatives = results.filter((r: any) => !r.predicted && r.actual).length;
                this.currentEpisode.executionTime = environmentResponse.executionTime || 0;
            }

            // Update policy learning
            await this.policyLearning.updatePolicy(
                this.currentEpisode.state,
                this.currentEpisode.action,
                reward,
                done ? undefined : nextState
            );

            // Record episode in learning metrics
            await this.learningMetrics.recordEpisode(this.currentEpisode);

            // Update graph weights based on feedback
            if (environmentResponse.feedbackSignals) {
                await this.updateGraphWeights(environmentResponse.feedbackSignals);
            }

            // Save RL data periodically
            await this.saveRLData();

            Logger.info(`Completed RL episode ${this.currentEpisode.episode}, reward: ${reward.toFixed(3)}, accuracy: ${this.currentEpisode.accuracy.toFixed(3)}`);
            
            this.currentEpisode = null;
        } catch (error) {
            Logger.error('Error ending RL episode:', error);
        }
    }

    /**
     * Update graph weights based on RL feedback
     */
    private async updateGraphWeights(feedbackSignals: FeedbackSignal[]): Promise<void> {
        try {
            const weightUpdates = await this.weightUpdateManager.updateWeights(feedbackSignals);
            
            if (weightUpdates.length > 0) {
                // Save updated graph
                await this.saveGraph();
                Logger.debug(`Applied ${weightUpdates.length} weight updates to graph`);
            }
        } catch (error) {
            Logger.error('Error updating graph weights:', error);
        }
    }

    /**
     * Save RL learning data
     */
    private async saveRLData(): Promise<void> {
        try {
            // Save policy data
            const policyData = this.policyLearning.exportPolicy();
            await this.context.globalState.update('sikg.policyData', policyData);

            // Save learning statistics
            const learningStats = this.learningMetrics.getCurrentStatistics();
            await this.context.globalState.update('sikg.learningStatistics', learningStats);

            Logger.debug('Saved RL learning data');
        } catch (error) {
            Logger.error('Error saving RL data:', error);
        }
    }

    /**
     * Get RL learning report
     */
    public async getRLLearningReport(): Promise<any> {
        if (!this.rlEnabled) {
            return null;
        }

        try {
            return await this.learningMetrics.getLearningReport();
        } catch (error) {
            Logger.error('Error generating RL learning report:', error);
            return null;
        }
    }

    /**
     * Get RL statistics for UI display
     */
    public getRLStatistics(): any {
        if (!this.rlEnabled) {
            return null;
        }

        return {
            enabled: this.rlEnabled,
            learningStats: this.learningMetrics.getCurrentStatistics(),
            policyStats: this.policyLearning.getPolicyStatistics(),
            weightStats: this.weightUpdateManager.getLearningMetrics(),
            mdpStats: this.mdpFramework.getStatistics()
        };
    }

    /**
     * Enable/disable RL learning
     */
    public setRLEnabled(enabled: boolean): void {
        this.rlEnabled = enabled;
        Logger.info(`RL learning ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Reset RL learning data
     */
    public async resetRLLearning(): Promise<void> {
        if (!this.rlEnabled) {
            return;
        }

        try {
            this.policyLearning.resetPolicy();
            this.weightUpdateManager.resetHistory();
            await this.learningMetrics.clearHistory();
            
            // Clear saved data
            await this.context.globalState.update('sikg.policyData', undefined);
            await this.context.globalState.update('sikg.learningStatistics', undefined);

            Logger.info('Reset RL learning data');
        } catch (error) {
            Logger.error('Error resetting RL learning:', error);
        }
    }

    // [Rest of the existing SIKGManager methods remain unchanged]
    // Including: checkForGraphUpdate, updateGraph, rebuildGraph, enhanceGraphRelationships,
    // updateWithTestResults, exportGraphForVisualization, getNode, addNode, updateNode,
    // addEdge, updateEdge, getOutgoingEdges, etc.

    /**
     * Check if the graph needs updating due to new files or changes
     */
    private async checkForGraphUpdate(): Promise<boolean> {
        const codeFiles = await this.findAllCodeFiles();
        const testFiles = await this.findAllTestFiles();
        
        let codeNodeCount = 0;
        let testNodeCount = 0;
        
        for (const node of this.graph.nodes.values()) {
            if (node.type === 'CodeElement') {
                codeNodeCount++;
            } else if (node.type === 'TestCase') {
                testNodeCount++;
            }
        }
        
        return codeFiles.length > codeNodeCount / 5 || testFiles.length > testNodeCount;
    }

    /**
     * Update the graph with new files while preserving existing nodes and relationships
     */
    private async updateGraph(): Promise<void> {
        try {
            const codeFiles = await this.findAllCodeFiles();
            const testFiles = await this.findAllTestFiles();
            
            const processedCodeFiles = new Set<string>();
            const processedTestFiles = new Set<string>();
            
            for (const node of this.graph.nodes.values()) {
                if (node.filePath) {
                    if (node.type === 'CodeElement') {
                        processedCodeFiles.add(node.filePath);
                    } else if (node.type === 'TestCase') {
                        processedTestFiles.add(node.filePath);
                    }
                }
            }
            
            const newCodeFiles = codeFiles.filter(file => {
                const relativePath = vscode.workspace.asRelativePath(file);
                return !processedCodeFiles.has(relativePath);
            });
            
            const newTestFiles = testFiles.filter(file => {
                const relativePath = vscode.workspace.asRelativePath(file);
                return !processedTestFiles.has(relativePath);
            });
            
            Logger.info(`Updating SIKG graph with ${newCodeFiles.length} new code files and ${newTestFiles.length} new test files`);
            
            await this.processCodeFiles(newCodeFiles);
            await this.processTestFiles(newTestFiles);
            await this.saveGraph();
            
            Logger.info(`SIKG graph updated. Now has ${this.graph.nodes.size} nodes and ${this.graph.edges.size} edges`);
        } catch (error) {
            Logger.error('Failed to update SIKG graph:', error);
            throw error;
        }
    }

    /**
     * Rebuild the entire knowledge graph from the current workspace
     */
    public async rebuildGraph(): Promise<void> {
        try {
            this.graph = { nodes: new Map(), edges: new Map() };
            
            const codeFiles = await this.findAllCodeFiles();
            const testFiles = await this.findAllTestFiles();
            
            Logger.info(`Building SIKG from ${codeFiles.length} code files and ${testFiles.length} test files`);
            await this.processCodeFiles(codeFiles);
            await this.processTestFiles(testFiles);
            await this.enhanceGraphRelationships();
            await this.saveGraph();
            
            Logger.info(`SIKG built with ${this.graph.nodes.size} nodes and ${this.graph.edges.size} edges`);
        } catch (error) {
            Logger.error('Failed to rebuild SIKG graph:', error);
            throw error;
        }
    }

    /**
     * Enhance graph relationships by analyzing dependencies and call hierarchies
     */
    private async enhanceGraphRelationships(): Promise<void> {
        try {
            Logger.info('Enhancing graph relationships with additional analysis');
        } catch (error) {
            Logger.error('Error enhancing graph relationships:', error);
        }
    }

    /**
     * Updates the SIKG with test execution results for reinforcement learning
     */
    public async updateWithTestResults(testResults: TestResult[]): Promise<void> {
        if (!this.initialized) {
            await this.initialize();
        }
        
        try {
            let changedEdgeWeights = 0;
            
            for (const result of testResults) {
                const testNodeId = result.testId;
                const testNode = this.graph.nodes.get(testNodeId);
                if (!testNode) {
                    Logger.warn(`Test node not found for test: ${result.testId}`);
                    continue;
                }
                
                testNode.properties = {
                    ...testNode.properties,
                    lastRun: new Date().toISOString(),
                    lastStatus: result.status,
                    executionTime: result.executionTime,
                    history: [
                        ...(testNode.properties.history || []),
                        {
                            timestamp: new Date().toISOString(),
                            status: result.status,
                            executionTime: result.executionTime
                        }
                    ].slice(-20)
                };
                
                if (result.predictedImpact !== undefined) {
                    const highThreshold = this.configManager.getHighImpactThreshold();
                    const lowThreshold = this.configManager.getLowImpactThreshold();
                    
                    if ((result.predictedImpact > highThreshold && result.status === 'passed') ||
                        (result.predictedImpact < lowThreshold && result.status === 'failed')) {
                        
                        const contributingPaths = this.findContributingPaths(testNodeId, result.changedNodeIds || []);
                        
                        for (const path of contributingPaths) {
                            for (const edgeId of path) {
                                const edge = this.graph.edges.get(edgeId);
                                if (edge) {
                                    let adjustmentFactor: number;
                                    
                                    if (result.predictedImpact > highThreshold && result.status === 'passed') {
                                        adjustmentFactor = 0.9;
                                    } else {
                                        adjustmentFactor = 1.1;
                                    }
                                    
                                    edge.weight = Math.max(0.1, Math.min(10, edge.weight * adjustmentFactor));
                                    changedEdgeWeights++;
                                }
                            }
                        }
                    }
                }
            }
            
            await this.saveGraph();
            Logger.info(`Updated SIKG with test results. Modified ${changedEdgeWeights} edge weights.`);
            
        } catch (error) {
            Logger.error('Failed to update SIKG with test results:', error);
            throw error;
        }
    }

    /**
     * Export a simplified version of the graph for visualization with proper change marking
     */
    public async exportGraphForVisualization(): Promise<any> {
        if (!this.initialized) {
            await this.initialize();
        }
        
        const nodes: any[] = [];
        const links: any[] = [];
        
        for (const [id, node] of this.graph.nodes.entries()) {
            nodes.push({
                id,
                label: node.name || id,
                type: node.type,
                impact: node.properties.impactScore || 0,
                changed: node.properties.changed || false,
                fileName: path.basename(node.filePath || ''),
                semanticChangeType: node.properties.semanticChangeType,
                filePath: node.filePath
            });
        }
        
        for (const [id, edge] of this.graph.edges.entries()) {
            links.push({
                source: edge.source,
                target: edge.target,
                type: edge.type,
                weight: edge.weight
            });
        }
        
        const changedNodes = nodes.filter(n => n.changed);
        const testNodes = nodes.filter(n => n.type === 'TestCase');
        const codeNodes = nodes.filter(n => n.type === 'CodeElement');
        
        Logger.info(`Graph visualization export: ${nodes.length} total nodes (${codeNodes.length} code, ${testNodes.length} test), ${changedNodes.length} changed nodes`);
        
        return { nodes, links };
    }

    // Additional helper methods
    public getNode(nodeId: string): Node | undefined {
        return this.graph.nodes.get(nodeId);
    }

    public addNode(node: Node): void {
        this.graph.nodes.set(node.id, node);
    }

    public updateNode(nodeId: string, updatedProperties: Partial<Node>): void {
        const existingNode = this.graph.nodes.get(nodeId);
        if (existingNode) {
            this.graph.nodes.set(nodeId, { ...existingNode, ...updatedProperties });
        }
    }

    public addEdge(edge: Edge): void {
        const edgeId = `${edge.source}-${edge.type}-${edge.target}`;
        this.graph.edges.set(edgeId, edge);
    }

    public updateEdge(edgeId: string, updatedProperties: Partial<Edge>): void {
        const existingEdge = this.graph.edges.get(edgeId);
        if (existingEdge) {
            this.graph.edges.set(edgeId, { ...existingEdge, ...updatedProperties });
        }
    }

    public getOutgoingEdges(nodeId: string): Edge[] {
        const result: Edge[] = [];
        for (const edge of this.graph.edges.values()) {
            if (edge.source === nodeId) {
                result.push(edge);
            }
        }
        return result;
    }

    public getIncomingEdges(nodeId: string): Edge[] {
        const result: Edge[] = [];
        for (const edge of this.graph.edges.values()) {
            if (edge.target === nodeId) {
                result.push(edge);
            }
        }
        return result;
    }

    public getTestNodes(): Node[] {
        const result: Node[] = [];
        for (const node of this.graph.nodes.values()) {
            if (node.type === 'TestCase') {
                result.push(node);
            }
        }
        return result;
    }

    public getCodeNodes(): Node[] {
        const result: Node[] = [];
        for (const node of this.graph.nodes.values()) {
            if (node.type === 'CodeElement') {
                result.push(node);
            }
        }
        return result;
    }

    public markNodesAsChanged(changedNodes: SemanticChangeInfo[]): void {
        this.resetChangedStatus();
        
        const changedNodeIds = new Set<string>();
        
        for (const change of changedNodes) {
            const node = this.graph.nodes.get(change.nodeId);
            if (node) {
                node.properties = {
                    ...node.properties,
                    changed: true,
                    semanticChangeType: change.semanticType,
                    changeTimestamp: new Date().toISOString(),
                    changeDetails: change.changeDetails,
                    initialImpactScore: change.initialImpactScore
                };
                
                changedNodeIds.add(change.nodeId);
                Logger.info(`Marked node as changed: ${node.name} (${change.nodeId}) - ${change.semanticType}`);
            }
        }
        
        this.markImpactedTestNodes(changedNodeIds);
        Logger.info(`Total nodes marked as changed: ${changedNodeIds.size}`);
    }

    private markImpactedTestNodes(changedCodeNodeIds: Set<string>): void {
        const testNodes = this.getTestNodes();
        
        for (const testNode of testNodes) {
            const hasImpactPath = this.hasPathToChangedNodes(testNode.id, changedCodeNodeIds);
            
            if (hasImpactPath) {
                testNode.properties = {
                    ...testNode.properties,
                    impacted: true,
                    impactedBy: Array.from(changedCodeNodeIds)
                };
                
                Logger.info(`Marked test as impacted: ${testNode.name} (${testNode.id})`);
            }
        }
    }

    private hasPathToChangedNodes(testNodeId: string, changedCodeNodeIds: Set<string>, maxDepth: number = 3): boolean {
        const visited = new Set<string>();
        const queue: { nodeId: string; depth: number }[] = [{ nodeId: testNodeId, depth: 0 }];
        
        while (queue.length > 0) {
            const { nodeId, depth } = queue.shift()!;
            
            if (visited.has(nodeId) || depth > maxDepth) {
                continue;
            }
            
            visited.add(nodeId);
            
            if (changedCodeNodeIds.has(nodeId)) {
                return true;
            }
            
            const outgoingEdges = this.getOutgoingEdges(nodeId);
            for (const edge of outgoingEdges) {
                if (!visited.has(edge.target)) {
                    queue.push({ nodeId: edge.target, depth: depth + 1 });
                }
            }
        }
        
        return false;
    }

    public resetChangedStatus(): void {
        let resetCount = 0;
        for (const node of this.graph.nodes.values()) {
            if (node.properties.changed || node.properties.impacted) {
                node.properties = {
                    ...node.properties,
                    changed: false,
                    impacted: false,
                    semanticChangeType: undefined,
                    initialImpactScore: undefined,
                    impactedBy: undefined
                };
                resetCount++;
            }
        }
        
        if (resetCount > 0) {
            Logger.debug(`Reset change status for ${resetCount} nodes`);
        }
    }

    private findContributingPaths(testNodeId: string, changedNodeIds: string[]): string[][] {
        const paths: string[][] = [];
        
        for (const changedNodeId of changedNodeIds) {
            const queue: { nodeId: string; path: string[] }[] = [{ nodeId: changedNodeId, path: [] }];
            const visited = new Set<string>();
            
            while (queue.length > 0) {
                const { nodeId, path } = queue.shift()!;
                
                if (nodeId === testNodeId) {
                    paths.push(path);
                    continue;
                }
                
                if (visited.has(nodeId)) {
                    continue;
                }
                
                visited.add(nodeId);
                
                const outgoingEdges = this.getOutgoingEdges(nodeId);
                for (const edge of outgoingEdges) {
                    const edgeId = `${edge.source}-${edge.type}-${edge.target}`;
                    queue.push({
                        nodeId: edge.target,
                        path: [...path, edgeId]
                    });
                }
            }
        }
        
        return paths;
    }

    private async findAllCodeFiles(): Promise<string[]> {
        const codeExtensions = this.configManager.getCodeFileExtensions();
        const excludePatterns = this.configManager.getExcludePatterns();
        
        const files = await vscode.workspace.findFiles(
            `**/*.{${codeExtensions.join(',')}}`,
            `{${excludePatterns.join(',')}}`
        );
        
        return files.map(file => file.fsPath);
    }

    private async findAllTestFiles(): Promise<string[]> {
        const testPatterns = this.configManager.getTestFilePatterns();
        const excludePatterns = this.configManager.getExcludePatterns();
        
        const files = await vscode.workspace.findFiles(
            `{${testPatterns.join(',')}}`,
            `{${excludePatterns.join(',')}}`
        );
        
        return files.map(file => file.fsPath);
    }

    private async processCodeFiles(codeFiles: string[]): Promise<void> {
        const batchSize = 20;
        
        for (let i = 0; i < codeFiles.length; i += batchSize) {
            const batch = codeFiles.slice(i, i + batchSize);
            
            for (const filePath of batch) {
                try {
                    const content = fs.readFileSync(filePath, 'utf8');
                    const fileUri = vscode.Uri.file(filePath);
                    const relativePath = vscode.workspace.asRelativePath(fileUri);
                    
                    const codeElements = await this.codeParser.parseCodeFile(content, relativePath);
                    
                    for (const element of codeElements) {
                        this.addNode({
                            id: element.id,
                            type: 'CodeElement',
                            name: element.name,
                            filePath: relativePath,
                            properties: {
                                kind: element.kind,
                                loc: element.loc,
                                signature: element.signature
                            }
                        });
                        
                        for (const relation of element.relations) {
                            this.addEdge({
                                source: element.id,
                                target: relation.targetId,
                                type: relation.type,
                                weight: relation.weight || 1.0,
                                properties: {}
                            });
                        }
                    }
                } catch (error) {
                    Logger.warn(`Failed to process code file: ${filePath}`, error);
                }
            }
            
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }

    private async processTestFiles(testFiles: string[]): Promise<void> {
        const batchSize = 20;
        
        for (let i = 0; i < testFiles.length; i += batchSize) {
            const batch = testFiles.slice(i, i + batchSize);
            
            for (const filePath of batch) {
                try {
                    const content = fs.readFileSync(filePath, 'utf8');
                    const fileUri = vscode.Uri.file(filePath);
                    const relativePath = vscode.workspace.asRelativePath(fileUri);
                    
                    const testCases = await this.testParser.parseTestFile(content, relativePath);
                    
                    for (const test of testCases) {
                        this.addNode({
                            id: test.id,
                            type: 'TestCase',
                            name: test.name,
                            filePath: relativePath,
                            properties: {
                                testType: test.testType,
                                loc: test.loc,
                                executionTime: test.executionTime || 0,
                                history: []
                            }
                        });
                        
                        for (const coverage of test.coveredElements) {
                            this.addEdge({
                                source: test.id,
                                target: coverage.targetId,
                                type: 'TESTS',
                                weight: coverage.weight || 1.0,
                                properties: {}
                            });
                            
                            this.addEdge({
                                source: coverage.targetId,
                                target: test.id,
                                type: 'IS_TESTED_BY',
                                weight: coverage.weight || 1.0,
                                properties: {}
                            });
                        }
                    }
                } catch (error) {
                    Logger.warn(`Failed to process test file: ${filePath}`, error);
                }
            }
            
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }

    private async saveGraph(): Promise<void> {
        try {
            const serializedGraph = {
                nodes: Array.from(this.graph.nodes.entries()),
                edges: Array.from(this.graph.edges.entries())
            };
            
            fs.writeFileSync(this.graphPath, JSON.stringify(serializedGraph, null, 2));
            Logger.info(`SIKG graph saved to ${this.graphPath}`);
        } catch (error) {
            Logger.error('Failed to save SIKG graph:', error);
            throw error;
        }
    }

    private async loadGraph(): Promise<void> {
        try {
            const content = fs.readFileSync(this.graphPath, 'utf8');
            const serializedGraph = JSON.parse(content);
            
            this.graph = {
                nodes: new Map(serializedGraph.nodes),
                edges: new Map(serializedGraph.edges)
            };
            
            Logger.info(`Loaded SIKG graph with ${this.graph.nodes.size} nodes and ${this.graph.edges.size} edges`);
        } catch (error) {
            Logger.error('Failed to load SIKG graph:', error);
            throw error;
        }
    }

    public dispose(): void {
        this.saveGraph().catch(error => {
            Logger.error('Failed to save SIKG on dispose:', error);
        });
    }
}