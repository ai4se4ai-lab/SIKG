// ConfigManager.ts - Enhanced with RL Configuration Support

import * as vscode from 'vscode';
import { MDPConfig, RLConfig, PolicyConfig } from '../ml/types/ReinforcementTypes';

export class ConfigManager {
    private context: vscode.ExtensionContext;
    private initialized: boolean = false;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * Initialize the configuration manager
     */
    public async initialize(): Promise<void> {
        // Register configuration change handlers
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('sikg')) {
                // Configuration changed, reload values
                this.loadConfiguration();
            }
        });

        // Initial configuration load
        this.loadConfiguration();
        this.initialized = true;
    }

    /**
     * Load configuration values from settings
     */
    private loadConfiguration(): void {
        // Load values into memory for faster access
    }

    /**
     * Get log level from configuration
     */
    public getLogLevel(): 'debug' | 'info' | 'warn' | 'error' {
        return vscode.workspace.getConfiguration('sikg').get<'debug' | 'info' | 'warn' | 'error'>('logLevel', 'info');
    }

    /**
     * Check if RL is enabled
     */
    public isRLEnabled(): boolean {
        return vscode.workspace.getConfiguration('sikg.reinforcementLearning').get<boolean>('enabled', false);
    }

    /**
     * Get RL configuration parameters
     */
    public getRLParameters(): RLConfig {
        const rlConfig = vscode.workspace.getConfiguration('sikg.reinforcementLearning');
        
        return {
            learningRate: rlConfig.get<number>('learningRate', 0.01),
            discountFactor: rlConfig.get<number>('discountFactor', 0.95),
            explorationRate: rlConfig.get<number>('explorationRate', 0.1),
            updateFrequency: rlConfig.get<number>('updateFrequency', 10)
        };
    }

    /**
     * Get MDP configuration parameters
     */
    public getMDPParameters(): MDPConfig {
        const mdpConfig = vscode.workspace.getConfiguration('sikg.reinforcementLearning.mdp');
        
        return {
            learningRate: mdpConfig.get<number>('learningRate', 0.01),
            discountFactor: mdpConfig.get<number>('discountFactor', 0.95),
            explorationRate: mdpConfig.get<number>('explorationRate', 0.1),
            updateFrequency: mdpConfig.get<number>('updateFrequency', 10)
        };
    }

    /**
     * Get policy configuration parameters
     */
    public getPolicyConfig(): PolicyConfig {
        const policyConfig = vscode.workspace.getConfiguration('sikg.reinforcementLearning.policy');
        
        return {
            policyType: policyConfig.get<string>('type', 'epsilon-greedy'),
            stateFeatures: policyConfig.get<string[]>('stateFeatures', [
                'changeComplexity', 'historicalAccuracy', 'testCoverage', 
                'codeChurn', 'graphDensity', 'projectSize'
            ]),
            rewardShaping: policyConfig.get<boolean>('rewardShaping', true),
            temperature: policyConfig.get<number>('temperature', 1.0),
            ucbConstant: policyConfig.get<number>('ucbConstant', 2.0)
        };
    }

    /**
     * Get RL reward function weights
     */
    public getRewardWeights(): RewardWeights {
        const rewardConfig = vscode.workspace.getConfiguration('sikg.reinforcementLearning.rewards');
        
        return {
            accuracyWeight: rewardConfig.get<number>('accuracyWeight', 0.3),
            precisionWeight: rewardConfig.get<number>('precisionWeight', 0.2),
            recallWeight: rewardConfig.get<number>('recallWeight', 0.2),
            f1ScoreWeight: rewardConfig.get<number>('f1ScoreWeight', 0.3),
            efficiencyWeight: rewardConfig.get<number>('efficiencyWeight', 0.1),
            explorationBonus: rewardConfig.get<number>('explorationBonus', 0.05)
        };
    }

    /**
     * Get RL convergence settings
     */
    public getConvergenceSettings(): ConvergenceSettings {
        const convergenceConfig = vscode.workspace.getConfiguration('sikg.reinforcementLearning.convergence');
        
        return {
            maxEpisodes: convergenceConfig.get<number>('maxEpisodes', 1000),
            convergenceThreshold: convergenceConfig.get<number>('threshold', 0.01),
            patienceEpisodes: convergenceConfig.get<number>('patienceEpisodes', 50),
            minImprovement: convergenceConfig.get<number>('minImprovement', 0.001)
        };
    }

    /**
     * Set RL enabled state
     */
    public async setRLEnabled(enabled: boolean): Promise<void> {
        await vscode.workspace.getConfiguration('sikg.reinforcementLearning')
            .update('enabled', enabled, vscode.ConfigurationTarget.Workspace);
    }

    /**
     * Update RL learning rate
     */
    public async updateLearningRate(learningRate: number): Promise<void> {
        await vscode.workspace.getConfiguration('sikg.reinforcementLearning')
            .update('learningRate', learningRate, vscode.ConfigurationTarget.Workspace);
    }

    /**
     * Update exploration rate
     */
    public async updateExplorationRate(explorationRate: number): Promise<void> {
        await vscode.workspace.getConfiguration('sikg.reinforcementLearning')
            .update('explorationRate', explorationRate, vscode.ConfigurationTarget.Workspace);
    }

    /**
     * Get code file extensions to consider
     */
    public getCodeFileExtensions(): string[] {
        return vscode.workspace.getConfiguration('sikg').get<string[]>('codeFileExtensions', [
            'py',      // Python files
            'js',      // JavaScript files
            'ts',      // TypeScript files
            'jsx',     // React JavaScript files
            'tsx',     // React TypeScript files
            'java',    // Java files
            'cs',      // C# files
            'go'       // Go files
        ]);
    }

    /**
     * Get test file patterns to identify test files
     */
    public getTestFilePatterns(): string[] {
        return vscode.workspace.getConfiguration('sikg').get<string[]>('testFilePatterns', [
            // Python test patterns
            '**/test_*.py',
            '**/*_test.py',
            '**/tests.py',
            '**/test*.py',
            
            // JavaScript/TypeScript test patterns
            '**/*.test.js',
            '**/*.test.ts',
            '**/*.test.jsx',
            '**/*.test.tsx',
            '**/*.spec.js',
            '**/*.spec.ts',
            '**/*.spec.jsx',
            '**/*.spec.tsx',
            
            // Java test patterns
            '**/*Test.java',
            '**/*Tests.java',
            '**/Test*.java',
            
            // C# test patterns
            '**/*Test.cs',
            '**/*Tests.cs',
            '**/Test*.cs',
            
            // Go test patterns
            '**/*_test.go'
        ]);
    }

    /**
     * Get patterns to exclude from analysis
     */
    public getExcludePatterns(): string[] {
        return vscode.workspace.getConfiguration('sikg').get<string[]>('excludePatterns', [
            '**/node_modules/**',
            '**/dist/**',
            '**/build/**',
            '**/coverage/**',
            '**/.git/**',
            '**/venv/**',
            '**/env/**',
            '**/__pycache__/**',
            '**/target/**',      // Java/Maven
            '**/bin/**',         // C#/.NET
            '**/obj/**',         // C#/.NET
            '**/vendor/**'       // Go/PHP
        ]);
    }

    /**
     * Get maximum traversal depth for impact propagation
     */
    public getMaxTraversalDepth(): number {
        return vscode.workspace.getConfiguration('sikg').get<number>('maxTraversalDepth', 5);
    }

    /**
     * Get minimum impact threshold to continue propagation
     */
    public getMinImpactThreshold(): number {
        return vscode.workspace.getConfiguration('sikg').get<number>('minImpactThreshold', 0.05);
    }

    /**
     * Get high impact threshold for feedback learning
     */
    public getHighImpactThreshold(): number {
        return vscode.workspace.getConfiguration('sikg').get<number>('highImpactThreshold', 0.7);
    }

    /**
     * Get low impact threshold for feedback learning
     */
    public getLowImpactThreshold(): number {
        return vscode.workspace.getConfiguration('sikg').get<number>('lowImpactThreshold', 0.3);
    }

    /**
     * Get supported programming languages
     */
    public getSupportedLanguages(): string[] {
        return [
            'python',      // VS Code language identifier for Python
            'javascript',  // VS Code language identifier for JavaScript
            'typescript',  // VS Code language identifier for TypeScript
            'java',        // VS Code language identifier for Java
            'csharp',      // VS Code language identifier for C#
            'go'           // VS Code language identifier for Go
        ];
    }

    /**
     * Get language from file extension
     */
    public getLanguageFromExtension(extension: string): string {
        const extensionMap: Record<string, string> = {
            '.py': 'python',
            '.js': 'javascript',
            '.jsx': 'javascript',
            '.ts': 'typescript',
            '.tsx': 'typescript',
            '.java': 'java',
            '.cs': 'csharp',
            '.go': 'go'
        };

        const normalizedExt = extension.toLowerCase();
        return extensionMap[normalizedExt] || 'plaintext';
    }

    /**
     * Check if a language is supported
     */
    public isLanguageSupported(language: string): boolean {
        return this.getSupportedLanguages().includes(language.toLowerCase());
    }

    /**
     * Get file extensions for a specific language
     */
    public getExtensionsForLanguage(language: string): string[] {
        const languageExtensions: Record<string, string[]> = {
            'python': ['.py'],
            'javascript': ['.js', '.jsx'],
            'typescript': ['.ts', '.tsx'],
            'java': ['.java'],
            'csharp': ['.cs'],
            'go': ['.go']
        };

        return languageExtensions[language.toLowerCase()] || [];
    }

    /**
     * Get test frameworks for a language
     */
    public getTestFrameworksForLanguage(language: string): string[] {
        const frameworkMap: Record<string, string[]> = {
            'python': ['unittest', 'pytest'],
            'javascript': ['jest', 'mocha', 'jasmine'],
            'typescript': ['jest', 'mocha', 'jasmine'],
            'java': ['junit', 'testng'],
            'csharp': ['nunit', 'xunit', 'mstest'],
            'go': ['testing']
        };

        return frameworkMap[language.toLowerCase()] || [];
    }

    /**
     * Get RL monitoring settings
     */
    public getMonitoringSettings(): MonitoringSettings {
        const monitoringConfig = vscode.workspace.getConfiguration('sikg.reinforcementLearning.monitoring');
        
        return {
            enableMetrics: monitoringConfig.get<boolean>('enableMetrics', true),
            metricsInterval: monitoringConfig.get<number>('metricsInterval', 1000),
            alertThresholds: {
                accuracyDrop: monitoringConfig.get<number>('accuracyDropThreshold', 0.1),
                performanceDegradation: monitoringConfig.get<number>('performanceDegradationThreshold', 0.05)
            },
            dataRetention: {
                maxEpisodes: monitoringConfig.get<number>('maxEpisodes', 10000),
                maxAge: monitoringConfig.get<number>('maxAgeMs', 30 * 24 * 60 * 60 * 1000) // 30 days
            }
        };
    }

    /**
     * Get adaptive learning settings
     */
    public getAdaptiveLearningSettings(): AdaptiveLearningSettings {
        const adaptiveConfig = vscode.workspace.getConfiguration('sikg.reinforcementLearning.adaptive');
        
        return {
            enableAdaptiveLearning: adaptiveConfig.get<boolean>('enabled', true),
            learningRateDecay: adaptiveConfig.get<number>('learningRateDecay', 0.999),
            explorationDecay: adaptiveConfig.get<number>('explorationDecay', 0.995),
            adaptiveThresholds: adaptiveConfig.get<boolean>('adaptiveThresholds', true),
            performanceWindow: adaptiveConfig.get<number>('performanceWindow', 50)
        };
    }

    /**
     * Get experiment configuration
     */
    public getExperimentConfig(): ExperimentConfig {
        const experimentConfig = vscode.workspace.getConfiguration('sikg.reinforcementLearning.experiments');
        
        return {
            enableExperiments: experimentConfig.get<boolean>('enabled', false),
            experimentDuration: experimentConfig.get<number>('duration', 1000),
            baselineComparison: experimentConfig.get<boolean>('baselineComparison', true),
            autoTuning: experimentConfig.get<boolean>('autoTuning', false),
            hyperparameterSearch: {
                learningRateRange: experimentConfig.get<number[]>('learningRateRange', [0.001, 0.1]),
                explorationRateRange: experimentConfig.get<number[]>('explorationRateRange', [0.01, 0.3]),
                maxIterations: experimentConfig.get<number>('maxIterations', 50)
            }
        };
    }

    /**
     * Get feature engineering settings
     */
    public getFeatureEngineeringSettings(): FeatureEngineeringSettings {
        const featureConfig = vscode.workspace.getConfiguration('sikg.reinforcementLearning.features');
        
        return {
            enableFeatureEngineering: featureConfig.get<boolean>('enabled', true),
            normalizeFeatures: featureConfig.get<boolean>('normalize', true),
            featureSelection: featureConfig.get<boolean>('selection', false),
            temporalFeatures: featureConfig.get<boolean>('temporal', true),
            projectSpecificFeatures: featureConfig.get<boolean>('projectSpecific', true),
            customFeatures: featureConfig.get<string[]>('custom', [])
        };
    }

    /**
     * Save RL configuration to workspace
     */
    public async saveRLConfiguration(config: Partial<RLConfig>): Promise<void> {
        const rlConfig = vscode.workspace.getConfiguration('sikg.reinforcementLearning');
        
        if (config.learningRate !== undefined) {
            await rlConfig.update('learningRate', config.learningRate, vscode.ConfigurationTarget.Workspace);
        }
        if (config.discountFactor !== undefined) {
            await rlConfig.update('discountFactor', config.discountFactor, vscode.ConfigurationTarget.Workspace);
        }
        if (config.explorationRate !== undefined) {
            await rlConfig.update('explorationRate', config.explorationRate, vscode.ConfigurationTarget.Workspace);
        }
        if (config.updateFrequency !== undefined) {
            await rlConfig.update('updateFrequency', config.updateFrequency, vscode.ConfigurationTarget.Workspace);
        }
    }

    /**
     * Reset RL configuration to defaults
     */
    public async resetRLConfiguration(): Promise<void> {
        const rlConfig = vscode.workspace.getConfiguration('sikg.reinforcementLearning');
        
        await rlConfig.update('learningRate', undefined, vscode.ConfigurationTarget.Workspace);
        await rlConfig.update('discountFactor', undefined, vscode.ConfigurationTarget.Workspace);
        await rlConfig.update('explorationRate', undefined, vscode.ConfigurationTarget.Workspace);
        await rlConfig.update('updateFrequency', undefined, vscode.ConfigurationTarget.Workspace);
        await rlConfig.update('enabled', false, vscode.ConfigurationTarget.Workspace);
    }

    /**
     * Get configuration schema for validation
     */
    public getConfigurationSchema(): ConfigurationSchema {
        return {
            reinforcementLearning: {
                enabled: { type: 'boolean', default: false, description: 'Enable reinforcement learning' },
                learningRate: { type: 'number', default: 0.01, min: 0.001, max: 1.0, description: 'Learning rate for RL algorithms' },
                discountFactor: { type: 'number', default: 0.95, min: 0.0, max: 1.0, description: 'Discount factor for future rewards' },
                explorationRate: { type: 'number', default: 0.1, min: 0.0, max: 1.0, description: 'Exploration rate for epsilon-greedy policy' },
                updateFrequency: { type: 'number', default: 10, min: 1, max: 100, description: 'Frequency of policy updates' }
            },
            policy: {
                type: { type: 'string', default: 'epsilon-greedy', enum: ['epsilon-greedy', 'ucb', 'softmax', 'greedy'], description: 'Policy type' },
                stateFeatures: { type: 'array', default: ['changeComplexity', 'historicalAccuracy'], description: 'Features to include in state representation' },
                rewardShaping: { type: 'boolean', default: true, description: 'Enable reward shaping' },
                temperature: { type: 'number', default: 1.0, min: 0.1, max: 10.0, description: 'Temperature for softmax policy' },
                ucbConstant: { type: 'number', default: 2.0, min: 0.1, max: 10.0, description: 'Exploration constant for UCB policy' }
            },
            rewards: {
                accuracyWeight: { type: 'number', default: 0.3, min: 0.0, max: 1.0, description: 'Weight for accuracy in reward function' },
                precisionWeight: { type: 'number', default: 0.2, min: 0.0, max: 1.0, description: 'Weight for precision in reward function' },
                recallWeight: { type: 'number', default: 0.2, min: 0.0, max: 1.0, description: 'Weight for recall in reward function' },
                f1ScoreWeight: { type: 'number', default: 0.3, min: 0.0, max: 1.0, description: 'Weight for F1-score in reward function' },
                efficiencyWeight: { type: 'number', default: 0.1, min: 0.0, max: 1.0, description: 'Weight for efficiency in reward function' },
                explorationBonus: { type: 'number', default: 0.05, min: 0.0, max: 0.5, description: 'Bonus for exploration' }
            }
        };
    }

    /**
     * Validate RL configuration
     */
    public validateRLConfiguration(): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];
        
        const rlConfig = this.getRLParameters();
        const schema = this.getConfigurationSchema();
        
        // Validate learning rate
        if (rlConfig.learningRate < 0.001 || rlConfig.learningRate > 1.0) {
            errors.push('Learning rate must be between 0.001 and 1.0');
        }
        if (rlConfig.learningRate > 0.1) {
            warnings.push('Learning rate is quite high, may cause instability');
        }
        
        // Validate discount factor
        if (rlConfig.discountFactor < 0.0 || rlConfig.discountFactor > 1.0) {
            errors.push('Discount factor must be between 0.0 and 1.0');
        }
        
        // Validate exploration rate
        if (rlConfig.explorationRate < 0.0 || rlConfig.explorationRate > 1.0) {
            errors.push('Exploration rate must be between 0.0 and 1.0');
        }
        if (rlConfig.explorationRate > 0.5) {
            warnings.push('High exploration rate may slow convergence');
        }
        
        // Validate policy configuration
        const policyConfig = this.getPolicyConfig();
        if (policyConfig.stateFeatures.length === 0) {
            errors.push('At least one state feature must be specified');
        }
        
        // Validate reward weights
        const rewardWeights = this.getRewardWeights();
        const totalWeight = rewardWeights.accuracyWeight + rewardWeights.precisionWeight + 
                           rewardWeights.recallWeight + rewardWeights.f1ScoreWeight + 
                           rewardWeights.efficiencyWeight;
        
        if (Math.abs(totalWeight - 1.0) > 0.1) {
            warnings.push('Reward weights should sum to approximately 1.0');
        }
        
        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Get configuration export for backup/restore
     */
    public exportConfiguration(): ConfigurationExport {
        return {
            version: '1.0',
            timestamp: new Date().toISOString(),
            rl: this.getRLParameters(),
            policy: this.getPolicyConfig(),
            rewards: this.getRewardWeights(),
            convergence: this.getConvergenceSettings(),
            monitoring: this.getMonitoringSettings(),
            adaptive: this.getAdaptiveLearningSettings(),
            features: this.getFeatureEngineeringSettings()
        };
    }

    /**
     * Import configuration from backup
     */
    public async importConfiguration(config: ConfigurationExport): Promise<void> {
        if (config.version !== '1.0') {
            throw new Error('Unsupported configuration version');
        }
        
        // Save RL configuration
        await this.saveRLConfiguration(config.rl);
        
        // Save policy configuration
        const policyConfig = vscode.workspace.getConfiguration('sikg.reinforcementLearning.policy');
        await policyConfig.update('type', config.policy.policyType, vscode.ConfigurationTarget.Workspace);
        await policyConfig.update('stateFeatures', config.policy.stateFeatures, vscode.ConfigurationTarget.Workspace);
        await policyConfig.update('rewardShaping', config.policy.rewardShaping, vscode.ConfigurationTarget.Workspace);
        
        // Save reward configuration
        const rewardConfig = vscode.workspace.getConfiguration('sikg.reinforcementLearning.rewards');
        await rewardConfig.update('accuracyWeight', config.rewards.accuracyWeight, vscode.ConfigurationTarget.Workspace);
        await rewardConfig.update('precisionWeight', config.rewards.precisionWeight, vscode.ConfigurationTarget.Workspace);
        await rewardConfig.update('recallWeight', config.rewards.recallWeight, vscode.ConfigurationTarget.Workspace);
        await rewardConfig.update('f1ScoreWeight', config.rewards.f1ScoreWeight, vscode.ConfigurationTarget.Workspace);
        await rewardConfig.update('efficiencyWeight', config.rewards.efficiencyWeight, vscode.ConfigurationTarget.Workspace);
        
        // Enable RL if it was enabled in the backup
        if (config.rl) {
            await this.setRLEnabled(true);
        }
    }
}

// Supporting interfaces
interface RewardWeights {
    accuracyWeight: number;
    precisionWeight: number;
    recallWeight: number;
    f1ScoreWeight: number;
    efficiencyWeight: number;
    explorationBonus: number;
}

interface ConvergenceSettings {
    maxEpisodes: number;
    convergenceThreshold: number;
    patienceEpisodes: number;
    minImprovement: number;
}

interface MonitoringSettings {
    enableMetrics: boolean;
    metricsInterval: number;
    alertThresholds: {
        accuracyDrop: number;
        performanceDegradation: number;
    };
    dataRetention: {
        maxEpisodes: number;
        maxAge: number;
    };
}

interface AdaptiveLearningSettings {
    enableAdaptiveLearning: boolean;
    learningRateDecay: number;
    explorationDecay: number;
    adaptiveThresholds: boolean;
    performanceWindow: number;
}

interface ExperimentConfig {
    enableExperiments: boolean;
    experimentDuration: number;
    baselineComparison: boolean;
    autoTuning: boolean;
    hyperparameterSearch: {
        learningRateRange: number[];
        explorationRateRange: number[];
        maxIterations: number;
    };
}

interface FeatureEngineeringSettings {
    enableFeatureEngineering: boolean;
    normalizeFeatures: boolean;
    featureSelection: boolean;
    temporalFeatures: boolean;
    projectSpecificFeatures: boolean;
    customFeatures: string[];
}

interface ConfigurationSchema {
    reinforcementLearning: Record<string, {
        type: string;
        default: any;
        min?: number;
        max?: number;
        enum?: string[];
        description: string;
    }>;
    policy: Record<string, {
        type: string;
        default: any;
        min?: number;
        max?: number;
        enum?: string[];
        description: string;
    }>;
    rewards: Record<string, {
        type: string;
        default: any;
        min?: number;
        max?: number;
        description: string;
    }>;
}

interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}

interface ConfigurationExport {
    version: string;
    timestamp: string;
    rl: RLConfig;
    policy: PolicyConfig;
    rewards: RewardWeights;
    convergence: ConvergenceSettings;
    monitoring: MonitoringSettings;
    adaptive: AdaptiveLearningSettings;
    features: FeatureEngineeringSettings;
}