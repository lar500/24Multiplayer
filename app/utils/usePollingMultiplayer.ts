import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';

async function fetchState(roomId: string): Promise<GameState> {
  const res = await fetch(`/api/rooms/${roomId}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch game state: ${res.statusText}`);
  }
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
  targetScore?: number
): {
  state: GameState | null;
  playerId: string;
  error: string | null;
  join: () => Promise<void>;
  markReady: () => Promise<void>;
  submitSolution: (sol: string) => Promise<void>;
} {
  const [playerId] = useState(() => uuidv4());
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(true);

  // Poll loop
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const poll = async () => {
      if (!isPolling) return;

      try {
        const s = await fetchState(roomId);
        setState(s);
        setError(null);

        // Stop polling if game is over
        if (s.gameOver) {
          setIsPolling(false);
        }
      } catch (e) {
        if (e instanceof Error) {
          setError(e.message);
        } else {
          setError(String(e));
        }
      }

      // Schedule next poll
      timeoutId = setTimeout(poll, 500);
    };

    // Start polling
    poll();

    // Cleanup
    return () => {
      setIsPolling(false);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [roomId, isPolling]);

  const join = useCallback(async () => {
    try {
      const response = await fetch(`/api/rooms/${roomId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'join', playerId, playerName, targetScore }),
      });

      if (!response.ok) {
        throw new Error(`Failed to join room: ${response.statusText}`);
      }

      setError(null);
    } catch (e) {
      if (e instanceof Error) {
        setError(e.message);
      } else {
        setError(String(e));
      }
    }
  }, [roomId, playerId, playerName, targetScore]);

  const markReady = useCallback(async () => {
    try {
      const response = await fetch(`/api/rooms/${roomId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ready', playerId }),
      });

      if (!response.ok) {
        throw new Error(`Failed to mark ready: ${response.statusText}`);
      }

      setError(null);
    } catch (e) {
      if (e instanceof Error) {
        setError(e.message);
      } else {
        setError(String(e));
      }
    }
  }, [roomId, playerId]);

  const submitSolution = useCallback(
    async (solution: string) => {
      try {
        const response = await fetch(`/api/rooms/${roomId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'submit', playerId, solution }),
        });

        if (!response.ok) {
          throw new Error(`Failed to submit solution: ${response.statusText}`);
        }

        setError(null);
      } catch (e) {
        if (e instanceof Error) {
          setError(e.message);
        } else {
          setError(String(e));
        }
      }
    },
    [roomId, playerId]
  );

  return { state, playerId, error, join, markReady, submitSolution };
}