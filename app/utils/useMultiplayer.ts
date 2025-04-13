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
  const socketRef = useRef<{ roomIds: string[] }>({ roomIds: [] });

  // Initialize socket connection
  useEffect(() => {
    // Create socket only on client side
    if (typeof window === 'undefined') return;

    // Initialize the socket API first
    fetch('/api/socket')
      .then(() => {
        // Connect to the standalone Socket.IO server
        const socketInstance = io('http://localhost:3001', {
          path: '/api/socket',
          transports: ['websocket', 'polling'], // Try WebSocket first, fall back to polling
          reconnectionAttempts: 5,
          reconnectionDelay: 1000,
          timeout: 10000, // Increase timeout to handle potential connection issues
        });

        setSocket(socketInstance);

        // Socket connection handlers
        socketInstance.on('connect', () => {
          console.log('Socket connected successfully');
          setIsConnected(true);
          setError(null);
          
          // Start heartbeat when connected
          startHeartbeat(socketInstance);
        });

        socketInstance.on('connect_error', (err) => {
          console.error('Socket connection error:', err);
          setIsConnected(false);
          setError(`Connection error: ${err.message}`);
          
          // Stop heartbeat on error
          stopHeartbeat();
        });

        socketInstance.on('disconnect', (reason) => {
          console.log('Socket disconnected:', reason);
          setIsConnected(false);
          
          // Stop heartbeat when disconnected
          stopHeartbeat();
        });

        // Pong response
        socketInstance.on('pong', () => {
          console.log('Heartbeat pong received');
        });

        // Game state update handlers
        socketInstance.on('room-update', (data) => {
          console.log('Room update received:', data);
          setGameState((prev) => ({
            ...prev,
            roomId: data.roomId,
            players: data.players,
            currentPuzzle: data.currentPuzzle,
            isActive: data.isActive,
            targetScore: data.targetScore,
            winner: data.winner,
            creatorId: data.creatorId
          }));
          setIsLoading(false);
        });

        socketInstance.on('game-start', (data) => {
          console.log('Game start event received:', data);
          setGameState((prev) => ({
            ...prev,
            players: data.players,
            currentPuzzle: data.currentPuzzle,
            isActive: true,
            startTime: data.startTime,
            targetScore: data.targetScore,
            lastSolution: undefined,
          }));
        });

        socketInstance.on('player-solved', (data) => {
          console.log('Player solved event received:', data);
          setGameState((prev) => ({
            ...prev,
            lastSolution: {
              playerId: data.playerId,
              playerName: data.playerName,
              solution: data.solution,
              time: data.time,
              score: data.score || 0
            },
            winner: data.winner
          }));
        });

        socketInstance.on('new-puzzle', (data) => {
          console.log('New puzzle event received:', data);
          setGameState((prev) => ({
            ...prev,
            players: data.players,
            currentPuzzle: data.currentPuzzle,
            lastSolution: undefined,
          }));
        });

        // Handle game over event
        socketInstance.on('game-over', (data) => {
          console.log('Game over event received:', data);
          setGameState((prev) => ({
            ...prev,
            gameOver: true,
            isActive: false,
            winnerDetails: data.winner,
            players: data.players,
            winner: data.winner?.id
          }));
        });

        return () => {
          console.log('Cleaning up socket connection');
          stopHeartbeat();
          socketInstance.disconnect();
        };
      })
      .catch((err) => {
        console.error('Failed to initialize socket:', err);
        setError(`Failed to initialize socket: ${err.message}`);
      });
  }, []);

  // Heartbeat functions to keep connection alive
  const startHeartbeat = (socketInstance: Socket) => {
    stopHeartbeat(); // Clear any existing interval
    
    // Send a ping every 20 seconds
    heartbeatRef.current = setInterval(() => {
      if (socketInstance.connected) {
        console.log('Sending heartbeat ping');
        socketInstance.emit('ping');
      }
    }, 20000);
  };

  const stopHeartbeat = () => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  };

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