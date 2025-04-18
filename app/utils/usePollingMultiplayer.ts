import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';

async function fetchState(roomId: string): Promise<any> {
  const res = await fetch(`/api/rooms/${roomId}`);
  return res.json();
}

export function usePollingMultiplayer(
  roomId: string,
  playerName: string,
  targetScore = 5
) {
  const [playerId] = useState(() => uuidv4());
  const [state, setState] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Poll loop
  useEffect(() => {
    let interval = setInterval(async () => {
      try {
        const s = await fetchState(roomId);
        setState(s);
      } catch (e: any) {
        setError(e.message);
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