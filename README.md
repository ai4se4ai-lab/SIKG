# SIKG - Semantic Impact Knowledge Graph

<p align="center">
  <img src="images/sikg-logo.png" alt="SIKG Logo" width="150"/>
</p>

<p align="center">
  <b>Intelligently select and prioritize test cases based on semantic change impact analysis</b><br>
  <sub>Makes testing smarter, not harder</sub>
</p>

<p align="center">
  <a href="#key-features">Features</a> •
  <a href="#how-it-works">How It Works</a> •
  <a href="#getting-started">Getting Started</a> •
  <a href="#usage">Usage</a> •
  <a href="#configuration">Configuration</a> •
  <a href="#development">Development</a> •
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="images/sikg-demo.gif" alt="SIKG in action"/>
</p>

## Key Features

🧠 **Semantic Change Analysis** - Understand the *nature* of changes, not just *what* changed  
🔗 **Knowledge Graph-Based Impact Propagation** - See how changes ripple through your codebase  
⚡ **Intelligent Test Prioritization** - Focus on tests most likely to catch issues  
📈 **Self-Learning System** - Continuously improves accuracy from test execution feedback  
👁️ **Visual Impact Graph** - Visualize relationships between code and tests  
🌐 **Multi-Language Support** - Works with JavaScript, TypeScript, Java, Python, C#, and Go  

## How It Works

SIKG takes a revolutionary approach to test selection by modeling your codebase as a semantic knowledge graph and analyzing the *intent* behind code changes.

### 1. Building the Knowledge Graph

When first installed, SIKG analyzes your codebase and builds a knowledge graph where:
- **Nodes** represent code elements (functions, classes, methods) and test cases
- **Edges** represent relationships like "calls", "inherits_from", "tests", etc.

### 2. Semantic Change Analysis

When you make changes, SIKG doesn't just look at which lines changed, but analyzes the semantic nature of the change:

| Change Type | Description | Impact |
|-------------|-------------|--------|
| 🐛 **Bug Fix** | Corrections to existing functionality | High |
| ✨ **Feature Addition** | New functionality | Moderate |
| 🔄 **Signature Refactoring** | Changes to APIs or interfaces | Very High |
| 🧹 **Logic Refactoring** | Internal code restructuring | Medium |
| 📦 **Dependency Update** | Changes to dependencies | Medium-High |
| ⚡ **Performance Optimization** | Speed or resource improvements | Lower |

### 3. Impact Propagation

Changes propagate through the graph along relationship paths, attenuating with distance, producing impact scores for tests. Tests connected to changed code through multiple paths receive higher scores.

### 4. Learning from Results

After running tests, SIKG compares predictions with actual results and adjusts the graph weights to improve future predictions.

## Getting Started

### Prerequisites

- Visual Studio Code 1.70.0 or higher
- Git (for change detection)
- A project with tests

### Installation

1. Launch VS Code
2. Open the Extensions view (`Ctrl+Shift+X`)
3. Search for "SIKG"
4. Click Install

Or install via the command line:
```bash
code --install-extension sikg.vscode-sikg
```

## Usage

### First-Time Setup

When first installed, SIKG will:
1. Scan your codebase to identify code elements and tests
2. Build the initial knowledge graph
3. Show a notification when ready

This process may take a few minutes for larger projects.

### Daily Workflow

#### Analyzing Changes

After making changes to your code:

1. Click the "Analyze Changes" button in the SIKG sidebar, or
2. Run the command `SIKG: Analyze Changes and Prioritize Tests` from the command palette, or
3. If enabled, changes will be analyzed automatically on save

#### Running Prioritized Tests

SIKG will show a prioritized list of tests. You can:

1. Run the top 5 tests by clicking "Run Top 5 Tests"
2. Run all impacted tests by clicking "Run All Impacted Tests"
3. Run tests directly from your regular test runner, focusing on the ones SIKG highlighted

#### Visualizing the Impact

To understand how your changes impact the codebase:

1. Click "Visualize Graph" in the SIKG sidebar
2. Explore the interactive graph showing changes and their propagation paths
3. Hover over nodes to see details about code elements and tests

## Configuration

Customize SIKG through VS Code settings:

| Setting | Description | Default |
|---------|-------------|---------|
| `sikg.analyzeOnSave` | Analyze changes automatically when files are saved | `false` |
| `sikg.codeFileExtensions` | File extensions to consider as code files | `["ts", "js", "tsx", "jsx", "java", "py", "cs", "go"]` |
| `sikg.testFilePatterns` | Glob patterns to identify test files | `["**/*.test.{ts,js}", "**/*.spec.{ts,js}", "**/*Test.java", ...]` |
| `sikg.excludePatterns` | Patterns to exclude from analysis | `["**/node_modules/**", "**/dist/**", ...]` |
| `sikg.maxTraversalDepth` | Maximum depth for impact propagation | `5` |
| `sikg.minImpactThreshold` | Minimum impact threshold (0-1) | `0.05` |
| `sikg.highImpactThreshold` | Threshold for high impact tests (0-1) | `0.7` |
| `sikg.lowImpactThreshold` | Threshold for low impact tests (0-1) | `0.3` |
| `sikg.logLevel` | Logging level (debug, info, warn, error) | `"info"` |

## Development

Want to contribute or build from source?

### Setup

```bash
# Clone the repository
git clone https://github.com/ai4se4ai-lab/SIKG.git

# Navigate to the project folder
cd SIKG

# Install dependencies
npm install
```

### Build and Run

```bash
# Compile the extension
npm run compile

# Watch for changes
npm run watch

# Package the extension
npm run package
```

### Run Extension in Development Mode

Press `F5` in VS Code to launch a new window with the extension loaded.

### Project Structure

```
vscode-sikg/
├── src/                    # Source code
│   ├── extension.ts        # Extension entry point
│   ├── sikg/               # Core SIKG implementation
│   │   ├── SIKGManager.ts  # Knowledge graph manager
│   │   ├── CodeParser.ts   # Code analysis
│   │   ├── TestParser.ts   # Test detection
│   │   ├── ChangeAnalyzer.ts # Change analysis
│   │   ├── TestPrioritizer.ts # Test prioritization
│   │   └── GraphTypes.ts   # Type definitions
│   ├── services/           # Support services
│   │   ├── GitService.ts   # Git integration
│   │   └── TestRunnerService.ts # Test execution
│   ├── ui/                 # UI components
│   │   ├── StatusBarManager.ts # Status bar integration
│   │   └── SIKGViewProvider.ts # Webview implementation
│   └── utils/              # Utilities
│       ├── Logger.ts       # Logging functionality
│       └── ConfigManager.ts # Configuration handling
├── images/                 # Images for documentation
├── .vscode/                # VS Code settings
│   ├── launch.json         # Launch configuration
│   └── tasks.json          # Task configuration
├── .gitignore              # Git ignore file
├── package.json            # Extension manifest
├── tsconfig.json           # TypeScript configuration
└── README.md               # This file
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgements

- This extension is based on research in semantic impact analysis and knowledge graph-based test selection
- Inspired by academic work on change impact analysis and test prioritization techniques
- Icons and graphics created by [Freepik](https://www.freepik.com) from [Flaticon](https://www.flaticon.com/)

---

<p align="center">
  Made with ❤️ by the SIKG team
</p>
