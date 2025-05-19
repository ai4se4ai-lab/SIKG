// Status Bar Manager - Manages the status bar item

import * as vscode from 'vscode';

export class StatusBarManager {
    private statusBarItem: vscode.StatusBarItem;

    constructor(context: vscode.ExtensionContext) {
        // Create status bar item
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );

        this.statusBarItem.command = 'sikg.showResults';
        this.statusBarItem.text = '$(testing-sikg) SIKG';
        this.statusBarItem.tooltip = 'Semantic Impact Knowledge Graph';
        this.statusBarItem.show();

        // Add to disposables
        context.subscriptions.push(this.statusBarItem);
    }

    /**
     * Update the status bar text and icon
     */
    public updateStatus(text: string, isLoading: boolean = false): void {
        if (isLoading) {
            this.statusBarItem.text = `$(sync~spin) SIKG: ${text}`;
        } else {
            this.statusBarItem.text = `$(testing-sikg) SIKG: ${text}`;
        }
    }
}