// src/experiments/index.ts - Main experiment runner and CLI interface

import * as fs from 'fs';
import * as path from 'path';
import { ExperimentRunner } from './runners/ExperimentRunner';
import { ResultsAnalyzer } from './analysis/ResultsAnalyzer';
import { 
    ExperimentConfig, 
    DEFAULT_EXPERIMENT_CONFIG,
    ExperimentResult 
} from './config/ExperimentConfig';
import { Logger } from '../utils/Logger';

/**
 * Main experiment controller
 */
export class ExperimentController {
    private config: ExperimentConfig;
    private outputDir: string;

    constructor(config?: Partial<ExperimentConfig>) {
        this.config = { ...DEFAULT_EXPERIMENT_CONFIG, ...config };
        this.outputDir = this.config.outputDirectory;
        this.ensureOutputDirectory();
    }

    /**
     * Run complete experiment suite
     */
    public async runCompleteExperimentSuite(): Promise<void> {
        Logger.info('🚀 Starting SIKG Complete Experiment Suite');
        Logger.info(`📊 Configuration: ${this.config.subjects.length} subjects, ${this.config.iterations} iterations`);
        
        try {
            // Run experiments
            const experimentResult = await this.runExperiments();
            
            // Analyze results
            const analysisReport = await this.analyzeResults(experimentResult);
            
            // Generate comprehensive report
            await this.generateFinalReport(analysisReport);
            
            Logger.info('✅ Complete experiment suite finished successfully');
            
        } catch (error) {
            Logger.error('❌ Experiment suite failed:', error);
            throw error;
        }
    }

    /**
     * Run effectiveness evaluation (RQ1)
     */
    public async runEffectivenessEvaluation(): Promise<void> {
        Logger.info('🎯 Running Effectiveness Evaluation (RQ1)');
        
        const config = {
            ...this.config,
            metrics: ['apfd', 'fault-detection-rate', 'precision', 'recall', 'f1-score'],
            baselines: ['random', 'ekstazi'],
            iterations: 20
        };
        
        const runner = new ExperimentRunner(config, null);
        const result = await runner.runExperiments();
        
        // Focus on effectiveness metrics
        const analyzer = new ResultsAnalyzer(result);
        const report = analyzer.generateAnalysisReport();
        
        Logger.info(`📈 RQ1 Results - APFD Improvement: ${(report.researchQuestionAnalysis.rq1_effectiveness.apfdImprovement * 100).toFixed(1)}%`);
        Logger.info(`🎯 Fault Detection Improvement: ${(report.researchQuestionAnalysis.rq1_effectiveness.faultDetectionImprovement * 100).toFixed(1)}%`);
        
        this.saveReport(report, 'effectiveness_evaluation');
    }

    /**
     * Run efficiency evaluation (RQ2)
     */
    public async runEfficiencyEvaluation(): Promise<void> {
        Logger.info('⚡ Running Efficiency Evaluation (RQ2)');
        
        const config = {
            ...this.config,
            metrics: ['reduction-ratio', 'execution-time', 'analysis-overhead'],
            iterations: 15
        };
        
        const runner = new ExperimentRunner(config, null);
        const result = await runner.runExperiments();
        
        const analyzer = new ResultsAnalyzer(result);
        const report = analyzer.generateAnalysisReport();
        
        Logger.info(`🎯 RQ2 Results - Test Reduction: ${(report.researchQuestionAnalysis.rq2_efficiency.reductionAchieved * 100).toFixed(1)}%`);
        Logger.info(`⏱️ Time Savings: ${(report.researchQuestionAnalysis.rq2_efficiency.timeSavings * 100).toFixed(1)}%`);
        Logger.info(`🔧 Analysis Overhead: ${report.researchQuestionAnalysis.rq2_efficiency.overhead.toFixed(0)}ms`);
        
        this.saveReport(report, 'efficiency_evaluation');
    }

    /**
     * Run comparative evaluation (RQ3)
     */
    public async runComparativeEvaluation(): Promise<void> {
        Logger.info('⚖️ Running Comparative Evaluation (RQ3)');
        
        const config = {
            ...this.config,
            baselines: ['random', 'ekstazi', 'history', 'impact-sorted'],
            iterations: 25
        };
        
        const runner = new ExperimentRunner(config, null);
        const result = await runner.runExperiments();
        
        const analyzer = new ResultsAnalyzer(result);
        const report = analyzer.generateAnalysisReport();
        
        Logger.info(`🏆 RQ3 Results - Best Baseline: ${report.researchQuestionAnalysis.rq3_comparison.bestBaseline}`);
        Logger.info(`📊 Improvement over Best: ${(report.researchQuestionAnalysis.rq3_comparison.improvementOverBest * 100).toFixed(1)}%`);
        Logger.info(`🎯 Consistent Wins: ${report.researchQuestionAnalysis.rq3_comparison.consistentWins}/4 metrics`);
        
        this.saveReport(report, 'comparative_evaluation');
    }

    /**
     * Run reinforcement learning evaluation (RQ4)
     */
    public async runRLEvaluation(): Promise<void> {
        Logger.info('🧠 Running Reinforcement Learning Evaluation (RQ4)');
        
        const config = {
            ...this.config,
            sikgConfig: {
                ...this.config.sikgConfig,
                rlEnabled: true,
                learningRate: 0.01,
                explorationRate: 0.1
            },
            iterations: 40 // More iterations to observe learning
        };
        
        const runner = new ExperimentRunner(config, null);
        const result = await runner.runExperiments();
        
        const analyzer = new ResultsAnalyzer(result);
        const report = analyzer.generateAnalysisReport();
        
        Logger.info(`🎯 RQ4 Results - Learning Trend: ${report.researchQuestionAnalysis.rq4_adaptation.learningTrend}`);
        Logger.info(`📈 Adaptation Speed: ${report.researchQuestionAnalysis.rq4_adaptation.adaptationSpeed.toFixed(4)}`);
        Logger.info(`🏁 Final Performance: ${report.researchQuestionAnalysis.rq4_adaptation.finalPerformance.toFixed(3)}`);
        
        this.saveReport(report, 'rl_evaluation');
    }

    /**
     * Run scalability analysis
     */
    public async runScalabilityAnalysis(): Promise<void> {
        Logger.info('📏 Running Scalability Analysis');
        
        // Test on projects of different sizes
        const smallConfig = { ...this.config, subjects: this.config.subjects.filter(s => s.size === 'small') };
        const mediumConfig = { ...this.config, subjects: this.config.subjects.filter(s => s.size === 'medium') };
        const largeConfig = { ...this.config, subjects: this.config.subjects.filter(s => s.size === 'large') };
        
        const results = [];
        
        for (const [name, config] of [['small', smallConfig], ['medium', mediumConfig], ['large', largeConfig]]) {
            if (config.subjects.length > 0) {
                const runner = new ExperimentRunner(config, null);
                const result = await runner.runExperiments();
                results.push({ size: name, result });
            }
        }
        
        // Analyze scalability trends
        for (const { size, result } of results) {
            const analyzer = new ResultsAnalyzer(result);
            const report = analyzer.generateAnalysisReport();
            
            Logger.info(`📊 ${size.toUpperCase()} projects - APFD: ${report.summary.overallImprovement.apfd.toFixed(3)}, ` +
                       `Overhead: ${report.researchQuestionAnalysis.rq2_efficiency.overhead.toFixed(0)}ms`);
        }
    }

    /**
     * Generate comprehensive comparison report
     */
    public async generateComparisonReport(experimentIds: string[]): Promise<void> {
        Logger.info('📋 Generating Comparison Report');
        
        const experiments = experimentIds.map(id => this.loadExperimentResult(id));
        const reports = experiments.map(exp => new ResultsAnalyzer(exp).generateAnalysisReport());
        
        // Create comparison summary
        const comparison = {
            experiments: experimentIds,
            timestamp: new Date().toISOString(),
            summary: {
                apfdComparison: reports.map(r => r.summary.overallImprovement.apfd),
                efficiencyComparison: reports.map(r => r.researchQuestionAnalysis.rq2_efficiency.reductionAchieved),
                statisticalSignificance: reports.map(r => r.summary.significantMetrics.length)
            },
            recommendations: this.generateCrossExperimentRecommendations(reports)
        };
        
        const outputPath = path.join(this.outputDir, 'comparison_report.json');
        fs.writeFileSync(outputPath, JSON.stringify(comparison, null, 2));
        
        Logger.info(`📄 Comparison report saved to ${outputPath}`);
    }

    // Private helper methods
    private async runExperiments(): Promise<ExperimentResult> {
        const runner = new ExperimentRunner(this.config, null);
        return await runner.runExperiments();
    }

    private async analyzeResults(experimentResult: ExperimentResult): Promise<any> {
        const analyzer = new ResultsAnalyzer(experimentResult);
        return analyzer.generateAnalysisReport();
    }

    private async generateFinalReport(analysisReport: any): Promise<void> {
        // Generate HTML report
        const htmlGenerator = new HTMLReportGenerator(analysisReport);
        const htmlPath = path.join(this.outputDir, 'final_report.html');
        const htmlContent = htmlGenerator.generateHTML();
        fs.writeFileSync(htmlPath, htmlContent);
        
        // Save JSON report
        this.saveReport(analysisReport, 'final_analysis');
        
        // Generate executive summary
        const summaryPath = path.join(this.outputDir, 'executive_summary.md');
        const summary = this.generateExecutiveSummary(analysisReport);
        fs.writeFileSync(summaryPath, summary);
        
        Logger.info(`📊 Final reports generated in ${this.outputDir}`);
    }

    private saveReport(report: any, filename: string): void {
        const reportPath = path.join(this.outputDir, `${filename}.json`);
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        Logger.info(`💾 Report saved: ${reportPath}`);
    }

    private loadExperimentResult(experimentId: string): ExperimentResult {
        const resultPath = path.join(this.outputDir, `${experimentId}.json`);
        
        if (!fs.existsSync(resultPath)) {
            throw new Error(`Experiment result not found: ${experimentId}`);
        }
        
        const content = fs.readFileSync(resultPath, 'utf8');
        return JSON.parse(content);
    }

    private generateExecutiveSummary(report: any): string {
        return `# SIKG Experiment Results - Executive Summary

## Key Findings

### Research Question 1: Effectiveness
- **APFD Improvement**: ${(report.researchQuestionAnalysis.rq1_effectiveness.apfdImprovement * 100).toFixed(1)}%
- **Fault Detection**: ${(report.researchQuestionAnalysis.rq1_effectiveness.faultDetectionImprovement * 100).toFixed(1)}% improvement
- **Interpretation**: ${report.researchQuestionAnalysis.rq1_effectiveness.interpretation}

### Research Question 2: Efficiency  
- **Test Reduction**: ${(report.researchQuestionAnalysis.rq2_efficiency.reductionAchieved * 100).toFixed(1)}%
- **Time Savings**: ${(report.researchQuestionAnalysis.rq2_efficiency.timeSavings * 100).toFixed(1)}%
- **Analysis Overhead**: ${report.researchQuestionAnalysis.rq2_efficiency.overhead.toFixed(0)}ms
- **Interpretation**: ${report.researchQuestionAnalysis.rq2_efficiency.interpretation}

### Research Question 3: Baseline Comparison
- **Best Baseline**: ${report.researchQuestionAnalysis.rq3_comparison.bestBaseline}
- **Improvement**: ${(report.researchQuestionAnalysis.rq3_comparison.improvementOverBest * 100).toFixed(1)}%
- **Consistent Wins**: ${report.researchQuestionAnalysis.rq3_comparison.consistentWins}/4 metrics
- **Interpretation**: ${report.researchQuestionAnalysis.rq3_comparison.interpretation}

### Research Question 4: Reinforcement Learning
- **Learning Trend**: ${report.researchQuestionAnalysis.rq4_adaptation.learningTrend}
- **Adaptation Speed**: ${report.researchQuestionAnalysis.rq4_adaptation.adaptationSpeed.toFixed(4)}
- **Final Performance**: ${report.researchQuestionAnalysis.rq4_adaptation.finalPerformance.toFixed(3)}
- **Interpretation**: ${report.researchQuestionAnalysis.rq4_adaptation.interpretation}

## Statistical Significance
- **Significant Metrics**: ${report.summary.significantMetrics.join(', ')}
- **Effect Sizes**: Strong effect sizes observed in ${Object.entries(report.summary.effectSizes).filter(([_, size]) => size > 0.5).map(([metric, _]) => metric).join(', ')}

## Recommendations
${report.recommendations.map((rec: string) => `- ${rec}`).join('\n')}

## Overall Assessment
${report.summary.significantMetrics.length >= 3 ? 
  'SIKG demonstrates statistically significant improvements across multiple metrics with practical relevance for real-world adoption.' :
  'SIKG shows promise but requires further refinement to achieve consistent statistical significance across all metrics.'}

---
*Generated on ${new Date().toISOString()}*
`;
    }

    private generateCrossExperimentRecommendations(reports: any[]): string[] {
        const recommendations: string[] = [];
        
        // Analyze consistency across experiments
        const consistentMetrics = ['apfd', 'precision', 'recall'].filter(metric => 
            reports.every(r => r.summary.significantMetrics.includes(metric))
        );
        
        if (consistentMetrics.length >= 2) {
            recommendations.push(`Consistent improvements observed in ${consistentMetrics.join(', ')} across all experiments.`);
        }
        
        // Analyze learning trends
        const improvingTrends = reports.filter(r => 
            r.researchQuestionAnalysis.rq4_adaptation.learningTrend === 'improving'
        ).length;
        
        if (improvingTrends >= reports.length * 0.7) {
            recommendations.push('Reinforcement learning shows consistent improvement across experiments.');
        }
        
        return recommendations;
    }

    private ensureOutputDirectory(): void {
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }
}

/**
 * Simple HTML report generator
 */
class HTMLReportGenerator {
    constructor(private report: any) {}

    generateHTML(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SIKG Experiment Results</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
        .header { text-align: center; margin-bottom: 40px; }
        .section { margin-bottom: 30px; padding: 20px; border: 1px solid #ddd; border-radius: 8px; }
        .metric { display: inline-block; margin: 10px; padding: 15px; background: #f5f5f5; border-radius: 5px; }
        .significant { background: #d4edda; }
        .chart-placeholder { height: 300px; background: #f8f9fa; border: 2px dashed #dee2e6; display: flex; align-items: center; justify-content: center; margin: 20px 0; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <div class="header">
        <h1>SIKG Experiment Results</h1>
        <p>Generated on ${new Date().toISOString()}</p>
    </div>

    <div class="section">
        <h2>Executive Summary</h2>
        <div class="metric ${this.report.summary.significantMetrics.includes('apfd') ? 'significant' : ''}">
            <strong>APFD Improvement:</strong> ${(this.report.summary.overallImprovement.apfd * 100).toFixed(1)}%
        </div>
        <div class="metric ${this.report.summary.significantMetrics.includes('reductionRatio') ? 'significant' : ''}">
            <strong>Test Reduction:</strong> ${(this.report.summary.overallImprovement.reductionRatio * 100).toFixed(1)}%
        </div>
        <div class="metric">
            <strong>Significant Metrics:</strong> ${this.report.summary.significantMetrics.length}/5
        </div>
    </div>

    <div class="section">
        <h2>Research Question Analysis</h2>
        
        <h3>RQ1: Effectiveness</h3>
        <p>${this.report.researchQuestionAnalysis.rq1_effectiveness.interpretation}</p>
        
        <h3>RQ2: Efficiency</h3>
        <p>${this.report.researchQuestionAnalysis.rq2_efficiency.interpretation}</p>
        
        <h3>RQ3: Baseline Comparison</h3>
        <p>${this.report.researchQuestionAnalysis.rq3_comparison.interpretation}</p>
        
        <h3>RQ4: Reinforcement Learning</h3>
        <p>${this.report.researchQuestionAnalysis.rq4_adaptation.interpretation}</p>
    </div>

    <div class="section">
        <h2>Statistical Results</h2>
        <table>
            <tr>
                <th>Test</th>
                <th>P-Value</th>
                <th>Significant</th>
                <th>Effect Size</th>
            </tr>
            ${this.report.statisticalResults.overallComparison.map((test: any) => `
                <tr>
                    <td>${test.testName}</td>
                    <td>${test.pValue.toFixed(4)}</td>
                    <td>${test.significant ? '✓' : '✗'}</td>
                    <td>${test.effectSize.toFixed(3)}</td>
                </tr>
            `).join('')}
        </table>
    </div>

    <div class="section">
        <h2>Visualizations</h2>
        ${this.report.charts.map((chart: any) => `
            <div class="chart-placeholder">
                <div>
                    <h4>${chart.title}</h4>
                    <p>${chart.description}</p>
                    <em>Chart visualization would be rendered here</em>
                </div>
            </div>
        `).join('')}
    </div>

    <div class="section">
        <h2>Recommendations</h2>
        <ul>
            ${this.report.recommendations.map((rec: string) => `<li>${rec}</li>`).join('')}
        </ul>
    </div>
</body>
</html>`;
    }
}

// CLI Interface
export async function runExperimentCLI(): Promise<void> {
    const args = process.argv.slice(2);
    const command = args[0];
    
    const controller = new ExperimentController();
    
    try {
        switch (command) {
            case 'all':
                await controller.runCompleteExperimentSuite();
                break;
            case 'effectiveness':
            case 'rq1':
                await controller.runEffectivenessEvaluation();
                break;
            case 'efficiency':
            case 'rq2':
                await controller.runEfficiencyEvaluation();
                break;
            case 'comparison':
            case 'rq3':
                await controller.runComparativeEvaluation();
                break;
            case 'rl':
            case 'rq4':
                await controller.runRLEvaluation();
                break;
            case 'scalability':
                await controller.runScalabilityAnalysis();
                break;
            case 'compare':
                if (args.length < 2) {
                    console.error('Usage: compare <experiment_id1> <experiment_id2> ...');
                    process.exit(1);
                }
                await controller.generateComparisonReport(args.slice(1));
                break;
            default:
                console.log(`
SIKG Experiment Suite

Usage: npm run experiment:<command>

Commands:
  all          - Run complete experiment suite (RQ1-RQ4)
  effectiveness - Run effectiveness evaluation (RQ1)  
  efficiency   - Run efficiency evaluation (RQ2)
  comparison   - Run baseline comparison (RQ3)
  rl           - Run reinforcement learning evaluation (RQ4)
  scalability  - Run scalability analysis
  compare <ids> - Compare multiple experiment results

Examples:
  npm run experiment:all
  npm run experiment:effectiveness
  npm run experiment:compare exp_123 exp_456
                `);
                break;
        }
    } catch (error) {
        Logger.error('❌ Experiment failed:', error);
        process.exit(1);
    }
}

// Export main components
export {
    ExperimentController,
    ExperimentRunner,
    ResultsAnalyzer,
    DEFAULT_EXPERIMENT_CONFIG
};

// Export types
export type {
    ExperimentConfig,
    ExperimentResult,
    AnalysisReport
};

// Auto-run CLI if this file is executed directly
if (require.main === module) {
    runExperimentCLI();
}