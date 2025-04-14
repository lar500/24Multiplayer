"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import GameBoard from "../components/GameBoard";
import { Solver } from "../utils/solver";
import {
  saveToGlobalLeaderboard,
  type SpeedrunRecord,
} from "../utils/leaderboard";

// Type for the current speedrun session
type SpeedrunSession = {
  startTime: number;
  currentPuzzle: number;
  puzzles: number[][];
  splits: number[];
  isActive: boolean;
  isComplete: boolean;
};

const TOTAL_PUZZLES = 10;

export default function SpeedrunPage() {
  // State for the speedrun session
  const [session, setSession] = useState<SpeedrunSession>({
    startTime: 0,
    currentPuzzle: 0,
    puzzles: [],
    splits: [],
    isActive: false,
    isComplete: false,
  });

  // Current display time (updated by timer)
  const [currentTime, setCurrentTime] = useState(0);

  // Leaderboard records
  const [records, setRecords] = useState<SpeedrunRecord[]>([]);

  // Name input for the leaderboard
  const [playerName, setPlayerName] = useState("");

  // Show global leaderboard
  const [showGlobalLeaderboard, setShowGlobalLeaderboard] = useState(false);
  const [globalRecords, setGlobalRecords] = useState<SpeedrunRecord[]>([]);
  const [isLoadingGlobal, setIsLoadingGlobal] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Load records from localStorage on mount
  useEffect(() => {
    const storedRecords = localStorage.getItem("speedrunRecords");
    if (storedRecords) {
      try {
        const parsedRecords = JSON.parse(storedRecords);
        // Validate the parsed records
        if (Array.isArray(parsedRecords) && parsedRecords.length > 0) {
          setRecords(parsedRecords);
          console.log("Loaded speedrun records:", parsedRecords.length);
        } else {
          console.log("No valid records found in localStorage");
        }
      } catch (e) {
        console.error("Error loading speedrun records:", e);
      }
    } else {
      console.log("No speedrun records found in localStorage");
    }
  }, []);

  // Save records to localStorage whenever they change
  useEffect(() => {
    if (records.length > 0) {
      try {
        localStorage.setItem("speedrunRecords", JSON.stringify(records));
        console.log("Saved speedrun records to localStorage:", records.length);
      } catch (e) {
        console.error("Error saving speedrun records:", e);
      }
    }
  }, [records]);

  // Timer effect
  useEffect(() => {
    if (!session.isActive || session.isComplete) return;

    const timer = setInterval(() => {
      const elapsed = Date.now() - session.startTime;
      setCurrentTime(elapsed);
    }, 10); // Update every 10ms for a smoother timer

    return () => clearInterval(timer);
  }, [session.isActive, session.isComplete, session.startTime]);

  // Start a new speedrun session
  const startSpeedrun = useCallback(() => {
    // Generate 10 puzzles with solutions
    const puzzles: number[][] = [];
    for (let i = 0; i < TOTAL_PUZZLES; i++) {
      puzzles.push(Solver.generatePuzzle());
    }

    setSession({
      startTime: Date.now(),
      currentPuzzle: 0,
      puzzles,
      splits: [],
      isActive: true,
      isComplete: false,
    });

    setCurrentTime(0);
  }, []);

  // Handle solving a puzzle
  const handleSolve = useCallback(() => {
    if (!session.isActive || session.isComplete) return;

    const currentTime = Date.now() - session.startTime;
    const newSplits = [...session.splits, currentTime];
    const newPuzzleIndex = session.currentPuzzle + 1;

    // Check if this was the last puzzle
    if (newPuzzleIndex >= TOTAL_PUZZLES) {
      setSession((prev) => ({
        ...prev,
        splits: newSplits,
        currentPuzzle: newPuzzleIndex,
        isComplete: true,
      }));
    } else {
      // Move to the next puzzle
      setSession((prev) => ({
        ...prev,
        splits: newSplits,
        currentPuzzle: newPuzzleIndex,
      }));
    }
  }, [session]);

  // Save the completed run to the leaderboard
  const saveRun = useCallback(() => {
    if (!session.isComplete || !playerName.trim()) return;

    const newRecord: SpeedrunRecord = {
      id: Date.now().toString(),
      userId: "guest", // Add a default userId for guest users
      name: playerName,
      date: new Date().toLocaleString(),
      totalTime: session.splits[session.splits.length - 1],
      splits: session.splits.map((split, index) =>
        index === 0 ? split : split - session.splits[index - 1]
      ),
    };

    // Get current records from localStorage to ensure we have the latest data
    let currentRecords: SpeedrunRecord[] = [];
    try {
      const storedRecords = localStorage.getItem("speedrunRecords");
      if (storedRecords) {
        currentRecords = JSON.parse(storedRecords);
      }
    } catch (e) {
      console.error("Error reading current records:", e);
    }

    // Add the new record and sort
    const updatedRecords = [...currentRecords, newRecord]
      .sort((a, b) => a.totalTime - b.totalTime)
      .slice(0, 10); // Keep only top 10

    // Save to localStorage first
    try {
      localStorage.setItem("speedrunRecords", JSON.stringify(updatedRecords));
      console.log("Saved new record to localStorage");
    } catch (e) {
      console.error("Error saving to localStorage:", e);
    }

    // Then update state
    setRecords(updatedRecords);

    // Save to global leaderboard
    handleRunComplete(newRecord);

    // Reset for a new run
    setSession((prev) => ({
      ...prev,
      isActive: false,
    }));

    setPlayerName("");
  }, [playerName, session]);

  // Load global leaderboard
  const loadGlobalLeaderboard = async () => {
    setIsLoadingGlobal(true);
    setGlobalError(null);
    try {
      const response = await fetch("/api/leaderboard");
      if (!response.ok) {
        throw new Error("Failed to fetch global leaderboard");
      }
      const data = await response.json();
      setGlobalRecords(data.records || []);
    } catch (error) {
      console.error("Error loading global leaderboard:", error);
      setGlobalError("Failed to load global leaderboard");
      setGlobalRecords([]);
    } finally {
      setIsLoadingGlobal(false);
    }
  };

  // Save to global leaderboard when a run is completed
  const handleRunComplete = async (record: SpeedrunRecord) => {
    try {
      const success = await saveToGlobalLeaderboard(record);
      if (!success) {
        console.error("Failed to save to global leaderboard");
      } else {
        // Refresh the global leaderboard after saving
        loadGlobalLeaderboard();
      }
    } catch (error) {
      console.error("Error saving to global leaderboard:", error);
    }
  };

  // Format time in milliseconds to mm:ss.ms
  const formatTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const milliseconds = Math.floor((ms % 1000) / 10);

    return `${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}.${milliseconds.toString().padStart(2, "0")}`;
  };

  // Load global leaderboard when toggling
  useEffect(() => {
    if (showGlobalLeaderboard) {
      loadGlobalLeaderboard();
    }
  }, [showGlobalLeaderboard]);

  // Load global leaderboard on initial page load
  useEffect(() => {
    loadGlobalLeaderboard();
  }, []);

  return (
    <div className="flex flex-col items-center min-h-screen p-4 md:p-8 bg-black">
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

      <h1 className="text-4xl font-bold mb-2 text-white">Speedrun Mode</h1>
      <p className="text-xl mb-8 text-center text-white">
        Solve {TOTAL_PUZZLES} puzzles as quickly as possible!
      </p>

      {/* Main content container */}
      <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Game area */}
        <div className="flex flex-col items-center">
          {/* Timer display */}
          <div className="w-full max-w-md mb-6 bg-white rounded-xl shadow-md p-4 flex justify-between items-center border border-gray-200">
            <div>
              <p className="text-sm text-gray-500">Puzzle</p>
              <p className="text-3xl font-bold text-gray-800">
                {session.isActive
                  ? `${session.currentPuzzle + 1}/${TOTAL_PUZZLES}`
                  : "-"}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Time</p>
              <p className="text-3xl font-bold font-mono text-gray-800">
                {formatTime(currentTime)}
              </p>
            </div>
          </div>

          {/* Game board or start button */}
          {!session.isActive ? (
            <div className="w-full max-w-md bg-white rounded-xl shadow-md p-6 flex flex-col items-center border border-gray-200">
              <h2 className="text-2xl font-bold mb-4 text-gray-800">
                Ready to Speedrun?
              </h2>
              <p className="text-gray-600 mb-6 text-center">
                You'll need to solve {TOTAL_PUZZLES} puzzles as quickly as
                possible. The timer will start when you click the button below.
              </p>
              <button
                onClick={startSpeedrun}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-8 rounded-lg text-xl transition-colors"
              >
                Start Speedrun
              </button>
            </div>
          ) : session.isComplete ? (
            <div className="w-full max-w-md bg-white rounded-xl shadow-md p-6 flex flex-col items-center border border-gray-200">
              <h2 className="text-2xl font-bold mb-4 text-gray-800">
                Speedrun Complete!
              </h2>
              <p className="text-3xl font-bold font-mono mb-6 text-gray-800">
                {formatTime(session.splits[session.splits.length - 1])}
              </p>

              <div className="w-full mb-6">
                <label className="block text-sm font-bold mb-2 text-gray-700">
                  Enter your name for the leaderboard:
                </label>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded mb-4 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="Your name"
                />
                <button
                  onClick={saveRun}
                  disabled={!playerName.trim()}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  Save to Leaderboard
                </button>
              </div>

              <button
                onClick={startSpeedrun}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-8 rounded-lg transition-colors"
              >
                Start New Run
              </button>
            </div>
          ) : (
            <div className="w-full max-w-md">
              <GameBoard
                initialNumbers={session.puzzles[session.currentPuzzle]}
                onSolve={handleSolve}
              />
            </div>
          )}
        </div>

        {/* Stats & Leaderboard */}
        <div className="w-full">
          {/* Splits (if active or complete) */}
          {(session.splits.length > 0 || session.isComplete) && (
            <div className="bg-white rounded-xl shadow-md p-4 mb-6 border border-gray-200">
              <h3 className="text-xl font-bold mb-2 text-gray-800">Splits</h3>
              <div className="overflow-y-auto max-h-[200px]">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 text-gray-600">Puzzle</th>
                      <th className="text-right py-2 text-gray-600">Split</th>
                      <th className="text-right py-2 text-gray-600">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {session.splits.map((totalTime, index) => {
                      const splitTime =
                        index === 0
                          ? totalTime
                          : totalTime - session.splits[index - 1];

                      return (
                        <tr key={index} className="border-b border-gray-100">
                          <td className="py-2 text-gray-800">{index + 1}</td>
                          <td className="text-right py-2 font-mono text-gray-800">
                            {formatTime(splitTime)}
                          </td>
                          <td className="text-right py-2 font-mono text-gray-800">
                            {formatTime(totalTime)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Leaderboard Section */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-white">Leaderboard</h2>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowGlobalLeaderboard(false)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    !showGlobalLeaderboard
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  Personal
                </button>
                <button
                  onClick={() => setShowGlobalLeaderboard(true)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    showGlobalLeaderboard
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  Global
                </button>
              </div>
            </div>

            {showGlobalLeaderboard ? (
              <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
                {isLoadingGlobal ? (
                  <div className="text-center py-4 text-gray-600">
                    <svg
                      className="animate-spin h-6 w-6 mx-auto mb-2 text-blue-600"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Loading global leaderboard...
                  </div>
                ) : globalError ? (
                  <div className="text-center py-4 text-red-500">
                    {globalError}
                  </div>
                ) : !globalRecords || globalRecords.length === 0 ? (
                  <div className="text-center py-4 text-gray-600">
                    No global records yet
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-2 text-gray-600">Rank</th>
                          <th className="text-left py-2 text-gray-600">Name</th>
                          <th className="text-left py-2 text-gray-600">Date</th>
                          <th className="text-right py-2 text-gray-600">
                            Total Time
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {globalRecords.map((record, index) => (
                          <tr
                            key={record.id}
                            className="border-b border-gray-100"
                          >
                            <td className="py-2 text-gray-800">{index + 1}</td>
                            <td className="py-2 text-gray-800">
                              {record.name}
                            </td>
                            <td className="py-2 text-gray-800">
                              {new Date(record.date).toLocaleDateString()}
                            </td>
                            <td className="py-2 text-right font-mono text-gray-800">
                              {formatTime(record.totalTime)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
                {records.length === 0 ? (
                  <div className="text-center py-4 text-gray-600">
                    No personal records yet
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-2 text-gray-600">Rank</th>
                          <th className="text-left py-2 text-gray-600">Name</th>
                          <th className="text-left py-2 text-gray-600">Date</th>
                          <th className="text-right py-2 text-gray-600">
                            Total Time
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {records.map((record, index) => (
                          <tr
                            key={record.id}
                            className="border-b border-gray-100"
                          >
                            <td className="py-2 text-gray-800">{index + 1}</td>
                            <td className="py-2 text-gray-800">
                              {record.name}
                            </td>
                            <td className="py-2 text-gray-800">
                              {new Date(record.date).toLocaleDateString()}
                            </td>
                            <td className="py-2 text-right font-mono text-gray-800">
                              {formatTime(record.totalTime)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
