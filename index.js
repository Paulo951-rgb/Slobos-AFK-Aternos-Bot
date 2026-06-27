const mineflayer = require('mineflayer');
const { pathfinder, Movements } = require('mineflayer-pathfinder');
const express = require('express');
const http = require('http');
const https = require('https');

const config = require('./settings.json');

// ============================================================
// EXPRESS SERVER (Render keep alive)
// ============================================================

const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
  res.send('Minecraft AFK Bot is running.');
});

app.get('/health', (req, res) => {
  res.json({
    status: botState.connected ? 'connected' : 'disconnected',
    reconnectAttempts: botState.reconnectAttempts
  });
});

app.get('/ping', (req, res) => {
  res.send('pong');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] HTTP server started on port ${PORT}`);
});

// ============================================================
// SELF PING
// ============================================================

function startSelfPing() {
  setInterval(() => {
    try {
      const url =
        process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

      const protocol = url.startsWith('https') ? https : http;

      protocol
        .get(`${url}/ping`, () => {})
        .on('error', () => {});
    } catch (e) {}
  }, 10 * 60 * 1000);
}

startSelfPing();

// ============================================================
// BOT STATE
// ============================================================

let bot = null;
let reconnectTimeout = null;
let antiAfkInterval = null;
let movementInterval = null;
let isReconnecting = false;

const botState = {
  connected: false,
  reconnectAttempts: 0
};

// ============================================================
// RECONNECT DELAY
// ============================================================

function getReconnectDelay() {
  const base = 10000;

  const extra = Math.min(
    botState.reconnectAttempts * 5000,
    30000
  );

  return base + extra;
}

// ============================================================
// CLEANUP
// ============================================================

function cleanupBot() {
  if (antiAfkInterval) {
    clearInterval(antiAfkInterval);
    antiAfkInterval = null;
  }

  if (movementInterval) {
    clearInterval(movementInterval);
    movementInterval = null;
  }

  if (bot) {
    try {
      bot.removeAllListeners();
      bot.quit();
    } catch (e) {}
  }

  bot = null;
}

// ============================================================
// ANTI AFK
// ============================================================

function startAntiAfk() {
  antiAfkInterval = setInterval(() => {
    if (!bot || !bot.entity) return;

    bot.setControlState('jump', true);

    setTimeout(() => {
      if (bot) {
        bot.setControlState('jump', false);
      }
    }, 300);
  }, 30000);

  movementInterval = setInterval(() => {
    if (!bot || !bot.entity) return;

    const actions = ['forward', 'left', 'right'];

    const action =
      actions[Math.floor(Math.random() * actions.length)];

    bot.setControlState(action, true);

    setTimeout(() => {
      if (bot) {
        bot.setControlState(action, false);
      }
    }, 1500);

  }, 45000);
}

// ============================================================
// RECONNECT
// ============================================================

function scheduleReconnect(reason = 'unknown') {
  if (isReconnecting) return;

  isReconnecting = true;

  botState.reconnectAttempts++;

  const delay = getReconnectDelay();

  console.log(
    `[Bot] Reconnecting in ${delay / 1000}s (reason: ${reason})`
  );

  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
  }

  reconnectTimeout = setTimeout(() => {
    isReconnecting = false;
    createBot();
  }, delay);
}

// ============================================================
// CREATE BOT
// ============================================================

function createBot() {

  cleanupBot();

  console.log('[Bot] Creating bot instance...');
  console.log(
    `[Bot] Connecting to ${config.server.ip}:${config.server.port}`
  );

  try {

    bot = mineflayer.createBot({
      host: config.server.ip,
      port: config.server.port,
      username: config['bot-account'].username,
      auth: config['bot-account'].type,
      version: config.server.version,

      hideErrors: false,

      checkTimeoutInterval: 60000,
      connectTimeout: 30000
    });

    bot.loadPlugin(pathfinder);

    const connectionTimeout = setTimeout(() => {

      if (!botState.connected) {

        console.log(
          '[Bot] Connection timeout - no spawn received'
        );

        try {
          bot.quit();
        } catch (e) {}

        scheduleReconnect('spawn-timeout');
      }

    }, 45000);

    // ========================================================
    // SPAWN
    // ========================================================

    bot.once('spawn', () => {

      clearTimeout(connectionTimeout);

      console.log('[Bot] [+] Successfully spawned on server!');

      botState.connected = true;
      botState.reconnectAttempts = 0;
      isReconnecting = false;

      const mcData = require('minecraft-data')(
        config.server.version
      );

      const defaultMove = new Movements(bot, mcData);

      bot.pathfinder.setMovements(defaultMove);

      startAntiAfk();

      // AUTO AUTH

      if (config.utils['auto-auth'].enabled) {

        const password =
          config.utils['auto-auth'].password;

        setTimeout(() => {

          bot.chat(`/register ${password} ${password}`);
          bot.chat(`/login ${password}`);

          console.log('[Auth] Sent login commands');

        }, 3000);
      }
    });

    // ========================================================
    // EVENTS
    // ========================================================

    bot.on('end', () => {

      console.log('[Bot] Disconnected');

      botState.connected = false;

      scheduleReconnect('end');
    });

    bot.on('kicked', (reason) => {

      console.log(`[Bot] Kicked: ${reason}`);

      botState.connected = false;

      scheduleReconnect('kicked');
    });

    bot.on('error', (err) => {

      console.log(`[Bot] Error: ${err.message}`);
    });

  } catch (err) {

    console.log(
      `[Bot] Failed to create bot: ${err.message}`
    );

    scheduleReconnect('create-error');
  }
}

// ============================================================
// START
// ============================================================

console.log('='.repeat(50));
console.log(' Minecraft AFK Bot v3.0');
console.log('='.repeat(50));
console.log(
  `Server: ${config.server.ip}:${config.server.port}`
);
console.log(
  `Version: ${config.server.version}`
);
console.log('='.repeat(50));

console.log(
  '[Bot] Waiting 30 seconds for Aternos server to fully load...'
);

setTimeout(() => {
  createBot();
}, 30000);
