const mineflayer = require('mineflayer');
const express = require('express');

const config = require('./settings.json');

// ======================================================
// EXPRESS SERVER
// ======================================================

const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (_, res) => {
  res.send('Minecraft AFK Bot is running.');
});

app.get('/health', (_, res) => {
  res.json({
    status: bot ? 'online' : 'offline'
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] HTTP server started on port ${PORT}`);
});

// ======================================================
// VARIABLES
// ======================================================

let bot = null;
let reconnectTimeout = null;
let antiAfkInterval = null;

let reconnecting = false;

// ======================================================
// CLEANUP
// ======================================================

function cleanupBot() {

  if (antiAfkInterval) {
    clearInterval(antiAfkInterval);
    antiAfkInterval = null;
  }

  if (bot) {
    try {
      bot.removeAllListeners();
      bot.end();
    } catch (e) {}
  }

  bot = null;
  reconnecting = false;
}

// ======================================================
// ANTI AFK
// ======================================================

function startAntiAfk() {

  if (antiAfkInterval) {
    clearInterval(antiAfkInterval);
  }

  antiAfkInterval = setInterval(() => {

    if (!bot || !bot.entity) return;

    const actions = [
      'jump',
      'forward',
      'left',
      'right'
    ];

    const action =
      actions[Math.floor(Math.random() * actions.length)];

    bot.setControlState(action, true);

    setTimeout(() => {

      if (!bot) return;

      bot.setControlState(action, false);

    }, 1000);

  }, 30000);

  console.log('[Bot] Anti AFK started');
}

// ======================================================
// RECONNECT
// ======================================================

function reconnectBot(reason = 'unknown') {

  if (reconnecting) {
    console.log('[Bot] Reconnect already in progress');
    return;
  }

  reconnecting = true;

  console.log(`[Bot] Reconnecting because: ${reason}`);

  cleanupBot();

  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
  }

  reconnectTimeout = setTimeout(() => {

    reconnecting = false;

    createBot();

  }, 15000);
}

// ======================================================
// CREATE BOT
// ======================================================

function createBot() {

  if (bot) {
    console.log('[Bot] Bot already exists');
    return;
  }

  console.log('====================================');
  console.log('[Bot] Creating bot...');
  console.log(
    `[Bot] Connecting to ${config.server.ip}:${config.server.port}`
  );
  console.log('====================================');

  try {

    bot = mineflayer.createBot({

      host: config.server.ip,
      port: config.server.port,

      username: config['bot-account'].username,
      auth: config['bot-account'].type,

      version: config.server.version,

      connectTimeout: 20000,
      checkTimeoutInterval: 30000,

      hideErrors: false
    });

    // ==================================================
    // SPAWN TIMEOUT
    // ==================================================

    const spawnTimeout = setTimeout(() => {

      if (!bot || !bot.entity) {

        console.log('[Bot] Spawn timeout');

        reconnectBot('spawn-timeout');
      }

    }, 45000);

    // ==================================================
    // SPAWN
    // ==================================================

    bot.once('spawn', () => {

      clearTimeout(spawnTimeout);

      console.log('[Bot] Connected successfully');

      reconnecting = false;

      startAntiAfk();

      // ================================================
      // AUTO LOGIN
      // ================================================

      if (
        config.utils &&
        config.utils['auto-auth'] &&
        config.utils['auto-auth'].enabled
      ) {

        const password =
          config.utils['auto-auth'].password;

        setTimeout(() => {

          if (!bot) return;

          bot.chat(`/login ${password}`);

          console.log('[Auth] Login command sent');

        }, 3000);
      }
    });

    // ==================================================
    // END
    // ==================================================

    bot.on('end', () => {

      console.log('[Bot] Disconnected');

      reconnectBot('disconnect');
    });

    // ==================================================
    // ERROR
    // ==================================================

    bot.on('error', (err) => {

      console.log(
        `[Bot] Error: ${err.code || err.message}`
      );
    });

    // ==================================================
    // KICKED
    // ==================================================

    bot.on('kicked', (reason) => {

      console.log(`[Bot] Kicked: ${reason}`);
    });

  } catch (err) {

    console.log(
      `[Bot] Failed to create bot: ${err.message}`
    );

    reconnectBot('create-failed');
  }
}

// ======================================================
// START
// ======================================================

console.log('====================================');
console.log(' Minecraft AFK Bot Stable Edition');
console.log('====================================');

console.log(
  '[Bot] Waiting 30 seconds before startup...'
);

setTimeout(() => {
  createBot();
}, 30000);
