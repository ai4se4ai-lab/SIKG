// Logger - Logging utility for the extension

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class Logger {
    private static outputChannel: vscode.OutputChannel;
    private static logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info';
    private static logFile: string | null = null;

    /**
     * Initialize the logger
     */
    public static init(context: vscode.ExtensionContext, logLevel: 'debug' | 'info' | 'warn' | 'error'): void {
        // Create output channel if not already created
        if (!this.outputChannel) {
            this.outputChannel = vscode.window.createOutputChannel('SIKG');
        }

        // Set log level
        this.logLevel = logLevel;

        // Set up log file (optional)
        const logDir = path.join(context.globalStorageUri.fsPath, 'logs');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }

        this.logFile = path.join(logDir, `sikg-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
    }

    /**
     * Log a debug message
     */
    public static debug(message: string, ...args: any[]): void {
        if (this.shouldLog('debug')) {
            this.log('DEBUG', message, args);
        }
    }

    /**
     * Log an info message
     */
    public static info(message: string, ...args: any[]): void {
        if (this.shouldLog('info')) {
            this.log('INFO', message, args);
        }
    }

    /**
     * Log a warning message
     */
    public static warn(message: string, ...args: any[]): void {
        if (this.shouldLog('warn')) {
            this.log('WARN', message, args);
        }
    }

    /**
     * Log an error message
     */
    public static error(message: string, ...args: any[]): void {
        if (this.shouldLog('error')) {
            this.log('ERROR', message, args);
        }
    }

    /**
     * Check if a message at the specified level should be logged
     */
    private static shouldLog(level: 'debug' | 'info' | 'warn' | 'error'): boolean {
        const levels: Record<string, number> = {
            'debug': 0,
            'info': 1,
            'warn': 2,
            'error': 3
        };

        return levels[level] >= levels[this.logLevel];
    }

    /**
     * Log a message with the specified level
     */
    private static log(level: string, message: string, args: any[]): void {
        const timestamp = new Date().toISOString();
        const formattedArgs = args.length > 0 
            ? args.map(arg => {
                if (arg instanceof Error) {
                    return `${arg.message}\n${arg.stack || ''}`;
                } else if (typeof arg === 'object') {
                    return JSON.stringify(arg, null, 2);
                } else {
                    return String(arg);
                }
            }).join(' ')
            : '';

        const logMessage = `[${timestamp}] [${level}] ${message} ${formattedArgs}`.trim();

        // Log to output channel
        this.outputChannel.appendLine(logMessage);

        // Also log to file if configured
        if (this.logFile) {
            fs.appendFileSync(this.logFile, logMessage + '\n');
        }
    }
}