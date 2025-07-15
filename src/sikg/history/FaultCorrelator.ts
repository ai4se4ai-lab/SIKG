// FaultCorrelator.ts - Fault correlation analysis for Python projects

import { Logger } from '../../utils/Logger';
import { TestResultInfo } from './HistoryAnalyzer';

/**
 * Analyzes fault correlations between Python code changes and test failures
 * Implements fault correlation calculation for Algorithm 2 (lines 14-16)
 */
export class FaultCorrelator {
    private faultCache: Map<string, number> = new Map();
    private testResultCount: number = 0;

    /**
     * Calculate fault correlation between source and target nodes
     * Implements Algorithm 2, lines 14-16: faultCorr = correlatedFailures / (srcFaults + 1)
     */
    public async calculateFaultCorrelation(
        sourceId: string,
        targetId: string,
        testHistory: TestResultInfo[]
    ): Promise<number> {
        try {
            this.testResultCount = testHistory.length;

            // Create cache key
            const cacheKey = `${sourceId}:${targetId}`;
            if (this.faultCache.has(cacheKey)) {
                return this.faultCache.get(cacheKey)!;
            }

            // Extract file paths from node IDs
            const sourceFile = this.extractFileFromNodeId(sourceId);
            const targetFile = this.extractFileFromNodeId(targetId);

            if (!sourceFile || !targetFile) {
                this.faultCache.set(cacheKey, 0);
                return 0;
            }

            // Count source faults and correlated failures
            const sourceFaults = this.countSourceFaults(sourceFile, testHistory);
            const correlatedFailures = this.countCorrelatedFailures(sourceFile, targetFile, testHistory);

            // Apply fault correlation formula from Algorithm 2 (line 16)
            const faultCorrelation = correlatedFailures / (sourceFaults + 1); // +1 for smoothing

            // Cache the result
            this.faultCache.set(cacheKey, faultCorrelation);

            Logger.debug(`Fault correlation: ${sourceFile} -> ${targetFile} = ${faultCorrelation.toFixed(3)}`);
            return faultCorrelation;

        } catch (error) {
            Logger.debug('Error calculating fault correlation:', error);
            return 0;
        }
    }

    /**
     * Count source faults - test failures associated with a specific file
     */
    private countSourceFaults(sourceFile: string, testHistory: TestResultInfo[]): number {
        let faultCount = 0;

        for (const testResult of testHistory) {
            if (testResult.status === 'failed' && this.isTestRelatedToFile(testResult, sourceFile)) {
                faultCount++;
            }
        }

        return faultCount;
    }

    /**
     * Count correlated failures between source and target files
     */
    private countCorrelatedFailures(sourceFile: string, targetFile: string, testHistory: TestResultInfo[]): number {
        let correlatedCount = 0;
        const timeWindow = 48 * 60 * 60 * 1000; // 48 hours in milliseconds

        for (let i = 0; i < testHistory.length; i++) {
            const sourceTest = testHistory[i];
            
            // Check if this test failure is related to the source file
            if (sourceTest.status === 'failed' && this.isTestRelatedToFile(sourceTest, sourceFile)) {
                
                // Look for subsequent failures related to target file within time window
                for (let j = i + 1; j < testHistory.length; j++) {
                    const targetTest = testHistory[j];
                    
                    // Check time window
                    const timeDiff = targetTest.timestamp.getTime() - sourceTest.timestamp.getTime();
                    if (timeDiff > timeWindow) {
                        break; // Outside time window
                    }
                    
                    // Check if target test failed and is related to target file
                    if (targetTest.status === 'failed' && this.isTestRelatedToFile(targetTest, targetFile)) {
                        correlatedCount++;
                        break; // Count once per source failure
                    }
                }
            }
        }

        return correlatedCount;
    }

    /**
     * Check if a test result is related to a specific Python file
     */
    private isTestRelatedToFile(testResult: TestResultInfo, filePath: string): boolean {
        try {
            // Check if test ID contains the file name
            const fileName = filePath.replace('.py', '');
            const testId = testResult.testId.toLowerCase();
            const fileNameLower = fileName.toLowerCase();

            // Common patterns for Python test naming
            return testId.includes(fileNameLower) ||
                   testId.includes(`test_${fileNameLower}`) ||
                   testId.includes(`${fileNameLower}_test`) ||
                   testId.includes(filePath.toLowerCase());

        } catch (error) {
            Logger.debug('Error checking test-file relation:', error);
            return false;
        }
    }

    /**
     * Extract Python file path from node ID
     */
    private extractFileFromNodeId(nodeId: string): string | null {
        try {
            // Look for .py extension in the node ID
            const pythonFileMatch = nodeId.match(/([^/\\]*\.py)/);
            if (pythonFileMatch) {
                return pythonFileMatch[1];
            }

            // For test nodes, try to infer the tested file
            if (nodeId.includes('test_')) {
                const testMatch = nodeId.match(/test_([^_]+)/);
                if (testMatch) {
                    return `${testMatch[1]}.py`;
                }
            }

            return null;
        } catch (error) {
            Logger.debug('Error extracting file from node ID:', error);
            return null;
        }
    }

    /**
     * Get fault correlation statistics
     */
    public getFaultStats(): {
        totalCorrelations: number;
        averageCorrelation: number;
        maxCorrelation: number;
        testResultsAnalyzed: number;
    } {
        const correlations = Array.from(this.faultCache.values());
        
        return {
            totalCorrelations: correlations.length,
            averageCorrelation: correlations.length > 0 ? 
                correlations.reduce((sum, corr) => sum + corr, 0) / correlations.length : 0,
            maxCorrelation: correlations.length > 0 ? Math.max(...correlations) : 0,
            testResultsAnalyzed: this.testResultCount
        };
    }

    /**
     * Get highly correlated fault pairs
     */
    public getHighlyCorrelatedFaults(threshold: number = 0.1): Array<{
        pair: string;
        correlation: number;
    }> {
        const highCorrelations: Array<{ pair: string; correlation: number }> = [];
        
        for (const [pair, correlation] of this.faultCache.entries()) {
            if (correlation >= threshold) {
                highCorrelations.push({ pair, correlation });
            }
        }
        
        return highCorrelations.sort((a, b) => b.correlation - a.correlation);
    }

    /**
     * Analyze fault patterns for a specific Python file
     */
    public analyzeFaultPatterns(filePath: string, testHistory: TestResultInfo[]): {
        totalFaults: number;
        averageTimeToFix: number;
        mostCommonFailureTime: string;
        relatedTests: string[];
    } {
        const faults = testHistory.filter(test => 
            test.status === 'failed' && this.isTestRelatedToFile(test, filePath)
        );

        const relatedTests = [...new Set(faults.map(fault => fault.testId))];
        
        // Analyze failure times (hour of day)
        const failureHours = faults.map(fault => fault.timestamp.getHours());
        const hourCounts = new Map<number, number>();
        
        failureHours.forEach(hour => {
            hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
        });
        
        const mostCommonHour = Array.from(hourCounts.entries())
            .sort((a, b) => b[1] - a[1])[0]?.[0] || 0;

        return {
            totalFaults: faults.length,
            averageTimeToFix: this.calculateAverageTimeToFix(faults),
            mostCommonFailureTime: `${mostCommonHour}:00`,
            relatedTests
        };
    }

    /**
     * Calculate average time to fix based on test result patterns
     */
    private calculateAverageTimeToFix(faults: TestResultInfo[]): number {
        // Simplified calculation - in reality, would need commit correlation
        const executionTimes = faults.map(fault => fault.executionTime).filter(time => time > 0);
        
        if (executionTimes.length === 0) {
            return 0;
        }
        
        return executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length;
    }

    /**
     * Get test result count
     */
    public getTestResultCount(): number {
        return this.testResultCount;
    }

    /**
     * Clear the fault correlation cache
     */
    public clearCache(): void {
        this.faultCache.clear();
        Logger.debug('Fault correlation cache cleared');
    }

    /**
     * Clean up resources
     */
    public dispose(): void {
        this.clearCache();
        this.testResultCount = 0;
    }
}