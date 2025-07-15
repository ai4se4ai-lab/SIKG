// CoChangeDetector.ts - Co-change frequency calculation for Python projects

import { Logger } from '../../utils/Logger';
import { CommitInfo } from './HistoryAnalyzer';

/**
 * Detects co-change patterns between Python files and functions
 * Implements co-change frequency calculation for Algorithm 2 (lines 6-8)
 */
export class CoChangeDetector {
    private coChangeCache: Map<string, number> = new Map();

    /**
     * Calculate co-change frequency between two nodes using Jaccard similarity
     * Implements Algorithm 2, lines 6-8: coChangeFreq = jointChanges / (srcChanges + tgtChanges - jointChanges)
     */
    public async calculateCoChangeFrequency(
        sourceId: string, 
        targetId: string, 
        commits: CommitInfo[]
    ): Promise<number> {
        try {
            // Create cache key
            const cacheKey = `${sourceId}:${targetId}`;
            if (this.coChangeCache.has(cacheKey)) {
                return this.coChangeCache.get(cacheKey)!;
            }

            // Extract file paths from node IDs
            const sourceFile = this.extractFileFromNodeId(sourceId);
            const targetFile = this.extractFileFromNodeId(targetId);

            if (!sourceFile || !targetFile || sourceFile === targetFile) {
                this.coChangeCache.set(cacheKey, 0);
                return 0;
            }

            // Count changes for each file
            const sourceChanges = this.countFileChanges(sourceFile, commits);
            const targetChanges = this.countFileChanges(targetFile, commits);
            const jointChanges = this.countJointChanges(sourceFile, targetFile, commits);

            // Apply Jaccard similarity coefficient as mentioned in the paper
            const denominator = sourceChanges + targetChanges - jointChanges;
            const coChangeFreq = denominator > 0 ? jointChanges / denominator : 0;

            // Cache the result
            this.coChangeCache.set(cacheKey, coChangeFreq);

            Logger.debug(`Co-change frequency: ${sourceFile} <-> ${targetFile} = ${coChangeFreq.toFixed(3)}`);
            return coChangeFreq;

        } catch (error) {
            Logger.debug('Error calculating co-change frequency:', error);
            return 0;
        }
    }

    /**
     * Count how many times a specific Python file was changed
     */
    private countFileChanges(filePath: string, commits: CommitInfo[]): number {
        let changeCount = 0;
        
        for (const commit of commits) {
            if (this.fileChangedInCommit(filePath, commit)) {
                changeCount++;
            }
        }
        
        return changeCount;
    }

    /**
     * Count joint changes where both files changed in the same commit
     */
    private countJointChanges(sourceFile: string, targetFile: string, commits: CommitInfo[]): number {
        let jointCount = 0;
        
        for (const commit of commits) {
            const sourceChanged = this.fileChangedInCommit(sourceFile, commit);
            const targetChanged = this.fileChangedInCommit(targetFile, commit);
            
            if (sourceChanged && targetChanged) {
                jointCount++;
            }
        }
        
        return jointCount;
    }

    /**
     * Check if a specific file was changed in a commit
     */
    private fileChangedInCommit(filePath: string, commit: CommitInfo): boolean {
        return commit.changedFiles.some(changedFile => {
            // Normalize paths for comparison
            const normalizedChanged = changedFile.replace(/\\/g, '/').toLowerCase();
            const normalizedTarget = filePath.replace(/\\/g, '/').toLowerCase();
            
            // Check for exact match or file name match
            return normalizedChanged === normalizedTarget || 
                   normalizedChanged.endsWith('/' + normalizedTarget) ||
                   normalizedChanged.includes(normalizedTarget);
        });
    }

    /**
     * Extract Python file path from node ID
     */
    private extractFileFromNodeId(nodeId: string): string | null {
        try {
            // Node IDs in SIKG typically encode file information
            // Look for .py extension in the node ID
            const pythonFileMatch = nodeId.match(/([^/\\]*\.py)/);
            if (pythonFileMatch) {
                return pythonFileMatch[1];
            }

            // Alternative: look for file path patterns in the hash
            // This is a simplified approach - real implementation might need more sophisticated parsing
            if (nodeId.includes('_') && nodeId.length > 20) {
                // This might be a hash-based ID, try to find associated Python files
                // For now, return null as we can't reliably extract the file
                return null;
            }

            return null;
        } catch (error) {
            Logger.debug('Error extracting file from node ID:', error);
            return null;
        }
    }

    /**
     * Get co-change statistics for analysis
     */
    public getCoChangeStats(): {
        totalPairs: number;
        averageCoChangeFreq: number;
        maxCoChangeFreq: number;
        cachedPairs: number;
    } {
        const frequencies = Array.from(this.coChangeCache.values());
        
        return {
            totalPairs: frequencies.length,
            averageCoChangeFreq: frequencies.length > 0 ? 
                frequencies.reduce((sum, freq) => sum + freq, 0) / frequencies.length : 0,
            maxCoChangeFreq: frequencies.length > 0 ? Math.max(...frequencies) : 0,
            cachedPairs: this.coChangeCache.size
        };
    }

    /**
     * Get frequently co-changing file pairs
     */
    public getFrequentCoChanges(threshold: number = 0.1): Array<{
        pair: string;
        frequency: number;
    }> {
        const frequentPairs: Array<{ pair: string; frequency: number }> = [];
        
        for (const [pair, frequency] of this.coChangeCache.entries()) {
            if (frequency >= threshold) {
                frequentPairs.push({ pair, frequency });
            }
        }
        
        return frequentPairs.sort((a, b) => b.frequency - a.frequency);
    }

    /**
     * Clear the co-change cache
     */
    public clearCache(): void {
        this.coChangeCache.clear();
        Logger.debug('Co-change cache cleared');
    }

    /**
     * Clean up resources
     */
    public dispose(): void {
        this.clearCache();
    }
}