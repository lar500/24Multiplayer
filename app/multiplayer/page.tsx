"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  useFirebaseMultiplayer,
  Player,
} from "../utils/useFirebaseMultiplayer";
import GameBoard from "../components/GameBoard";

const TARGET_SCORE_KEY = "multiplayer_target_score";

function PlayerProgress({
  player,
  targetScore,
}: {
  player: Player;
  targetScore: number;
}) {
  const progress = (player.score / targetScore) * 100;
  return (
    <div className="mb-2">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-white">{player.name}</span>
        <span className="text-white">
          {player.score}/{targetScore}
        </span>
      </div>
      <div className="w-full bg-gray-700 rounded-full h-2.5">
        <div
          className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

export default function MultiplayerPage() {
  // form state
  const [playerName, setPlayerName] = useState("");
  const [roomIdInput, setRoomIdInput] = useState("");
  const [targetScore, setTargetScore] = useState(5);
  const [hasJoinedRoom, setHasJoinedRoom] = useState(false);

  // load saved target score
  useEffect(() => {
    const saved = localStorage.getItem(TARGET_SCORE_KEY);
    if (saved) setTargetScore(parseInt(saved, 10));
  }, []);

  // derive the actual roomId to use
  const roomId = useMemo(
    () => roomIdInput.trim() || Math.random().toString(36).substring(2, 6),
    [roomIdInput]
  );

  const {
    state,
    playerId,
    error,
    join,
    markReady,
    submitSolution,
    updateTargetScore,
  } = useFirebaseMultiplayer(roomId, playerName, targetScore);

  // Update target score when slider changes
  useEffect(() => {
    if (state && state.creatorId === playerId) {
      updateTargetScore(targetScore);
    }
  }, [targetScore, state, playerId, updateTargetScore]);

  // Debug logging for target score
  useEffect(() => {
    console.log("[MultiplayerPage] Current target score:", targetScore);
    console.log(
      "[MultiplayerPage] Game state target score:",
      state?.targetScore
    );
  }, [targetScore, state?.targetScore]);

  const handleJoinRoom = async () => {
    if (!playerName.trim()) {
      alert("Please enter your name");
      return;
    }
    // Only persist target score if creating a new room
    if (!roomIdInput) {
      console.log(
        "[handleJoinRoom] Creating new room with target score:",
        targetScore,
        "type:",
        typeof targetScore
      );
      localStorage.setItem(TARGET_SCORE_KEY, targetScore.toString());
    } else {
      console.log(
        "[handleJoinRoom] Joining existing room, target score:",
        targetScore
      );
    }

    await join();
    setHasJoinedRoom(true);
  };

  const handleSolve = (solution: string) => {
    submitSolution(solution);
  };

  const formatTime = (ms: number) => {
    const seconds = ms / 1000;
    return seconds.toFixed(2) + "s";
  };

  // helpers
  const isPlayerInRoom = !!state?.players?.find((p) => p.id === playerId);

  const isCurrentPlayerReady = !!state?.players?.find(
    (p) => p.id === playerId && p.ready
  );
  const isGameOver = state?.gameOver;

  return (
    <div className="flex flex-col items-center min-h-screen bg-gray-900 p-8">
      <Link
        href="/"
        className="self-start mb-8 text-blue-400 hover:text-blue-300"
      >
        ← Back to home
      </Link>

      <h1 className="text-4xl font-bold mb-2 text-white">Multiplayer Mode</h1>
      <p className="text-xl mb-8 text-gray-300">
        Compete with friends to solve puzzles the fastest!
      </p>

      {error && (
        <div className="w-full max-w-md mb-4 p-4 bg-red-900/60 text-red-100 rounded-lg">
          <p className="text-center font-bold mb-2">Error</p>
          <p className="text-center">{error}</p>
        </div>
      )}

      {!hasJoinedRoom ? (
        // Join form
        <div className="w-full max-w-md bg-gray-800 rounded-xl p-6">
          <h2 className="text-2xl mb-4 text-white">Join a Game</h2>
          <input
            className="w-full mb-4 p-3 bg-gray-700 text-white rounded"
            placeholder="Your Name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
          />
          <input
            className="w-full mb-4 p-3 bg-gray-700 text-white rounded"
            placeholder="Room ID (optional)"
            value={roomIdInput}
            onChange={(e) => setRoomIdInput(e.target.value)}
          />
          <div className="mb-4">
            <label className="text-gray-300">First to</label>
            <input
              type="range"
              min="1"
              max="10"
              value={targetScore}
              onChange={(e) => setTargetScore(+e.target.value)}
              className="w-full"
            />
            <div className="text-white mt-1">
              {targetScore} {targetScore === 1 ? "puzzle" : "puzzles"}
            </div>
          </div>
          <button
            onClick={handleJoinRoom}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded"
          >
            {roomIdInput ? "Join Room" : "Create Room"}
          </button>
        </div>
      ) : !state ? (
        // waiting for the first poll
        <p className="text-white">Loading game...</p>
      ) : !state.isActive && !isGameOver ? (
        // Waiting room
        <div className="w-full max-w-md bg-gray-800 rounded-xl p-6">
          <h2 className="text-2xl mb-4 text-white">Waiting Room</h2>
          <p className="text-gray-300 mb-4">Room ID: {roomId}</p>
          <p className="text-gray-300 mb-4">
            First to {state.targetScore}{" "}
            {state.targetScore === 1 ? "puzzle" : "puzzles"}!
          </p>

          <ul className="mb-4 text-white">
            {state.players?.map((p) => (
              <li key={p.id}>
                {p.name} — {p.ready ? "Ready" : "Not Ready"}
              </li>
            ))}
          </ul>

          {isPlayerInRoom && (
            <button
              onClick={markReady}
              disabled={isCurrentPlayerReady}
              className={`w-full py-2 rounded ${
                isCurrentPlayerReady
                  ? "bg-green-600"
                  : "bg-yellow-500 hover:bg-yellow-600"
              } text-white`}
            >
              {isCurrentPlayerReady ? "Waiting…" : "Ready to Play"}
            </button>
          )}
        </div>
      ) : isGameOver ? (
        // Game over
        <div className="w-full max-w-md bg-gray-800 rounded-xl p-6">
          <h2 className="text-2xl mb-4 text-white">Game Over</h2>
          <p className="text-yellow-300 mb-4">
            {state.winnerDetails?.name} won!
          </p>
          <ul className="mb-4 text-white">
            {state.players?.map((p) => (
              <li key={p.id}>
                {p.name}: {p.score} {p.id === state.winner && "🏆"}
              </li>
            ))}
          </ul>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded"
          >
            Play Again
          </button>
        </div>
      ) : (
        // Active game
        <div className="w-full max-w-2xl">
          <div className="mb-6 text-white">
            <span>First to solve </span>
            <strong>{state.targetScore}</strong>
            <span> puzzles!</span>
          </div>

          {state.isActive && (
            <div className="w-full max-w-2xl mb-6">
              <div className="bg-gray-800 rounded-xl p-4">
                <h3 className="text-xl text-white mb-4">Scores</h3>
                {state.players.map((player) => (
                  <PlayerProgress
                    key={player.id}
                    player={player}
                    targetScore={state.targetScore}
                  />
                ))}
              </div>
            </div>
          )}

          <GameBoard
            initialNumbers={state.currentPuzzle}
            onSolve={handleSolve}
          />

          {state.lastSolution && (
            <div className="mt-4 text-green-300">
              {state.lastSolution.playerName} solved it in{" "}
              {formatTime(state.lastSolution.time)}!
            </div>
          )}
        </div>
      )}
    </div>
  );
}
