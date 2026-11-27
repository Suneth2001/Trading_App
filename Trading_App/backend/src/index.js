import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import WebSocket from 'ws';
import cors from 'cors';
import { CONFIG } from './config.js';
import { binanceService } from './services/binanceService.js';
import { paperTrading } from './services/paperTradingService.js';
import { MarginGuardian } from './services/marginGuardian.js';
import { StrategyEngine } from './services/strategyEngine.js';
import { TradingViewWebhookHandler } from './services/tradingViewWebhook.js';
import { BacktestEngine } from './services/backtestEngine.js';
import { aiPredictor } from './services/aiPredictorService.js';
import { IndicatorService } from './services/indicatorService.js';
import { MarketAnalysisService } from './services/marketAnalysisService.js';
import { MqttRelayClient } from './services/mqttRelay.js';

const app = express();
const server = http.createServer(app);

// Enable CORS for frontend development and mobile apps
app.use(cors({ origin: '*' }));
app.use(express.json());

// Initialize Socket.io
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Initialize Services
const marginGuardian = new MarginGuardian(io);
const strategyEngine = new StrategyEngine(io, marginGuardian);
const tradingViewWebhook = new TradingViewWebhookHandler(io);
const marketAnalysis = new MarketAnalysisService(io, marginGuardian);

// Start Automated Market Scanner
marketAnalysis.startScanner();

// 1. WebSocket Tick Forwarding & Margin Guardian background check
binanceService.initWebSocket((symbol, price, stats) => {
  // Push live price to connected mobile/desktop clients
  io.emit('price_tick', { symbol, price, stats });

  // Update paper positions mark price in memory for Demo mode
  if (!paperTrading.isLive) {
    const currentPrices = binanceService.getCurrentPrices();
    paperTrading.updateMarketPrices(currentPrices);
    marginGuardian.evaluatePositions(paperTrading.positions, currentPrices);
  }
});

// Helper to broadcast real live or paper account state
const broadcastAccountState = async () => {
  if (paperTrading.isLive) {
    if (binanceService.liveExchange) {
      try {
        const liveBal = await binanceService.getLiveBalance();
        const livePos = await binanceService.getLivePositions();
        if (liveBal) io.emit('account_summary', liveBal);
        if (livePos) io.emit('positions_update', livePos);
        return { summary: liveBal, positions: livePos || [] };
      } catch (e) {
        console.warn('[Broadcast Live Error]', e.message);
        return { summary: binanceService._cachedLiveBal, positions: binanceService._cachedLivePositions || [] };
      }
    }
    return { summary: null, positions: [] };
  }
  const bal = paperTrading.getBalance();
  io.emit('account_summary', bal);
  io.emit('positions_update', paperTrading.positions);
  return { summary: bal, positions: paperTrading.positions };
};

// Regular periodic balance & stats broadcast and 24/7 TP/SL/Margin Guardian auto-close check
setInterval(async () => {
  const analysisMap = marketAnalysis.getLatestAnalysisMap();
  if (paperTrading.isLive && binanceService.liveExchange) {
    try {
      const livePositions = await binanceService.getLivePositions();
      if (livePositions && livePositions.length > 0) {
        await marginGuardian.evaluatePositions(livePositions, binanceService.getCurrentPrices(), true, analysisMap);
      }
    } catch (e) {
      console.warn('[Margin Guardian Live Eval Error]', e.message);
    }
  } else if (paperTrading.positions.length > 0) {
    const currentPrices = binanceService.getCurrentPrices();
    paperTrading.updateMarketPrices(currentPrices);
    await marginGuardian.evaluatePositions(paperTrading.positions, currentPrices, false, analysisMap);
  }

  await broadcastAccountState();
}, 2500);

// ======================== REST API ROUTES ======================== //

// Health Check & Lightweight 24/7 Keep-Alive Ping
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    serverTime: new Date().toISOString(),
    uptime: process.uptime(),
    botRunning: strategyEngine.isRunning,
    autopilotRunning: marketAnalysis.isAutoPilotRunning,
    openPositionsCount: paperTrading.positions.length
  });
});

app.get('/api/ping', (req, res) => {
  res.json({
    ok: true,
    botRunning: strategyEngine.isRunning,
    autopilotRunning: marketAnalysis.isAutoPilotRunning,
    isLive: Boolean(paperTrading.isLive && binanceService.liveExchange),
    uptime: process.uptime()
  });
});

app.get('/api/cloud-engine/status', (req, res) => {
  res.json({
    online: true,
    mode: 'LOCAL_24X7_SERVER',
    isLive: Boolean(paperTrading.isLive && binanceService.liveExchange),
    botRunning: strategyEngine.isRunning,
    autopilotRunning: marketAnalysis.isAutoPilotRunning,
    lastSeenAt: new Date().toISOString()
  });
});

// Get Public IP for Binance API Whitelisting
app.get('/api/my-ip', async (req, res) => {
  try {
    const ipRes = await fetch('https://api.ipify.org?format=json');
    const data = await ipRes.json();
    res.json({ ip: data.ip || '112.134.246.225' });
  } catch {
    res.json({ ip: '112.134.246.225' });
  }
});

// System Configuration & Strategies
app.get('/api/config', (req, res) => {
  res.json({
    pairs: CONFIG.DEFAULT_PAIRS,
    strategies: CONFIG.STRATEGIES,
    defaultLeverage: CONFIG.DEFAULT_LEVERAGE,
    maxLeverage: CONFIG.MAX_LEVERAGE,
    tradingViewWebhookUrl: `${req.protocol}://${req.get('host')}${CONFIG.TRADINGVIEW.WEBHOOK_PATH}`
  });
});

// Account Status (Balance, Positions, Orders)
app.get('/api/account', async (req, res) => {
  if (paperTrading.isLive && binanceService.liveExchange) {
    try {
      const liveBal = await binanceService.getLiveBalance();
      const livePos = await binanceService.getLivePositions();
      if (liveBal) {
        return res.json({
          summary: liveBal,
          positions: livePos || [],
          history: paperTrading.orderHistory
        });
      }
    } catch (e) {
      console.warn('[Account API] Live fetch error:', e.message);
    }
  }

  res.json({
    summary: paperTrading.getBalance(),
    positions: paperTrading.positions,
    history: paperTrading.orderHistory
  });
});

// Reset Account Demo Balance
app.post('/api/account/reset', (req, res) => {
  const { balance } = req.body;
  const result = paperTrading.resetAccount(balance || CONFIG.PAPER_TRADING_DEFAULT_BALANCE);
  io.emit('account_summary', result);
  io.emit('positions_update', []);
  res.json({ success: true, summary: result });
});

// Toggle Paper vs Live
app.post('/api/account/mode', async (req, res) => {
  const { isLive } = req.body;
  if (isLive && !binanceService.liveExchange) {
    return res.status(400).json({
      success: false,
      error: 'Please enter and verify your Binance API Key & Secret Key in Settings first!'
    });
  }
  const result = paperTrading.setLiveMode(isLive);

  if (isLive && binanceService.liveExchange) {
    const liveBal = await binanceService.getLiveBalance();
    const livePos = await binanceService.getLivePositions();
    if (liveBal) {
      io.emit('account_summary', liveBal);
      io.emit('positions_update', livePos);
      pushCloudSync();
      return res.json({ success: true, ...result, summary: liveBal, positions: livePos });
    }
  }

  io.emit('account_summary', paperTrading.getBalance());
  io.emit('positions_update', paperTrading.positions);
  pushCloudSync();
  res.json({ success: true, ...result, summary: paperTrading.getBalance(), positions: paperTrading.positions });
});

// Configure Live Binance API Credentials
app.post('/api/account/api-keys', async (req, res) => {
  try {
    const { apiKey, apiSecret, useTestnet } = req.body;
    const result = await binanceService.setApiCredentials({ apiKey, apiSecret, useTestnet });

    if (result.success && binanceService.liveExchange) {
      paperTrading.setLiveMode(true);
      const liveBal = await binanceService.getLiveBalance();
      const livePos = await binanceService.getLivePositions();
      if (liveBal) {
        io.emit('account_summary', liveBal);
      }
      if (livePos) {
        io.emit('positions_update', livePos);
      }
      pushCloudSync();
      return res.json({ ...result, isLive: true, summary: liveBal, positions: livePos });
    } else if (result.success && (!apiKey || !apiSecret)) {
      paperTrading.setLiveMode(false);
      const demoBal = paperTrading.getBalance();
      io.emit('account_summary', demoBal);
      io.emit('positions_update', paperTrading.positions);
      pushCloudSync();
      return res.json({ ...result, isLive: false, summary: demoBal, positions: paperTrading.positions });
    }

    return res.status(400).json(result);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Server error setting API credentials' });
  }
});

// Market Prices & Ticker Stats
app.get('/api/prices', async (req, res) => {
  const stats = await binanceService.fetchTickerStats();
  res.json({
    prices: binanceService.getCurrentPrices(),
    stats
  });
});

// Candlestick Data
app.get('/api/klines', async (req, res) => {
  let { symbol = 'BTCUSDT', interval = '15m', limit = 100 } = req.query;
  const normInterval = (interval || '15m').toLowerCase();
  const candles = await binanceService.fetchKlines(symbol, normInterval, parseInt(limit));
  res.json(candles);
});

// Live Technical Indicators for Symbol
app.get('/api/indicators', async (req, res) => {
  let { symbol = 'BTCUSDT', interval = '15m' } = req.query;
  const normInterval = (interval || '15m').toLowerCase();
  const candles = await binanceService.fetchKlines(symbol, normInterval, 60);
  const indicators = IndicatorService.calculateAll(candles);
  res.json(indicators || {});
});

// Open Position (Long or Short)
app.post('/api/order/open', async (req, res) => {
  try {
    const { symbol, side, amountUsdt, leverage, tp, sl, trailingStopPct } = req.body;
    const markPrice = binanceService.getPrice(symbol);

    if (!markPrice || markPrice <= 0) {
      return res.status(400).json({ error: `Price unavailable for ${symbol}` });
    }

    const effLeverage = Number(leverage || CONFIG.DEFAULT_LEVERAGE);
    const effAmount = Number(amountUsdt);
    let position = null;
    let liveOrder = null;

    if (paperTrading.isLive && binanceService.liveExchange) {
      try {
        liveOrder = await binanceService.executeLiveOrder({
          symbol,
          side,
          amountUsdt: effAmount,
          leverage: effLeverage,
          tp,
          sl
        });
      } catch (liveErr) {
        return res.status(400).json({ error: `Binance Live Order Error: ${liveErr.message}` });
      }

      const cleanSym = symbol.replace('/', '').toUpperCase();
      const posId = `BINANCE-${cleanSym}-${side}`;
      position = {
        id: posId,
        symbol: cleanSym,
        side,
        entryPrice: markPrice,
        currentPrice: markPrice,
        leverage: effLeverage,
        margin: effAmount,
        tp: tp ? Number(tp) : null,
        sl: sl ? Number(sl) : null,
        trailingStopPct: trailingStopPct ? Number(trailingStopPct) : null,
        source: 'BINANCE_LIVE',
        binanceOrderId: liveOrder?.id || null,
        openedAt: new Date().toISOString()
      };

      if (tp || sl) {
        marginGuardian.setTarget(posId, { tp, sl, trailingStopPct });
        marginGuardian.setTarget(cleanSym, { tp, sl, trailingStopPct });
      }
    } else {
      position = paperTrading.openPosition({
        symbol,
        side,
        amountUsdt: effAmount,
        leverage: effLeverage,
        markPrice,
        tp,
        sl,
        trailingStopPct,
        source: 'MANUAL'
      });

      if (tp || sl) {
        marginGuardian.setTarget(position.id, { tp, sl, trailingStopPct });
        marginGuardian.setTarget(symbol, { tp, sl, trailingStopPct });
      }
    }

    io.emit('position_opened', position);
    const state = await broadcastAccountState();
    pushCloudSync();

    res.json({ success: true, position, liveOrder, summary: state?.summary, positions: state?.positions });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Close Single Position
app.post('/api/order/close', async (req, res) => {
  try {
    const { positionId, reason = 'MANUAL_CLOSE' } = req.body;

    // 1. Check if it is a Live Binance Position
    if (positionId && (positionId.startsWith('BINANCE-') || paperTrading.isLive)) {
      const livePositions = await binanceService.getLivePositions();
      const livePos = livePositions.find(p => p.id === positionId || p.symbol === positionId);
      if (livePos) {
        await binanceService.closeLivePosition({
          symbol: livePos.symbol,
          side: livePos.side,
          size: livePos.size
        });
        binanceService._cachedLivePositions = null;
        binanceService._lastPosTime = 0;
        binanceService._cachedLiveBal = null;
        binanceService._lastBalTime = 0;
        io.emit('position_closed', { id: positionId, symbol: livePos.symbol, side: livePos.side, reason });
        await broadcastAccountState();
        return res.json({ success: true, closed: livePos });
      }
    }

    // 2. Paper Trading Position
    const pos = paperTrading.positions.find(p => p.id === positionId);
    if (!pos) {
      return res.status(404).json({ error: 'Position not found' });
    }

    const currentPrice = binanceService.getPrice(pos.symbol) || pos.currentPrice;
    const closed = paperTrading.closePosition(positionId, currentPrice, reason);

    io.emit('position_closed', closed);
    await broadcastAccountState();
    pushCloudSync();

    res.json({ success: true, closed });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Panic Close All Positions
app.post('/api/order/close-all', async (req, res) => {
  try {
    if (paperTrading.isLive && binanceService.liveExchange) {
      const livePositions = await binanceService.getLivePositions();
      for (const pos of livePositions) {
        await binanceService.closeLivePosition({
          symbol: pos.symbol,
          side: pos.side,
          size: pos.size
        });
      }
      binanceService._cachedLivePositions = null;
      binanceService._lastPosTime = 0;
      binanceService._cachedLiveBal = null;
      binanceService._lastBalTime = 0;
    }
    const closed = paperTrading.closeAllPositions(binanceService.getCurrentPrices(), 'PANIC_CLOSE_ALL');
    await broadcastAccountState();
    res.json({ success: true, count: closed.length, closed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Auto-Trading Bot Endpoints
app.get('/api/bot/status', (req, res) => {
  res.json(strategyEngine.getStatus());
});

app.post('/api/bot/config', (req, res) => {
  lastLocalControlTime = Date.now();
  const updated = strategyEngine.updateConfig(req.body);
  io.emit('bot_status', updated);
  pushCloudSync();
  res.json(updated);
});

app.post('/api/bot/start', (req, res) => {
  lastLocalControlTime = Date.now();
  const status = strategyEngine.start();
  io.emit('bot_status', status);
  pushCloudSync();
  res.json(status);
});

app.post('/api/bot/stop', (req, res) => {
  lastLocalControlTime = Date.now();
  const status = strategyEngine.stop();
  io.emit('bot_status', status);
  pushCloudSync();
  res.json(status);
});

// Margin Guardian Settings & Emergency Logs
app.get('/api/guardian/settings', (req, res) => {
  res.json(marginGuardian.getSettings());
});

app.post('/api/guardian/settings', (req, res) => {
  const updated = marginGuardian.setSettings(req.body);
  io.emit('guardian_settings', updated);
  pushCloudSync();
  res.json(updated);
});

// TradingView Webhook Endpoint
app.post(CONFIG.TRADINGVIEW.WEBHOOK_PATH, async (req, res) => {
  const result = await tradingViewWebhook.processAlert(req.body);
  if (!result.success) {
    return res.status(result.code || 400).json(result);
  }
  res.json(result);
});

app.get('/api/webhook/logs', (req, res) => {
  res.json({
    secret: tradingViewWebhook.getSecret(),
    logs: tradingViewWebhook.getLogs(),
    webhookUrl: `${req.protocol}://${req.get('host')}${CONFIG.TRADINGVIEW.WEBHOOK_PATH}`
  });
});

app.post('/api/webhook/secret', (req, res) => {
  const { secret } = req.body;
  const updated = tradingViewWebhook.setSecret(secret);
  res.json({ success: true, secret: updated });
});

// Quantitative Backtester Endpoint
app.post('/api/backtest/run', async (req, res) => {
  try {
    const result = await BacktestEngine.run(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// AI & Market Sentiment Analysis
app.get('/api/ai/analysis', async (req, res) => {
  try {
    const { symbol = 'BTCUSDT', timeframe = '15m' } = req.query;
    const analysis = await aiPredictor.analyzeSymbol(symbol, timeframe);
    res.json(analysis);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Auto Market Analysis Endpoint (Scans & Ranks All Coins)
app.get('/api/market/analysis', async (req, res) => {
  try {
    const analysis = await marketAnalysis.runFullScan();
    res.json(analysis);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Live Order Book Depth (Bids, Asks, Buyer vs Seller Pressure)
app.get('/api/market/orderbook', async (req, res) => {
  try {
    const { symbol = 'BTCUSDT', limit = 15 } = req.query;
    const depth = await binanceService.fetchOrderBook(symbol, parseInt(limit));
    res.json(depth);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// AI Auto-Pilot Endpoints
app.get('/api/autopilot/status', (req, res) => {
  res.json(marketAnalysis.getAutoPilotStatus());
});

app.post('/api/autopilot/start', (req, res) => {
  lastLocalControlTime = Date.now();
  const status = marketAnalysis.startAutoPilot();
  pushCloudSync();
  res.json(status);
});

app.post('/api/autopilot/stop', (req, res) => {
  lastLocalControlTime = Date.now();
  const status = marketAnalysis.stopAutoPilot();
  pushCloudSync();
  res.json(status);
});

app.post('/api/autopilot/config', (req, res) => {
  lastLocalControlTime = Date.now();
  const status = marketAnalysis.updateAutoPilotConfig(req.body);
  io.emit('autopilot_status', status);
  pushCloudSync();
  res.json(status);
});

// Socket.io Connection Handler
io.on('connection', async (socket) => {
  // Send initial snapshot on client connect
  if (paperTrading.isLive && binanceService.liveExchange) {
    try {
      const liveBal = await binanceService.getLiveBalance();
      const livePos = await binanceService.getLivePositions();
      socket.emit('account_summary', liveBal || paperTrading.getBalance());
      socket.emit('positions_update', livePos || []);
    } catch {
      socket.emit('account_summary', paperTrading.getBalance());
      socket.emit('positions_update', paperTrading.positions);
    }
  } else {
    socket.emit('account_summary', paperTrading.getBalance());
    socket.emit('positions_update', paperTrading.positions);
  }
  socket.emit('bot_status', strategyEngine.getStatus());
  socket.emit('guardian_settings', marginGuardian.getSettings());
  socket.emit('market_analysis_update', marketAnalysis.getLatestAnalysis());
  socket.emit('autopilot_status', marketAnalysis.getAutoPilotStatus());
});

// Serve built frontend static assets so port 5000 also hosts the full web UI
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDist = path.resolve(__dirname, '../../frontend/dist');
const RUNTIME_STATE_FILE = path.resolve(__dirname, '../runtime_state.json');
app.use(express.static(frontendDist));

const saveRuntimeState = () => {
  try {
    fs.writeFileSync(RUNTIME_STATE_FILE, JSON.stringify({
      balance: paperTrading.balance,
      initialBalance: paperTrading.initialBalance,
      positions: paperTrading.positions,
      orderHistory: paperTrading.orderHistory.slice(0, 100),
      guardianSettings: marginGuardian.getSettings(),
      positionTargets: marginGuardian.positionTargets,
      botStatus: strategyEngine.getStatus(),
      autopilotStatus: marketAnalysis.getAutoPilotStatus()
    }, null, 2));
  } catch { }
};

const loadRuntimeState = () => {
  try {
    if (!fs.existsSync(RUNTIME_STATE_FILE)) return;
    const saved = JSON.parse(fs.readFileSync(RUNTIME_STATE_FILE, 'utf8'));
    if (saved.balance !== undefined) paperTrading.balance = saved.balance;
    if (saved.initialBalance !== undefined) paperTrading.initialBalance = saved.initialBalance;
    if (Array.isArray(saved.positions)) paperTrading.positions = saved.positions;
    if (Array.isArray(saved.orderHistory)) paperTrading.orderHistory = saved.orderHistory;
    if (saved.guardianSettings) marginGuardian.setSettings(saved.guardianSettings);
    if (saved.positionTargets) marginGuardian.positionTargets = saved.positionTargets;
    if (saved.botStatus) {
      strategyEngine.updateConfig(saved.botStatus);
      if (saved.botStatus.isRunning) strategyEngine.start();
    }
    if (saved.autopilotStatus) {
      if (saved.autopilotStatus.config) marketAnalysis.updateAutoPilotConfig(saved.autopilotStatus.config);
      if (saved.autopilotStatus.isAutoPilotRunning) marketAnalysis.startAutoPilot();
    }
  } catch { }
};

setInterval(saveRuntimeState, 3000);

// ================= CROSS-DEVICE REAL-TIME MQTT CLOUD SYNC (LAPTOP <-> MOBILE) ================= //
const SYNC_DEVICE_ID = 'PC-' + Math.random().toString(36).slice(2, 10);
const SYNC_STATE_TOPIC = 'apexalgo/suneth2001/v5/state';
const SYNC_HEARTBEAT_TOPIC = 'apexalgo/suneth2001/v5/heartbeat';
let lastAppliedSyncTime = 0;
let lastLocalControlTime = 0;
let isApplyingRemoteSync = false;

strategyEngine.onTradeCallback = () => pushCloudSync();
marketAnalysis.onTradeCallback = () => pushCloudSync();

const mqttRelay = new MqttRelayClient({
  clientId: SYNC_DEVICE_ID,
  topics: [SYNC_STATE_TOPIC],
  onMessage: (topic, payload) => {
    try {
      const snap = JSON.parse(payload);
      if (topic === SYNC_STATE_TOPIC) {
        applyRemoteSnapshot(snap);
      }
    } catch {}
  }
});

async function broadcastEngineHeartbeat() {
  try {
    const isLive = Boolean(paperTrading.isLive && binanceService.liveExchange);
    let equity = paperTrading.getBalance().equity;
    if (isLive) {
      const liveBal = await binanceService.getLiveBalance();
      if (liveBal?.equity !== undefined) equity = liveBal.equity;
    }
    mqttRelay.publish(
      SYNC_HEARTBEAT_TOPIC,
      {
        type: 'ENGINE_HEARTBEAT',
        deviceId: SYNC_DEVICE_ID,
        updatedAt: Date.now(),
        isLive,
        botRunning: strategyEngine.isRunning,
        autopilotRunning: marketAnalysis.isAutoPilotRunning,
        equity
      },
      true
    );
  } catch {}
}

async function pushCloudSync() {
  if (isApplyingRemoteSync) return;
  const now = Date.now();
  lastAppliedSyncTime = now;
  saveRuntimeState();

  let liveSummary = null;
  if (paperTrading.isLive && binanceService.liveExchange) {
    try {
      liveSummary = await binanceService.getLiveBalance();
    } catch {}
  }

  const botSt = strategyEngine.getStatus();
  const gSt = marginGuardian.getSettings();
  const compactPositions = (paperTrading.positions || []).slice(0, 6).map(p => ({
    id: p.id,
    symbol: p.symbol,
    side: p.side,
    size: p.size,
    entryPrice: p.entryPrice,
    leverage: p.leverage,
    margin: p.margin,
    tp: p.tp,
    sl: p.sl,
    source: p.source,
    openedAt: p.openedAt
  }));

  const snapshot = {
    type: 'STATE_SYNC',
    deviceId: SYNC_DEVICE_ID,
    updatedAt: now,
    isLive: paperTrading.isLive,
    balance: Number(paperTrading.balance || 0),
    initialBalance: Number(paperTrading.initialBalance || 10000),
    liveSummary,
    positions: compactPositions,
    botStatus: {
      isRunning: botSt.isRunning,
      activeStrategyId: botSt.activeStrategyId,
      symbol: botSt.symbol,
      direction: botSt.direction,
      allocationUsdt: botSt.allocationUsdt,
      leverage: botSt.leverage,
      stopLossPct: botSt.stopLossPct,
      takeProfitPct: botSt.takeProfitPct,
      trailingStopPct: botSt.trailingStopPct,
      timeframe: botSt.timeframe
    },
    autopilotStatus: marketAnalysis.getAutoPilotStatus(),
    guardianSettings: {
      enabled: gSt.enabled,
      criticalMarginRatio: gSt.criticalMarginRatio,
      defaultStopLossPct: gSt.defaultStopLossPct,
      defaultTakeProfitPct: gSt.defaultTakeProfitPct,
      trailingStopPct: gSt.trailingStopPct,
      breakevenTriggerPct: gSt.breakevenTriggerPct,
      smartProfitLockEnabled: gSt.smartProfitLockEnabled
    },
    lastAutoTradeTime: marketAnalysis.lastAutoTradeTime || 0
  };

  mqttRelay.publish(SYNC_STATE_TOPIC, snapshot, true);
}

function applyRemoteSnapshot(snap) {
  if (!snap || typeof snap !== 'object') return;
  if (snap.type === 'ENGINE_HEARTBEAT') return;
  if (snap.deviceId === SYNC_DEVICE_ID) return;
  if (!snap.updatedAt || snap.updatedAt <= lastAppliedSyncTime) return;
  if (snap.updatedAt <= lastLocalControlTime + 2500) return;

  isApplyingRemoteSync = true;
  try {
    lastAppliedSyncTime = snap.updatedAt;
    if (snap.isLive !== undefined && (Boolean(snap.isLive) === false || binanceService.liveExchange)) {
      paperTrading.setLiveMode(Boolean(snap.isLive));
    }
    if (snap.balance !== undefined) paperTrading.balance = Number(snap.balance);
    if (snap.initialBalance !== undefined) paperTrading.initialBalance = Number(snap.initialBalance);
    if (Array.isArray(snap.positions) && !paperTrading.isLive) {
      paperTrading.positions = snap.positions;
    }
    if (snap.botStatus) {
      const prevBotRun = strategyEngine.isRunning;
      strategyEngine.updateConfig(snap.botStatus);
      if (snap.botStatus.isRunning && !strategyEngine.isRunning) strategyEngine.start();
      else if (snap.botStatus.isRunning === false && strategyEngine.isRunning) strategyEngine.stop();
      if (prevBotRun !== strategyEngine.isRunning) {
        console.log(`[Cloud Sync] Remote command from ${snap.deviceId}: Auto-Bot=${strategyEngine.isRunning ? 'ON' : 'OFF'}`);
      }
      io.emit('bot_status', strategyEngine.getStatus());
    }
    if (snap.autopilotStatus) {
      const prevApRun = marketAnalysis.isAutoPilotRunning;
      if (snap.autopilotStatus.config) marketAnalysis.updateAutoPilotConfig(snap.autopilotStatus.config);
      if (snap.autopilotStatus.isAutoPilotRunning && !marketAnalysis.isAutoPilotRunning) marketAnalysis.startAutoPilot();
      else if (snap.autopilotStatus.isAutoPilotRunning === false && marketAnalysis.isAutoPilotRunning) marketAnalysis.stopAutoPilot();
      if (prevApRun !== marketAnalysis.isAutoPilotRunning) {
        console.log(`[Cloud Sync] Remote command from ${snap.deviceId}: Auto-Pilot=${marketAnalysis.isAutoPilotRunning ? 'ON' : 'OFF'}`);
      }
      io.emit('autopilot_status', marketAnalysis.getAutoPilotStatus());
    }
    if (snap.guardianSettings) {
      marginGuardian.setSettings(snap.guardianSettings);
      io.emit('guardian_settings', marginGuardian.getSettings());
    }
    if (snap.lastAutoTradeTime) {
      marketAnalysis.lastAutoTradeTime = Math.max(marketAnalysis.lastAutoTradeTime || 0, snap.lastAutoTradeTime);
    }

    saveRuntimeState();
    broadcastAccountState();
  } finally {
    isApplyingRemoteSync = false;
  }
}

// Generate & serve Apple iOS WebClip Configuration Profile (.mobileconfig) for 1-Tap iPhone Installation
app.get('/ApexAlgo-iPhone.mobileconfig', (req, res) => {
  const hostUrl = `${req.protocol}://${req.get('host')}/`;
  const mobileConfigXml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>FullScreen</key>
      <true/>
      <key>IsRemovable</key>
      <true/>
      <key>Label</key>
      <string>ApexAlgo Pro</string>
      <key>PayloadDescription</key>
      <string>Installs ApexAlgo Pro Full-Screen Crypto Auto-Trading App on iPhone</string>
      <key>PayloadDisplayName</key>
      <string>ApexAlgo Pro iOS App</string>
      <key>PayloadIdentifier</key>
      <string>com.apexalgo.terminal.webclip</string>
      <key>PayloadType</key>
      <string>com.apple.webClip.managed</string>
      <key>PayloadUUID</key>
      <string>A1B2C3D4-E5F6-4789-9012-3456789ABCDE</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
      <key>Precomposed</key>
      <true/>
      <key>URL</key>
      <string>${hostUrl}</string>
    </dict>
  </array>
  <key>PayloadDescription</key>
  <string>ApexAlgo Pro - Next-Gen Crypto Auto-Trading Terminal for iPhone (iOS)</string>
  <key>PayloadDisplayName</key>
  <string>ApexAlgo Pro (iPhone App Installer)</string>
  <key>PayloadIdentifier</key>
  <string>com.apexalgo.terminal.profile</string>
  <key>PayloadOrganization</key>
  <string>ApexAlgo Pro</string>
  <key>PayloadRemovalDisallowed</key>
  <false/>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>F1E2D3C4-B5A6-4789-9012-3456789ABCDE</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
</dict>
</plist>`;
  res.setHeader('Content-Type', 'application/x-apple-aspen-config');
  res.setHeader('Content-Disposition', 'attachment; filename="ApexAlgo-iPhone.mobileconfig"');
  res.send(mobileConfigXml);
});

// Start Server on 0.0.0.0 so both localhost and Mobile LAN devices can connect
server.listen(CONFIG.PORT, '0.0.0.0', () => {
  console.log(`================================================================`);
  console.log(`  CRYPTO AUTO-TRADING ENGINE BACKEND RUNNING ON PORT ${CONFIG.PORT} `);
  console.log(`  TRADINGVIEW WEBHOOK URL: http://localhost:${CONFIG.PORT}${CONFIG.TRADINGVIEW.WEBHOOK_PATH}`);
  console.log(`  MARGIN GUARDIAN: ACTIVE (Auto-Close at ${CONFIG.MARGIN_GUARDIAN.DEFAULT_CRITICAL_MARGIN_RATIO}% Margin)`);
  console.log(`================================================================`);

  // Auto-restore saved live Binance credentials BEFORE loading persisted bot/autopilot state
  (async () => {
    try {
      const credsResult = await binanceService.loadSavedCredentials();
      if (credsResult && credsResult.success && binanceService.liveExchange) {
        paperTrading.setLiveMode(true);
        console.log(`[Binance] Live Trading Mode restored on boot! (${credsResult.message})`);
        await broadcastAccountState();
      }
    } catch (err) {
      console.warn('[Binance] Startup credentials load failed:', err.message);
    }

    // Restore saved bot/autopilot/guardian state only after Live credentials are initialized
    loadRuntimeState();
    mqttRelay.connect();
    broadcastEngineHeartbeat();
    setInterval(broadcastEngineHeartbeat, 25000);
  })();
});
