import { CONFIG } from '../config.js';
import { IndicatorService } from './indicatorService.js';
import { paperTrading } from './paperTradingService.js';
import { binanceService } from './binanceService.js';

export class StrategyEngine {
  constructor(io) {
    this.io = io;
    this.isRunning = false;
    this.activeStrategyId = 'trend_following';
    this.symbol = 'BTCUSDT';
    this.direction = 'BOTH'; // 'BOTH' | 'LONG_ONLY' | 'SHORT_ONLY'
    this.allocationUsdt = 500; // Margin allocated per trade
    this.leverage = 10;
    this.stopLossPct = 4.0;
    this.takeProfitPct = 8.0;
    this.trailingStopPct = 2.0;
    this.timeframe = '15m';

    this.logs = [];
    this.intervalId = null;
    this.lastSignalTime = 0;
    this.candleHistory = [];
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      activeStrategyId: this.activeStrategyId,
      symbol: this.symbol,
      direction: this.direction,
      allocationUsdt: this.allocationUsdt,
      leverage: this.leverage,
      stopLossPct: this.stopLossPct,
      takeProfitPct: this.takeProfitPct,
      trailingStopPct: this.trailingStopPct,
      timeframe: this.timeframe,
      recentLogs: this.logs.slice(0, 50)
    };
  }

  updateConfig(config) {
    if (config.activeStrategyId) this.activeStrategyId = config.activeStrategyId;
    if (config.symbol) this.symbol = config.symbol;
    if (config.direction) this.direction = config.direction;
    if (config.allocationUsdt) this.allocationUsdt = Number(config.allocationUsdt);
    if (config.leverage) this.leverage = Number(config.leverage);
    if (config.stopLossPct) this.stopLossPct = Number(config.stopLossPct);
    if (config.takeProfitPct) this.takeProfitPct = Number(config.takeProfitPct);
    if (config.trailingStopPct) this.trailingStopPct = Number(config.trailingStopPct);
    if (config.timeframe) this.timeframe = config.timeframe;

    this.addLog(`Bot configuration updated: Strategy=${this.activeStrategyId}, Symbol=${this.symbol}, Direction=${this.direction}, Leverage=${this.leverage}x`);
    return this.getStatus();
  }

  start() {
    if (this.isRunning) return this.getStatus();
    this.isRunning = true;
    this.lastSignalTime = 0;
    this.addLog(`🚀 Auto-Trading Bot STARTED! Mode: ${this.direction}, Strategy: ${this.activeStrategyId}, Pair: ${this.symbol}`);

    // Immediate first evaluation cycle on start
    this.evaluateCycle();

    // Evaluation loop every 3.5 seconds
    this.intervalId = setInterval(() => {
      this.evaluateCycle();
    }, 3500);

    return this.getStatus();
  }

  stop() {
    if (!this.isRunning) return this.getStatus();
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.addLog(`🛑 Auto-Trading Bot STOPPED by user`);
    return this.getStatus();
  }

  addLog(message, type = 'INFO', data = null) {
    const entry = {
      id: `LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      message,
      type, // 'INFO' | 'SIGNAL' | 'ORDER' | 'ERROR' | 'SUCCESS'
      data
    };
    this.logs.unshift(entry);
    if (this.logs.length > 200) this.logs.pop();

    if (this.io) {
      this.io.emit('bot_log', entry);
    }
  }

  /**
   * Run strategy cycle
   */
  async evaluateCycle() {
    if (!this.isRunning) return;

    try {
      const isLive = paperTrading.isLive && binanceService.liveExchange;
      let targetSymbol = this.symbol || 'BTCUSDT';

      // If in Live mode with a small balance (< $10), automatically pick an affordable pair (e.g. DOGEUSDT, XRPUSDT, ADAUSDT, SUIUSDT) if BTCUSDT is selected
      if (isLive) {
        const liveBal = await binanceService.getLiveBalance();
        const avail = liveBal?.availableBalance || 0;
        const pairInfo = CONFIG.DEFAULT_PAIRS.find(p => p.symbol === targetSymbol);
        const price = binanceService.getPrice(targetSymbol) || 68000;
        const minReqNotional = Math.max(pairInfo?.minNotional || 5.5, (pairInfo?.minQty || 0.001) * price);
        if (avail * this.leverage < minReqNotional) {
          const affordablePairs = ['DOGEUSDT', 'XRPUSDT', 'ADAUSDT', 'SUIUSDT', 'NEARUSDT', 'SOLUSDT'];
          const livePos = await binanceService.getLivePositions();
          targetSymbol = affordablePairs.find(s => !livePos.some(p => p.symbol === s)) || 'DOGEUSDT';
        }
      }

      // 1. Fetch recent candles for indicator computation
      const candles = await binanceService.fetchKlines(targetSymbol, this.timeframe, 60);
      if (!candles || candles.length < 30) return;

      const indicators = IndicatorService.calculateAll(candles);
      if (!indicators) return;

      const currentPrice = binanceService.getPrice(targetSymbol) || indicators.price;

      // 2. Evaluate selected strategy
      const signal = this.calculateSignal(this.activeStrategyId, indicators, candles);

      if (this.io) {
        this.io.emit('indicators_update', {
          symbol: targetSymbol,
          indicators,
          signal
        });
      }

      // Check if open position already exists for this symbol
      const currentPositions = isLive ? await binanceService.getLivePositions() : paperTrading.positions;
      const existingPos = currentPositions.find(p => p.symbol === targetSymbol);

      if (signal.action !== 'HOLD') {
        const now = Date.now();
        // Cooldown between entries: at least 20 seconds
        if (now - this.lastSignalTime > 20000) {
          await this.handleSignal(signal, currentPrice, existingPos, targetSymbol);
        }
      }
    } catch (err) {
      console.error('[StrategyEngine] Cycle error:', err.message);
    }
  }

  /**
   * Calculate strategy signal based on indicators
   */
  calculateSignal(strategyId, ind, candles) {
    const { price, rsi, macd, bollinger, ema, adx, volume, supertrend } = ind;

    let action = 'HOLD'; // 'LONG' | 'SHORT' | 'CLOSE' | 'HOLD'
    let confidence = 50;
    let rationale = '';

    switch (strategyId) {
      case 'trend_following': {
        if ((ema.goldenCross || ema.bullishAlignment || supertrend.direction === 'BULLISH') && price >= ema.ema21 && rsi < 72) {
          action = 'LONG';
          confidence = 85;
          rationale = `Trend Following Bullish: EMA9 ($${ema.ema9}) >= EMA21 ($${ema.ema21}) with SuperTrend & ADX ${adx.adx}`;
        } else if ((ema.deathCross || ema.bearishAlignment || supertrend.direction === 'BEARISH') && price <= ema.ema21 && rsi > 28) {
          action = 'SHORT';
          confidence = 85;
          rationale = `Trend Following Bearish: EMA9 ($${ema.ema9}) <= EMA21 ($${ema.ema21}) with SuperTrend & ADX ${adx.adx}`;
        }
        break;
      }

      case 'breakout_trading': {
        if (price >= bollinger.middle && (macd.histogram >= 0 || volume.surgeRatio >= 1.05)) {
          action = 'LONG';
          confidence = 84;
          rationale = `Bollinger Upper Expansion ($${price} > Mid $${bollinger.middle}) with ${volume.surgeRatio}x Volume`;
        } else if (price < bollinger.middle && (macd.histogram < 0 || volume.surgeRatio >= 1.05)) {
          action = 'SHORT';
          confidence = 84;
          rationale = `Bollinger Lower Breakdown ($${price} < Mid $${bollinger.middle}) with ${volume.surgeRatio}x Volume`;
        }
        break;
      }

      case 'mean_reversion': {
        if (rsi <= 48 || price <= bollinger.middle) {
          action = 'LONG';
          confidence = 80;
          rationale = `Mean Reversion Long Bounce: RSI ${rsi} with support near Bollinger Lower ($${bollinger.lower})`;
        } else if (rsi > 52 || price > bollinger.middle) {
          action = 'SHORT';
          confidence = 80;
          rationale = `Mean Reversion Short Pullback: RSI ${rsi} near Bollinger Upper ($${bollinger.upper})`;
        }
        break;
      }

      case 'momentum_scalper': {
        if (macd.histogram >= 0 || rsi >= 50) {
          action = 'LONG';
          confidence = 83;
          rationale = `Momentum Scalper Long: MACD Hist ${macd.histogram} & RSI ${rsi}`;
        } else {
          action = 'SHORT';
          confidence = 83;
          rationale = `Momentum Scalper Short: MACD Hist ${macd.histogram} & RSI ${rsi}`;
        }
        break;
      }

      case 'swing_trader': {
        if (supertrend.direction === 'BULLISH' || price >= ema.ema50) {
          action = 'LONG';
          confidence = 80;
          rationale = `Swing Wave Bullish: SuperTrend ${supertrend.direction} & Price vs EMA50 ($${ema.ema50})`;
        } else {
          action = 'SHORT';
          confidence = 80;
          rationale = `Swing Wave Bearish: SuperTrend ${supertrend.direction} & Price vs EMA50 ($${ema.ema50})`;
        }
        break;
      }

      case 'grid_dca': {
        if (price <= ema.ema21 || rsi <= 50) {
          action = 'LONG';
          confidence = 76;
          rationale = `Grid DCA Dip Buy Level: Price $${price} at EMA21 ($${ema.ema21}), RSI ${rsi}`;
        } else {
          action = 'SHORT';
          confidence = 76;
          rationale = `Grid DCA Peak Sell Level: Price $${price} above EMA21 ($${ema.ema21}), RSI ${rsi}`;
        }
        break;
      }

      case 'arbitrage_scanner': {
        const priceDev = ((price - ema.ema21) / ema.ema21) * 100;
        if (priceDev <= 0) {
          action = 'LONG';
          confidence = 78;
          rationale = `Arbitrage Mean Capture Long: Spread ${priceDev.toFixed(2)}% below EMA21`;
        } else {
          action = 'SHORT';
          confidence = 78;
          rationale = `Arbitrage Mean Capture Short: Spread +${priceDev.toFixed(2)}% above EMA21`;
        }
        break;
      }

      case 'ai_sentiment_ml':
      default: {
        const isBull = supertrend.direction === 'BULLISH' || macd.histogram >= 0 || price >= ema.ema21;
        action = isBull ? 'LONG' : 'SHORT';
        confidence = 86;
        rationale = `AI Confluence Model triggered ${action} (SuperTrend: ${supertrend.direction}, RSI: ${rsi})`;
        break;
      }
    }

    return {
      action,
      confidence,
      rationale,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Handle executed trade signal
   */
  async handleSignal(signal, currentPrice, existingPos, targetSymbol = null) {
    const tradeSymbol = targetSymbol || this.symbol || 'BTCUSDT';
    // Respect Direction Filters:
    if (signal.action === 'LONG' && this.direction === 'SHORT_ONLY') {
      return; // Filtered out
    }
    if (signal.action === 'SHORT' && this.direction === 'LONG_ONLY') {
      return; // Filtered out
    }

    // If already in identical position, avoid duplicate stacking
    if (existingPos && existingPos.side === signal.action) {
      return;
    }

    const isLive = paperTrading.isLive && binanceService.liveExchange;
    let effectiveAllocation = this.allocationUsdt;
    let effectiveLeverage = this.leverage || 10;

    if (isLive) {
      const liveBal = await binanceService.getLiveBalance();
      const avail = liveBal?.availableBalance || 0;
      if (avail <= 0.3) {
        this.addLog(`⚠️ Auto-Bot paused: Insufficient Binance USDT margin ($${avail} available).`, 'ERROR');
        return;
      }
      if (avail < effectiveAllocation) {
        effectiveAllocation = Number(Math.max(0.6, avail * 0.65).toFixed(2));
        if (effectiveAllocation > avail) effectiveAllocation = Number((avail * 0.92).toFixed(2));
        if (effectiveAllocation * effectiveLeverage < 5.6) {
          effectiveLeverage = Math.min(20, Math.ceil(6.0 / effectiveAllocation));
        }
      }
    }

    // If opposite position exists, close it first (flip trade)
    if (existingPos && existingPos.side !== signal.action) {
      this.addLog(`🔄 Reversing position from ${existingPos.side} to ${signal.action} on ${tradeSymbol}`);
      if (isLive) {
        await binanceService.closeLivePosition({
          symbol: existingPos.symbol,
          side: existingPos.side,
          size: existingPos.size
        });
      }
      try {
        paperTrading.closePosition(existingPos.id, currentPrice, 'AUTO_STRATEGY_REVERSE');
      } catch {}
    }

    // Calculate TP / SL price levels
    let tpPrice = null;
    let slPrice = null;
    if (signal.action === 'LONG') {
      tpPrice = currentPrice * (1 + (this.takeProfitPct / 100 / effectiveLeverage));
      slPrice = currentPrice * (1 - (this.stopLossPct / 100 / effectiveLeverage));
    } else if (signal.action === 'SHORT') {
      tpPrice = currentPrice * (1 - (this.takeProfitPct / 100 / effectiveLeverage));
      slPrice = currentPrice * (1 + (this.stopLossPct / 100 / effectiveLeverage));
    }

    try {
      let liveOrder = null;
      if (isLive) {
        liveOrder = await binanceService.executeLiveOrder({
          symbol: tradeSymbol,
          side: signal.action,
          amountUsdt: effectiveAllocation,
          leverage: effectiveLeverage
        });
      }

      const pos = paperTrading.openPosition({
        symbol: tradeSymbol,
        side: signal.action,
        amountUsdt: effectiveAllocation,
        leverage: effectiveLeverage,
        markPrice: currentPrice,
        tp: tpPrice,
        sl: slPrice,
        trailingStopPct: this.trailingStopPct,
        source: isLive ? 'BINANCE_LIVE_BOT' : 'AUTO_BOT'
      });

      if (liveOrder) {
        pos.binanceOrderId = liveOrder.id;
      }

      this.lastSignalTime = Date.now();
      this.addLog(`⚡ Auto-Trade Executed: ${signal.action} on ${tradeSymbol} @ $${currentPrice.toFixed(4)} | Margin: $${effectiveAllocation} (${effectiveLeverage}x) | ${signal.rationale}${isLive ? ' [LIVE BINANCE]' : ''}`, 'ORDER', pos);

      if (this.io) {
        this.io.emit('position_opened', pos);
        if (isLive) {
          const updatedBal = await binanceService.getLiveBalance();
          const updatedPos = await binanceService.getLivePositions();
          if (updatedBal) this.io.emit('account_summary', updatedBal);
          this.io.emit('positions_update', updatedPos || []);
        } else {
          this.io.emit('positions_update', paperTrading.positions);
          this.io.emit('account_summary', paperTrading.getBalance());
        }
      }
    } catch (err) {
      this.addLog(`❌ Failed to execute ${signal.action}: ${err.message}`, 'ERROR');
    }
  }
}
