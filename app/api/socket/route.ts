import { Server } from 'socket.io';
import { NextRequest, NextResponse } from 'next/server';
import { Solver } from '../../utils/solver';

// Types
type Player = {
  id: string;
  name: string;
  score: number;
  ready: boolean;
};

type Room = {
  id: string;
  players: Map<string, Player>;
  currentPuzzle: number[];
  isActive: boolean;
  startTime?: number;
  targetScore: number; // Number of puzzles to win
  winner?: string; // ID of the winning player
  creatorId: string; // ID of the player who created the room
};

// In-memory store for active game rooms
const rooms = new Map<string, Room>();

// Keep track of the Socket.IO server instance between requests
let ioInstance: Server | null = null;

export async function GET() {
  // If the socket server is already initialized, return early
  if (ioInstance) {
    return new NextResponse('Socket server already running', { status: 200 });
  }

  try {
    // Using a direct Server instance without attaching to HTTP server
    // This works in Next.js App Router
    const io = new Server({
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
      path: '/api/socket',
      addTrailingSlash: false,
      transports: ['websocket', 'polling'],
    });
    
    // Save the instance for reuse
    ioInstance = io;
    
    // Setup socket handlers
    setupSocketHandlers(io);
    
    try {
      // Start the server with error handling
      io.listen(3001); // Use a different port than Next.js
      console.log('Socket.IO server created successfully on port 3001');
    } catch (listenError) {
      // If port is in use, just log the error but don't fail
      // This allows the socket connection to work even if we can't bind to the port
      // (which happens during hot reloading in development)
      console.warn('Port 3001 already in use, socket server may already be running:', listenError);
      console.warn('This is normal during development with hot reloading');
    }
    
    return new NextResponse('Socket server started', { status: 200 });
  } catch (error) {
    console.error('Failed to start socket server:', error);
    return new NextResponse(`Failed to start socket server: ${error}`, { status: 500 });
  }
}

// Setup socket event handlers
function setupSocketHandlers(io: Server) {
  io.on('connection', (socket) => {
    console.log('New client connected:', socket.id, 'transport:', socket.conn.transport.name);
    
    // Create or join a game room
    socket.on('join-room', ({ roomId, playerName, targetScore }) => {
      console.log(`Player ${playerName} (${socket.id}) joining room ${roomId} with targetScore:`, targetScore);
      
      let room = rooms.get(roomId);
      
      // Create a new room if it doesn't exist
      if (!room) {
        // Ensure targetScore is a valid number between 1 and 10
        let roomTargetScore = 5; // Default
        
        if (typeof targetScore === 'number' && !isNaN(targetScore) && targetScore >= 1 && targetScore <= 10) {
          roomTargetScore = targetScore;
          console.log(`Setting room target score to: ${roomTargetScore}`);
        }
        
        room = {
          id: roomId,
          players: new Map(),
          currentPuzzle: Solver.generatePuzzle(),
          isActive: false,
          targetScore: roomTargetScore,
          creatorId: socket.id // Set creator ID to the first player who creates the room
        };
        rooms.set(roomId, room);
        console.log(`New room created: ${roomId} with target score: ${room.targetScore}`);
      } else {
        // For existing rooms, we should use the room's existing target score
        // and not override it with the joining player's value
        console.log(`Joining existing room ${roomId} with target score: ${room.targetScore}`);
      }
      
      // Add the player to the room
      const player: Player = {
        id: socket.id,
        name: playerName || `Player ${room.players.size + 1}`,
        score: 0,
        ready: false,
      };
      
      room.players.set(socket.id, player);
      console.log(`Player ${player.name} added to room ${roomId}`);
      
      // Join the Socket.IO room
      socket.join(roomId);
      
      // Notify everyone in the room about the new player
      io.to(roomId).emit('room-update', {
        roomId,
        players: Array.from(room.players.values()),
        currentPuzzle: room.currentPuzzle,
        isActive: room.isActive,
        targetScore: room.targetScore,
        winner: room.winner,
        creatorId: room.creatorId
      });
      
      // Listen for player readiness
      socket.on('player-ready', () => {
        const room = rooms.get(roomId);
        if (!room) return;
        
        const player = room.players.get(socket.id);
        if (player) {
          player.ready = true;
          room.players.set(socket.id, player);
          console.log(`Player ${player.name} is ready in room ${roomId}`);
          
          // Check if all players are ready
          const allReady = Array.from(room.players.values()).every(p => p.ready);
          
          if (allReady && room.players.size >= 2) {
            // Start the game
            room.isActive = true;
            room.currentPuzzle = Solver.generatePuzzle();
            room.startTime = Date.now();
            console.log(`Game starting in room ${roomId}`);
            
            io.to(roomId).emit('game-start', {
              players: Array.from(room.players.values()),
              currentPuzzle: room.currentPuzzle,
              startTime: room.startTime,
              targetScore: room.targetScore // Include targetScore in game-start event
            });
          } else {
            // Just update the room status
            io.to(roomId).emit('room-update', {
              roomId,
              players: Array.from(room.players.values()),
              currentPuzzle: room.currentPuzzle,
              isActive: room.isActive,
              targetScore: room.targetScore,
              creatorId: room.creatorId
            });
          }
        }
      });
      
      // Listen for puzzle solutions
      socket.on('puzzle-solved', ({ solution, time }) => {
        const room = rooms.get(roomId);
        if (!room || !room.isActive) return;
        
        const player = room.players.get(socket.id);
        if (player) {
          // Increase player score
          player.score += 1;
          room.players.set(socket.id, player);
          console.log(`Player ${player.name} solved puzzle in room ${roomId}`);
          
          // Check if this player has reached the target score
          if (player.score >= room.targetScore) {
            // Set this player as the winner
            room.winner = player.id;
            // Set game as inactive to stop further solutions
            room.isActive = false;
            console.log(`Player ${player.name} has won the game in room ${roomId}!`);
            
            // Immediately emit game over event
            io.to(roomId).emit('game-over', {
              winner: Array.from(room.players.values()).find(p => p.id === room.winner),
              players: Array.from(room.players.values())
            });
            
            // Also emit a room update to ensure all clients know the game is over
            io.to(roomId).emit('room-update', {
              roomId,
              players: Array.from(room.players.values()),
              currentPuzzle: room.currentPuzzle,
              isActive: false,
              targetScore: room.targetScore,
              winner: room.winner,
              creatorId: room.creatorId
            });
            
            return; // Exit early since game is over
          }
          
          // Notify room about the correct solution
          io.to(roomId).emit('player-solved', {
            playerId: socket.id,
            playerName: player.name,
            solution,
            time,
            score: player.score,
            winner: room.winner
          });
          
          // Generate a new puzzle after a short delay
          setTimeout(() => {
            if (rooms.has(roomId)) {
              const room = rooms.get(roomId)!;
              
              // Only generate a new puzzle if there's no winner yet
              if (!room.winner) {
                room.currentPuzzle = Solver.generatePuzzle();
                console.log(`New puzzle generated for room ${roomId}`);
                
                io.to(roomId).emit('new-puzzle', {
                  players: Array.from(room.players.values()),
                  currentPuzzle: room.currentPuzzle,
                });
              }
            }
          }, 3000);
        }
      });
      
      // Handle disconnects
      socket.on('disconnect', () => {
        console.log(`Player ${socket.id} disconnected from room ${roomId}`);
        
        const room = rooms.get(roomId);
        if (!room) return;
        
        // Remove the player from the room
        room.players.delete(socket.id);
        
        // Delete the room if empty
        if (room.players.size === 0) {
          rooms.delete(roomId);
          console.log(`Room ${roomId} deleted (empty)`);
        } else {
          // Notify remaining players
          console.log(`${room.players.size} players remaining in room ${roomId}`);
          io.to(roomId).emit('room-update', {
            roomId,
            players: Array.from(room.players.values()),
            currentPuzzle: room.currentPuzzle,
            isActive: room.isActive,
            targetScore: room.targetScore,
            creatorId: room.creatorId
          });
        }
      });
    });
    
    // Ping-pong to keep connection alive
    socket.on('ping', () => {
      socket.emit('pong');
    });
  });
}

export const dynamic = 'force-dynamic'; 