// AstProcessorManager.ts - Manages AST processor resources

import * as child_process from 'child_process';
import * as path from 'path';
import { FileUtils } from './FileUtils';
import { Logger } from '../../../utils/Logger';
import * as fs from 'fs';

/**
 * Manager for Abstract Syntax Tree (AST) processing resources
 */
export class AstProcessorManager {
    public tempDir: string = "tempDir";
    public initialized: boolean = false;
    public pythonCommand: string = 'python';

    /**
     * Initialize the AST processor manager
     */
    public async initialize(): Promise<boolean> {
        try {
            // Create temporary directory
            this.tempDir = FileUtils.createTempDirectory('sikg-ast-');
            
            // Determine python command (python or python3)
            this.pythonCommand = await this.determinePythonCommand();
            
            this.initialized = true;
            Logger.info(`AST Processor Manager initialized. Using ${this.pythonCommand}.`);
            return true;
        } catch (error) {
            Logger.error('Failed to initialize AST Processor Manager:', error);
            return false;
        }
    }

    /**
     * Get the path to the temporary directory
     */
    public getTempDir(): string {
        if (!this.initialized) {
            throw new Error('AST Processor Manager is not initialized');
        }
        return this.tempDir;
    }

    /**
     * Install an AST processor script
     * @param scriptName Name for the script file
     * @param scriptContent Content of the script
     * @returns Path to the installed script
     */
    public installScript(scriptName: string, scriptContent: string): string {
        if (!this.initialized) {
            throw new Error('AST Processor Manager is not initialized');
        }
        
        const scriptPath = path.join(this.tempDir, scriptName);
        FileUtils.writeFile(scriptPath, scriptContent);
        Logger.debug(`Installed AST script: ${scriptPath}`);
        
        return scriptPath;
    }

    /**
     * Execute an AST processor script
     * @param scriptPath Path to the script
     * @param args Arguments to pass to the script
     * @returns The script output
     */
    public executeScript(scriptPath: string, args: string[]): string {
        if (!this.initialized) {
            throw new Error('AST Processor Manager is not initialized');
        }
        
        try {
            const command = `${this.pythonCommand} "${scriptPath}" ${args.map(arg => `"${arg}"`).join(' ')}`;
            Logger.debug(`Executing AST script: ${command}`);
            
            return child_process.execSync(command, { encoding: 'utf8' });
        } catch (error) {
            Logger.error(`Failed to execute AST script ${scriptPath}:`, error);
            throw error;
        }
    }

    /**
     * Process a file with an AST processor
     * @param scriptName Name of the processor script
     * @param scriptContent Content of the processor script
     * @param filePath Path to the file to process
     * @param additionalArgs Additional arguments to pass to the script
     * @returns The processing result
     */
    public processFile(scriptName: string, scriptContent: string, filePath: string, additionalArgs: string[] = []): string {
        if (!this.initialized) {
            throw new Error('AST Processor Manager is not initialized');
        }
        
        try {
            // Install the script if it doesn't exist
            const scriptPath = path.join(this.tempDir, scriptName);
            if (!FileUtils.fileExists(scriptPath)) {
                FileUtils.writeFile(scriptPath, scriptContent);
            }
            
            // Create a temporary file with the content if filePath is a content string
            let fileToProcess = filePath;
            if (!FileUtils.fileExists(filePath)) {
                fileToProcess = FileUtils.createTempFileWithContent(
                    this.tempDir,
                    `temp_${Date.now()}.py`,
                    filePath
                );
            }
            
            // Execute the script
            const args = [fileToProcess, ...additionalArgs];
            const result = this.executeScript(scriptPath, args);
            
            // Clean up if we created a temporary file
            if (fileToProcess !== filePath) {
                try {
                    if (FileUtils.fileExists(fileToProcess)) {
                        fs.unlinkSync(fileToProcess);
                    }
                } catch (cleanupError) {
                    Logger.warn(`Failed to clean up temporary file ${fileToProcess}:`, cleanupError);
                }
            }
            
            return result;
        } catch (error) {
            Logger.error(`Failed to process file ${filePath} with AST processor ${scriptName}:`, error);
            throw error;
        }
    }

    /**
     * Determine the Python command to use
     * @returns The python command ('python' or 'python3')
     */
    private async determinePythonCommand(): Promise<string> {
        try {
            // Try 'python' first
            child_process.execSync('python --version', { encoding: 'utf8' });
            return 'python';
        } catch (error) {
            try {
                // Fall back to 'python3'
                child_process.execSync('python3 --version', { encoding: 'utf8' });
                return 'python3';
            } catch (error) {
                Logger.warn('Neither python nor python3 found. AST processing will not be available.');
                return 'python'; // Default, though it won't work
            }
        }
    }

    /**
     * Clean up resources
     */
    public dispose(): void {
        if (this.initialized) {
            FileUtils.cleanupTempDirectory(this.tempDir);
            this.initialized = false;
            Logger.debug('AST Processor Manager disposed');
        }
    }

    /**
     * Check if Python is available
     * @returns True if Python is available
     */
    public static async isPythonAvailable(): Promise<boolean> {
        try {
            child_process.execSync('python --version', { encoding: 'utf8' });
            return true;
        } catch (error) {
            try {
                child_process.execSync('python3 --version', { encoding: 'utf8' });
                return true;
            } catch (error) {
                return false;
            }
        }
    }
}