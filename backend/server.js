// backend/server.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const { nanoid } = require('nanoid');
const axios = require('axios');
const { ethers } = require('ethers');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const adapter = new JSONFile('db.json');
const db = new Low(adapter);

(async () => {
  await db.read();
  db.data ||= { wallets: [], transactions: [] };
  await db.write();
})().catch(err => {
  console.error('DB init failed', err);
  process.exit(1);
});

const PORT = process.env.PORT || 4000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const CURRENCY_API_URL = process.env.CURRENCY_API_URL || 'https://2025-10-05.currency-api.pages.dev/v1/currencies/eur.json';

// Ensure wallet exists in DB with comprehensive data
async function ensureWallet(address) {
  const addr = ethers.getAddress(address);
  await db.read();
  let w = db.data.wallets.find(x => x.address === addr);
  if (!w) {
    const now = Date.now();
    w = { 
      id: nanoid(), 
      address: addr, 
      balanceEth: Number((Math.random() * 9 + 1).toFixed(6)),
      balanceUsd: 0, // Will be calculated based on current ETH price
      createdAt: now,
      lastActivityAt: now,
      transactionCount: 0,
      totalSentEth: 0,
      totalReceivedEth: 0,
      totalSentUsd: 0,
      totalReceivedUsd: 0,
      status: 'active',
      tags: [],
      metadata: {
        source: 'user_created',
        ipAddress: null,
        userAgent: null,
        notes: ''
      }
    };
    db.data.wallets.push(w);
    await db.write();
  }
  return w;
}

//balance check
app.get('/balance/:address', async (req, res) => {
  try {
    const address = ethers.getAddress(req.params.address);
    await db.read();
    const w = db.data.wallets.find(x => x.address === address);
    if (!w) return res.json({ balanceEth: 0, balanceUsd: 0 });
    
    // Calculate current USD balance based on ETH price
    const quote = await getQuoteFromCurrencyApis(1);
    const ethPriceUsd = quote.eth_price_usd;
    const calculatedUsdBalance = Number((w.balanceEth * ethPriceUsd).toFixed(2));
    
    return res.json({ 
      balanceEth: Number(w.balanceEth),
      balanceUsd: calculatedUsdBalance
    });
  } catch (e) {
    return res.status(400).json({ error: 'invalid address' });
  }
});

// Request approval
app.post('/request-transfer', async (req, res) => {
  try {
    const { sender, recipient, amountEth, amountUsd } = req.body;
    const from = ethers.getAddress(sender);
    const to = ethers.getAddress(recipient);
    await ensureWallet(from);
    await ensureWallet(to);

    let ethAmount = null;
    let currencySample = null;
    if (amountUsd) {
      const quote = await getQuoteFromCurrencyApis(amountUsd);
      ethAmount = Number(quote.amount_eth);
      currencySample = quote.currencyApiSample || null;
      if (!ethAmount) return res.status(500).json({ error: 'could not quote' });
    } else {
      ethAmount = Number(amountEth);
    }

    const expiresAt = Date.now() + 30 * 1000; 
    const nonce = nanoid(8);
    const message = JSON.stringify({
      type: 'transfer_approval',
      nonce,
      from,
      to,
      ethAmount: ethAmount,
      amountUsd: amountUsd || null,
      expiresAt
    });

    await db.read();
    const now = Date.now();
    const transaction = {
      id: nanoid(),
      type: 'pending',
      sender: from,
      recipient: to,
      ethAmount: ethAmount,
      amountUsd: amountUsd || null,
      message,
      expiresAt,
      createdAt: now,
      currencySample,
      // Enhanced transaction data
      hash: null, // Will be set when transaction is completed
      blockNumber: null,
      gasUsed: null,
      gasPrice: null,
      nonce: nonce,
      status: 'pending',
      confirmations: 0,
      metadata: {
        source: 'api_request',
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent'),
        network: 'mock',
        chainId: 1,
        notes: ''
      },
      analytics: {
        processingTimeMs: null,
        retryCount: 0,
        errorHistory: []
      }
    };
    db.data.transactions.push(transaction);
    await db.write();

    return res.json({ message, expiresAt, currencySample });
  } catch (e) {
    console.error(e);
    return res.status(400).json({ error: 'bad request' });
  }
});

//signed approval
app.post('/submit-transfer', async (req, res) => {
  try {
    const { sender, recipient, message, signature } = req.body;
    const from = ethers.getAddress(sender);
    const to = ethers.getAddress(recipient);

    await db.read();
    const pendingIndex = db.data.transactions.findIndex(t => t.message === message && t.type === 'pending');
    if (pendingIndex === -1) return res.status(400).json({ error: 'no pending transfer' });
    const pending = db.data.transactions[pendingIndex];


    let parsed;
    try { parsed = JSON.parse(message); } catch (e) { return res.status(400).json({ error: 'invalid message format' }); }

    // expiry check
    if (Date.now() > parsed.expiresAt) {
      pending.type = 'failed'; pending.error = 'approval expired'; await db.write();
      return res.status(400).json({ error: 'approval expired' });
    }

    // signature verification
    const recovered = ethers.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== from.toLowerCase()) {
      pending.type = 'failed'; pending.error = 'invalid signature'; await db.write();
      return res.status(400).json({ error: 'invalid signature' });
    }

    // USD flows
    if (pending.amountUsd) {
      const fresh = await getQuoteFromCurrencyApis(pending.amountUsd);
      const freshEth = Number(fresh.amount_eth);
      const oldEth = Number(pending.ethAmount);
      const diff = Math.abs(freshEth - oldEth) / Math.max(oldEth, 1e-12);
      if (diff > 0.01) {
        pending.type = 'failed'; pending.error = 'price moved too much'; await db.write();
        return res.status(400).json({ error: 'price moved too much' });
      }
    }

    const senderWallet = db.data.wallets.find(w => w.address === from);
    const recipientWallet = db.data.wallets.find(w => w.address === to);
    if (!senderWallet || Number(senderWallet.balanceEth) < Number(pending.ethAmount)) {
      pending.type = 'failed'; pending.error = 'insufficient funds'; await db.write();
      return res.status(400).json({ error: 'insufficient funds' });
    }

    // transfer
    const ethAmount = Number(pending.ethAmount);
    const usdAmount = pending.amountUsd ? Number(pending.amountUsd) : null;
    
    senderWallet.balanceEth = Number((Number(senderWallet.balanceEth) - ethAmount).toFixed(6));
    recipientWallet.balanceEth = Number((Number(recipientWallet.balanceEth) + ethAmount).toFixed(6));
    
    // Update wallet statistics
    senderWallet.transactionCount += 1;
    senderWallet.totalSentEth += ethAmount;
    senderWallet.lastActivityAt = Date.now();
    
    recipientWallet.transactionCount += 1;
    recipientWallet.totalReceivedEth += ethAmount;
    recipientWallet.lastActivityAt = Date.now();
    
    if (usdAmount) {
      senderWallet.totalSentUsd += usdAmount;
      recipientWallet.totalReceivedUsd += usdAmount;
    }

    // Update transaction with completion data
    const executedAt = Date.now();
    pending.type = 'completed';
    pending.status = 'completed';
    pending.executedAt = executedAt;
    pending.hash = `0x${nanoid(64)}`; // Mock transaction hash
    pending.blockNumber = Math.floor(Math.random() * 1000000) + 18000000; // Mock block number
    pending.gasUsed = Math.floor(Math.random() * 50000) + 21000; // Mock gas used
    pending.gasPrice = Math.floor(Math.random() * 50) + 20; // Mock gas price in gwei
    pending.confirmations = 1;
    pending.analytics.processingTimeMs = executedAt - pending.createdAt;
    
    await db.write();

    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      const text = `Transfer completed: ${pending.ethAmount} ETH from ${from} to ${to}`;
      try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          chat_id: TELEGRAM_CHAT_ID,
          text
        });
      } catch (tErr) {
        console.warn('telegram failed', tErr?.message || tErr);
      }
    }

    return res.json({ success: true, tx: pending });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'server error' });
  }
});

// history
app.get('/history/:address', async (req, res) => {
  try {
    const addr = ethers.getAddress(req.params.address);
    await db.read();
    const txs = db.data.transactions.filter(t => t.sender === addr || t.recipient === addr).sort((a,b)=>b.createdAt-a.createdAt);
    res.json({ txs });
  } catch (e) {
    res.status(400).json({ error: 'invalid address' });
  }
});

// Get wallet details with comprehensive data
app.get('/wallet/:address', async (req, res) => {
  try {
    const addr = ethers.getAddress(req.params.address);
    await db.read();
    const wallet = db.data.wallets.find(w => w.address === addr);
    if (!wallet) {
      return res.status(404).json({ error: 'wallet not found' });
    }
    
    // Calculate USD balance based on current ETH price
    const quote = await getQuoteFromCurrencyApis(1);
    const ethPriceUsd = quote.eth_price_usd;
    wallet.balanceUsd = Number((wallet.balanceEth * ethPriceUsd).toFixed(2));
    
    res.json({ wallet });
  } catch (e) {
    res.status(400).json({ error: 'invalid address' });
  }
});

// Get all wallets with pagination
app.get('/wallets', async (req, res) => {
  try {
    await db.read();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    const wallets = db.data.wallets.slice(offset, offset + limit);
    const total = db.data.wallets.length;
    
    res.json({ 
      wallets, 
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (e) {
    res.status(500).json({ error: 'server error' });
  }
});

// Get transaction details
app.get('/transaction/:id', async (req, res) => {
  try {
    await db.read();
    const tx = db.data.transactions.find(t => t.id === req.params.id);
    if (!tx) {
      return res.status(404).json({ error: 'transaction not found' });
    }
    res.json({ transaction: tx });
  } catch (e) {
    res.status(500).json({ error: 'server error' });
  }
});

// Get analytics and statistics
app.get('/analytics', async (req, res) => {
  try {
    await db.read();
    
    const totalWallets = db.data.wallets.length;
    const totalTransactions = db.data.transactions.length;
    const completedTransactions = db.data.transactions.filter(t => t.type === 'completed').length;
    const failedTransactions = db.data.transactions.filter(t => t.type === 'failed').length;
    const pendingTransactions = db.data.transactions.filter(t => t.type === 'pending').length;
    
    const totalEthInCirculation = db.data.wallets.reduce((sum, w) => sum + w.balanceEth, 0);
    const totalEthTransferred = db.data.transactions
      .filter(t => t.type === 'completed')
      .reduce((sum, t) => sum + Number(t.ethAmount), 0);
    
    const avgTransactionValue = completedTransactions > 0 ? totalEthTransferred / completedTransactions : 0;
    
    // Recent activity (last 24 hours)
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    const recentTransactions = db.data.transactions.filter(t => t.createdAt > oneDayAgo).length;
    const recentWallets = db.data.wallets.filter(w => w.createdAt > oneDayAgo).length;
    
    res.json({
      overview: {
        totalWallets,
        totalTransactions,
        completedTransactions,
        failedTransactions,
        pendingTransactions,
        totalEthInCirculation: Number(totalEthInCirculation.toFixed(6)),
        totalEthTransferred: Number(totalEthTransferred.toFixed(6)),
        avgTransactionValue: Number(avgTransactionValue.toFixed(6))
      },
      recentActivity: {
        transactions24h: recentTransactions,
        newWallets24h: recentWallets
      },
      successRate: totalTransactions > 0 ? Number((completedTransactions / totalTransactions * 100).toFixed(2)) : 0
    });
  } catch (e) {
    res.status(500).json({ error: 'server error' });
  }
});

// Search transactions with filters
app.get('/transactions', async (req, res) => {
  try {
    await db.read();
    let transactions = db.data.transactions;
    
    // Apply filters
    if (req.query.status) {
      transactions = transactions.filter(t => t.type === req.query.status);
    }
    
    if (req.query.address) {
      const addr = ethers.getAddress(req.query.address);
      transactions = transactions.filter(t => t.sender === addr || t.recipient === addr);
    }
    
    if (req.query.fromDate) {
      const fromDate = new Date(req.query.fromDate).getTime();
      transactions = transactions.filter(t => t.createdAt >= fromDate);
    }
    
    if (req.query.toDate) {
      const toDate = new Date(req.query.toDate).getTime();
      transactions = transactions.filter(t => t.createdAt <= toDate);
    }
    
    // Sort by creation date (newest first)
    transactions.sort((a, b) => b.createdAt - a.createdAt);
    
    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    
    const paginatedTransactions = transactions.slice(offset, offset + limit);
    
    res.json({
      transactions: paginatedTransactions,
      pagination: {
        page,
        limit,
        total: transactions.length,
        pages: Math.ceil(transactions.length / limit)
      }
    });
  } catch (e) {
    res.status(500).json({ error: 'server error' });
  }
});

// Helper: call your currency API and CoinGecko to convert USD -> ETH
async function getQuoteFromCurrencyApis(amountUsd) {
  try {
    // 1) call the provided currency API (we just fetch it and include the response for debugging)
    let currencyApiSample = null;
    try {
      const r = await axios.get(CURRENCY_API_URL);
      currencyApiSample = r.data;
    } catch (e) {
      console.warn('currency api fetch failed', e.message);
    }

    // 2) fetch ETH price in USD from CoinGecko
    const cg = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params: { ids: 'ethereum', vs_currencies: 'usd' }
    });
    const ethPriceUsd = Number(cg.data?.ethereum?.usd);
    if (!ethPriceUsd || isNaN(ethPriceUsd)) throw new Error('could not fetch ETH price');

    const amountEth = Number(amountUsd) / ethPriceUsd;
    return { amount_eth: amountEth.toFixed(8), eth_price_usd: ethPriceUsd, currencyApiSample };
  } catch (e) {
    console.warn('quote failed, falling back to MOCK rate', e.message);
    const MOCK_USD_PER_ETH = 1800;
    const amountEth = Number(amountUsd) / MOCK_USD_PER_ETH;
    return { amount_eth: amountEth.toFixed(8), eth_price_usd: MOCK_USD_PER_ETH, note: 'fallback' };
  }
}

app.listen(PORT, () => console.log(`Backend listening on ${PORT}`));


