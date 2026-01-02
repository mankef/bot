require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const BOT_TOKEN = process.env.BOT_TOKEN;
const MINIAPP_URL = process.env.MINIAPP_URL || '';
const SERVER_URL = process.env.SERVER_URL || '';
const CRYPTO_TOKEN = process.env.CRYPTO_TOKEN || '';
const ADMIN_ID = parseInt(process.env.ADMIN_ID || '0');

console.log('[BOT] Starting...');

if (!BOT_TOKEN) {
  console.error('FATAL: BOT_TOKEN not set');
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, {
  polling: { interval: 300, params: { timeout: 10 } }
});

// /start
bot.onText(/\/start(?:\s+(\w+))?/, async (msg, match) => {
  const uid = msg.from.id;
  const refCode = match[1] ? parseInt(match[1]) : null;

  try {
    if (SERVER_URL) {
      await axios.post(`${SERVER_URL}/user/register`, {uid, refCode}, {timeout: 5000})
        .catch(e => console.log(`[BOT] Reg failed: ${e.message}`));
    }

    let text = '🎩 Welcome to OldMoney Casino.\nBet – Win – Cash out.';
    let opts = {};

    if (MINIAPP_URL) {
      opts.reply_markup = {
        inline_keyboard: [[
          {text: '🎰 Launch Casino', web_app: {url: MINIAPP_URL}}
        ]]
      };
    } else {
      text += '\n\n⚠️ Casino under maintenance';
    }

    await bot.sendMessage(uid, text, opts);
  } catch (e) {
    console.error(`[BOT] /start error: ${e.message}`);
    bot.sendMessage(uid, '❌ Error. Try /start again').catch(()=>{});
  }
});

// /bonus
bot.onText(/\/bonus/, async msg => {
  const uid = msg.from.id;
  if (!CRYPTO_TOKEN || !SERVER_URL) return bot.sendMessage(uid, '💢 Bonus disabled');

  try {
    const {data} = await axios.get(`${SERVER_URL}/user/${uid}`, {timeout: 5000});
    const msDay = 24 * 60 * 60 * 1000;
    const now = Date.now();

    if (data.lastBonus && (now - data.lastBonus) < msDay) {
      const left = Math.ceil((msDay - (now - data.lastBonus)) / 3600000);
      return bot.sendMessage(uid, `⏳ Bonus in ${left}h`);
    }

    const spend_id = 'bonus' + uid + now;
    await axios.post('https://pay.crypt.bot/api/transfer', {
      user_id: uid, asset: 'USDT', amount: '0.20', spend_id
    }, {headers: {'Crypto-Pay-API-Token': CRYPTO_TOKEN}});

    await axios.post(`${SERVER_URL}/bonus`, {uid, now}, {timeout: 5000})
      .catch(e => console.log(`[BOT] Bonus reg failed: ${e.message}`));

    bot.sendMessage(uid, `🎁 0.20 USDT credited`).catch(()=>{});
  } catch (e) {
    console.error(`[BOT] /bonus error: ${e.message}`);
    bot.sendMessage(uid, '❌ Bonus error').catch(()=>{});
  }
});

// /admin – установка шансов (только для админа)
bot.onText(/\/admin (.+)/, async (msg, match) => {
  if (msg.from.id !== ADMIN_ID) return bot.sendMessage(msg.from.id, '❌ No access');
  
  const [cmd, value] = match[1].split(' ');
  if (cmd === 'edge') {
    const edge = parseFloat(value);
    if (edge < 0 || edge > 0.5) return bot.sendMessage(ADMIN_ID, '💢 Edge must be 0-0.5');
    
    try {
      await axios.post(`${SERVER_URL}/admin/set-edge`, {edge}, {
        headers: {'x-admin-secret': BOT_TOKEN}
      });
      bot.sendMessage(ADMIN_ID, `✅ House edge set to ${edge}`).catch(()=>{});
    } catch (e) {
      bot.sendMessage(ADMIN_ID, `❌ Error: ${e.message}`).catch(()=>{});
    }
  } else {
    bot.sendMessage(ADMIN_ID, '💢 Usage: /admin edge 0.05').catch(()=>{});
  }
});

bot.on('polling_error', e => console.error('[BOT] Polling error:', e.message));
console.log('[BOT] Running');
