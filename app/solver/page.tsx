"use client";

import { useState } from "react";
import GameBoard from "../components/GameBoard";
import { Solver } from "../utils/solver";

export default function SolverPage() {
  const [inputValues, setInputValues] = useState<string[]>(Array(4).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [solution, setSolution] = useState<string | null>(null);

  const handleInputChange = (index: number, value: string) => {
    const newValues = [...inputValues];
    newValues[index] = value;
    setInputValues(newValues);
    setError(null);
    setSolution(null);
  };

  const handleSolve = () => {
    // Convert input values to numbers and filter out empty inputs
    const numbers = inputValues
      .map((val) => parseInt(val))
      .filter((num) => !isNaN(num));

    // Validate input
    if (numbers.length !== 4) {
      setError("Please enter exactly 4 numbers");
      return;
    }

    // Try to solve the puzzle
    try {
      const solutions = Solver.solve(numbers);
      if (solutions.length > 0) {
        setSolution(solutions[0]);
        setError(null);
      } else {
        setError("No solution found");
        setSolution(null);
      }
    } catch (err) {
      setError("Invalid input: The 24 game requires exactly 4 numbers");
      setSolution(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-center">24 Game Solver</h1>

        <div className="bg-gray-800 rounded-lg p-6 mb-8">
          <h2 className="text-2xl font-semibold mb-4">Enter 4 Numbers</h2>
          <div className="grid grid-cols-4 gap-4 mb-6">
            {inputValues.map((value, index) => (
              <input
                key={index}
                type="number"
                value={value}
                onChange={(e) => handleInputChange(index, e.target.value)}
                className="w-full p-2 bg-gray-700 rounded text-white text-center"
                placeholder={`#${index + 1}`}
              />
            ))}
          </div>
          <button
            onClick={handleSolve}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          >
            Find Solution
          </button>
        </div>

        {error && (
          <div className="bg-red-900/50 border border-red-500 rounded-lg p-4 mb-8">
            <p className="text-red-200">{error}</p>
          </div>
        )}

        {solution && (
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-2xl font-semibold mb-4">Solution</h2>
            <GameBoard
              initialNumbers={inputValues
                .map((val) => parseInt(val))
                .filter((num) => !isNaN(num))}
              onSolve={handleSolve}
              showSolution={true}
            />
          </div>
        )}
      </div>
    </div>
  );
}
