// app/api/socket/route.ts

import { NextResponse } from "next/server";
import { Server as SocketIOServer } from "socket.io";
import { createClient } from "redis";
import { createAdapter } from "@socket.io/redis-adapter";
import { Solver } from "../../utils/solver"; // adjust path as needed

// Force this endpoint to be dynamic (no caching)
export const dynamic = "force-dynamic";

// —— Types —— //
type Puzzle = ReturnType<typeof Solver.generatePuzzle>;

interface Player {
  id: string;
  name: string;
  ready: boolean;
  score: number;
}

interface LastSolution {
  playerName: string;
  solution: string;
  time: number;
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
  lastSolution: LastSolution | null;
}

interface Room extends GameState {}

// —— In‑Memory Store & Globals —— //
// Switched from `var` to `let` to satisfy no‑var rule:
let globalSocketIO: SocketIOServer | null = null;

// —— Main Handler —— //
export async function GET() {
  // Cast to any so we can attach `.socket.server.io` without TS errors
  const res: any = NextResponse.next();

  // Initialize Socket.IO exactly once
  if (!globalSocketIO) {
    // Optional Redis adapter if REDIS_URL is set
    let adapter;
    if (process.env.REDIS_URL) {
      const pubClient = createClient({ url: process.env.REDIS_URL });
      const subClient = pubClient.duplicate();
      await Promise.all([pubClient.connect(), subClient.connect()]);
      adapter = createAdapter(pubClient, subClient);
    }

    // Mount Socket.IO on the same HTTP server
    const io = new SocketIOServer(res.socket.server, {
      path: "/api/socket",
      addTrailingSlash: false,
      cors: { origin: "*", methods: ["GET", "POST"], credentials: true },
      transports: ["websocket", "polling"],
      pingTimeout: 20000,
      pingInterval: 10000,
      ...(adapter ? { adapter } : {}),
    });
    globalSocketIO = io;

    // In‑memory room registry
    const rooms = new Map<string, Room>();

    io.on("connection", (socket) => {
      console.log("🔌 Socket connected:", socket.id);

      // — join_room —
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
          }

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

      // — player_ready —
      socket.on("player_ready", ({ roomId }: { roomId: string }) => {
        const room = rooms.get(roomId);
        if (!room) return;

        const idx = room.players.findIndex((p) => p.id === socket.id);
        if (idx >= 0) room.players[idx].ready = true;

        const allReady =
          room.players.length >= 2 && room.players.every((p) => p.ready);
        if (allReady && !room.isActive) {
          room.isActive = true;
          room.currentPuzzle = room.puzzleQueue.shift()!;
        }

        io.to(roomId).emit("game_state_update", room);
      });

      // — submit_solution —
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

          if (player.score >= room.targetScore) {
            room.gameOver = true;
            room.winner = player.id;
            room.winnerDetails = { ...player };
            room.isActive = false;
          } else {
            room.currentPuzzle = room.puzzleQueue.shift()!;
            room.puzzleQueue.push(Solver.generatePuzzle());
          }

          io.to(roomId).emit("game_state_update", room);
        }
      );
    });

    console.log("📡 Socket.IO initialized");
  }

  // Returning `res` here lets the WebSocket upgrade happen
  return res;
}
