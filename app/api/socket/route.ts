// app/api/socket/route.ts
import { Server as SocketIOServer } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import { NextResponse } from "next/server";
import { Solver } from "../../utils/solver";

interface Player {
  id: string;
  name: string;
  ready: boolean;
  score: number;
}

interface LastSolution {
  playerName: string;
  solution: any; // Replace with specific type if available
  time: number;
}

interface Room {
  roomId: string;
  creatorId: string;
  players: Player[];
  isActive: boolean;
  currentPuzzle: any; // Replace with specific type if available
  targetScore: number;
  gameOver: boolean;
  winner: string | null;
  winnerDetails: Player | null;
  lastSolution: LastSolution | null;
  puzzleQueue: any[]; // Replace with specific type if available
}

interface CustomResponse {
  socket: {
    server: {
      io?: SocketIOServer;
      // Cast server to 'any' when initializing SocketIO below
    };
  };
}

interface JoinRoomData {
  roomId: string;
  playerName: string;
  targetScore?: number;
}

interface RoomSettingsData {
  roomId: string;
  targetScore?: number;
}

const getSocketIO = async (res: CustomResponse) => {
  if (res.socket.server.io) {
    console.log("Socket.io server already running");
    return res.socket.server.io;
  }

  console.log("Setting up Socket.io server...");

  try {
    const pubClient = createClient({
      url: process.env.REDIS_URL,
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 50, 1000),
      },
    });
    const subClient = pubClient.duplicate();

    pubClient.on("error", (err) => {
      console.error("Redis pub client error:", err);
    });
    subClient.on("error", (err) => {
      console.error("Redis sub client error:", err);
    });

    await Promise.all([pubClient.connect(), subClient.connect()]);

    console.log("Redis clients connected successfully");

    // Cast server to any to satisfy SocketIOServer constructor overload
    const server = res.socket.server as any;
    const io = new SocketIOServer(server, {
      path: "/api/socket",
      addTrailingSlash: false,
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true,
      },
      adapter: createAdapter(pubClient, subClient),
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    const rooms = new Map<string, Room>();

    io.on("connection", (socket) => {
      console.log("Client connected:", socket.id);

      socket.on("join_room", (data: JoinRoomData) => {
        const { roomId, playerName, targetScore = 5 } = data;
        let room = rooms.get(roomId);

        if (!room) {
          room = {
            roomId,
            creatorId: socket.id,
            players: [],
            isActive: false,
            currentPuzzle: Solver.generatePuzzle(),
            targetScore,
            gameOver: false,
            winner: null,
            winnerDetails: null,
            lastSolution: null,
            puzzleQueue: Array.from({ length: 10 }, () => Solver.generatePuzzle()),
          };
          rooms.set(roomId, room);
        }

        const existingPlayerIndex = room.players.findIndex((p) => p.id === socket.id);
        if (existingPlayerIndex >= 0) {
          room.players[existingPlayerIndex].name = playerName;
        } else {
          room.players.push({ id: socket.id, name: playerName, ready: false, score: 0 });
        }

        socket.join(roomId);
        io.to(roomId).emit("game_state_update", room);
      });

      socket.on("player_ready", ({ roomId }: { roomId: string }) => {
        const room = rooms.get(roomId);
        if (!room) return;

        const playerIndex = room.players.findIndex((p) => p.id === socket.id);
        if (playerIndex >= 0) {
          room.players[playerIndex].ready = true;
        }

        const allReady = room.players.length >= 2 && room.players.every((p) => p.ready);
        if (allReady && !room.isActive) {
          room.isActive = true;
          room.currentPuzzle = room.puzzleQueue.shift()!;
          room.puzzleQueue.push(Solver.generatePuzzle());
        }

        io.to(roomId).emit("game_state_update", room);
      });

      socket.on("submit_solution", ({ roomId, solution }: { roomId: string; solution: any }) => {
        const room = rooms.get(roomId);
        if (!room || !room.isActive) return;

        const playerIndex = room.players.findIndex((p) => p.id === socket.id);
        if (playerIndex < 0) return;

        const player = room.players[playerIndex];
        player.score += 1;

        room.lastSolution = { playerName: player.name, solution, time: Date.now() };

        if (player.score >= room.targetScore) {
          room.gameOver = true;
          room.winner = player.id;
          room.winnerDetails = { ...player };
        } else {
          room.currentPuzzle = room.puzzleQueue.shift()!;
          room.puzzleQueue.push(Solver.generatePuzzle());
        }

        io.to(roomId).emit("game_state_update", room);
      });

      socket.on("room_settings", (data: RoomSettingsData) => {
        const room = rooms.get(data.roomId);
        if (!room || socket.id !== room.creatorId || !data.targetScore) return;

        room.targetScore = data.targetScore;
        io.to(data.roomId).emit("game_state_update", room);
        io.to(data.roomId).emit("room_settings", { targetScore: data.targetScore });
      });

      socket.on("request_room_settings", ({ roomId }: { roomId: string }) => {
        const room = rooms.get(roomId);
        if (!room) return;
        socket.emit("room_settings", { targetScore: room.targetScore, roomId: room.roomId });
      });

      socket.on("disconnect", () => {
        rooms.forEach((room, roomId) => {
          const playerIndex = room.players.findIndex((p) => p.id === socket.id);
          if (playerIndex >= 0) {
            room.players.splice(playerIndex, 1);
            if (room.players.length === 0) {
              rooms.delete(roomId);
            } else {
              if (room.creatorId === socket.id) {
                room.creatorId = room.players[0].id;
              }
              io.to(roomId).emit("game_state_update", room);
            }
          }
        });
      });
    });

    res.socket.server.io = io;
    return io;
  } catch (error) {
    console.error("Error setting up Socket.io server:", error);
    throw error;
  }
};

export async function GET() {
  try {
    const res: CustomResponse = { socket: { server: { io: undefined } } };
    await getSocketIO(res);
    return NextResponse.json({ success: true, message: "Socket.io server is running" });
  } catch (error) {
    return NextResponse.json({ success: false, message: "Failed to initialize Socket.io server" }, { status: 500 });
  }
}
