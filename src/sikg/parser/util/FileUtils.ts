// FileUtils.ts - File and path handling utilities

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Logger } from '../../../utils/Logger';

/**
 * Utility functions for file operations
 */
export class FileUtils {
    /**
     * Create a temporary directory
     * @param prefix Prefix for the directory name
     * @returns Path to the created temporary directory
     */
    public static createTempDirectory(prefix: string): string {
        try {
            return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
        } catch (error) {
            Logger.error(`Failed to create temporary directory with prefix ${prefix}:`, error);
            throw error;
        }
    }

    /**
     * Clean up a temporary directory and its contents
     * @param dirPath Path to the directory to clean up
     */
    public static cleanupTempDirectory(dirPath: string): void {
        try {
            if (fs.existsSync(dirPath)) {
                const files = fs.readdirSync(dirPath);
                for (const file of files) {
                    fs.unlinkSync(path.join(dirPath, file));
                }
                fs.rmdirSync(dirPath);
                Logger.debug(`Cleaned up temporary directory: ${dirPath}`);
            }
        } catch (error) {
            Logger.error(`Failed to clean up temporary directory ${dirPath}:`, error);
        }
    }

    /**
     * Write content to a file
     * @param filePath Path to write the file to
     * @param content Content to write
     */
    public static writeFile(filePath: string, content: string): void {
        try {
            fs.writeFileSync(filePath, content, 'utf8');
        } catch (error) {
            Logger.error(`Failed to write file ${filePath}:`, error);
            throw error;
        }
    }

    /**
     * Read content from a file
     * @param filePath Path to read from
     * @returns The file content as a string
     */
    public static readFile(filePath: string): string {
        try {
            return fs.readFileSync(filePath, 'utf8');
        } catch (error) {
            Logger.error(`Failed to read file ${filePath}:`, error);
            throw error;
        }
    }

    /**
     * Create a temporary file with content
     * @param tempDir Directory to create the file in
     * @param filename Filename to use
     * @param content Content to write to the file
     * @returns Path to the created file
     */
    public static createTempFileWithContent(tempDir: string, filename: string, content: string): string {
        try {
            const filePath = path.join(tempDir, filename);
            this.writeFile(filePath, content);
            return filePath;
        } catch (error) {
            Logger.error(`Failed to create temporary file ${filename}:`, error);
            throw error;
        }
    }

    /**
     * Check if a file exists
     * @param filePath Path to check
     * @returns True if the file exists
     */
    public static fileExists(filePath: string): boolean {
        return fs.existsSync(filePath);
    }

    /**
     * Get a unique filename in a directory
     * @param directory Directory to use
     * @param prefix Prefix for the filename
     * @param extension File extension to use
     * @returns A unique filename
     */
    public static getUniqueFilename(directory: string, prefix: string, extension: string): string {
        const timestamp = Date.now();
        const filename = `${prefix}_${timestamp}${extension}`;
        return path.join(directory, filename);
    }

    /**
     * Get the content type of a file based on its extension
     * @param filePath Path to the file
     * @returns MIME type of the file
     */
    public static getContentType(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();
        const contentTypes: Record<string, string> = {
            '.py': 'text/x-python',
            '.js': 'application/javascript',
            '.jsx': 'application/javascript',
            '.ts': 'application/typescript',
            '.tsx': 'application/typescript',
            '.java': 'text/x-java',
            '.cs': 'text/x-csharp',
            '.go': 'text/x-go',
            '.json': 'application/json',
            '.md': 'text/markdown',
            '.txt': 'text/plain',
            '.html': 'text/html',
            '.css': 'text/css'
        };
        
        return contentTypes[ext] || 'text/plain';
    }
}