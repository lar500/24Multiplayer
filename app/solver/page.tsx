"use client";

import { useState } from "react";
import Link from "next/link";
import GameBoard from "../components/GameBoard";
import { Solver } from "../utils/solver";

export default function SolverPage() {
  const [customNumbers, setCustomNumbers] = useState<number[]>([]);
  const [inputValues, setInputValues] = useState(["", "", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const [isCustomPuzzle, setIsCustomPuzzle] = useState(false);

  const handleInputChange = (index: number, value: string) => {
    const newInputValues = [...inputValues];
    newInputValues[index] = value;
    setInputValues(newInputValues);
  };

  const validateAndSolve = () => {
    // Check that all inputs are valid numbers
    const numbers = inputValues.map((v) => {
      const num = parseInt(v, 10);
      return isNaN(num) ? null : num;
    });

    if (numbers.some((n) => n === null)) {
      setError("All fields must contain valid numbers");
      return;
    }

    // Make sure all numbers are between 1 and 100
    if (numbers.some((n) => n! < 1 || n! > 100)) {
      setError("All numbers must be between 1 and 100");
      return;
    }

    // Check if there's at least one solution
    try {
      const nonNullNumbers = numbers.filter((n) => n !== null) as number[];
      const solutions = Solver.solve(nonNullNumbers);

      if (solutions.length === 0) {
        setError(
          "No solutions exist for these numbers. Try different numbers."
        );
        return;
      }

      // Everything checks out, set the custom numbers
      setCustomNumbers(nonNullNumbers);
      setIsCustomPuzzle(true);
      setError(null);
    } catch (error) {
      setError("Error finding solutions. Please try different numbers.");
    }
  };

  const resetCustomPuzzle = () => {
    setInputValues(["", "", "", ""]);
    setCustomNumbers([]);
    setIsCustomPuzzle(false);
    setError(null);
  };

  return (
    <div className="flex flex-col items-center min-h-screen p-8">
      <Link
        href="/"
        className="self-start mb-8 text-blue-600 hover:text-blue-800"
      >
        ← Back to home
      </Link>

      <h1 className="text-4xl font-bold mb-2">24 Game Solver</h1>
      <p className="text-xl mb-8">
        Enter four numbers to find solutions, or try a random puzzle
      </p>

      {!isCustomPuzzle ? (
        <div className="w-full max-w-md mb-8 bg-blue-900 rounded-xl shadow-md p-6">
          <h2 className="text-2xl font-bold mb-4">Enter four numbers</h2>

          <div className="grid grid-cols-4 gap-4 mb-6">
            {inputValues.map((value, index) => (
              <input
                key={index}
                type="number"
                value={value}
                onChange={(e) => handleInputChange(index, e.target.value)}
                min="1"
                max="100"
                placeholder={(index + 1).toString()}
                className="p-4 border border-gray-300 rounded-lg text-center text-xl"
              />
            ))}
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 text-red-800 rounded-lg w-full text-center">
              {error}
            </div>
          )}

          <div className="flex gap-4">
            <button
              onClick={validateAndSolve}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg"
            >
              Find Solutions
            </button>
            <button
              onClick={() => setIsCustomPuzzle(true)}
              className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-lg"
            >
              Random Puzzle
            </button>
          </div>
        </div>
      ) : (
        <>
          <GameBoard
            initialNumbers={
              customNumbers.length > 0 ? customNumbers : undefined
            }
            showSolution={true}
            onNewGame={resetCustomPuzzle}
          />

          <button
            onClick={resetCustomPuzzle}
            className="mt-8 bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-6 rounded-lg"
          >
            Enter Different Numbers
          </button>
        </>
      )}
    </div>
  );
}
