import { createServer } from 'http';
import { Server } from 'socket.io';

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      // Allow any localhost origin (Vite dev server on any port)
      if (!origin || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST']
  }
});

// Store connected players: Map<socketId, playerData>
const players = new Map();

// Generate random color for player
function getRandomColor() {
  const colors = [
    0xff4444, 0x44ff44, 0x4444ff, 0xffaa00, 0xff44ff,
    0x00ffff, 0xff8800, 0x8844ff, 0x44ffff, 0xff4488
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Create new player data
  const playerData = {
    id: socket.id,
    position: { x: 0, y: 1.6, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    color: getRandomColor()
  };

  // Add to players map
  players.set(socket.id, playerData);

  // Send current players list to the new player
  const playersList = Array.from(players.values()).map(p => ({
    id: p.id,
    position: p.position,
    rotation: p.rotation,
    color: p.color
  }));
  socket.emit('playersList', playersList);

  // Broadcast new player to all OTHER clients
  socket.broadcast.emit('playerJoined', {
    id: playerData.id,
    position: playerData.position,
    rotation: playerData.rotation,
    color: playerData.color
  });

  // Handle position/rotation updates from client (~20 Hz)
  socket.on('playerUpdate', (data) => {
    const player = players.get(socket.id);
    if (player) {
      player.position = data.position;
      player.rotation = data.rotation;

      // Broadcast to all OTHER clients
      socket.broadcast.emit('playerMoved', {
        id: socket.id,
        position: data.position,
        rotation: data.rotation
      });
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    players.delete(socket.id);
    io.emit('playerLeft', { id: socket.id });
  });
});

const PORT = 3000;
httpServer.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
  console.log(`CORS enabled for http://localhost:5173`);
});