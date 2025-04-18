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
  solution: string
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

// Global variable to store the Socket.io instance
let globalSocketIO: SocketIOServer | null = null

const getSocketIO = async (res: CustomResponse) => {
  // If we already have a global instance, use it
  if (globalSocketIO) {
    console.log("Using existing global Socket.io instance")
    res.socket.server.io = globalSocketIO
    return globalSocketIO
  }

  // If the server already has an instance, use it
  if (res.socket.server.io) {
    console.log("Using existing server Socket.io instance")
    globalSocketIO = res.socket.server.io
    return res.socket.server.io
  }

  console.log("Setting up new Socket.io server...")

  try {
    // Create Redis clients with shorter timeouts
    const pubClient = createClient({
      url: process.env.REDIS_URL,
      socket: {
        connectTimeout: 5000, // 5 seconds max
        reconnectStrategy: (retries) => Math.min(retries * 50, 1000),
      },
    })

    const subClient = pubClient.duplicate()

    // Add error handlers
    pubClient.on("error", (err: Error) => {
      console.error("Redis pub client error:", err)
    })

    subClient.on("error", (err: Error) => {
      console.error("Redis sub client error:", err)
    })

    // Connect with a timeout
    let redisConnected = false
    try {
      await Promise.race([
        Promise.all([pubClient.connect(), subClient.connect()]),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Redis connection timeout")), 5000)),
      ])
      console.log("Redis clients connected successfully")
      redisConnected = true
    } catch (err) {
      console.error("Redis connection error:", err)
      console.warn("Continuing without Redis adapter")
    }

    // Create Socket.io server with optimized settings for Vercel
    const server = res.socket.server as unknown
    const io = new SocketIOServer(server as Record<string, unknown>, {
      path: "/api/socket",
      addTrailingSlash: false,
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true,
      },
      // Use Redis adapter only if connected
      ...(redisConnected ? { adapter: createAdapter(pubClient, subClient) } : {}),
      // Shorter timeouts for Vercel environment
      connectTimeout: 10000,
      pingTimeout: 20000,
      pingInterval: 10000,
      // Use websocket transport first, then polling
      transports: ["websocket", "polling"],
    })

    // In-memory storage for rooms
    const rooms = new Map<string, Room>()

    io.on("connection", (socket) => {
      console.log("Client connected:", socket.id)

      socket.on("join_room", ({ roomId, playerName, targetScore = 5 }) => {
        console.log(`${playerName} joining room ${roomId} with target score ${targetScore}`)

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
          console.log(`Created new room ${roomId}`)
        }

        const existingIndex = room.players.findIndex((p) => p.id === socket.id)
        if (existingIndex >= 0) {
          room.players[existingIndex].name = playerName
        } else {
          room.players.push({ id: socket.id, name: playerName, ready: false, score: 0 })
        }

        socket.join(roomId)
        io.to(roomId).emit("game_state_update", room)
        console.log(`Room ${roomId} now has ${room.players.length} players`)
      })

      socket.on("player_ready", ({ roomId }) => {
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

      socket.on("submit_solution", ({ roomId, solution }) => {
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

      socket.on("room_settings", (data) => {
        const { roomId, targetScore } = data
        if (!roomId) return

        const room = rooms.get(roomId)
        if (!room || socket.id !== room.creatorId || targetScore === undefined) return

        room.targetScore = targetScore
        io.to(roomId).emit("game_state_update", room)
        io.to(roomId).emit("room_settings", { targetScore })
      })

      socket.on("request_room_settings", ({ roomId }) => {
        if (!roomId) return

        const room = rooms.get(roomId)
        if (!room) return

        socket.emit("room_settings", { targetScore: room.targetScore, roomId })
      })

      socket.on("disconnect", () => {
        console.log("Client disconnected:", socket.id)
        rooms.forEach((room, id) => {
          const idx = room.players.findIndex((p) => p.id === socket.id)
          if (idx >= 0) {
            room.players.splice(idx, 1)
            if (room.players.length === 0) {
              rooms.delete(id)
              console.log(`Room ${id} deleted (empty)`)
            } else {
              if (room.creatorId === socket.id) room.creatorId = room.players[0].id
              io.to(id).emit("game_state_update", room)
            }
          }
        })
      })
    })

    // Store the io instance
    res.socket.server.io = io
    globalSocketIO = io

    console.log("Socket.io server initialized successfully")
    return io
  } catch (err) {
    console.error("Error setting up Socket.io server:", err)
    throw err
  }
}

export async function GET() {
  try {
    const res: CustomResponse = { socket: { server: { io: undefined } } }
    await getSocketIO(res)
    return NextResponse.json({
      success: true,
      message: "Socket.io server is running",
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error("Socket route error:", err)
    return NextResponse.json(
      {
        success: false,
        message: "Failed to initialize Socket.io server",
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }
}
