"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useMultiplayer } from "../utils/useMultiplayer";
import GameBoard from "../components/GameBoard";

// Local storage key for target score
const TARGET_SCORE_KEY = "multiplayer_target_score";

export default function MultiplayerPage() {
  const [playerName, setPlayerName] = useState("");
  const [roomIdInput, setRoomIdInput] = useState("");
  const [targetScore, setTargetScore] = useState(5);
  const [hasJoinedRoom, setHasJoinedRoom] = useState(false);

  const {
    gameState,
    isConnected,
    isLoading,
    error,
    socket,
    joinRoom,
    markReady,
    submitSolution,
  } = useMultiplayer();

  // Initialize target score from localStorage if available
  useEffect(() => {
    const savedTargetScore = localStorage.getItem(TARGET_SCORE_KEY);
    if (savedTargetScore) {
      setTargetScore(Number.parseInt(savedTargetScore, 10));
    }
  }, []);

  // Check if the player is in the current list of players
  const isPlayerInRoom = gameState.players.some(
    (player) => isConnected && socket?.id === player.id
  );

  // Check if the current player is ready
  const isCurrentPlayerReady =
    gameState.players.find((player) => isConnected && socket?.id === player.id)
      ?.ready || false;

  // Check if the current player is the room creator
  const isRoomCreator = isConnected && socket?.id === gameState.creatorId;

  // Get the effective target score (use gameState as the source of truth)
  const getEffectiveTargetScore = () => {
    // Always use the gameState targetScore as the source of truth
    if (
      gameState.targetScore &&
      gameState.targetScore >= 1 &&
      gameState.targetScore <= 10
    ) {
      return gameState.targetScore;
    }

    // Fall back to localStorage only if gameState doesn't have a valid targetScore
    const savedScore = localStorage.getItem(TARGET_SCORE_KEY);
    if (savedScore) {
      const parsedScore = Number.parseInt(savedScore, 10);
      if (!isNaN(parsedScore) && parsedScore >= 1 && parsedScore <= 10) {
        return parsedScore;
      }
    }

    // Default to 5 if all else fails
    return 5;
  };

  // Check if the game is over
  const isGameOver =
    gameState.gameOver || (gameState.winner && !gameState.isActive);

  // Add debug logs to check gameState values
  useEffect(() => {
    if (gameState.roomId) {
      console.log("GameState updated:", {
        gameStateTargetScore: gameState.targetScore,
        localStorageTargetScore: localStorage.getItem(TARGET_SCORE_KEY),
        effectiveTargetScore: getEffectiveTargetScore(),
        roomId: gameState.roomId,
        isActive: gameState.isActive,
        gameOver: gameState.gameOver,
        winner: gameState.winner,
        players: gameState.players.length,
      });
    }
  }, [gameState, getEffectiveTargetScore]);

  // Handle join room based on context
  const handleJoinRoom = () => {
    if (!playerName.trim()) {
      alert("Please enter your name");
      return;
    }

    // Generate random room ID if not provided
    const roomId =
      roomIdInput.trim() || Math.random().toString(36).substring(2, 8);

    // Save target score to localStorage
    localStorage.setItem(TARGET_SCORE_KEY, targetScore.toString());

    // If roomIdInput exists, we're joining an existing room
    // Otherwise, we're creating a new room with our target score
    console.log("Joining room with targetScore:", targetScore);

    // Force the target score to be a number to ensure proper type
    const scoreToUse = Number(targetScore);
    joinRoom(roomId, playerName, scoreToUse);
    setHasJoinedRoom(true);
  };

  // Handle game solution
  const handleSolve = (solution: string) => {
    submitSolution(solution);
  };

  // Format time in milliseconds to seconds
  const formatTime = (timeMs: number) => {
    return (timeMs / 1000).toFixed(2) + "s";
  };

  return (
    <div className="flex flex-col items-center min-h-screen bg-gray-900 p-8">
      <Link
        href="/"
        className="self-start mb-8 text-blue-400 hover:text-blue-300 flex items-center"
      >
        ← Back to home
      </Link>

      <h1 className="text-4xl font-bold mb-2 text-white">Multiplayer Mode</h1>
      <p className="text-xl mb-8 text-gray-300">
        Compete with friends to solve puzzles the fastest!
      </p>

      {error && (
        <div className="w-full max-w-md mb-4 p-4 bg-red-900/60 text-red-100 rounded-lg border border-red-700">
          <p className="text-center font-bold mb-2">Connection Error</p>
          <p className="text-center mb-3">{error}</p>
          <div className="flex justify-center">
            <button
              onClick={() => window.location.reload()}
              className="bg-red-700 hover:bg-red-600 text-white font-bold py-2 px-4 rounded"
            >
              Retry Connection
            </button>
          </div>
        </div>
      )}

      {!hasJoinedRoom ? (
        // Room join form
        <div className="w-full max-w-md bg-gray-800 rounded-xl shadow-md p-6 border border-gray-700">
          <h2 className="text-2xl font-bold mb-4 text-white">Join a Game</h2>

          <div className="mb-4">
            <label
              className="block text-sm font-bold mb-2 text-gray-300"
              htmlFor="playerName"
            >
              Your Name
            </label>
            <input
              id="playerName"
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full p-3 bg-gray-700 border border-gray-600 rounded text-white"
              placeholder="Enter your name"
            />
          </div>

          <div className="mb-4">
            <label
              className="block text-sm font-bold mb-2 text-gray-300"
              htmlFor="roomId"
            >
              Room ID (optional)
            </label>
            <input
              id="roomId"
              type="text"
              value={roomIdInput}
              onChange={(e) => setRoomIdInput(e.target.value)}
              className="w-full p-3 bg-gray-700 border border-gray-600 rounded text-white"
              placeholder="Leave empty to create a new room"
            />
          </div>

          {/* Only show target score select when creating a new room (no roomId) */}
          {!roomIdInput && (
            <div className="mb-6">
              <div className="flex justify-between items-center mb-2">
                <label
                  className="text-sm font-bold text-gray-300"
                  htmlFor="targetScore"
                >
                  First to score:
                </label>
                <span className="text-white font-medium px-3 py-1 bg-blue-600 rounded-lg">
                  {targetScore} {targetScore === 1 ? "puzzle" : "puzzles"}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400">1</span>
                <input
                  id="targetScore"
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={targetScore}
                  onChange={(e) => setTargetScore(Number(e.target.value))}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  style={{
                    backgroundImage: `linear-gradient(to right, #2563eb ${
                      targetScore * 10
                    }%, #374151 ${targetScore * 10}%)`,
                  }}
                />
                <span className="text-xs text-gray-400">10</span>
              </div>
            </div>
          )}

          <button
            onClick={handleJoinRoom}
            disabled={isLoading || !isConnected}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg disabled:bg-gray-600"
          >
            {isLoading
              ? "Joining..."
              : roomIdInput
              ? "Join Room"
              : "Create Room"}
          </button>
        </div>
      ) : !gameState.isActive && !isGameOver ? (
        // Waiting room
        <div className="w-full max-w-md bg-gray-800 rounded-xl shadow-md p-6 border border-gray-700">
          <h2 className="text-2xl font-bold mb-4 text-white">Waiting Room</h2>

          <div className="mb-4 p-3 bg-blue-900/60 text-blue-100 rounded-lg border border-blue-700 flex items-center justify-between">
            <span>Room ID: {gameState.roomId}</span>
            <button
              onClick={() => navigator.clipboard.writeText(gameState.roomId)}
              className="text-blue-300 hover:text-blue-100 text-sm underline"
            >
              Copy
            </button>
          </div>

          <div className="mb-3 p-3 bg-purple-900/60 text-purple-100 rounded-lg border border-purple-700">
            <div className="flex flex-col items-center">
              <div className="flex items-center justify-center space-x-2 mb-3">
                <span className="text-xl text-white font-bold">Complete</span>
                <div className="bg-purple-800 text-white text-2xl font-bold px-4 py-1 rounded-lg border border-purple-500">
                  {getEffectiveTargetScore()}
                </div>
                <span className="text-xl text-white font-bold">
                  {getEffectiveTargetScore() === 1 ? "puzzle" : "puzzles"} to
                  win!
                </span>
              </div>

              {isRoomCreator && (
                <p className="text-center text-xs mt-2 text-purple-300 bg-purple-950/50 px-3 py-1 rounded-full">
                  You&apos;re the room creator
                </p>
              )}
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-bold mb-2 text-white">
              Players ({gameState.players.length}):
            </h3>
            <ul className="divide-y divide-gray-700 bg-gray-700 rounded-lg overflow-hidden">
              {gameState.players.map((player) => (
                <li
                  key={player.id}
                  className="py-2 px-3 flex justify-between items-center"
                >
                  <div className="flex items-center">
                    <span className="text-white">{player.name}</span>
                    {player.id === gameState.creatorId && (
                      <span className="ml-2 text-xs bg-blue-900 text-blue-100 px-2 py-1 rounded">
                        Creator
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-sm px-2 py-1 rounded ${
                      player.ready
                        ? "bg-green-900 text-green-100"
                        : "bg-gray-600 text-gray-300"
                    }`}
                  >
                    {player.ready ? "Ready" : "Not Ready"}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {isPlayerInRoom && (
            <button
              onClick={markReady}
              disabled={isCurrentPlayerReady}
              className={`w-full font-bold py-3 px-4 rounded-lg ${
                isCurrentPlayerReady
                  ? "bg-green-600 text-white"
                  : "bg-yellow-500 hover:bg-yellow-600 text-white"
              }`}
            >
              {isCurrentPlayerReady ? "Waiting for others..." : "Ready to Play"}
            </button>
          )}

          <p className="mt-4 text-sm text-center text-gray-400">
            {gameState.players.length < 2
              ? "Waiting for more players to join..."
              : "Waiting for all players to be ready..."}
          </p>
        </div>
      ) : isGameOver ? (
        // Game over screen
        <div className="w-full max-w-md bg-gray-800 rounded-xl shadow-md p-6 border border-gray-700">
          <h2 className="text-2xl font-bold mb-4 text-center text-white">
            Game Over!
          </h2>

          <div className="mb-6 p-4 bg-yellow-900/60 text-yellow-100 rounded-lg border border-yellow-700 text-center">
            <p className="text-xl font-bold mb-2">
              {gameState.winnerDetails?.name || "Someone"} Wins!
            </p>
            <p className="flex items-center justify-center">
              First to solve
              <span className="mx-1 bg-yellow-800 text-white font-bold px-2 py-0.5 rounded border border-yellow-600">
                {getEffectiveTargetScore()}
              </span>
              {getEffectiveTargetScore() === 1 ? "puzzle" : "puzzles"}
            </p>
          </div>

          <h3 className="text-lg font-bold mb-2 text-white">Final Scores:</h3>
          <div className="mb-6 bg-gray-700 rounded-lg overflow-hidden">
            <ul className="divide-y divide-gray-600">
              {gameState.players
                .sort((a, b) => b.score - a.score)
                .map((player) => (
                  <li
                    key={player.id}
                    className={`py-2 px-4 flex justify-between items-center ${
                      player.id === gameState.winner ? "bg-yellow-900/40" : ""
                    }`}
                  >
                    <div className="flex items-center">
                      <span
                        className={`text-white ${
                          player.id === gameState.winner ? "font-bold" : ""
                        }`}
                      >
                        {player.name}
                        {player.id === gameState.winner && " 🏆"}
                      </span>
                      {player.id === gameState.creatorId && (
                        <span className="ml-2 text-xs bg-blue-900 text-blue-100 px-2 py-1 rounded">
                          Creator
                        </span>
                      )}
                    </div>
                    <span className="font-bold text-white">{player.score}</span>
                  </li>
                ))}
            </ul>
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => window.location.reload()}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg"
            >
              Play Again
            </button>
            <Link
              href="/"
              className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-4 rounded-lg text-center"
            >
              Back to Home
            </Link>
          </div>
        </div>
      ) : (
        // Active game
        <div className="w-full max-w-2xl">
          <div className="mb-6 bg-gray-800 rounded-xl shadow-md p-4 border border-gray-700">
            <h3 className="text-lg font-bold mb-3 text-white border-b border-gray-700 pb-2 flex justify-between items-center">
              <span>Goal:</span>
              <span className="flex items-center bg-blue-900 px-3 py-1 rounded-lg">
                First to
                <span className="mx-1 bg-blue-700 text-white font-bold px-2 py-0.5 rounded border border-blue-500">
                  {getEffectiveTargetScore()}
                </span>
                {getEffectiveTargetScore() === 1 ? "puzzle" : "puzzles"}
              </span>
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {gameState.players.map((player) => (
                <div
                  key={player.id}
                  className={`text-center p-3 rounded-lg ${
                    player.id === socket?.id
                      ? "bg-blue-900 border border-blue-700"
                      : "bg-gray-700 border border-gray-600"
                  }`}
                >
                  <p className="font-bold text-white flex items-center justify-center mb-1">
                    {player.name}
                    {player.id === gameState.creatorId && (
                      <span className="ml-1 text-xs bg-blue-800 text-blue-100 px-1 rounded">
                        C
                      </span>
                    )}
                  </p>
                  <div className="text-lg text-white flex justify-center items-center font-bold mb-1">
                    <span className="text-xl">{player.score}</span>
                    <span className="text-gray-400 mx-1">/</span>
                    <span className="text-gray-300">
                      {getEffectiveTargetScore()}
                    </span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full ${
                        player.id === socket?.id
                          ? "bg-blue-500"
                          : "bg-green-500"
                      }`}
                      style={{
                        width: `${
                          (player.score / getEffectiveTargetScore()) * 100
                        }%`,
                        minWidth: player.score > 0 ? "8%" : "0%",
                      }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {gameState.lastSolution && (
            <div className="mb-6 p-4 bg-green-900/60 text-green-100 rounded-lg border border-green-700 text-center">
              <p className="font-bold">
                {gameState.lastSolution.playerName} solved it!
              </p>
              <p>Solution: {gameState.lastSolution.solution}</p>
              <p>Time: {formatTime(gameState.lastSolution.time)}</p>
            </div>
          )}

          <GameBoard
            initialNumbers={gameState.currentPuzzle}
            onSolve={handleSolve}
          />
        </div>
      )}
    </div>
  );
}
