require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const BOT_TOKEN = process.env.BOT_TOKEN;
const MINIAPP_URL = process.env.MINIAPP_URL || '';
const SERVER_URL = process.env.SERVER_URL || '';
const CRYPTO_TOKEN = process.env.CRYPTO_TOKEN || '';
const ADMIN_ID = parseInt(process.env.ADMIN_ID || '0');

console.log('[SPIND BET] Bot starting...');

// Безопасность: валидация токена
if (!BOT_TOKEN || BOT_TOKEN.length < 40) {
    console.error('FATAL: Invalid BOT_TOKEN');
    process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, {
    polling: { 
        interval: 300, 
        params: { timeout: 10 },
        autoStart: true
    }
});

// Функция для безопасных запросов к серверу
async function safeServerRequest(method, endpoint, data = null) {
    if (!SERVER_URL) {
        console.log('[BOT] Server URL not configured');
        return { success: false, error: 'Server not connected' };
    }
    
    try {
        const config = {
            method: method.toLowerCase(),
            url: `${SERVER_URL}${endpoint}`,
            timeout: 5000,
            headers: {
                'Content-Type': 'application/json',
                'X-Bot-Token': BOT_TOKEN // Аутентификация
            },
            validateStatus: (status) => status < 500 // Только 5xx считать ошибками
        };
        
        if (data) config.data = data;
        
        const response = await axios(config);
        return { success: true, data: response.data };
    } catch (error) {
        console.error(`[BOT] Server request failed: ${endpoint}`, error.message);
        return { 
            success: false, 
            error: error.response?.data?.error || 'Request failed' 
        };
    }
}

// /start - Аниме-стильное приветствие
bot.onText(/\/start(?:\s+(\w+))?/, async (msg, match) => {
    const uid = msg.from.id;
    const refCode = match[1] ? parseInt(match[1]) : null;
    
    try {
        // Регистрация пользователя
        await safeServerRequest('POST', '/user/register', { uid, refCode });
        
        const animeWelcome = `
✨ *SPIND BET CASINO* ✨

🌸 *Welcome, Senpai!* 🌸
Your journey to fortune begins here!

🎰 Play exciting games
💎 Earn crypto rewards
🌟 Invite friends & win together

*Ready to spin the wheel of destiny?*
        `;
        
        let opts = {
            parse_mode: 'Markdown',
            reply_markup: {}
        };
        
        if (MINIAPP_URL) {
            opts.reply_markup = {
                inline_keyboard: [[
                    { 
                        text: '🎰 LAUNCH CASINO', 
                        web_app: { url: MINIAPP_URL }
                    }
                ], [
                    { text: '🎁 Claim Bonus', callback_data: 'bonus' },
                    { text: '👥 Referrals', callback_data: 'ref' }
                ]]
            };
        } else {
            opts.reply_markup = {
                inline_keyboard: [[
                    { text: '⚠️ Maintenance Mode', callback_data: 'maintenance' }
                ]]
            };
        }
        
        await bot.sendMessage(uid, animeWelcome, opts);
        
    } catch (e) {
        console.error(`[BOT] /start error:`, e);
        bot.sendMessage(uid, '❌ *Error occurred*. Please try again later.', {
            parse_mode: 'Markdown'
        }).catch(() => {});
    }
});

// Обработка callback queries
bot.on('callback_query', async (query) => {
    const uid = query.from.id;
    const data = query.data;
    
    try {
        switch(data) {
            case 'bonus':
                // Отправляем команду /bonus
                const bonusMsg = {
                    from: query.from,
                    chat: { id: uid },
                    text: '/bonus'
                };
                bot.emit('message', bonusMsg);
                break;
                
            case 'ref':
                const refLink = `https://t.me/${bot.options.username}?start=${uid}`;
                bot.sendMessage(uid, `
👥 *Your Referral Link:*

\`${refLink}\`

*Share and earn:*
• 5% from direct referrals
• 2% from 2nd level
• 1% from bets

*Earn together, win together!*
                `, { parse_mode: 'Markdown' });
                break;
                
            case 'maintenance':
                bot.sendMessage(uid, '🔧 *Casino is under maintenance*\nPlease check back soon!', {
                    parse_mode: 'Markdown'
                });
                break;
        }
        
        bot.answerCallbackQuery(query.id).catch(() => {});
    } catch (e) {
        console.error(`[BOT] Callback error:`, e);
    }
});

// /bonus - Ежедневный бонус в аниме стиле
bot.onText(/\/bonus/, async (msg) => {
    const uid = msg.from.id;
    
    if (!CRYPTO_TOKEN || !SERVER_URL) {
        return bot.sendMessage(uid, '💢 *Bonus system temporarily disabled*', {
            parse_mode: 'Markdown'
        });
    }
    
    try {
        const userResult = await safeServerRequest('GET', `/user/${uid}`);
        if (!userResult.success) {
            return bot.sendMessage(uid, '❌ *Error loading user data*', {
                parse_mode: 'Markdown'
            });
        }
        
        const userData = userResult.data;
        const msDay = 24 * 60 * 60 * 1000;
        const now = Date.now();
        
        if (userData.lastBonus && (now - userData.lastBonus) < msDay) {
            const left = Math.ceil((msDay - (now - userData.lastBonus)) / 3600000);
            const hours = left % 24;
            const days = Math.floor(left / 24);
            
            return bot.sendMessage(uid, `
⏳ *Bonus on cooldown*

Next bonus in:
${days > 0 ? days + 'd ' : ''}${hours}h

Come back later, Senpai! 🌸
            `, { parse_mode: 'Markdown' });
        }
        
        // Создаем чек для бонуса
        const spendId = `bonus_${uid}_${now}`;
        const transferResult = await axios.post(
            'https://pay.crypt.bot/api/transfer',
            {
                user_id: uid,
                asset: 'USDT',
                amount: '0.20',
                spend_id: spendId,
                description: 'Daily bonus - SPIND BET'
            },
            {
                headers: { 'Crypto-Pay-API-Token': CRYPTO_TOKEN }
            }
        );
        
        if (!transferResult.data.ok) {
            throw new Error('Transfer failed');
        }
        
        // Обновляем время бонуса
        await safeServerRequest('POST', '/bonus', { uid, now });
        
        bot.sendMessage(uid, `
🎁 *Daily Bonus Claimed!*

✨ 0.20 USDT credited to your account
💝 Come back in 24h for more!

Good luck, Senpai! 🌟
        `, { parse_mode: 'Markdown' }).catch(() => {});
        
    } catch (e) {
        console.error(`[BOT] /bonus error:`, e.message);
        bot.sendMessage(uid, '❌ *Bonus error*. Please try again later.', {
            parse_mode: 'Markdown'
        }).catch(() => {});
    }
});

// /admin - Панель управления
bot.onText(/\/admin (.+)/, async (msg, match) => {
    if (msg.from.id !== ADMIN_ID) {
        return bot.sendMessage(msg.from.id, '❌ *Access denied* - Not an admin', {
            parse_mode: 'Markdown'
        });
    }
    
    const [cmd, ...args] = match[1].split(' ');
    const value = args.join(' ');
    
    try {
        switch(cmd) {
            case 'edge':
                const edge = parseFloat(value);
                if (isNaN(edge) || edge < 0 || edge > 0.3) {
                    return bot.sendMessage(ADMIN_ID, '💢 *House edge must be between 0 and 0.3*', {
                        parse_mode: 'Markdown'
                    });
                }
                
                const setResult = await safeServerRequest('POST', '/admin/set-edge', { edge });
                if (setResult.success) {
                    bot.sendMessage(ADMIN_ID, 
                        `✅ *House edge updated*\nNow: ${(edge * 100).toFixed(1)}%`, {
                        parse_mode: 'Markdown'
                    });
                } else {
                    bot.sendMessage(ADMIN_ID, `❌ ${setResult.error}`);
                }
                break;
                
            case 'stats':
                const statsResult = await safeServerRequest('GET', '/admin/stats');
                if (statsResult.success) {
                    const data = statsResult.data;
                    const refList = data.topReferrers.map(u => 
                        `${u.uid}: ${u.refEarn.toFixed(2)} USDT`
                    ).join('\n');
                    
                    bot.sendMessage(ADMIN_ID, `
📊 *SPIND BET Statistics*

👥 Total Users: ${data.totalUsers}
💰 Total Deposited: ${data.totalDeposited.toFixed(2)} USDT

🏆 Top Referrers:
${refList || 'No referrals yet'}
                    `, { parse_mode: 'Markdown' });
                } else {
                    bot.sendMessage(ADMIN_ID, `❌ ${statsResult.error}`);
                }
                break;
                
            case 'user':
                const userId = parseInt(value);
                const userResult = await safeServerRequest('GET', `/admin/user/${userId}`);
                if (userResult.success) {
                    const u = userResult.data;
                    bot.sendMessage(ADMIN_ID, `
👤 *User ${userId}*

💰 Balance: ${u.balance.toFixed(2)} USDT
💎 Ref Earned: ${u.refEarn.toFixed(2)} USDT
💵 Total Deposited: ${u.totalDeposited.toFixed(2)} USDT
🔗 Last Check: ${u.lastCheckUrl ? '✅ Available' : '❌ None'}
                    `, { parse_mode: 'Markdown' });
                } else {
                    bot.sendMessage(ADMIN_ID, `❌ User not found`);
                }
                break;
                
            case 'help':
                bot.sendMessage(ADMIN_ID, `
💡 *Admin Commands:*

/admins edge <0-0.3> - Set house edge
/admin stats - Show statistics
/admin user <uid> - User details
/admin help - Show this message

🌸 Good luck, Master! 🌸
                `, { parse_mode: 'Markdown' });
                break;
                
            default:
                bot.sendMessage(ADMIN_ID, '❌ *Unknown command*\nUse /admin help');
        }
    } catch (e) {
        console.error(`[BOT] Admin command error:`, e);
        bot.sendMessage(ADMIN_ID, '❌ *Command failed*').catch(() => {});
    }
});

// /check - Получить свой чек
bot.onText(/\/check/, async (msg) => {
    const uid = msg.from.id;
    
    try {
        const userResult = await safeServerRequest('GET', `/user/${uid}`);
        if (!userResult.success) {
            return bot.sendMessage(uid, '❌ *Error loading data*', {
                parse_mode: 'Markdown'
            });
        }
        
        const data = userResult.data;
        
        if (!data.lastCheckUrl) {
            return bot.sendMessage(uid, `
❌ *No checks found*

Create a withdrawal first to generate a check.

Need help? Contact support! 🌸
            `, { parse_mode: 'Markdown' });
        }
        
        bot.sendMessage(uid, `
📋 *Your Check is Ready!*

Click the button below to open:

*Amount:* Check details in the link
*Status:* ✅ Available
        `, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '📤 Open Check', url: data.lastCheckUrl }
                ], [
                    { text: '❓ Help', callback_data: 'help_check' }
                ]]
            }
        }).catch(() => {});
        
    } catch (e) {
        console.error(`[BOT] /check error:`, e.message);
        bot.sendMessage(uid, '❌ *Error retrieving check*', {
            parse_mode: 'Markdown'
        }).catch(() => {});
    }
});

// Обработка ошибок polling
bot.on('polling_error', (error) => {
    console.error('[SPIND BET] Polling error:', error.message);
});

bot.on('error', (error) => {
    console.error('[SPIND BET] Bot error:', error.message);
});

console.log('[SPIND BET] Bot is running successfully! 🌸');
