import { rememberRecent } from '../src/core/state.js';

class OregonTrailGame {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.goalDistance = 2000;
    this.maxLogEntries = 12;
    this.lastTravelMiles = 0;
    this.namePool = ['Mae', 'Jonah', 'Ruth', 'Eli', 'Ada', 'Silas', 'June', 'Nora', 'Caleb', 'Ivy'];
    this.storeCatalog = {
      food: {
        label: 'Food Crate',
        price: 25,
        amount: 100,
        unitLabel: 'food',
        description: 'Dried fruit, flour, beans, and salted meat.',
      },
      oxen: {
        label: 'Trail Ox',
        price: 40,
        amount: 1,
        unitLabel: 'ox',
        description: 'Adds pulling power and faster daily travel.',
      },
      ammo: {
        label: 'Ammo Box',
        price: 10,
        amount: 20,
        unitLabel: 'ammo',
        description: 'Used for hunting on the trail.',
      },
      parts: {
        label: 'Wagon Part',
        price: 20,
        amount: 1,
        unitLabel: 'part',
        description: 'Spare axle, wheel, or tongue for breakdowns.',
      },
    };
    this.state = this.createInitialState();

    this.handleClick = this.handleClick.bind(this);
    this.handleChange = this.handleChange.bind(this);
    this.handleInput = this.handleInput.bind(this);
  }

  createInitialState() {
    return {
      day: 0,
      distance: 0,
      party: this.createDefaultParty(),
      inventory: {
        money: 800,
        food: 0,
        oxen: 0,
        ammo: 0,
        parts: 0,
      },
      settings: {
        pace: 'steady',
        rations: 'filling',
      },
      currentScreen: 'start',
      previousScreen: 'start',
      activeEvent: null,
      outcome: null,
      log: ['Independence, Missouri: gather your party, then buy supplies before heading west.'],
    };
  }

  createDefaultParty() {
    return this.namePool.slice(0, 5).map((name) => ({
      name,
      isAlive: true,
      health: 100,
    }));
  }

  init() {
    if (!this.container) {
      throw new Error('OregonTrailGame requires a valid container element.');
    }

    rememberRecent('oregontrail');
    this.container.addEventListener('click', this.handleClick);
    this.container.addEventListener('change', this.handleChange);
    this.container.addEventListener('input', this.handleInput);
    this.render();
  }

  handleClick(event) {
    const actionTarget = event.target.closest('[data-action]');
    if (!actionTarget || !this.container.contains(actionTarget)) return;

    const { action, item } = actionTarget.dataset;

    switch (action) {
      case 'start-store':
        this.state.currentScreen = 'store';
        this.updateLog('You step into the general store with $800 in cash.');
        this.render();
        break;
      case 'reset-party':
        this.resetPartyNames();
        this.render();
        break;
      case 'return-menu':
        this.state.currentScreen = 'start';
        this.state.activeEvent = null;
        this.state.previousScreen = 'start';
        this.render();
        break;
      case 'buy-supply':
        this.purchaseSupply(item);
        break;
      case 'leave-store':
        this.leaveStore();
        break;
      case 'continue-trail':
        this.nextDay();
        break;
      case 'rest':
        this.rest();
        break;
      case 'hunt':
        this.hunt();
        break;
      case 'dismiss-event':
        this.dismissEvent();
        break;
      case 'restart':
        this.restart();
        break;
      default:
        break;
    }
  }

  handleChange(event) {
    const { setting } = event.target.dataset;
    if (!setting) return;

    if (setting === 'pace') {
      this.state.settings.pace = event.target.value;
      this.updateLog(`Pace set to ${event.target.value}.`);
    }

    if (setting === 'rations') {
      this.state.settings.rations = event.target.value;
      this.updateLog(`Rations changed to ${event.target.value}.`);
    }

    this.render();
  }

  handleInput(event) {
    const index = event.target.dataset.partyIndex;
    if (typeof index === 'undefined') return;

    const partyIndex = Number(index);
    if (!Number.isInteger(partyIndex) || !this.state.party[partyIndex]) return;

    const cleaned = String(event.target.value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 16);

    this.state.party[partyIndex].name = cleaned || `Traveler ${partyIndex + 1}`;
  }

  resetPartyNames() {
    const shuffled = [...this.namePool].sort(() => Math.random() - 0.5);
    this.state.party = shuffled.slice(0, 5).map((name) => ({
      name,
      isAlive: true,
      health: 100,
    }));
    this.updateLog('You reshuffle the party roster before leaving town.');
  }

  purchaseSupply(itemKey) {
    const item = this.storeCatalog[itemKey];
    if (!item) return;

    if (this.state.inventory.money < item.price) {
      this.updateLog(`Not enough money for ${item.label.toLowerCase()}.`);
      this.render();
      return;
    }

    this.state.inventory.money -= item.price;
    this.state.inventory[itemKey] += item.amount;
    this.updateLog(`Bought ${item.amount} ${item.unitLabel} for $${item.price}.`);
    this.render();
  }

  leaveStore() {
    if (this.state.inventory.oxen < 1) {
      this.showEvent('Wagon Still Parked', 'You cannot leave Independence without at least one ox to pull the wagon.');
      this.render();
      return;
    }

    this.state.currentScreen = 'trail';
    this.state.previousScreen = 'trail';
    this.updateLog('The wagon train rolls west. Oregon is 2,000 miles away.');
    this.render();
  }

  nextDay() {
    if (!this.canTakeTrailAction()) return;

    this.state.day += 1;
    this.consumeFood();
    if (this.getLivingParty().length === 0) {
      this.checkWinLoss();
      this.render();
      return;
    }

    const miles = this.calculateDailyProgress();
    this.lastTravelMiles = miles;

    if (miles > 0) {
      this.state.distance = Math.min(this.goalDistance, this.state.distance + miles);
      this.updateLog(`You travel ${miles} miles today at a ${this.state.settings.pace} pace.`);
    } else {
      this.updateLog('The wagon does not move. Without oxen, the trail only gets longer.');
    }

    if (Math.random() < 0.15) {
      this.randomEvent();
    }

    this.checkWinLoss();
    this.render();
  }

  rest() {
    if (!this.canTakeTrailAction()) return;

    this.state.day += 1;
    this.consumeFood();
    if (this.getLivingParty().length === 0) {
      this.checkWinLoss();
      this.render();
      return;
    }

    for (const member of this.getLivingParty()) {
      const healAmount = this.randomInt(8, 16);
      member.health = this.clamp(member.health + healAmount, 0, 100);
    }

    this.updateLog('The party rests for a day, trading miles for better health.');
    this.checkWinLoss();
    this.render();
  }

  hunt() {
    if (!this.canTakeTrailAction()) return;

    if (this.state.inventory.ammo < 10) {
      this.updateLog('You need at least 10 ammo to hunt.');
      this.render();
      return;
    }

    this.state.day += 1;
    this.state.inventory.ammo -= 10;
    this.consumeFood();
    if (this.getLivingParty().length === 0) {
      this.checkWinLoss();
      this.render();
      return;
    }

    if (Math.random() < 0.65) {
      this.state.inventory.food += 50;
      this.updateLog('The hunt succeeds. You return with 50 food.');
    } else {
      this.updateLog('The hunt fails. You spend ammo and come back empty-handed.');
    }

    this.checkWinLoss();
    this.render();
  }

  consumeFood() {
    const livingParty = this.getLivingParty();
    if (livingParty.length === 0) return;

    const rationMap = {
      meager: 2,
      filling: 3,
      hearty: 4,
    };
    const rationCost = rationMap[this.state.settings.rations] || rationMap.filling;
    const requiredFood = livingParty.length * rationCost;

    if (this.state.inventory.food >= requiredFood) {
      this.state.inventory.food -= requiredFood;
      return;
    }

    const shortage = requiredFood - this.state.inventory.food;
    this.state.inventory.food = 0;
    this.updateLog('Food stores hit zero. The party is starving.');

    for (const member of livingParty) {
      const penalty = 18 + (shortage * 3) + this.randomInt(0, 8);
      this.applyHealthPenalty(member, penalty, 'after the food ran out');
    }
  }

  calculateDailyProgress() {
    const oxen = this.state.inventory.oxen;
    if (oxen <= 0) return 0;

    const paceMultiplier = {
      leisurely: 0.8,
      steady: 1,
      grueling: 1.2,
    }[this.state.settings.pace] || 1;

    const baseMiles = (oxen * 7) + 8;
    const variance = 0.85 + (Math.random() * 0.3);
    return Math.max(0, Math.round(baseMiles * paceMultiplier * variance));
  }

  randomEvent() {
    const roll = Math.random();

    if (roll < 0.38) {
      this.handleDiseaseEvent();
      return;
    }

    if (roll < 0.63) {
      this.handleBreakdownEvent();
      return;
    }

    if (roll < 0.83) {
      this.handleThievesEvent();
      return;
    }

    this.handleGoodFortuneEvent();
  }

  handleDiseaseEvent() {
    const member = this.getRandomLivingMember();
    if (!member) return;

    const illness = Math.random() < 0.5 ? 'dysentery' : 'cholera';
    const penalty = this.randomInt(24, 42);
    this.applyHealthPenalty(member, penalty, `from ${illness}`);
    this.updateLog(`${member.name} is struck by ${illness}.`);
    this.showEvent('Disease on the Trail', `${member.name} comes down with ${illness} and loses ${penalty} health.`);
  }

  handleBreakdownEvent() {
    if (this.state.inventory.parts > 0) {
      this.state.inventory.parts -= 1;
      this.updateLog('A wagon wheel snaps, but a spare part gets the train moving again.');
      this.showEvent('Wagon Breakdown', 'A wheel breaks on rough ground. You spend 1 wagon part to repair it and keep moving.');
      return;
    }

    this.state.distance = Math.max(0, this.state.distance - this.lastTravelMiles);
    this.updateLog('The wagon breaks down and you lose the day repairing it by hand.');
    this.showEvent('Wagon Breakdown', 'Without a spare part, the wagon halts and today\'s progress is lost.');
  }

  handleThievesEvent() {
    const stolen = Math.min(this.state.inventory.food, this.randomInt(20, 80));
    this.state.inventory.food = Math.max(0, this.state.inventory.food - stolen);

    if (stolen > 0) {
      this.updateLog(`Thieves raid camp and steal ${stolen} food.`);
      this.showEvent('Night Thieves', `Sneaks slip through camp and steal ${stolen} food before dawn.`);
      return;
    }

    this.updateLog('Thieves creep into camp but find almost nothing to take.');
    this.showEvent('Night Thieves', 'Thieves arrive, but your food stores are too empty to tempt them.');
  }

  handleGoodFortuneEvent() {
    const berries = this.randomInt(30, 80);
    this.state.inventory.food += berries;
    this.updateLog(`The party finds berry patches and gathers ${berries} food.`);
    this.showEvent('Good Fortune', `Wild berries and edible roots add ${berries} food to your stores.`);
  }

  applyHealthPenalty(member, amount, reason) {
    if (!member || !member.isAlive) return;

    member.health = this.clamp(member.health - amount, 0, 100);
    if (member.health > 0) return;

    member.isAlive = false;
    this.updateLog(`${member.name} dies ${reason}.`);
  }

  checkWinLoss() {
    if (this.state.distance >= this.goalDistance) {
      this.state.distance = this.goalDistance;
      this.state.activeEvent = null;
      this.state.outcome = 'win';
      this.state.currentScreen = 'end';
      this.updateLog('You reach Oregon and bring the wagon party to safety.');
      return true;
    }

    if (this.getLivingParty().length === 0) {
      this.state.activeEvent = null;
      this.state.outcome = 'loss';
      this.state.currentScreen = 'end';
      this.updateLog('No one survives the trail. The journey ends here.');
      return true;
    }

    return false;
  }

  canTakeTrailAction() {
    if (this.state.currentScreen !== 'trail') return false;
    if (this.state.outcome) return false;

    if (this.getLivingParty().length === 0) {
      this.checkWinLoss();
      this.render();
      return false;
    }

    return true;
  }

  showEvent(title, body) {
    this.state.activeEvent = { title, body };
    this.state.previousScreen = this.state.currentScreen === 'event' ? this.state.previousScreen : this.state.currentScreen;
    this.state.currentScreen = 'event';
  }

  dismissEvent() {
    if (!this.state.activeEvent) return;

    const returnScreen = this.state.previousScreen || 'trail';
    this.state.activeEvent = null;
    this.state.currentScreen = this.state.outcome ? 'end' : returnScreen;
    this.render();
  }

  restart() {
    this.state = this.createInitialState();
    this.lastTravelMiles = 0;
    this.render();
  }

  updateLog(message) {
    if (!message) return;

    const prefix = this.state.day > 0 ? `Day ${this.state.day}: ` : '';
    this.state.log = [`${prefix}${message}`, ...this.state.log].slice(0, this.maxLogEntries);
  }

  getLivingParty() {
    return this.state.party.filter((member) => member.isAlive);
  }

  getRandomLivingMember() {
    const livingParty = this.getLivingParty();
    if (livingParty.length === 0) return null;
    return livingParty[this.randomInt(0, livingParty.length - 1)];
  }

  getAverageHealth() {
    const livingParty = this.getLivingParty();
    if (livingParty.length === 0) return 0;
    const total = livingParty.reduce((sum, member) => sum + member.health, 0);
    return Math.round(total / livingParty.length);
  }

  render() {
    const activeScreen = this.state.currentScreen === 'event'
      ? (this.state.previousScreen || 'trail')
      : this.state.currentScreen;

    let screenMarkup = '';

    switch (activeScreen) {
      case 'start':
        screenMarkup = this.renderMainMenu();
        break;
      case 'store':
        screenMarkup = this.renderStore();
        break;
      case 'trail':
        screenMarkup = this.renderTrailDashboard();
        break;
      case 'end':
        screenMarkup = this.renderEndScreen();
        break;
      default:
        screenMarkup = this.renderMainMenu();
        break;
    }

    this.container.innerHTML = `
      <div class="ot-shell">
        <div class="ot-frame">
          <div class="ot-topline">
            <a class="ot-home-link" href="/">Return to Arcade</a>
            <div class="ot-badge">Goal: ${this.goalDistance} miles</div>
          </div>
          ${screenMarkup}
        </div>
        ${this.renderEventModal()}
      </div>
    `;
  }

  renderMainMenu() {
    const partyInputs = this.state.party.map((member, index) => `
      <label class="ot-field">
        <span class="ot-label">Traveler ${index + 1}</span>
        <input
          class="ot-input"
          type="text"
          maxlength="16"
          value="${this.escapeHtml(member.name)}"
          data-party-index="${index}"
        />
      </label>
    `).join('');

    return `
      <header>
        <p class="ot-kicker">1848 Wagon Journal</p>
        <h1 class="ot-title">THE OREGON TRAIL</h1>
        <p class="ot-subtitle">Guide five travelers across 2,000 miles of rough country with only cash, supplies, and your best judgment.</p>
      </header>

      <div class="ot-grid">
        <section class="ot-panel">
          <h2 class="ot-panel-title">Party Roster</h2>
          <p class="ot-copy">Rename the travelers, then head into town to buy food, oxen, ammunition, and spare parts.</p>
          <div class="ot-form-grid">
            ${partyInputs}
          </div>
          <div class="ot-action-row" style="margin-top:16px;">
            <button class="ot-button" type="button" data-action="reset-party">Randomize Names</button>
            <button class="ot-button ot-button--primary" type="button" data-action="start-store">Enter General Store</button>
          </div>
        </section>

        <aside class="ot-panel">
          <h2 class="ot-panel-title">Trail Notes</h2>
          <ul class="ot-list">
            <li>Continue on trail advances one day, eats food, and may trigger an event.</li>
            <li>Rest advances one day, heals the party, and still consumes food.</li>
            <li>Hunt costs 10 ammo. A successful hunt brings back 50 food.</li>
            <li>If food reaches zero, health drops fast and travelers can die.</li>
          </ul>
          <div class="ot-log">
            <h2 class="ot-panel-title">Trail Log</h2>
            ${this.renderLogEntries()}
          </div>
        </aside>
      </div>
    `;
  }

  renderStore() {
    const cards = Object.entries(this.storeCatalog).map(([key, item]) => `
      <article class="ot-store-card">
        <h3>${this.escapeHtml(item.label)}</h3>
        <p class="ot-store-meta">${this.escapeHtml(item.description)}</p>
        <div class="ot-store-row">
          <span class="ot-store-price">$${item.price} for ${item.amount} ${this.escapeHtml(item.unitLabel)}</span>
          <button class="ot-store-button" type="button" data-action="buy-supply" data-item="${key}">Buy</button>
        </div>
      </article>
    `).join('');

    return `
      <header>
        <p class="ot-kicker">Independence General Store</p>
        <h1 class="ot-title">OUTFIT THE WAGON</h1>
        <p class="ot-subtitle">Spend carefully. The trail is long, and spare parts feel expensive right up until the wheel snaps.</p>
      </header>

      <div class="ot-grid">
        <section class="ot-panel">
          <div class="ot-summary-row">
            <div class="ot-summary-card">
              <h3>Cash on Hand</h3>
              <p>$${this.state.inventory.money}</p>
            </div>
            <div class="ot-summary-card">
              <h3>Recommended</h3>
              <p>At least 3 oxen, 600 food, 20 ammo, and 1 part before departure.</p>
            </div>
          </div>

          <div class="ot-store-grid">
            ${cards}
          </div>

          <div class="ot-action-row" style="margin-top:16px;">
            <button class="ot-button" type="button" data-action="return-menu">Back to Party</button>
            <button class="ot-button ot-button--primary" type="button" data-action="leave-store">Leave for Oregon</button>
          </div>
        </section>

        <aside class="ot-panel">
          <h2 class="ot-panel-title">Wagon Inventory</h2>
          ${this.renderInventorySummary()}
          <div class="ot-log">
            <h2 class="ot-panel-title">Trail Log</h2>
            ${this.renderLogEntries()}
          </div>
        </aside>
      </div>
    `;
  }

  renderTrailDashboard() {
    const progress = Math.round((this.state.distance / this.goalDistance) * 100);

    return `
      <header>
        <p class="ot-kicker">On the Trail</p>
        <h1 class="ot-title">WAGON DASHBOARD</h1>
        <p class="ot-subtitle">Day ${this.state.day}. The party has covered ${this.state.distance} of ${this.goalDistance} miles.</p>
        <div class="ot-progress" aria-label="Trail progress">
          <div class="ot-progress-fill" style="width:${progress}%;"></div>
        </div>
      </header>

      <div class="ot-stat-grid">
        ${this.renderStat('Day', this.state.day)}
        ${this.renderStat('Distance', `${this.state.distance} mi`)}
        ${this.renderStat('Food', this.state.inventory.food)}
        ${this.renderStat('Oxen', this.state.inventory.oxen)}
        ${this.renderStat('Ammo', this.state.inventory.ammo)}
        ${this.renderStat('Parts', this.state.inventory.parts)}
        ${this.renderStat('Cash', `$${this.state.inventory.money}`)}
        ${this.renderStat('Avg Health', `${this.getAverageHealth()}%`)}
      </div>

      <div class="ot-action-row" style="margin-top:16px;">
        <button class="ot-button ot-button--primary" type="button" data-action="continue-trail">Continue on Trail</button>
        <button class="ot-button" type="button" data-action="rest">Rest</button>
        <button class="ot-button" type="button" data-action="hunt">Hunt</button>
      </div>

      <div class="ot-setting-row" style="margin-top:16px;">
        <label class="ot-field">
          <span class="ot-label">Pace</span>
          <select class="ot-select" data-setting="pace">
            <option value="leisurely" ${this.state.settings.pace === 'leisurely' ? 'selected' : ''}>leisurely</option>
            <option value="steady" ${this.state.settings.pace === 'steady' ? 'selected' : ''}>steady</option>
            <option value="grueling" ${this.state.settings.pace === 'grueling' ? 'selected' : ''}>grueling</option>
          </select>
        </label>
        <label class="ot-field">
          <span class="ot-label">Rations</span>
          <select class="ot-select" data-setting="rations">
            <option value="meager" ${this.state.settings.rations === 'meager' ? 'selected' : ''}>meager</option>
            <option value="filling" ${this.state.settings.rations === 'filling' ? 'selected' : ''}>filling</option>
            <option value="hearty" ${this.state.settings.rations === 'hearty' ? 'selected' : ''}>hearty</option>
          </select>
        </label>
      </div>

      <div class="ot-grid ot-grid--trail">
        <section class="ot-panel">
          <h2 class="ot-panel-title">Party Status</h2>
          <div class="ot-party-grid">
            ${this.renderPartyCards()}
          </div>
        </section>

        <aside class="ot-panel">
          <h2 class="ot-panel-title">Wagon Inventory</h2>
          ${this.renderInventorySummary()}
          <div class="ot-log">
            <h2 class="ot-panel-title">Trail Log</h2>
            ${this.renderLogEntries()}
          </div>
        </aside>
      </div>
    `;
  }

  renderEndScreen() {
    const won = this.state.outcome === 'win';
    const summaryClass = won ? 'ot-end-banner' : 'ot-end-banner ot-end-banner--loss';
    const summaryCopy = won
      ? `After ${this.state.day} days on the trail, the wagon reaches Oregon with ${this.getLivingParty().length} survivors.`
      : `The trail takes the entire party after ${this.state.day} days and ${this.state.distance} miles.`;

    return `
      <header>
        <p class="ot-kicker">${won ? 'Journey Complete' : 'Trail Lost'}</p>
        <h1 class="ot-title">${won ? 'OREGON AT LAST' : 'THE TRAIL WINS'}</h1>
        <p class="ot-subtitle">${summaryCopy}</p>
      </header>

      <div class="${summaryClass}">
        ${won ? 'Your wagon creaks into Oregon with stories to tell.' : 'The wagon never reaches its destination.'}
      </div>

      <div class="ot-grid" style="margin-top:20px;">
        <section class="ot-panel">
          <h2 class="ot-panel-title">Final Party</h2>
          <div class="ot-party-grid">
            ${this.renderPartyCards()}
          </div>
        </section>

        <aside class="ot-panel">
          <h2 class="ot-panel-title">Final Tally</h2>
          ${this.renderInventorySummary()}
          <div class="ot-log">
            <h2 class="ot-panel-title">Trail Log</h2>
            ${this.renderLogEntries()}
          </div>
        </aside>
      </div>

      <div class="ot-action-row" style="margin-top:16px;">
        <button class="ot-button ot-button--primary" type="button" data-action="restart">Start New Journey</button>
      </div>
    `;
  }

  renderInventorySummary() {
    return `
      <div class="ot-stat-grid">
        ${this.renderStat('Money', `$${this.state.inventory.money}`)}
        ${this.renderStat('Food', this.state.inventory.food)}
        ${this.renderStat('Oxen', this.state.inventory.oxen)}
        ${this.renderStat('Ammo', this.state.inventory.ammo)}
        ${this.renderStat('Parts', this.state.inventory.parts)}
      </div>
    `;
  }

  renderPartyCards() {
    return this.state.party.map((member) => {
      const statusClass = member.isAlive ? 'ot-status-chip' : 'ot-status-chip ot-status-chip--dead';
      const cardClass = member.isAlive ? 'ot-party-card' : 'ot-party-card ot-party-card--dead';
      const fillClass = member.health <= 30 ? 'ot-meter-fill ot-meter-fill--danger' : 'ot-meter-fill';

      return `
        <article class="${cardClass}">
          <div class="ot-party-head">
            <h3>${this.escapeHtml(member.name)}</h3>
            <span class="${statusClass}">${member.isAlive ? 'Alive' : 'Dead'}</span>
          </div>
          <p>Health: ${member.health}%</p>
          <div class="ot-meter" aria-hidden="true">
            <div class="${fillClass}" style="width:${member.health}%;"></div>
          </div>
        </article>
      `;
    }).join('');
  }

  renderStat(label, value) {
    return `
      <div class="ot-stat">
        <span class="ot-stat-label">${this.escapeHtml(label)}</span>
        <span class="ot-stat-value">${this.escapeHtml(String(value))}</span>
      </div>
    `;
  }

  renderLogEntries() {
    return `
      <ol class="ot-log-list">
        ${this.state.log.map((entry) => `<li>${this.escapeHtml(entry)}</li>`).join('')}
      </ol>
    `;
  }

  renderEventModal() {
    if (!this.state.activeEvent) return '';

    return `
      <div class="ot-modal-backdrop">
        <div class="ot-modal" role="dialog" aria-modal="true" aria-labelledby="ot-event-title">
          <h2 id="ot-event-title">${this.escapeHtml(this.state.activeEvent.title)}</h2>
          <p>${this.escapeHtml(this.state.activeEvent.body)}</p>
          <button class="ot-button ot-button--primary" type="button" data-action="dismiss-event">Continue</button>
        </div>
      </div>
    `;
  }

  escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  randomInt(min, max) {
    const low = Math.ceil(min);
    const high = Math.floor(max);
    return Math.floor(Math.random() * (high - low + 1)) + low;
  }
}

const game = new OregonTrailGame('ot-container');
game.init();
