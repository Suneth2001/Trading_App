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
    this.addLog(`🚀 Auto-Trading Bot STARTED! Mode: ${this.direction}, Strategy: ${this.activeStrategyId}, Pair: ${this.symbol}`);

    // Evaluation loop every 3 seconds
    this.intervalId = setInterval(() => {
      this.evaluateCycle();
    }, 3000);

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
      // 1. Fetch recent candles for indicator computation
      const candles = await binanceService.fetchKlines(this.symbol, this.timeframe, 60);
      if (!candles || candles.length < 30) return;

      const indicators = IndicatorService.calculateAll(candles);
      if (!indicators) return;

      const currentPrice = binanceService.getPrice(this.symbol) || indicators.price;

      // 2. Evaluate selected strategy
      const signal = this.calculateSignal(this.activeStrategyId, indicators, candles);

      if (this.io) {
        this.io.emit('indicators_update', {
          symbol: this.symbol,
          indicators,
          signal
        });
      }

      // Check if open position already exists for this symbol
      const existingPos = paperTrading.positions.find(p => p.symbol === this.symbol);

      if (signal.action !== 'HOLD') {
        const now = Date.now();
        // Cooldown between entries: at least 30 seconds
        if (now - this.lastSignalTime > 30000) {
          await this.handleSignal(signal, currentPrice, existingPos);
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
        // Trend Following: EMA 9/21 cross + ADX > 20
        if (ema.goldenCross && adx.adx > 20 && price > ema.ema50) {
          action = 'LONG';
          confidence = 85;
          rationale = `Golden Cross (EMA9 > EMA21) confirmed with ADX ${adx.adx} (Trending) & Price above EMA50`;
        } else if (ema.deathCross && adx.adx > 20 && price < ema.ema50) {
          action = 'SHORT';
          confidence = 85;
          rationale = `Death Cross (EMA9 < EMA21) confirmed with ADX ${adx.adx} & Price below EMA50`;
        } else if (ema.bullishAlignment && adx.isStrongTrend && rsi < 65) {
          action = 'LONG';
          confidence = 72;
          rationale = `Bullish EMA alignment (9 > 21 > 50) with Strong ADX trend strength`;
        } else if (ema.bearishAlignment && adx.isStrongTrend && rsi > 35) {
          action = 'SHORT';
          confidence = 72;
          rationale = `Bearish EMA alignment (9 < 21 < 50) with Strong ADX downward momentum`;
        }
        break;
      }

      case 'breakout_trading': {
        // Breakout Trading: Bollinger Bands Squeeze + Volume Surge
        const brokeUpper = price > bollinger.upper;
        const brokeLower = price < bollinger.lower;

        if (brokeUpper && volume.surgeRatio >= 1.3) {
          action = 'LONG';
          confidence = 88;
          rationale = `Bollinger Upper Breakout ($${bollinger.upper}) with ${volume.surgeRatio}x Volume Surge`;
        } else if (brokeLower && volume.surgeRatio >= 1.3) {
          action = 'SHORT';
          confidence = 88;
          rationale = `Bollinger Lower Breakdown ($${bollinger.lower}) with ${volume.surgeRatio}x Volume Surge`;
        }
        break;
      }

      case 'mean_reversion': {
        // Mean Reversion: Extreme RSI + Bollinger Band touch
        if (rsi < 30 && price <= bollinger.lower) {
          action = 'LONG';
          confidence = 80;
          rationale = `Oversold Mean Reversion: RSI is ${rsi} (<30) and price at Lower Bollinger ($${bollinger.lower})`;
        } else if (rsi > 70 && price >= bollinger.upper) {
          action = 'SHORT';
          confidence = 80;
          rationale = `Overbought Mean Reversion: RSI is ${rsi} (>70) and price at Upper Bollinger ($${bollinger.upper})`;
        }
        break;
      }

      case 'momentum_scalper': {
        // Fast Scalping: MACD cross + RSI momentum threshold
        if (macd.crossover === 'BULLISH' && rsi > 52 && rsi < 70) {
          action = 'LONG';
          confidence = 82;
          rationale = `MACD Bullish Crossover with RSI momentum at ${rsi}`;
        } else if (macd.crossover === 'BEARISH' && rsi < 48 && rsi > 30) {
          action = 'SHORT';
          confidence = 82;
          rationale = `MACD Bearish Crossover with RSI downward momentum at ${rsi}`;
        }
        break;
      }

      case 'swing_trader': {
        // Swing Trading: SuperTrend + EMA 50/200 Trend
        if (supertrend.direction === 'BULLISH' && price > ema.ema50 && rsi > 45 && rsi < 65) {
          action = 'LONG';
          confidence = 78;
          rationale = `SuperTrend Bullish with price respecting 50-period moving average`;
        } else if (supertrend.direction === 'BEARISH' && price < ema.ema50 && rsi < 55 && rsi > 35) {
          action = 'SHORT';
          confidence = 78;
          rationale = `SuperTrend Bearish with price below 50-period moving average`;
        }
        break;
      }

      case 'grid_dca': {
        // Grid / DCA: Buy dips in bullish / sideways, sell peaks
        if (rsi < 42 && price <= ema.ema21) {
          action = 'LONG';
          confidence = 70;
          rationale = `Grid DCA Buy Level reached: Price at EMA21 pullback with RSI ${rsi}`;
        } else if (rsi > 58 && price >= ema.ema21) {
          action = 'SHORT';
          confidence = 70;
          rationale = `Grid DCA Sell Level reached: Price expanded above EMA21 with RSI ${rsi}`;
        }
        break;
      }

      case 'arbitrage_scanner': {
        // Arbitrage / Divergence Signal
        const priceDev = ((price - ema.ema50) / ema.ema50) * 100;
        if (priceDev < -2.5) {
          action = 'LONG';
          confidence = 75;
          rationale = `Statistical Arbitrage Divergence: Price deviated ${priceDev.toFixed(2)}% from fair mean`;
        } else if (priceDev > 2.5) {
          action = 'SHORT';
          confidence = 75;
          rationale = `Statistical Arbitrage Divergence: Price expanded +${priceDev.toFixed(2)}% above fair mean`;
        }
        break;
      }

      case 'ai_sentiment_ml':
      default: {
        // AI Confluence Scoring Engine (-100 to +100)
        let score = 0;
        if (ema.goldenCross) score += 30;
        if (ema.deathCross) score -= 30;
        if (ema.bullishAlignment) score += 20;
        if (ema.bearishAlignment) score -= 20;

        if (rsi > 50 && rsi < 65) score += 15;
        if (rsi < 50 && rsi > 35) score -= 15;
        if (rsi >= 70) score -= 25; // overbought penalty
        if (rsi <= 30) score += 25; // oversold bounce bonus

        if (macd.histogram > 0) score += 15;
        if (macd.histogram < 0) score -= 15;
        if (macd.crossover === 'BULLISH') score += 20;
        if (macd.crossover === 'BEARISH') score -= 20;

        if (supertrend.direction === 'BULLISH') score += 15;
        if (supertrend.direction === 'BEARISH') score -= 15;

        if (score >= 45) {
          action = 'LONG';
          confidence = Math.min(95, 50 + Math.abs(score) / 2);
          rationale = `AI Confluence Model generated +${score} Bullish Score with multi-indicator alignment`;
        } else if (score <= -45) {
          action = 'SHORT';
          confidence = Math.min(95, 50 + Math.abs(score) / 2);
          rationale = `AI Confluence Model generated ${score} Bearish Score with multi-indicator alignment`;
        }
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
  async handleSignal(signal, currentPrice, existingPos) {
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

    if (isLive) {
      const liveBal = await binanceService.getLiveBalance();
      if (!liveBal || liveBal.availableBalance < this.allocationUsdt) {
        this.addLog(`⚠️ Auto-Bot paused: Insufficient Binance USDT margin ($${liveBal?.availableBalance || 0} available).`, 'WARN');
        return;
      }
    }

    // If opposite position exists, close it first (flip trade)
    if (existingPos && existingPos.side !== signal.action) {
      this.addLog(`🔄 Reversing position from ${existingPos.side} to ${signal.action} based on new signal`);
      if (isLive) {
        await binanceService.closeLivePosition({
          symbol: existingPos.symbol,
          side: existingPos.side,
          size: existingPos.size
        });
      }
      paperTrading.closePosition(existingPos.id, currentPrice, 'AUTO_STRATEGY_REVERSE');
    }

    // Calculate TP / SL price levels
    let tpPrice = null;
    let slPrice = null;
    if (signal.action === 'LONG') {
      tpPrice = currentPrice * (1 + (this.takeProfitPct / 100 / this.leverage));
      slPrice = currentPrice * (1 - (this.stopLossPct / 100 / this.leverage));
    } else if (signal.action === 'SHORT') {
      tpPrice = currentPrice * (1 - (this.takeProfitPct / 100 / this.leverage));
      slPrice = currentPrice * (1 + (this.stopLossPct / 100 / this.leverage));
    }

    try {
      let liveOrder = null;
      if (isLive) {
        liveOrder = await binanceService.executeLiveOrder({
          symbol: this.symbol,
          side: signal.action,
          amountUsdt: this.allocationUsdt,
          leverage: this.leverage
        });
      }

      const pos = paperTrading.openPosition({
        symbol: this.symbol,
        side: signal.action,
        amountUsdt: this.allocationUsdt,
        leverage: this.leverage,
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
      this.addLog(`⚡ Auto-Trade Executed: ${signal.action} on ${this.symbol} @ $${currentPrice.toFixed(2)} | Lev: ${this.leverage}x | ${signal.rationale}${isLive ? ' [LIVE BINANCE]' : ''}`, 'ORDER', pos);

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
