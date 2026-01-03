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

// /bonus (0.20 USDT, раз в 24ч)
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

// /admin – управление
bot.onText(/\/admin (.+)/, async (msg, match) => {
  if (msg.from.id !== ADMIN_ID) return bot.sendMessage(msg.from.id, '❌ No access');
  
  const [cmd, value] = match[1].split(' ');
  
  if (cmd === 'edge') {
    const edge = parseFloat(value);
    if (isNaN(edge) || edge < 0 || edge > 0.3) {
      return bot.sendMessage(ADMIN_ID, '💢 Edge must be 0-0.3');
    }
    
    try {
      await axios.post(`${SERVER_URL}/admin/set-edge`, {edge}, {
        headers: {'x-admin-secret': BOT_TOKEN}
      });
      bot.sendMessage(ADMIN_ID, `✅ House edge set to ${(edge * 100).toFixed(1)}%`).catch(()=>{});
    } catch (e) {
      bot.sendMessage(ADMIN_ID, `❌ Error: ${e.message}`).catch(()=>{});
    }
  } else if (cmd === 'stats') {
    try {
      const {data} = await axios.get(`${SERVER_URL}/admin/stats`, {
        headers: {'x-admin-secret': BOT_TOKEN}
      });
      bot.sendMessage(ADMIN_ID, 
        `📊 Stats:\n` +
        `Users: ${data.totalUsers}\n` +
        `Deposited: ${data.totalDeposited.toFixed(2)} USDT\n` +
        `Top refs: ${data.topReferrers.map(u => `${u.uid}: ${u.refEarn.toFixed(2)}`).join('\n')}`
      ).catch(()=>{});
    } catch (e) {
      bot.sendMessage(ADMIN_ID, `❌ Error: ${e.message}`).catch(()=>{});
    }
  } else if (cmd === 'user') {
    const uid = parseInt(value);
    try {
      const {data} = await axios.get(`${SERVER_URL}/admin/user/${uid}`, {
        headers: {'x-admin-secret': BOT_TOKEN}
      });
      bot.sendMessage(ADMIN_ID, 
        `👤 User ${uid}:\n` +
        `Balance: ${data.balance.toFixed(2)} USDT\n` +
        `Ref Earn: ${data.refEarn.toFixed(2)} USDT\n` +
        `Deposited: ${data.totalDeposited.toFixed(2)} USDT\n` +
        `Last Check: ${data.lastCheckUrl ? '✅' : '❌'}`
      ).catch(()=>{});
    } catch (e) {
      bot.sendMessage(ADMIN_ID, `❌ User not found`).catch(()=>{});
    }
  } else if (cmd === 'help') {
    bot.sendMessage(ADMIN_ID, 
      '💡 Commands:\n' +
      '/admin edge 0.05\n' +
      '/admin stats\n' +
      '/admin user <UID>\n' +
      '/admin help'
    ).catch(()=>{});
  } else {
    bot.sendMessage(ADMIN_ID, '❌ Unknown command. Use /admin help').catch(()=>{});
  }
});

// /getmychcek – получить свой последний чек
bot.onText(/\/getmychcek/, async msg => {
  const uid = msg.from.id;
  try {
    const {data} = await axios.get(`${SERVER_URL}/user/${uid}`, {timeout: 5000});
    if (!data.lastCheckUrl) {
      return bot.sendMessage(uid, '❌ No checks found. Create one first.');
    }
    
    bot.sendMessage(uid, `📋 Your check:\n${data.lastCheckUrl}`, {
      reply_markup: {
        inline_keyboard: [[{text: '📤 Open Check', url: data.lastCheckUrl}]]
      }
    }).catch(()=>{});
  } catch (e) {
    bot.sendMessage(uid, '❌ Error').catch(()=>{});
  }
});

bot.on('polling_error', e => console.error('[BOT] Polling error:', e.message));
console.log('[BOT] Running');
