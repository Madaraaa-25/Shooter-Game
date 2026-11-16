export class UI {
  constructor() {
    this.hits = 0;
    this.createHUD();
  }

  createHUD() {
    // Hit counter
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

    // Ammo counter
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
  }

  registerHit() {
    this.hits++;
    this.hitCounter.textContent = `HITS: ${this.hits}`;

    // Brief flash effect
    this.hitCounter.style.transform = 'scale(1.2)';
    this.hitCounter.style.color = '#ffffff';
    setTimeout(() => {
      this.hitCounter.style.transform = 'scale(1)';
      this.hitCounter.style.color = '#00ff88';
    }, 100);
  }

  updateAmmo(current, max) {
    const currentEl = document.getElementById('ammo-current');
    if (currentEl) {
      currentEl.textContent = current;
    }
    this.ammoCounter.innerHTML = `AMMO: <span id="ammo-current">${current}</span> / ${max}`;

    // Color change when low
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
    // progress goes from 0 to 1
    this.reloadFill.style.width = `${progress * 100}%`;
  }
}