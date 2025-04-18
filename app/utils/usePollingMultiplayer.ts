import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';

async function fetchState(roomId: string): Promise<GameState> {
  const res = await fetch(`/api/rooms/${roomId}`);
  return res.json();
}
export interface Player {
  id: string;
  name: string;
  ready: boolean;
  score: number;
}
export interface GameState {
  roomId: string;
  playerId: string;
  creatorId: string;
  players: Player[];
  isActive: boolean;
  currentPuzzle: number[];
  targetScore: number;
  gameOver: boolean;
  winner: string | null;
  winnerDetails: Player | null;
  lastSolution: { playerName: string; solution: string; time: number } | null;
}

export function usePollingMultiplayer(
  roomId: string,
  playerName: string,
  targetScore ?: number
): {
  state: GameState | null;
  error: string | null;
  join: () => Promise<void>;
  markReady: () => Promise<void>;
  submitSolution: (sol: string) => Promise<void>;
} {
  const [playerId] = useState(() => uuidv4());
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Poll loop
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const s = await fetchState(roomId);
        setState(s);
      } catch (e) {
        if (e instanceof Error) {
          setError(e.message);
        } else {
            setError(String(e));
        }
      }
    }, 500);
    return () => clearInterval(interval);
  }, [roomId]);

  const join = useCallback(async () => {
    await fetch(`/api/rooms/${roomId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'join', playerId, playerName, targetScore }),
    });
  }, [roomId, playerId, playerName, targetScore]);

  const markReady = useCallback(async () => {
    await fetch(`/api/rooms/${roomId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ready', playerId }),
    });
  }, [roomId, playerId]);

  const submitSolution = useCallback(
    async (solution: string) => {
      await fetch(`/api/rooms/${roomId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit', playerId, solution }),
      });
    },
    [roomId, playerId]
  );

  return { state, error, join, markReady, submitSolution };
}