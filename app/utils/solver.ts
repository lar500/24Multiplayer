// utils/solver.ts

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
   * Recursively combine expressions using all operators
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
        const remaining = expressions.filter((_, idx) => idx !== i && idx !== j);

        for (const op of operators) {
          let newExpr: Expression;
          try {
            newExpr = this.applyOperator(expressions[i], expressions[j], op);
          } catch {
            // skip invalid operations (e.g. division by zero)
            continue;
          }
          results.push(...this.combineExpressions([...remaining, newExpr]));
        }
      }
    }

    return results;
  }

  /**
   * Generate all permutations of an array
   */
  private static permutations<T>(arr: T[]): T[][] {
    if (arr.length <= 1) {
      return [arr];
    }
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i++) {
      const current = arr[i];
      const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
      for (const perm of this.permutations(rest)) {
        result.push([current, ...perm]);
      }
    }
    return result;
  }

  /**
   * Solve the 24 game for the given numbers,
   * returning all distinct string representations that evaluate to 24
   */
  public static solve(numbers: number[]): string[] {
    if (numbers.length !== 4) {
      throw new Error('The 24 game requires exactly 4 numbers');
    }

    const exprs = numbers.map(n => ({ value: n, representation: n.toString() }));
    const perms = this.permutations(exprs);
    const solutions = new Set<string>();

    for (const perm of perms) {
      for (const e of this.combineExpressions(perm)) {
        if (Math.abs(e.value - 24) < 1e-10) {
          solutions.add(e.representation);
        }
      }
    }

    return Array.from(solutions);
  }

  /**
   * Check if the given set of numbers has at least one solution to reach 24
   */
  public static hasSolution(numbers: number[]): boolean {
    return this.solve(numbers).length > 0;
  }

  /**
   * Generate a solvable 24 game hand of 4 numbers between min and max
   */
  public static generatePuzzle(min = 1, max = 13): number[] {
    let nums: number[] = [];
    let attempts = 0;
    const maxAttempts = 100;

    while (attempts < maxAttempts) {
      nums = Array.from({ length: 4 }, () =>
        Math.floor(Math.random() * (max - min + 1)) + min
      );
      if (this.hasSolution(nums)) {
        return nums;
      }
      attempts++;
    }

    // Fallback if no solvable puzzle found
    return [3, 3, 8, 8];
  }
}
