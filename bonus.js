const msDay = 24 * 60 * 60 * 1000;
const BONUS = 0.2; // USDT

module.exports = (bot, axios) => {
  bot.onText(/\/bonus/, async msg => {
    const uid = msg.from.id;
    const {data} = await axios.get(`${process.env.SERVER_URL}/user/${uid}`);
    const now = Date.now();
    if (data.lastBonus && (now - data.lastBonus) < msDay) {
      const left = Math.ceil((msDay - (now - data.lastBonus)) / 3600000);
      return bot.sendMessage(uid, `⏳ Bonus in ${left} h.`);
    }
    const spend_id = 'bonus' + uid + now;
    await axios.post('https://pay.crypt.bot/api/transfer', {
      user_id: uid, asset: 'USDT', amount: String(BONUS), spend_id
    }, {headers: {'Crypto-Pay-API-Token': process.env.CRYPTO_TOKEN}});
    await axios.post(`${process.env.SERVER_URL}/bonus`, {uid, now});
    bot.sendMessage(uid, `🎁 ${BONUS} USDT credited immediately.`);
  });
};