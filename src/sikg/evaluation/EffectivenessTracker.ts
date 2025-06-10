// EffectivenessTracker.ts - Test effectiveness tracking for Python projects

import { Logger } from '../../utils/Logger';
import { TestExecution, PerformanceMetrics } from './MetricsCollector';
import { APFDResult } from './APFDCalculator';

/**
 * Tracks test selection effectiveness over time for Python projects
 * Monitors trends and provides insights for SIKG improvement
 */
export class EffectivenessTracker {
    private effectivenessHistory: EffectivenessSnapshot[] = [];
    private testTrends: Map<string, TestTrend> = new Map();
    private readonly maxHistorySize = 50; // Keep last 50 snapshots

    /**
     * Record effectiveness snapshot for current test execution
     */
    public recordEffectiveness(
        testExecutions: TestExecution[],
        metrics: PerformanceMetrics,
        apfdResult: APFDResult,
        timestamp: Date = new Date()
    ): void {
        try {
            const snapshot: EffectivenessSnapshot = {
                timestamp,
                apfd: apfdResult.apfd,
                faultDetectionRate: apfdResult.faultDetectionRate,
                selectionAccuracy: metrics.selectionAccuracy,
                reductionRatio: metrics.reductionRatio,
                averageExecutionTime: metrics.averageTestTime,
                totalTests: metrics.totalTests,
                selectedTests: metrics.selectedTests,
                faultsDetected: metrics.faultsDetected,
                pythonFilesAnalyzed: metrics.pythonFilesAnalyzed,
                sessionId: this.generateSessionId(timestamp)
            };

            this.effectivenessHistory.push(snapshot);

            // Maintain history size limit
            if (this.effectivenessHistory.length > this.maxHistorySize) {
                this.effectivenessHistory.shift();
            }

            // Update individual test trends
            this.updateTestTrends(testExecutions);

            Logger.debug(`Effectiveness recorded: APFD=${snapshot.apfd.toFixed(3)}, Accuracy=${snapshot.selectionAccuracy.toFixed(3)}`);

        } catch (error) {
            Logger.error('Error recording effectiveness:', error);
        }
    }

    /**
     * Get effectiveness trends over time
     */
    public getEffectivenessTrends(): EffectivenessTrends {
        try {
            if (this.effectivenessHistory.length < 2) {
                return this.createEmptyTrends();
            }

            const recent = this.effectivenessHistory.slice(-10); // Last 10 snapshots
            const older = this.effectivenessHistory.slice(0, -10);

            return {
                overall: this.calculateTrendDirection(this.effectivenessHistory),
                recent: this.calculateTrendDirection(recent),
                apfdTrend: this.calculateMetricTrend('apfd'),
                accuracyTrend: this.calculateMetricTrend('selectionAccuracy'),
                reductionTrend: this.calculateMetricTrend('reductionRatio'),
                executionTimeTrend: this.calculateMetricTrend('averageExecutionTime'),
                improvementRate: this.calculateImprovementRate(),
                consistency: this.calculateConsistency(),
                recommendations: this.generateRecommendations()
            };

        } catch (error) {
            Logger.error('Error calculating effectiveness trends:', error);
            return this.createEmptyTrends();
        }
    }

    /**
     * Get Python-specific effectiveness insights
     */
    public getPythonEffectivenessInsights(): PythonEffectivenessInsights {
        try {
            const testTrends = Array.from(this.testTrends.values());
            
            // Analyze Python test patterns
            const pytestTests = testTrends.filter(trend => trend.testId.includes('test_'));
            const unittestTests = testTrends.filter(trend => 
                trend.testId.includes('Test') || trend.testId.includes('unittest')
            );

            const mostEffectiveTests = testTrends
                .filter(trend => trend.faultDetectionRate > 0.1)
                .sort((a, b) => b.faultDetectionRate - a.faultDetectionRate)
                .slice(0, 10);

            const leastEffectiveTests = testTrends
                .filter(trend => trend.executionCount > 3)
                .sort((a, b) => a.faultDetectionRate - b.faultDetectionRate)
                .slice(0, 10);

            return {
                pytestEffectiveness: this.calculateFrameworkEffectiveness(pytestTests),
                unittestEffectiveness: this.calculateFrameworkEffectiveness(unittestTests),
                mostEffectiveTests: mostEffectiveTests.map(t => ({
                    testId: t.testId,
                    faultDetectionRate: t.faultDetectionRate,
                    averageExecutionTime: t.averageExecutionTime
                })),
                leastEffectiveTests: leastEffectiveTests.map(t => ({
                    testId: t.testId,
                    faultDetectionRate: t.faultDetectionRate,
                    averageExecutionTime: t.averageExecutionTime
                })),
                testDistribution: {
                    pytest: pytestTests.length,
                    unittest: unittestTests.length,
                    other: testTrends.length - pytestTests.length - unittestTests.length
                },
                recommendations: this.generatePythonRecommendations(testTrends)
            };

        } catch (error) {
            Logger.error('Error calculating Python effectiveness insights:', error);
            return {
                pytestEffectiveness: 0,
                unittestEffectiveness: 0,
                mostEffectiveTests: [],
                leastEffectiveTests: [],
                testDistribution: { pytest: 0, unittest: 0, other: 0 },
                recommendations: []
            };
        }
    }

    /**
     * Get effectiveness comparison between time periods
     */
    public getEffectivenessComparison(daysBack: number = 7): EffectivenessComparison {
        try {
            const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
            
            const recent = this.effectivenessHistory.filter(s => s.timestamp >= cutoffDate);
            const older = this.effectivenessHistory.filter(s => s.timestamp < cutoffDate);

            if (recent.length === 0 || older.length === 0) {
                return {
                    recentPeriod: this.calculatePeriodStats(recent),
                    olderPeriod: this.calculatePeriodStats(older),
                    improvement: {
                        apfd: 0,
                        accuracy: 0,
                        reduction: 0,
                        executionTime: 0
                    },
                    significance: 'insufficient-data'
                };
            }

            const recentStats = this.calculatePeriodStats(recent);
            const olderStats = this.calculatePeriodStats(older);

            const improvement = {
                apfd: recentStats.averageApfd - olderStats.averageApfd,
                accuracy: recentStats.averageAccuracy - olderStats.averageAccuracy,
                reduction: recentStats.averageReduction - olderStats.averageReduction,
                executionTime: olderStats.averageExecutionTime - recentStats.averageExecutionTime // Improvement is reduction in time
            };

            return {
                recentPeriod: recentStats,
                olderPeriod: olderStats,
                improvement,
                significance: this.assessSignificance(improvement)
            };

        } catch (error) {
            Logger.error('Error calculating effectiveness comparison:', error);
            return {
                recentPeriod: { averageApfd: 0, averageAccuracy: 0, averageReduction: 0, averageExecutionTime: 0, sampleSize: 0 },
                olderPeriod: { averageApfd: 0, averageAccuracy: 0, averageReduction: 0, averageExecutionTime: 0, sampleSize: 0 },
                improvement: { apfd: 0, accuracy: 0, reduction: 0, executionTime: 0 },
                significance: 'insufficient-data'
            };
        }
    }

    /**
     * Update individual test trends
     */
    private updateTestTrends(testExecutions: TestExecution[]): void {
        for (const execution of testExecutions) {
            const existing = this.testTrends.get(execution.testId);
            
            if (existing) {
                existing.executionCount++;
                existing.totalExecutionTime += execution.executionTime;
                existing.averageExecutionTime = existing.totalExecutionTime / existing.executionCount;
                
                if (execution.wasFaultDetected) {
                    existing.faultsDetected++;
                }
                
                existing.faultDetectionRate = existing.faultsDetected / existing.executionCount;
                existing.lastExecution = execution.timestamp;
            } else {
                this.testTrends.set(execution.testId, {
                    testId: execution.testId,
                    executionCount: 1,
                    faultsDetected: execution.wasFaultDetected ? 1 : 0,
                    faultDetectionRate: execution.wasFaultDetected ? 1 : 0,
                    totalExecutionTime: execution.executionTime,
                    averageExecutionTime: execution.executionTime,
                    firstExecution: execution.timestamp,
                    lastExecution: execution.timestamp
                });
            }
        }
    }

    /**
     * Calculate trend direction for a list of snapshots
     */
    private calculateTrendDirection(snapshots: EffectivenessSnapshot[]): TrendDirection {
        if (snapshots.length < 2) return 'stable';
        
        const first = snapshots[0];
        const last = snapshots[snapshots.length - 1];
        
        // Use APFD as primary indicator
        const change = last.apfd - first.apfd;
        
        if (change > 0.05) return 'improving';
        if (change < -0.05) return 'declining';
        return 'stable';
    }

    /**
     * Calculate trend for a specific metric
     */
    private calculateMetricTrend(metric: keyof EffectivenessSnapshot): number {
        if (this.effectivenessHistory.length < 2) return 0;
        
        const values = this.effectivenessHistory.map(s => s[metric] as number);
        const first = values[0];
        const last = values[values.length - 1];
        
        return last - first;
    }

    /**
     * Calculate improvement rate over time
     */
    private calculateImprovementRate(): number {
        if (this.effectivenessHistory.length < 3) return 0;
        
        const recent = this.effectivenessHistory.slice(-5);
        const older = this.effectivenessHistory.slice(0, 5);
        
        const recentAvg = recent.reduce((sum, s) => sum + s.apfd, 0) / recent.length;
        const olderAvg = older.reduce((sum, s) => sum + s.apfd, 0) / older.length;
        
        return recentAvg - olderAvg;
    }

    /**
     * Calculate consistency score
     */
    private calculateConsistency(): number {
        if (this.effectivenessHistory.length < 3) return 0;
        
        const apfdValues = this.effectivenessHistory.map(s => s.apfd);
        const mean = apfdValues.reduce((sum, val) => sum + val, 0) / apfdValues.length;
        const variance = apfdValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / apfdValues.length;
        const standardDeviation = Math.sqrt(variance);
        
        // Consistency is inverse of coefficient of variation
        return mean > 0 ? 1 - (standardDeviation / mean) : 0;
    }

    /**
     * Generate recommendations based on trends
     */
    private generateRecommendations(): string[] {
        const recommendations: string[] = [];
        
        if (this.effectivenessHistory.length < 3) {
            recommendations.push('Collect more data for meaningful analysis');
            return recommendations;
        }
        
        const latest = this.effectivenessHistory[this.effectivenessHistory.length - 1];
        
        if (latest.apfd < 0.7) {
            recommendations.push('APFD is below 70% - consider improving test prioritization');
        }
        
        if (latest.selectionAccuracy < 0.6) {
            recommendations.push('Selection accuracy is low - review impact prediction model');
        }
        
        if (latest.reductionRatio < 0.3) {
            recommendations.push('Test reduction is minimal - consider stricter selection criteria');
        }
        
        if (this.calculateConsistency() < 0.7) {
            recommendations.push('Results are inconsistent - stabilize the selection algorithm');
        }
        
        return recommendations;
    }

    /**
     * Generate Python-specific recommendations
     */
    private generatePythonRecommendations(testTrends: TestTrend[]): string[] {
        const recommendations: string[] = [];
        
        const ineffectiveTests = testTrends.filter(t => 
            t.executionCount > 5 && t.faultDetectionRate === 0
        );
        
        if (ineffectiveTests.length > 0) {
            recommendations.push(`${ineffectiveTests.length} tests never found faults - consider reviewing their relevance`);
        }
        
        const slowTests = testTrends.filter(t => t.averageExecutionTime > 5000); // > 5 seconds
        if (slowTests.length > 0) {
            recommendations.push(`${slowTests.length} tests are slow (>5s) - consider optimization`);
        }
        
        return recommendations;
    }

    /**
     * Calculate framework effectiveness
     */
    private calculateFrameworkEffectiveness(tests: TestTrend[]): number {
        if (tests.length === 0) return 0;
        
        const totalExecutions = tests.reduce((sum, t) => sum + t.executionCount, 0);
        const totalFaults = tests.reduce((sum, t) => sum + t.faultsDetected, 0);
        
        return totalExecutions > 0 ? totalFaults / totalExecutions : 0;
    }

    /**
     * Calculate period statistics
     */
    private calculatePeriodStats(snapshots: EffectivenessSnapshot[]): PeriodStats {
        if (snapshots.length === 0) {
            return {
                averageApfd: 0,
                averageAccuracy: 0,
                averageReduction: 0,
                averageExecutionTime: 0,
                sampleSize: 0
            };
        }
        
        return {
            averageApfd: snapshots.reduce((sum, s) => sum + s.apfd, 0) / snapshots.length,
            averageAccuracy: snapshots.reduce((sum, s) => sum + s.selectionAccuracy, 0) / snapshots.length,
            averageReduction: snapshots.reduce((sum, s) => sum + s.reductionRatio, 0) / snapshots.length,
            averageExecutionTime: snapshots.reduce((sum, s) => sum + s.averageExecutionTime, 0) / snapshots.length,
            sampleSize: snapshots.length
        };
    }

    /**
     * Assess statistical significance of improvements
     */
    private assessSignificance(improvement: { apfd: number; accuracy: number; reduction: number; executionTime: number }): SignificanceLevel {
        const significantChanges = Object.values(improvement).filter(change => Math.abs(change) > 0.05).length;
        
        if (significantChanges >= 3) return 'high';
        if (significantChanges >= 2) return 'medium';
        if (significantChanges >= 1) return 'low';
        return 'none';
    }

    /**
     * Create empty trends for error cases
     */
    private createEmptyTrends(): EffectivenessTrends {
        return {
            overall: 'stable',
            recent: 'stable',
            apfdTrend: 0,
            accuracyTrend: 0,
            reductionTrend: 0,
            executionTimeTrend: 0,
            improvementRate: 0,
            consistency: 0,
            recommendations: ['Insufficient data for analysis']
        };
    }

    /**
     * Generate session ID based on timestamp
     */
    private generateSessionId(timestamp: Date): string {
        return `session_${timestamp.getFullYear()}_${timestamp.getMonth() + 1}_${timestamp.getDate()}_${Math.floor(timestamp.getTime() / 1000)}`;
    }

    /**
     * Get effectiveness history
     */
    public getEffectivenessHistory(limit?: number): EffectivenessSnapshot[] {
        if (limit) {
            return this.effectivenessHistory.slice(-limit);
        }
        return [...this.effectivenessHistory];
    }

    /**
     * Clear effectiveness history
     */
    public clearHistory(): void {
        this.effectivenessHistory = [];
        this.testTrends.clear();
        Logger.info('Effectiveness history cleared');
    }

    /**
     * Export effectiveness data
     */
    public exportEffectivenessData(): string {
        const exportData = {
            history: this.effectivenessHistory,
            trends: Array.from(this.testTrends.entries()),
            summary: this.getEffectivenessTrends(),
            exportTime: new Date().toISOString()
        };
        
        return JSON.stringify(exportData, null, 2);
    }

    /**
     * Clean up resources
     */
    public dispose(): void {
        this.effectivenessHistory = [];
        this.testTrends.clear();
        Logger.debug('Effectiveness tracker disposed');
    }
}

// Interfaces for effectiveness tracking
export interface EffectivenessSnapshot {
    timestamp: Date;
    apfd: number;
    faultDetectionRate: number;
    selectionAccuracy: number;
    reductionRatio: number;
    averageExecutionTime: number;
    totalTests: number;
    selectedTests: number;
    faultsDetected: number;
    pythonFilesAnalyzed: number;
    sessionId: string;
}

export interface TestTrend {
    testId: string;
    executionCount: number;
    faultsDetected: number;
    faultDetectionRate: number;
    totalExecutionTime: number;
    averageExecutionTime: number;
    firstExecution: Date;
    lastExecution: Date;
}

export type TrendDirection = 'improving' | 'declining' | 'stable';
export type SignificanceLevel = 'high' | 'medium' | 'low' | 'none' | 'insufficient-data';

export interface EffectivenessTrends {
    overall: TrendDirection;
    recent: TrendDirection;
    apfdTrend: number;
    accuracyTrend: number;
    reductionTrend: number;
    executionTimeTrend: number;
    improvementRate: number;
    consistency: number;
    recommendations: string[];
}

export interface PythonEffectivenessInsights {
    pytestEffectiveness: number;
    unittestEffectiveness: number;
    mostEffectiveTests: Array<{
        testId: string;
        faultDetectionRate: number;
        averageExecutionTime: number;
    }>;
    leastEffectiveTests: Array<{
        testId: string;
        faultDetectionRate: number;
        averageExecutionTime: number;
    }>;
    testDistribution: {
        pytest: number;
        unittest: number;
        other: number;
    };
    recommendations: string[];
}

export interface EffectivenessComparison {
    recentPeriod: PeriodStats;
    olderPeriod: PeriodStats;
    improvement: {
        apfd: number;
        accuracy: number;
        reduction: number;
        executionTime: number;
    };
    significance: SignificanceLevel;
}

export interface PeriodStats {
    averageApfd: number;
    averageAccuracy: number;
    averageReduction: number;
    averageExecutionTime: number;
    sampleSize: number;
}