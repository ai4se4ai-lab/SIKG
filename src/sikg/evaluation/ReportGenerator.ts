// ReportGenerator.ts - Performance reporting for Python projects

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../../utils/Logger';
import { PerformanceMetrics, TestExecution } from './MetricsCollector';
import { APFDResult, APFDComparison } from './APFDCalculator';
import { EffectivenessTrends, PythonEffectivenessInsights } from './EffectivenessTracker';

/**
 * Generates comprehensive performance reports for SIKG Python test selection
 */
/**
 * Represents a point in the fault detection curve.
 */
interface FaultDetectionCurvePoint {
    testPosition: number;
    testsExecutedPercent: number;
    faultsDetectedPercent: number;
}

export class ReportGenerator {
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * Generate comprehensive SIKG performance report
     */
    public async generateReport(
        metrics: PerformanceMetrics,
        apfdResults: APFDResult,
        trends: EffectivenessTrends,
        pythonInsights: PythonEffectivenessInsights,
        testExecutions: TestExecution[]
    ): Promise<PerformanceReport> {
        try {
            const report: PerformanceReport = {
                metadata: this.generateReportMetadata(),
                summary: this.generateExecutiveSummary(metrics, apfdResults, trends),
                metrics: {
                    overview: metrics,
                    apfd: apfdResults,
                    trends,
                    pythonSpecific: pythonInsights
                },
                analysis: this.generateDetailedAnalysis(metrics, apfdResults, trends),
                recommendations: this.generateRecommendations(metrics, apfdResults, trends, pythonInsights),
                charts: this.generateChartData(testExecutions, metrics),
                rawData: {
                    testExecutions: testExecutions.slice(-100), // Last 100 executions
                    sessionMetrics: metrics.sessionMetrics
                }
            };

            Logger.info('Performance report generated successfully');
            return report;

        } catch (error) {
            Logger.error('Error generating performance report:', error);
            return this.createEmptyReport();
        }
    }

    /**
     * Generate HTML report for viewing in VS Code
     */
    public async generateHTMLReport(report: PerformanceReport): Promise<string> {
        try {
            const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SIKG Performance Report</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .report-container {
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 2.5em;
            font-weight: 300;
        }
        .header .subtitle {
            margin: 10px 0 0;
            opacity: 0.9;
            font-size: 1.1em;
        }
        .content {
            padding: 30px;
        }
        .section {
            margin-bottom: 40px;
            padding: 20px;
            border: 1px solid #e1e1e1;
            border-radius: 6px;
            background: #fafafa;
        }
        .section h2 {
            color: #667eea;
            border-bottom: 2px solid #667eea;
            padding-bottom: 10px;
            margin-top: 0;
        }
        .metric-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin: 20px 0;
        }
        .metric-card {
            background: white;
            padding: 20px;
            border-radius: 6px;
            border-left: 4px solid #667eea;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .metric-value {
            font-size: 2em;
            font-weight: bold;
            color: #667eea;
            margin-bottom: 5px;
        }
        .metric-label {
            color: #666;
            font-size: 0.9em;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .trend-indicator {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 0.8em;
            font-weight: bold;
            margin-left: 10px;
        }
        .trend-improving { background: #d4edda; color: #155724; }
        .trend-stable { background: #fff3cd; color: #856404; }
        .trend-declining { background: #f8d7da; color: #721c24; }
        .recommendations {
            background: #e3f2fd;
            border-left: 4px solid #2196f3;
            padding: 20px;
            margin: 20px 0;
        }
        .recommendations h3 {
            color: #1976d2;
            margin-top: 0;
        }
        .recommendations ul {
            margin: 0;
            padding-left: 20px;
        }
        .recommendations li {
            margin-bottom: 8px;
        }
        .chart-placeholder {
            height: 300px;
            background: #f0f0f0;
            border: 2px dashed #ccc;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 20px 0;
            border-radius: 6px;
        }
        .data-table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        .data-table th,
        .data-table td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }
        .data-table th {
            background: #f5f5f5;
            font-weight: 600;
            color: #333;
        }
        .data-table tr:hover {
            background: #f9f9f9;
        }
        .status-passed { color: #28a745; font-weight: bold; }
        .status-failed { color: #dc3545; font-weight: bold; }
        .status-skipped { color: #ffc107; font-weight: bold; }
        .footer {
            text-align: center;
            padding: 20px;
            color: #666;
            border-top: 1px solid #e1e1e1;
            background: #f9f9f9;
        }
    </style>
</head>
<body>
    <div class="report-container">
        <div class="header">
            <h1>SIKG Performance Report</h1>
            <div class="subtitle">Python Test Selection Analysis • Generated ${report.metadata.generatedAt}</div>
        </div>
        
        <div class="content">
            ${this.generateSummarySection(report)}
            ${this.generateMetricsSection(report)}
            ${this.generateTrendsSection(report)}
            ${this.generatePythonInsightsSection(report)}
            ${this.generateRecommendationsSection(report)}
            ${this.generateChartsSection(report)}
            ${this.generateDetailedDataSection(report)}
        </div>
        
        <div class="footer">
            <p>Report generated by SIKG Extension v${report.metadata.version}</p>
            <p>Session: ${report.rawData.sessionMetrics.startTime} - ${report.metadata.generatedAt}</p>
        </div>
    </div>
</body>
</html>`;

            return html;

        } catch (error) {
            Logger.error('Error generating HTML report:', error);
            return this.createErrorHTML();
        }
    }

    /**
     * Save report to file
     */
    public async saveReport(report: PerformanceReport, format: 'json' | 'html' = 'json'): Promise<string | null> {
        try {
            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                Logger.warn('No workspace folder for saving report');
                return null;
            }

            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            const reportsDir = path.join(workspaceRoot, '.sikg', 'reports');
            
            // Create reports directory if it doesn't exist
            if (!fs.existsSync(reportsDir)) {
                fs.mkdirSync(reportsDir, { recursive: true });
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `sikg-report-${timestamp}.${format}`;
            const filePath = path.join(reportsDir, filename);

            if (format === 'json') {
                fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
            } else {
                const html = await this.generateHTMLReport(report);
                fs.writeFileSync(filePath, html);
            }

            Logger.info(`Report saved to: ${filePath}`);
            return filePath;

        } catch (error) {
            Logger.error('Error saving report:', error);
            return null;
        }
    }

    /**
     * Generate report metadata
     */
    private generateReportMetadata(): ReportMetadata {
        return {
            generatedAt: new Date().toISOString(),
            version: '1.0.0',
            pythonVersion: 'Unknown',
            workspaceName: vscode.workspace.name || 'Unknown',
            reportId: `report_${Date.now()}`
        };
    }

    /**
     * Generate executive summary
     */
    private generateExecutiveSummary(
        metrics: PerformanceMetrics,
        apfd: APFDResult,
        trends: EffectivenessTrends
    ): ExecutiveSummary {
        const efficiency = metrics.reductionRatio;
        const effectiveness = apfd.apfd;
        const accuracy = metrics.selectionAccuracy;

        let overallGrade: 'A' | 'B' | 'C' | 'D' | 'F';
        const score = (efficiency + effectiveness + accuracy) / 3;
        
        if (score >= 0.9) overallGrade = 'A';
        else if (score >= 0.8) overallGrade = 'B';
        else if (score >= 0.7) overallGrade = 'C';
        else if (score >= 0.6) overallGrade = 'D';
        else overallGrade = 'F';

        return {
            overallGrade,
            keyFindings: [
                `Test selection reduced test suite by ${(efficiency * 100).toFixed(1)}%`,
                `Fault detection effectiveness (APFD): ${(effectiveness * 100).toFixed(1)}%`,
                `Selection accuracy: ${(accuracy * 100).toFixed(1)}%`,
                `Trend: ${trends.overall} performance over time`
            ],
            performanceScore: score,
            testSelectionEfficiency: efficiency,
            faultDetectionEffectiveness: effectiveness
        };
    }

    /**
     * Generate detailed analysis
     */
    private generateDetailedAnalysis(
        metrics: PerformanceMetrics,
        apfd: APFDResult,
        trends: EffectivenessTrends
    ): DetailedAnalysis {
        return {
            testSelectionAnalysis: {
                totalTestsInSuite: metrics.totalTests,
                testsSelected: metrics.selectedTests,
                reductionAchieved: metrics.reductionRatio,
                selectionCriteria: 'Semantic impact analysis with knowledge graph propagation',
                averageSelectionTime: metrics.averageTestTime
            },
            faultDetectionAnalysis: {
                apfdScore: apfd.apfd,
                faultsDetected: apfd.totalFaults,
                averageFaultPosition: apfd.averageFaultPosition,
                earlyDetectionRate: apfd.earlyDetectionRate,
                interpretation: apfd.details.interpretation
            },
            performanceTrends: {
                overallTrend: trends.overall,
                recentTrend: trends.recent,
                consistencyScore: trends.consistency,
                improvementRate: trends.improvementRate
            },
            pythonSpecificFindings: {
                filesAnalyzed: metrics.pythonFilesAnalyzed,
                testFrameworks: ['pytest', 'unittest'],
                averageExecutionTime: metrics.averageTestTime
            }
        };
    }

    /**
     * Generate recommendations
     */
    private generateRecommendations(
        metrics: PerformanceMetrics,
        apfd: APFDResult,
        trends: EffectivenessTrends,
        pythonInsights: PythonEffectivenessInsights
    ): ReportRecommendations {
        const immediate: string[] = [];
        const longTerm: string[] = [];

        // Immediate recommendations
        if (apfd.apfd < 0.7) {
            immediate.push('Improve test prioritization - APFD score is below 70%');
        }
        if (metrics.selectionAccuracy < 0.6) {
            immediate.push('Review impact prediction model - selection accuracy is low');
        }
        if (metrics.reductionRatio < 0.2) {
            immediate.push('Consider stricter selection criteria - minimal test reduction achieved');
        }

        // Long-term recommendations
        if (trends.consistency < 0.7) {
            longTerm.push('Stabilize selection algorithm for more consistent results');
        }
        if (pythonInsights.leastEffectiveTests.length > 5) {
            longTerm.push('Review and potentially remove ineffective tests from suite');
        }
        longTerm.push('Continue monitoring trends and adjust parameters based on project evolution');

        return {
            immediate,
            longTerm,
            priority: immediate.length > 0 ? 'high' : longTerm.length > 0 ? 'medium' : 'low',
            actionItems: [
                ...immediate.map(rec => ({ action: rec, priority: 'high' as const, timeframe: 'immediate' as const })),
                ...longTerm.map(rec => ({ action: rec, priority: 'medium' as const, timeframe: 'long-term' as const }))
            ]
        };
    }

    /**
     * Generate chart data for visualization
     */
    private generateChartData(testExecutions: TestExecution[], metrics: PerformanceMetrics): ChartData {
        return {
            faultDetectionCurve: this.generateFaultDetectionCurveData(testExecutions),
            executionTimeDistribution: this.generateExecutionTimeData(testExecutions),
            accuracyTrends: this.generateAccuracyTrendData(testExecutions),
            testTypeDistribution: this.generateTestTypeData(testExecutions)
        };
    }

    /**
     * Generate fault detection curve data
     */
    private generateFaultDetectionCurveData(testExecutions: TestExecution[]): FaultDetectionCurvePoint[] {
        const data: FaultDetectionCurvePoint[] = [];
        let faultsFound = 0;
        const totalFaults = testExecutions.filter(e => e.wasFaultDetected).length;

        testExecutions.forEach((execution, index) => {
            if (execution.wasFaultDetected) {
                faultsFound++;
            }

            data.push({
                testPosition: index + 1,
                testsExecutedPercent: ((index + 1) / testExecutions.length) * 100,
                faultsDetectedPercent: totalFaults > 0 ? (faultsFound / totalFaults) * 100 : 0
            });
        });

        return data;
    }

    /**
     * Generate execution time distribution data
     */
    private generateExecutionTimeData(testExecutions: TestExecution[]): any[] {
        const buckets = [
            { range: '0-100ms', min: 0, max: 100 },
            { range: '100-500ms', min: 100, max: 500 },
            { range: '500ms-2s', min: 500, max: 2000 },
            { range: '2s-10s', min: 2000, max: 10000 },
            { range: '10s+', min: 10000, max: Infinity }
        ];

        return buckets.map(bucket => ({
            range: bucket.range,
            count: testExecutions.filter(e => 
                e.executionTime >= bucket.min && e.executionTime < bucket.max
            ).length
        }));
    }

    /**
     * Generate accuracy trend data
     */
    private generateAccuracyTrendData(testExecutions: TestExecution[]): any[] {
        const windowSize = 10;
        const data = [];

        for (let i = windowSize; i <= testExecutions.length; i += windowSize) {
            const window = testExecutions.slice(i - windowSize, i);
            const correctPredictions = window.filter(e => {
                const highImpact = e.predictedImpact > 0.5;
                const faultFound = e.wasFaultDetected;
                return (highImpact && faultFound) || (!highImpact && !faultFound);
            }).length;

            data.push({
                windowEnd: i,
                accuracy: window.length > 0 ? correctPredictions / window.length : 0
            });
        }

        return data;
    }

    /**
     * Generate test type distribution data
     */
    private generateTestTypeData(testExecutions: TestExecution[]): any[] {
        const pytest = testExecutions.filter(e => e.testId.includes('test_')).length;
        const unittest = testExecutions.filter(e => 
            e.testId.includes('Test') || e.testId.includes('unittest')
        ).length;
        const other = testExecutions.length - pytest - unittest;

        return [
            { type: 'pytest', count: pytest },
            { type: 'unittest', count: unittest },
            { type: 'other', count: other }
        ];
    }

    // HTML Section Generators
    private generateSummarySection(report: PerformanceReport): string {
        const summary = report.summary;
        return `
        <div class="section">
            <h2>Executive Summary</h2>
            <div class="metric-grid">
                <div class="metric-card">
                    <div class="metric-value">${summary.overallGrade}</div>
                    <div class="metric-label">Overall Grade</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">${(summary.performanceScore * 100).toFixed(1)}%</div>
                    <div class="metric-label">Performance Score</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">${(summary.testSelectionEfficiency * 100).toFixed(1)}%</div>
                    <div class="metric-label">Selection Efficiency</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">${(summary.faultDetectionEffectiveness * 100).toFixed(1)}%</div>
                    <div class="metric-label">Fault Detection</div>
                </div>
            </div>
            <h3>Key Findings</h3>
            <ul>
                ${summary.keyFindings.map(finding => `<li>${finding}</li>`).join('')}
            </ul>
        </div>`;
    }

    private generateMetricsSection(report: PerformanceReport): string {
        const metrics = report.metrics.overview;
        const apfd = report.metrics.apfd;
        
        return `
        <div class="section">
            <h2>Performance Metrics</h2>
            <div class="metric-grid">
                <div class="metric-card">
                    <div class="metric-value">${metrics.selectedTests}/${metrics.totalTests}</div>
                    <div class="metric-label">Tests Selected</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">${apfd.apfd.toFixed(3)}</div>
                    <div class="metric-label">APFD Score</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">${metrics.faultsDetected}</div>
                    <div class="metric-label">Faults Detected</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">${(metrics.averageTestTime / 1000).toFixed(2)}s</div>
                    <div class="metric-label">Avg Execution Time</div>
                </div>
            </div>
            <p><strong>APFD Interpretation:</strong> ${apfd.details.interpretation}</p>
        </div>`;
    }

    private generateTrendsSection(report: PerformanceReport): string {
        const trends = report.metrics.trends;
        return `
        <div class="section">
            <h2>Performance Trends</h2>
            <p>Overall Trend: <span class="trend-indicator trend-${trends.overall}">${trends.overall}</span></p>
            <p>Recent Trend: <span class="trend-indicator trend-${trends.recent}">${trends.recent}</span></p>
            <p>Consistency Score: ${(trends.consistency * 100).toFixed(1)}%</p>
            <p>Improvement Rate: ${(trends.improvementRate * 100).toFixed(2)}%</p>
        </div>`;
    }

    private generatePythonInsightsSection(report: PerformanceReport): string {
        const insights = report.metrics.pythonSpecific;
        return `
        <div class="section">
            <h2>Python-Specific Insights</h2>
            <div class="metric-grid">
                <div class="metric-card">
                    <div class="metric-value">${(insights.pytestEffectiveness * 100).toFixed(1)}%</div>
                    <div class="metric-label">pytest Effectiveness</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">${(insights.unittestEffectiveness * 100).toFixed(1)}%</div>
                    <div class="metric-label">unittest Effectiveness</div>
                </div>
            </div>
            <h3>Test Distribution</h3>
            <ul>
                <li>pytest: ${insights.testDistribution.pytest} tests</li>
                <li>unittest: ${insights.testDistribution.unittest} tests</li>
                <li>other: ${insights.testDistribution.other} tests</li>
            </ul>
        </div>`;
    }

    private generateRecommendationsSection(report: PerformanceReport): string {
        const recs = report.recommendations;
        return `
        <div class="recommendations">
            <h3>Recommendations</h3>
            <h4>Immediate Actions (${recs.priority} priority)</h4>
            <ul>
                ${recs.immediate.map(rec => `<li>${rec}</li>`).join('')}
            </ul>
            <h4>Long-term Improvements</h4>
            <ul>
                ${recs.longTerm.map(rec => `<li>${rec}</li>`).join('')}
            </ul>
        </div>`;
    }

    private generateChartsSection(report: PerformanceReport): string {
        return `
        <div class="section">
            <h2>Visual Analysis</h2>
            <div class="chart-placeholder">
                Fault Detection Curve<br>
                <small>Charts would be rendered here in a full implementation</small>
            </div>
            <div class="chart-placeholder">
                Execution Time Distribution<br>
                <small>Charts would be rendered here in a full implementation</small>
            </div>
        </div>`;
    }

    private generateDetailedDataSection(report: PerformanceReport): string {
        const executions = report.rawData.testExecutions.slice(0, 20); // Show first 20
        return `
        <div class="section">
            <h2>Recent Test Executions</h2>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Test ID</th>
                        <th>Status</th>
                        <th>Execution Time</th>
                        <th>Predicted Impact</th>
                        <th>Timestamp</th>
                    </tr>
                </thead>
                <tbody>
                    ${executions.map(exec => `
                        <tr>
                            <td>${exec.testId}</td>
                            <td><span class="status-${exec.status}">${exec.status}</span></td>
                            <td>${exec.executionTime}ms</td>
                            <td>${(exec.predictedImpact * 100).toFixed(1)}%</td>
                            <td>${exec.timestamp.toISOString()}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>`;
    }

    private createEmptyReport(): PerformanceReport {
        return {
            metadata: this.generateReportMetadata(),
            summary: {
                overallGrade: 'F',
                keyFindings: ['No data available'],
                performanceScore: 0,
                testSelectionEfficiency: 0,
                faultDetectionEffectiveness: 0
            },
            metrics: {
                overview: {
                    totalTests: 0, selectedTests: 0, executedTests: 0, passedTests: 0,
                    failedTests: 0, skippedTests: 0, totalExecutionTime: 0, faultsDetected: 0,
                    selectionAccuracy: 0, reductionRatio: 0, pythonFilesAnalyzed: 0,
                    averageTestTime: 0, sessionMetrics: { startTime: '', analysisCount: 0, testRunCount: 0 }
                },
                apfd: {
                    apfd: 0, totalTests: 0, totalFaults: 0, averageFaultPosition: 0,
                    faultDetectionRate: 0, earlyDetectionRate: 0, faultPositions: [],
                    details: { sumOfPositions: 0, earlyFaults: 0, lateFaults: 0, interpretation: 'No data' }
                },
                trends: {
                    overall: 'stable', recent: 'stable', apfdTrend: 0, accuracyTrend: 0,
                    reductionTrend: 0, executionTimeTrend: 0, improvementRate: 0,
                    consistency: 0, recommendations: []
                },
                pythonSpecific: {
                    pytestEffectiveness: 0, unittestEffectiveness: 0, mostEffectiveTests: [],
                    leastEffectiveTests: [], testDistribution: { pytest: 0, unittest: 0, other: 0 },
                    recommendations: []
                }
            },
            analysis: {
                testSelectionAnalysis: { totalTestsInSuite: 0, testsSelected: 0, reductionAchieved: 0, selectionCriteria: '', averageSelectionTime: 0 },
                faultDetectionAnalysis: { apfdScore: 0, faultsDetected: 0, averageFaultPosition: 0, earlyDetectionRate: 0, interpretation: '' },
                performanceTrends: { overallTrend: 'stable', recentTrend: 'stable', consistencyScore: 0, improvementRate: 0 },
                pythonSpecificFindings: { filesAnalyzed: 0, testFrameworks: [], averageExecutionTime: 0 }
            },
            recommendations: { immediate: [], longTerm: [], priority: 'low', actionItems: [] },
            charts: { faultDetectionCurve: [], executionTimeDistribution: [], accuracyTrends: [], testTypeDistribution: [] },
            rawData: { testExecutions: [], sessionMetrics: { startTime: '', analysisCount: 0, testRunCount: 0 } }
        };
    }

    private createErrorHTML(): string {
        return `
        <!DOCTYPE html>
        <html><head><title>SIKG Report Error</title></head>
        <body><h1>Error generating report</h1><p>Please check the logs for details.</p></body>
        </html>`;
    }
}

// Interfaces for report structure
export interface PerformanceReport {
    metadata: ReportMetadata;
    summary: ExecutiveSummary;
    metrics: {
        overview: PerformanceMetrics;
        apfd: APFDResult;
        trends: EffectivenessTrends;
        pythonSpecific: PythonEffectivenessInsights;
    };
    analysis: DetailedAnalysis;
    recommendations: ReportRecommendations;
    charts: ChartData;
    rawData: {
        testExecutions: TestExecution[];
        sessionMetrics: any;
    };
}

export interface ReportMetadata {
    generatedAt: string;
    version: string;
    pythonVersion: string;
    workspaceName: string;
    reportId: string;
}

export interface ExecutiveSummary {
    overallGrade: 'A' | 'B' | 'C' | 'D' | 'F';
    keyFindings: string[];
    performanceScore: number;
    testSelectionEfficiency: number;
    faultDetectionEffectiveness: number;
}

export interface DetailedAnalysis {
    testSelectionAnalysis: {
        totalTestsInSuite: number;
        testsSelected: number;
        reductionAchieved: number;
        selectionCriteria: string;
        averageSelectionTime: number;
    };
    faultDetectionAnalysis: {
        apfdScore: number;
        faultsDetected: number;
        averageFaultPosition: number;
        earlyDetectionRate: number;
        interpretation: string;
    };
    performanceTrends: {
        overallTrend: string;
        recentTrend: string;
        consistencyScore: number;
        improvementRate: number;
    };
    pythonSpecificFindings: {
        filesAnalyzed: number;
        testFrameworks: string[];
        averageExecutionTime: number;
    };
}

export interface ReportRecommendations {
    immediate: string[];
    longTerm: string[];
    priority: 'high' | 'medium' | 'low';
    actionItems: Array<{
        action: string;
        priority: 'high' | 'medium' | 'low';
        timeframe: 'immediate' | 'short-term' | 'long-term';
    }>;
}

export interface ChartData {
    faultDetectionCurve: any[];
    executionTimeDistribution: any[];
    accuracyTrends: any[];
    testTypeDistribution: any[];
}