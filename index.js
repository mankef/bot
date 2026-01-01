require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const bot = new TelegramBot(process.env.BOT_TOKEN, {polling: true});
const MINIAPP_URL = process.env.MINIAPP_URL;
const SERVER_URL = process.env.SERVER_URL;

bot.onText(/\/start(?:\s+(\w+))?/, async (msg, match) => {
  const uid = msg.from.id;
  const refCode = match[1] ? parseInt(match[1]) : null;
  await axios.post(`${SERVER_URL}/play`, {uid, bet: 0, side: 'heads', refCode}).catch(() => {});
  const opts = {
    reply_markup: {
      inline_keyboard: [[
        {text: '🎰 Launch Casino', web_app: {url: MINIAPP_URL}}
      ]]
    }
  };
  bot.sendMessage(uid, '🎩 Welcome to OldMoney Casino.\nNothing extra. Bet – Win – Cash out.', opts);
});

require('./bonus')(bot, axios);