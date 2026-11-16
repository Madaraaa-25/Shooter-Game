import { io } from 'socket.io-client';

export class NetworkManager {
  constructor() {
    this.socket = null;
    this.myId = null;
    this.players = new Map(); // id -> { position, rotation, color, mesh }
    this.updateCallback = null;
    this.playerJoinedCallback = null;
    this.playerLeftCallback = null;
    this.playersListCallback = null;

    // Throttling for sending updates (~20 Hz = every 50ms)
    this.lastSendTime = 0;
    this.sendInterval = 50; // ms
  }

  connect() {
    // Connect to Socket.IO server
    this.socket = io('http://localhost:3000', {
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      this.myId = this.socket.id;
      console.log('Connected to server, my ID:', this.myId);
    });

    this.socket.on('playersList', (playersList) => {
      console.log('Received players list:', playersList.length);
      if (this.playersListCallback) {
        this.playersListCallback(playersList);
      }
    });

    this.socket.on('playerJoined', (data) => {
      console.log('Player joined:', data.id);
      if (this.playerJoinedCallback) {
        this.playerJoinedCallback(data);
      }
    });

    this.socket.on('playerMoved', (data) => {
      if (this.updateCallback) {
        this.updateCallback(data);
      }
    });

    this.socket.on('playerLeft', (data) => {
      console.log('Player left:', data.id);
      if (this.playerLeftCallback) {
        this.playerLeftCallback(data.id);
      }
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
    });

    this.socket.on('connect_error', (err) => {
      console.error('Connection error:', err.message);
    });
  }

  // Call this with local player's position/rotation each frame (throttled)
  sendPlayerUpdate(position, rotation) {
    if (!this.socket || !this.socket.connected) return;

    const now = performance.now();
    if (now - this.lastSendTime < this.sendInterval) return;
    this.lastSendTime = now;

    this.socket.emit('playerUpdate', {
      position: { x: position.x, y: position.y, z: position.z },
      rotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w }
    });
  }

  onPlayersList(callback) {
    this.playersListCallback = callback;
  }

  onPlayerJoined(callback) {
    this.playerJoinedCallback = callback;
  }

  onPlayerMoved(callback) {
    this.updateCallback = callback;
  }

  onPlayerLeft(callback) {
    this.playerLeftCallback = callback;
  }

  getMyId() {
    return this.myId;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}