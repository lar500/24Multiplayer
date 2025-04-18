// app/api/socket/route.ts

import { NextResponse } from "next/server";
import { Server as SocketIOServer } from "socket.io";
import { createClient } from "redis";
import { createAdapter } from "@socket.io/redis-adapter";
import { Solver } from "../../utils/solver";

// —— Types —— //
type Puzzle = ReturnType<typeof Solver.generatePuzzle>;

interface Player {
  id: string;
  name: string;
  ready: boolean;
  score: number;
}

interface GameState {
  roomId: string;
  creatorId: string;
  players: Player[];
  isActive: boolean;
  currentPuzzle: Puzzle;
  puzzleQueue: Puzzle[];
  targetScore: number;
  gameOver: boolean;
  winner: string | null;
  winnerDetails: Player | null;
  lastSolution: { playerName: string; solution: string; time: number } | null;
}

// We’ll store each room’s state here in memory.
// (For production you’d swap this out for a database or Redis.)
interface Room extends GameState {}

declare global {
  // Next.js persists globals across hot‑reloads in development
  // so guard against re‑initialization.
  // @ts-ignore
  var _io: SocketIOServer | undefined;
}

// Force the route to be dynamic so it doesn’t get cached:
export const dynamic = "force-dynamic";

// —— Entry point —— //
export async function GET(request: Request) {
  // 1️⃣ Tell Next to proceed with the WebSocket upgrade:
  //    NextResponse.next() exposes `res.socket.server` below.
  // @ts-ignore
  const res = NextResponse.next();

  // 2️⃣ If we haven’t already initialized Socket.IO, do so now:
  if (!global._io) {
    // — Optional Redis adapter setup — 
    let adapter = undefined;
    if (process.env.REDIS_URL) {
      const pubClient = createClient({ url: process.env.REDIS_URL });
      const subClient = pubClient.duplicate();
      await Promise.all([pubClient.connect(), subClient.connect()]);
      adapter = createAdapter(pubClient, subClient);
    }

    // — Instantiate Socket.IO on the same HTTP server that serves Next.js —
    const io = new SocketIOServer(res.socket.server, {
      path: "/api/socket",
      addTrailingSlash: false,
      cors: { origin: "*", methods: ["GET", "POST"], credentials: true },
      transports: ["websocket", "polling"],
      pingTimeout: 20000,
      pingInterval: 10000,
      ...(adapter ? { adapter } : {}),
    });
    global._io = io;

    // In‑memory room store
    const rooms = new Map<string, Room>();

    io.on("connection", (socket) => {
      console.log("🔌 Socket connected:", socket.id);

      // — join_room handler — 
      socket.on(
        "join_room",
        ({
          roomId,
          playerName,
          targetScore = 5,
        }: {
          roomId: string;
          playerName: string;
          targetScore?: number;
        }) => {
          let room = rooms.get(roomId);

          // Create new room if needed
          if (!room) {
            room = {
              roomId,
              creatorId: socket.id,
              players: [],
              isActive: false,
              currentPuzzle: [] as Puzzle,
              puzzleQueue: Array.from({ length: 10 }, () =>
                Solver.generatePuzzle()
              ),
              targetScore,
              gameOver: false,
              winner: null,
              winnerDetails: null,
              lastSolution: null,
            };
            rooms.set(roomId, room);
            console.log(`✨ Created room ${roomId}`);
          }

          // Add or rename player
          const idx = room.players.findIndex((p) => p.id === socket.id);
          if (idx >= 0) {
            room.players[idx].name = playerName;
          } else {
            room.players.push({
              id: socket.id,
              name: playerName,
              ready: false,
              score: 0,
            });
          }

          socket.join(roomId);
          io.to(roomId).emit("game_state_update", room);
        }
      );

      // — player_ready handler — 
      socket.on("player_ready", ({ roomId }: { roomId: string }) => {
        const room = rooms.get(roomId);
        if (!room) return;

        const idx = room.players.findIndex((p) => p.id === socket.id);
        if (idx >= 0) room.players[idx].ready = true;

        // If at least 2 players and all are ready, start the game
        const allReady =
          room.players.length >= 2 && room.players.every((p) => p.ready);
        if (allReady && !room.isActive) {
          room.isActive = true;
          // Draw the first puzzle from the queue
          room.currentPuzzle = room.puzzleQueue.shift()!;
        }

        io.to(roomId).emit("game_state_update", room);
      });

      // — submit_solution handler — 
      socket.on(
        "submit_solution",
        ({
          roomId,
          solution,
        }: {
          roomId: string;
          solution: string;
        }) => {
          const room = rooms.get(roomId);
          if (!room) return;

          const player = room.players.find((p) => p.id === socket.id);
          if (!player) return;

          player.score += 1;
          room.lastSolution = {
            playerName: player.name,
            solution,
            time: Date.now(),
          };

          // Check for win
          if (player.score >= room.targetScore) {
            room.gameOver = true;
            room.winner = player.id;
            room.winnerDetails = { ...player };
            room.isActive = false;
          } else {
            // Rotate to next puzzle
            room.currentPuzzle = room.puzzleQueue.shift()!;
            room.puzzleQueue.push(Solver.generatePuzzle());
          }

          io.to(roomId).emit("game_state_update", room);
        }
      );
    });

    console.log("📡 Socket.IO initialized");
  }

  // 3 Return the "upgrade" response so that Socket.IO can handshake:
  return res;
}
