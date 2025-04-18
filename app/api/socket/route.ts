import { Server as SocketIOServer } from "socket.io"
import { createAdapter } from "@socket.io/redis-adapter"
import { createClient } from "redis"
import { NextResponse } from "next/server"
import { Solver } from "../../utils/solver"

// Define puzzle type based on solver output
type Puzzle = ReturnType<typeof Solver.generatePuzzle>

interface Player {
  id: string
  name: string
  ready: boolean
  score: number
}

interface LastSolution {
  playerName: string
  solution: Puzzle
  time: number
}

interface Room {
  roomId: string
  creatorId: string
  players: Player[]
  isActive: boolean
  currentPuzzle: Puzzle
  targetScore: number
  gameOver: boolean
  winner: string | null
  winnerDetails: Player | null
  lastSolution: LastSolution | null
  puzzleQueue: Puzzle[]
}

interface CustomResponse {
  socket: {
    server: {
      io?: SocketIOServer
    }
  }
}

interface JoinRoomData {
  roomId: string
  playerName: string
  targetScore?: number
}

interface RoomSettingsData {
  roomId: string
  targetScore?: number
}

const getSocketIO = async (res: CustomResponse) => {
  if (res.socket.server.io) {
    console.log("Socket.io server already running")
    return res.socket.server.io
  }

  console.log("Setting up Socket.io server...")

  try {
    const pubClient = createClient({
      url: process.env.REDIS_URL,
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 50, 1000),
      },
    })
    const subClient = pubClient.duplicate()

    pubClient.on("error", (err: Error) => {
      console.error("Redis pub client error:", err)
    })
    subClient.on("error", (err: Error) => {
      console.error("Redis sub client error:", err)
    })

    await Promise.all([pubClient.connect(), subClient.connect()])

    console.log("Redis clients connected successfully")

    // Fix for the any type error - use Record<string, unknown> instead
    const server = res.socket.server as unknown
    const io = new SocketIOServer(server as Record<string, unknown>, {
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
    })

    const rooms = new Map<string, Room>()

    io.on("connection", (socket) => {
      console.log("Client connected:", socket.id)

      socket.on("join_room", (data: JoinRoomData) => {
        const { roomId, playerName, targetScore = 5 } = data
        let room = rooms.get(roomId)

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
          }
          rooms.set(roomId, room)
        }

        const existingIndex = room.players.findIndex((p) => p.id === socket.id)
        if (existingIndex >= 0) {
          room.players[existingIndex].name = playerName
        } else {
          room.players.push({ id: socket.id, name: playerName, ready: false, score: 0 })
        }

        socket.join(roomId)
        io.to(roomId).emit("game_state_update", room)
      })

      socket.on("player_ready", ({ roomId }: { roomId: string }) => {
        const room = rooms.get(roomId)
        if (!room) return

        const idx = room.players.findIndex((p) => p.id === socket.id)
        if (idx >= 0) room.players[idx].ready = true

        const allReady = room.players.length >= 2 && room.players.every((p) => p.ready)
        if (allReady && !room.isActive) {
          room.isActive = true
          room.currentPuzzle = room.puzzleQueue.shift()!
          room.puzzleQueue.push(Solver.generatePuzzle())
        }

        io.to(roomId).emit("game_state_update", room)
      })

      socket.on("submit_solution", ({ roomId, solution }: { roomId: string; solution: Puzzle }) => {
        const room = rooms.get(roomId)
        if (!room || !room.isActive) return

        const idx = room.players.findIndex((p) => p.id === socket.id)
        if (idx < 0) return

        const player = room.players[idx]
        player.score += 1

        room.lastSolution = { playerName: player.name, solution, time: Date.now() }

        if (player.score >= room.targetScore) {
          room.gameOver = true
          room.winner = player.id
          room.winnerDetails = { ...player }
        } else {
          room.currentPuzzle = room.puzzleQueue.shift()!
          room.puzzleQueue.push(Solver.generatePuzzle())
        }

        io.to(roomId).emit("game_state_update", room)
      })

      socket.on("room_settings", (data: RoomSettingsData) => {
        const { roomId, targetScore } = data
        const room = rooms.get(roomId)
        if (!room || socket.id !== room.creatorId || targetScore === undefined) return

        room.targetScore = targetScore
        io.to(roomId).emit("game_state_update", room)
        io.to(roomId).emit("room_settings", { targetScore })
      })

      socket.on("request_room_settings", ({ roomId }: { roomId: string }) => {
        const room = rooms.get(roomId)
        if (!room) return
        socket.emit("room_settings", { targetScore: room.targetScore, roomId })
      })

      socket.on("disconnect", () => {
        rooms.forEach((room, id) => {
          const idx = room.players.findIndex((p) => p.id === socket.id)
          if (idx >= 0) {
            room.players.splice(idx, 1)
            if (room.players.length === 0) {
              rooms.delete(id)
            } else {
              if (room.creatorId === socket.id) room.creatorId = room.players[0].id
              io.to(id).emit("game_state_update", room)
            }
          }
        })
      })
    })

    res.socket.server.io = io
    return io
  } catch (err) {
    // Fixed unused error variable by renaming to err and using it
    console.error("Error setting up Socket.io server:", err)
    throw err
  }
}

export async function GET() {
  try {
    const res: CustomResponse = { socket: { server: { io: undefined } } }
    await getSocketIO(res)
    return NextResponse.json({ success: true, message: "Socket.io server is running" })
  } catch {
    return NextResponse.json({ success: false, message: "Failed to initialize Socket.io server" }, { status: 500 })
  }
}
