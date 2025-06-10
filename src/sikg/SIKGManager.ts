// FIXED SIKGManager.ts - Proper node marking and graph state management

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { RLManager } from './learning/RLManager';
import { Logger } from '../utils/Logger';
import { ConfigManager } from '../utils/ConfigManager';
import { CodeParser } from './CodeParser';
import { TestParser } from './TestParser';
import { Graph, Node, Edge, SemanticChangeInfo, TestResult, TestImpact } from './GraphTypes';
import { HistoryAnalyzer } from './history/HistoryAnalyzer';

import { MetricsCollector } from './evaluation/MetricsCollector';

/**
 * FIXED SIKGManager - Proper graph state management and visualization data
 */
export class SIKGManager {
    private graph: Graph;
    private context: vscode.ExtensionContext;
    private configManager: ConfigManager;
    private codeParser: CodeParser;
    private testParser: TestParser;
    private graphPath: string;
    private initialized: boolean = false;
    private rlManager: RLManager;
    private metricsCollector: MetricsCollector;
    private historyAnalyzer: HistoryAnalyzer;


    constructor(context: vscode.ExtensionContext, configManager: ConfigManager) {
        this.context = context;
        this.configManager = configManager;
        this.graph = { nodes: new Map(), edges: new Map() };
        this.codeParser = new CodeParser();
        this.testParser = new TestParser();
        this.rlManager = new RLManager(configManager);
        this.metricsCollector = new MetricsCollector(this.configManager);
        this.historyAnalyzer = new HistoryAnalyzer(configManager);

        
        // Set up storage path for the graph
        const storagePath = context.globalStorageUri.fsPath;
        if (!fs.existsSync(storagePath)) {
            fs.mkdirSync(storagePath, { recursive: true });
        }
        this.graphPath = path.join(storagePath, 'sikg-graph.json');
    }

    /**
     * Initialize the SIKG, loading the existing graph if available or building a new one
     */
    public async initialize(): Promise<void> {
        try {
            if (fs.existsSync(this.graphPath)) {
                // Load existing graph
                await this.loadGraph();
                Logger.info('Loaded existing SIKG graph');

                 // Apply historical weight enhancement
                await this.enhanceGraphWithHistory();
                
                // Check if we need to update the graph (e.g., new files added)
                const needsUpdate = await this.checkForGraphUpdate();

                const rlEnabled = vscode.workspace.getConfiguration('sikg').get<boolean>('reinforcementLearning.enabled', true);
                this.rlManager.setEnabled(rlEnabled);
                
                Logger.info('✅ SIKG Manager with RL initialized successfully');
                this.initialized = true;

                if (needsUpdate) {
                    Logger.info('Updating SIKG graph with new files');
                    await this.updateGraph();
                }
            } else {
                // Build new graph
                await this.rebuildGraph();
                Logger.info('Built new SIKG graph');
            }
            this.initialized = true;
        } catch (error) {
            Logger.error('Failed to initialize SIKG:', error);
            throw error;
        }

        
    }

    // Add this new method to enhance graph weights with historical data:
    private async enhanceGraphWithHistory(): Promise<void> {
        try {
            Logger.info('Enhancing graph weights with historical analysis...');
            
            const enhancedWeights = await this.historyAnalyzer.enhanceWeights({
                nodes: this.graph.nodes,
                edges: this.graph.edges
            });

            // Apply enhanced weights to the graph
            for (const [edgeId, weight] of enhancedWeights.weights.entries()) {
                const edge = this.graph.edges.get(edgeId);
                if (edge) {
                    edge.weight = weight;
                }
            }

            Logger.info(`Enhanced ${enhancedWeights.metrics.processedEdges} edge weights using ${enhancedWeights.metrics.commitsAnalyzed} commits`);
            
        } catch (error) {
            Logger.error('Error enhancing graph with history:', error);
            // Continue without historical enhancement
        }
    }

    /**
     * Check if the graph needs updating due to new files or changes
     */
    private async checkForGraphUpdate(): Promise<boolean> {
        // Check if new files have been added since last graph build
        const codeFiles = await this.findAllCodeFiles();
        const testFiles = await this.findAllTestFiles();
        
        // Count existing nodes
        let codeNodeCount = 0;
        let testNodeCount = 0;
        
        for (const node of this.graph.nodes.values()) {
            if (node.type === 'CodeElement') {
                codeNodeCount++;
            } else if (node.type === 'TestCase') {
                testNodeCount++;
            }
        }
        
        // Simple heuristic: if we have more files than nodes of the corresponding type,
        // we probably need to update the graph
        return codeFiles.length > codeNodeCount / 5 || testFiles.length > testNodeCount;
    }

    /**
     * Update the graph with new files while preserving existing nodes and relationships
     */
    private async updateGraph(): Promise<void> {
        try {
            // Find all code and test files
            const codeFiles = await this.findAllCodeFiles();
            const testFiles = await this.findAllTestFiles();
            
            // Track which files we've already processed
            const processedCodeFiles = new Set<string>();
            const processedTestFiles = new Set<string>();
            
            // Check which files are already in the graph
            for (const node of this.graph.nodes.values()) {
                if (node.filePath) {
                    if (node.type === 'CodeElement') {
                        processedCodeFiles.add(node.filePath);
                    } else if (node.type === 'TestCase') {
                        processedTestFiles.add(node.filePath);
                    }
                }
            }
            
            // Process only new code files
            const newCodeFiles = codeFiles.filter(file => {
                const relativePath = vscode.workspace.asRelativePath(file);
                return !processedCodeFiles.has(relativePath);
            });
            
            // Process only new test files
            const newTestFiles = testFiles.filter(file => {
                const relativePath = vscode.workspace.asRelativePath(file);
                return !processedTestFiles.has(relativePath);
            });
            
            Logger.info(`Updating SIKG graph with ${newCodeFiles.length} new code files and ${newTestFiles.length} new test files`);
            
            // Process new code files
            await this.processCodeFiles(newCodeFiles);
            
            // Process new test files
            await this.processTestFiles(newTestFiles);
            
            // Save the updated graph
            await this.saveGraph();
            
            // Log statistics
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
            // Clear existing graph
            this.graph = { nodes: new Map(), edges: new Map() };
            
            // Find all code and test files in the workspace
            const codeFiles = await this.findAllCodeFiles();
            const testFiles = await this.findAllTestFiles();
            
            // Parse code files and build code nodes
            Logger.info(`Building SIKG from ${codeFiles.length} code files and ${testFiles.length} test files`);
            await this.processCodeFiles(codeFiles);
            
            // Parse test files and link them to code elements
            await this.processTestFiles(testFiles);
            
            // Apply additional analysis to enhance the graph
            await this.enhanceGraphRelationships();
            
            // Save the graph
            await this.saveGraph();
            
            // Log statistics
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
            // This would use VS Code's Language Services to get better dependency information
            // For demonstration purposes, we'll just log that this step occurred
            Logger.info('Enhancing graph relationships with additional analysis');
            
            // In a full implementation, this would:
            // 1. Use VS Code's "Find All References" to improve call graphs
            // 2. Use language-specific tools to analyze import/dependency relationships
            // 3. Perform static analysis to better understand relationships
            
            // For simplicity, we'll skip the actual implementation
        } catch (error) {
            Logger.error('Error enhancing graph relationships:', error);
            // Non-critical, so don't throw the error
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
                
                // Find the test node
                const testNode = this.graph.nodes.get(testNodeId);
                if (!testNode) {
                    Logger.warn(`Test node not found for test: ${result.testId}`);
                    continue;
                }
                
                // Update test node properties with execution result
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
                    ].slice(-20) // Keep only the last 20 executions
                };
                
                // If this test was predicted with high impact but passed, or low impact but failed,
                // adjust the edge weights - this is the reinforcement learning part
                if (result.predictedImpact !== undefined) {
                    const highThreshold = this.configManager.getHighImpactThreshold();
                    const lowThreshold = this.configManager.getLowImpactThreshold();
                    
                    if ((result.predictedImpact > highThreshold && result.status === 'passed') ||
                        (result.predictedImpact < lowThreshold && result.status === 'failed')) {
                        
                        // Find paths that contributed to this test's score
                        const contributingPaths = this.findContributingPaths(testNodeId, result.changedNodeIds || []);
                        
                        for (const path of contributingPaths) {
                            for (const edgeId of path) {
                                const edge = this.graph.edges.get(edgeId);
                                if (edge) {
                                    // Calculate weight adjustment factor based on the prediction error
                                    let adjustmentFactor: number;
                                    
                                    if (result.predictedImpact > highThreshold && result.status === 'passed') {
                                        // False positive: reduce weight
                                        adjustmentFactor = 0.9; // Decrease by 10%
                                    } else {
                                        // False negative: increase weight
                                        adjustmentFactor = 1.1; // Increase by 10%
                                    }
                                    
                                    // Apply adjustment to edge weight
                                    edge.weight = Math.max(0.1, Math.min(10, edge.weight * adjustmentFactor));
                                    changedEdgeWeights++;
                                }
                            }
                        }
                    }
                }
            }
            
            // Save the updated graph
            await this.saveGraph();
            Logger.info(`Updated SIKG with test results. Modified ${changedEdgeWeights} edge weights.`);
            
        } catch (error) {
            Logger.error('Failed to update SIKG with test results:', error);
            throw error;
        }

        try {
            // Process RL feedback
            await this.rlManager.processTestFeedback(testResults);
            
            // Update graph weights using RL
            this.graph = await this.rlManager.updateGraphWeights(this.graph);
            
            // Collect performance metrics
            this.metricsCollector?.recordTestExecution(testResults);
            
            Logger.info(`✅ Updated SIKG with ${testResults.length} test results including RL feedback`);
            
        } catch (error) {
            Logger.error('❌ Error in RL feedback processing:', error);
            // Continue with existing logic even if RL fails
        }
    }

     /**
     * Load persisted RL state
     */
    private async loadRLState(): Promise<void> {
        try {
            const savedState = this.context.globalState.get('sikg.rlState');
            if (savedState) {
                this.rlManager.importState(savedState);
                Logger.info('Loaded persisted RL state');
            }
        } catch (error) {
            Logger.error('Error loading RL state:', error);
        }
    }

    /**
     * New method: Start RL-enhanced test selection session
     */
    public async startRLTestSession(
        semanticChanges: SemanticChangeInfo[],
        testImpacts: Record<string, TestImpact>
    ): Promise<Record<string, TestImpact>> {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            // Get available tests
            const availableTests = Object.keys(testImpacts);
            
            // Start RL session and get adjusted impacts
            const adjustedImpacts = await this.rlManager.startRLSession(
                semanticChanges,
                testImpacts,
                availableTests
            );
            
            Logger.info(`Started RL session with ${availableTests.length} available tests`);
            return adjustedImpacts;
            
        } catch (error) {
            Logger.error('Error starting RL test session:', error);
            return testImpacts; // Fallback to original impacts
        }
    }

    /**
     * Get RL system status and recommendations
     */
    public getRLStatus(): {
        systemStatus: any;
        recommendations: string[];
        isEnabled: boolean;
    } {
        const systemStatus = this.rlManager.getSystemStatus();
        const recommendations = this.rlManager.getPerformanceRecommendations();
        
        return {
            systemStatus,
            recommendations,
            isEnabled: systemStatus.isEnabled
        };
    }

    /**
     * Enable/disable RL system
     */
    public setRLEnabled(enabled: boolean): void {
        this.rlManager.setEnabled(enabled);
        Logger.info(`RL system ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * FIXED: Export a simplified version of the graph for visualization with proper change marking
     */
    public async exportGraphForVisualization(): Promise<any> {
        if (!this.initialized) {
            await this.initialize();
        }
        
        // Convert the graph to a format suitable for D3 visualization
        const nodes: any[] = [];
        const links: any[] = [];
        
        // FIXED: Add nodes with proper change tracking
        for (const [id, node] of this.graph.nodes.entries()) {
            nodes.push({
                id,
                label: node.name || id,
                type: node.type,
                impact: node.properties.impactScore || 0,
                changed: node.properties.changed || false, // FIXED: Include change status
                fileName: path.basename(node.filePath || ''),
                semanticChangeType: node.properties.semanticChangeType, // FIXED: Include change type
                filePath: node.filePath // FIXED: Include full file path for debugging
            });
        }
        
        // Add edges with appropriate information
        for (const [id, edge] of this.graph.edges.entries()) {
            links.push({
                source: edge.source,
                target: edge.target,
                type: edge.type,
                weight: edge.weight
            });
        }
        
        // FIXED: Log debug information
        const changedNodes = nodes.filter(n => n.changed);
        const testNodes = nodes.filter(n => n.type === 'TestCase');
        const codeNodes = nodes.filter(n => n.type === 'CodeElement');
        
        Logger.info(`Graph visualization export: ${nodes.length} total nodes (${codeNodes.length} code, ${testNodes.length} test), ${changedNodes.length} changed nodes`);
        
        return { nodes, links };
    }

    /**
     * Get the node for a given ID
     */
    public getNode(nodeId: string): Node | undefined {
        return this.graph.nodes.get(nodeId);
    }

    /**
     * Get a node by its name and file path
     */
    public getNodeByNameAndPath(name: string, filePath: string): Node | undefined {
        for (const node of this.graph.nodes.values()) {
            if (node.name === name && node.filePath === filePath) {
                return node;
            }
        }
        return undefined;
    }

    /**
     * Add a new node to the graph
     */
    public addNode(node: Node): void {
        this.graph.nodes.set(node.id, node);
    }

    /**
     * Update an existing node in the graph
     */
    public updateNode(nodeId: string, updatedProperties: Partial<Node>): void {
        const existingNode = this.graph.nodes.get(nodeId);
        if (existingNode) {
            this.graph.nodes.set(nodeId, { ...existingNode, ...updatedProperties });
        }
    }

    /**
     * Add a new edge to the graph
     */
    public addEdge(edge: Edge): void {
        const edgeId = `${edge.source}-${edge.type}-${edge.target}`;
        this.graph.edges.set(edgeId, edge);
    }

    /**
     * Update an existing edge in the graph
     */
    public updateEdge(edgeId: string, updatedProperties: Partial<Edge>): void {
        const existingEdge = this.graph.edges.get(edgeId);
        if (existingEdge) {
            this.graph.edges.set(edgeId, { ...existingEdge, ...updatedProperties });
        }
    }

    /**
     * Get outgoing edges from a node
     */
    public getOutgoingEdges(nodeId: string): Edge[] {
        const result: Edge[] = [];
        for (const edge of this.graph.edges.values()) {
            if (edge.source === nodeId) {
                result.push(edge);
            }
        }
        return result;
    }

    /**
     * Get incoming edges to a node
     */
    public getIncomingEdges(nodeId: string): Edge[] {
        const result: Edge[] = [];
        for (const edge of this.graph.edges.values()) {
            if (edge.target === nodeId) {
                result.push(edge);
            }
        }
        return result;
    }

    /**
     * Get all edges between two nodes
     */
    public getEdgesBetween(sourceId: string, targetId: string): Edge[] {
        const result: Edge[] = [];
        for (const edge of this.graph.edges.values()) {
            if (edge.source === sourceId && edge.target === targetId) {
                result.push(edge);
            }
        }
        return result;
    }

    /**
     * Find all test nodes in the graph
     */
    public getTestNodes(): Node[] {
        const result: Node[] = [];
        for (const node of this.graph.nodes.values()) {
            if (node.type === 'TestCase') {
                result.push(node);
            }
        }
        return result;
    }

    /**
     * Find all code nodes in the graph
     */
    public getCodeNodes(): Node[] {
        const result: Node[] = [];
        for (const node of this.graph.nodes.values()) {
            if (node.type === 'CodeElement') {
                result.push(node);
            }
        }
        return result;
    }

    /**
     * Find code nodes by file path
     */
    public getNodesByFilePath(filePath: string): Node[] {
        const result: Node[] = [];
        for (const node of this.graph.nodes.values()) {
            if (node.filePath === filePath) {
                result.push(node);
            }
        }
        return result;
    }

    /**
     * FIXED: Mark nodes as changed with proper change tracking and impact propagation
     */
    public markNodesAsChanged(changedNodes: SemanticChangeInfo[]): void {
        // FIXED: First reset all nodes to unchanged state
        this.resetChangedStatus();
        
        const changedNodeIds = new Set<string>();
        
        // Mark directly changed nodes
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
        
        // FIXED: Find and mark impacted test nodes based on relationships
        this.markImpactedTestNodes(changedNodeIds);
        
        Logger.info(`Total nodes marked as changed: ${changedNodeIds.size}`);
    }

    /**
     * FIXED: Mark test nodes that are impacted by changed code nodes
     */
    private markImpactedTestNodes(changedCodeNodeIds: Set<string>): void {
        const testNodes = this.getTestNodes();
        
        for (const testNode of testNodes) {
            // Check if this test has any edges to changed code nodes
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

    /**
     * FIXED: Check if a test node has a path to any changed code nodes
     */
    private hasPathToChangedNodes(testNodeId: string, changedCodeNodeIds: Set<string>, maxDepth: number = 3): boolean {
        const visited = new Set<string>();
        const queue: { nodeId: string; depth: number }[] = [{ nodeId: testNodeId, depth: 0 }];
        
        while (queue.length > 0) {
            const { nodeId, depth } = queue.shift()!;
            
            if (visited.has(nodeId) || depth > maxDepth) {
                continue;
            }
            
            visited.add(nodeId);
            
            // Check if we've reached a changed code node
            if (changedCodeNodeIds.has(nodeId)) {
                return true;
            }
            
            // Add connected nodes to the queue
            const outgoingEdges = this.getOutgoingEdges(nodeId);
            for (const edge of outgoingEdges) {
                if (!visited.has(edge.target)) {
                    queue.push({ nodeId: edge.target, depth: depth + 1 });
                }
            }
        }
        
        return false;
    }

    /**
     * FIXED: Reset changed status of all nodes properly
     */
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

    /**
     * Get all changed nodes
     */
    public getChangedNodes(): Node[] {
        const result: Node[] = [];
        for (const node of this.graph.nodes.values()) {
            if (node.properties.changed) {
                result.push(node);
            }
        }
        return result;
    }

    /**
     * FIXED: Get all impacted nodes (including changed and test nodes impacted by changes)
     */
    public getImpactedNodes(): Node[] {
        const result: Node[] = [];
        for (const node of this.graph.nodes.values()) {
            if (node.properties.changed || node.properties.impacted) {
                result.push(node);
            }
        }
        return result;
    }

    /**
     * Get tests that cover a specific code element
     */
    public getTestsForCode(codeNodeId: string): Node[] {
        const result: Node[] = [];
        const visited = new Set<string>();
        
        // Find all test nodes that have a path to this code element
        for (const node of this.graph.nodes.values()) {
            if (node.type === 'TestCase') {
                const queue: string[] = [node.id];
                visited.clear();
                
                while (queue.length > 0) {
                    const currentId = queue.shift()!;
                    
                    if (currentId === codeNodeId) {
                        result.push(node);
                        break;
                    }
                    
                    if (visited.has(currentId)) {
                        continue;
                    }
                    
                    visited.add(currentId);
                    
                    // Add all targets of outgoing edges to the queue
                    const outgoingEdges = this.getOutgoingEdges(currentId);
                    for (const edge of outgoingEdges) {
                        queue.push(edge.target);
                    }
                }
            }
        }
        
        return result;
    }

    /**
     * Clean up resources used by the SIKG
     */
    public dispose(): void {
        // Save the graph before disposing
        this.saveGraph().catch(error => {
            Logger.error('Failed to save SIKG on dispose:', error);
        });
        // Dispose history analyzer
        this.historyAnalyzer.dispose();
        try {
            const rlState = this.rlManager.exportState();
            // You could save this to context.globalState for persistence
            this.context.globalState.update('sikg.rlState', rlState);
        } catch (error) {
            Logger.error('Error saving RL state on dispose:', error);
        }
    }

    public getHistoryStats(): any {
        return this.historyAnalyzer.getAnalysisStats();
    }

    /**
     * Find paths that may have contributed to a test's impact score
     */
    private findContributingPaths(testNodeId: string, changedNodeIds: string[]): string[][] {
        const paths: string[][] = [];
        
        for (const changedNodeId of changedNodeIds) {
            // Basic BFS to find paths from the changed node to the test node
            const queue: { nodeId: string; path: string[] }[] = [{ nodeId: changedNodeId, path: [] }];
            const visited = new Set<string>();
            
            while (queue.length > 0) {
                const { nodeId, path } = queue.shift()!;
                
                if (nodeId === testNodeId) {
                    // Found a path to the test
                    paths.push(path);
                    continue;
                }
                
                if (visited.has(nodeId)) {
                    continue;
                }
                
                visited.add(nodeId);
                
                // Get outgoing edges
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

    /**
     * Find all code files in the workspace
     */
    private async findAllCodeFiles(): Promise<string[]> {
        const codeExtensions = this.configManager.getCodeFileExtensions();
        const excludePatterns = this.configManager.getExcludePatterns();
        
        const files = await vscode.workspace.findFiles(
            `**/*.{${codeExtensions.join(',')}}`,
            `{${excludePatterns.join(',')}}`
        );
        
        return files.map(file => file.fsPath);
    }

    /**
     * Find all test files in the workspace
     */
    private async findAllTestFiles(): Promise<string[]> {
        const testPatterns = this.configManager.getTestFilePatterns();
        const excludePatterns = this.configManager.getExcludePatterns();
        
        const files = await vscode.workspace.findFiles(
            `{${testPatterns.join(',')}}`,
            `{${excludePatterns.join(',')}}`
        );
        
        return files.map(file => file.fsPath);
    }

    /**
     * Process code files and add them to the graph
     */
    private async processCodeFiles(codeFiles: string[]): Promise<void> {
        // Process in batches to avoid locking the UI
        const batchSize = 20;
        
        for (let i = 0; i < codeFiles.length; i += batchSize) {
            const batch = codeFiles.slice(i, i + batchSize);
            
            for (const filePath of batch) {
                try {
                    const content = fs.readFileSync(filePath, 'utf8');
                    const fileUri = vscode.Uri.file(filePath);
                    const relativePath = vscode.workspace.asRelativePath(fileUri);
                    
                    // Parse the code file
                    const codeElements = await this.codeParser.parseCodeFile(content, relativePath);
                    
                    // Add nodes and edges to the graph
                    for (const element of codeElements) {
                        // Add the code element node
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
                        
                        // Add relationships (edges)
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
            
            // Allow UI updates between batches
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }

    /**
     * Process test files and add them to the graph
     */
    private async processTestFiles(testFiles: string[]): Promise<void> {
        // Process in batches to avoid locking the UI
        const batchSize = 20;
        
        for (let i = 0; i < testFiles.length; i += batchSize) {
            const batch = testFiles.slice(i, i + batchSize);
            
            for (const filePath of batch) {
                try {
                    const content = fs.readFileSync(filePath, 'utf8');
                    const fileUri = vscode.Uri.file(filePath);
                    const relativePath = vscode.workspace.asRelativePath(fileUri);
                    
                    // Parse the test file
                    const testCases = await this.testParser.parseTestFile(content, relativePath);
                    
                    // Add nodes and edges to the graph
                    for (const test of testCases) {
                        // Add the test case node
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
                        
                        // Link test to covered code elements
                        for (const coverage of test.coveredElements) {
                            this.addEdge({
                                source: test.id,
                                target: coverage.targetId,
                                type: 'TESTS',
                                weight: coverage.weight || 1.0,
                                properties: {}
                            });
                            
                            // Add a reverse edge for easier traversal
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
            
            // Allow UI updates between batches
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }

    /**
     * Save the graph to disk
     */
    private async saveGraph(): Promise<void> {
        try {
            // Convert the graph to a serializable format
            const serializedGraph = {
                nodes: Array.from(this.graph.nodes.entries()),
                edges: Array.from(this.graph.edges.entries())
            };
            
            // Write to disk
            fs.writeFileSync(this.graphPath, JSON.stringify(serializedGraph, null, 2));
            Logger.info(`SIKG graph saved to ${this.graphPath}`);
        } catch (error) {
            Logger.error('Failed to save SIKG graph:', error);
            throw error;
        }
    }

    /**
     * Load the graph from disk
     */
    private async loadGraph(): Promise<void> {
        try {
            const content = fs.readFileSync(this.graphPath, 'utf8');
            const serializedGraph = JSON.parse(content);
            
            // Reconstruct the graph
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
}