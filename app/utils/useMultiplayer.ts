'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

type Player = {
  id: string;
  name: string;
  score: number;
  ready: boolean;
};

type GameState = {
  roomId: string;
  players: Player[];
  currentPuzzle: number[];
  isActive: boolean;
  targetScore: number;
  winner?: string;
  startTime?: number;
  creatorId?: string;
  lastSolution?: {
    playerId: string;
    playerName: string;
    solution: string;
    time: number;
    score: number;
  };
  gameOver?: boolean;
  winnerDetails?: Player;
};

type UseMultiplayerReturn = {
  gameState: GameState;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  socket: Socket | null;
  joinRoom: (roomId: string, playerName: string, targetScore?: number) => void;
  markReady: () => void;
  submitSolution: (solution: string) => void;
};

const initialGameState: GameState = {
  roomId: '',
  players: [],
  currentPuzzle: [],
  isActive: false,
  targetScore: 5,
};

export function useMultiplayer(): UseMultiplayerReturn {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState>(initialGameState);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);

  // Heartbeat functions to keep connection alive
  const startHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
    }
    heartbeatRef.current = setInterval(() => {
      if (socket?.connected) {
        socket.emit('ping');
      }
    }, 30000);
  }, [socket]);

  const stopHeartbeat = () => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
    }
  };

  // Initialize socket connection
  useEffect(() => {
    const socketInstance = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001', {
      path: '/api/socket',
    });

    socketInstance.on('connect', () => {
      setIsConnected(true);
      startHeartbeat();
    });

    socketInstance.on('disconnect', () => {
      setIsConnected(false);
      stopHeartbeat();
    });

    // Add game state update handlers
    socketInstance.on('room-update', (state: GameState) => {
      setGameState(state);
      setIsLoading(false);
    });

    socketInstance.on('game-start', (state: GameState) => {
      setGameState(state);
    });

    socketInstance.on('new-puzzle', (state: GameState) => {
      setGameState(state);
    });

    socketInstance.on('player-solved', (data: GameState['lastSolution']) => {
      setGameState(prev => ({
        ...prev,
        lastSolution: data
      }));
    });

    socketInstance.on('game-over', (data: { winner: Player; players: Player[] }) => {
      setGameState(prev => ({
        ...prev,
        isActive: false,
        gameOver: true,
        winner: data.winner.id,
        winnerDetails: data.winner,
        players: data.players
      }));
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [startHeartbeat]);

  // Join a game room
  const joinRoom = useCallback(
    (roomId: string, playerName: string, targetScore: number = 5) => {
      if (!socket || !isConnected) {
        setError('Socket not connected');
        return;
      }

      console.log('Joining room with targetScore:', targetScore);
      setIsLoading(true);
      
      // Ensure targetScore is a valid number between 1 and 10
      const finalTargetScore = typeof targetScore === 'number' && !isNaN(targetScore) && targetScore >= 1 && targetScore <= 10
        ? targetScore
        : 5;
      
      // Always send targetScore to the server
      socket.emit('join-room', { 
        roomId, 
        playerName, 
        targetScore: finalTargetScore
      });

      // We don't update the local game state here anymore
      // Instead, we wait for the room-update event from the server
      // This ensures all clients have the same target score
    },
    [socket, isConnected]
  );

  // Mark player as ready
  const markReady = useCallback(() => {
    if (!socket || !isConnected || !gameState.roomId) {
      setError('Socket not connected or not in a room');
      return;
    }

    socket.emit('player-ready');
  }, [socket, isConnected, gameState.roomId]);

  // Submit a solution
  const submitSolution = useCallback(
    (solution: string) => {
      if (!socket || !isConnected || !gameState.roomId || !gameState.isActive) {
        setError('Cannot submit solution - not in an active game');
        return;
      }

      const time = gameState.startTime ? Date.now() - gameState.startTime : 0;
      socket.emit('puzzle-solved', { solution, time });
    },
    [socket, isConnected, gameState.roomId, gameState.isActive, gameState.startTime]
  );

  useEffect(() => {
    startHeartbeat();
    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
    };
  }, [startHeartbeat]);

  return {
    gameState,
    isConnected,
    isLoading,
    error,
    socket,
    joinRoom,
    markReady,
    submitSolution,
  };
} 