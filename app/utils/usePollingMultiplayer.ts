import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Solver } from './solver';

const MAX_RETRIES = 5;
const RETRY_DELAY = 2000; // 2 seconds
const POLL_INTERVAL = 1000; // 1 second
const REQUEST_TIMEOUT = 5000; // 5 seconds

// Create an in-memory fallback store for when Redis is not available
const localRoomStore: Record<string, GameState> = {};

async function fetchState(roomId: string, retryCount = 0): Promise<GameState> {
  try {
    const res = await fetchWithTimeout(
      `/api/rooms/${roomId}`,
      { method: 'GET' },
      REQUEST_TIMEOUT
    );

    if (!res.ok) {
      // Handle specific error cases
      if (res.status === 503) {
        // Database connection error - use local fallback
        console.warn('Using local fallback due to database connection error');
        return getLocalState(roomId);
      }
      
      if (res.status === 504 && retryCount < MAX_RETRIES) {
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return fetchState(roomId, retryCount + 1);
      }
      
      const errorData = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(`Failed to fetch game state: ${errorData.error || res.statusText}`);
    }
    
    const state = await res.json();
    // Store successful state in local store as fallback
    localRoomStore[roomId] = state;
    return state;
  } catch (error) {
    if (error instanceof NetworkError && error.isTimeout && retryCount < MAX_RETRIES) {
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return fetchState(roomId, retryCount + 1);
    }
    
    // After all retries, use local state as fallback if it exists
    if (retryCount >= MAX_RETRIES && localRoomStore[roomId]) {
      console.warn('Using local fallback after max retries');
      return getLocalState(roomId);
    }
    
    throw error;
  }
}

// Get or create local state
function getLocalState(roomId: string, targetScore?: number): GameState {
  if (!localRoomStore[roomId]) {
    const initialQueue = Array.from({ length: 10 }, () => Solver.generatePuzzle());
    localRoomStore[roomId] = {
      roomId,
      playerId: '', // Will be filled in by the hook
      creatorId: '',
      players: [],
      isActive: false,
      currentPuzzle: initialQueue[0],
      puzzleQueue: initialQueue.slice(1),
      targetScore: targetScore ?? 5,
      gameOver: false,
      winner: null,
      winnerDetails: null,
      lastSolution: null
    };
  }
  return localRoomStore[roomId];
}

// Update local state (for fallback mode)
function updateLocalState(roomId: string, updates: Partial<GameState>): GameState {
  const current = getLocalState(roomId);
  const updated = { ...current, ...updates };
  localRoomStore[roomId] = updated;
  return updated;
}

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
  puzzleQueue: number[][];
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
  const [useLocalMode, setUseLocalMode] = useState(false);

  // Poll loop
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let isMounted = true;

    const poll = async () => {
      if (!isPolling || !isMounted) return;

      try {
        // In local fallback mode, don't try to fetch from server again
        let s: GameState;
        if (useLocalMode) {
          s = getLocalState(roomId);
        } else {
          s = await fetchState(roomId, retryCount);
        }
        
        if (!isMounted) return;
        
        // Ensure playerId is set in state
        if (s.playerId === '') {
          s.playerId = playerId;
        }
        
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

        // Switch to local mode after too many consecutive errors
        if (consecutiveErrors >= MAX_RETRIES) {
          console.warn('Switching to local fallback mode after too many errors');
          setUseLocalMode(true);
          if (!localRoomStore[roomId]) {
            // Initialize local state for this room
            getLocalState(roomId, targetScore);
          }
        }
      }

      // Schedule next poll with exponential backoff on errors
      const delay = useLocalMode 
        ? POLL_INTERVAL
        : consecutiveErrors > 0 
          ? Math.min(RETRY_DELAY * Math.pow(1.5, consecutiveErrors), 10000)
          : POLL_INTERVAL;
      
      timeoutId = setTimeout(poll, delay);
    };

    // Start polling
    poll().catch(e => {
      if (!isMounted) return;
      console.error('Polling error:', e);
      setError('Connection error. Switching to local mode.');
      setUseLocalMode(true);
    });

    // Cleanup
    return () => {
      isMounted = false;
      setIsPolling(false);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [roomId, isPolling, consecutiveErrors, retryCount, useLocalMode, playerId, targetScore]);

  const makeRequest = async (endpoint: string, data: RequestData): Promise<void> => {
    try {
      // If in local mode, handle operations locally
      if (useLocalMode) {
        handleLocalRequest(roomId, data);
        return;
      }
      
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
        // If database connection error, switch to local mode
        if (response.status === 503) {
          setUseLocalMode(true);
          handleLocalRequest(roomId, data);
          return;
        }
        
        throw new Error(`Request failed: ${response.statusText}`);
      }

      setError(null);
      const responseData = await response.json();
      
      // Update local store with latest state
      localRoomStore[roomId] = responseData;
    } catch (e) {
      const errorMessage = e instanceof NetworkError
        ? (e.isTimeout ? 'Request timed out. Switching to local mode.' : e.message)
        : e instanceof Error 
          ? e.message 
          : String(e);
          
      setError(errorMessage);
      
      // Switch to local mode on error
      setUseLocalMode(true);
      handleLocalRequest(roomId, data);
    }
  };

  // Handle requests locally when in fallback mode
  const handleLocalRequest = (roomId: string, data: RequestData): void => {
    const { action, playerId, playerName, targetScore: newTargetScore, solution } = data;
    const state = getLocalState(roomId, targetScore);
    
    if (action === 'join') {
      const existingPlayerIndex = state.players.findIndex(p => p.id === playerId);
      if (existingPlayerIndex >= 0) {
        state.players[existingPlayerIndex].name = playerName || 'Anonymous';
        state.players[existingPlayerIndex].ready = false;
      } else {
        state.players.push({
          id: playerId,
          name: playerName || 'Anonymous',
          ready: false,
          score: 0
        });
      }
      if (!state.creatorId && state.players.length === 1) {
        state.creatorId = playerId;
      }
      if (newTargetScore) {
        state.targetScore = newTargetScore;
      }
    }
    else if (action === 'ready') {
      const playerIndex = state.players.findIndex(p => p.id === playerId);
      if (playerIndex >= 0) {
        state.players[playerIndex].ready = true;
        
        // Start game if all players are ready
        const canStart = state.players.length >= 2 && state.players.every(p => p.ready);
        if (canStart && !state.isActive) {
          state.isActive = true;
          if (state.puzzleQueue.length === 0) {
            state.puzzleQueue = Array.from({ length: 10 }, () => Solver.generatePuzzle());
          }
          state.currentPuzzle = state.puzzleQueue.shift() || Solver.generatePuzzle();
        }
      }
    }
    else if (action === 'submit') {
      const playerIndex = state.players.findIndex(p => p.id === playerId);
      if (playerIndex >= 0 && state.isActive && !state.gameOver) {
        const player = state.players[playerIndex];
        player.score += 1;
        
        state.lastSolution = {
          playerName: player.name,
          solution: solution || '24',
          time: Date.now()
        };
        
        if (player.score >= state.targetScore) {
          state.gameOver = true;
          state.winner = playerId;
          state.winnerDetails = { ...player };
          state.isActive = false;
        } else {
          if (state.puzzleQueue.length === 0) {
            state.puzzleQueue.push(Solver.generatePuzzle());
          }
          state.currentPuzzle = state.puzzleQueue.shift() || Solver.generatePuzzle();
          state.puzzleQueue.push(Solver.generatePuzzle());
        }
      }
    }
    
    // Update local store
    updateLocalState(roomId, state);
    setState(state);
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