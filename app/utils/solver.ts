type Operator = '+' | '-' | '*' | '/';

type Expression = {
  value: number;
  representation: string;
};

/**
 * Solver utility for the 24 game
 * Finds all possible ways to make 24 using the given numbers and basic operations
 */
export class Solver {
  /**
   * Apply the given operator to two expressions and return the result
   */
  private static applyOperator(a: Expression, b: Expression, op: Operator): Expression {
    switch (op) {
      case '+':
        return {
          value: a.value + b.value,
          representation: `(${a.representation} + ${b.representation})`
        };
      case '-':
        return {
          value: a.value - b.value,
          representation: `(${a.representation} - ${b.representation})`
        };
      case '*':
        return {
          value: a.value * b.value,
          representation: `(${a.representation} * ${b.representation})`
        };
      case '/':
        if (b.value === 0) {
          throw new Error('Division by zero');
        }
        return {
          value: a.value / b.value,
          representation: `(${a.representation} / ${b.representation})`
        };
      default:
        throw new Error('Invalid operator');
    }
  }

  /**
   * Find all possible ways to combine expressions using the given operators
   */
  private static combineExpressions(expressions: Expression[]): Expression[] {
    if (expressions.length === 1) {
      return expressions;
    }

    const results: Expression[] = [];
    const operators: Operator[] = ['+', '-', '*', '/'];

    for (let i = 0; i < expressions.length; i++) {
      for (let j = 0; j < expressions.length; j++) {
        if (i === j) continue;

        // Create a new array without the selected expressions
        const remainingExpressions = expressions.filter((_, idx) => idx !== i && idx !== j);

        for (const op of operators) {
          try {
            const newExpression = this.applyOperator(expressions[i], expressions[j], op);
            const newExpressions = [...remainingExpressions, newExpression];
            results.push(...this.combineExpressions(newExpressions));
          } catch (e) {
            // Skip invalid operations (like division by zero)
            continue;
          }
        }
      }
    }

    return results;
  }

  /**
   * Generate all permutations of the given array
   */
  private static permutations<T>(arr: T[]): T[][] {
    if (arr.length <= 1) {
      return [arr];
    }

    const result: T[][] = [];
    for (let i = 0; i < arr.length; i++) {
      const current = arr[i];
      const remaining = [...arr.slice(0, i), ...arr.slice(i + 1)];
      const perms = this.permutations(remaining);
      
      for (const perm of perms) {
        result.push([current, ...perm]);
      }
    }

    return result;
  }

  /**
   * Solve the 24 game for the given numbers
   * Returns all possible solutions that evaluate to 24
   */
  public static solve(numbers: number[]): string[] {
    if (numbers.length !== 4) {
      throw new Error('The 24 game requires exactly 4 numbers');
    }

    // Convert numbers to expressions
    const initialExpressions: Expression[] = numbers.map(n => ({
      value: n,
      representation: n.toString()
    }));

    // Try all permutations
    const permutations = this.permutations(initialExpressions);
    
    // Find all possible solutions
    const solutions = new Set<string>();
    
    for (const perm of permutations) {
      const results = this.combineExpressions(perm);
      
      for (const result of results) {
        // Check if the result is close to 24 (accounting for floating point errors)
        if (Math.abs(result.value - 24) < 1e-10) {
          // Simplify the representation and add to solutions
          solutions.add(result.representation);
        }
      }
    }

    return Array.from(solutions);
  }

  /**
   * Check if the given numbers have at least one solution that makes 24
   */
  public static hasSolution(numbers: number[]): boolean {
    return this.solve(numbers).length > 0;
  }

  /**
   * Generate a valid 24 game puzzle
   * Returns an array of 4 numbers that has at least one solution
   */
  public static generatePuzzle(min = 1, max = 13): number[] {
    let numbers: number[] = [];
    let attempts = 0;
    const maxAttempts = 100;

    while (attempts < maxAttempts) {
      // Generate 4 random numbers
      numbers = Array.from({ length: 4 }, () => 
        Math.floor(Math.random() * (max - min + 1)) + min
      );

      // Check if there's at least one solution
      if (this.hasSolution(numbers)) {
        return numbers;
      }

      attempts++;
    }

    // If we couldn't find a puzzle with a solution after max attempts,
    // return a known solvable puzzle
    return [3, 3, 8, 8]; // Example of a puzzle with a solution
  }
} 