// FeedbackProcessor.ts - Test result feedback processing for SIKG

import { TestResult, TestImpact } from '../GraphTypes';
import { MDPAction, MDPReward, MDPState } from './MDPFramework';
import { Logger } from '../../utils/Logger';

/**
 * Processed feedback data structure
 */
export interface ProcessedFeedback {
    sessionId: string;
    timestamp: number;
    testResults: TestResult[];
    predictedImpacts: Record<string, number>;
    actualOutcomes: Record<string, number>;
    predictionErrors: PredictionErrorAnalysis[];
    performanceMetrics: SessionPerformanceMetrics;
    learningSignals: LearningSignal[];
}

/**
 * Prediction error analysis
 */
export interface PredictionErrorAnalysis {
    testId: string;
    predictedImpact: number;
    actualOutcome: number;
    predictionError: number;
    errorType: 'FALSE_POSITIVE' | 'FALSE_NEGATIVE' | 'ACCURATE' | 'INCONCLUSIVE';
    confidence: number;
    contributingFactors: string[];
}

/**
 * Performance metrics for a test session
 */
export interface SessionPerformanceMetrics {
    totalTests: number;
    selectedTests: number;
    executedTests: number;
    passedTests: number;
    failedTests: number;
    skippedTests: number;
    faultDetectionRate: number;
    precision: number;
    recall: number;
    f1Score: number;
    executionTimeMs: number;
    selectionAccuracy: number;
}

/**
 * Learning signal for RL adaptation
 */
export interface LearningSignal {
    signalType: 'WEIGHT_UPDATE' | 'POLICY_ADJUSTMENT' | 'THRESHOLD_CHANGE';
    strength: number; // 0-1 indicating signal strength
    direction: 'INCREASE' | 'DECREASE' | 'MAINTAIN';
    targetComponent: string; // Edge ID, policy ID, or parameter name
    reason: string;
    confidence: number;
}

/**
 * Feedback processing configuration
 */
export interface FeedbackConfig {
    minConfidenceThreshold: number;
    falsePositiveWeight: number;
    falseNegativeWeight: number;
    accuracyRewardMultiplier: number;
    maxLearningSignalsPerSession: number;
    sessionTimeoutMs: number;
}

/**
 * Test execution session tracking
 */
export interface TestSession {
    sessionId: string;
    startTime: number;
    endTime: number | null;
    state: MDPState;
    action: MDPAction;
    testResults: TestResult[];
    predictedImpacts: Record<string, TestImpact>;
    isCompleted: boolean;
}

/**
 * Feedback processor for analyzing test execution results and generating learning signals
 */
export class FeedbackProcessor {
    private config: FeedbackConfig;
    private activeSessions: Map<string, TestSession> = new Map();
    private completedSessions: ProcessedFeedback[] = [];
    private sessionCounter: number = 0;

    constructor(config?: Partial<FeedbackConfig>) {
        this.config = {
            minConfidenceThreshold: 0.6,
            falsePositiveWeight: 0.3,
            falseNegativeWeight: 0.7, // Weight false negatives more heavily
            accuracyRewardMultiplier: 1.2,
            maxLearningSignalsPerSession: 10,
            sessionTimeoutMs: 30 * 60 * 1000, // 30 minutes
            ...config
        };
    }

    /**
     * Start a new test execution session
     */
    public startSession(
        state: MDPState,
        action: MDPAction,
        predictedImpacts: Record<string, TestImpact>
    ): string {
        const sessionId = `session_${++this.sessionCounter}_${Date.now()}`;
        
        const session: TestSession = {
            sessionId,
            startTime: Date.now(),
            endTime: null,
            state,
            action,
            testResults: [],
            predictedImpacts,
            isCompleted: false
        };

        this.activeSessions.set(sessionId, session);
        
        // Cleanup old sessions
        this.cleanupExpiredSessions();
        
        Logger.info(`Started test session: ${sessionId} with ${action.selectedTests.length} selected tests`);
        return sessionId;
    }

    /**
     * Process test results for an active session
     */
    public processTestResults(sessionId: string, testResults: TestResult[]): ProcessedFeedback | null {
        const session = this.activeSessions.get(sessionId);
        if (!session) {
            Logger.warn(`Session not found: ${sessionId}`);
            return null;
        }

        // Update session with results
        session.testResults = testResults;
        session.endTime = Date.now();
        session.isCompleted = true;

        // Process the feedback
        const feedback = this.generateProcessedFeedback(session);
        
        // Move to completed sessions
        this.completedSessions.push(feedback);
        this.activeSessions.delete(sessionId);

        // Limit completed sessions history
        if (this.completedSessions.length > 100) {
            this.completedSessions.splice(0, this.completedSessions.length - 100);
        }

        Logger.info(`Processed feedback for session: ${sessionId}, F1: ${feedback.performanceMetrics.f1Score.toFixed(3)}`);
        return feedback;
    }

    /**
     * Generate comprehensive feedback analysis
     */
    private generateProcessedFeedback(session: TestSession): ProcessedFeedback {
        // Convert predicted impacts to simple number mapping
        const predictedImpacts: Record<string, number> = {};
        for (const [testId, impact] of Object.entries(session.predictedImpacts)) {
            predictedImpacts[testId] = impact.impactScore;
        }

        // Convert test results to actual outcomes
        const actualOutcomes: Record<string, number> = {};
        for (const result of session.testResults) {
            actualOutcomes[result.testId] = this.convertResultToOutcome(result);
        }

        // Analyze prediction errors
        const predictionErrors = this.analyzePredictionErrors(
            predictedImpacts,
            actualOutcomes,
            session.action
        );

        // Calculate performance metrics
        const performanceMetrics = this.calculatePerformanceMetrics(
            session.testResults,
            session.action,
            predictedImpacts
        );

        // Generate learning signals
        const learningSignals = this.generateLearningSignals(
            predictionErrors,
            performanceMetrics,
            session
        );

        return {
            sessionId: session.sessionId,
            timestamp: session.endTime!,
            testResults: session.testResults,
            predictedImpacts,
            actualOutcomes,
            predictionErrors,
            performanceMetrics,
            learningSignals
        };
    }

    /**
     * Analyze prediction errors for learning
     */
    private analyzePredictionErrors(
        predicted: Record<string, number>,
        actual: Record<string, number>,
        action: MDPAction
    ): PredictionErrorAnalysis[] {
        const errors: PredictionErrorAnalysis[] = [];
        const selectedTestSet = new Set(action.selectedTests);

        // Analyze all tests that have both predicted and actual values
        for (const testId of Object.keys(predicted)) {
            if (!(testId in actual)) continue;

            const predictedValue = predicted[testId];
            const actualValue = actual[testId];
            const error = predictedValue - actualValue;
            
            // Determine error type
            let errorType: PredictionErrorAnalysis['errorType'];
            const wasSelected = selectedTestSet.has(testId);
            const shouldHaveBeenSelected = actualValue > 0.5; // Failed test
            
            if (wasSelected && shouldHaveBeenSelected) {
                errorType = 'ACCURATE'; // True positive
            } else if (wasSelected && !shouldHaveBeenSelected) {
                errorType = 'FALSE_POSITIVE'; // Selected but passed
            } else if (!wasSelected && shouldHaveBeenSelected) {
                errorType = 'FALSE_NEGATIVE'; // Not selected but failed
            } else if (actualValue === 0.5) {
                errorType = 'INCONCLUSIVE'; // Skipped or timeout
            } else {
                errorType = 'ACCURATE'; // True negative
            }

            // Calculate confidence based on prediction strength
            const confidence = this.calculatePredictionConfidence(predictedValue, actualValue);

            // Identify contributing factors
            const contributingFactors = this.identifyContributingFactors(testId, error, action);

            errors.push({
                testId,
                predictedImpact: predictedValue,
                actualOutcome: actualValue,
                predictionError: error,
                errorType,
                confidence,
                contributingFactors
            });
        }

        return errors;
    }

    /**
     * Calculate comprehensive performance metrics
     */
    private calculatePerformanceMetrics(
        testResults: TestResult[],
        action: MDPAction,
        predicted: Record<string, number>
    ): SessionPerformanceMetrics {
        const totalTests = Object.keys(predicted).length;
        const selectedTests = action.selectedTests.length;
        const executedTests = testResults.length;
        
        const passedTests = testResults.filter(r => r.status === 'passed').length;
        const failedTests = testResults.filter(r => r.status === 'failed').length;
        const skippedTests = testResults.filter(r => r.status === 'skipped').length;
        
        const executionTimeMs = testResults.reduce((sum, r) => sum + r.executionTime, 0);
        
        // Calculate selection accuracy metrics
        const selectedTestSet = new Set(action.selectedTests);
        const failedTestSet = new Set(testResults.filter(r => r.status === 'failed').map(r => r.testId));
        
        // True positives: selected tests that failed
        const truePositives = testResults.filter(r => 
            selectedTestSet.has(r.testId) && failedTestSet.has(r.testId)
        ).length;
        
        // False positives: selected tests that passed
        const falsePositives = testResults.filter(r => 
            selectedTestSet.has(r.testId) && !failedTestSet.has(r.testId)
        ).length;
        
        // False negatives: non-selected tests that failed (approximate from all tests)
        const falseNegatives = Math.max(0, failedTests - truePositives);
        
        // Calculate metrics
        const precision = truePositives / Math.max(1, truePositives + falsePositives);
        const recall = truePositives / Math.max(1, truePositives + falseNegatives);
        const f1Score = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;
        
        const faultDetectionRate = failedTests / Math.max(1, executedTests);
        const selectionAccuracy = truePositives / Math.max(1, selectedTests);

        return {
            totalTests,
            selectedTests,
            executedTests,
            passedTests,
            failedTests,
            skippedTests,
            faultDetectionRate,
            precision,
            recall,
            f1Score,
            executionTimeMs,
            selectionAccuracy
        };
    }

    /**
     * Generate learning signals for RL adaptation
     */
    private generateLearningSignals(
        errors: PredictionErrorAnalysis[],
        metrics: SessionPerformanceMetrics,
        session: TestSession
    ): LearningSignal[] {
        const signals: LearningSignal[] = [];

        // Signal 1: Overall performance-based policy adjustment
        if (metrics.f1Score < 0.6) {
            signals.push({
                signalType: 'POLICY_ADJUSTMENT',
                strength: 1.0 - metrics.f1Score,
                direction: 'INCREASE',
                targetComponent: 'selection_sensitivity',
                reason: `Low F1 score (${metrics.f1Score.toFixed(3)}) indicates need for policy adjustment`,
                confidence: 0.8
            });
        }

        // Signal 2: Threshold adjustment based on precision/recall balance
        if (metrics.precision < 0.5 && metrics.recall > 0.8) {
            signals.push({
                signalType: 'THRESHOLD_CHANGE',
                strength: 0.8,
                direction: 'INCREASE',
                targetComponent: 'selection_threshold',
                reason: 'Low precision with high recall suggests threshold too low',
                confidence: 0.7
            });
        } else if (metrics.recall < 0.5 && metrics.precision > 0.8) {
            signals.push({
                signalType: 'THRESHOLD_CHANGE',
                strength: 0.8,
                direction: 'DECREASE',
                targetComponent: 'selection_threshold',
                reason: 'Low recall with high precision suggests threshold too high',
                confidence: 0.7
            });
        }

        // Signal 3: Weight updates for significant prediction errors
        const significantErrors = errors.filter(e => 
            Math.abs(e.predictionError) > 0.3 && e.confidence > this.config.minConfidenceThreshold
        );

        for (const error of significantErrors.slice(0, 5)) { // Limit to top 5 errors
            const strength = Math.min(1.0, Math.abs(error.predictionError));
            const direction = error.errorType === 'FALSE_POSITIVE' ? 'DECREASE' : 'INCREASE';
            
            signals.push({
                signalType: 'WEIGHT_UPDATE',
                strength,
                direction,
                targetComponent: error.testId,
                reason: `${error.errorType} with error ${error.predictionError.toFixed(3)}`,
                confidence: error.confidence
            });
        }

        // Signal 4: Fault detection rate feedback
        if (metrics.faultDetectionRate > 0.1) { // Good fault detection
            signals.push({
                signalType: 'POLICY_ADJUSTMENT',
                strength: metrics.faultDetectionRate,
                direction: 'MAINTAIN',
                targetComponent: 'current_policy',
                reason: `Good fault detection rate (${metrics.faultDetectionRate.toFixed(3)})`,
                confidence: 0.9
            });
        }

        // Limit signals per session
        return signals.slice(0, this.config.maxLearningSignalsPerSession);
    }

    /**
     * Convert test result to outcome value (0-1)
     */
    private convertResultToOutcome(result: TestResult): number {
        switch (result.status) {
            case 'failed': return 1.0;
            case 'passed': return 0.0;
            case 'skipped': return 0.5;
            default: return 0.5;
        }
    }

    /**
     * Calculate prediction confidence
     */
    private calculatePredictionConfidence(predicted: number, actual: number): number {
        const error = Math.abs(predicted - actual);
        return Math.max(0, 1 - (error * 2)); // Higher confidence for smaller errors
    }

    /**
     * Identify factors that may have contributed to prediction errors
     */
    private identifyContributingFactors(testId: string, error: number, action: MDPAction): string[] {
        const factors: string[] = [];

        // Analyze based on error magnitude and direction
        if (Math.abs(error) > 0.5) {
            factors.push('large_prediction_error');
        }

        if (error > 0) {
            factors.push('over_prediction');
        } else if (error < 0) {
            factors.push('under_prediction');
        }

        // Check if test was in high-confidence selections
        const testIndex = action.selectedTests.indexOf(testId);
        if (testIndex >= 0 && testIndex < action.selectedTests.length * 0.2) {
            factors.push('high_priority_selection');
        }

        // Check confidence level
        if (action.confidence < 0.5) {
            factors.push('low_action_confidence');
        }

        return factors;
    }

    /**
     * Clean up expired sessions
     */
    private cleanupExpiredSessions(): void {
        const now = Date.now();
        const expiredSessions: string[] = [];

        for (const [sessionId, session] of this.activeSessions) {
            if (now - session.startTime > this.config.sessionTimeoutMs) {
                expiredSessions.push(sessionId);
            }
        }

        for (const sessionId of expiredSessions) {
            this.activeSessions.delete(sessionId);
            Logger.warn(`Cleaned up expired session: ${sessionId}`);
        }
    }

    /**
     * Get recent feedback history
     */
    public getRecentFeedback(limit: number = 20): ProcessedFeedback[] {
        return this.completedSessions.slice(-limit);
    }

    /**
     * Get active sessions count
     */
    public getActiveSessionsCount(): number {
        return this.activeSessions.size;
    }

    /**
     * Get aggregated learning signals from recent feedback
     */
    public getAggregatedLearningSignals(windowSize: number = 10): Map<string, LearningSignal[]> {
        const recentFeedback = this.getRecentFeedback(windowSize);
        const aggregated = new Map<string, LearningSignal[]>();

        for (const feedback of recentFeedback) {
            for (const signal of feedback.learningSignals) {
                const key = `${signal.signalType}_${signal.targetComponent}`;
                if (!aggregated.has(key)) {
                    aggregated.set(key, []);
                }
                aggregated.get(key)!.push(signal);
            }
        }

        return aggregated;
    }

    /**
     * Calculate average performance metrics over recent sessions
     */
    public getAveragePerformanceMetrics(windowSize: number = 10): SessionPerformanceMetrics | null {
        const recentFeedback = this.getRecentFeedback(windowSize);
        if (recentFeedback.length === 0) return null;

        const totals = recentFeedback.reduce((acc, feedback) => {
            const metrics = feedback.performanceMetrics;
            return {
                totalTests: acc.totalTests + metrics.totalTests,
                selectedTests: acc.selectedTests + metrics.selectedTests,
                executedTests: acc.executedTests + metrics.executedTests,
                passedTests: acc.passedTests + metrics.passedTests,
                failedTests: acc.failedTests + metrics.failedTests,
                skippedTests: acc.skippedTests + metrics.skippedTests,
                faultDetectionRate: acc.faultDetectionRate + metrics.faultDetectionRate,
                precision: acc.precision + metrics.precision,
                recall: acc.recall + metrics.recall,
                f1Score: acc.f1Score + metrics.f1Score,
                executionTimeMs: acc.executionTimeMs + metrics.executionTimeMs,
                selectionAccuracy: acc.selectionAccuracy + metrics.selectionAccuracy
            };
        }, {
            totalTests: 0, selectedTests: 0, executedTests: 0, passedTests: 0,
            failedTests: 0, skippedTests: 0, faultDetectionRate: 0, precision: 0,
            recall: 0, f1Score: 0, executionTimeMs: 0, selectionAccuracy: 0
        });

        const count = recentFeedback.length;
        return {
            totalTests: Math.round(totals.totalTests / count),
            selectedTests: Math.round(totals.selectedTests / count),
            executedTests: Math.round(totals.executedTests / count),
            passedTests: Math.round(totals.passedTests / count),
            failedTests: Math.round(totals.failedTests / count),
            skippedTests: Math.round(totals.skippedTests / count),
            faultDetectionRate: totals.faultDetectionRate / count,
            precision: totals.precision / count,
            recall: totals.recall / count,
            f1Score: totals.f1Score / count,
            executionTimeMs: Math.round(totals.executionTimeMs / count),
            selectionAccuracy: totals.selectionAccuracy / count
        };
    }

    /**
     * Reset all feedback data (for testing)
     */
    public reset(): void {
        this.activeSessions.clear();
        this.completedSessions = [];
        this.sessionCounter = 0;
        Logger.info('Feedback processor reset');
    }
}