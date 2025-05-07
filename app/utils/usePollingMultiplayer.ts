import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';

const MAX_RETRIES = 5;
const RETRY_DELAY = 2000; // 2 seconds
const POLL_INTERVAL = 1000; // 1 second
const REQUEST_TIMEOUT = 5000; // 5 seconds

type RequestAction = 'join' | 'ready' | 'submit';

interface RequestData {
  action: RequestAction;
  playerId: string;
  playerName?: string;
  targetScore?: number;
  solution?: string;
}

class NetworkError extends Error {
  constructor(
    message: string, 
    public readonly isTimeout: boolean = false,
    public readonly retryCount: number = 0
  ) {
    super(message);
    this.name = 'NetworkError';
  }
}

async function fetchWithTimeout(url: string, options: RequestInit, timeout: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new NetworkError('Request timed out', true);
    }
    throw new NetworkError(error instanceof Error ? error.message : 'Network request failed');
  }
}

async function fetchState(roomId: string, retryCount = 0): Promise<GameState> {
  try {
    const res = await fetchWithTimeout(
      `/api/rooms/${roomId}`,
      { method: 'GET' },
      REQUEST_TIMEOUT
    );

    if (!res.ok) {
      if (res.status === 504 && retryCount < MAX_RETRIES) {
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return fetchState(roomId, retryCount + 1);
      }
      throw new Error(`Failed to fetch game state: ${res.statusText}`);
    }
    return res.json();
  } catch (error) {
    if (error instanceof NetworkError && error.isTimeout && retryCount < MAX_RETRIES) {
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return fetchState(roomId, retryCount + 1);
    }
    throw new NetworkError(
      error instanceof Error ? error.message : 'Network request failed',
      error instanceof NetworkError ? error.isTimeout : false,
      retryCount
    );
  }
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
  const [consecutiveErrors, setConsecutiveErrors] = useState(0);
  const [retryCount, setRetryCount] = useState(0);

  // Poll loop
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let isMounted = true;

    const poll = async () => {
      if (!isPolling || !isMounted) return;

      try {
        const s = await fetchState(roomId, retryCount);
        if (!isMounted) return;
        
        setState(s);
        setError(null);
        setConsecutiveErrors(0);
        setRetryCount(0);

        // Stop polling if game is over
        if (s.gameOver) {
          setIsPolling(false);
        }
      } catch (e) {
        if (!isMounted) return;
        
        const errorMessage = e instanceof NetworkError 
          ? (e.isTimeout 
              ? `Connection timed out. Retrying... (${e.retryCount + 1}/${MAX_RETRIES})` 
              : e.message)
          : e instanceof Error 
            ? e.message 
            : String(e);
            
        setError(errorMessage);
        setConsecutiveErrors(prev => prev + 1);
        setRetryCount(prev => prev + 1);

        // Stop polling after too many consecutive errors
        if (consecutiveErrors >= MAX_RETRIES) {
          setIsPolling(false);
          setError('Connection lost. Please refresh the page.');
        }
      }

      // Schedule next poll with exponential backoff on errors
      const delay = consecutiveErrors > 0 
        ? Math.min(RETRY_DELAY * Math.pow(1.5, consecutiveErrors), 10000) // Max 10s delay
        : POLL_INTERVAL;
      timeoutId = setTimeout(poll, delay);
    };

    // Start polling
    poll().catch(e => {
      if (!isMounted) return;
      console.error('Polling error:', e);
      setError('Connection error. Please refresh the page.');
      setIsPolling(false);
    });

    // Cleanup
    return () => {
      isMounted = false;
      setIsPolling(false);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [roomId, isPolling, consecutiveErrors, retryCount]);

  const makeRequest = async (endpoint: string, data: RequestData): Promise<void> => {
    try {
      const response = await fetchWithTimeout(
        `/api/rooms/${roomId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        },
        REQUEST_TIMEOUT
      );

      if (!response.ok) {
        throw new Error(`Request failed: ${response.statusText}`);
      }

      setError(null);
      await response.json();
    } catch (e) {
      const errorMessage = e instanceof NetworkError
        ? (e.isTimeout ? 'Request timed out. Please try again.' : e.message)
        : e instanceof Error 
          ? e.message 
          : String(e);
      setError(errorMessage);
      // Don't rethrow the error, just set the error state
    }
  };

  const join = useCallback(async () => {
    try {
      await makeRequest('join', { 
        action: 'join', 
        playerId, 
        playerName, 
        targetScore 
      });
    } catch (e) {
      // Error is already handled in makeRequest
      console.error('Join error:', e);
    }
  }, [roomId, playerId, playerName, targetScore]);

  const markReady = useCallback(async () => {
    try {
      await makeRequest('ready', { 
        action: 'ready', 
        playerId 
      });
    } catch (e) {
      // Error is already handled in makeRequest
      console.error('Mark ready error:', e);
    }
  }, [roomId, playerId]);

  const submitSolution = useCallback(
    async (solution: string) => {
      try {
        await makeRequest('submit', { 
          action: 'submit', 
          playerId, 
          solution 
        });
      } catch (e) {
        // Error is already handled in makeRequest
        console.error('Submit solution error:', e);
      }
    },
    [roomId, playerId]
  );

  return { state, playerId, error, join, markReady, submitSolution };
}