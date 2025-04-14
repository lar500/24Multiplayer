"use client";

import { useState, useEffect } from "react";
import { Solver } from "../utils/solver";

type GameBoardProps = {
  initialNumbers?: number[];
  onSolve?: (solution: string) => void;
  onNewGame?: () => void;
  showSolution?: boolean;
};

type Tile = {
  id: string;
  value: number;
  display: string;
  position?: number;
};

type HistoryStep = {
  tiles: Tile[];
  selectedTileId: string | null;
  selectedOperator: string | null;
};

export default function GameBoard({
  initialNumbers,
  onSolve,
  onNewGame,
  showSolution = false,
}: GameBoardProps) {
  const [numbers, setNumbers] = useState<number[]>(
    initialNumbers || Solver.generatePuzzle()
  );
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [selectedOperator, setSelectedOperator] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean>(false);
  const [solutions, setSolutions] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryStep[]>([]);

  // Initialize or reset tiles when numbers change
  useEffect(() => {
    const newNumbers = initialNumbers || Solver.generatePuzzle();
    setNumbers(newNumbers);
    resetGame(newNumbers);
  }, [initialNumbers]);

  // Calculate solutions
  useEffect(() => {
    if (showSolution) {
      try {
        const solns = Solver.solve(numbers);
        setSolutions(solns.slice(0, 3)); // Show up to 3 solutions
      } catch (err) {
        setSolutions([]);
      }
    } else {
      setSolutions([]);
    }
  }, [numbers, showSolution]);

  const resetGame = (newNumbers?: number[]) => {
    const numbersToUse = newNumbers || numbers;
    // Create initial tiles from numbers
    const newTiles = numbersToUse.map((num, index) => ({
      id: `tile-${index}`,
      value: num,
      display: num.toString(),
      position: index,
    }));

    setTiles(newTiles);
    setSelectedTileId(null);
    setSelectedOperator(null);
    setError(null);
    setIsCorrect(false);
    setHistory([]);
  };

  const generateNewPuzzle = () => {
    const newNumbers = Solver.generatePuzzle();
    setNumbers(newNumbers);
    resetGame(newNumbers);
    if (onNewGame) {
      onNewGame();
    }
  };

  // Save current state to history before making changes
  const saveHistory = () => {
    const currentStep: HistoryStep = {
      tiles: [...tiles],
      selectedTileId,
      selectedOperator,
    };
    setHistory((prev) => [...prev, currentStep]);
  };

  // Undo the last operation
  const undoLastOperation = () => {
    if (history.length === 0) return;

    const lastStep = history[history.length - 1];
    setTiles(lastStep.tiles);
    setSelectedTileId(lastStep.selectedTileId);
    setSelectedOperator(lastStep.selectedOperator);
    setError(null);

    // Remove the last step from history
    setHistory((prev) => prev.slice(0, -1));
  };

  const selectTile = (tileId: string) => {
    if (isCorrect) return;

    // If no tile is selected, select this one
    if (selectedTileId === null) {
      setSelectedTileId(tileId);
      setError(null);
      return;
    }

    // If this tile is already selected, deselect it
    if (selectedTileId === tileId) {
      setSelectedTileId(null);
      setSelectedOperator(null);
      return;
    }

    // If no operator is selected, switch selection to the new tile
    if (selectedOperator === null) {
      setSelectedTileId(tileId);
      setError(null);
      return;
    }

    // Combine the two tiles
    const firstTile = tiles.find((t) => t.id === selectedTileId);
    const secondTile = tiles.find((t) => t.id === tileId);

    if (!firstTile || !secondTile) return;

    // Save current state before combining
    saveHistory();

    // Calculate the new value
    let newValue: number;
    let displayText: string;

    try {
      switch (selectedOperator) {
        case "+":
          newValue = firstTile.value + secondTile.value;
          displayText = `${newValue}`;
          break;
        case "-":
          newValue = firstTile.value - secondTile.value;
          displayText = `${newValue}`;
          break;
        case "*":
          newValue = firstTile.value * secondTile.value;
          displayText = `${newValue}`;
          break;
        case "/":
          if (secondTile.value === 0) throw new Error("Division by zero");
          newValue = firstTile.value / secondTile.value;
          // Display as fraction if it's not a whole number
          if (Number.isInteger(newValue)) {
            displayText = `${newValue}`;
          } else {
            // Find the greatest common divisor to simplify the fraction
            const gcd = findGCD(firstTile.value, secondTile.value);
            const numerator = firstTile.value / gcd;
            const denominator = secondTile.value / gcd;
            displayText = `${numerator}/${denominator}`;
          }
          break;
        default:
          throw new Error("Invalid operator");
      }

      // Create a new tile with the combined value
      const newTile: Tile = {
        id: `tile-${Date.now()}`, // Generate a unique ID
        value: newValue,
        display: displayText,
        // Keep the position of the second tile (target) instead of the first
        position: secondTile.position,
      };

      // Remove the two selected tiles and add the new one
      const updatedTiles = tiles.filter(
        (t) => t.id !== firstTile.id && t.id !== secondTile.id
      );
      updatedTiles.push(newTile);

      setTiles(updatedTiles);
      // Keep the new tile selected
      setSelectedTileId(newTile.id);
      setSelectedOperator(null);
      setError(null);

      // Check if we've reached the solution
      if (
        updatedTiles.length === 1 &&
        Math.abs(updatedTiles[0].value - 24) < 1e-10
      ) {
        setIsCorrect(true);
        if (onSolve) {
          onSolve(updatedTiles[0].display);
        }
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Invalid operation");
      }
      setSelectedTileId(null);
      setSelectedOperator(null);
    }
  };

  const selectOperator = (operator: string) => {
    if (isCorrect) return;

    if (selectedTileId === null) {
      setError("Please select a number first");
      return;
    }

    setSelectedOperator(operator);
    setError(null);
  };

  // Get tile color based on selection status
  const getTileColor = (tileId: string) => {
    if (selectedTileId === tileId) {
      return "bg-gradient-to-r from-amber-400 to-yellow-500 shadow-md scale-105 transform-gpu";
    }
    return "bg-gradient-to-r from-blue-500 to-indigo-600 shadow-md";
  };

  // Get tile hover color
  const getTileHoverColor = (tileId: string) => {
    if (selectedTileId === tileId) {
      return "from-amber-500 to-yellow-600";
    }
    return "from-blue-600 to-indigo-700";
  };

  // Get operator color based on selection status
  const getOperatorColor = (operator: string) => {
    if (selectedOperator === operator) {
      return "bg-gradient-to-r from-green-500 to-emerald-600 shadow-md scale-105 transform-gpu";
    }
    return "bg-gradient-to-r from-gray-600 to-gray-700 shadow-md";
  };

  // Get operator hover color
  const getOperatorHoverColor = (operator: string) => {
    if (selectedOperator === operator) {
      return "from-green-600 to-emerald-700";
    }
    return "from-gray-700 to-gray-800";
  };

  // Sort tiles by their position to maintain visual stability
  const sortedTiles = [...tiles].sort((a, b) => {
    return (a.position || 0) - (b.position || 0);
  });

  // Create a grid with fixed positions
  const gridPositions = [0, 1, 2, 3];
  const tileGrid = gridPositions.map((position) => {
    const tile = tiles.find((t) => t.position === position);
    return tile || null;
  });

  // Helper function to find the greatest common divisor
  const findGCD = (a: number, b: number): number => {
    return b === 0 ? a : findGCD(b, a % b);
  };

  return (
    <div className="flex flex-col items-center w-full max-w-md mx-auto">
      <div className="mb-4 text-center">
        <h2 className="text-2xl font-bold mb-2 text-indigo-800">Make 24</h2>
        <p className="text-indigo-600">
          Combine the numbers using operations to make 24
        </p>
      </div>

      {/* Current tiles */}
      <div className="grid grid-cols-2 gap-4 w-full mb-6 min-h-[130px]">
        {tileGrid.map((tile, index) => (
          <div key={index} className="min-h-16">
            {tile ? (
              <button
                onClick={() => selectTile(tile.id)}
                className={`${getTileColor(
                  tile.id
                )} text-white font-medium py-4 px-2 rounded-lg text-xl w-full h-full min-h-16 flex items-center justify-center border border-white/20 backdrop-blur-sm transition-none group`}
                disabled={isCorrect}
              >
                <span className="break-all text-center group-hover:bg-gradient-to-r group-hover:bg-clip-text group-hover:text-transparent group-hover:from-white group-hover:to-white">
                  {tile.display}
                </span>
                <div
                  className={`absolute inset-0 rounded-lg bg-gradient-to-r opacity-0 group-hover:opacity-100 transition-opacity ${getTileHoverColor(
                    tile.id
                  )}`}
                ></div>
              </button>
            ) : null}
          </div>
        ))}

        {/* Empty placeholders */}
        {tiles.length === 0 && (
          <div className="col-span-2 p-4 bg-gradient-to-r from-green-50 to-emerald-50 text-green-800 rounded-lg text-center border border-green-200 shadow-sm">
            <p className="font-medium">You've used all tiles!</p>
            <p>Solution: {isCorrect ? "Correct! ✨" : "Not 24 yet 🤔"}</p>
          </div>
        )}
      </div>

      {/* Operators */}
      <div className="grid grid-cols-4 gap-4 w-full mb-6">
        {["+", "-", "*", "/"].map((op) => (
          <button
            key={op}
            onClick={() => selectOperator(op)}
            className={`${getOperatorColor(
              op
            )} text-white font-medium py-4 rounded-lg text-xl border border-white/20 transition-none relative group`}
            disabled={isCorrect}
          >
            <span className="relative z-10">{op}</span>
            <div
              className={`absolute inset-0 rounded-lg bg-gradient-to-r opacity-0 group-hover:opacity-100 transition-opacity ${getOperatorHoverColor(
                op
              )}`}
            ></div>
          </button>
        ))}
      </div>

      {/* Tutorial */}
      <div className="w-full p-4 mb-5 bg-gradient-to-r from-indigo-50 to-blue-50 rounded-lg border border-indigo-100 shadow-sm">
        <p className="text-sm text-indigo-800">
          <span className="inline-block w-5 h-5 bg-indigo-100 rounded-full text-center text-indigo-800 mr-1 border border-indigo-200">
            1
          </span>
          Select a number tile
          <br />
          <span className="inline-block w-5 h-5 bg-indigo-100 rounded-full text-center text-indigo-800 mr-1 border border-indigo-200">
            2
          </span>
          Select an operation (+, -, *, /)
          <br />
          <span className="inline-block w-5 h-5 bg-indigo-100 rounded-full text-center text-indigo-800 mr-1 border border-indigo-200">
            3
          </span>
          Select another number tile to combine
          <br />
          <span className="inline-block w-5 h-5 bg-indigo-100 rounded-full text-center text-indigo-800 mr-1 border border-indigo-200">
            4
          </span>
          Continue until you reach 24
        </p>
      </div>

      {/* Controls */}
      <div className="flex gap-4 w-full">
        <button
          onClick={() => resetGame()}
          className="flex-1 bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-500 hover:to-yellow-600 text-white font-medium py-3 px-4 rounded-lg shadow transition-colors flex items-center justify-center"
          disabled={isCorrect && !showSolution}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 mr-1"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
              clipRule="evenodd"
            />
          </svg>
          Reset
        </button>
        <button
          onClick={undoLastOperation}
          className="flex-1 bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 text-white font-medium py-3 px-4 rounded-lg shadow transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={history.length === 0 || isCorrect}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 mr-1"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
              clipRule="evenodd"
            />
          </svg>
          Undo
        </button>
        <button
          onClick={generateNewPuzzle}
          className="flex-1 bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 text-white font-medium py-3 px-4 rounded-lg shadow transition-colors flex items-center justify-center"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 mr-1"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
              clipRule="evenodd"
            />
          </svg>
          New
        </button>
      </div>

      {/* Error or success message */}
      {error && (
        <div className="mt-4 p-3 bg-red-100 text-red-800 rounded-lg w-full text-center border border-red-200">
          {error}
        </div>
      )}

      {isCorrect && (
        <div className="mt-4 p-3 bg-gradient-to-r from-green-50 to-emerald-50 text-green-800 rounded-lg w-full text-center border border-green-200 shadow-sm">
          <div className="flex items-center justify-center">
            <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center border border-green-300 mr-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 text-green-700"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <span className="font-medium">Correct! You made 24!</span>
          </div>
        </div>
      )}

      {/* Solutions (only shown in solver mode) */}
      {showSolution && solutions.length > 0 && (
        <div className="mt-6 w-full bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg border border-indigo-100 shadow-sm">
          <h3 className="text-lg font-bold mb-2 text-indigo-800">
            Possible solutions:
          </h3>
          <ul className="space-y-2">
            {solutions.map((solution, index) => (
              <li
                key={index}
                className="font-mono text-sm bg-blue-900 px-3 py-2 rounded-md border border-indigo-100"
              >
                {solution}
              </li>
            ))}
            {solutions.length === 3 && (
              <li className="text-sm italic text-indigo-600">...and more</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
