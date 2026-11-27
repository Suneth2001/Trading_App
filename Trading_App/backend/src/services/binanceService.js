import axios from 'axios';
import WebSocket from 'ws';
import ccxt from 'ccxt';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CONFIG } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CREDENTIALS_FILE = path.resolve(__dirname, '../../credentials.json');

export class BinanceService {
  constructor() {
    this.prices = {
      'BTCUSDT': 68500.0,
      'ETHUSDT': 3500.0,
      'SOLUSDT': 180.0,
      'BNBUSDT': 590.0,
      'DOGEUSDT': 0.15,
      'XRPUSDT': 0.58,
      'ADAUSDT': 0.38,
      'AVAXUSDT': 28.5,
      'LINKUSDT': 12.4,
      'SUIUSDT': 2.15,
      'NEARUSDT': 4.85,
      'PEPEUSDT': 0.0000105
    };
    this.tickerStats = {};
    this.candlesCache = {}; // { 'BTCUSDT-15m': [...] }
    this.candlesCacheTime = {}; // TTL timestamp tracking
    this.ws = null;
    this.reconnectTimer = null;
    this.liveExchange = null;
    this.apiKey = null;
    this.apiSecret = null;
    this.useTestnet = true;
  }

  async setApiCredentials({ apiKey, apiSecret, useTestnet = false }) {
    this.apiKey = apiKey ? apiKey.trim() : null;
    this.apiSecret = apiSecret ? apiSecret.trim() : null;
    this.useTestnet = Boolean(useTestnet);
    this._cachedLiveBal = null;
    this._cachedLivePositions = null;
    this.isFutures = true;

    if (this.apiKey && this.apiSecret) {
      // 1. Try connecting to USD-M Futures first
      let exchange = new ccxt.binance({
        apiKey: this.apiKey,
        secret: this.apiSecret,
        enableRateLimit: true,
        options: {
          defaultType: 'future', // USD-M Futures for Long & Short
          adjustForTimeDifference: true // Auto sync clock skew
        }
      });

      if (this.useTestnet) {
        exchange.setSandboxMode(true);
      }

      let balance = null;
      let usedFutures = true;

      try {
        balance = await exchange.fetchBalance();
      } catch (err) {
        // If futures failed due to testnet deprecation
        if (err.message && err.message.includes('testnet/sandbox mode is not supported')) {
          this.liveExchange = null;
          return {
            success: false,
            error: 'Binance Testnet is deprecated by Binance. Please UNCHECK "Use Binance Futures Testnet" to connect your real Binance account.'
          };
        }

        // If futures failed due to permissions or key restrictions, try Spot API with "Enable Reading"
        console.warn('[Binance] Futures connection failed, attempting Spot API fallback:', err.message);
        try {
          const spotExchange = new ccxt.binance({
            apiKey: this.apiKey,
            secret: this.apiSecret,
            enableRateLimit: true,
            options: {
              defaultType: 'spot',
              adjustForTimeDifference: true
            }
          });
          balance = await spotExchange.fetchBalance();
          exchange = spotExchange;
          usedFutures = false;
        } catch (spotErr) {
          this.liveExchange = null;
          let errMsg = err.message || 'Authentication failed';
          
          if (errMsg.includes('-2008') || errMsg.includes('Invalid Api-Key ID')) {
            errMsg = 'Invalid Binance API Key. Please double-check that you copied the complete API Key correctly without missing characters.';
          } else if (errMsg.includes('-2015') || errMsg.includes('Invalid API-key') || errMsg.includes('AuthenticationError')) {
            errMsg = 'Invalid Binance API Key, Secret, or IP restriction. Your router public IP may have changed — check Settings -> Current IP and add it to trusted IPs on Binance with "Enable Futures" checked.';
          } else if (errMsg.includes('-1021') || errMsg.includes('Timestamp')) {
            errMsg = 'System clock out of sync. Please synchronize your computer time in Windows Settings.';
          } else if (errMsg.includes('IP') || errMsg.includes('restricted')) {
            errMsg = 'Binance IP Access Restriction. Please add your current public IP in Settings to trusted IPs in Binance API Management.';
          }

          return {
            success: false,
            error: errMsg
          };
        }
      }

      this.liveExchange = exchange;
      this.isFutures = usedFutures;

      let usdtFree = 0;
      let usdtTotal = 0;

      if (balance.USDT) {
        usdtFree = parseFloat(balance.USDT.free || 0);
        usdtTotal = parseFloat(balance.USDT.total || usdtFree);
      } else if (balance.free?.USDT !== undefined) {
        usdtFree = parseFloat(balance.free.USDT || 0);
        usdtTotal = parseFloat(balance.total?.USDT || usdtFree);
      } else if (balance.info?.assets) {
        const usdtAsset = (balance.info.assets || []).find(a => a.asset === 'USDT');
        if (usdtAsset) {
          usdtFree = parseFloat(usdtAsset.availableBalance || usdtAsset.walletBalance || 0);
          usdtTotal = parseFloat(usdtAsset.marginBalance || usdtAsset.walletBalance || 0);
        }
      }

      const msg = usedFutures
        ? `Connected to Binance Futures Live! Balance: $${Number(usdtFree).toFixed(2)} USDT (Equity: $${Number(usdtTotal).toFixed(2)})`
        : `Connected to Binance Spot (Read-Only)! Balance: $${Number(usdtFree).toFixed(2)} USDT. Note: To trade Futures, select 'Restrict access to trusted IPs only' on Binance, add your IP (112.134.246.225), and tick 'Enable Futures'.`;

      // Persist credentials locally so server restarts keep live trading active
      try {
        fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify({
          apiKey: this.apiKey,
          apiSecret: this.apiSecret,
          useTestnet: this.useTestnet
        }, null, 2));
      } catch (saveErr) {
        console.warn('[Binance] Failed to persist credentials:', saveErr.message);
      }

      return {
        success: true,
        message: msg,
        balance: Number(usdtTotal),
        free: Number(usdtFree),
        isFutures: usedFutures,
        isTestnet: this.useTestnet
      };
    }
    this.liveExchange = null;
    try {
      if (fs.existsSync(CREDENTIALS_FILE)) {
        fs.unlinkSync(CREDENTIALS_FILE);
      }
    } catch (_) {}
    return { success: true, message: 'Reverted to Paper Trading' };
  }

  /**
   * Auto-load saved credentials from credentials.json on server boot
   */
  async loadSavedCredentials() {
    try {
      if (fs.existsSync(CREDENTIALS_FILE)) {
        const raw = fs.readFileSync(CREDENTIALS_FILE, 'utf8');
        const creds = JSON.parse(raw);
        if (creds && creds.apiKey && creds.apiSecret) {
          console.log('[Binance] Restoring saved credentials on startup...');
          return await this.setApiCredentials(creds);
        }
      }
    } catch (e) {
      console.warn('[Binance] Failed to restore saved credentials:', e.message);
    }
    return null;
  }

  /**
   * Fetch live balance from Binance USD-M Futures account
   */
  async getLiveBalance() {
    if (!this.liveExchange) return null;
    const now = Date.now();
    if (this._cachedLiveBal && (now - (this._lastBalTime || 0) < 3000)) {
      return this._cachedLiveBal;
    }
    try {
      const balance = await this.liveExchange.fetchBalance();
      let usdtFree = 0;
      let usdtTotal = 0;

      if (balance.USDT) {
        usdtFree = parseFloat(balance.USDT.free || 0);
        usdtTotal = parseFloat(balance.USDT.total || usdtFree);
      } else if (balance.free?.USDT !== undefined) {
        usdtFree = parseFloat(balance.free.USDT || 0);
        usdtTotal = parseFloat(balance.total?.USDT || usdtFree);
      } else if (balance.info?.assets) {
        const usdtAsset = (balance.info.assets || []).find(a => a.asset === 'USDT');
        if (usdtAsset) {
          usdtFree = parseFloat(usdtAsset.availableBalance || usdtAsset.walletBalance || 0);
          usdtTotal = parseFloat(usdtAsset.marginBalance || usdtAsset.walletBalance || 0);
        }
      }

      const margin = Math.max(0, usdtTotal - usdtFree);
      const unrealizedPnl = parseFloat(balance.info?.totalUnrealizedProfit || 0);

      this._cachedLiveBal = {
        availableBalance: Number(usdtFree.toFixed(2)),
        totalMargin: Number(margin.toFixed(2)),
        equity: Number(usdtTotal.toFixed(2)),
        totalUnrealizedPnl: Number(unrealizedPnl.toFixed(2)),
        isLive: true
      };
      this._lastBalTime = now;
      return this._cachedLiveBal;
    } catch (e) {
      console.warn('[Binance] Failed to fetch live balance:', e.message);
      return this._cachedLiveBal || null;
    }
  }

  /**
   * Fetch real open positions from Binance USD-M Futures
   */
  async getLivePositions() {
    if (!this.liveExchange) return [];
    const now = Date.now();
    if (this._cachedLivePositions && (now - (this._lastPosTime || 0) < 2000)) {
      // Smoothly update live mark price and PnL on cached positions
      return this._cachedLivePositions.map(pos => {
        const livePrice = this.getPrice(pos.symbol) || pos.currentPrice;
        let pnl = pos.unrealizedPnl;
        let roe = pos.roePct;
        if (livePrice && pos.entryPrice && pos.size) {
          pnl = pos.side === 'LONG' ? (livePrice - pos.entryPrice) * pos.size : (pos.entryPrice - livePrice) * pos.size;
          roe = pos.margin > 0 ? (pnl / pos.margin) * 100 : roe;
        }
        const notional = pos.size * livePrice;
        const maintMargin = notional * 0.01;
        const marginBal = Math.max(0.01, pos.margin + pnl);
        const marginRatio = Math.min(100, Math.max(1, (maintMargin / marginBal) * 100));

        return {
          ...pos,
          currentPrice: Number(livePrice.toFixed(4)),
          unrealizedPnl: Number(pnl.toFixed(4)),
          roePct: Number(roe.toFixed(2)),
          marginRatio: Number(marginRatio.toFixed(1))
        };
      });
    }
    try {
      const rawPositions = await this.liveExchange.fetchPositions();
      this._cachedLivePositions = (rawPositions || [])
        .filter(p => Math.abs(parseFloat(p.contracts || p.size || 0)) > 0)
        .map(p => {
          const cleanSym = p.symbol.replace('/', '').replace(':USDT', '');
          const normSide = (p.side || '').toUpperCase() === 'SHORT' ? 'SHORT' : 'LONG';
          const entryPrice = parseFloat(p.entryPrice || 0);
          const livePrice = this.getPrice(cleanSym) || parseFloat(p.markPrice || entryPrice);
          const size = Math.abs(parseFloat(p.contracts || p.size || 0));
          const margin = parseFloat(p.initialMargin || p.collateral || 0);
          let pnl = parseFloat(p.unrealizedPnl || p.info?.unRealizedProfit || 0);
          if (livePrice && entryPrice && size) {
            pnl = normSide === 'LONG' ? (livePrice - entryPrice) * size : (entryPrice - livePrice) * size;
          }
          const roe = margin > 0 ? (pnl / margin) * 100 : parseFloat(p.percentage || 0);

          // Calculate genuine Binance Futures Margin Ratio: (maintMargin / marginBalance) * 100
          const notional = size * livePrice;
          const rawMaint = parseFloat(p.info?.maintMargin || 0);
          const maintMargin = rawMaint > 0 ? rawMaint : (notional * 0.01);
          const marginBal = Math.max(0.01, margin + pnl);
          const marginRatio = Math.min(100, Math.max(1, (maintMargin / marginBal) * 100));

          return {
            id: `BINANCE-${cleanSym}-${normSide}`,
            symbol: cleanSym,
            side: normSide,
            size,
            entryPrice,
            currentPrice: Number(livePrice.toFixed(4)),
            leverage: parseInt(p.leverage || 10),
            margin: Number(margin.toFixed(4)),
            liquidationPrice: parseFloat(p.liquidationPrice || 0),
            marginRatio: Number(marginRatio.toFixed(1)),
            unrealizedPnl: Number(pnl.toFixed(4)),
            roePct: Number(roe.toFixed(2)),
            source: 'BINANCE_LIVE',
            openedAt: new Date(p.timestamp || Date.now()).toISOString()
          };
        });
      this._lastPosTime = now;
      return this._cachedLivePositions;
    } catch (e) {
      console.warn('[Binance] Failed to fetch live positions:', e.message);
      return this._cachedLivePositions || [];
    }
  }

  /**
   * Execute real market order on Binance USD-M Futures
   */
  async executeLiveOrder({ symbol, side, amountUsdt, leverage = 10 }) {
    if (!this.liveExchange) {
      throw new Error('Binance API keys not configured. Please set them in Settings.');
    }
    if (!this.isFutures) {
      throw new Error('Futures trading permission is missing! Please select "Restrict access to trusted IPs only" on Binance, add IP 112.134.246.225, and check "Enable Futures".');
    }
    const cleanSym = symbol.replace('/', '').toUpperCase();
    const pairInfo = CONFIG.DEFAULT_PAIRS.find(p => p.symbol === cleanSym) || { stepDecimals: 2, minQty: 0.01, minNotional: 5.5 };
    const futuresSym = cleanSym === 'PEPEUSDT' ? '1000PEPEUSDT' : cleanSym;
    const marketSymbol = `${futuresSym.replace('USDT', '')}/USDT:USDT`;
    
    try {
      await this.liveExchange.setLeverage(leverage, marketSymbol);
    } catch {
      try {
        await this.liveExchange.setLeverage(leverage, `${futuresSym.replace('USDT', '')}/USDT`);
      } catch (e) {
        console.warn('[Binance Live] Leverage setting note:', e.message);
      }
    }

    const rawPrice = this.getPrice(cleanSym);
    const price = cleanSym === 'PEPEUSDT' ? rawPrice * 1000 : rawPrice;
    const notional = Math.max(pairInfo.minNotional || 5.5, amountUsdt * leverage);
    const rawQty = notional / price;
    const decimals = pairInfo.stepDecimals !== undefined ? pairInfo.stepDecimals : 2;
    const factor = Math.pow(10, decimals);
    const quantity = Math.max(pairInfo.minQty || 0.001, Math.ceil(rawQty * factor) / factor);
    const fixedQty = Number(quantity.toFixed(decimals));
    const orderSide = side === 'LONG' ? 'buy' : 'sell';

    const order = await this.liveExchange.createOrder(
      marketSymbol,
      'market',
      orderSide,
      fixedQty
    );
    this._cachedLiveBal = null;
    this._cachedLivePositions = null;
    return order;
  }

  /**
   * Close real position on Binance USD-M Futures
   */
  async closeLivePosition({ symbol, side, size }) {
    if (!this.liveExchange) return null;
    const cleanSym = symbol.replace('/', '').toUpperCase();
    const futuresSym = cleanSym === 'PEPEUSDT' ? '1000PEPEUSDT' : cleanSym;
    const marketSymbol = `${futuresSym.replace('USDT', '')}/USDT:USDT`;
    const closeSide = side === 'LONG' ? 'sell' : 'buy';

    try {
      const order = await this.liveExchange.createOrder(
        marketSymbol,
        'market',
        closeSide,
        size,
        undefined,
        { reduceOnly: true }
      );
      this._cachedLiveBal = null;
      this._cachedLivePositions = null;
      return order;
    } catch (err) {
      console.warn('[Binance Live] Close order note:', err.message);
      return null;
    }
  }

  getCurrentPrices() {
    return { ...this.prices };
  }

  getPrice(symbol) {
    return this.prices[symbol] || 0;
  }

  getTickerStats() {
    return { ...this.tickerStats };
  }

  /**
   * Fetch 24hr statistics from Binance Futures or Spot REST API
   */
  async fetchTickerStats() {
    try {
      const response = await axios.get('https://fapi.binance.com/fapi/v1/ticker/24hr', { timeout: 6000 });
      if (Array.isArray(response.data)) {
        for (const item of response.data) {
          const sym = item.symbol;
          if (CONFIG.DEFAULT_PAIRS.some(p => p.symbol === sym)) {
            const price = parseFloat(item.lastPrice);
            this.prices[sym] = price;
            this.tickerStats[sym] = {
              symbol: sym,
              lastPrice: price,
              priceChangePercent: parseFloat(item.priceChangePercent),
              highPrice: parseFloat(item.highPrice),
              lowPrice: parseFloat(item.lowPrice),
              volume: parseFloat(item.volume),
              quoteVolume: parseFloat(item.quoteVolume)
            };
          }
        }
      }
      return this.tickerStats;
    } catch {
      // Fallback to Spot API if Futures is blocked or geo-restricted
      try {
        const spotRes = await axios.get('https://api.binance.com/api/v3/ticker/24hr', { timeout: 6000 });
        if (Array.isArray(spotRes.data)) {
          for (const item of spotRes.data) {
            const sym = item.symbol;
            if (CONFIG.DEFAULT_PAIRS.some(p => p.symbol === sym)) {
              const price = parseFloat(item.lastPrice);
              this.prices[sym] = price;
              this.tickerStats[sym] = {
                symbol: sym,
                lastPrice: price,
                priceChangePercent: parseFloat(item.priceChangePercent),
                highPrice: parseFloat(item.highPrice),
                lowPrice: parseFloat(item.lowPrice),
                volume: parseFloat(item.volume),
                quoteVolume: parseFloat(item.quoteVolume)
              };
            }
          }
        }
      } catch (err2) {
        console.warn('[BinanceService] Could not reach Binance REST, using current simulation prices:', err2.message);
      }
      return this.tickerStats;
    }
  }

  /**
   * Fetch historical candlestick data
   */
  async fetchKlines(symbol = 'BTCUSDT', interval = '15m', limit = 100) {
    const normInterval = (interval || '15m').toLowerCase();
    const cacheKey = `${symbol}-${normInterval}`;
    const now = Date.now();
    const ttl = (normInterval === '1h' || normInterval === '4h') ? 25000 : 3500;

    if (this.candlesCache[cacheKey] && this.candlesCacheTime?.[cacheKey] && (now - this.candlesCacheTime[cacheKey] < ttl)) {
      return this.candlesCache[cacheKey];
    }

    try {
      // Try Spot REST first (globally accessible, 0 geo-restrictions)
      let res;
      try {
        res = await axios.get(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${normInterval}&limit=${limit}`, { timeout: 6000 });
      } catch {
        res = await axios.get(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${normInterval}&limit=${limit}`, { timeout: 6000 });
      }

      if (res && Array.isArray(res.data)) {
        const candles = res.data.map(k => ({
          time: Math.floor(k[0] / 1000), // UNIX timestamp seconds for Lightweight Charts
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5])
        }));
        this.candlesCache[cacheKey] = candles;
        if (!this.candlesCacheTime) this.candlesCacheTime = {};
        this.candlesCacheTime[cacheKey] = now;
        if (candles.length > 0) {
          this.prices[symbol] = candles[candles.length - 1].close;
        }
        return candles;
      }
    } catch (err) {
      console.warn(`[BinanceService] Failed to load klines for ${symbol} (${normInterval}):`, err.message);
    }

    // Return cached or synthetic candles if offline/blocked
    if (this.candlesCache[cacheKey]) {
      return this.candlesCache[cacheKey];
    }
    return this.generateSyntheticCandles(symbol, limit, normInterval);
  }

  /**
   * Generate realistic market candles if network / rate limit issues occur
   */
  generateSyntheticCandles(symbol, count = 100, interval = '15m') {
    const basePrice = this.prices[symbol] || 65000;
    const candles = [];
    const now = Math.floor(Date.now() / 1000);
    
    const intervalMap = {
      '1m': 60,
      '5m': 300,
      '15m': 900,
      '1h': 3600,
      '4h': 14400,
      '1d': 86400
    };
    const intervalSec = intervalMap[interval.toLowerCase()] || 900;

    let current = basePrice;
    for (let i = count; i >= 0; i--) {
      const time = now - (i * intervalSec);
      const volatility = current * 0.003;
      const change = (Math.random() - 0.49) * volatility;
      const open = current;
      const close = current + change;
      const high = Math.max(open, close) + (Math.random() * volatility * 0.6);
      const low = Math.min(open, close) - (Math.random() * volatility * 0.6);
      const volume = Math.random() * 50 + 10;

      candles.push({
        time,
        open: Number(open.toFixed(2)),
        high: Number(high.toFixed(2)),
        low: Number(low.toFixed(2)),
        close: Number(close.toFixed(2)),
        volume: Number(volume.toFixed(2))
      });
      current = close;
    }
    this.candlesCache[`${symbol}-${interval}`] = candles;
    return candles;
  }

  /**
   * Fetch live order book depth (bids and asks)
   */
  async fetchOrderBook(symbol = 'BTCUSDT', limit = 15) {
    try {
      let res;
      try {
        res = await axios.get(`https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=${limit}`, { timeout: 4000 });
      } catch {
        res = await axios.get(`https://fapi.binance.com/fapi/v1/depth?symbol=${symbol}&limit=${limit}`, { timeout: 4000 });
      }

      if (res && res.data && Array.isArray(res.data.bids) && Array.isArray(res.data.asks)) {
        const bids = res.data.bids.slice(0, limit).map(b => [parseFloat(b[0]), parseFloat(b[1])]);
        const asks = res.data.asks.slice(0, limit).map(a => [parseFloat(a[0]), parseFloat(a[1])]);

        const totalBidVol = bids.reduce((acc, b) => acc + (b[0] * b[1]), 0);
        const totalAskVol = asks.reduce((acc, a) => acc + (a[0] * a[1]), 0);
        const totalVol = totalBidVol + totalAskVol;
        const buyerPressure = totalVol > 0 ? (totalBidVol / totalVol) * 100 : 50;

        return {
          symbol,
          bids,
          asks,
          totalBidVol: Number(totalBidVol.toFixed(2)),
          totalAskVol: Number(totalAskVol.toFixed(2)),
          buyerPressure: Number(buyerPressure.toFixed(1)),
          sellerPressure: Number((100 - buyerPressure).toFixed(1)),
          spread: Number(Math.abs(asks[0][0] - bids[0][0]).toFixed(4))
        };
      }
    } catch {
      // Fallback generator
    }

    // Realistic fallback order book
    const currentPrice = this.getPrice(symbol) || 68500;
    const bids = [];
    const asks = [];
    let bidVol = 0;
    let askVol = 0;

    for (let i = 1; i <= limit; i++) {
      const bPrice = currentPrice * (1 - (i * 0.0004));
      const bQty = (Math.random() * 2 + 0.5) * (currentPrice > 1000 ? 0.2 : 50);
      bids.push([Number(bPrice.toFixed(2)), Number(bQty.toFixed(4))]);
      bidVol += bPrice * bQty;

      const aPrice = currentPrice * (1 + (i * 0.0004));
      const aQty = (Math.random() * 2 + 0.5) * (currentPrice > 1000 ? 0.2 : 50);
      asks.push([Number(aPrice.toFixed(2)), Number(aQty.toFixed(4))]);
      askVol += aPrice * aQty;
    }

    const total = bidVol + askVol;
    const buyerPressure = (bidVol / total) * 100;

    return {
      symbol,
      bids,
      asks,
      totalBidVol: Number(bidVol.toFixed(2)),
      totalAskVol: Number(askVol.toFixed(2)),
      buyerPressure: Number(buyerPressure.toFixed(1)),
      sellerPressure: Number((100 - buyerPressure).toFixed(1)),
      spread: Number((asks[0][0] - bids[0][0]).toFixed(2))
    };
  }

  /**
   * Initialize live WebSocket feed for all default pairs
   */
  initWebSocket(onTickCallback) {
    const url = 'wss://stream.binance.com:9443/ws/!miniTicker@arr';

    const connect = () => {
      try {
        this.ws = new WebSocket(url);

        this.ws.on('open', () => {
          console.log('[Binance WebSocket] Connected to Binance Live Spot miniTicker stream');
        });

        this.ws.on('message', (data) => {
          try {
            const arr = JSON.parse(data);
            if (!Array.isArray(arr)) return;

            this.lastWsTick = Date.now();

            for (const item of arr) {
              const sym = item.s;
              if (CONFIG.DEFAULT_PAIRS.some(p => p.symbol === sym)) {
                const price = parseFloat(item.c);
                const open = parseFloat(item.o);
                const changePct = open > 0 ? ((price - open) / open) * 100 : 0;
                this.prices[sym] = price;
                this.tickerStats[sym] = {
                  symbol: sym,
                  lastPrice: price,
                  priceChangePercent: Number(changePct.toFixed(2)),
                  highPrice: parseFloat(item.h),
                  lowPrice: parseFloat(item.l),
                  volume: parseFloat(item.v),
                  quoteVolume: parseFloat(item.q)
                };
                if (onTickCallback) {
                  onTickCallback(sym, price, this.tickerStats[sym]);
                }
              }
            }
          } catch (e) {
            // ignore malformed
          }
        });

        this.ws.on('close', () => {
          console.warn('[Binance WebSocket] Connection closed, reconnecting in 3s...');
          this.scheduleReconnect(connect);
        });

        this.ws.on('error', (err) => {
          console.warn('[Binance WebSocket] Error:', err.message);
          try { this.ws.close(); } catch {}
        });
      } catch (err) {
        console.warn('[Binance WebSocket] Init failed, starting fallback price simulator:', err.message);
        this.startFallbackSimulator(onTickCallback);
      }
    };

    connect();

    // Only activates if live Binance ticks stop arriving
    this.startFallbackSimulator(onTickCallback);
  }

  scheduleReconnect(connectFn) {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      connectFn();
    }, 3000);
  }

  /**
   * Micro-fluctuation generator to keep live UI dynamic ONLY if network cuts out
   */
  startFallbackSimulator(onTickCallback) {
    setInterval(() => {
      // NEVER override genuine Binance prices if live ticks arrived in the last 8 seconds
      if (this.lastWsTick && (Date.now() - this.lastWsTick) < 8000) {
        return;
      }

      for (const pair of CONFIG.DEFAULT_PAIRS) {
        const sym = pair.symbol;
        const current = this.prices[sym] || 100;
        const delta = (Math.random() - 0.495) * (current * 0.0004);
        const newPrice = Number((current + delta).toFixed(pair.precision));
        this.prices[sym] = newPrice;
        if (onTickCallback) {
          onTickCallback(sym, newPrice, this.tickerStats[sym] || {
            symbol: sym,
            lastPrice: newPrice,
            priceChangePercent: 1.25,
            highPrice: newPrice * 1.02,
            lowPrice: newPrice * 0.98,
            volume: 45000
          });
        }
      }
    }, 1000);
  }
}

export const binanceService = new BinanceService();
