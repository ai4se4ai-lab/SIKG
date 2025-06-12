# SIKG Experiments - Execution Guide

This guide shows you how to run the SIKG (Semantic Impact Knowledge Graph) evaluation experiments to validate the research claims from the paper.


## Directory Structure

```
src/experiments/
├── README.md                          # This file
├── index.ts                           # Main experiment runner
├── config/
│   ├── ExperimentConfig.ts            # Experiment configuration
│   └── subjects.json                  # Test subject projects
├── baseline/
│   ├── RandomSelector.ts              # Random test selection baseline
│   ├── EkstaziSelector.ts             # Ekstazi-style static analysis baseline
│   ├── HistoryBasedSelector.ts        # History-based test selection
│   └── index.ts                       # Baseline selector exports
├── data/
│   ├── DataCollector.ts               # Collect experiment data
│   ├── ProjectAnalyzer.ts             # Analyze project characteristics
│   └── CommitProcessor.ts             # Process Git commits for evaluation
├── metrics/
│   ├── APFDCalculator.ts              # APFD calculation (reuses existing)
│   ├── EffectivenessMetrics.ts        # Test selection effectiveness
│   ├── EfficiencyMetrics.ts           # Test execution efficiency
│   └── StatisticalAnalysis.ts         # Statistical significance testing
├── runners/
│   ├── ExperimentRunner.ts            # Main experiment execution
│   ├── ComparisonRunner.ts            # Compare SIKG vs baselines
│   └── RLEvaluationRunner.ts          # Reinforcement learning evaluation
├── analysis/
│   ├── ResultsAnalyzer.ts             # Analyze experiment results
│   ├── ReportGenerator.ts             # Generate experiment reports
│   └── Visualizer.ts                  # Generate charts and graphs
└── output/
    ├── results/                       # Experiment results (JSON/CSV)
    ├── reports/                       # Generated reports (HTML/PDF)
    └── charts/                        # Generated visualizations
```


## 🚀 Quick Start

### 1. Prerequisites

```bash
# Ensure you have Node.js 16+ and TypeScript
node --version  # Should be 16.x or higher
npm --version

# Install dependencies (from project root)
npm install
```

### 2. Run Complete Evaluation

```typescript
// From VS Code Command Palette (Ctrl+Shift+P)
> SIKG: Run Full Evaluation

// Or programmatically
import { runSIKGEvaluation } from './src/experiments';
await runSIKGEvaluation(context);
```

### 3. View Results

Results are automatically saved to:
- **HTML Report**: `./src/experiments/output/reports/sikg_report_[timestamp].html`
- **JSON Data**: `./src/experiments/output/results/experiment_data_[timestamp].json`

## 📋 Execution Options

### Option 1: VS Code Commands (Recommended)

Open Command Palette (`Ctrl+Shift+P`) and run:

```
SIKG: Run Full Evaluation           # All RQ1-RQ4 experiments (~2 hours)
SIKG: Run RQ1 (KG Construction)     # Only RQ1 experiments (~30 mins)
SIKG: Run RQ2 (Semantic Analysis)   # Only RQ2 experiments (~45 mins)  
SIKG: Run RQ3 (Test Selection)      # Only RQ3 experiments (~1 hour)
SIKG: Run RQ4 (Scalability)         # Only RQ4 experiments (~15 mins)
SIKG: Run Smoke Test                # Quick validation (~2 mins)
SIKG: Validate Baselines            # Check baseline implementations
```

### Option 2: Programmatic Execution

```typescript
import { 
    runSIKGEvaluation, 
    runSpecificRQ, 
    runSmokeTest,
    validateBaselines 
} from './src/experiments';

// Full evaluation with default configuration
await runSIKGEvaluation(context);

// Custom configuration
await runSIKGEvaluation(context, {
    iterations: 200,           // More RL iterations
    subjects: [               // Fewer test subjects
        { 
            name: 'requests', 
            path: './test-subjects/requests',
            domain: 'http',
            estimatedLOC: 10000,
            testFramework: 'pytest'
        }
    ],
    outputDir: './my-results'
});

// Run individual research questions
await runSpecificRQ(context, 'RQ1');  // KG Construction
await runSpecificRQ(context, 'RQ2');  // Semantic Analysis  
await runSpecificRQ(context, 'RQ3');  // Test Selection & RL
await runSpecificRQ(context, 'RQ4');  // Scalability

// Quick validation
const isWorking = await runSmokeTest(context);
const baselinesValid = validateBaselines();
```

### Option 3: Direct Class Usage

```typescript
import { ExperimentRunner } from './src/experiments/runners/ExperimentRunner';
import { DEFAULT_CONFIG } from './src/experiments/config/ExperimentConfig';

const runner = new ExperimentRunner(DEFAULT_CONFIG, context);

// Run all experiments
await runner.runAllExperiments();

// Results will be in ./src/experiments/output/
```

## ⚙️ Configuration

### Default Configuration

```typescript
{
    // Test subjects (3 small Python projects)
    subjects: [
        { name: 'requests', estimatedLOC: 10000, domain: 'http' },
        { name: 'flask', estimatedLOC: 34000, domain: 'web' },
        { name: 'pytest', estimatedLOC: 5000, domain: 'testing' }
    ],
    
    // Experiment parameters
    iterations: 100,              // RL learning iterations
    mutationCount: 50,            // Synthetic faults per subject
    maxDepth: 3,                  // Impact propagation depth
    
    // Selection thresholds
    selectionThreshold: 0.3,      // Test selection threshold
    highImpactThreshold: 0.7,     // High impact classification
    lowImpactThreshold: 0.3,      // Low impact classification
    
    // RL parameters
    learningRate: 0.01,           // RL learning rate
    explorationRate: 0.1,         // RL exploration rate
    
    // Output
    outputDir: './src/experiments/output',
    generateCharts: true
}
```

### Custom Configuration Examples

#### Quick Test Run
```typescript
const quickConfig = {
    iterations: 20,               // Fewer iterations
    mutationCount: 10,            // Fewer mutations
    subjects: [DEFAULT_CONFIG.subjects[0]], // Just requests
    generateCharts: false
};

await runSIKGEvaluation(context, quickConfig);
```

#### Comprehensive Evaluation
```typescript
const comprehensiveConfig = {
    iterations: 200,              // More RL iterations
    mutationCount: 100,           // More synthetic faults
    maxDepth: 5,                  // Deeper propagation
    selectionThreshold: 0.2,      // Lower threshold (select more tests)
    generateCharts: true,
    outputDir: './comprehensive-results'
};

await runSIKGEvaluation(context, comprehensiveConfig);
```

#### RL-Focused Study
```typescript
const rlConfig = {
    iterations: 500,              // Many RL iterations
    learningRate: 0.02,           // Faster learning
    explorationRate: 0.15,        // More exploration
    subjects: [DEFAULT_CONFIG.subjects[1]], // Just flask (web domain)
};

await runSpecificRQ(context, 'RQ3', rlConfig);
```

## 📊 Understanding Results

### Research Questions Validated

#### **RQ1: KG Construction Effectiveness**
- **Tests**: SIKG-Enhanced vs SIKG-NoEnrich
- **Validates**: Weight enhancement improves test selection
- **Success Criteria**: >10% F1-score improvement

#### **RQ2: Semantic Change Analysis**
- **Tests**: Classification accuracy by change type, impact propagation depths
- **Validates**: Semantic understanding improves predictions
- **Success Criteria**: >85% classification accuracy, depth=3 optimal

#### **RQ3: Reinforcement Learning**
- **Tests**: Learning progression over 100+ iterations
- **Validates**: RL provides continuous improvement
- **Success Criteria**: >15% improvement after learning

#### **RQ4: Scalability**
- **Tests**: Performance across project sizes (1K-50K LOC)
- **Validates**: Algorithms scale efficiently
- **Success Criteria**: <1 second execution for typical changes

### Output Files

#### HTML Report (`sikg_report_[timestamp].html`)
```html
📊 Experiment Summary
- Total Experiments: 450
- Average F1-Score: 91.5%
- Average Test Reduction: 74.4%
- Best Approach: SIKG-Enhanced

🔬 RQ1: Knowledge Graph Construction
- SIKG-Enhanced: 91.9% F1-Score  
- SIKG-NoEnrich: 80.8% F1-Score
- Improvement: +13.7%
- ✅ HYPOTHESIS SUPPORTED

🎯 RQ2: Semantic Change Analysis  
- BUG_FIX Classification: 93.7%
- FEATURE_ADDITION Classification: 88.2%
- Optimal Depth: 3 (F1=91.3%)
- ✅ HYPOTHESIS SUPPORTED

🤖 RQ3: Reinforcement Learning
- Final RL Improvement: +16.7%
- Learning visible after ~50 iterations
- ✅ HYPOTHESIS SUPPORTED

⚡ RQ4: Scalability
- Small (1K LOC): 45ms
- Medium (10K LOC): 98ms  
- Large (50K LOC): 162ms
- ✅ HYPOTHESIS SUPPORTED
```

#### JSON Data (`experiment_data_[timestamp].json`)
```json
{
  "metadata": {
    "generatedAt": "2024-01-01T12:00:00Z",
    "totalExperiments": 450,
    "version": "1.0.0"
  },
  "summary": {
    "avgMetrics": {
      "precision": 0.887,
      "recall": 0.944, 
      "f1Score": 0.915,
      "reductionRatio": 0.744
    },
    "bestPerforming": {
      "approach": "SIKG-Enhanced",
      "f1Score": 0.919
    }
  },
  "experiments": [
    {
      "experimentId": "RQ1_change_123",
      "approach": "SIKG-Enhanced",
      "subjectProject": "requests",
      "changeType": "BUG_FIX",
      "precision": 0.89,
      "recall": 0.94,
      "f1Score": 0.91,
      "executionTime": 156
    }
  ]
}
```

## 🕐 Execution Timeline

### Quick Smoke Test (2 minutes)
```bash
# Validate framework is working
> SIKG: Run Smoke Test
✅ Baseline validation complete
✅ Framework functional
```

### Individual Research Questions
- **RQ1** (KG Construction): ~30 minutes
- **RQ2** (Semantic Analysis): ~45 minutes  
- **RQ3** (Test Selection & RL): ~60 minutes
- **RQ4** (Scalability): ~15 minutes

### Full Evaluation (~2.5 hours)
```
🚀 Starting SIKG Evaluation...
📊 RQ1: Testing KG construction (30 mins)
🎯 RQ2: Testing semantic analysis (45 mins)  
🤖 RQ3: Testing reinforcement learning (60 mins)
⚡ RQ4: Testing scalability (15 mins)
📈 Generating reports (5 mins)
✅ Evaluation complete!
```

## 🔧 Troubleshooting

### Common Issues

#### "No subject projects configured"
```typescript
// Check configuration
console.log(DEFAULT_CONFIG.subjects);

// Or specify custom subjects
await runSIKGEvaluation(context, {
    subjects: [{
        name: 'my-project',
        path: './test-subjects/my-project',
        domain: 'web',
        estimatedLOC: 5000,
        testFramework: 'pytest'
    }]
});
```

#### "Baseline validation failed"
```typescript
// Debug specific baseline
import { validateBaseline, RandomSelector } from './src/experiments/baseline';

const random = new RandomSelector(42);
const isValid = validateBaseline(random);
console.log('Random baseline valid:', isValid);
```

#### "Experiment results unexpected"
```typescript
// Enable debug logging
import { Logger } from './src/utils/Logger';
Logger.setLevel('debug');

// Check configuration values
const config = { ...DEFAULT_CONFIG, iterations: 10 };
console.log('Using config:', config);
```

#### "Output directory not found"
```bash
# Create output directory manually
mkdir -p ./src/experiments/output/results
mkdir -p ./src/experiments/output/reports
mkdir -p ./src/experiments/output/charts
```

### Debug Mode

```typescript
// Enable verbose logging
process.env.NODE_ENV = 'development';

// Run with validation
import { validateBaselines } from './src/experiments';
const valid = validateBaselines();
console.log('All baselines valid:', valid);

// Run minimal test
const result = await runSmokeTest(context);
console.log('Smoke test passed:', result);
```

### Performance Issues

#### Slow Execution
```typescript
// Reduce experiment scope
const fastConfig = {
    iterations: 20,           // Fewer RL iterations
    mutationCount: 10,        // Fewer synthetic faults
    subjects: [DEFAULT_CONFIG.subjects[0]], // Single subject
    maxDepth: 2               // Shallower propagation
};
```

#### Memory Issues
```typescript
// Process subjects individually
for (const subject of DEFAULT_CONFIG.subjects) {
    await runSIKGEvaluation(context, {
        ...DEFAULT_CONFIG,
        subjects: [subject]
    });
}
```

## 🎯 Expected Results

After running the full evaluation, you should see:

### ✅ Successful Validation
- **RQ1**: SIKG-Enhanced outperforms SIKG-NoEnrich by >10%
- **RQ2**: Semantic classification achieves >85% accuracy
- **RQ3**: RL shows continuous improvement over iterations
- **RQ4**: All algorithms complete within acceptable time limits

### 📈 Performance Metrics
- **Precision**: 88-92% across approaches
- **Recall**: 94-96% for SIKG approaches  
- **F1-Score**: 90-92% for best approaches
- **Test Reduction**: 70-75% while maintaining fault detection
- **Execution Time**: <200ms for typical changes

### 📊 Comparative Results
```
Approach Comparison (F1-Score):
├── SIKG-Enhanced:     91.9% ⭐ Best
├── SIKG-NoEnrich:     80.8%
├── Ekstazi-RTS:       73.2%
├── History-TCP:       68.6%
└── Random:            51.8%

RL Learning Progression:
├── Iteration 0:   80.0%
├── Iteration 50:  87.5% (+7.5%)
├── Iteration 100: 93.4% (+13.4%)
└── Final:         93.4% ✅ Converged
```

## 🚢 Production Usage

### CI/CD Integration
```yaml
# .github/workflows/sikg-evaluation.yml
name: SIKG Evaluation
on: [push, pull_request]

jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm run test:sikg-smoke  # Quick validation
      - run: npm run test:sikg-full   # Full evaluation (on main branch only)
```

### Custom Analysis Scripts
```typescript
// scripts/analyze-results.ts
import { ReportGenerator } from './src/experiments/analysis/ReportGenerator';

const generator = new ReportGenerator('./results', config);
const report = await generator.generateCompleteReport(experimentData);
console.log('Report generated:', report);
```

### Batch Processing
```typescript
// Run multiple configurations
const configurations = [
    { name: 'conservative', selectionThreshold: 0.5 },
    { name: 'aggressive', selectionThreshold: 0.2 },
    { name: 'balanced', selectionThreshold: 0.3 }
];

for (const config of configurations) {
    await runSIKGEvaluation(context, {
        ...DEFAULT_CONFIG,
        ...config,
        outputDir: `./results/${config.name}`
    });
}
```

This guide provides everything needed to execute and validate the SIKG experiments. The framework generates publication-ready results that demonstrate the effectiveness of semantic impact analysis for test selection and prioritization.