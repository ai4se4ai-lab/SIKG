# SIKG Experiments Framework

This directory contains the experimental evaluation framework for the Semantic Impact Knowledge Graph (SIKG) approach, implementing the evaluation methodology described in the paper.

## Quick Start

```bash
# Setup experiment environment
npm run experiment:setup

# Run all experiments (comprehensive evaluation)
npm run experiment:all

# Run individual research question evaluations
npm run experiment:effectiveness  # RQ1: Effectiveness
npm run experiment:efficiency     # RQ2: Efficiency  
npm run experiment:comparison     # RQ3: Baseline Comparison
npm run experiment:rl             # RQ4: Reinforcement Learning

# Additional analyses
npm run experiment:scalability   # Scalability analysis
npm run experiment:compare exp_123 exp_456  # Compare results

# Clean output directory
npm run experiment:clean
```

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

## Research Questions Addressed

### RQ1: Effectiveness Evaluation
**Question**: How effective is SIKG at detecting faults compared to baseline approaches?

**Metrics**:
- APFD (Average Percentage of Faults Detected)
- Fault Detection Rate
- Precision/Recall/F1-Score

**Command**: `npm run experiment:effectiveness`

### RQ2: Efficiency Evaluation  
**Question**: How efficient is SIKG in terms of test reduction and execution time?

**Metrics**:
- Test Reduction Ratio
- Execution Time Savings
- Analysis Overhead

**Command**: `npm run experiment:efficiency`

### RQ3: Comparative Analysis
**Question**: How does SIKG compare to existing regression test selection techniques?

**Baselines**:
- Random Selection
- Ekstazi (static dependency analysis)
- History-based selection
- Impact-sorted selection

**Command**: `npm run experiment:comparison`

### RQ4: Reinforcement Learning Evaluation
**Question**: How does reinforcement learning improve SIKG's performance over time?

**Analysis**:
- Learning curve trends
- Adaptation speed
- Weight evolution patterns

**Command**: `npm run experiment:rl`

## Key Implementation Features

### 1. Comprehensive Statistical Analysis
- Wilcoxon signed-rank test for paired comparisons
- Mann-Whitney U test for independent groups
- Effect size calculation (Cohen's d)
- Multiple comparison correction (Bonferroni)
- 95% confidence intervals

### 2. Baseline Implementations
- **RandomSelector**: Controlled random test selection
- **EkstaziSelector**: File-based dependency analysis
- **HistoryBasedSelector**: Historical failure patterns
- **ImpactSortedSelector**: Simple impact-based ordering

### 3. Experiment Configuration
- Configurable subject projects
- Adjustable iteration counts
- Flexible metric selection
- Multiple output formats (JSON, CSV, HTML)

### 4. Result Analysis
- Research question-specific analysis
- Cross-experiment comparisons
- Statistical significance testing
- Effect size interpretation
- Automated recommendations

## Expected Results

Based on the SIKG approach, experiments should demonstrate:

1. **Superior Fault Detection** (RQ1):
   - APFD improvements of 10-20% over baselines
   - Higher precision in test selection
   - Better fault detection rates

2. **Significant Efficiency Gains** (RQ2):
   - 30-50% test suite reduction
   - Maintained fault detection with fewer tests
   - Reasonable analysis overhead

3. **Consistent Baseline Superiority** (RQ3):
   - Outperforms random selection significantly
   - Matches or exceeds Ekstazi performance
   - Improves on history-based approaches

4. **Positive Adaptation** (RQ4):
   - Learning curves show improvement over time
   - Weight adaptations enhance accuracy
   - Project-specific optimization

## Statistical Validation

The framework ensures robust statistical validation:

- **Sample Size**: Minimum 20 iterations per experiment
- **Significance Level**: α = 0.05 with Bonferroni correction
- **Effect Size**: Cohen's d for practical significance
- **Cross-validation**: Temporal ordering preserved
- **Reproducibility**: Fixed random seeds

## Output and Reports

### JSON Results
- Raw experiment data
- Statistical test results  
- Aggregated metrics
- Configuration details

### CSV Exports
- Metric comparisons
- Statistical summaries
- Subject-specific results

### HTML Reports
- Interactive visualizations
- Executive summaries
- Research question analysis
- Statistical significance tables

### Executive Summary
Automatically generated markdown summary with:
- Key findings for each RQ
- Statistical significance results
- Practical recommendations
- Overall assessment

## Integration with SIKG

The experiment framework seamlessly integrates with existing SIKG components:

- **SIKGManager**: Knowledge graph operations
- **TestPrioritizer**: Impact calculation and test selection
- **RLManager**: Reinforcement learning evaluation
- **MetricsCollector**: Performance tracking
- **APFDCalculator**: Fault detection measurement

## Validation and Quality Assurance

- **Baseline Verification**: Implementations match literature descriptions
- **Temporal Validation**: Chronological commit ordering maintained
- **Cross-validation**: Multiple project types and sizes
- **Reproducibility**: Deterministic execution with seed control
- **Statistical Rigor**: Proper significance testing and effect size reporting

## Customization

### Adding New Baselines
```typescript
export class MyBaselineSelector implements BaselineSelector {
    name = 'my-baseline';
    
    async selectTests(allTests: string[], changedFiles: string[]): Promise<string[]> {
        // Implementation
    }
}
```

### Custom Metrics
```typescript
// Add to ExperimentConfig
metrics: ['apfd', 'precision', 'recall', 'my-custom-metric']
```

### New Subject Projects
```typescript
// Add to subjects array in config
{
    name: 'my-project',
    repositoryUrl: 'https://github.com/user/project',
    localPath: './test-subjects/my-project',
    language: 'python',
    testFramework: 'pytest',
    size: 'medium',
    linesOfCode: 5000,
    testCount: 200,
    commitCount: 500
}
```

## Troubleshooting

### Common Issues

1. **Git Repository Access**: Ensure proper Git credentials and repository access
2. **Python Environment**: Verify Python and test framework installations
3. **Memory Usage**: Large projects may require increased Node.js memory limit
4. **Output Permissions**: Ensure write permissions for output directory

### Debug Mode
```bash
# Enable detailed logging
DEBUG=sikg:* npm run experiment:all
```

### Performance Tuning
- Reduce iteration count for faster testing
- Limit commit range for large repositories
- Use subset of metrics for preliminary runs

## Contributing

When extending the experiment framework:

1. Follow TypeScript best practices
2. Add comprehensive error handling
3. Include statistical validation
4. Document new features
5. Add unit tests for new components

## Citation

If using this experiment framework in research, please cite:

```bibtex
@article{sikg2024,
  title={SIKG: Semantic Impact Knowledge Graph for Regression Test Selection},
  author={[Authors]},
  journal={[Journal]},
  year={2024}
}
```