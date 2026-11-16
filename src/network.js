import { io } from 'socket.io-client';

export class NetworkManager {
  constructor() {
    this.socket = null;
    this.myId = null;
    this.players = new Map();
    this.updateCallback = null;
    this.playerJoinedCallback = null;
    this.playerLeftCallback = null;
    this.playersListCallback = null;

    // Combat callbacks
    this.shotFiredCallback = null;
    this.playerHitCallback = null;
    this.playerDiedCallback = null;
    this.playerRespawnedCallback = null;
    this.scoreboardUpdateCallback = null;

    // Throttling for sending updates (~20 Hz = every 50ms)
    this.lastSendTime = 0;
    this.sendInterval = 50; // ms
  }

  connect() {
    this.socket = io('http://localhost:3000', {
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      this.myId = this.socket.id;
      console.log('Connected to server, my ID:', this.myId);
    });

    this.socket.on('playersList', (playersList) => {
      if (this.playersListCallback) {
        this.playersListCallback(playersList);
      }
    });

    this.socket.on('playerJoined', (data) => {
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
      if (this.playerLeftCallback) {
        this.playerLeftCallback(data.id);
      }
    });

    // Combat events
    this.socket.on('shotFired', (data) => {
      if (this.shotFiredCallback) {
        this.shotFiredCallback(data);
      }
    });

    this.socket.on('playerHit', (data) => {
      if (this.playerHitCallback) {
        this.playerHitCallback(data);
      }
    });

    this.socket.on('playerDied', (data) => {
      if (this.playerDiedCallback) {
        this.playerDiedCallback(data);
      }
    });

    this.socket.on('playerRespawned', (data) => {
      if (this.playerRespawnedCallback) {
        this.playerRespawnedCallback(data);
      }
    });

    this.socket.on('scoreboardUpdate', (data) => {
      if (this.scoreboardUpdateCallback) {
        this.scoreboardUpdateCallback(data);
      }
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
    });

    this.socket.on('connect_error', (err) => {
      console.error('Connection error:', err.message);
    });
  }

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

  // Send shot to server (origin and direction from barrel)
  sendPlayerShoot(origin, direction) {
    if (!this.socket || !this.socket.connected) return;
    this.socket.emit('playerShoot', {
      origin: { x: origin.x, y: origin.y, z: origin.z },
      direction: { x: direction.x, y: direction.y, z: direction.z }
    });
  }

  requestScoreboard() {
    if (!this.socket || !this.socket.connected) return;
    this.socket.emit('requestScoreboard');
  }

  onPlayersList(callback) { this.playersListCallback = callback; }
  onPlayerJoined(callback) { this.playerJoinedCallback = callback; }
  onPlayerMoved(callback) { this.updateCallback = callback; }
  onPlayerLeft(callback) { this.playerLeftCallback = callback; }
  onShotFired(callback) { this.shotFiredCallback = callback; }
  onPlayerHit(callback) { this.playerHitCallback = callback; }
  onPlayerDied(callback) { this.playerDiedCallback = callback; }
  onPlayerRespawned(callback) { this.playerRespawnedCallback = callback; }
  onScoreboardUpdate(callback) { this.scoreboardUpdateCallback = callback; }

  getMyId() { return this.myId; }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}