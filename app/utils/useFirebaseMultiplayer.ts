import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { database } from './firebase';
import { ref, onValue, set, get } from 'firebase/database';
import { Solver } from './solver';

export interface Player {
  id: string;
  name: string;
  ready: boolean;
  score: number;
}

export interface GameState {
  roomId: string;
  players: Player[];
  isActive: boolean;
  currentPuzzle: number[];
  puzzleQueue: number[][];
  targetScore: number;
  gameOver: boolean;
  winner: string | null;
  winnerDetails: Player | null;
  lastSolution: { playerName: string; solution: string; time: number } | null;
  puzzleStartTime: number | null;
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

export function useFirebaseMultiplayer(
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
  const [isJoining, setIsJoining] = useState(false);

  // Validate playerName
  useEffect(() => {
    if (!playerName || playerName.trim() === '') {
      setError('Player name is required');
    } else {
      setError(null);
    }
  }, [playerName]);

  // Listen for room updates
  useEffect(() => {
    const roomRef = ref(database, `rooms/${roomId}`);
    
    const unsubscribe = onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        console.log('[Firebase] Received room update:', data);
        setState(data);
        setError(null);
      } else {
        console.log('[Firebase] Room does not exist');
        setState(null);
      }
    }, (error) => {
      console.error('[Firebase] Error listening to room:', error);
      setError('Failed to connect to game room');
    });

    return () => {
      unsubscribe();
    };
  }, [roomId]);

  const join = useCallback(async () => {
    if (isJoining) return;
    if (!playerName || playerName.trim() === '') {
      setError('Player name is required');
      return;
    }
    
    setIsJoining(true);
    try {
      console.log('[join] Starting join process for player:', { playerId, playerName });
      
      const roomRef = ref(database, `rooms/${roomId}`);
      const snapshot = await get(roomRef);
      let currentState = snapshot.val();

      if (currentState) {
        // Room exists, check if player name is taken
        const nameTaken = currentState.players.some(
          (p: Player) => p.name === playerName && p.id !== playerId
        );
        if (nameTaken) {
          throw new Error('Player name is already taken');
        }

        // Check if game is in progress
        if (currentState.isActive) {
          throw new Error('Cannot join: Game is already in progress');
        }
        if (currentState.gameOver) {
          throw new Error('Cannot join: Game is over');
        }

        // Add or update player
        const playerIndex = currentState.players.findIndex((p: Player) => p.id === playerId);
        if (playerIndex >= 0) {
          currentState.players[playerIndex].name = playerName;
          currentState.players[playerIndex].ready = false;
        } else {
          currentState.players.push({
            id: playerId,
            name: playerName,
            ready: false,
            score: 0
          });
        }
      } else {
        // Create new room
        console.log('[join] Creating new room with target score:', targetScore, 'type:', typeof targetScore);
        const initialQueue = Array.from({ length: 10 }, () => Solver.generatePuzzle());
        const finalTargetScore = typeof targetScore === 'number' && targetScore > 0 ? targetScore : 5;
        console.log('[join] Using final target score:', finalTargetScore);
        currentState = {
          roomId,
          players: [{
            id: playerId,
            name: playerName,
            ready: false,
            score: 0
          }],
          isActive: false,
          currentPuzzle: initialQueue[0],
          puzzleQueue: initialQueue.slice(1),
          targetScore: finalTargetScore,
          gameOver: false,
          winner: null,
          winnerDetails: null,
          lastSolution: null,
          puzzleStartTime: null
        };
        console.log('[join] Created room state:', currentState);
        console.log('[join] Setting room state in Firebase with target score:', currentState.targetScore);
      }

      await set(roomRef, currentState);
      console.log('[join] Successfully joined room');
    } catch (e) {
      console.error('[join] Error:', e);
      setError(e instanceof Error ? e.message : 'Failed to join room');
    } finally {
      setIsJoining(false);
    }
  }, [roomId, playerId, playerName, targetScore, isJoining]);

  const markReady = useCallback(async () => {
    if (!state?.players.find(p => p.id === playerId)) {
      setError('You must join the room first');
      return;
    }

    try {
      const roomRef = ref(database, `rooms/${roomId}`);
      const snapshot = await get(roomRef);
      const currentState = snapshot.val();

      if (!currentState) {
        throw new Error('Room not found');
      }

      const playerIndex = currentState.players.findIndex((p: Player) => p.id === playerId);
      if (playerIndex < 0) {
        throw new Error('Player not found');
      }

      currentState.players[playerIndex].ready = true;

      // Check if game should start
      const canStart = currentState.players.length >= 2 && 
        currentState.players.every((p: Player) => p.ready);
      
      if (canStart && !currentState.isActive) {
        currentState.isActive = true;
        if (currentState.puzzleQueue.length === 0) {
          currentState.puzzleQueue = Array.from({ length: 10 }, () => Solver.generatePuzzle());
        }
        currentState.currentPuzzle = currentState.puzzleQueue.shift();
        currentState.puzzleStartTime = Date.now();
      }

      await set(roomRef, currentState);
    } catch (e) {
      console.error('[markReady] Error:', e);
      setError(e instanceof Error ? e.message : 'Failed to mark ready');
    }
  }, [roomId, playerId, state]);

  const submitSolution = useCallback(async (solution: string) => {
    if (!state?.players.find(p => p.id === playerId)) {
      setError('You must join the room first');
      return;
    }

    try {
      const roomRef = ref(database, `rooms/${roomId}`);
      const snapshot = await get(roomRef);
      const currentState = snapshot.val();

      if (!currentState) {
        throw new Error('Room not found');
      }

      const playerIndex = currentState.players.findIndex((p: Player) => p.id === playerId);
      if (playerIndex < 0) {
        throw new Error('Player not found');
      }

      if (!currentState.isActive || currentState.gameOver) {
        throw new Error('Game is not active or already over');
      }

      const player = currentState.players[playerIndex];
      player.score += 1;

      // Calculate elapsed time in milliseconds
      const elapsedTime = currentState.puzzleStartTime ? Date.now() - currentState.puzzleStartTime : 0;

      currentState.lastSolution = {
        playerName: player.name,
        solution,
        time: elapsedTime
      };

      // Reset puzzle start time for next puzzle
      currentState.puzzleStartTime = Date.now();

      if (player.score >= currentState.targetScore) {
        currentState.gameOver = true;
        currentState.winner = player.id;
        currentState.winnerDetails = { ...player };
        currentState.isActive = false;
      } else {
        if (currentState.puzzleQueue.length === 0) {
          currentState.puzzleQueue.push(Solver.generatePuzzle());
        }
        currentState.currentPuzzle = currentState.puzzleQueue.shift();
        currentState.puzzleQueue.push(Solver.generatePuzzle());
      }

      await set(roomRef, currentState);
    } catch (e) {
      console.error('[submitSolution] Error:', e);
      setError(e instanceof Error ? e.message : 'Failed to submit solution');
    }
  }, [roomId, playerId, state]);

  // Auto-join when component mounts
  useEffect(() => {
    if (!state && !isJoining && playerName && playerName.trim() !== '') {
      join();
    }
  }, [state, join, isJoining, playerName]);

  return { state, playerId, error, join, markReady, submitSolution };
} 