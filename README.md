# SIKG - Semantic Impact Knowledge Graph

<p align="center">
  <img src="images/sikg-logo.png" alt="SIKG Logo" width="150"/>
</p>

<p align="center">
  <b>Intelligently select and prioritize test cases based on semantic change impact analysis</b><br>
  <sub>Revolutionary AI-powered test selection that understands your code changes</sub>
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

<p align="center">
  <img src="images/sikg-demo.gif" alt="SIKG in action" width="800"/>
</p>

## 🌟 Key Features

🧠 **Semantic Change Analysis** - Understands the *nature* and *intent* of changes, not just *what* changed  
🔗 **Knowledge Graph-Based Impact Propagation** - Maps how changes ripple through your entire codebase  
⚡ **Intelligent Test Prioritization** - Focus on tests most likely to catch issues from your specific changes  
📈 **Self-Learning System** - Continuously improves accuracy from test execution feedback using reinforcement learning  
👁️ **Interactive Visual Impact Graph** - Explore relationships between code and tests with D3.js visualization  
🌐 **Multi-Language Support** - Works with Python, JavaScript, TypeScript, Java, C#, and Go  
🎯 **Precise Change Detection** - Tracks exact lines changed, not just file-level modifications  
🔄 **Real-time Analysis** - Instant feedback on save or manual trigger  
📊 **Test Impact Scoring** - Quantified risk assessment for each test case  
🚀 **CI/CD Integration Ready** - Built for modern development workflows

## 🎬 How It Works

SIKG revolutionizes test selection by modeling your codebase as a semantic knowledge graph and analyzing the *intent* behind code changes using advanced static analysis and machine learning.

### 🏗️ 1. Building the Knowledge Graph

When first installed, SIKG analyzes your codebase and constructs a comprehensive knowledge graph where:

- **Nodes** represent code elements (functions, classes, methods, modules) and test cases
- **Edges** represent relationships like `calls`, `inherits_from`, `tests`, `depends_on`, `imports`
- **Weights** indicate relationship strength and impact propagation factors

```
┌─────────────┐    CALLS     ┌─────────────┐    TESTS    ┌─────────────┐
│   hello()   │─────────────→│  validate() │←────────────│ test_hello  │
└─────────────┘              └─────────────┘             └─────────────┘
       │                            │                           │
       │ BELONGS_TO                 │ USES                      │ COVERS
       ▼                            ▼                           ▼
┌─────────────┐              ┌─────────────┐             ┌─────────────┐
│   main.py   │              │   utils.py  │             │ hello_spec  │
└─────────────┘              └─────────────┘             └─────────────┘
```

### 🔍 2. Semantic Change Analysis

When you make changes, SIKG doesn't just look at which lines changed—it analyzes the semantic nature and intent of the change:

| Change Type | Description | Typical Impact | Priority |
|-------------|-------------|----------------|----------|
| 🐛 **Bug Fix** | Corrections to existing functionality | High | Critical |
| ✨ **Feature Addition** | New functionality or capabilities | Moderate-High | High |
| 🔄 **Signature Refactoring** | Changes to APIs, interfaces, or method signatures | Very High | Critical |
| 🧹 **Logic Refactoring** | Internal code restructuring without API changes | Medium | Medium |
| 📦 **Dependency Update** | Changes to imports or external dependencies | Medium-High | High |
| ⚡ **Performance Optimization** | Speed or resource efficiency improvements | Low-Medium | Low |

### 🌊 3. Impact Propagation Algorithm

Changes propagate through the graph using sophisticated algorithms that consider:

- **Relationship Types**: Different edge types have different impact multipliers
- **Distance Decay**: Impact attenuates with graph distance from the change
- **Semantic Context**: Bug fixes propagate differently than performance optimizations
- **Historical Patterns**: Machine learning from past test results

```python
# Simplified propagation formula
impact_score = initial_impact × relationship_weight × attenuation_factor + historical_boost
```

### 🧠 4. Machine Learning & Reinforcement Learning

After running tests, SIKG compares predictions with actual results:

- **Correct Predictions**: Reinforce existing weights
- **False Positives**: Reduce impact weights on those paths  
- **False Negatives**: Increase impact weights and discover new relationships
- **Pattern Recognition**: Graph Neural Networks identify complex failure patterns

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
- **Python 3.7+** (for enhanced AST parsing)
- A project with tests in supported languages

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

#### From VSIX Package
```bash
# Download from releases
code --install-extension vscode-sikg-0.1.0.vsix
```

### First-Time Setup

1. **Initial Graph Building**: SIKG will automatically scan your codebase
2. **Language Detection**: Ensures proper parsing for your project languages
3. **Relationship Mapping**: Establishes test-to-code connections
4. **Baseline Creation**: Sets up the knowledge graph foundation

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
**Option A: Automatic Analysis** (if enabled)
- Changes analyzed automatically on file save

**Option B: Manual Analysis**
- Click **"Analyze Changes"** in SIKG sidebar
- Or run `SIKG: Analyze Changes and Prioritize Tests` from Command Palette (`Ctrl+Shift+P`)

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
- **"Run Top 5 Tests"**: Execute highest impact tests immediately
- **"Run All Impacted Tests"**: Run all tests with significant impact scores
- **Manual Selection**: Choose specific tests from the prioritized list

#### 👁️ **Step 4: Visualize Impact (Optional)**
Click **"Visualize Graph"** to see an interactive network showing:
- 🔴 **Red nodes**: Changed code elements
- 🟡 **Yellow nodes**: Tests impacted by changes  
- 🔗 **Edges**: Relationships and impact paths
- 📊 **Interactive controls**: Zoom, filter, explore

### Advanced Features

#### 🔄 **Continuous Learning**
```
📈 Learning from test results...
   ✅ 8 tests passed as predicted
   ❌ 2 tests failed unexpectedly
   🔧 Adjusting 15 relationship weights
   📊 Model accuracy: 94.2% (+1.3%)
```

#### 📊 **Impact Analytics**
- View historical accuracy trends
- Analyze test failure patterns
- Track model improvement over time
- Export impact data for CI/CD integration

#### 🎯 **Custom Test Strategies**
Configure different strategies based on your workflow:

- **🚀 Speed Mode**: Run only critical tests (95% confidence)
- **⚖️ Balanced Mode**: Run critical + high impact tests (85% confidence)  
- **🔒 Thorough Mode**: Run all impacted tests (70% confidence)
- **🛡️ Paranoid Mode**: Run full test suite with impact guidance

## ⚙️ Configuration

Customize SIKG through VS Code settings (`Ctrl+,` → Search "SIKG"):

### Core Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `sikg.analyzeOnSave` | Auto-analyze when files are saved | `false` |
| `sikg.logLevel` | Logging verbosity (debug/info/warn/error) | `"info"` |
| `sikg.maxTraversalDepth` | Max depth for impact propagation | `5` |
| `sikg.minImpactThreshold` | Minimum impact to continue propagation | `0.05` |

### Language Support

| Setting | Description | Default |
|---------|-------------|---------|
| `sikg.supportedLanguages` | Languages to analyze | `["python", "javascript", "typescript", "java", "csharp", "go"]` |
| `sikg.codeFileExtensions` | File extensions to consider as code | `["py", "js", "ts", "tsx", "java", "cs", "go"]` |

### Test Detection

| Setting | Description | Default |
|---------|-------------|---------|
| `sikg.testFilePatterns` | Glob patterns for test files | See below |
| `sikg.excludePatterns` | Patterns to exclude from analysis | `["**/node_modules/**", "**/dist/**", ...]` |

#### Default Test Patterns
```json
{
  "sikg.testFilePatterns": [
    "**/test_*.py",           // Python: test_example.py
    "**/*_test.py",           // Python: example_test.py  
    "**/*.test.js",           // JavaScript: example.test.js
    "**/*.spec.ts",           // TypeScript: example.spec.ts
    "**/*Test.java",          // Java: ExampleTest.java
    "**/*Tests.cs",           // C#: ExampleTests.cs
    "**/*_test.go"            // Go: example_test.go
  ]
}
```

### Impact Thresholds

| Setting | Description | Default | Range |
|---------|-------------|---------|-------|
| `sikg.highImpactThreshold` | Threshold for critical tests | `0.7` | 0.0-1.0 |
| `sikg.lowImpactThreshold` | Threshold for low impact tests | `0.3` | 0.0-1.0 |

### Example Configuration

```json
{
  "sikg.analyzeOnSave": true,
  "sikg.logLevel": "debug",
  "sikg.maxTraversalDepth": 7,
  "sikg.highImpactThreshold": 0.8,
  "sikg.testFilePatterns": [
    "**/tests/**/*.py",
    "**/__tests__/**/*.js",
    "**/spec/**/*.ts"
  ],
  "sikg.excludePatterns": [
    "**/node_modules/**",
    "**/venv/**",
    "**/build/**",
    "**/coverage/**"
  ]
}
```

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
vscode-sikg/
├── src/                           # Source code
│   ├── extension.ts               # Extension entry point
│   ├── sikg/                      # Core SIKG implementation
│   │   ├── SIKGManager.ts         # Knowledge graph manager
│   │   ├── ChangeAnalyzer.ts      # Semantic change analysis
│   │   ├── TestPrioritizer.ts     # Test impact calculation
│   │   ├── CodeParser.ts          # Code parsing facade
│   │   ├── TestParser.ts          # Test parsing facade
│   │   ├── GraphTypes.ts          # Type definitions
│   │   └── parser/                # Modular parser system
│   │       ├── code/              # Code parsers by language
│   │       │   ├── CodeParserFactory.ts
│   │       │   ├── CodeParserBase.ts
│   │       │   └── language/
│   │       │       ├── PythonCodeParser.ts
│   │       │       └── GenericCodeParser.ts
│   │       ├── test/              # Test parsers by language
│   │       │   ├── TestParserFactory.ts
│   │       │   ├── TestParserBase.ts
│   │       │   └── language/
│   │       │       ├── PythonTestParser.ts
│   │       │       └── GenericTestParser.ts
│   │       └── util/              # Parser utilities
│   │           ├── ParserUtils.ts
│   │           ├── AstProcessorManager.ts
│   │           ├── AstScripts.ts
│   │           └── FileUtils.ts
│   ├── services/                  # External service integrations
│   │   ├── GitService.ts          # Git diff analysis
│   │   └── TestRunnerService.ts   # Test execution
│   ├── ui/                        # User interface components
│   │   ├── SIKGViewProvider.ts    # Main webview
│   │   └── StatusBarManager.ts    # Status bar integration
│   └── utils/                     # Utility modules
│       ├── Logger.ts              # Logging system
│       └── ConfigManager.ts       # Configuration handling
├── package.json                   # Extension manifest
├── tsconfig.json                  # TypeScript configuration
└── README.md                      # This file
```

### Core Architecture

#### 🏗️ **Knowledge Graph (SIKGManager)**
- Maintains nodes (code elements, tests) and edges (relationships)
- Handles graph persistence and loading
- Manages change propagation and impact calculation

#### 🔍 **Change Analysis (ChangeAnalyzer)**
- Integrates with Git to detect code changes
- Performs semantic classification of changes
- Maps changes to graph nodes with precise line tracking

#### 🧪 **Test Prioritization (TestPrioritizer)**
- Implements impact propagation algorithms  
- Calculates test impact scores using graph traversal
- Applies machine learning for continuous improvement

#### 🎨 **Parser System**
- **Modular Design**: Language-specific parsers with fallback
- **AST Support**: Uses Python AST for accurate parsing when available
- **Relationship Extraction**: Identifies calls, imports, inheritance, etc.

### Adding New Language Support

1. **Create Code Parser**:
```typescript
// src/sikg/parser/code/language/NewLanguageCodeParser.ts
export class NewLanguageCodeParser extends CodeParserBase {
    public getLanguage(): string { return 'newlanguage'; }
    
    public canHandle(filePath: string): boolean {
        return filePath.endsWith('.newext');
    }
    
    public async parseCodeFile(content: string, filePath: string): Promise<CodeElement[]> {
        // Implement parsing logic
    }
}
```

2. **Create Test Parser**:
```typescript
// src/sikg/parser/test/language/NewLanguageTestParser.ts
export class NewLanguageTestParser extends TestParserBase {
    public getLanguage(): string { return 'newlanguage'; }
    
    public async parseTestFile(content: string, filePath: string): Promise<TestCase[]> {
        // Implement test parsing logic
    }
}
```

3. **Register in Factories**:
```typescript
// Update CodeParserFactory.ts and TestParserFactory.ts
this.registerParser('newlanguage', new NewLanguageCodeParser());
```

4. **Add Configuration**:
```json
// Update package.json configuration schema
"sikg.supportedLanguages": {
  "default": ["python", "javascript", "newlanguage"]
}
```

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

#### ❌ "Language detection error" 
**Problem**: SIKG can't detect the programming language of your files.

**Solutions**:
1. **Install language extensions**:
   ```bash
   # For Python
   code --install-extension ms-python.python
   ```

2. **Run diagnostics**:
   ```
   Command Palette → "SIKG: Diagnose Language Issues"
   ```

3. **Manual fix**:
   ```
   Command Palette → "SIKG: Fix Language Issues"
   ```

#### ❌ "No tests found" or "Tests not linking to code"
**Problem**: SIKG isn't detecting your test files or connecting them to code.

**Solutions**:
1. **Check test patterns**:
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
   Command Palette → "SIKG: Rebuild Knowledge Graph"
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

3. **Batch processing**: SIKG processes files in batches—larger codebases may take time on first build

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
2. **Run Diagnostics**: `SIKG: Diagnose Language Issues`
3. **Reset Extension**: `SIKG: Rebuild Knowledge Graph`
4. **Report Issues**: [GitHub Issues](https://github.com/ai4se4ai-lab/SIKG/issues)

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
- 🌐 **Language Support**: Add parsers for new programming languages
- 🧠 **ML Models**: Improve impact prediction algorithms
- 🎨 **UI/UX**: Enhance visualization and user experience
- 📚 **Documentation**: Improve guides and examples
- 🐛 **Bug Fixes**: Help resolve issues and edge cases

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgements

- **Research Foundation**: Based on academic work in semantic impact analysis and knowledge graph-based test selection
- **Inspiration**: Advanced change impact analysis and test prioritization techniques from software engineering research
- **Community**: Thanks to all contributors and users who help improve SIKG
- **Dependencies**: Built with TypeScript, VS Code Extension API, D3.js for visualization
- **Icons**: Created by [Freepik](https://www.freepik.com) from [Flaticon](https://www.flaticon.com/)

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