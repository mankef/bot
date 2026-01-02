require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const BOT_TOKEN = process.env.BOT_TOKEN;
const MINIAPP_URL = process.env.MINIAPP_URL;
const SERVER_URL = process.env.SERVER_URL;
const CRYPTO_TOKEN = process.env.CRYPTO_TOKEN;

if (!BOT_TOKEN) {
  console.error('FATAL: BOT_TOKEN not set');
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, {
  polling: { interval: 300, params: { timeout: 10 } }
});

console.log('[BOT] Starting...');

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

// /checkpayment – ручная проверка
bot.onText(/\/checkpayment (.+)/, async (msg, match) => {
  const uid = msg.from.id;
  const invId = match[1];
  if (!CRYPTO_TOKEN) return bot.sendMessage(uid, '💢 Payment disabled');

  try {
    console.log(`[BOT] Manual check: ${invId}`);
    
    // Получаем статус инвойса
    const {data} = await axios.get('https://pay.crypt.bot/api/getInvoices', {
      params: {invoice_ids: invId},
      headers: {'Crypto-Pay-API-Token': CRYPTO_TOKEN}
    });
    
    console.log('[BOT] Invoice status:', data.result.items[0]?.status);
    
    const inv = data.result.items[0];
    if (inv?.status === 'paid') {
      // Отправляем вебхук на сервер
      await axios.post(`${SERVER_URL}/webhook`, {
        update: {type: 'invoice_paid', payload: {invoice_id: invId}}
      }, {headers: {'Content-Type':'application/json'}})
      .catch(e => console.log(`[BOT] Manual webhook fail: ${e.message}`));
      
      bot.sendMessage(uid, `✅ Invoice ${invId} paid. Processing...`).catch(()=>{});
    } else {
      bot.sendMessage(uid, `❌ Invoice ${invId} not paid. Status: ${inv?.status||'unknown'}`).catch(()=>{});
    }
  } catch (e) {
    console.error(`[BOT] /checkpayment error: ${e.message}`);
    bot.sendMessage(uid, '❌ Check failed').catch(()=>{});
  }
});

// Проверка статуса каждые 5 секунд (фолбэк)
setInterval(async () => {
  if (!CRYPTO_TOKEN || !SERVER_URL) return;
  
  try {
    const {data} = await axios.get('https://pay.crypt.bot/api/getInvoices', {
      params: {status: 'active'},
      headers: {'Crypto-Pay-API-Token': CRYPTO_TOKEN}
    });
    
    for (const inv of data.result.items) {
      if (inv.status === 'paid') {
        await axios.post(`${SERVER_URL}/webhook`, {
          update: {type: 'invoice_paid', payload: {invoice_id: inv.invoice_id}}
        }).catch(()=>{});
      }
    }
  } catch (e) {
    console.log('[BOT] Fallback check error:', e.message);
  }
}, 5000);

bot.on('polling_error', e => console.error('[BOT] Polling error:', e.message));
console.log('[BOT] Running');
