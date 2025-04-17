// app/api/socket/route.ts
import { Server as SocketIOServer } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import { NextResponse } from "next/server";
import { Solver } from "../../utils/solver";

// Helper function to get or create the Socket.io server
const getSocketIO = async (res: any) => {
  if (res.socket.server.io) {
    console.log("Socket.io server already running");
    return res.socket.server.io;
  }

  console.log("Setting up Socket.io server...");
  
  try {
    // Create Redis clients for the adapter
    const pubClient = createClient({ 
      url: process.env.REDIS_URL,
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 50, 1000)
      }
    });
    
    const subClient = pubClient.duplicate();

    // Handle Redis connection errors
    pubClient.on("error", (err) => {
      console.error("Redis pub client error:", err);
    });
    
    subClient.on("error", (err) => {
      console.error("Redis sub client error:", err);
    });

    // Connect to Redis
    await Promise.all([
      pubClient.connect(),
      subClient.connect()
    ]);
    
    console.log("Redis clients connected successfully");

    // Create Socket.io server with Redis adapter
    const io = new SocketIOServer(res.socket.server, {
      path: "/api/socket",
      addTrailingSlash: false,
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
      },
      adapter: createAdapter(pubClient, subClient),
      // Increase ping timeout and interval for better reliability
      pingTimeout: 60000,
      pingInterval: 25000
    });

    // Store rooms data
    const rooms = new Map();

    // Socket.io connection handler
    io.on("connection", (socket) => {
      console.log("Client connected:", socket.id);

      // Join room handler
      socket.on("join_room", ({ roomId, playerName, targetScore = 5 }) => {
        console.log(`${playerName} (${socket.id}) joining room ${roomId} with target score ${targetScore}`);
        
        let room = rooms.get(roomId);
        const isNewRoom = !room;
        
        // Create room if it doesn't exist
        if (isNewRoom) {
          room = {
            roomId,
            creatorId: socket.id,
            players: [],
            isActive: false,
            currentPuzzle: Solver.generatePuzzle(),
            targetScore: targetScore,
            gameOver: false,
            winner: null,
            winnerDetails: null,
            lastSolution: null,
            puzzleQueue: Array.from({ length: 10 }, () => Solver.generatePuzzle())
          };
          rooms.set(roomId, room);
          console.log(`Created new room ${roomId} with target score ${targetScore}`);
        }

        // Check if player is already in the room
        const existingPlayerIndex = room.players.findIndex((p: any) => p.id === socket.id);
        if (existingPlayerIndex >= 0) {
          // Update existing player
          room.players[existingPlayerIndex].name = playerName;
        } else {
          // Add new player
          room.players.push({
            id: socket.id,
            name: playerName,
            ready: false,
            score: 0
          });
        }

        // Join the socket room
        socket.join(roomId);
        
        // Broadcast updated game state
        io.to(roomId).emit("game_state_update", room);
        
        console.log(`Room ${roomId} now has ${room.players.length} players`);
      });

      // Player ready handler
      socket.on("player_ready", ({ roomId }) => {
        const room = rooms.get(roomId);
        if (!room) return;

        // Mark player as ready
        const playerIndex = room.players.findIndex((p: any) => p.id === socket.id);
        if (playerIndex >= 0) {
          room.players[playerIndex].ready = true;
        }

        // Check if all players are ready
        const allReady = room.players.length >= 2 && room.players.every((p: any) => p.ready);
        if (allReady && !room.isActive) {
          // Start the game
          room.isActive = true;
          room.currentPuzzle = room.puzzleQueue.shift();
          room.puzzleQueue.push(Solver.generatePuzzle());
        }

        // Broadcast updated game state
        io.to(roomId).emit("game_state_update", room);
      });

      // Submit solution handler
      socket.on("submit_solution", ({ roomId, solution }) => {
        const room = rooms.get(roomId);
        if (!room || !room.isActive) return;

        // Find the player
        const playerIndex = room.players.findIndex((p: any) => p.id === socket.id);
        if (playerIndex < 0) return;

        const player = room.players[playerIndex];
        
        // Update player score
        player.score += 1;
        
        // Record the solution
        room.lastSolution = {
          playerName: player.name,
          solution,
          time: Date.now()
        };

        // Check if player has reached the target score
        if (player.score >= room.targetScore) {
          // Game over
          room.gameOver = true;
          room.winner = player.id;
          room.winnerDetails = { ...player };
        } else {
          // Next puzzle
          room.currentPuzzle = room.puzzleQueue.shift();
          room.puzzleQueue.push(Solver.generatePuzzle());
        }

        // Broadcast updated game state
        io.to(roomId).emit("game_state_update", room);
      });

      // Custom event handlers for room settings
      socket.on("room_settings", (data) => {
        if (!data.roomId) return;
        
        const room = rooms.get(data.roomId);
        if (!room) return;
        
        // Only allow the room creator to update settings
        if (socket.id === room.creatorId && data.targetScore) {
          room.targetScore = data.targetScore;
          console.log(`Updated room ${data.roomId} target score to ${data.targetScore}`);
          
          // Broadcast updated game state
          io.to(data.roomId).emit("game_state_update", room);
          io.to(data.roomId).emit("room_settings", { targetScore: data.targetScore });
        }
      });
      
      socket.on("request_room_settings", (data) => {
        if (!data.roomId) return;
        
        const room = rooms.get(data.roomId);
        if (!room) return;
        
        // Send room settings to the requesting client
        socket.emit("room_settings", { 
          targetScore: room.targetScore,
          roomId: room.roomId
        });
      });

      // Disconnect handler
      socket.on("disconnect", () => {
        console.log("Client disconnected:", socket.id);
        
        // Update all rooms the player was in
        rooms.forEach((room, roomId) => {
          const playerIndex = room.players.findIndex((p: any) => p.id === socket.id);
          if (playerIndex >= 0) {
            // Remove player from room
            room.players.splice(playerIndex, 1);
            
            // If room is empty, delete it
            if (room.players.length === 0) {
              rooms.delete(roomId);
              console.log(`Room ${roomId} deleted (empty)`);
            } else {
              // If the creator left, assign a new creator
              if (room.creatorId === socket.id && room.players.length > 0) {
                room.creatorId = room.players[0].id;
              }
              
              // Broadcast updated game state
              io.to(roomId).emit("game_state_update", room);
            }
          }
        });
      });
    });

    // Store the io instance on the server object
    res.socket.server.io = io;
    
    console.log("Socket.io server initialized successfully");
    return io;
  } catch (error) {
    console.error("Error setting up Socket.io server:", error);
    throw error;
  }
};

// API route handler
export async function GET() {
  try {
    // @ts-ignore - Next.js doesn't expose the socket property on the response type
    const res: any = { socket: { server: { io: null } } };
    
    // Initialize Socket.io if not already initialized
    await getSocketIO(res);
    
    return NextResponse.json({ 
      success: true, 
      message: "Socket.io server is running" 
    });
  } catch (error) {
    console.error("Socket route error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to initialize Socket.io server" },
      { status: 500 }
    );
  }
}