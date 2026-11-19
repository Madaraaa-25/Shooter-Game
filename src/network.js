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
    this.roomJoinedCallback = null;
    this.roomErrorCallback = null;

    // Lobby state: true until the player joins a room
    this.inLobby = true;

    // Current room code (null while in the lobby). Used to ignore stale
    // events from a previous room.
    this.roomCode = null;

    // Combat callbacks
    this.shotFiredCallback = null;
    this.playerHitCallback = null;
    this.playerDiedCallback = null;
    this.playerRespawnedCallback = null;
    this.playerHealthCallback = null;
    this.scoreboardUpdateCallback = null;

    // Throttling for sending updates (~20 Hz = every 50ms)
    this.lastSendTime = 0;
    this.sendInterval = 50; // ms
  }

  connect() {
    // In development (Vite on 5173) talk to the separate server on port 3000.
    // In production the page and the socket share one origin, so use that.
    const url = import.meta.env.DEV
      ? `${window.location.protocol}//${window.location.hostname}:3000`
      : window.location.origin;
    this.socket = io(url, {
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      this.myId = this.socket.id;
      console.log('Connected to server, my ID:', this.myId);
      // Wait in the lobby until the player chooses a room.
    });

    this.socket.on('playersList', (playersList) => {
      if (this.inRoom() && this.playersListCallback) {
        this.playersListCallback(playersList);
      }
    });

    this.socket.on('playerJoined', (data) => {
      if (this.inRoom() && this.playerJoinedCallback) {
        this.playerJoinedCallback(data);
      }
    });

    this.socket.on('playerMoved', (data) => {
      if (this.inRoom() && this.updateCallback) {
        this.updateCallback(data);
      }
    });

    this.socket.on('playerLeft', (data) => {
      if (this.inRoom() && this.playerLeftCallback) {
        this.playerLeftCallback(data.id);
      }
    });

    // Combat events
    this.socket.on('shotFired', (data) => {
      if (this.inRoom() && this.shotFiredCallback) {
        this.shotFiredCallback(data);
      }
    });

    this.socket.on('playerHit', (data) => {
      if (this.inRoom() && this.playerHitCallback) {
        this.playerHitCallback(data);
      }
    });

    this.socket.on('playerDied', (data) => {
      if (this.inRoom() && this.playerDiedCallback) {
        this.playerDiedCallback(data);
      }
    });

    this.socket.on('playerRespawned', (data) => {
      if (this.inRoom() && this.playerRespawnedCallback) {
        this.playerRespawnedCallback(data);
      }
    });

    this.socket.on('playerHealth', (data) => {
      if (this.inRoom() && this.playerHealthCallback) {
        this.playerHealthCallback(data);
      }
    });

    this.socket.on('scoreboardUpdate', (data) => {
      if (this.inRoom() && this.scoreboardUpdateCallback) {
        this.scoreboardUpdateCallback(data);
      }
    });

    // Room events
    this.socket.on('roomJoined', (data) => {
      console.log('Joined room:', data.roomCode);
      this.inLobby = false;
      this.roomCode = data.roomCode;
      if (this.roomJoinedCallback) {
        this.roomJoinedCallback(data);
      }
    });

    this.socket.on('roomError', (data) => {
      console.log('Room error:', data.message);
      // Stay in the lobby and let the UI show the error message.
      if (this.roomErrorCallback) {
        this.roomErrorCallback(data);
      }
    });

    this.socket.on('roomLeft', () => {
      console.log('Left room');
      this.inLobby = true;
      this.roomCode = null;
      if (this.roomLeftCallback) {
        this.roomLeftCallback();
      }
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
    });

    this.socket.on('connect_error', (err) => {
      console.error('Connection error:', err.message);
    });
  }

  sendPlayerUpdate(position, rotation, eyeHeight) {
    if (!this.socket || !this.socket.connected) return;

    const now = performance.now();
    if (now - this.lastSendTime < this.sendInterval) return;
    this.lastSendTime = now;

    this.socket.emit('playerUpdate', {
      position: { x: position.x, y: position.y, z: position.z },
      rotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
      eyeHeight: eyeHeight
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

  // Room methods
  createRoom(requestedCode = null, name = '', character = 'male') {
    if (!this.socket || !this.socket.connected) return;
    this.inLobby = false;
    this.roomCode = requestedCode || null;
    this.socket.emit('createRoom', { requestedCode, name, character });
  }

  joinRoom(roomCode, name = '', character = 'male') {
    if (!this.socket || !this.socket.connected) return;
    this.inLobby = false;
    this.roomCode = roomCode;
    this.socket.emit('joinRoom', { roomCode, name, character });
  }

  // Called locally the moment the player clicks LEAVE ROOM, before the
  // server reply arrives, so the UI resets immediately.
  startLeaving() {
    this.inLobby = true;
    this.roomCode = null;
  }

  isInLobby() { return this.inLobby; }
  isSocketConnected() { return !!(this.socket && this.socket.connected); }
  inRoom() { return !this.inLobby && this.roomCode !== null; }
  getRoomCode() { return this.roomCode; }

  onPlayersList(callback) { this.playersListCallback = callback; }
  onPlayerJoined(callback) { this.playerJoinedCallback = callback; }
  onPlayerMoved(callback) { this.updateCallback = callback; }
  onPlayerLeft(callback) { this.playerLeftCallback = callback; }
  onShotFired(callback) { this.shotFiredCallback = callback; }
  onPlayerHit(callback) { this.playerHitCallback = callback; }
  onPlayerDied(callback) { this.playerDiedCallback = callback; }
  onPlayerRespawned(callback) { this.playerRespawnedCallback = callback; }
  onPlayerHealth(callback) { this.playerHealthCallback = callback; }
  onScoreboardUpdate(callback) { this.scoreboardUpdateCallback = callback; }
  onRoomJoined(callback) { this.roomJoinedCallback = callback; }
  onRoomError(callback) { this.roomErrorCallback = callback; }
  onRoomLeft(callback) { this.roomLeftCallback = callback; }

  leaveRoom() {
    if (!this.socket || !this.socket.connected) return;
    this.inLobby = true;
    this.socket.emit('leaveRoom');
  }

  getMyId() { return this.myId; }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}