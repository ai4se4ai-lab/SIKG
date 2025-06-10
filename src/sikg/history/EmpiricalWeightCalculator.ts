// EmpiricalWeightCalculator.ts - Empirical weight enhancement for Python projects

import { Logger } from '../../utils/Logger';

/**
 * Calculates enhanced weights using empirical evidence from Git history
 * Implements the EW function from Algorithm 2 (Equation 1)
 */
export class EmpiricalWeightCalculator {
    // Weight combination coefficients (γ + δ + ε + ζ = 1)
    private readonly STRUCTURAL_WEIGHT = 0.4;      // γ - Original structural weight
    private readonly EMPIRICAL_STRENGTH = 0.3;     // δ - Direct impact evidence
    private readonly CO_CHANGE_WEIGHT = 0.2;       // ε - Co-change frequency
    private readonly FAULT_CORRELATION_WEIGHT = 0.1; // ζ - Fault correlation

    // Weight bounds for stability
    private readonly MIN_WEIGHT = 0.1;
    private readonly MAX_WEIGHT = 2.0;

    /**
     * Calculate enhanced weight using Equation 1 from Algorithm 2
     * W'(e) = γ·W(e) + δ·empiricalStrength(e) + ε·coChangeFreq(e) + ζ·faultCorr(e)
     */
    public calculateEnhancedWeight(
        originalWeight: number,
        empiricalStrength: number,
        coChangeFrequency: number,
        faultCorrelation: number
    ): number {
        try {
            // Apply the empirical weight formula from Equation 1
            const enhancedWeight = 
                this.STRUCTURAL_WEIGHT * originalWeight +
                this.EMPIRICAL_STRENGTH * empiricalStrength +
                this.CO_CHANGE_WEIGHT * coChangeFrequency +
                this.FAULT_CORRELATION_WEIGHT * faultCorrelation;

            // Clamp the weight to prevent extreme values
            const clampedWeight = this.clampWeight(enhancedWeight);

            Logger.debug(`Weight enhancement: ${originalWeight.toFixed(3)} -> ${clampedWeight.toFixed(3)} ` +
                        `(emp: ${empiricalStrength.toFixed(3)}, co: ${coChangeFrequency.toFixed(3)}, ` +
                        `fault: ${faultCorrelation.toFixed(3)})`);

            return clampedWeight;

        } catch (error) {
            Logger.error('Error calculating enhanced weight:', error);
            return this.clampWeight(originalWeight); // Fallback to original weight
        }
    }

    /**
     * Calculate enhanced weights for Python-specific relationship types
     */
    public calculatePythonSpecificWeight(
        originalWeight: number,
        relationshipType: string,
        empiricalStrength: number,
        coChangeFrequency: number,
        faultCorrelation: number
    ): number {
        // Apply relationship-type specific adjustments for Python
        const typeMultiplier = this.getPythonRelationshipMultiplier(relationshipType);
        
        const baseEnhanced = this.calculateEnhancedWeight(
            originalWeight,
            empiricalStrength,
            coChangeFrequency,
            faultCorrelation
        );

        return this.clampWeight(baseEnhanced * typeMultiplier);
    }

    /**
     * Get relationship multipliers specific to Python language patterns
     */
    private getPythonRelationshipMultiplier(relationshipType: string): number {
        switch (relationshipType) {
            case 'IMPORTS':
                return 1.1; // Python imports are crucial for dependency tracking
            case 'CALLS':
                return 1.0; // Standard function calls
            case 'TESTS':
                return 1.2; // Test relationships are critical in Python
            case 'IS_TESTED_BY':
                return 1.2; // Reverse test relationships
            case 'INHERITS_FROM':
                return 0.9; // Python inheritance is less common than composition
            case 'USES':
                return 0.8; // Variable usage is less predictive
            case 'BELONGS_TO':
                return 1.0; // Module/class membership
            default:
                return 1.0; // Default multiplier
        }
    }

    /**
     * Calculate weight adjustment based on historical accuracy
     */
    public calculateAccuracyBasedAdjustment(
        currentWeight: number,
        predictionAccuracy: number,
        learningRate: number = 0.1
    ): number {
        try {
            // Adjust weight based on prediction accuracy
            // High accuracy (> 0.8) slightly increases weight
            // Low accuracy (< 0.4) decreases weight
            let adjustment = 0;

            if (predictionAccuracy > 0.8) {
                adjustment = learningRate * 0.1; // Small positive adjustment
            } else if (predictionAccuracy < 0.4) {
                adjustment = -learningRate * 0.2; // Larger negative adjustment
            }

            const adjustedWeight = currentWeight + adjustment;
            return this.clampWeight(adjustedWeight);

        } catch (error) {
            Logger.error('Error calculating accuracy-based adjustment:', error);
            return currentWeight;
        }
    }

    /**
     * Calculate temporal decay for weights based on age of evidence
     */
    public applyTemporalDecay(
        weight: number,
        evidenceAgeInDays: number,
        decayRate: number = 0.01
    ): number {
        try {
            // Apply exponential decay: weight * e^(-decayRate * age)
            const decayFactor = Math.exp(-decayRate * evidenceAgeInDays);
            const decayedWeight = weight * decayFactor;
            
            // Ensure minimum weight is maintained
            return Math.max(this.MIN_WEIGHT, decayedWeight);

        } catch (error) {
            Logger.error('Error applying temporal decay:', error);
            return weight;
        }
    }

    /**
     * Clamp weight to valid bounds [MIN_WEIGHT, MAX_WEIGHT]
     */
    private clampWeight(weight: number): number {
        return Math.max(this.MIN_WEIGHT, Math.min(this.MAX_WEIGHT, weight));
    }

    /**
     * Validate weight coefficients sum to 1.0
     */
    public validateCoefficients(): boolean {
        const sum = this.STRUCTURAL_WEIGHT + this.EMPIRICAL_STRENGTH + 
                   this.CO_CHANGE_WEIGHT + this.FAULT_CORRELATION_WEIGHT;
        
        const isValid = Math.abs(sum - 1.0) < 0.001; // Allow small floating point errors
        
        if (!isValid) {
            Logger.warn(`Weight coefficients sum to ${sum}, should be 1.0`);
        }
        
        return isValid;
    }

    /**
     * Get weight calculation statistics
     */
    public getWeightStats(weights: number[]): {
        count: number;
        average: number;
        min: number;
        max: number;
        standardDeviation: number;
        distribution: { range: string; count: number }[];
    } {
        if (weights.length === 0) {
            return {
                count: 0,
                average: 0,
                min: 0,
                max: 0,
                standardDeviation: 0,
                distribution: []
            };
        }

        const count = weights.length;
        const average = weights.reduce((sum, w) => sum + w, 0) / count;
        const min = Math.min(...weights);
        const max = Math.max(...weights);
        
        // Calculate standard deviation
        const variance = weights.reduce((sum, w) => sum + Math.pow(w - average, 2), 0) / count;
        const standardDeviation = Math.sqrt(variance);

        // Calculate distribution
        const ranges = [
            { range: '0.1-0.3', min: 0.1, max: 0.3 },
            { range: '0.3-0.5', min: 0.3, max: 0.5 },
            { range: '0.5-0.8', min: 0.5, max: 0.8 },
            { range: '0.8-1.2', min: 0.8, max: 1.2 },
            { range: '1.2-2.0', min: 1.2, max: 2.0 }
        ];

        const distribution = ranges.map(range => ({
            range: range.range,
            count: weights.filter(w => w >= range.min && w < range.max).length
        }));

        return {
            count,
            average,
            min,
            max,
            standardDeviation,
            distribution
        };
    }

    /**
     * Apply regularization to prevent overfitting
     */
    public applyRegularization(weights: Map<string, number>, lambda: number = 0.01): Map<string, number> {
        const regularizedWeights = new Map<string, number>();
        
        for (const [edgeId, weight] of weights.entries()) {
            // L2 regularization: pull weights toward 1.0 (neutral)
            const regularizedWeight = weight - lambda * (weight - 1.0);
            regularizedWeights.set(edgeId, this.clampWeight(regularizedWeight));
        }
        
        return regularizedWeights;
    }

    /**
     * Calculate confidence score for a weight based on evidence quality
     */
    public calculateWeightConfidence(
        empiricalStrength: number,
        coChangeFrequency: number,
        faultCorrelation: number,
        sampleSize: number
    ): number {
        try {
            // Base confidence on evidence strength and sample size
            const evidenceStrength = (empiricalStrength + coChangeFrequency + faultCorrelation) / 3;
            const sampleConfidence = Math.min(1.0, sampleSize / 50); // Max confidence at 50+ samples
            
            return evidenceStrength * sampleConfidence;

        } catch (error) {
            Logger.error('Error calculating weight confidence:', error);
            return 0;
        }
    }

    /**
     * Clean up resources
     */
    public dispose(): void {
        // No resources to clean up for this calculator
        Logger.debug('Empirical weight calculator disposed');
    }
}