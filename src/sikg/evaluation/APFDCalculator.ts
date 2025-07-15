// APFDCalculator.ts - APFD and fault detection metrics for Python projects

import { Logger } from '../../utils/Logger';
import { TestExecution } from './MetricsCollector';

/**
 * Calculates APFD (Average Percentage of Faults Detected) and related metrics
 * Implements standard APFD calculation for test case prioritization evaluation
 */
export class APFDCalculator {
    
    /**
     * Calculate APFD (Average Percentage of Faults Detected) score
     * APFD = 1 - (sum of fault detection positions / (total_tests * total_faults)) + 1/(2*total_tests)
     */
    public calculateAPFD(testExecutions: TestExecution[]): APFDResult {
        try {
            if (testExecutions.length === 0) {
                return this.createEmptyAPFDResult();
            }

            const totalTests = testExecutions.length;
            const faultDetectingTests = testExecutions.filter(e => e.wasFaultDetected);
            const totalFaults = faultDetectingTests.length;

            if (totalFaults === 0) {
                // No faults detected - APFD is 1.0 (perfect but no faults to detect)
                return {
                    apfd: 1.0,
                    totalTests,
                    totalFaults: 0,
                    averageFaultPosition: 0,
                    faultDetectionRate: 0,
                    earlyDetectionRate: 0,
                    faultPositions: [],
                    details: {
                        sumOfPositions: 0,
                        earlyFaults: 0,
                        lateFaults: 0,
                        interpretation: 'No faults detected in test execution'
                    }
                };
            }

            // Find positions where faults were detected (1-indexed)
            const faultPositions: number[] = [];
            testExecutions.forEach((execution, index) => {
                if (execution.wasFaultDetected) {
                    faultPositions.push(index + 1); // 1-indexed position
                }
            });

            // Calculate APFD using the standard formula
            const sumOfPositions = faultPositions.reduce((sum, pos) => sum + pos, 0);
            const apfd = 1 - (sumOfPositions / (totalTests * totalFaults)) + (1 / (2 * totalTests));

            // Calculate additional metrics
            const averageFaultPosition = sumOfPositions / totalFaults;
            const faultDetectionRate = totalFaults / totalTests;
            
            // Early detection rate (faults found in first 50% of tests)
            const earlyFaults = faultPositions.filter(pos => pos <= totalTests / 2).length;
            const earlyDetectionRate = totalFaults > 0 ? earlyFaults / totalFaults : 0;

            const result: APFDResult = {
                apfd: Math.max(0, Math.min(1, apfd)), // Clamp between 0 and 1
                totalTests,
                totalFaults,
                averageFaultPosition,
                faultDetectionRate,
                earlyDetectionRate,
                faultPositions,
                details: {
                    sumOfPositions,
                    earlyFaults,
                    lateFaults: totalFaults - earlyFaults,
                    interpretation: this.interpretAPFD(apfd)
                }
            };

            Logger.debug(`APFD calculated: ${apfd.toFixed(3)} (${totalFaults} faults in ${totalTests} tests)`);
            return result;

        } catch (error) {
            Logger.error('Error calculating APFD:', error);
            return this.createEmptyAPFDResult();
        }
    }

    /**
     * Calculate APFD for different prioritization strategies
     */
    public compareAPFDStrategies(
        sikgResults: TestExecution[],
        randomResults?: TestExecution[],
        impactSortedResults?: TestExecution[]
    ): APFDComparison {
        try {
            const sikgAPFD = this.calculateAPFD(sikgResults);
            
            let comparison: APFDComparison = {
                sikg: sikgAPFD,
                improvements: {
                    overRandom: 0,
                    overImpactSorted: 0
                },
                summary: {
                    bestStrategy: 'SIKG',
                    improvementDescription: 'SIKG baseline'
                }
            };

            // Compare with random ordering if provided
            if (randomResults && randomResults.length > 0) {
                const randomAPFD = this.calculateAPFD(randomResults);
                comparison.random = randomAPFD;
                comparison.improvements.overRandom = sikgAPFD.apfd - randomAPFD.apfd;
            }

            // Compare with impact-sorted ordering if provided
            if (impactSortedResults && impactSortedResults.length > 0) {
                const impactAPFD = this.calculateAPFD(impactSortedResults);
                comparison.impactSorted = impactAPFD;
                comparison.improvements.overImpactSorted = sikgAPFD.apfd - impactAPFD.apfd;
            }

            // Determine best strategy
            const strategies = [
                { name: 'SIKG', apfd: sikgAPFD.apfd },
                { name: 'Random', apfd: comparison.random?.apfd || 0 },
                { name: 'Impact Sorted', apfd: comparison.impactSorted?.apfd || 0 }
            ];

            const bestStrategy = strategies.reduce((best, current) => 
                current.apfd > best.apfd ? current : best
            );

            comparison.summary = {
                bestStrategy: bestStrategy.name,
                improvementDescription: this.generateImprovementDescription(comparison)
            };

            return comparison;

        } catch (error) {
            Logger.error('Error comparing APFD strategies:', error);
            return {
                sikg: this.createEmptyAPFDResult(),
                improvements: { overRandom: 0, overImpactSorted: 0 },
                summary: { bestStrategy: 'Unknown', improvementDescription: 'Error in calculation' }
            };
        }
    }

    /**
     * Calculate fault detection effectiveness over time
     */
    public calculateFaultDetectionCurve(testExecutions: TestExecution[]): FaultDetectionCurve {
        try {
            const curve: FaultDetectionPoint[] = [];
            let faultsFound = 0;
            const totalFaults = testExecutions.filter(e => e.wasFaultDetected).length;

            testExecutions.forEach((execution, index) => {
                if (execution.wasFaultDetected) {
                    faultsFound++;
                }

                const percentageOfTests = ((index + 1) / testExecutions.length) * 100;
                const percentageOfFaults = totalFaults > 0 ? (faultsFound / totalFaults) * 100 : 0;

                curve.push({
                    testPosition: index + 1,
                    testsExecutedPercentage: percentageOfTests,
                    faultsDetectedPercentage: percentageOfFaults,
                    cumulativeFaults: faultsFound,
                    executionTime: execution.executionTime
                });
            });

            return {
                points: curve,
                totalFaults,
                areaUnderCurve: this.calculateAreaUnderCurve(curve)
            };

        } catch (error) {
            Logger.error('Error calculating fault detection curve:', error);
            return {
                points: [],
                totalFaults: 0,
                areaUnderCurve: 0
            };
        }
    }

    /**
     * Calculate Python-specific fault detection metrics
     */
    public calculatePythonSpecificMetrics(testExecutions: TestExecution[]): PythonFaultMetrics {
        try {
            const unitTests = testExecutions.filter(e => this.isPythonUnitTest(e.testId));
            const integrationTests = testExecutions.filter(e => this.isPythonIntegrationTest(e.testId));
            
            const unitTestFaults = unitTests.filter(e => e.wasFaultDetected).length;
            const integrationTestFaults = integrationTests.filter(e => e.wasFaultDetected).length;

            return {
                unitTestEffectiveness: unitTests.length > 0 ? unitTestFaults / unitTests.length : 0,
                integrationTestEffectiveness: integrationTests.length > 0 ? integrationTestFaults / integrationTests.length : 0,
                pytestFaults: this.countPytestFaults(testExecutions),
                unittestFaults: this.countUnittestFaults(testExecutions),
                averageExecutionTimeByType: {
                    unit: this.calculateAverageTime(unitTests),
                    integration: this.calculateAverageTime(integrationTests)
                }
            };

        } catch (error) {
            Logger.error('Error calculating Python-specific metrics:', error);
            return {
                unitTestEffectiveness: 0,
                integrationTestEffectiveness: 0,
                pytestFaults: 0,
                unittestFaults: 0,
                averageExecutionTimeByType: { unit: 0, integration: 0 }
            };
        }
    }

    /**
     * Create empty APFD result for error cases
     */
    private createEmptyAPFDResult(): APFDResult {
        return {
            apfd: 0,
            totalTests: 0,
            totalFaults: 0,
            averageFaultPosition: 0,
            faultDetectionRate: 0,
            earlyDetectionRate: 0,
            faultPositions: [],
            details: {
                sumOfPositions: 0,
                earlyFaults: 0,
                lateFaults: 0,
                interpretation: 'No data available'
            }
        };
    }

    /**
     * Interpret APFD score
     */
    private interpretAPFD(apfd: number): string {
        if (apfd >= 0.9) return 'Excellent fault detection (≥90%)';
        if (apfd >= 0.8) return 'Good fault detection (80-89%)';
        if (apfd >= 0.7) return 'Acceptable fault detection (70-79%)';
        if (apfd >= 0.5) return 'Fair fault detection (50-69%)';
        return 'Poor fault detection (<50%)';
    }

    /**
     * Generate improvement description
     */
    private generateImprovementDescription(comparison: APFDComparison): string {
        const improvements: string[] = [];
        
        if (comparison.improvements.overRandom > 0) {
            improvements.push(`${(comparison.improvements.overRandom * 100).toFixed(1)}% better than random`);
        }
        
        if (comparison.improvements.overImpactSorted > 0) {
            improvements.push(`${(comparison.improvements.overImpactSorted * 100).toFixed(1)}% better than impact-sorted`);
        }

        return improvements.length > 0 ? improvements.join(', ') : 'No significant improvement';
    }

    /**
     * Calculate area under curve for fault detection
     */
    private calculateAreaUnderCurve(curve: FaultDetectionPoint[]): number {
        if (curve.length < 2) return 0;

        let area = 0;
        for (let i = 1; i < curve.length; i++) {
            const x1 = curve[i - 1].testsExecutedPercentage;
            const y1 = curve[i - 1].faultsDetectedPercentage;
            const x2 = curve[i].testsExecutedPercentage;
            const y2 = curve[i].faultsDetectedPercentage;
            
            // Trapezoidal rule
            area += (x2 - x1) * (y1 + y2) / 2;
        }

        return area / 100; // Normalize to 0-1 scale
    }

    /**
     * Check if test is a Python unit test
     */
    private isPythonUnitTest(testId: string): boolean {
        return testId.includes('test_') && !testId.includes('integration') && !testId.includes('e2e');
    }

    /**
     * Check if test is a Python integration test
     */
    private isPythonIntegrationTest(testId: string): boolean {
        return testId.includes('integration') || testId.includes('e2e') || testId.includes('api');
    }

    /**
     * Count pytest-specific faults
     */
    private countPytestFaults(executions: TestExecution[]): number {
        return executions.filter(e => 
            e.wasFaultDetected && e.testId.includes('test_')
        ).length;
    }

    /**
     * Count unittest-specific faults
     */
    private countUnittestFaults(executions: TestExecution[]): number {
        return executions.filter(e => 
            e.wasFaultDetected && (e.testId.includes('Test') || e.testId.includes('unittest'))
        ).length;
    }

    /**
     * Calculate average execution time for test group
     */
    private calculateAverageTime(executions: TestExecution[]): number {
        if (executions.length === 0) return 0;
        const totalTime = executions.reduce((sum, e) => sum + e.executionTime, 0);
        return totalTime / executions.length;
    }
}

// Interfaces for APFD calculation results
export interface APFDResult {
    apfd: number;
    totalTests: number;
    totalFaults: number;
    averageFaultPosition: number;
    faultDetectionRate: number;
    earlyDetectionRate: number;
    faultPositions: number[];
    details: {
        sumOfPositions: number;
        earlyFaults: number;
        lateFaults: number;
        interpretation: string;
    };
}

export interface APFDComparison {
    sikg: APFDResult;
    random?: APFDResult;
    impactSorted?: APFDResult;
    improvements: {
        overRandom: number;
        overImpactSorted: number;
    };
    summary: {
        bestStrategy: string;
        improvementDescription: string;
    };
}

export interface FaultDetectionCurve {
    points: FaultDetectionPoint[];
    totalFaults: number;
    areaUnderCurve: number;
}

export interface FaultDetectionPoint {
    testPosition: number;
    testsExecutedPercentage: number;
    faultsDetectedPercentage: number;
    cumulativeFaults: number;
    executionTime: number;
}

export interface PythonFaultMetrics {
    unitTestEffectiveness: number;
    integrationTestEffectiveness: number;
    pytestFaults: number;
    unittestFaults: number;
    averageExecutionTimeByType: {
        unit: number;
        integration: number;
    };
}