"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import GameBoard from "../components/GameBoard";
import { Solver } from "../utils/solver";

export default function SinglePlayerPage() {
  const [score, setScore] = useState(0);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [isGameActive, setIsGameActive] = useState(true);
  const [puzzleQueue, setPuzzleQueue] = useState<number[][]>([]);
  const [currentPuzzle, setCurrentPuzzle] = useState<number[] | undefined>(
    undefined
  );

  // Initialize puzzle queue
  useEffect(() => {
    const initialQueue = Array.from({ length: 5 }, () =>
      Solver.generatePuzzle()
    );
    setPuzzleQueue(initialQueue);
    setCurrentPuzzle(initialQueue[0]);
  }, []);

  // Timer effect
  useEffect(() => {
    if (!isGameActive) return;

    const timer = setInterval(() => {
      setTimeElapsed((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [isGameActive]);

  const handleSolve = () => {
    // Increase score when puzzle is solved
    setScore((prev) => prev + 1);

    // Get next puzzle from queue
    const newQueue = [...puzzleQueue];
    newQueue.shift(); // Remove current puzzle
    newQueue.push(Solver.generatePuzzle()); // Add new puzzle to end
    setPuzzleQueue(newQueue);
    setCurrentPuzzle(newQueue[0]);
    setTimeElapsed(0);
  };

  const handleNewGame = () => {
    // Generate new puzzle queue
    const newQueue = Array.from({ length: 5 }, () => Solver.generatePuzzle());
    setPuzzleQueue(newQueue);
    setCurrentPuzzle(newQueue[0]);
    setTimeElapsed(0);
    setIsGameActive(true);
  };

  const resetGame = () => {
    // Reset the game completely
    setScore(0);
    setTimeElapsed(0);
    const newQueue = Array.from({ length: 5 }, () => Solver.generatePuzzle());
    setPuzzleQueue(newQueue);
    setCurrentPuzzle(newQueue[0]);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col items-center min-h-screen p-8">
      <Link
        href="/"
        className="self-start mb-8 text-blue-600 hover:text-blue-800 flex items-center"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mr-1"
        >
          <path d="m12 19-7-7 7-7" />
          <path d="M19 12H5" />
        </svg>
        Back to home
      </Link>

      <h1 className="text-4xl font-bold mb-2">Single Player Mode</h1>
      <p className="text-xl mb-8">
        Challenge yourself to solve as many puzzles as you can!
      </p>

      <div className="flex justify-between w-full max-w-md mb-6 bg-white rounded-xl shadow-md p-4">
        <div className="text-center">
          <p className="text-sm text-green-800">Score</p>
          <p className="text-3xl text-black font-bold">{score}</p>
        </div>
        <div className="text-center">
          <p className="text-sm text-green-800">Time</p>
          <p className="text-3xl text-black font-bold">
            {formatTime(timeElapsed)}
          </p>
        </div>
      </div>

      <GameBoard
        initialNumbers={currentPuzzle}
        onSolve={handleSolve}
        onNewGame={handleNewGame}
      />

      <button
        onClick={resetGame}
        className="mt-8 bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-6 rounded-lg"
      >
        Reset Game
      </button>
    </div>
  );
}
