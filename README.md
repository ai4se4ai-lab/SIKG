# SIKG - Semantic Impact Knowledge Graph

<p align="center">
  <b>Intelligently select and prioritize test cases based on semantic change impact analysis</b><br>
  <sub>AI-powered test selection that understands your code changes</sub>
</p>

<p align="center">
  <a href="#key-features">Features</a> •
  <a href="#how-it-works">How It Works</a> •
  <a href="#getting-started">Getting Started</a> •
  <a href="#usage">Usage</a> •
  <a href="#configuration">Configuration</a> •
  <a href="#development">Development</a> •
  <a href="#troubleshooting">Troubleshooting</a> •
  <a href="#license">License</a>
</p>

---

## 🌟 Key Features

🧠 **Semantic Change Analysis** - Understands the *nature* and *intent* of changes, not just *what* changed  
🔗 **Knowledge Graph-Based Impact Propagation** - Maps how changes ripple through your entire codebase  
⚡ **Intelligent Test Prioritization** - Focus on tests most likely to catch issues from your specific changes  
📈 **Self-Learning System** - Continuously improves accuracy from test execution feedback using reinforcement learning  
👁️ **Interactive Visual Impact Graph** - Explore relationships between code and tests with built-in visualization  
🌐 **Python-First Design** - Optimized for Python projects with extensible architecture for other languages  
🎯 **Precise Change Detection** - Tracks exact lines changed, not just file-level modifications  
🔄 **Real-time Analysis** - Instant feedback on save or manual trigger  
📊 **Test Impact Scoring** - Quantified risk assessment for each test case  
🚀 **CI/CD Integration Ready** - Built for modern development workflows

## 🎬 How It Works

SIKG revolutionizes test selection by modeling your codebase as a semantic knowledge graph and analyzing the *intent* behind code changes using advanced static analysis and machine learning.

### 🏗️ 1. Building the Knowledge Graph

When first installed, SIKG analyzes your codebase and constructs a comprehensive knowledge graph where:

- **Nodes** represent code elements (functions, classes, methods, modules) and test cases
- **Edges** represent relationships like `CALLS`, `INHERITS_FROM`, `TESTS`, `IMPORTS`, `USES`
- **Weights** indicate relationship strength and impact propagation factors

```
┌─────────────┐    CALLS     ┌─────────────┐    TESTS    ┌─────────────┐
│   hello()   │─────────────→│  validate() │←────────────│ test_hello  │
└─────────────┘              └─────────────┘             └─────────────┘
       │                            │                           │
       │ BELONGS_TO                 │ USES                      │ COVERS
       ▼                            ▼                           ▼
┌─────────────┐              ┌─────────────┐             ┌─────────────┐
│   main.py   │              │   utils.py  │             │ hello_test  │
└─────────────┘              └─────────────┘             └─────────────┘
```

### 🔍 2. Semantic Change Analysis

When you make changes, SIKG doesn't just look at which lines changed—it analyzes the semantic nature and intent of the change:

| Change Type | Description | Typical Impact | Priority |
|-------------|-------------|----------------|----------|
| 🐛 **BUG_FIX** | Corrections to existing functionality | High | Critical |
| ✨ **FEATURE_ADDITION** | New functionality or capabilities | Moderate-High | High |
| 🔄 **REFACTORING_SIGNATURE** | Changes to APIs, interfaces, or method signatures | Very High | Critical |
| 🧹 **REFACTORING_LOGIC** | Internal code restructuring without API changes | Medium | Medium |
| 📦 **DEPENDENCY_UPDATE** | Changes to imports or external dependencies | Medium-High | High |
| ⚡ **PERFORMANCE_OPT** | Speed or resource efficiency improvements | Low-Medium | Low |

### 🌊 3. Impact Propagation Algorithm

Changes propagate through the graph using sophisticated algorithms that consider:

- **Relationship Types**: Different edge types have different impact multipliers
- **Distance Decay**: Impact attenuates with graph distance from the change
- **Semantic Context**: Bug fixes propagate differently than performance optimizations
- **Historical Patterns**: Machine learning from past test results

### 🧠 4. Machine Learning & Reinforcement Learning

After running tests, SIKG compares predictions with actual results:

- **Correct Predictions**: Reinforce existing weights
- **False Positives**: Reduce impact weights on those paths  
- **False Negatives**: Increase impact weights and discover new relationships
- **Pattern Recognition**: Continuous learning identifies complex failure patterns

### 📊 5. Test Prioritization & Risk Assessment

Tests receive quantified impact scores and are categorized:

- **🔴 Critical (0.7-1.0)**: Must run - high probability of failure
- **🟡 High (0.3-0.7)**: Should run - moderate failure risk
- **🟢 Medium (0.1-0.3)**: Nice to run - low failure risk
- **⚪ Low (0.0-0.1)**: Optional - minimal impact

## 🚀 Getting Started

### Prerequisites

- **Visual Studio Code** 1.70.0 or higher
- **Git** (for change detection)
- **Python 3.7+** with pytest or unittest
- A Python project with existing tests

> **Note**: SIKG is currently optimized for Python projects. Support for other languages is available through the generic parser but may have limited functionality. See [Adding Language Support](language_support_guide.md) for extending to other languages.


### Installation

#### From VS Code Marketplace
1. Launch VS Code
2. Open Extensions view (`Ctrl+Shift+X`)
3. Search for "SIKG"
4. Click **Install**

#### From Command Line
```bash
code --install-extension sikg.vscode-sikg
```

### First-Time Setup

1. **Open your project** in VS Code
2. **Initialize SIKG**: Run `SIKG: Initialize Knowledge Graph` from Command Palette (`Ctrl+Shift+P`)
3. **Wait for analysis**: SIKG will scan your codebase and build the knowledge graph
4. **Verify setup**: Check the SIKG output panel for confirmation

```
🔄 Building SIKG Knowledge Graph...
   📁 Found 45 code files (Python, JavaScript)
   🧪 Found 23 test files  
   🔗 Created 342 nodes, 891 edges
   ✅ SIKG ready for analysis!
```

## 💡 Usage

### Daily Development Workflow

#### 🔍 **Step 1: Make Your Changes**
Edit your code as usual. SIKG works with any changes—from single-line fixes to major refactoring.

#### ⚡ **Step 2: Analyze Impact** 

**Manual Analysis:**
- Open Command Palette (`Ctrl+Shift+P`)
- Run `SIKG: Analyze Code Changes`
- Or click **"Analyze Changes"** in SIKG sidebar

```
🔍 Analyzing changes...
   📄 Detected 3 semantic changes:
   • hello() - BUG_FIX (High Impact: 0.8)
   • validate() - REFACTORING_LOGIC (Medium Impact: 0.4)
   • UserService.login() - FEATURE_ADDITION (High Impact: 0.7)
   
   🎯 Prioritized 12 tests based on impact analysis
```

#### 🧪 **Step 3: Run Prioritized Tests**

**Smart Test Selection:**
```
🔴 Critical Impact Tests (Run First):
   • test_hello_validation() - 94% impact
   • test_login_with_new_feature() - 87% impact
   • test_user_authentication_flow() - 76% impact

🟡 High Impact Tests (Run If Time Permits):
   • test_input_sanitization() - 52% impact
   • test_user_session_handling() - 47% impact
```

**Run Options:**
- `SIKG: Run Selected Tests` - Execute highest impact tests
- Manual selection from the prioritized list

#### 👁️ **Step 4: Visualize Impact (Optional)**
Run `SIKG: Export Graph Visualization` to see an interactive network showing:
- 🔴 **Red nodes**: Changed code elements
- 🟡 **Yellow nodes**: Tests impacted by changes  
- 🔗 **Edges**: Relationships and impact paths

### Advanced Features

#### 🔄 **Continuous Learning**
```
📈 Learning from test results...
   ✅ 8 tests passed as predicted
   ❌ 2 tests failed unexpectedly
   🔧 Adjusting 15 relationship weights
   📊 Model accuracy: 94.2% (+1.3%)
```

#### 📊 **Performance Reports**
- View `SIKG: View Performance Report` for detailed analytics
- Track model improvement over time
- Analyze test failure patterns
- Export data for CI/CD integration

## ⚙️ Configuration

Customize SIKG through VS Code settings (`Ctrl+,` → Search "SIKG"):

### Core Settings

```json
{
  "sikg.testSelection.highImpactThreshold": 0.7,
  "sikg.testSelection.lowImpactThreshold": 0.3,
  "sikg.reinforcementLearning.enabled": true,
  "sikg.reinforcementLearning.learningRate": 0.01,
  "sikg.analysis.includePatterns": ["**/*.py"],
  "sikg.analysis.excludePatterns": ["**/venv/**", "**/.*/**", "**/node_modules/**"]
}
```

### Language Support

Currently, SIKG provides **full support for Python** with extensible architecture for other languages:

| Language | Support Level | Features Available |
|----------|---------------|-------------------|
| **Python** | ✅ **Full** | AST parsing, pytest/unittest detection, semantic analysis |
| **JavaScript/TypeScript** | 🔶 **Basic** | Generic parsing, limited test detection |
| **Java** | 🔶 **Basic** | Generic parsing, limited test detection |
| **C#** | 🔶 **Basic** | Generic parsing, limited test detection |
| **Go** | 🔶 **Basic** | Generic parsing, limited test detection |
| **Other** | ⚪ **Generic** | File-level analysis only |

> **Extending Language Support**: See the [Adding Language Support](#adding-language-support) section for detailed instructions on implementing full support for additional languages.

### Test Detection

SIKG currently provides comprehensive test detection for **Python frameworks**:

#### Python Test Frameworks (Full Support)

| Framework | Detection Patterns | Features |
|-----------|-------------------|----------|
| **pytest** | `test_*.py`, `*_test.py` | Function discovery, parameterized tests, fixtures |
| **unittest** | `Test*.py`, `*Test.py` | Class-based tests, test methods, assertions |

#### Configuration

```json
{
  "sikg.testFilePatterns": [
    "**/test_*.py",           // pytest: test_example.py
    "**/*_test.py",           // pytest: example_test.py  
    "**/Test*.py",            // unittest: TestExample.py
    "**/*Test.py",            // unittest: ExampleTest.py
    "**/tests/**/*.py"        // Python tests in tests/ directory
  ]
}
```

> **Other Languages**: Basic test detection is available for JavaScript (`.test.js`, `.spec.js`), Java (`*Test.java`), and other languages through generic patterns. See [Adding Language Support](#adding-language-support) for implementing comprehensive test detection.

### Impact Thresholds

| Setting | Description | Default | Range |
|---------|-------------|---------|-------|
| `sikg.highImpactThreshold` | Threshold for critical tests | `0.7` | 0.0-1.0 |
| `sikg.lowImpactThreshold` | Threshold for low impact tests | `0.3` | 0.0-1.0 |
| `sikg.maxTraversalDepth` | Max depth for impact propagation | `5` | 1-10 |
| `sikg.minImpactThreshold` | Minimum impact to continue propagation | `0.05` | 0.0-1.0 |

## 🛠️ Development

### Building from Source

```bash
# Clone the repository
git clone https://github.com/ai4se4ai-lab/SIKG.git
cd SIKG

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch for changes during development
npm run watch
```

### Running in Development Mode

1. Open the project in VS Code
2. Press `F5` to launch Extension Development Host
3. Test your changes in the new VS Code window

### Project Structure

```
src/sikg/
├── GraphTypes.ts              # Core data structures
├── SIKGManager.ts             # Main orchestrator
├── CodeParser.ts              # Code analysis facade
├── TestParser.ts              # Test analysis facade
├── ChangeAnalyzer.ts          # Semantic change detection
├── parser/                    # Modular parsing system
│   ├── code/                  # Code parsers
│   │   ├── CodeParserFactory.ts
│   │   ├── language/
│   │   │   ├── PythonCodeParser.ts
│   │   │   └── GenericCodeParser.ts
│   │   └── CodeParserBase.ts
│   ├── test/                  # Test parsers
│   │   ├── TestParserFactory.ts
│   │   ├── language/
│   │   │   ├── PythonTestParser.ts
│   │   │   └── GenericTestParser.ts
│   │   └── TestParserBase.ts
│   └── util/                  # Shared utilities
├── learning/                  # Reinforcement learning
│   ├── RLManager.ts
│   ├── MDPFramework.ts
│   ├── PolicyManager.ts
│   ├── WeightUpdateEngine.ts
│   └── FeedbackProcessor.ts
├── history/                   # Git history analysis
│   ├── HistoryAnalyzer.ts
│   ├── CommitTracker.ts
│   ├── CoChangeDetector.ts
│   └── FaultCorrelator.ts
└── evaluation/                # Performance metrics
    ├── MetricsCollector.ts
    ├── APFDCalculator.ts
    ├── EffectivenessTracker.ts
    └── ReportGenerator.ts
```

### Algorithm Implementation

The system implements five core algorithms:

1. **Knowledge Graph Construction** (Algorithm 1)
2. **Empirical Weight Enhancement** (Algorithm 2)  
3. **Semantic Change Analysis** (Algorithm 3)
4. **Impact Propagation** (Algorithm 4)
5. **Reinforcement Learning Adaptation** (Algorithm 5)

### Command Reference

| Command | Description |
|---------|-------------|
| `SIKG: Initialize Knowledge Graph` | Build initial graph from codebase |
| `SIKG: Analyze Code Changes` | Detect and classify recent changes |
| `SIKG: Select Tests` | Choose relevant tests based on changes |
| `SIKG: Run Selected Tests` | Execute prioritized test subset |
| `SIKG: View Performance Report` | Open detailed analytics dashboard |
| `SIKG: Export Graph Visualization` | Generate interactive graph view |

### Testing

```bash
# Run unit tests
npm test

# Run specific test suite
npm run test:unit

# Run integration tests  
npm run test:integration

# Package extension for testing
npm run package
```

## 🔧 Troubleshooting

### Common Issues

#### ❌ "No tests found" or "Tests not linking to code"
**Problem**: SIKG isn't detecting your test files or connecting them to code.

**Solutions**:
1. **Check test patterns** in settings:
   ```json
   "sikg.testFilePatterns": [
     "**/test_*.py",        // ✅ test_example.py
     "**/*_test.py",        // ✅ example_test.py
     "**/tests/**/*.py"     // ✅ tests/test_example.py
   ]
   ```

2. **Verify test file structure**:
   ```python
   # ✅ Good: Clear imports and test functions
   from main import hello, goodbye
   
   def test_hello():
       assert hello() == "Hello"
   
   # ❌ Bad: No imports, unclear test names
   def check_stuff():
       pass
   ```

3. **Rebuild graph**:
   ```
   Command Palette → "SIKG: Initialize Knowledge Graph"
   ```

#### ❌ "Changes analyzed, 0 tests impacted"
**Problem**: SIKG detects changes but doesn't find impacted tests.

**Solutions**:
1. **Check file extensions** are in `sikg.codeFileExtensions`
2. **Verify imports** in test files link to changed code
3. **Lower impact thresholds**:
   ```json
   "sikg.minImpactThreshold": 0.01,
   "sikg.lowImpactThreshold": 0.1
   ```

#### ❌ Performance Issues
**Problem**: SIKG is slow on large codebases.

**Solutions**:
1. **Exclude large directories**:
   ```json
   "sikg.excludePatterns": [
     "**/node_modules/**",
     "**/dist/**", 
     "**/build/**",
     "**/coverage/**",
     "**/venv/**"
   ]
   ```

2. **Reduce traversal depth**:
   ```json
   "sikg.maxTraversalDepth": 3
   ```

### Debug Mode

Enable detailed logging to diagnose issues:

```json
{
  "sikg.logLevel": "debug"
}
```

Then check the **Output Panel** (`View → Output` → Select "SIKG") for detailed logs.

### Getting Help

1. **Check Output Logs**: `View → Output → SIKG`
2. **Reset Extension**: `SIKG: Initialize Knowledge Graph`
3. **Report Issues**: [GitHub Issues](https://github.com/ai4se4ai-lab/SIKG/issues)

### Known Limitations

- **Large Codebases**: Initial graph building may take time (>10k files)
- **Dynamic Languages**: Limited static analysis for highly dynamic code
- **Test Frameworks**: Best support for standard frameworks (Jest, pytest, JUnit)
- **Binary Files**: Only analyzes text-based source files

## 🤝 Contributing

We welcome contributions! See our [Contributing Guide](CONTRIBUTING.md) for details.

### Quick Start
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and add tests
4. Run tests: `npm test`
5. Commit: `git commit -m "Add amazing feature"`
6. Push: `git push origin feature/amazing-feature`
7. Open a Pull Request

### Areas for Contribution
- 🌐 **Language Support**: Add comprehensive parsers for JavaScript, TypeScript, Java, C#, Go, and other languages
- 🧠 **ML Models**: Improve impact prediction algorithms and reinforcement learning
- 🎨 **UI/UX**: Enhance visualization and user experience
- 📚 **Documentation**: Improve guides and examples
- 🐛 **Bug Fixes**: Help resolve issues and edge cases
- 🧪 **Test Frameworks**: Add support for additional testing frameworks (Mocha, Jest, JUnit, NUnit, etc.)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgements

- **Research Foundation**: Based on academic work in semantic impact analysis and knowledge graph-based test selection
- **Inspiration**: Advanced change impact analysis and test prioritization techniques from software engineering research
- **Community**: Thanks to all contributors and users who help improve SIKG
- **Dependencies**: Built with TypeScript, VS Code Extension API, and modern web technologies

---

<p align="center">
  <b>Transform your testing workflow with intelligent, semantic-aware test selection</b><br>
  Made with ❤️ by the SIKG team
</p>

<p align="center">
  <a href="https://github.com/ai4se4ai-lab/SIKG">⭐ Star on GitHub</a> •
  <a href="https://github.com/ai4se4ai-lab/SIKG/issues">🐛 Report Issues</a> •
  <a href="https://github.com/ai4se4ai-lab/SIKG/discussions">💬 Discussions</a>
</p>