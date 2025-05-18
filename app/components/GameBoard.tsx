// components/GameBoard.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
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

  // Initialize once (or when initialNumbers changes)
  useEffect(() => {
    const hand = initialNumbers || Solver.generatePuzzle();
    setNumbers(hand);

    const initTiles: Tile[] = hand.map((n, i) => ({
      id: `tile-${i}`,
      value: n,
      display: n.toString(),
      position: i,
    }));
    setTiles(initTiles);

    setSelectedTileId(null);
    setSelectedOperator(null);
    setError(null);
    setIsCorrect(false);
    setHistory([]);
  }, [initialNumbers]);

  // Compute solver hints (only in solver mode)
  useEffect(() => {
    if (showSolution) {
      try {
        const sols = Solver.solve(numbers);
        setSolutions(sols.slice(0, 3));
      } catch {
        setSolutions([]);
      }
    } else {
      setSolutions([]);
    }
  }, [numbers, showSolution]);

  // Generate a brand-new puzzle
  const generateNewPuzzle = useCallback(() => {
    const hand = Solver.generatePuzzle();
    setNumbers(hand);

    const initTiles: Tile[] = hand.map((n, i) => ({
      id: `tile-${i}`,
      value: n,
      display: n.toString(),
      position: i,
    }));
    setTiles(initTiles);

    setSelectedTileId(null);
    setSelectedOperator(null);
    setError(null);
    setIsCorrect(false);
    setHistory([]);

    onNewGame?.();
  }, [onNewGame]);

  // Save current board state for undo
  const saveHistory = () => {
    setHistory((h) => [
      ...h,
      { tiles: [...tiles], selectedTileId, selectedOperator },
    ]);
  };

  // Undo last operation
  const undoLastOperation = () => {
    if (history.length === 0) return;
    const last = history[history.length - 1];
    setTiles(last.tiles);
    setSelectedTileId(last.selectedTileId);
    setSelectedOperator(last.selectedOperator);
    setError(null);
    setHistory((h) => h.slice(0, h.length - 1));
  };

  // Handle tile clicks + combining
  const selectTile = (tileId: string) => {
    if (isCorrect) return;

    if (selectedTileId === null) {
      setSelectedTileId(tileId);
      setError(null);
      return;
    }
    if (selectedTileId === tileId) {
      setSelectedTileId(null);
      setSelectedOperator(null);
      return;
    }
    if (selectedOperator === null) {
      setSelectedTileId(tileId);
      setError(null);
      return;
    }

    const first = tiles.find((t) => t.id === selectedTileId);
    const second = tiles.find((t) => t.id === tileId);
    if (!first || !second) return;

    saveHistory();

    let newVal: number;
    let disp: string;
    try {
      switch (selectedOperator) {
        case "+":
          newVal = first.value + second.value;
          disp = `${newVal}`;
          break;
        case "-":
          newVal = first.value - second.value;
          disp = `${newVal}`;
          break;
        case "*":
          newVal = first.value * second.value;
          disp = `${newVal}`;
          break;
        case "/":
          if (second.value === 0) throw new Error("Division by zero");
          newVal = first.value / second.value;
          if (Number.isInteger(newVal)) {
            disp = `${newVal}`;
          } else {
            const gcd = findGCD(first.value, second.value);
            disp = `${first.value / gcd}/${second.value / gcd}`;
          }
          break;
        default:
          throw new Error("Invalid operator");
      }

      const newTile: Tile = {
        id: `tile-${Date.now()}`,
        value: newVal,
        display: disp,
        position: second.position,
      };

      const updated = tiles
        .filter((t) => t.id !== first.id && t.id !== second.id)
        .concat(newTile);

      setTiles(updated);
      setSelectedTileId(newTile.id);
      setSelectedOperator(null);
      setError(null);

      if (updated.length === 1 && Math.abs(updated[0].value - 24) < 1e-10) {
        setIsCorrect(true);
        onSolve?.(updated[0].display);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid operation");
      setSelectedTileId(null);
      setSelectedOperator(null);
    }
  };

  const selectOperator = (op: string) => {
    if (isCorrect) return;
    if (!selectedTileId) {
      setError("Please select a number first");
      return;
    }
    setSelectedOperator(op);
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
  // const getTileHoverColor = (tileId: string) => {
  //   if (selectedTileId === tileId) {
  //     return "from-amber-500 to-yellow-600";
  //   }
  //   return "from-blue-600 to-indigo-700";
  // };

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
                )} text-white font-medium py-4 px-2 rounded-lg text-xl w-full h-full min-h-16 flex items-center justify-center border border-white/20 backdrop-blur-sm transition-all hover:brightness-110`}
                disabled={isCorrect}
              >
                <span>{tile.display}</span>
              </button>
            ) : null}
          </div>
        ))}

        {/* Empty placeholders */}
        {tiles.length === 0 && (
          <div className="col-span-2 p-4 bg-gradient-to-r from-green-50 to-emerald-50 text-green-800 rounded-lg text-center border border-green-200 shadow-sm">
            <p className="font-medium">You&apos;ve used all tiles!</p>
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
        {/* Reset: resets to the current hand (no new numbers) */}
        <button
          onClick={() => {
            const initTiles: Tile[] = numbers.map((n, i) => ({
              id: `tile-${i}`,
              value: n,
              display: n.toString(),
              position: i,
            }));
            setTiles(initTiles);
            setSelectedTileId(null);
            setSelectedOperator(null);
            setError(null);
            setIsCorrect(false);
            setHistory([]);
          }}
          className="flex-1 bg-gradient-to-r from-amber-400 to-yellow-500 text-white font-medium py-3 rounded-lg"
          disabled={isCorrect && !showSolution}
        >
          Reset
        </button>
        {/* Undo */}
        <button
          onClick={undoLastOperation}
          className="flex-1 bg-gradient-to-r from-gray-500 to-gray-600 text-white font-medium py-3 rounded-lg"
          disabled={history.length === 0 || isCorrect}
        >
          Undo
        </button>
        {/* New puzzle */}
        <button
          onClick={generateNewPuzzle}
          className="flex-1 bg-gradient-to-r from-purple-500 to-violet-600 text-white font-medium py-3 rounded-lg"
        >
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
