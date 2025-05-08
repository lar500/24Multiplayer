import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Solver } from './solver';

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const POLL_INTERVAL = 500;
const REQUEST_TIMEOUT = 5000;
const INITIAL_POLL_DELAY = 100;

// Create an in-memory fallback store for when Redis is not available
const localRoomStore: Record<string, GameState> = {};

// Request queue to prevent concurrent requests
type FetchQueueEntry = {
  promise: Promise<GameState>;
  timestamp: number;
  isPending: boolean;
};

type ActionQueueEntry = {
  promise: Promise<void>;
  timestamp: number;
  isPending: boolean;
};

const fetchQueue: Record<string, FetchQueueEntry | undefined> = {};
const actionQueue: Record<string, ActionQueueEntry | undefined> = {};

async function fetchState(roomId: string, retryCount = 0): Promise<GameState> {
  const requestKey = `fetch_${roomId}`;
  
  // If there's already a request in progress, wait for it
  const existingRequest = fetchQueue[requestKey];
  if (existingRequest?.isPending) {
    console.log(`[fetchState] Waiting for existing request for room ${roomId}`);
    return existingRequest.promise;
  }

  // Create new request
  const promise = (async () => {
    try {
      console.log(`[fetchState] Attempting to fetch state for room ${roomId}, retry ${retryCount}`);
      const res = await fetchWithTimeout(
        `/api/rooms/${roomId}`,
        { method: 'GET' },
        REQUEST_TIMEOUT
      );

      console.log(`[fetchState] Response status: ${res.status}`);
      if (!res.ok) {
        // Handle specific error cases
        if (res.status === 503) {
          console.warn('[fetchState] Database connection error, using local fallback');
          return getLocalState(roomId);
        }
        
        if (res.status === 504 && retryCount < MAX_RETRIES) {
          console.log(`[fetchState] Gateway timeout, retrying in ${RETRY_DELAY}ms`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
          return fetchState(roomId, retryCount + 1);
        }
        
        const errorData = await res.json().catch(() => ({ error: res.statusText }));
        console.error('[fetchState] Error response:', errorData);
        throw new Error(`Failed to fetch game state: ${errorData.error || res.statusText}`);
      }
      
      const state = await res.json();
      console.log('[fetchState] Successfully fetched state:', state);
      // Store successful state in local store as fallback
      localRoomStore[roomId] = state;
      return state;
    } catch (error) {
      console.error('[fetchState] Error:', error);
      if (error instanceof NetworkError && error.isTimeout && retryCount < MAX_RETRIES) {
        console.log(`[fetchState] Network timeout, retrying in ${RETRY_DELAY}ms`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return fetchState(roomId, retryCount + 1);
      }
      
      // After all retries, use local state as fallback if it exists
      if (retryCount >= MAX_RETRIES && localRoomStore[roomId]) {
        console.warn('[fetchState] Using local fallback after max retries');
        return getLocalState(roomId);
      }
      
      throw error;
    } finally {
      // Clear the request from queue
      delete fetchQueue[requestKey];
    }
  })();

  fetchQueue[requestKey] = { promise, timestamp: Date.now(), isPending: true };
  return promise;
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

interface Player {
  id: string;
  name: string;
  ready: boolean;
  solution: string | null;
  score?: number;
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

// Helper function to safely access localStorage
const getStoredPlayerId = (roomId: string): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(`playerId_${roomId}`);
};

const setStoredPlayerId = (roomId: string, playerId: string): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`playerId_${roomId}`, playerId);
};

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
  // Use localStorage to persist playerId, with SSR safety
  const [playerId] = useState(() => {
    const storedId = getStoredPlayerId(roomId);
    if (storedId) return storedId;
    const newId = uuidv4();
    setStoredPlayerId(roomId, newId);
    return newId;
  });

  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(true);
  const [consecutiveErrors, setConsecutiveErrors] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const [useLocalMode, setUseLocalMode] = useState(false);
  const [isInitialPoll, setIsInitialPoll] = useState(true);
  const [successfulPolls, setSuccessfulPolls] = useState(0);
  const [isJoining, setIsJoining] = useState(false);
  const [lastStateUpdate, setLastStateUpdate] = useState(0);

  // Validate playerName
  useEffect(() => {
    if (!playerName || playerName.trim() === '') {
      setError('Player name is required');
    } else {
      setError(null);
    }
  }, [playerName]);

  const handleLocalRequest = useCallback((roomId: string, data: RequestData) => {
    console.log('[handleLocalRequest] Processing local request:', data);
    const currentState = localRoomStore[roomId] || { players: [] };
    
    switch (data.action) {
      case 'join':
        if (!currentState.players.find(p => p.id === data.playerId)) {
          currentState.players.push({
            id: data.playerId,
            name: data.playerName || 'Anonymous',
            ready: false,
            solution: null
          });
        }
        break;
      case 'ready':
        const player = currentState.players.find(p => p.id === data.playerId);
        if (player) {
          player.ready = true;
        }
        break;
      case 'submit':
        const submittingPlayer = currentState.players.find(p => p.id === data.playerId);
        if (submittingPlayer) {
          submittingPlayer.solution = data.solution || null;
        }
        break;
    }
    
    localRoomStore[roomId] = currentState;
    setState(currentState);
    setLastStateUpdate(Date.now());
  }, []);

  const makeRequest = useCallback(async (_endpoint: string, data: RequestData): Promise<void> => {
    const requestKey = `${data.action}_${roomId}_${data.playerId}`;
    
    // If there's already a request in progress, wait for it
    const existingRequest = actionQueue[requestKey];
    if (existingRequest?.isPending) {
      console.log(`[makeRequest] Waiting for existing ${data.action} request`);
      return existingRequest.promise;
    }

    // Create new request
    const promise = (async () => {
      console.log(`[makeRequest] Making ${data.action} request:`, data);
      try {
        // Only use local mode if we've explicitly switched to it
        if (useLocalMode && successfulPolls > 0) {
          console.log('[makeRequest] Using local mode');
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

        console.log(`[makeRequest] Response status: ${response.status}`);
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: response.statusText }));
          const errorMessage = errorData.error || response.statusText;
          console.error('[makeRequest] Error response:', errorData);
          
          // Handle specific error cases
          if (response.status === 400) {
            // For validation errors, show the specific error message
            throw new Error(errorMessage);
          }
          
          // Only switch to local mode if we've had successful polls before
          if (response.status === 503 && successfulPolls > 0) {
            console.log('[makeRequest] Switching to local mode');
            setUseLocalMode(true);
            handleLocalRequest(roomId, data);
            return;
          }
          
          throw new Error(`Request failed: ${errorMessage}`);
        }

        setError(null);
        const responseData = await response.json();
        console.log('[makeRequest] Success response:', responseData);
        
        // Update local store with latest state
        if (responseData && responseData.players) {
          localRoomStore[roomId] = responseData;
          setSuccessfulPolls(prev => prev + 1);
          setState(responseData);
          setLastStateUpdate(Date.now());
        }
        return responseData;
      } catch (e) {
        console.error('[makeRequest] Error:', e);
        const errorMessage = e instanceof NetworkError
          ? (e.isTimeout ? 'Request timed out. Retrying...' : e.message)
          : e instanceof Error 
            ? e.message 
            : String(e);
          
        setError(errorMessage);
        
        // Only switch to local mode if we've had successful polls before
        if (successfulPolls > 0) {
          console.log('[makeRequest] Switching to local mode after error');
          setUseLocalMode(true);
          handleLocalRequest(roomId, data);
        }
        throw e; // Re-throw to be handled by the caller
      } finally {
        // Clear the request from queue
        delete actionQueue[requestKey];
      }
    })();

    actionQueue[requestKey] = { promise, timestamp: Date.now(), isPending: true };
    return promise;
  }, [roomId, useLocalMode, successfulPolls, handleLocalRequest]);

  const join = useCallback(async () => {
    if (isJoining) return;
    if (!playerName || playerName.trim() === '') {
      setError('Player name is required');
      return;
    }
    
    setIsJoining(true);
    try {
      console.log('[join] Starting join process for player:', { playerId, playerName });
      
      // First make the join request
      const joinResponse = await makeRequest('join', { 
        action: 'join', 
        playerId, 
        playerName: playerName.trim(), 
        targetScore,
      });
      
      console.log('[join] Join request successful:', joinResponse);
      
      // Then fetch the fresh state
      const fresh = await fetchState(roomId);
      console.log('[join] Fresh state after join:', fresh);
      
      // Update local state
      setState(fresh);
      setLastStateUpdate(Date.now());
      setError(null);
      
      // Ensure we're in the players list
      const playerInState = fresh.players.find(p => p.id === playerId);
      if (!playerInState) {
        console.error('[join] Player not found in state after join. State:', fresh);
        // Try one more time with a delay
        await new Promise(resolve => setTimeout(resolve, 500));
        const retryFresh = await fetchState(roomId);
        const retryPlayerInState = retryFresh.players.find(p => p.id === playerId);
        if (!retryPlayerInState) {
          throw new Error('Failed to join room: Player not found in state');
        }
        setState(retryFresh);
        setLastStateUpdate(Date.now());
      }
      
      console.log('[join] Successfully joined room:', { 
        playerId, 
        playerName, 
        playersInRoom: fresh.players 
      });
      
    } catch (e) {
      console.error('[join] Join error:', e);
      const errorMessage = e instanceof Error ? e.message : 'Failed to join room';
      setError(errorMessage);
      // Clear any potentially corrupted state
      setState(null);
    } finally {
      setIsJoining(false);
    }
  }, [roomId, playerId, playerName, targetScore, isJoining, makeRequest]);

  // Poll loop
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let isMounted = true;
    let pollCount = 0;
    let initialConnectionAttempts = 0;
    const MAX_INITIAL_ATTEMPTS = 5;

    const poll = async () => {
      if (!isPolling || !isMounted) return;
      pollCount++;
      console.log(`[poll] Starting poll #${pollCount} for room ${roomId}`);

      try {
        // In local fallback mode, don't try to fetch from server again
        let s: GameState;
        if (useLocalMode) {
          console.log('[poll] Using local mode');
          s = getLocalState(roomId);
        } else {
          console.log('[poll] Fetching from server');
          s = await fetchState(roomId, retryCount);
          
          // If this is an initial connection attempt, increment counter
          if (isInitialPoll) {
            initialConnectionAttempts++;
            if (initialConnectionAttempts >= MAX_INITIAL_ATTEMPTS) {
              console.warn('[poll] Max initial connection attempts reached, switching to local mode');
              setUseLocalMode(true);
              s = getLocalState(roomId);
            }
          }
        }
        
        if (!isMounted) {
          console.log('[poll] Component unmounted, stopping poll');
          return;
        }
        
        console.log('[poll] Received state:', s);
        
        // Update state with current player info
        const currentPlayer = s.players.find(p => p.id === playerId);
        if (currentPlayer) {
          console.log('[poll] Found current player:', currentPlayer);
          // If player exists in state, ensure their name is up to date
          if (currentPlayer.name !== playerName) {
            console.log('[poll] Updating player name');
            currentPlayer.name = playerName;
          }
        } else {
          console.log('[poll] Current player not found in state');
          // If we're not in local mode and player is not found, try to rejoin
          if (!useLocalMode && !isJoining) {
            console.log('[poll] Attempting to rejoin');
            try {
              await join();
              // After rejoining, fetch fresh state
              s = await fetchState(roomId);
            } catch (e) {
              console.error('[poll] Rejoin failed:', e);
              // Don't throw here, just continue with current state
            }
          }
        }
        
        // Only update state if it's newer than our last update or if we have no state
        const stateTimestamp = s.lastSolution?.time || Date.now();
        if (!state || stateTimestamp > lastStateUpdate) {
          console.log('[poll] Updating state with new data');
          setState(s);
          setLastStateUpdate(stateTimestamp);
          setError(null);
          setConsecutiveErrors(0);
          setRetryCount(0);
          setIsInitialPoll(false);
          setSuccessfulPolls(prev => prev + 1);
        } else {
          console.log('[poll] State is up to date, skipping update');
        }

        // Stop polling if game is over
        if (s.gameOver) {
          console.log('[poll] Game over, stopping poll');
          setIsPolling(false);
        }
      } catch (e) {
        if (!isMounted) return;
        
        console.error('[poll] Error during poll:', e);
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

        // Only switch to local mode if we've had multiple consecutive errors
        // and we haven't had any successful polls yet
        if (consecutiveErrors >= MAX_RETRIES && successfulPolls === 0) {
          console.warn('[poll] Switching to local fallback mode after too many errors');
          setUseLocalMode(true);
          if (!localRoomStore[roomId]) {
            // Initialize local state for this room
            getLocalState(roomId, targetScore);
          }
        }
      }

      // Schedule next poll with faster initial poll
      const delay = useLocalMode 
        ? POLL_INTERVAL
        : isInitialPoll
          ? INITIAL_POLL_DELAY
          : consecutiveErrors > 0 
            ? Math.min(RETRY_DELAY * Math.pow(1.5, consecutiveErrors), 5000)
            : POLL_INTERVAL;
      
      console.log(`[poll] Scheduling next poll in ${delay}ms`);
      timeoutId = setTimeout(poll, delay);
    };

    // Start polling
    console.log('[useEffect] Starting initial poll');
    poll().catch(e => {
      if (!isMounted) return;
      console.error('[useEffect] Polling error:', e);
      // Only switch to local mode if we haven't had any successful polls
      if (successfulPolls === 0) {
        setError('Connection error. Switching to local mode.');
        setUseLocalMode(true);
      }
    });

    // Cleanup
    return () => {
      console.log('[useEffect] Cleaning up poll');
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [
    roomId, 
    isPolling, 
    useLocalMode, 
    join, 
    isJoining, 
    lastStateUpdate,
    consecutiveErrors,
    isInitialPoll,
    playerId,
    playerName,
    retryCount,
    successfulPolls,
    targetScore
  ]);

  const markReady = useCallback(async () => {
    if (!state?.players.find(p => p.id === playerId)) {
      setError('You must join the room first');
      return;
    }
    try {
      await makeRequest('ready', { 
        action: 'ready', 
        playerId 
      });
    } catch (e) {
      console.error('Mark ready error:', e);
    }
  }, [state, playerId, makeRequest]);

  const submitSolution = useCallback(
    async (solution: string) => {
      if (!state?.players.find(p => p.id === playerId)) {
        setError('You must join the room first');
        return;
      }
      try {
        await makeRequest('submit', { 
          action: 'submit', 
          playerId, 
          solution 
        });
      } catch (e) {
        console.error('Submit solution error:', e);
      }
    },
    [state, playerId, makeRequest]
  );

  // Auto-join when component mounts
  useEffect(() => {
    if (!state && !isJoining && playerName && playerName.trim() !== '') {
      join();
    }
  }, [state, join, isJoining, playerName]);

  return { state, playerId, error, join, markReady, submitSolution };
}