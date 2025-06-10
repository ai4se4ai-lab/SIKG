// src/sikg/history/index.ts - History Analysis System Index

export { HistoryAnalyzer } from './HistoryAnalyzer';
export { CommitTracker } from './CommitTracker';
export { CoChangeDetector } from './CoChangeDetector';
export { FaultCorrelator } from './FaultCorrelator';
export { EmpiricalWeightCalculator } from './EmpiricalWeightCalculator';

// Re-export interfaces for external use
export type {
    KnowledgeGraph,
    CommitInfo,
    TestResultInfo,
    EnhancedWeights,
    AnalysisStats
} from './HistoryAnalyzer';