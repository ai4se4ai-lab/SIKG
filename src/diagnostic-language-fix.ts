// diagnostic-language-fix.ts - Script to diagnose and fix language detection issues

import * as vscode from 'vscode';
import { Logger } from './utils/Logger';

/**
 * Diagnostic function to identify and fix language detection issues
 * Run this when you encounter the "unknown language python" error
 */
export async function diagnoseLangaugeIssues(): Promise<void> {
    console.log('🔍 SIKG Language Detection Diagnostics');
    console.log('=====================================');

    // 1. Check VS Code's language support
    console.log('\n1. VS Code Language Support:');
    try {
        const languages = await vscode.languages.getLanguages();
        console.log(`   Total languages supported by VS Code: ${languages.length}`);
        
        const pythonSupported = languages.includes('python');
        console.log(`   ✅ Python supported: ${pythonSupported}`);
        
        if (!pythonSupported) {
            console.log('   🚨 ISSUE: Python language not found in VS Code');
            console.log('   💡 FIX: Install Python extension for VS Code');
        }
        
        // Check other SIKG languages
        const sikgLanguages = ['javascript', 'typescript', 'java', 'csharp', 'go'];
        for (const lang of sikgLanguages) {
            const supported = languages.includes(lang);
            console.log(`   ${supported ? '✅' : '❌'} ${lang} supported: ${supported}`);
        }
    } catch (error) {
        console.log(`   ❌ Error checking languages: ${error}`);
    }

    // 2. Check workspace files
    console.log('\n2. Workspace File Analysis:');
    try {
        if (vscode.workspace.workspaceFolders) {
            for (const folder of vscode.workspace.workspaceFolders) {
                console.log(`   Workspace: ${folder.name}`);
                
                // Find Python files
                const pythonFiles = await vscode.workspace.findFiles('**/*.py', '**/node_modules/**', 5);
                console.log(`   Python files found: ${pythonFiles.length}`);
                
                // Check language detection for first Python file
                if (pythonFiles.length > 0) {
                    const firstFile = pythonFiles[0];
                    try {
                        const doc = await vscode.workspace.openTextDocument(firstFile);
                        console.log(`   File: ${firstFile.fsPath}`);
                        console.log(`   Detected language: ${doc.languageId}`);
                        
                        if (doc.languageId !== 'python') {
                            console.log(`   🚨 ISSUE: Expected 'python', got '${doc.languageId}'`);
                        }
                    } catch (error) {
                        console.log(`   ❌ Error opening file: ${error}`);
                    }
                }
            }
        } else {
            console.log('   No workspace folders found');
        }
    } catch (error) {
        console.log(`   ❌ Error analyzing workspace: ${error}`);
    }

    // 3. Check SIKG configuration
    console.log('\n3. SIKG Configuration:');
    try {
        const config = vscode.workspace.getConfiguration('sikg');
        const supportedLanguages = config.get<string[]>('supportedLanguages', []);
        const codeFileExtensions = config.get<string[]>('codeFileExtensions', []);
        
        console.log(`   Supported languages: ${supportedLanguages.join(', ')}`);
        console.log(`   Code file extensions: ${codeFileExtensions.join(', ')}`);
        
        if (!supportedLanguages.includes('python')) {
            console.log('   🚨 ISSUE: Python not in supported languages');
        }
        
        if (!codeFileExtensions.includes('py')) {
            console.log('   🚨 ISSUE: .py extension not in code file extensions');
        }
    } catch (error) {
        console.log(`   ❌ Error checking SIKG config: ${error}`);
    }

    // 4. Provide fixes
    console.log('\n4. Recommended Fixes:');
    console.log('   💡 1. Ensure Python extension is installed:');
    console.log('      - Open Extensions view (Ctrl+Shift+X)');
    console.log('      - Search for "Python" by Microsoft');
    console.log('      - Install if not already installed');
    
    console.log('   💡 2. Update SIKG settings if needed:');
    console.log('      - Open Settings (Ctrl+,)');
    console.log('      - Search for "sikg"');
    console.log('      - Ensure Python is in supported languages');
    
    console.log('   💡 3. Reload VS Code window:');
    console.log('      - Press Ctrl+Shift+P');
    console.log('      - Run "Developer: Reload Window"');

    console.log('\n5. Test Language Detection:');
    await testLanguageDetection();
}

/**
 * Test language detection with sample files
 */
async function testLanguageDetection(): Promise<void> {
    const testFiles = [
        { name: 'test.py', content: 'def hello():\n    print("Hello, World!")' },
        { name: 'test.js', content: 'function hello() {\n    console.log("Hello, World!");\n}' }
    ];

    for (const testFile of testFiles) {
        try {
            // Create a temporary document
            const uri = vscode.Uri.parse(`untitled:${testFile.name}`);
            const doc = await vscode.workspace.openTextDocument(uri);
            
            // Set content
            const editor = await vscode.window.showTextDocument(doc);
            await editor.edit(editBuilder => {
                editBuilder.insert(new vscode.Position(0, 0), testFile.content);
            });

            console.log(`   File: ${testFile.name} -> Language: ${doc.languageId}`);
            
            // Close the document
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            
        } catch (error) {
            console.log(`   ❌ Error testing ${testFile.name}: ${error}`);
        }
    }
}

/**
 * Fix common language detection issues
 */
export async function fixLanguageIssues(): Promise<void> {
    console.log('🔧 Applying Language Detection Fixes...');
    
    try {
        // 1. Update SIKG configuration
        const config = vscode.workspace.getConfiguration('sikg');
        
        // Ensure supported languages include all expected values
        const supportedLanguages = ['python', 'javascript', 'typescript', 'java', 'csharp', 'go'];
        await config.update('supportedLanguages', supportedLanguages, vscode.ConfigurationTarget.Global);
        
        // Ensure code file extensions are correct
        const codeFileExtensions = ['py', 'js', 'jsx', 'ts', 'tsx', 'java', 'cs', 'go'];
        await config.update('codeFileExtensions', codeFileExtensions, vscode.ConfigurationTarget.Global);
        
        console.log('✅ Updated SIKG configuration');
        
        // 2. Check if Python extension is installed
        const pythonExtension = vscode.extensions.getExtension('ms-python.python');
        if (!pythonExtension) {
            console.log('🚨 Python extension not found');
            console.log('💡 Please install the Python extension by Microsoft');
            
            // Show installation prompt
            const action = await vscode.window.showWarningMessage(
                'Python extension is required for SIKG to work with Python files.',
                'Install Python Extension',
                'Skip'
            );
            
            if (action === 'Install Python Extension') {
                await vscode.commands.executeCommand('workbench.extensions.search', 'ms-python.python');
            }
        } else {
            console.log('✅ Python extension found');
            
            // Ensure it's activated
            if (!pythonExtension.isActive) {
                console.log('⏳ Activating Python extension...');
                await pythonExtension.activate();
                console.log('✅ Python extension activated');
            }
        }
        
        // 3. Show success message
        vscode.window.showInformationMessage('SIKG language detection fixes applied. Please reload the window.');
        
    } catch (error) {
        console.log(`❌ Error applying fixes: ${error}`);
        vscode.window.showErrorMessage(`Failed to apply language fixes: ${error}`);
    }
}

/**
 * Command to run diagnostics
 */
export function registerDiagnosticCommands(context: vscode.ExtensionContext): void {
    // Register diagnostic command
    const diagnosticCommand = vscode.commands.registerCommand('sikg.diagnoseLangaugeIssues', async () => {
        await diagnoseLangaugeIssues();
    });
    
    // Register fix command
    const fixCommand = vscode.commands.registerCommand('sikg.fixLanguageIssues', async () => {
        await fixLanguageIssues();
    });
    
    context.subscriptions.push(diagnosticCommand, fixCommand);
    
    // Add to package.json commands:
    /*
    {
      "command": "sikg.diagnoseLangaugeIssues",
      "title": "SIKG: Diagnose Language Issues"
    },
    {
      "command": "sikg.fixLanguageIssues", 
      "title": "SIKG: Fix Language Issues"
    }
    */
}