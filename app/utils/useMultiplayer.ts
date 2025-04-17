// utils/useMultiplayer.ts
import { useState, useEffect, useCallback, useRef } from "react";
import { io, Socket } from "socket.io-client";

// Game state type
type GameState = {
  roomId: string;
  creatorId: string;
  players: Player[];
  isActive: boolean;
  currentPuzzle: number[];
  targetScore: number;
  gameOver: boolean;
  winner: string | null;
  winnerDetails: Player | null;
  lastSolution: {
    playerName: string;
    solution: string;
    time: number;
  } | null;
};

// Player type
type Player = {
  id: string;
  name: string;
  ready: boolean;
  score: number;
};

// Initial game state
const initialGameState: GameState = {
  roomId: "",
  creatorId: "",
  players: [],
  isActive: false,
  currentPuzzle: [],
  targetScore: 5,
  gameOver: false,
  winner: null,
  winnerDetails: null,
  lastSolution: null,
};

export function useMultiplayer() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState>(initialGameState);

  // Connect to socket server
  useEffect(() => {
    // Determine the socket URL based on the environment
    const socketUrl = typeof window !== 'undefined' 
      ? window.location.origin 
      : 'http://localhost:3000';
    
    console.log("Connecting to socket server at:", socketUrl);
    
    const socketInstance = io(socketUrl, {
      path: "/api/socket",
      addTrailingSlash: false,
    });

    // Socket event handlers
    socketInstance.on("connect", () => {
      console.log("Socket connected:", socketInstance.id);
      setIsConnected(true);
      setError(null);
    });

    socketInstance.on("connect_error", (err) => {
      console.error("Socket connection error:", err);
      setIsConnected(false);
      setError(`Connection error: ${err.message}`);
    });

    socketInstance.on("disconnect", (reason) => {
      console.log("Socket disconnected:", reason);
      setIsConnected(false);
      if (reason === "io server disconnect") {
        // The server has forcefully disconnected the socket
        setError("Disconnected by server. Please refresh the page.");
      } else {
        setError("Connection lost. Attempting to reconnect...");
      }
    });

    socketInstance.on("error", (err) => {
      console.error("Socket error:", err);
      setError(`Socket error: ${err.message || "Unknown error"}`);
    });

    // Set socket instance
    setSocket(socketInstance);

    // Clean up on unmount
    return () => {
      console.log("Cleaning up socket connection");
      socketInstance.disconnect();
    };
  }, []);

  // Game state update handler
  useEffect(() => {
    if (!socket) return;

    const handleGameStateUpdate = (updatedState: GameState) => {
      console.log("Game state updated:", updatedState);
      setGameState(updatedState);
      
      // If the game becomes active, stop loading
      if (updatedState.isActive) {
        setIsLoading(false);
      }
    };

    socket.on("game_state_update", handleGameStateUpdate);

    return () => {
      socket.off("game_state_update", handleGameStateUpdate);
    };
  }, [socket]);

  // Join room function
  const joinRoom = useCallback(
    (roomId: string, playerName: string, targetScore: number = 5) => {
      if (!socket || !isConnected) {
        setError("Not connected to server");
        return;
      }

      setIsLoading(true);
      setError(null);

      console.log("Joining room:", roomId, "as", playerName, "with target score:", targetScore);
      
      socket.emit("join_room", { roomId, playerName, targetScore });
    },
    [socket, isConnected]
  );

  // Mark player as ready
  const markReady = useCallback(() => {
    if (!socket || !isConnected || !gameState.roomId) {
      setError("Not connected to a room");
      return;
    }

    console.log("Marking player as ready");
    socket.emit("player_ready", { roomId: gameState.roomId });
  }, [socket, isConnected, gameState.roomId]);

  // Submit solution
  const submitSolution = useCallback(
    (solution: string) => {
      if (!socket || !isConnected || !gameState.roomId || !gameState.isActive) {
        setError("Not in an active game");
        return;
      }

      console.log("Submitting solution:", solution);
      socket.emit("submit_solution", {
        roomId: gameState.roomId,
        solution,
      });
    },
    [socket, isConnected, gameState.roomId, gameState.isActive]
  );

  // Custom event emitter
  const emitCustomEvent = useCallback(
    (eventName: string, data: any) => {
      if (!socket || !isConnected) {
        setError("Not connected to server");
        return;
      }

      console.log(`Emitting custom event: ${eventName}`, data);
      socket.emit(eventName, data);
    },
    [socket, isConnected]
  );

  // Custom event listener
  const onCustomEvent = useCallback(
    (eventName: string, callback: (data: any) => void) => {
      if (!socket) return () => {};

      console.log(`Setting up listener for custom event: ${eventName}`);
      socket.on(eventName, callback);

      return () => {
        socket.off(eventName, callback);
      };
    },
    [socket]
  );

  return {
    socket,
    isConnected,
    isLoading,
    error,
    gameState,
    joinRoom,
    markReady,
    submitSolution,
    emitCustomEvent,
    onCustomEvent,
  };
}