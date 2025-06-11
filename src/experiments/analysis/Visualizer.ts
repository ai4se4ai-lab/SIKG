// Visualizer.ts - Generate charts and visualizations for SIKG experiment results

import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../../utils/Logger';

/**
 * Chart configuration options
 */
export interface ChartConfig {
    title: string;
    width?: number;
    height?: number;
    type: ChartType;
    theme?: 'light' | 'dark';
    showLegend?: boolean;
    interactive?: boolean;
    exportFormats?: ('png' | 'svg' | 'html')[];
}

/**
 * Supported chart types
 */
export type ChartType = 
    | 'line' 
    | 'bar' 
    | 'scatter' 
    | 'box' 
    | 'heatmap' 
    | 'radar' 
    | 'violin'
    | 'comparison'
    | 'dashboard';

/**
 * Data series for charts
 */
export interface ChartSeries {
    name: string;
    data: number[];
    labels?: string[];
    color?: string;
    type?: 'line' | 'bar' | 'area';
}

/**
 * Statistical comparison data
 */
export interface StatisticalComparison {
    baseline: string;
    sikg: string;
    metric: string;
    pValue: number;
    effectSize: number;
    significant: boolean;
    improvement: number;
}

/**
 * APFD curve data point
 */
export interface APFDPoint {
    testPosition: number;
    testsExecutedPercent: number;
    faultsDetectedPercent: number;
    technique: string;
}

/**
 * Learning curve data for RL evaluation
 */
export interface LearningCurvePoint {
    iteration: number;
    performance: number;
    adaptations: number;
    stability: number;
}

/**
 * Experiment results structure
 */
export interface ExperimentResults {
    metadata: {
        timestamp: string;
        version: string;
        subjects: string[];
        iterations: number;
    };
    rq1_effectiveness: {
        apfd: Record<string, number[]>;
        faultDetection: Record<string, number[]>;
        precision: Record<string, number[]>;
        recall: Record<string, number[]>;
        f1Score: Record<string, number[]>;
    };
    rq2_efficiency: {
        testReduction: Record<string, number[]>;
        executionTime: Record<string, number[]>;
        analysisOverhead: Record<string, number[]>;
    };
    rq3_comparison: {
        techniques: string[];
        metrics: Record<string, Record<string, number[]>>;
        statistical: StatisticalComparison[];
    };
    rq4_reinforcement: {
        learningCurves: Record<string, LearningCurvePoint[]>;
        weightEvolution: Record<string, number[]>;
        adaptationHistory: any[];
    };
}

/**
 * Main visualizer class for SIKG experiment results
 */
export class Visualizer {
    private outputDir: string;
    private theme: 'light' | 'dark' = 'light';

    constructor(outputDir: string = './output/charts') {
        this.outputDir = outputDir;
        this.ensureOutputDirectory();
    }

    /**
     * Generate all visualizations for experiment results
     */
    public async generateAllVisualizations(
        results: ExperimentResults,
        outputSubdir: string = ''
    ): Promise<string[]> {
        Logger.info('Generating comprehensive experiment visualizations...');
        const generatedFiles: string[] = [];

        try {
            const targetDir = outputSubdir ? path.join(this.outputDir, outputSubdir) : this.outputDir;
            
            // Ensure target directory exists
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }

            // RQ1: Effectiveness Visualizations
            generatedFiles.push(...await this.generateEffectivenessCharts(results.rq1_effectiveness, targetDir));

            // RQ2: Efficiency Visualizations  
            generatedFiles.push(...await this.generateEfficiencyCharts(results.rq2_efficiency, targetDir));

            // RQ3: Comparison Visualizations
            generatedFiles.push(...await this.generateComparisonCharts(results.rq3_comparison, targetDir));

            // RQ4: Reinforcement Learning Visualizations
            generatedFiles.push(...await this.generateRLCharts(results.rq4_reinforcement, targetDir));

            // Summary Dashboard
            generatedFiles.push(...await this.generateSummaryDashboard(results, targetDir));

            Logger.info(`Generated ${generatedFiles.length} visualization files`);
            return generatedFiles;

        } catch (error) {
            Logger.error('Error generating visualizations:', error);
            throw error;
        }
    }

    /**
     * Generate effectiveness charts for RQ1
     */
    private async generateEffectivenessCharts(
        data: ExperimentResults['rq1_effectiveness'],
        outputDir: string
    ): Promise<string[]> {
        const files: string[] = [];

        // APFD Comparison Chart
        const apfdChart = this.createAPFDComparisonChart(data.apfd);
        files.push(await this.saveChart(apfdChart, 'rq1_apfd_comparison', outputDir));

        // Fault Detection Rate Chart
        const faultChart = this.createMetricComparisonChart(
            data.faultDetection,
            'Fault Detection Rate',
            'Fault Detection Rate (%)'
        );
        files.push(await this.saveChart(faultChart, 'rq1_fault_detection', outputDir));

        // Precision-Recall Chart
        const prChart = this.createPrecisionRecallChart(data.precision, data.recall);
        files.push(await this.saveChart(prChart, 'rq1_precision_recall', outputDir));

        // F1-Score Box Plot
        const f1Chart = this.createBoxPlotChart(data.f1Score, 'F1-Score Distribution');
        files.push(await this.saveChart(f1Chart, 'rq1_f1_distribution', outputDir));

        return files;
    }

    /**
     * Generate efficiency charts for RQ2
     */
    private async generateEfficiencyCharts(
        data: ExperimentResults['rq2_efficiency'],
        outputDir: string
    ): Promise<string[]> {
        const files: string[] = [];

        // Test Reduction Chart
        const reductionChart = this.createMetricComparisonChart(
            data.testReduction,
            'Test Reduction Ratio',
            'Reduction Ratio (%)'
        );
        files.push(await this.saveChart(reductionChart, 'rq2_test_reduction', outputDir));

        // Execution Time Savings
        const timeChart = this.createMetricComparisonChart(
            data.executionTime,
            'Execution Time Savings',
            'Time Savings (%)'
        );
        files.push(await this.saveChart(timeChart, 'rq2_execution_time', outputDir));

        // Analysis Overhead
        const overheadChart = this.createBarChart(
            data.analysisOverhead,
            'Analysis Overhead',
            'Overhead (ms)'
        );
        files.push(await this.saveChart(overheadChart, 'rq2_analysis_overhead', outputDir));

        // Efficiency Heatmap
        const heatmapChart = this.createEfficiencyHeatmap(data);
        files.push(await this.saveChart(heatmapChart, 'rq2_efficiency_heatmap', outputDir));

        return files;
    }

    /**
     * Generate comparison charts for RQ3
     */
    private async generateComparisonCharts(
        data: ExperimentResults['rq3_comparison'],
        outputDir: string
    ): Promise<string[]> {
        const files: string[] = [];

        // Technique Comparison Radar Chart
        const radarChart = this.createTechniqueRadarChart(data.metrics, data.techniques);
        files.push(await this.saveChart(radarChart, 'rq3_technique_radar', outputDir));

        // Statistical Significance Chart
        const statChart = this.createStatisticalSignificanceChart(data.statistical);
        files.push(await this.saveChart(statChart, 'rq3_statistical_significance', outputDir));

        // Performance Matrix
        const matrixChart = this.createPerformanceMatrix(data.metrics);
        files.push(await this.saveChart(matrixChart, 'rq3_performance_matrix', outputDir));

        // Baseline vs SIKG Comparison
        const comparisonChart = this.createBaselineComparisonChart(data.metrics);
        files.push(await this.saveChart(comparisonChart, 'rq3_baseline_comparison', outputDir));

        return files;
    }

    /**
     * Generate RL evaluation charts for RQ4
     */
    private async generateRLCharts(
        data: ExperimentResults['rq4_reinforcement'],
        outputDir: string
    ): Promise<string[]> {
        const files: string[] = [];

        // Learning Curves
        const learningChart = this.createLearningCurvesChart(data.learningCurves);
        files.push(await this.saveChart(learningChart, 'rq4_learning_curves', outputDir));

        // Weight Evolution
        const weightChart = this.createWeightEvolutionChart(data.weightEvolution);
        files.push(await this.saveChart(weightChart, 'rq4_weight_evolution', outputDir));

        // Adaptation Timeline
        const adaptationChart = this.createAdaptationTimelineChart(data.adaptationHistory);
        files.push(await this.saveChart(adaptationChart, 'rq4_adaptation_timeline', outputDir));

        // Performance Improvement
        const improvementChart = this.createPerformanceImprovementChart(data.learningCurves);
        files.push(await this.saveChart(improvementChart, 'rq4_performance_improvement', outputDir));

        return files;
    }

    /**
     * Generate summary dashboard
     */
    private async generateSummaryDashboard(
        results: ExperimentResults,
        outputDir: string
    ): Promise<string[]> {
        const files: string[] = [];

        // Executive Summary Dashboard
        const dashboardHTML = this.createInteractiveDashboard(results);
        const dashboardPath = path.join(outputDir, 'executive_dashboard.html');
        fs.writeFileSync(dashboardPath, dashboardHTML);
        files.push(dashboardPath);

        // Research Questions Overview
        const overviewChart = this.createResearchQuestionsOverview(results);
        files.push(await this.saveChart(overviewChart, 'research_questions_overview', outputDir));

        // Key Metrics Summary
        const summaryChart = this.createKeyMetricsSummary(results);
        files.push(await this.saveChart(summaryChart, 'key_metrics_summary', outputDir));

        return files;
    }

    /**
     * Create APFD comparison chart
     */
    private createAPFDComparisonChart(apfdData: Record<string, number[]>): string {
        const techniques = Object.keys(apfdData);
        const colors = ['#2563eb', '#dc2626', '#16a34a', '#ea580c', '#9333ea'];

        return `
        <div id="apfd-chart" style="width: 800px; height: 600px;"></div>
        <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
        <script>
            const apfdData = ${JSON.stringify(apfdData)};
            const traces = [];
            
            ${techniques.map((technique, index) => `
                traces.push({
                    x: Array.from({length: apfdData['${technique}'].length}, (_, i) => i + 1),
                    y: apfdData['${technique}'],
                    mode: 'lines+markers',
                    name: '${technique}',
                    line: { color: '${colors[index] || '#666'}', width: 3 },
                    marker: { size: 6 }
                });
            `).join('')}
            
            const layout = {
                title: {
                    text: 'APFD Comparison Across Techniques',
                    font: { size: 18 }
                },
                xaxis: {
                    title: 'Subject Projects',
                    showgrid: true
                },
                yaxis: {
                    title: 'APFD Score',
                    range: [0, 1],
                    showgrid: true
                },
                legend: {
                    x: 0.02,
                    y: 0.98,
                    bgcolor: 'rgba(255,255,255,0.8)'
                },
                hovermode: 'x unified'
            };
            
            Plotly.newPlot('apfd-chart', traces, layout, {responsive: true});
        </script>`;
    }

    /**
     * Create metric comparison chart
     */
    private createMetricComparisonChart(
        data: Record<string, number[]>,
        title: string,
        yAxisTitle: string
    ): string {
        const techniques = Object.keys(data);
        const colors = ['#2563eb', '#dc2626', '#16a34a', '#ea580c'];

        return `
        <div id="metric-chart" style="width: 800px; height: 500px;"></div>
        <script>
            const metricData = ${JSON.stringify(data)};
            const traces = [];
            
            ${techniques.map((technique, index) => `
                traces.push({
                    y: metricData['${technique}'],
                    type: 'box',
                    name: '${technique}',
                    marker: { color: '${colors[index] || '#666'}' },
                    boxpoints: 'outliers'
                });
            `).join('')}
            
            const layout = {
                title: '${title}',
                yaxis: { title: '${yAxisTitle}' },
                showlegend: true
            };
            
            Plotly.newPlot('metric-chart', traces, layout, {responsive: true});
        </script>`;
    }

    /**
     * Create precision-recall scatter plot
     */
    private createPrecisionRecallChart(
        precisionData: Record<string, number[]>,
        recallData: Record<string, number[]>
    ): string {
        const techniques = Object.keys(precisionData);

        return `
        <div id="pr-chart" style="width: 600px; height: 600px;"></div>
        <script>
            const precision = ${JSON.stringify(precisionData)};
            const recall = ${JSON.stringify(recallData)};
            const traces = [];
            
            ${techniques.map((technique, index) => `
                traces.push({
                    x: recall['${technique}'],
                    y: precision['${technique}'],
                    mode: 'markers',
                    name: '${technique}',
                    marker: { 
                        size: 10,
                        opacity: 0.7,
                        color: '${['#2563eb', '#dc2626', '#16a34a', '#ea580c'][index] || '#666'}'
                    }
                });
            `).join('')}
            
            const layout = {
                title: 'Precision vs Recall',
                xaxis: { 
                    title: 'Recall',
                    range: [0, 1]
                },
                yaxis: { 
                    title: 'Precision',
                    range: [0, 1]
                },
                shapes: [{
                    type: 'line',
                    x0: 0, y0: 0,
                    x1: 1, y1: 1,
                    line: { dash: 'dash', color: '#999' }
                }]
            };
            
            Plotly.newPlot('pr-chart', traces, layout, {responsive: true});
        </script>`;
    }

    /**
     * Create box plot chart
     */
    private createBoxPlotChart(data: Record<string, number[]>, title: string): string {
        const techniques = Object.keys(data);

        return `
        <div id="box-chart" style="width: 800px; height: 500px;"></div>
        <script>
            const boxData = ${JSON.stringify(data)};
            const traces = [];
            
            ${techniques.map(technique => `
                traces.push({
                    y: boxData['${technique}'],
                    type: 'box',
                    name: '${technique}',
                    boxpoints: 'all',
                    jitter: 0.3,
                    pointpos: -1.8
                });
            `).join('')}
            
            const layout = {
                title: '${title}',
                yaxis: { title: 'Score' }
            };
            
            Plotly.newPlot('box-chart', traces, layout, {responsive: true});
        </script>`;
    }

    /**
     * Create bar chart
     */
    private createBarChart(
        data: Record<string, number[]>,
        title: string,
        yAxisTitle: string
    ): string {
        const techniques = Object.keys(data);
        const avgData = techniques.map(t => 
            data[t].reduce((sum, val) => sum + val, 0) / data[t].length
        );

        return `
        <div id="bar-chart" style="width: 800px; height: 500px;"></div>
        <script>
            const trace = {
                x: ${JSON.stringify(techniques)},
                y: ${JSON.stringify(avgData)},
                type: 'bar',
                marker: { color: '#2563eb' }
            };
            
            const layout = {
                title: '${title}',
                yaxis: { title: '${yAxisTitle}' }
            };
            
            Plotly.newPlot('bar-chart', [trace], layout, {responsive: true});
        </script>`;
    }

    /**
     * Create efficiency heatmap
     */
    private createEfficiencyHeatmap(data: ExperimentResults['rq2_efficiency']): string {
        const metrics = ['testReduction', 'executionTime', 'analysisOverhead'];
        const techniques = Object.keys(data.testReduction);

        return `
        <div id="heatmap-chart" style="width: 800px; height: 500px;"></div>
        <script>
            const heatmapData = [];
            const xLabels = ${JSON.stringify(techniques)};
            const yLabels = ['Test Reduction', 'Execution Time', 'Analysis Overhead'];
            
            ${metrics.map((metric, i) => `
                const ${metric}Avg = ${JSON.stringify(techniques.map(t => 
                    data[metric][t]?.reduce((sum, val) => sum + val, 0) / (data[metric][t]?.length || 1) || 0
                ))};
                heatmapData.push(${metric}Avg);
            `).join('')}
            
            const trace = {
                z: heatmapData,
                x: xLabels,
                y: yLabels,
                type: 'heatmap',
                colorscale: 'Viridis'
            };
            
            const layout = {
                title: 'Efficiency Metrics Heatmap',
                xaxis: { title: 'Techniques' },
                yaxis: { title: 'Metrics' }
            };
            
            Plotly.newPlot('heatmap-chart', [trace], layout, {responsive: true});
        </script>`;
    }

    /**
     * Create technique radar chart
     */
    private createTechniqueRadarChart(
        metrics: Record<string, Record<string, number[]>>,
        techniques: string[]
    ): string {
        const metricNames = Object.keys(metrics);

        return `
        <div id="radar-chart" style="width: 800px; height: 600px;"></div>
        <script>
            const traces = [];
            
            ${techniques.map(technique => `
                const ${technique}Data = [
                    ${metricNames.map(metric => 
                        `(${JSON.stringify(metrics[metric][technique] || [])}.reduce((a,b) => a+b, 0) / ${metrics[metric][technique]?.length || 1})`
                    ).join(',')}
                ];
                
                traces.push({
                    type: 'scatterpolar',
                    r: ${technique}Data,
                    theta: ${JSON.stringify(metricNames)},
                    fill: 'toself',
                    name: '${technique}'
                });
            `).join('')}
            
            const layout = {
                polar: {
                    radialaxis: {
                        visible: true,
                        range: [0, 1]
                    }
                },
                title: 'Technique Comparison Radar Chart'
            };
            
            Plotly.newPlot('radar-chart', traces, layout, {responsive: true});
        </script>`;
    }

    /**
     * Create statistical significance chart
     */
    private createStatisticalSignificanceChart(statistical: StatisticalComparison[]): string {
        const significantComparisons = statistical.filter(s => s.significant);
        
        return `
        <div id="stat-chart" style="width: 800px; height: 500px;"></div>
        <script>
            const statData = ${JSON.stringify(significantComparisons)};
            
            const trace = {
                x: statData.map(d => d.baseline + ' vs ' + d.sikg),
                y: statData.map(d => d.improvement),
                type: 'bar',
                marker: {
                    color: statData.map(d => d.improvement > 0 ? '#16a34a' : '#dc2626')
                },
                text: statData.map(d => 'p=' + d.pValue.toFixed(4)),
                textposition: 'auto'
            };
            
            const layout = {
                title: 'Statistical Significance of Improvements',
                yaxis: { title: 'Improvement (%)' },
                xaxis: { title: 'Comparison' }
            };
            
            Plotly.newPlot('stat-chart', [trace], layout, {responsive: true});
        </script>`;
    }

    /**
     * Create performance matrix
     */
    private createPerformanceMatrix(metrics: Record<string, Record<string, number[]>>): string {
        // Simplified performance matrix visualization
        return `
        <div id="matrix-chart" style="width: 800px; height: 600px;"></div>
        <script>
            // Performance matrix implementation would go here
            // This is a placeholder for the actual matrix visualization
            const layout = {
                title: 'Performance Matrix',
                annotations: [{
                    text: 'Performance matrix visualization',
                    showarrow: false,
                    x: 0.5,
                    y: 0.5
                }]
            };
            
            Plotly.newPlot('matrix-chart', [], layout, {responsive: true});
        </script>`;
    }

    /**
     * Create baseline comparison chart
     */
    private createBaselineComparisonChart(metrics: Record<string, Record<string, number[]>>): string {
        // Implementation for baseline comparison
        return this.createMetricComparisonChart(
            metrics['apfd'] || {},
            'Baseline vs SIKG Comparison',
            'APFD Score'
        );
    }

    /**
     * Create learning curves chart
     */
    private createLearningCurvesChart(learningCurves: Record<string, LearningCurvePoint[]>): string {
        const projects = Object.keys(learningCurves);

        return `
        <div id="learning-chart" style="width: 800px; height: 600px;"></div>
        <script>
            const learningData = ${JSON.stringify(learningCurves)};
            const traces = [];
            
            ${projects.map((project, index) => `
                traces.push({
                    x: learningData['${project}'].map(p => p.iteration),
                    y: learningData['${project}'].map(p => p.performance),
                    mode: 'lines+markers',
                    name: '${project}',
                    line: { width: 2 }
                });
            `).join('')}
            
            const layout = {
                title: 'RL Learning Curves by Project',
                xaxis: { title: 'Iteration' },
                yaxis: { title: 'Performance Score' }
            };
            
            Plotly.newPlot('learning-chart', traces, layout, {responsive: true});
        </script>`;
    }

    /**
     * Create weight evolution chart
     */
    private createWeightEvolutionChart(weightEvolution: Record<string, number[]>): string {
        return `
        <div id="weight-chart" style="width: 800px; height: 500px;"></div>
        <script>
            const weightData = ${JSON.stringify(weightEvolution)};
            const traces = [];
            
            Object.keys(weightData).forEach((edgeType, index) => {
                traces.push({
                    y: weightData[edgeType],
                    mode: 'lines',
                    name: edgeType,
                    line: { width: 2 }
                });
            });
            
            const layout = {
                title: 'Edge Weight Evolution During RL',
                xaxis: { title: 'Iteration' },
                yaxis: { title: 'Weight Value' }
            };
            
            Plotly.newPlot('weight-chart', traces, layout, {responsive: true});
        </script>`;
    }

    /**
     * Create adaptation timeline chart
     */
    private createAdaptationTimelineChart(adaptationHistory: any[]): string {
        return `
        <div id="adaptation-chart" style="width: 800px; height: 400px;"></div>
        <script>
            const adaptations = ${JSON.stringify(adaptationHistory)};
            
            const trace = {
                x: adaptations.map((_, i) => i),
                y: adaptations.map(a => a.adaptationCount || 1),
                type: 'bar',
                name: 'Adaptations',
                marker: { color: '#2563eb' }
            };
            
            const layout = {
                title: 'RL Adaptation Timeline',
                xaxis: { title: 'Time Period' },
                yaxis: { title: 'Number of Adaptations' }
            };
            
            Plotly.newPlot('adaptation-chart', [trace], layout, {responsive: true});
        </script>`;
    }

    /**
     * Create performance improvement chart
     */
    private createPerformanceImprovementChart(learningCurves: Record<string, LearningCurvePoint[]>): string {
        // Calculate improvement over time for each project
        const improvements: Record<string, number> = {};
        
        Object.entries(learningCurves).forEach(([project, curves]) => {
            if (curves.length >= 2) {
                const initial = curves[0].performance;
                const final = curves[curves.length - 1].performance;
                improvements[project] = ((final - initial) / initial) * 100;
            }
        });

        return `
        <div id="improvement-chart" style="width: 800px; height: 500px;"></div>
        <script>
            const improvements = ${JSON.stringify(improvements)};
            
            const trace = {
                x: Object.keys(improvements),
                y: Object.values(improvements),
                type: 'bar',
                marker: {
                    color: Object.values(improvements).map(v => v > 0 ? '#16a34a' : '#dc2626')
                }
            };
            
            const layout = {
                title: 'Performance Improvement Through RL',
                xaxis: { title: 'Project' },
                yaxis: { title: 'Improvement (%)' }
            };
            
            Plotly.newPlot('improvement-chart', [trace], layout, {responsive: true});
        </script>`;
    }

    /**
     * Create interactive dashboard
     */
    private createInteractiveDashboard(results: ExperimentResults): string {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>SIKG Experiment Results Dashboard</title>
            <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                .dashboard-header { text-align: center; margin-bottom: 30px; }
                .metrics-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 30px; }
                .metric-card { 
                    border: 1px solid #ddd; 
                    padding: 20px; 
                    border-radius: 8px; 
                    background: #f9f9f9; 
                }
                .chart-container { margin-bottom: 30px; }
                .rq-section { margin-bottom: 40px; border-bottom: 2px solid #eee; padding-bottom: 20px; }
            </style>
        </head>
        <body>
            <div class="dashboard-header">
                <h1>SIKG Experiment Results Dashboard</h1>
                <p>Generated: ${results.metadata.timestamp}</p>
                <p>Subjects: ${results.metadata.subjects.length} projects | Iterations: ${results.metadata.iterations}</p>
            </div>
            
            <div class="metrics-grid">
                <div class="metric-card">
                    <h3>RQ1: Effectiveness</h3>
                    <p>APFD Score: <strong>${this.calculateAverageMetric(results.rq1_effectiveness.apfd).toFixed(3)}</strong></p>
                    <p>Fault Detection: <strong>${(this.calculateAverageMetric(results.rq1_effectiveness.faultDetection) * 100).toFixed(1)}%</strong></p>
                </div>
                <div class="metric-card">
                    <h3>RQ2: Efficiency</h3>
                    <p>Test Reduction: <strong>${(this.calculateAverageMetric(results.rq2_efficiency.testReduction) * 100).toFixed(1)}%</strong></p>
                    <p>Time Savings: <strong>${(this.calculateAverageMetric(results.rq2_efficiency.executionTime) * 100).toFixed(1)}%</strong></p>
                </div>
                <div class="metric-card">
                    <h3>RQ3: Comparison</h3>
                    <p>Techniques Compared: <strong>${results.rq3_comparison.techniques.length}</strong></p>
                    <p>Significant Improvements: <strong>${results.rq3_comparison.statistical.filter(s => s.significant).length}</strong></p>
                </div>
                <div class="metric-card">
                    <h3>RQ4: Reinforcement Learning</h3>
                    <p>Projects with RL: <strong>${Object.keys(results.rq4_reinforcement.learningCurves).length}</strong></p>
                    <p>Avg Improvement: <strong>${this.calculateRLImprovement(results.rq4_reinforcement.learningCurves).toFixed(1)}%</strong></p>
                </div>
            </div>
            
            <div class="rq-section">
                <h2>Research Questions Summary</h2>
                <div id="summary-chart" style="height: 400px;"></div>
            </div>
            
            <script>
                // Add interactive summary visualization
                const summaryTrace = {
                    r: [
                        ${this.calculateAverageMetric(results.rq1_effectiveness.apfd)},
                        ${this.calculateAverageMetric(results.rq2_efficiency.testReduction)},
                        ${results.rq3_comparison.statistical.filter(s => s.significant).length / results.rq3_comparison.statistical.length},
                        ${this.calculateRLImprovement(results.rq4_reinforcement.learningCurves) / 100}
                    ],
                    theta: ['RQ1: Effectiveness', 'RQ2: Efficiency', 'RQ3: Comparison', 'RQ4: RL'],
                    type: 'scatterpolar',
                    fill: 'toself',
                    name: 'SIKG Performance'
                };
                
                const summaryLayout = {
                    polar: {
                        radialaxis: {
                            visible: true,
                            range: [0, 1]
                        }
                    },
                    title: 'SIKG Research Questions Performance Summary'
                };
                
                Plotly.newPlot('summary-chart', [summaryTrace], summaryLayout, {responsive: true});
            </script>
        </body>
        </html>`;
    }

    /**
     * Create research questions overview
     */
    private createResearchQuestionsOverview(results: ExperimentResults): string {
        return `
        <div id="rq-overview" style="width: 1000px; height: 600px;"></div>
        <script>
            const rqData = [
                {
                    name: 'RQ1: Effectiveness',
                    value: ${this.calculateAverageMetric(results.rq1_effectiveness.apfd)},
                    description: 'Fault detection capability'
                },
                {
                    name: 'RQ2: Efficiency', 
                    value: ${this.calculateAverageMetric(results.rq2_efficiency.testReduction)},
                    description: 'Test reduction and time savings'
                },
                {
                    name: 'RQ3: Comparison',
                    value: ${results.rq3_comparison.statistical.filter(s => s.significant).length / Math.max(1, results.rq3_comparison.statistical.length)},
                    description: 'Superiority over baselines'
                },
                {
                    name: 'RQ4: RL',
                    value: ${Math.min(1, this.calculateRLImprovement(results.rq4_reinforcement.learningCurves) / 20)},
                    description: 'Learning and adaptation'
                }
            ];
            
            const trace = {
                values: rqData.map(d => d.value),
                labels: rqData.map(d => d.name),
                type: 'pie',
                textinfo: 'label+percent',
                textposition: 'outside'
            };
            
            const layout = {
                title: 'Research Questions Performance Overview'
            };
            
            Plotly.newPlot('rq-overview', [trace], layout, {responsive: true});
        </script>`;
    }

    /**
     * Create key metrics summary
     */
    private createKeyMetricsSummary(results: ExperimentResults): string {
        const metrics = [
            'APFD Score',
            'Test Reduction',
            'Execution Time Savings',
            'Precision',
            'Recall',
            'F1-Score'
        ];

        const values = [
            this.calculateAverageMetric(results.rq1_effectiveness.apfd),
            this.calculateAverageMetric(results.rq2_efficiency.testReduction),
            this.calculateAverageMetric(results.rq2_efficiency.executionTime),
            this.calculateAverageMetric(results.rq1_effectiveness.precision),
            this.calculateAverageMetric(results.rq1_effectiveness.recall),
            this.calculateAverageMetric(results.rq1_effectiveness.f1Score)
        ];

        return `
        <div id="metrics-summary" style="width: 800px; height: 500px;"></div>
        <script>
            const trace = {
                x: ${JSON.stringify(metrics)},
                y: ${JSON.stringify(values)},
                type: 'bar',
                marker: { color: '#2563eb' }
            };
            
            const layout = {
                title: 'Key Metrics Summary',
                yaxis: { 
                    title: 'Score',
                    range: [0, 1]
                }
            };
            
            Plotly.newPlot('metrics-summary', [trace], layout, {responsive: true});
        </script>`;
    }

    /**
     * Save chart to file
     */
    private async saveChart(chartHTML: string, filename: string, outputDir: string): Promise<string> {
        const fullHTML = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>${filename}</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                .chart-container { text-align: center; }
            </style>
        </head>
        <body>
            <div class="chart-container">
                ${chartHTML}
            </div>
        </body>
        </html>`;

        const filePath = path.join(outputDir, `${filename}.html`);
        fs.writeFileSync(filePath, fullHTML);
        
        Logger.debug(`Generated chart: ${filePath}`);
        return filePath;
    }

    /**
     * Helper method to calculate average metric
     */
    private calculateAverageMetric(data: Record<string, number[]>): number {
        const allValues = Object.values(data).flat();
        return allValues.length > 0 ? allValues.reduce((sum, val) => sum + val, 0) / allValues.length : 0;
    }

    /**
     * Helper method to calculate RL improvement
     */
    private calculateRLImprovement(learningCurves: Record<string, LearningCurvePoint[]>): number {
        const improvements = Object.values(learningCurves).map(curves => {
            if (curves.length >= 2) {
                const initial = curves[0].performance;
                const final = curves[curves.length - 1].performance;
                return ((final - initial) / initial) * 100;
            }
            return 0;
        });
        
        return improvements.length > 0 ? improvements.reduce((sum, imp) => sum + imp, 0) / improvements.length : 0;
    }

    /**
     * Ensure output directory exists
     */
    private ensureOutputDirectory(): void {
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }

    /**
     * Set theme for visualizations
     */
    public setTheme(theme: 'light' | 'dark'): void {
        this.theme = theme;
    }

    /**
     * Generate individual chart by type
     */
    public async generateChart(
        config: ChartConfig,
        data: any,
        outputPath?: string
    ): Promise<string> {
        // Implementation for generating individual charts
        // This would be used for custom chart generation
        const chartHTML = this.generateChartHTML(config, data);
        
        if (outputPath) {
            return await this.saveChart(chartHTML, path.basename(outputPath, '.html'), path.dirname(outputPath));
        }
        
        return chartHTML;
    }

    /**
     * Generate chart HTML based on configuration
     */
    private generateChartHTML(config: ChartConfig, data: any): string {
        // This would implement chart generation based on the config type
        // For now, return a placeholder
        return `<div>Chart: ${config.title}</div>`;
    }
}