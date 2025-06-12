// DataCollector.ts - Collect experiment data for evaluation

import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../../utils/Logger';
import { ChangeType } from '../config/ExperimentConfig';

export interface ExperimentData {
    timestamp: string;
    experimentId: string;
    approach: string;
    subjectProject: string;
    changeType: ChangeType;
    iteration: number;
    
    // Input data
    totalTests: number;
    selectedTests: number;
    changedFiles: string[];
    
    // Results
    executionTime: number;
    faultsDetected: number;
    faultsInjected: number;
    precision: number;
    recall: number;
    f1Score: number;
    apfd: number;
    reductionRatio: number;
    
    // Additional metrics
    avgTestTime: number;
    memoryUsage?: number;
    
    // Metadata
    configuration: any;
    notes?: string;
}

export interface SyntheticChange {
    id: string;
    type: ChangeType;
    filePath: string;
    linesChanged: number;
    semanticComplexity: number;
    injectedFaults: SyntheticFault[];
}

export interface SyntheticFault {
    id: string;
    type: 'assertion' | 'logic' | 'boundary' | 'null' | 'exception';
    location: { line: number; column: number };
    description: string;
    detectability: number; // 0-1, how likely tests are to catch this fault
}

/**
 * Collects and manages experiment data
 */
export class DataCollector {
    private data: ExperimentData[] = [];
    private outputDir: string;

    constructor(outputDir: string) {
        this.outputDir = outputDir;
        this.ensureOutputDirectory();
    }

    /**
     * Record a single experiment result
     */
    public recordExperiment(data: ExperimentData): void {
        this.data.push({
            ...data,
            timestamp: new Date().toISOString()
        });
        
        Logger.debug(`Recorded experiment: ${data.approach} on ${data.subjectProject} (${data.changeType})`);
    }

    /**
     * Generate synthetic code changes for experiments
     */
    public generateSyntheticChanges(
        filePaths: string[], 
        changeTypes: ChangeType[], 
        count: number = 50
    ): SyntheticChange[] {
        const changes: SyntheticChange[] = [];
        
        for (let i = 0; i < count; i++) {
            const filePath = filePaths[Math.floor(Math.random() * filePaths.length)];
            const changeType = changeTypes[Math.floor(Math.random() * changeTypes.length)];
            
            const change: SyntheticChange = {
                id: `change_${i}_${Date.now()}`,
                type: changeType,
                filePath,
                linesChanged: this.generateLinesChanged(changeType),
                semanticComplexity: this.calculateSemanticComplexity(changeType),
                injectedFaults: this.generateSyntheticFaults(changeType)
            };
            
            changes.push(change);
        }
        
        Logger.info(`Generated ${changes.length} synthetic changes`);
        return changes;
    }

    /**
     * Generate synthetic faults based on change type
     */
    private generateSyntheticFaults(changeType: ChangeType): SyntheticFault[] {
        const faultCount = this.getFaultCountForChangeType(changeType);
        const faults: SyntheticFault[] = [];
        
        for (let i = 0; i < faultCount; i++) {
            const faultType = this.selectFaultType(changeType);
            
            faults.push({
                id: `fault_${i}_${Date.now()}`,
                type: faultType,
                location: { 
                    line: Math.floor(Math.random() * 100) + 1, 
                    column: Math.floor(Math.random() * 80) + 1 
                },
                description: this.generateFaultDescription(faultType),
                detectability: this.calculateDetectability(faultType, changeType)
            });
        }
        
        return faults;
    }

    /**
     * Determine fault count based on change type
     */
    private getFaultCountForChangeType(changeType: ChangeType): number {
        const faultProbabilities = {
            'BUG_FIX': 0.8,           // High chance of introducing new bugs
            'FEATURE_ADDITION': 0.6,   // Medium-high chance
            'REFACTORING_SIGNATURE': 0.7, // High chance due to interface changes
            'REFACTORING_LOGIC': 0.4,  // Medium chance
            'DEPENDENCY_UPDATE': 0.3,  // Lower chance
            'PERFORMANCE_OPT': 0.2     // Lowest chance
        };
        
        const probability = faultProbabilities[changeType] || 0.3;
        return Math.random() < probability ? 1 : 0;
    }

    /**
     * Select fault type based on change type
     */
    private selectFaultType(changeType: ChangeType): SyntheticFault['type'] {
        const faultTypes: SyntheticFault['type'][] = ['assertion', 'logic', 'boundary', 'null', 'exception'];
        
        // Weight fault types based on change type
        if (changeType === 'BUG_FIX') {
            return Math.random() < 0.5 ? 'logic' : 'assertion';
        } else if (changeType === 'FEATURE_ADDITION') {
            return Math.random() < 0.4 ? 'null' : 'logic';
        } else if (changeType.includes('REFACTORING')) {
            return Math.random() < 0.6 ? 'assertion' : 'logic';
        }
        
        return faultTypes[Math.floor(Math.random() * faultTypes.length)];
    }

    /**
     * Calculate detectability score for fault type and change type combination
     */
    private calculateDetectability(faultType: SyntheticFault['type'], changeType: ChangeType): number {
        const baseDetectability = {
            'assertion': 0.8,  // Usually caught by unit tests
            'logic': 0.6,      // Depends on test coverage
            'boundary': 0.7,   // Often caught by edge case tests
            'null': 0.5,       // Depends on null handling tests
            'exception': 0.9   // Usually causes test failures
        };
        
        let detectability = baseDetectability[faultType];
        
        // Adjust based on change type
        if (changeType === 'BUG_FIX') {
            detectability *= 1.2; // Bug fixes are usually well-tested
        } else if (changeType === 'FEATURE_ADDITION') {
            detectability *= 0.8; // New features may lack comprehensive tests
        }
        
        return Math.min(1.0, detectability);
    }

    /**
     * Generate fault description
     */
    private generateFaultDescription(faultType: SyntheticFault['type']): string {
        const descriptions = {
            'assertion': 'Incorrect assertion condition',
            'logic': 'Flawed conditional logic',
            'boundary': 'Off-by-one error in loop or array access',
            'null': 'Potential null pointer dereference',
            'exception': 'Unhandled exception scenario'
        };
        
        return descriptions[faultType];
    }

    /**
     * Generate realistic lines changed based on change type
     */
    private generateLinesChanged(changeType: ChangeType): number {
        const ranges = {
            'BUG_FIX': [1, 10],
            'FEATURE_ADDITION': [10, 50],
            'REFACTORING_SIGNATURE': [2, 15],
            'REFACTORING_LOGIC': [5, 25],
            'DEPENDENCY_UPDATE': [1, 5],
            'PERFORMANCE_OPT': [3, 20]
        };
        
        const [min, max] = ranges[changeType] || [1, 10];
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    /**
     * Calculate semantic complexity score
     */
    private calculateSemanticComplexity(changeType: ChangeType): number {
        const complexityScores = {
            'BUG_FIX': 0.7,
            'FEATURE_ADDITION': 0.8,
            'REFACTORING_SIGNATURE': 0.9,
            'REFACTORING_LOGIC': 0.6,
            'DEPENDENCY_UPDATE': 0.4,
            'PERFORMANCE_OPT': 0.5
        };
        
        const baseScore = complexityScores[changeType] || 0.5;
        const variation = (Math.random() - 0.5) * 0.3; // ±15% variation
        
        return Math.max(0.1, Math.min(1.0, baseScore + variation));
    }

    /**
     * Export collected data to file
     */
    public exportData(filename?: string): string {
        const exportFilename = filename || `experiment_data_${Date.now()}.json`;
        const filePath = path.join(this.outputDir, 'results', exportFilename);
        
        const exportData = {
            metadata: {
                exportTime: new Date().toISOString(),
                totalExperiments: this.data.length,
                version: '1.0.0'
            },
            experiments: this.data
        };
        
        fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2));
        
        Logger.info(`Exported experiment data to: ${filePath}`);
        return filePath;
    }

    /**
     * Get summary statistics
     */
    public getSummary(): {
        totalExperiments: number;
        byApproach: Record<string, number>;
        byChangeType: Record<string, number>;
        avgMetrics: {
            precision: number;
            recall: number;
            f1Score: number;
            reductionRatio: number;
        };
    } {
        const byApproach: Record<string, number> = {};
        const byChangeType: Record<string, number> = {};
        
        let totalPrecision = 0;
        let totalRecall = 0;
        let totalF1 = 0;
        let totalReduction = 0;
        
        for (const exp of this.data) {
            byApproach[exp.approach] = (byApproach[exp.approach] || 0) + 1;
            byChangeType[exp.changeType] = (byChangeType[exp.changeType] || 0) + 1;
            
            totalPrecision += exp.precision;
            totalRecall += exp.recall;
            totalF1 += exp.f1Score;
            totalReduction += exp.reductionRatio;
        }
        
        const count = this.data.length || 1;
        
        return {
            totalExperiments: this.data.length,
            byApproach,
            byChangeType,
            avgMetrics: {
                precision: totalPrecision / count,
                recall: totalRecall / count,
                f1Score: totalF1 / count,
                reductionRatio: totalReduction / count
            }
        };
    }

    /**
     * Clear collected data
     */
    public clear(): void {
        this.data = [];
        Logger.debug('Experiment data cleared');
    }

    /**
     * Ensure output directory exists
     */
    private ensureOutputDirectory(): void {
        const resultsDir = path.join(this.outputDir, 'results');
        if (!fs.existsSync(resultsDir)) {
            fs.mkdirSync(resultsDir, { recursive: true });
        }
    }
}