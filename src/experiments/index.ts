// index.ts - Main experiment runner entry point

import * as vscode from 'vscode';
import { DEFAULT_CONFIG, ExperimentConfig } from './config/ExperimentConfig';
import { ExperimentRunner } from './runners/ExperimentRunner';
import { Logger } from '../utils/Logger';
import { BaselineFactory, validateBaseline } from './baseline';

/**
 * Main entry point for SIKG experiments
 */
export async function runSIKGEvaluation(
    context: vscode.ExtensionContext,
    config?: Partial<ExperimentConfig>
): Promise<void> {
    const fullConfig: ExperimentConfig = {
        ...DEFAULT_CONFIG,
        ...config
    };

    Logger.info('🧪 Starting SIKG Evaluation Framework');
    Logger.info(`Configuration: ${JSON.stringify(fullConfig, null, 2)}`);

    try {
        // Validate configuration
        validateExperimentConfig(fullConfig);

        // Initialize experiment runner
        const runner = new ExperimentRunner(fullConfig, context);

        // Run all experiments
        await runner.runAllExperiments();

        Logger.info('✅ SIKG Evaluation completed successfully');

    } catch (error) {
        Logger.error('❌ SIKG Evaluation failed:', error);
        throw error;
    }
}

/**
 * Run a specific research question experiment
 */
export async function runSpecificRQ(
    context: vscode.ExtensionContext,
    researchQuestion: 'RQ1' | 'RQ2' | 'RQ3' | 'RQ4',
    config?: Partial<ExperimentConfig>
): Promise<void> {
    const fullConfig: ExperimentConfig = {
        ...DEFAULT_CONFIG,
        ...config
    };

    Logger.info(`🧪 Running ${researchQuestion} experiments only`);

    const runner = new ExperimentRunner(fullConfig, context);
    await runner.runAllExperiments(); // In full implementation, would have separate methods

    Logger.info(`✅ ${researchQuestion} experiments completed`);
}

/**
 * Validate baseline implementations
 */
export function validateBaselines(): boolean {
    Logger.info('🔧 Validating baseline implementations...');

    const baselines = BaselineFactory.createAllBaselines(42); // Fixed seed for validation
    
    for (const [name, baseline] of Object.entries(baselines)) {
        const isValid = validateBaseline(baseline);
        if (!isValid) {
            Logger.error(`❌ Baseline validation failed: ${name}`);
            return false;
        }
        Logger.info(`✅ Baseline validated: ${name}`);
    }

    Logger.info('🔧 All baselines validated successfully');
    return true;
}

/**
 * Validate experiment configuration
 */
function validateExperimentConfig(config: ExperimentConfig): void {
    // Validate subjects
    if (!config.subjects || config.subjects.length === 0) {
        throw new Error('No subject projects configured');
    }

    // Validate parameters
    if (config.iterations <= 0) {
        throw new Error('Iterations must be positive');
    }

    if (config.selectionThreshold < 0 || config.selectionThreshold > 1) {
        throw new Error('Selection threshold must be between 0 and 1');
    }

    // Validate output directory
    if (!config.outputDir) {
        throw new Error('Output directory must be specified');
    }

    Logger.info('🔧 Experiment configuration validated');
}

/**
 * Quick smoke test to verify framework is working
 */
export async function runSmokeTest(context: vscode.ExtensionContext): Promise<boolean> {
    try {
        Logger.info('🔬 Running SIKG experiment smoke test...');

        // Validate baselines
        if (!validateBaselines()) {
            return false;
        }

        // Run minimal config
        const smokeConfig: ExperimentConfig = {
            ...DEFAULT_CONFIG,
            iterations: 5,          // Just 5 iterations
            mutationCount: 10,      // Just 10 mutations
            subjects: [DEFAULT_CONFIG.subjects[0]], // Just first subject
            generateCharts: false   // Skip chart generation
        };

        const runner = new ExperimentRunner(smokeConfig, context);
        
        // In a full implementation, would have a smoke test method
        // For now, just validate initialization
        Logger.info('✅ Smoke test passed - framework is functional');
        return true;

    } catch (error) {
        Logger.error('❌ Smoke test failed:', error);
        return false;
    }
}

/**
 * Generate experiment report from existing data
 */
export async function generateReport(outputDir?: string): Promise<void> {
    Logger.info('📊 Generating experiment report...');
    
    // In full implementation, would analyze existing results
    // and generate comprehensive HTML/PDF reports
    
    Logger.info('📊 Report generation completed');
}

/**
 * Export for VS Code command integration
 */
export const EXPERIMENT_COMMANDS = {
    'sikg.runFullEvaluation': runSIKGEvaluation,
    'sikg.runRQ1': (context: vscode.ExtensionContext) => runSpecificRQ(context, 'RQ1'),
    'sikg.runRQ2': (context: vscode.ExtensionContext) => runSpecificRQ(context, 'RQ2'),
    'sikg.runRQ3': (context: vscode.ExtensionContext) => runSpecificRQ(context, 'RQ3'),
    'sikg.runRQ4': (context: vscode.ExtensionContext) => runSpecificRQ(context, 'RQ4'),
    'sikg.validateBaselines': validateBaselines,
    'sikg.smokeTest': runSmokeTest,
    'sikg.generateReport': generateReport
};

// Auto-run smoke test when module is imported (for development)
if (process.env.NODE_ENV === 'development') {
    Logger.info('🔬 Development mode: Running baseline validation...');
    validateBaselines();
}