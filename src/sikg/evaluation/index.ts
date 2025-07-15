// src/sikg/evaluation/index.ts - Performance Evaluation System Index

export { MetricsCollector } from './MetricsCollector';
export { APFDCalculator } from './APFDCalculator';
export { EffectivenessTracker } from './EffectivenessTracker';
export { ReportGenerator } from './ReportGenerator';

// Re-export interfaces for external use
export type {
    PerformanceMetrics,
    TestExecution,
    TimeMetrics,
    FaultTrend
} from './MetricsCollector';

export type {
    APFDResult,
    APFDComparison,
    FaultDetectionCurve,
    FaultDetectionPoint,
    PythonFaultMetrics
} from './APFDCalculator';

export type {
    EffectivenessSnapshot,
    TestTrend,
    TrendDirection,
    SignificanceLevel,
    EffectivenessTrends,
    PythonEffectivenessInsights,
    EffectivenessComparison,
    PeriodStats
} from './EffectivenessTracker';

export type {
    PerformanceReport,
    ReportMetadata,
    ExecutiveSummary,
    DetailedAnalysis,
    ReportRecommendations,
    ChartData
} from './ReportGenerator';