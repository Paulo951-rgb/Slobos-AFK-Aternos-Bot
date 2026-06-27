const mineflayer = require('mineflayer');
const express = require('express');

const config = require('./settings.json');

const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (_, res) => {
  res.send('Bot online');
});

app.listen(PORT, () => {
  console.log(`[Server] HTTP server started on port ${PORT}`);
});

let bot = null;
let reconnecting = false;
let antiAfk = null;

// ======================================================

function startAntiAfk() {

  if (antiAfk) clearInterval(antiAfk);

  antiAfk = setInterval(() => {

    if (!bot || !bot.entity) return;

    bot.setControlState('jump', true);

    setTimeout(() => {
      if (bot) {
        bot.setControlState('jump', false);
      }
    }, 500);

  }, 30000);
}

// ======================================================

function connectBot() {

  if (bot || reconnecting) {
    console.log('[Bot] Already running');
    return;
  }

  console.log('[Bot] Creating bot...');

  reconnecting = true;

  bot = mineflayer.createBot({
    host: config.server.ip,
    port: config.server.port,
    username: config['bot-account'].username,
    auth: config['bot-account'].type,
    version: config.server.version,

    connectTimeout: 20000,
    checkTimeoutInterval: 30000
  });

  const timeout = setTimeout(() => {

    console.log('[Bot] Spawn timeout');

    try {
      bot.end();
    } catch {}

  }, 40000);

  bot.once('spawn', () => {

    clearTimeout(timeout);

    reconnecting = false;

    console.log('[Bot] Connected successfully');

    startAntiAfk();

    if (config.utils['auto-auth'].enabled) {

      const password =
        config.utils['auto-auth'].password;

      setTimeout(() => {

        bot.chat(`/login ${password}`);

        console.log('[Auth] Login sent');

      }, 3000);
    }
  });

  bot.on('end', () => {

    console.log('[Bot] Disconnected');

    cleanup();

    setTimeout(() => {
      connectBot();
    }, 15000);
  });

  bot.on('error', (err) => {

    console.log(`[Bot] Error: ${err.code || err.message}`);
  });

  bot.on('kicked', (reason) => {

    console.log(`[Bot] Kicked: ${reason}`);
  });
}

// ======================================================

function cleanup() {

  reconnecting = false;

  if (antiAfk) {
    clearInterval(antiAfk);
    antiAfk = null;
  }

  if (bot) {
    try {
      bot.removeAllListeners();
    } catch {}
  }

  bot = null;
}

// ======================================================

console.log('====================================');
console.log(' Minecraft AFK Bot Stable Edition');
console.log('====================================');

setTimeout(() => {
  connectBot();
}, 30000);
