// Graph Types - Type definitions for the Semantic Impact Knowledge Graph

export interface Node {
    id: string;
    type: 'CodeElement' | 'TestCase';
    name: string;
    filePath: string;
    properties: Record<string, any>;
}

export interface Edge {
    source: string;
    target: string;
    type: string;
    weight: number;
    properties: Record<string, any>;
}

export interface Graph {
    nodes: Map<string, Node>;
    edges: Map<string, Edge>;
}

export interface CodeElement {
    id: string;
    name: string;
    kind: string;
    filePath: string;
    signature?: string;
    loc: { start: { line: number, column: number }, end: { line: number, column: number } };
    relations: Array<{
        targetId: string;
        type: string;
        weight?: number;
    }>;
}

export interface TestCase {
    id: string;
    name: string;
    testType: 'unit' | 'integration' | 'e2e' | 'unknown';
    filePath: string;
    loc: { start: { line: number, column: number }, end: { line: number, column: number } };
    executionTime?: number;
    coveredElements: Array<{
        targetId: string;
        weight?: number;
    }>;
}

export interface SemanticChangeInfo {
    nodeId: string;
    semanticType: 'BUG_FIX' | 'FEATURE_ADDITION' | 'REFACTORING_SIGNATURE' | 
                  'REFACTORING_LOGIC' | 'DEPENDENCY_UPDATE' | 'PERFORMANCE_OPT' | 'UNKNOWN';
    changeDetails: {
        linesChanged: number;
        oldCodeHash: string;
        newCodeHash: string;
        [key: string]: any;
    };
    initialImpactScore: number;
}

export interface TestResult {
    testId: string;
    status: 'passed' | 'failed' | 'skipped';
    executionTime: number;
    predictedImpact?: number;
    changedNodeIds?: string[];
    errorMessage?: string;
    timestamp: string;
}

export interface TestImpact {
    testId: string;
    impactScore: number;
    testName: string;
    testPath: string;
    contributingChanges: Array<{
        nodeId: string;
        semanticType: string;
        contribution: number;
    }>;
}