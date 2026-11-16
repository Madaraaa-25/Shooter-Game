export class UI {
  constructor() {
    this.hits = 0;
    this.kills = 0;
    this.deaths = 0;
    this.health = 100;
    this.maxHealth = 100;
    this.isDead = false;
    this.respawnTime = 0;
    this.createHUD();
    this.initScoreboard();
  }

  createHUD() {
    // Hit counter (top-left)
    this.hitCounter = document.createElement('div');
    this.hitCounter.id = 'hit-counter';
    this.hitCounter.style.cssText = `
      position: absolute;
      top: 20px;
      left: 20px;
      color: #00ff88;
      font-family: 'Courier New', monospace;
      font-size: 24px;
      font-weight: bold;
      text-shadow: 0 0 10px #00ff88, 2px 2px 4px #000;
      pointer-events: none;
      z-index: 5;
    `;
    this.hitCounter.textContent = 'HITS: 0';
    document.body.appendChild(this.hitCounter);

    // Kills / Deaths (under hits)
    this.kdCounter = document.createElement('div');
    this.kdCounter.id = 'kd-counter';
    this.kdCounter.style.cssText = `
      position: absolute;
      top: 55px;
      left: 20px;
      color: #ffaa00;
      font-family: 'Courier New', monospace;
      font-size: 20px;
      font-weight: bold;
      text-shadow: 0 0 10px #ffaa00, 2px 2px 4px #000;
      pointer-events: none;
      z-index: 5;
    `;
    this.kdCounter.textContent = 'KILLS: 0  DEATHS: 0';
    document.body.appendChild(this.kdCounter);

    // Player count (top-right)
    this.playerCount = document.createElement('div');
    this.playerCount.id = 'player-count';
    this.playerCount.style.cssText = `
      position: absolute;
      top: 20px;
      right: 20px;
      color: #44aaff;
      font-family: 'Courier New', monospace;
      font-size: 20px;
      font-weight: bold;
      text-shadow: 0 0 10px #44aaff, 2px 2px 4px #000;
      pointer-events: none;
      z-index: 5;
    `;
    this.playerCount.textContent = 'PLAYERS: 1';
    document.body.appendChild(this.playerCount);

    // Health bar (bottom-left)
    this.healthContainer = document.createElement('div');
    this.healthContainer.id = 'health-container';
    this.healthContainer.style.cssText = `
      position: absolute;
      bottom: 20px;
      left: 20px;
      width: 250px;
      height: 30px;
      pointer-events: none;
      z-index: 5;
    `;
    this.healthContainer.innerHTML = `
      <div style="font-family: 'Courier New', monospace; font-size: 16px; font-weight: bold; color: #00ff88; text-shadow: 0 0 10px #00ff88; margin-bottom: 4px;">HEALTH</div>
      <div style="width: 100%; height: 20px; background: rgba(0, 0, 0, 0.6); border: 2px solid #00ff88; border-radius: 4px; overflow: hidden;">
        <div id="health-fill" style="width: 100%; height: 100%; background: linear-gradient(90deg, #00ff88, #44ff44); transition: width 100ms linear, background 100ms;"></div>
      </div>
      <div id="health-text" style="font-family: 'Courier New', monospace; font-size: 14px; color: #ffffff; text-align: right; margin-top: 2px;">100 / 100</div>
    `;
    document.body.appendChild(this.healthContainer);
    this.healthFill = document.getElementById('health-fill');
    this.healthText = document.getElementById('health-text');

    // Ammo counter (bottom-right)
    this.ammoCounter = document.createElement('div');
    this.ammoCounter.id = 'ammo-counter';
    this.ammoCounter.style.cssText = `
      position: absolute;
      bottom: 20px;
      right: 20px;
      color: #ffaa00;
      font-family: 'Courier New', monospace;
      font-size: 28px;
      font-weight: bold;
      text-shadow: 0 0 10px #ffaa00, 2px 2px 4px #000;
      pointer-events: none;
      z-index: 5;
      text-align: right;
    `;
    this.ammoCounter.innerHTML = 'AMMO: <span id="ammo-current">30</span> / 30';
    document.body.appendChild(this.ammoCounter);

    // Reload indicator
    this.reloadIndicator = document.createElement('div');
    this.reloadIndicator.id = 'reload-indicator';
    this.reloadIndicator.style.cssText = `
      position: absolute;
      bottom: 60px;
      right: 20px;
      color: #ff4444;
      font-family: 'Courier New', monospace;
      font-size: 18px;
      font-weight: bold;
      text-shadow: 0 0 10px #ff4444, 2px 2px 4px #000;
      pointer-events: none;
      z-index: 5;
      display: none;
    `;
    this.reloadIndicator.textContent = 'RELOADING...';
    document.body.appendChild(this.reloadIndicator);

    // Reload progress bar
    this.reloadBar = document.createElement('div');
    this.reloadBar.id = 'reload-bar';
    this.reloadBar.style.cssText = `
      position: absolute;
      bottom: 85px;
      right: 20px;
      width: 200px;
      height: 8px;
      background: rgba(0, 0, 0, 0.5);
      border: 2px solid #ff4444;
      border-radius: 4px;
      overflow: hidden;
      pointer-events: none;
      z-index: 5;
      display: none;
    `;
    this.reloadFill = document.createElement('div');
    this.reloadFill.style.cssText = `
      width: 0%;
      height: 100%;
      background: linear-gradient(90deg, #ff4444, #ffaa00);
      transition: width 50ms linear;
    `;
    this.reloadBar.appendChild(this.reloadFill);
    document.body.appendChild(this.reloadBar);

    // Hit marker (center of screen)
    this.hitMarker = document.createElement('div');
    this.hitMarker.id = 'hit-marker';
    this.hitMarker.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 24px;
      height: 24px;
      pointer-events: none;
      z-index: 10;
      display: none;
    `;
    this.hitMarker.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" style="filter: drop-shadow(0 0 4px currentColor);">
        <line x1="6" y1="6" x2="12" y2="12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="18" y1="6" x2="12" y2="12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="6" y1="18" x2="12" y2="12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="18" y1="18" x2="12" y2="12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
      </svg>
    `;
    document.body.appendChild(this.hitMarker);

    // Death screen
    this.deathScreen = document.createElement('div');
    this.deathScreen.id = 'death-screen';
    this.deathScreen.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.85);
      display: none;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      color: #ffffff;
      font-family: 'Courier New', monospace;
      pointer-events: none;
      z-index: 20;
    `;
    this.deathScreen.innerHTML = `
      <div style="font-size: 48px; font-weight: bold; color: #ff4444; text-shadow: 0 0 20px #ff4444; margin-bottom: 20px;">YOU DIED</div>
      <div id="respawn-timer" style="font-size: 32px; color: #ffaa00; text-shadow: 0 0 10px #ffaa00;">Respawning in 3...</div>
      <div style="font-size: 16px; color: #888888; margin-top: 20px;">Kills: <span id="death-kills">0</span> | Deaths: <span id="death-deaths">0</span></div>
    `;
    document.body.appendChild(this.deathScreen);
    this.respawnTimerEl = document.getElementById('respawn-timer');
    this.deathKillsEl = document.getElementById('death-kills');
    this.deathDeathsEl = document.getElementById('death-deaths');
  }

  initScoreboard() {
    this.scoreboard = document.createElement('div');
    this.scoreboard.id = 'scoreboard';
    this.scoreboard.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.9);
      border: 2px solid #44aaff;
      border-radius: 8px;
      padding: 20px 30px;
      min-width: 350px;
      font-family: 'Courier New', monospace;
      color: #ffffff;
      pointer-events: none;
      z-index: 15;
      display: none;
      box-shadow: 0 0 30px rgba(68, 170, 255, 0.3);
    `;
    this.scoreboard.innerHTML = `
      <div style="font-size: 20px; font-weight: bold; color: #44aaff; text-align: center; margin-bottom: 16px; border-bottom: 1px solid #44aaff; padding-bottom: 8px;">SCOREBOARD</div>
      <div style="display: grid; grid-template-columns: 80px 1fr 60px 60px; gap: 8px; font-size: 16px; font-weight: bold; color: #888; margin-bottom: 8px; padding: 0 10px;">
        <span>NAME</span><span>COLOR</span><span>KILLS</span><span>DEATHS</span>
      </div>
      <div id="scoreboard-rows"></div>
      <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid #44aaff; text-align: center; color: #888; font-size: 14px;">Hold TAB to keep open</div>
    `;
    document.body.appendChild(this.scoreboard);
    this.scoreboardRows = document.getElementById('scoreboard-rows');
    this.scoreboardVisible = false;
  }

  registerHit() {
    this.hits++;
    this.hitCounter.textContent = `HITS: ${this.hits}`;
    this.hitCounter.style.transform = 'scale(1.2)';
    this.hitCounter.style.color = '#ffffff';
    setTimeout(() => {
      this.hitCounter.style.transform = 'scale(1)';
      this.hitCounter.style.color = '#00ff88';
    }, 100);
  }

  registerKill() {
    this.kills++;
    this.kdCounter.textContent = `KILLS: ${this.kills}  DEATHS: ${this.deaths}`;
  }

  registerDeath() {
    this.deaths++;
    this.kdCounter.textContent = `KILLS: ${this.kills}  DEATHS: ${this.deaths}`;
  }

  updateAmmo(current, max) {
    const currentEl = document.getElementById('ammo-current');
    if (currentEl) currentEl.textContent = current;
    this.ammoCounter.innerHTML = `AMMO: <span id="ammo-current">${current}</span> / ${max}`;

    if (current <= 5 && current > 0) {
      this.ammoCounter.style.color = '#ff8800';
      this.ammoCounter.style.textShadow = '0 0 10px #ff8800, 2px 2px 4px #000';
    } else if (current === 0) {
      this.ammoCounter.style.color = '#ff4444';
      this.ammoCounter.style.textShadow = '0 0 10px #ff4444, 2px 2px 4px #000';
    } else {
      this.ammoCounter.style.color = '#ffaa00';
      this.ammoCounter.style.textShadow = '0 0 10px #ffaa00, 2px 2px 4px #000';
    }
  }

  setReloading(isReloading) {
    if (isReloading) {
      this.reloadIndicator.style.display = 'block';
      this.reloadBar.style.display = 'block';
      this.ammoCounter.style.color = '#ff4444';
      this.ammoCounter.style.textShadow = '0 0 10px #ff4444, 2px 2px 4px #000';
    } else {
      this.reloadIndicator.style.display = 'none';
      this.reloadBar.style.display = 'none';
    }
  }

  updateReloadProgress(progress) {
    this.reloadFill.style.width = `${progress * 100}%`;
  }

  updatePlayerCount(count) {
    this.playerCount.textContent = `PLAYERS: ${count}`;
  }

  // Health bar
  updateHealth(health, maxHealth) {
    this.health = health;
    this.maxHealth = maxHealth;
    const percent = Math.max(0, health / maxHealth);
    this.healthFill.style.width = `${percent * 100}%`;
    this.healthText.textContent = `${health} / ${maxHealth}`;

    // Color based on health
    if (percent > 0.6) {
      this.healthFill.style.background = 'linear-gradient(90deg, #00ff88, #44ff44)';
      this.healthFill.style.boxShadow = '0 0 10px #00ff88';
    } else if (percent > 0.3) {
      this.healthFill.style.background = 'linear-gradient(90deg, #ffaa00, #ff8800)';
      this.healthFill.style.boxShadow = '0 0 10px #ffaa00';
    } else {
      this.healthFill.style.background = 'linear-gradient(90deg, #ff4444, #ff0000)';
      this.healthFill.style.boxShadow = '0 0 15px #ff4444';
    }
  }

  // Hit marker: show briefly at center
  showHitMarker(isHeadshot = false) {
    this.hitMarker.style.display = 'block';
    this.hitMarker.style.color = isHeadshot ? '#ff4444' : '#ffff00';
    this.hitMarker.style.transform = 'translate(-50%, -50%) scale(1)';
    this.hitMarker.style.opacity = '1';

    // Animate
    let scale = 1;
    let opacity = 1;
    const animate = () => {
      scale += 0.15;
      opacity -= 0.15;
      if (opacity <= 0) {
        this.hitMarker.style.display = 'none';
        return;
      }
      this.hitMarker.style.transform = `translate(-50%, -50%) scale(${scale})`;
      this.hitMarker.style.opacity = opacity;
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  // Death screen with respawn countdown
  showDeathScreen(kills, deaths) {
    this.isDead = true;
    this.deathKillsEl.textContent = kills;
    this.deathDeathsEl.textContent = deaths;
    this.deathScreen.style.display = 'flex';
    this.respawnTime = 3;
    this.updateRespawnTimer();
  }

  updateRespawnTimer() {
    if (!this.isDead) return;
    this.respawnTime = Math.max(0, this.respawnTime - 0.1);
    this.respawnTimerEl.textContent = `Respawning in ${Math.ceil(this.respawnTime)}...`;
    if (this.respawnTime > 0) {
      setTimeout(() => this.updateRespawnTimer(), 100);
    }
  }

  hideDeathScreen() {
    this.isDead = false;
    this.deathScreen.style.display = 'none';
  }

  // Scoreboard
  updateScoreboard(players) {
    // players: array of { id, name, kills, deaths, color, health, isDead }
    this.scoreboardRows.innerHTML = '';
    players.forEach(p => {
      const row = document.createElement('div');
      row.style.cssText = `
        display: grid; grid-template-columns: 80px 1fr 60px 60px; gap: 8px;
        font-size: 16px; padding: 4px 10px;
        ${p.id === this.myId ? 'background: rgba(68, 170, 255, 0.15);' : ''}
        ${p.isDead ? 'opacity: 0.5;' : ''}
      `;
      const colorBox = `<span style="display: inline-block; width: 16px; height: 16px; background: #${p.color.toString(16).padStart(6, '0')}; border: 1px solid #444; border-radius: 2px; vertical-align: middle; margin-right: 8px;"></span>`;
      row.innerHTML = `
        <span>${p.name}</span>
        <span>${colorBox}<span>${p.name}</span></span>
        <span>${p.kills}</span>
        <span>${p.deaths}</span>
      `;
      this.scoreboardRows.appendChild(row);
    });
  }

  showScoreboard(myId) {
    this.myId = myId;
    this.scoreboardVisible = true;
    this.scoreboard.style.display = 'block';
  }

  hideScoreboard() {
    this.scoreboardVisible = false;
    this.scoreboard.style.display = 'none';
  }

  isScoreboardVisible() {
    return this.scoreboardVisible;
  }
}