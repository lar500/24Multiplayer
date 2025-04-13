"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import GameBoard from "../components/GameBoard";
import { Solver } from "../utils/solver";
import {
  saveToGlobalLeaderboard,
  getGlobalLeaderboard,
  formatTime,
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
    const { success, error } = await saveToGlobalLeaderboard(record);
    if (!success) {
      console.error("Failed to save to global leaderboard:", error);
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

  return (
    <div className="flex flex-col items-center min-h-screen p-4 md:p-8">
      <Link
        href="/"
        className="self-start mb-8 text-blue-600 hover:text-blue-800"
      >
        ← Back to home
      </Link>

      <h1 className="text-4xl font-bold mb-2">Speedrun Mode</h1>
      <p className="text-xl mb-8 text-center">
        Solve {TOTAL_PUZZLES} puzzles as quickly as possible!
      </p>

      <div className="w-full flex flex-col lg:flex-row gap-8 items-start">
        {/* Game area */}
        <div className="flex flex-col items-center lg:w-3/5">
          {/* Timer display */}
          <div className="w-full max-w-md mb-6 bg-black rounded-xl shadow-md p-4 flex justify-between items-center">
            <div>
              <p className="text-sm text-black-600">Puzzle</p>
              <p className="text-3xl font-bold">
                {session.isActive
                  ? `${session.currentPuzzle + 1}/${TOTAL_PUZZLES}`
                  : "-"}
              </p>
            </div>
            <div>
              <p className="text-sm text-black-600">Time</p>
              <p className="text-3xl font-bold font-mono">
                {formatTime(currentTime)}
              </p>
            </div>
          </div>

          {/* Game board or start button */}
          {!session.isActive ? (
            <div className="w-full max-w-md bg-black rounded-xl shadow-md p-6 flex flex-col items-center">
              <h2 className="text-2xl font-bold mb-4">Ready to Speedrun?</h2>
              <p className="text-black-700 mb-6 text-center">
                You'll need to solve {TOTAL_PUZZLES} puzzles as quickly as
                possible. The timer will start when you click the button below.
              </p>
              <button
                onClick={startSpeedrun}
                className="bg-green-600 hover:bg-green-700 text-black font-bold py-3 px-8 rounded-lg text-xl"
              >
                Start Speedrun
              </button>
            </div>
          ) : session.isComplete ? (
            <div className="w-full max-w-md bg-gray-800 rounded-xl shadow-md p-6 flex flex-col items-center">
              <h2 className="text-2xl font-bold mb-4">Speedrun Complete!</h2>
              <p className="text-3xl font-bold font-mono mb-6">
                {formatTime(session.splits[session.splits.length - 1])}
              </p>

              <div className="w-full mb-6">
                <label className="block text-sm font-bold mb-2">
                  Enter your name for the leaderboard:
                </label>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded mb-4"
                  placeholder="Your name"
                />
                <button
                  onClick={saveRun}
                  disabled={!playerName.trim()}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg disabled:bg-gray-400"
                >
                  Save to Leaderboard
                </button>
              </div>

              <button
                onClick={startSpeedrun}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-8 rounded-lg"
              >
                Start New Run
              </button>
            </div>
          ) : (
            <GameBoard
              initialNumbers={session.puzzles[session.currentPuzzle]}
              onSolve={handleSolve}
            />
          )}
        </div>

        {/* Stats & Leaderboard */}
        <div className="lg:w-2/5 w-full">
          {/* Splits (if active or complete) */}
          {(session.splits.length > 0 || session.isComplete) && (
            <div className="bg-black rounded-xl shadow-md p-4 mb-6">
              <h3 className="text-xl font-bold mb-2">Splits</h3>
              <div className="overflow-y-auto max-h-[200px]">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Puzzle</th>
                      <th className="text-right py-2">Split</th>
                      <th className="text-right py-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {session.splits.map((totalTime, index) => {
                      const splitTime =
                        index === 0
                          ? totalTime
                          : totalTime - session.splits[index - 1];

                      return (
                        <tr key={index} className="border-b">
                          <td className="py-2">{index + 1}</td>
                          <td className="text-right py-2 font-mono">
                            {formatTime(splitTime)}
                          </td>
                          <td className="text-right py-2 font-mono">
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
          <div className="mt-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">Leaderboard</h2>
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => setShowGlobalLeaderboard(false)}
                  className={`px-4 py-2 rounded ${
                    !showGlobalLeaderboard
                      ? "bg-blue-500 text-white"
                      : "bg-gray-200 text-gray-700"
                  }`}
                >
                  Personal
                </button>
                <button
                  onClick={() => setShowGlobalLeaderboard(true)}
                  className={`px-4 py-2 rounded ${
                    showGlobalLeaderboard
                      ? "bg-blue-500 text-white"
                      : "bg-gray-200 text-gray-700"
                  }`}
                >
                  Global
                </button>
              </div>
            </div>

            {showGlobalLeaderboard ? (
              <div className="bg-white rounded-lg shadow p-6">
                {isLoadingGlobal ? (
                  <div className="text-center py-4">
                    Loading global leaderboard...
                  </div>
                ) : globalError ? (
                  <div className="text-center py-4 text-red-500">
                    {globalError}
                  </div>
                ) : !globalRecords || globalRecords.length === 0 ? (
                  <div className="text-center py-4">No global records yet</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2">Rank</th>
                          <th className="text-left py-2">Name</th>
                          <th className="text-left py-2">Date</th>
                          <th className="text-right py-2">Total Time</th>
                          <th className="text-right py-2">Splits</th>
                        </tr>
                      </thead>
                      <tbody>
                        {globalRecords.map((record, index) => (
                          <tr key={record.id} className="border-b">
                            <td className="py-2">{index + 1}</td>
                            <td className="py-2">{record.name}</td>
                            <td className="py-2">
                              {new Date(record.date).toLocaleDateString()}
                            </td>
                            <td className="py-2 text-right">
                              {formatTime(record.totalTime)}
                            </td>
                            <td className="py-2 text-right">
                              {record.splits.map((split, i) => (
                                <span key={i} className="ml-2">
                                  {formatTime(split)}
                                </span>
                              ))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow p-6">
                {records.length === 0 ? (
                  <div className="text-center py-4">
                    No personal records yet
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2">Rank</th>
                          <th className="text-left py-2">Date</th>
                          <th className="text-right py-2">Total Time</th>
                          <th className="text-right py-2">Splits</th>
                        </tr>
                      </thead>
                      <tbody>
                        {records.map((record, index) => (
                          <tr key={record.id} className="border-b">
                            <td className="py-2">{index + 1}</td>
                            <td className="py-2">
                              {new Date(record.date).toLocaleDateString()}
                            </td>
                            <td className="py-2 text-right">
                              {formatTime(record.totalTime)}
                            </td>
                            <td className="py-2 text-right">
                              {record.splits.map((split, i) => (
                                <span key={i} className="ml-2">
                                  {formatTime(split)}
                                </span>
                              ))}
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
