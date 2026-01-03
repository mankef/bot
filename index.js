require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// Configuration
const BOT_TOKEN = process.env.BOT_TOKEN || '7368962343:AAGWmcvczpA_LJ_Qb8whxsGYpzOfPc4gWJs';
const MINIAPP_URL = process.env.MINIAPP_URL || 'https://miniapp-sigma-roan.vercel.app/';
const SERVER_URL = process.env.SERVER_URL || 'https://server-production-b3d5.up.railway.app';
const CRYPTO_TOKEN = process.env.CRYPTO_TOKEN || '369197:AAC06ytgeDacntgpQNfOs3b7LomyOknLG3N';
const ADMIN_ID = parseInt(process.env.ADMIN_ID || '7505000952');

// Validate configuration
if (!BOT_TOKEN || BOT_TOKEN.length < 40) {
    console.error('FATAL: Invalid or missing BOT_TOKEN');
    process.exit(1);
}

console.log('[SPIND BET] Bot initializing...');
console.log('- Miniapp:', MINIAPP_URL || 'Not set');
console.log('- Server:', SERVER_URL || 'Not set');
console.log('- Crypto token:', CRYPTO_TOKEN ? 'Set ✓' : 'Not set ✗');
console.log('- Admin ID:', ADMIN_ID);

// Initialize bot
const bot = new TelegramBot(BOT_TOKEN, {
    polling: { 
        interval: 300, 
        autoStart: true,
        params: { timeout: 10 }
    }
});

// Safe server request helper
async function safeServerRequest(method, endpoint, data = null) {
    if (!SERVER_URL) {
        console.log('[BOT] Server URL not configured');
        return { success: false, error: 'Server not connected' };
    }
    
    try {
        const config = {
            method: method.toLowerCase(),
            url: `${SERVER_URL}${endpoint}`,
            timeout: 8000,
            headers: {
                'Content-Type': 'application/json',
                'X-Bot-Token': BOT_TOKEN
            },
            validateStatus: (status) => status < 500
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

// /start command
bot.onText(/\/start(?:\s+(\w+))?/, async (msg, match) => {
    const uid = msg.from.id;
    const refCode = match[1] ? parseInt(match[1]) : null;
    
    console.log(`[SPIND BET] /start from ${uid}${refCode ? ` (ref: ${refCode})` : ''}`);
    
    try {
        // Register user
        await safeServerRequest('POST', '/user/register', { uid, refCode });
        
        const welcomeText = `
✨ *SPIND BET CASINO* ✨

🌸 *Welcome, Senpai!* 🌸
Your anime-style crypto casino adventure begins!

🎰 *Play:* Slots & Coinflip games
💰 *Earn:* Deposit & claim daily bonuses
👥 *Invite:* 5%/2%/1% referral program
💎 *Withdraw:* Instant crypto payouts

*Let the fortune favor you!*
        `;
        
        const keyboard = MINIAPP_URL ? {
            inline_keyboard: [
                [{ text: '🎰 LAUNCH CASINO', web_app: { url: MINIAPP_URL } }],
                [{ text: '🎁 Claim Bonus', callback_data: 'bonus' }, { text: '👥 Referrals', callback_data: 'ref' }],
                [{ text: '❓ Help', callback_data: 'help' }]
            ]
        } : {
            inline_keyboard: [[{ text: '⚠️ Maintenance Mode', callback_data: 'maintenance' }]]
        };
        
        await bot.sendMessage(uid, welcomeText, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
        
    } catch (e) {
        console.error(`[SPIND BET] /start error:`, e);
        bot.sendMessage(uid, '❌ *Error occurred*. Please try again later.', {
            parse_mode: 'Markdown'
        }).catch(() => {});
    }
});

// /bonus command
bot.onText(/\/bonus/, async (msg) => {
    const uid = msg.from.id;
    
    console.log('[SPIND BET] /bonus from', uid);
    
    if (!CRYPTO_TOKEN || !SERVER_URL) {
        return bot.sendMessage(uid, '💢 *Bonus system temporarily disabled*\n\nPlease try again later.', {
            parse_mode: 'Markdown'
        });
    }
    
    try {
        // Get user data
        const userResult = await axios.get(`${SERVER_URL}/user/${uid}`, { 
            timeout: 5000,
            headers: { 'X-Bot-Token': BOT_TOKEN }
        });
        
        const userData = userResult.data;
        
        if (!userData.success) {
            throw new Error(userData.error || 'Failed to load user data');
        }
        
        // Check cooldown
        const msDay = 24 * 60 * 60 * 1000;
        const now = Date.now();
        const lastBonus = userData.lastBonus || 0;
        
        if ((now - lastBonus) < msDay) {
            const left = Math.ceil((msDay - (now - lastBonus)) / 3600000);
            const hours = left % 24;
            const days = Math.floor(left / 24);
            
            return bot.sendMessage(uid, `
⏳ *Daily Bonus*

Your next bonus is available in:
${days > 0 ? `${days}d ` : ''}${hours}h

Come back later, Senpai! 🌸
            `, { parse_mode: 'Markdown' });
        }
        
        // Create bonus transfer
        const spendId = `bonus_${uid}_${now}_${Math.random().toString(36).slice(2, 11)}`;
        
        console.log('[SPIND BET] Creating bonus transfer:', { spendId, uid });
        
        const transferResult = await axios.post(
            'https://pay.crypt.bot/api/transfer',
            {
                user_id: uid,
                asset: 'USDT',
                amount: '0.20',
                spend_id: spendId,
                description: 'SPIND BET Daily Bonus'
            },
            {
                headers: { 'Crypto-Pay-API-Token': CRYPTO_TOKEN }
            }
        );
        
        console.log('[SPIND BET] Transfer result:', transferResult.data);
        
        if (!transferResult.data.ok) {
            throw new Error(transferResult.data.error?.description || 'Bonus transfer failed');
        }
        
        // Update bonus timestamp
        await axios.post(`${SERVER_URL}/bonus`, 
            { uid, now },
            { timeout: 5000, headers: { 'X-Bot-Token': BOT_TOKEN } }
        ).catch(e => console.log('[BOT] Bonus timestamp update failed:', e.message));
        
        // Success message
        await bot.sendMessage(uid, `
🎁 *Daily Bonus Claimed!*

✨ *0.20 USDT* has been credited to your account!

💝 Come back in 24 hours for more free crypto!

Good luck in the games, Senpai! 🎰🌸
        `, { 
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '🎰 Play Now', web_app: { url: MINIAPP_URL } }
                ]]
            }
        });
        
        // Notify admin
        if (ADMIN_ID) {
            bot.sendMessage(ADMIN_ID, `🎁 Bonus claimed by user ${uid}`).catch(() => {});
        }
        
    } catch (e) {
        console.error('[SPIND BET] /bonus error:', e.response?.data || e.message);
        
        let errorMessage = '❌ Bonus error. Please try again later.';
        if (e.response?.data?.error?.description) {
            errorMessage += `\n\n${e.response.data.error.description}`;
        }
        
        bot.sendMessage(uid, errorMessage, {
            parse_mode: 'Markdown'
        }).catch(() => {});
    }
});

// /check command
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

✅ *Available*
        `, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '📤 Open Check', url: data.lastCheckUrl }
                ], [
                    { text: '❓ Help', callback_data: 'help' }
                ]]
            }
        }).catch(() => {});
        
    } catch (e) {
        console.error(`[SPIND BET] /check error:`, e.message);
        bot.sendMessage(uid, '❌ *Error retrieving check*', {
            parse_mode: 'Markdown'
        }).catch(() => {});
    }
});

// /admin command
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

🌸 Good luck, Master! 🌸
                    `, { parse_mode: 'Markdown' });
                } else {
                    bot.sendMessage(ADMIN_ID, `❌ ${statsResult.error}`);
                }
                break;
                
            case 'user':
                const userId = parseInt(value);
                const userResult = await safeServerRequest('GET', `/admin/user/${userId}`);
                if (userResult.success) {
                    const u = userResult.data.user;
                    bot.sendMessage(ADMIN_ID, `
👤 *User ${userId}*

💰 Balance: ${u.balance.toFixed(2)} USDT
💎 Ref Earned: ${u.refEarn.toFixed(2)} USDT
💵 Total Deposited: ${u.totalDeposited.toFixed(2)} USDT
🔗 Check: ${u.lastCheckUrl ? '✅ Available' : '❌ None'}
                    `, { parse_mode: 'Markdown' });
                } else {
                    bot.sendMessage(ADMIN_ID, `❌ User not found`);
                }
                break;
                
            case 'help':
                bot.sendMessage(ADMIN_ID, `
💡 *Admin Commands:*

/admin edge <0-0.3> - Set house edge
/admin stats - Show statistics
/admin user <uid> - User details
/admin help - Show this message

🌸 Good luck, Master! 🌸
                `, { parse_mode: 'Markdown' });
                break;
                
            default:
                bot.sendMessage(ADMIN_ID, '❌ *Unknown command*\nUse /admin help', { parse_mode: 'Markdown' });
        }
    } catch (e) {
        console.error('[SPIND BET] Admin command error:', e);
        bot.sendMessage(ADMIN_ID, '❌ *Command failed*', { parse_mode: 'Markdown' }).catch(() => {});
    }
});

// Callback query handler
bot.on('callback_query', async (query) => {
    const uid = query.from.id;
    const data = query.data;
    
    console.log('[SPIND BET] Callback query:', { uid, data });
    
    try {
        await bot.answerCallbackQuery(query.id).catch(() => {});
        
        switch(data) {
            case 'bonus':
                const bonusMsg = {
                    from: query.from,
                    chat: { id: uid },
                    text: '/bonus',
                    entities: [{ type: 'bot_command', offset: 0, length: 6 }]
                };
                bot.emit('message', bonusMsg);
                break;
                
            case 'ref':
            case 'referrals':
                const refLink = `https://t.me/${bot.options.username}?start=${uid}`;
                await bot.sendMessage(uid, `
👥 *SPIND BET Referral Program*

✨ *Your Referral Link:*
\`${refLink}\`

*Earn together with friends:*
• Direct referrals: 5% from deposits
• Level 2 friends: 2% from deposits  
• From their bets: 1% forever

*Share and earn crypto together!*

Good luck, Senpai! 🌸
                `, { parse_mode: 'Markdown' });
                break;
                
            case 'maintenance':
                await bot.sendMessage(uid, '🔧 *Maintenance Mode*\n\nThe casino is currently under maintenance. Please check back soon!', { 
                    parse_mode: 'Markdown' 
                });
                break;
                
            case 'help':
                await bot.sendMessage(uid, `
💡 *SPIND BET Help*

Commands:
• /start - Launch casino
• /bonus - Claim daily bonus (0.20 USDT)
• /check - Get your last check
• /admin (admins only)

Need more help? Contact support! 🌸
                `, { parse_mode: 'Markdown' });
                break;
                
            default:
                console.log('[SPIND BET] Unknown callback:', data);
        }
        
    } catch (e) {
        console.error('[SPIND BET] Callback error:', e);
    }
});

// Error handlers
bot.on('polling_error', (error) => {
    console.error('[SPIND BET] Polling error:', error.message);
});

bot.on('error', (error) => {
    console.error('[SPIND BET] Bot error:', error.message);
});

console.log('[SPIND BET] Bot is running successfully! 🌸');

