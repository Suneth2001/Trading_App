import { CONFIG } from '../config.js';
import { IndicatorService } from './indicatorService.js';
import { paperTrading } from './paperTradingService.js';
import { binanceService } from './binanceService.js';

export class StrategyEngine {
  constructor(io, marginGuardian = null) {
    this.io = io;
    this.marginGuardian = marginGuardian;
    this.isRunning = false;
    this.activeStrategyId = 'trend_following';
    this.symbol = 'AUTO_BEST'; // 'AUTO_BEST' or any symbol like 'BTCUSDT', 'DOGEUSDT'
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
    this.lastHeartbeatTime = 0;
    this.lastErrorLogTime = 0;
    this.lastSwitchLogKey = '';
    this.isEvaluating = false;
    this.lastScanSummary = null;
    this.candleHistory = [];
    this.onTradeCallback = null;
  }

  setMarginGuardian(guardian) {
    this.marginGuardian = guardian;
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
      lastScanSummary: this.lastScanSummary,
      recentLogs: this.logs.slice(0, 50)
    };
  }

  updateConfig(config) {
    if (config.activeStrategyId) this.activeStrategyId = config.activeStrategyId;
    if (config.symbol) this.symbol = config.symbol;
    if (config.direction) this.direction = config.direction;
    if (config.allocationUsdt !== undefined && config.allocationUsdt !== null && Number(config.allocationUsdt) > 0) {
      this.allocationUsdt = Number(config.allocationUsdt);
    }
    if (config.leverage !== undefined && config.leverage !== null && Number(config.leverage) >= 1) {
      this.leverage = Number(config.leverage);
    }
    if (config.stopLossPct !== undefined && Number(config.stopLossPct) > 0) {
      this.stopLossPct = Number(config.stopLossPct);
    }
    if (config.takeProfitPct !== undefined && Number(config.takeProfitPct) > 0) {
      this.takeProfitPct = Number(config.takeProfitPct);
    }
    if (config.trailingStopPct !== undefined && Number(config.trailingStopPct) >= 0) {
      this.trailingStopPct = Number(config.trailingStopPct);
    }
    if (config.timeframe) this.timeframe = config.timeframe;

    this.lastSwitchLogKey = '';
    this.addLog(
      `⚙️ Bot config updated: Strategy=${this.activeStrategyId}, Pair=${this.symbol}, Direction=${this.direction}, Margin=$${this.allocationUsdt}, Lev=${this.leverage}x`
    );
    return this.getStatus();
  }

  start() {
    if (this.isRunning) return this.getStatus();
    this.isRunning = true;
    this.lastSignalTime = 0;
    this.lastHeartbeatTime = 0;
    this.lastErrorLogTime = 0;
    const isLive = Boolean(paperTrading.isLive && binanceService.liveExchange);
    this.addLog(
      `🚀 Auto-Trading Bot STARTED [${isLive ? 'LIVE BINANCE' : 'DEMO'}] | Strategy: ${this.activeStrategyId} | Pair: ${this.symbol} | Direction: ${this.direction}`,
      'SUCCESS'
    );

    if (this.io) {
      this.io.emit('bot_status', this.getStatus());
    }

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
    this.addLog(`🛑 Auto-Trading Bot STOPPED by user`, 'INFO');
    if (this.io) {
      this.io.emit('bot_status', this.getStatus());
    }
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
   * Compute safe margin + leverage for Live Binance mode (including small wallets like $1.45 USDT)
   */
  resolveLiveSizing(avail, requestedAllocation, requestedLeverage) {
    const safeAvail = Number(avail || 0);
    if (safeAvail < 0.32) {
      return {
        ok: false,
        reason: `Insufficient Binance USDT available margin ($${safeAvail.toFixed(2)} available; need >= $0.35 at 20x for Binance $5 min notional)`
      };
    }

    // Reserve ~15% buffer for fees/maintenance margin so Binance does not reject with -2019
    const maxSafeMargin = Number((safeAvail * 0.85).toFixed(2));
    let effectiveAllocation = Math.min(Number(requestedAllocation || 10), maxSafeMargin);
    effectiveAllocation = Math.max(0.28, Number(effectiveAllocation.toFixed(2)));
    if (effectiveAllocation > safeAvail * 0.92) {
      effectiveAllocation = Number((safeAvail * 0.85).toFixed(2));
    }

    let effectiveLeverage = Math.max(1, Math.min(50, Number(requestedLeverage || 10)));

    // Unconditionally verify notional meets Binance Futures $5.50+ minimum
    if (effectiveAllocation * effectiveLeverage < 5.6) {
      effectiveLeverage = Math.min(20, Math.max(effectiveLeverage, Math.ceil(6.0 / Math.max(0.28, effectiveAllocation))));
    }
    if (effectiveAllocation * effectiveLeverage < 5.5 && maxSafeMargin * 20 >= 5.5) {
      effectiveAllocation = Number(Math.min(maxSafeMargin, 0.32).toFixed(2));
      effectiveLeverage = 20;
    }

    const notional = Number((effectiveAllocation * effectiveLeverage).toFixed(2));
    if (notional < 5.5) {
      return {
        ok: false,
        reason: `Available Binance margin ($${safeAvail.toFixed(2)}) cannot reach Binance $5.50 minimum notional at ${effectiveLeverage}x`
      };
    }

    return { ok: true, effectiveAllocation, effectiveLeverage, notional };
  }

  _canAffordPair(pair, notional) {
    const price = binanceService.getPrice(pair.symbol) || 0;
    if (!price) return false;
    const minNotional = pair.minNotional || 5.5;
    const minCoinCost = (pair.minQty || 0.001) * price;
    return notional >= Math.max(minNotional, minCoinCost) * 0.98;
  }

  /**
   * Run strategy cycle
   */
  async evaluateCycle() {
    if (!this.isRunning || this.isEvaluating) return;
    this.isEvaluating = true;

    try {
      const isLive = Boolean(paperTrading.isLive && binanceService.liveExchange);
      const now = Date.now();

      let currentPositions = [];
      let liveAvail = 0;
      let sizing = {
        ok: true,
        effectiveAllocation: this.allocationUsdt,
        effectiveLeverage: this.leverage || 10,
        notional: (this.allocationUsdt || 500) * (this.leverage || 10)
      };

      if (isLive) {
        const liveBal = await binanceService.getLiveBalance();
        liveAvail = liveBal?.availableBalance || 0;
        currentPositions = await binanceService.getLivePositions();
        sizing = this.resolveLiveSizing(liveAvail, this.allocationUsdt, this.leverage);
      } else {
        currentPositions = paperTrading.positions;
        const demoAvail = paperTrading.balance;
        if (demoAvail < 1) {
          if (now - this.lastErrorLogTime > 25000) {
            this.lastErrorLogTime = now;
            this.addLog(`⚠️ Demo balance exhausted ($${demoAvail.toFixed(2)}). Reset demo wallet in Settings to continue.`, 'ERROR');
          }
          return;
        }
        sizing.effectiveAllocation = Math.min(this.allocationUsdt, demoAvail * 0.9);
        sizing.notional = sizing.effectiveAllocation * sizing.effectiveLeverage;
      }

      // Build candidate pairs
      const configuredSymbol = this.symbol || 'AUTO_BEST';
      let candidatePairs = [];

      if (configuredSymbol === 'AUTO_BEST') {
        // Prioritize affordable pairs without open positions, then all affordable pairs
        const affordable = CONFIG.DEFAULT_PAIRS.filter(p => !isLive || this._canAffordPair(p, sizing.ok ? sizing.notional : 6));
        const idlePairs = affordable.filter(p => !currentPositions.some(pos => pos.symbol === p.symbol));
        candidatePairs = idlePairs.length > 0 ? idlePairs : affordable;
      } else {
        const requestedPair = CONFIG.DEFAULT_PAIRS.find(p => p.symbol === configuredSymbol) || {
          symbol: configuredSymbol,
          minQty: 0.01,
          minNotional: 5.5
        };

        if (isLive && sizing.ok && !this._canAffordPair(requestedPair, sizing.notional)) {
          const affordable = CONFIG.DEFAULT_PAIRS.filter(p => this._canAffordPair(p, sizing.notional));
          const idlePairs = affordable.filter(p => !currentPositions.some(pos => pos.symbol === p.symbol));
          candidatePairs = idlePairs.length > 0 ? idlePairs : affordable;

          const switchKey = `${configuredSymbol}->${candidatePairs[0]?.symbol || 'NONE'}`;
          if (candidatePairs.length > 0 && this.lastSwitchLogKey !== switchKey) {
            this.lastSwitchLogKey = switchKey;
            this.addLog(
              `💡 ${configuredSymbol} needs higher min notional than $${sizing.notional.toFixed(2)} — auto-routing Live Bot to affordable pairs (${candidatePairs.slice(0, 4).map(p => p.symbol).join(', ')}).`,
              'INFO'
            );
          }
        } else {
          candidatePairs = [requestedPair];
        }
      }

      if (candidatePairs.length === 0) {
        if (now - this.lastErrorLogTime > 25000) {
          this.lastErrorLogTime = now;
          this.addLog(sizing.reason || '⚠️ No eligible trading pairs available for current balance.', 'ERROR');
        }
        return;
      }

      // Evaluate candidates and pick best signal
      let bestEval = null;
      const evalLimit = configuredSymbol === 'AUTO_BEST' ? 6 : Math.min(candidatePairs.length, 4);

      for (const pair of candidatePairs.slice(0, evalLimit)) {
        const candles = await binanceService.fetchKlines(pair.symbol, this.timeframe, 60);
        if (!candles || candles.length < 30) continue;

        const indicators = IndicatorService.calculateAll(candles);
        if (!indicators) continue;

        const currentPrice = binanceService.getPrice(pair.symbol) || indicators.price;
        const signal = this.calculateSignal(this.activeStrategyId, indicators, candles);
        const existingPos = currentPositions.find(p => p.symbol === pair.symbol);

        // Direction filter check
        const directionAllowed =
          signal.action === 'HOLD' ||
          (signal.action === 'LONG' && this.direction !== 'SHORT_ONLY') ||
          (signal.action === 'SHORT' && this.direction !== 'LONG_ONLY');

        const actionable = directionAllowed && signal.action !== 'HOLD' && (!existingPos || existingPos.side !== signal.action);

        const candidate = {
          symbol: pair.symbol,
          indicators,
          signal,
          currentPrice,
          existingPos,
          actionable
        };

        if (!bestEval) {
          bestEval = candidate;
        } else if (candidate.actionable && !bestEval.actionable) {
          bestEval = candidate;
        } else if (candidate.actionable === bestEval.actionable && candidate.signal.confidence > bestEval.signal.confidence) {
          bestEval = candidate;
        }
      }

      if (!bestEval) return;

      const { symbol: targetSymbol, indicators, signal, currentPrice, existingPos } = bestEval;

      this.lastScanSummary = {
        symbol: targetSymbol,
        strategyId: this.activeStrategyId,
        mode: isLive ? 'LIVE' : 'DEMO',
        signal: signal.action,
        confidence: signal.confidence,
        price: currentPrice,
        rsi: indicators.rsi,
        supertrend: indicators.supertrend?.direction,
        holdingSide: existingPos?.side || null,
        effectiveMargin: Number(sizing.effectiveAllocation?.toFixed?.(2) || this.allocationUsdt),
        effectiveLeverage: sizing.effectiveLeverage || this.leverage,
        updatedAt: new Date().toISOString()
      };

      if (this.io) {
        this.io.emit('indicators_update', {
          symbol: targetSymbol,
          indicators,
          signal
        });
        this.io.emit('bot_status', this.getStatus());
      }

      // Check execution eligibility
      if (isLive && !sizing.ok) {
        if (now - this.lastErrorLogTime > 25000) {
          this.lastErrorLogTime = now;
          this.addLog(`⚠️ Auto-Bot standby: ${sizing.reason}`, 'ERROR');
        }
        return;
      }

      const isFiltered =
        (signal.action === 'LONG' && this.direction === 'SHORT_ONLY') ||
        (signal.action === 'SHORT' && this.direction === 'LONG_ONLY');

      if (signal.action !== 'HOLD' && !isFiltered && (!existingPos || existingPos.side !== signal.action)) {
        if (now - this.lastSignalTime > 20000) {
          await this.handleSignal(signal, currentPrice, existingPos, targetSymbol, sizing);
          return;
        }
      }

      // Periodic heartbeat log so user sees active 24/7 monitoring in the event stream
      if (now - this.lastHeartbeatTime > 25000) {
        this.lastHeartbeatTime = now;
        const modeTag = isLive ? 'LIVE' : 'DEMO';
        if (existingPos && (!signal.action || existingPos.side === signal.action || isFiltered)) {
          this.addLog(
            `📡 [${modeTag}] Monitoring open ${existingPos.side} ${targetSymbol} (${existingPos.roePct >= 0 ? '+' : ''}${existingPos.roePct || 0}% ROE) | Price $${currentPrice} | Signal: ${signal.action} (${signal.confidence}%)`,
            'INFO'
          );
        } else if (isFiltered) {
          this.addLog(
            `🔍 [${modeTag}] ${targetSymbol} signal is ${signal.action}, filtered by ${this.direction} setting (Price $${currentPrice}, RSI ${indicators.rsi})`,
            'INFO'
          );
        } else {
          this.addLog(
            `🔍 [${modeTag}] Scanning ${targetSymbol} (${this.activeStrategyId}): ${signal.action} (${signal.confidence}%) | Price $${currentPrice} | RSI ${indicators.rsi}`,
            signal.action === 'HOLD' ? 'INFO' : 'SIGNAL'
          );
        }
      }
    } catch (err) {
      console.error('[StrategyEngine] Cycle error:', err.message);
      if (Date.now() - this.lastErrorLogTime > 20000) {
        this.lastErrorLogTime = Date.now();
        this.addLog(`❌ Bot cycle error: ${err.message}`, 'ERROR');
      }
    } finally {
      this.isEvaluating = false;
    }
  }

  /**
   * Calculate strategy signal based on indicators
   */
  calculateSignal(strategyId, ind, candles) {
    const { price, rsi, macd, bollinger, ema, adx, volume, supertrend, divergence, traps, candlePatterns } = ind;

    let action = 'HOLD'; // 'LONG' | 'SHORT' | 'HOLD'
    let confidence = 50;
    let rationale = '';

    switch (strategyId) {
      case 'trend_following': {
        if ((ema.goldenCross || ema.bullishAlignment || supertrend.direction === 'BULLISH') && price >= ema.ema21 && rsi < 74) {
          action = 'LONG';
          confidence = 85;
          rationale = `Trend Following Bullish: EMA9 ($${ema.ema9}) >= EMA21 ($${ema.ema21}) | SuperTrend BULL | ADX ${adx.adx}`;
        } else if ((ema.deathCross || ema.bearishAlignment || supertrend.direction === 'BEARISH') && price <= ema.ema21 && rsi > 26) {
          action = 'SHORT';
          confidence = 85;
          rationale = `Trend Following Bearish: EMA9 ($${ema.ema9}) <= EMA21 ($${ema.ema21}) | SuperTrend BEAR | ADX ${adx.adx}`;
        } else if (supertrend.direction === 'BULLISH' && macd.histogram >= 0 && rsi < 68) {
          action = 'LONG';
          confidence = 78;
          rationale = `Trend Continuation LONG: SuperTrend BULL & MACD Hist +${macd.histogram}`;
        } else if (supertrend.direction === 'BEARISH' && macd.histogram < 0 && rsi > 32) {
          action = 'SHORT';
          confidence = 78;
          rationale = `Trend Continuation SHORT: SuperTrend BEAR & MACD Hist ${macd.histogram}`;
        }
        break;
      }

      case 'breakout_trading': {
        if (price >= bollinger.middle && (macd.histogram >= 0 || volume.surgeRatio >= 1.05)) {
          action = 'LONG';
          confidence = 84;
          rationale = `Bollinger Upper Expansion ($${price} > Mid $${bollinger.middle}) with ${volume.surgeRatio}x Vol`;
        } else if (price < bollinger.middle && (macd.histogram < 0 || volume.surgeRatio >= 1.05)) {
          action = 'SHORT';
          confidence = 84;
          rationale = `Bollinger Lower Breakdown ($${price} < Mid $${bollinger.middle}) with ${volume.surgeRatio}x Vol`;
        }
        break;
      }

      case 'mean_reversion': {
        if (rsi <= 48 || price <= bollinger.lower * 1.003) {
          action = 'LONG';
          confidence = 80;
          rationale = `Mean Reversion Long Bounce: RSI ${rsi} near BB Lower ($${bollinger.lower})`;
        } else if (rsi >= 52 || price >= bollinger.upper * 0.997) {
          action = 'SHORT';
          confidence = 80;
          rationale = `Mean Reversion Short Pullback: RSI ${rsi} near BB Upper ($${bollinger.upper})`;
        }
        break;
      }

      case 'momentum_scalper': {
        if (macd.histogram >= 0 || rsi >= 52) {
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
          rationale = `Grid DCA Dip Buy Level: Price $${price} <= EMA21 ($${ema.ema21}), RSI ${rsi}`;
        } else {
          action = 'SHORT';
          confidence = 76;
          rationale = `Grid DCA Peak Sell Level: Price $${price} > EMA21 ($${ema.ema21}), RSI ${rsi}`;
        }
        break;
      }

      case 'arbitrage_scanner': {
        const priceDev = ema.ema21 > 0 ? ((price - ema.ema21) / ema.ema21) * 100 : 0;
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
        // Multi-factor AI Confluence & Trap Shield model
        let score = 0;
        if (supertrend.direction === 'BULLISH') score += 25; else score -= 25;
        if (ema.goldenCross) score += 25; else if (ema.deathCross) score -= 25;
        else if (ema.bullishAlignment) score += 15; else if (ema.bearishAlignment) score -= 15;
        else if (price >= ema.ema21) score += 10; else score -= 10;

        if (macd.crossover === 'BULLISH') score += 18;
        else if (macd.crossover === 'BEARISH') score -= 18;
        else score += macd.histogram >= 0 ? 12 : -12;

        if (rsi < 35) score += 15;
        else if (rsi > 70) score -= 15;
        else if (rsi >= 50) score += 8;
        else score -= 8;

        if (divergence?.detected) {
          score += divergence.type.startsWith('BULLISH') ? 20 : -20;
        }
        if (volume?.isHighVolume) {
          score += score >= 0 ? 10 : -10;
        }
        if (candlePatterns?.length > 0) {
          for (const cp of candlePatterns) {
            score += cp.type === 'BULLISH' ? 10 : -10;
          }
        }
        if (traps?.isBullTrap) score -= 25;
        if (traps?.isBearTrap) score += 25;
        if (traps?.isFallingKnife) score = Math.min(-25, score - 20);

        if (score >= 15 && !traps?.isFallingKnife && !traps?.isBullTrap) {
          action = 'LONG';
          confidence = Math.min(95, Math.round(62 + Math.abs(score) * 0.35));
          rationale = `AI Confluence +${score} Bullish (SuperTrend: ${supertrend.direction}, RSI: ${rsi}, MACD: ${macd.histogram})`;
        } else if (score <= -15 && !traps?.isBearTrap) {
          action = 'SHORT';
          confidence = Math.min(95, Math.round(62 + Math.abs(score) * 0.35));
          rationale = `AI Confluence ${score} Bearish (SuperTrend: ${supertrend.direction}, RSI: ${rsi}, MACD: ${macd.histogram})`;
        } else {
          action = 'HOLD';
          confidence = 55;
          rationale = `AI Confluence neutral (score ${score}, RSI ${rsi})${traps?.alert ? ' - Trap shield active' : ''}`;
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
  async handleSignal(signal, currentPrice, existingPos, targetSymbol = null, precomputedSizing = null) {
    const tradeSymbol = targetSymbol || this.symbol || 'DOGEUSDT';
    if (signal.action === 'LONG' && this.direction === 'SHORT_ONLY') return;
    if (signal.action === 'SHORT' && this.direction === 'LONG_ONLY') return;
    if (existingPos && existingPos.side === signal.action) return;

    const isLive = Boolean(paperTrading.isLive && binanceService.liveExchange);
    let effectiveAllocation = precomputedSizing?.effectiveAllocation ?? this.allocationUsdt;
    let effectiveLeverage = precomputedSizing?.effectiveLeverage ?? (this.leverage || 10);

    if (isLive && !precomputedSizing) {
      const liveBal = await binanceService.getLiveBalance();
      const sizing = this.resolveLiveSizing(liveBal?.availableBalance || 0, this.allocationUsdt, this.leverage);
      if (!sizing.ok) {
        this.addLog(`⚠️ Auto-Bot paused: ${sizing.reason}`, 'ERROR');
        return;
      }
      effectiveAllocation = sizing.effectiveAllocation;
      effectiveLeverage = sizing.effectiveLeverage;
    }

    // If opposite position exists, close it first (flip trade)
    if (existingPos && existingPos.side !== signal.action) {
      this.addLog(`🔄 Reversing position from ${existingPos.side} to ${signal.action} on ${tradeSymbol}`, 'SIGNAL');
      if (isLive) {
        await binanceService.closeLivePosition({
          symbol: existingPos.symbol,
          side: existingPos.side,
          size: existingPos.size
        });
      } else {
        try {
          paperTrading.closePosition(existingPos.id, currentPrice, 'AUTO_STRATEGY_REVERSE');
        } catch {}
      }
    }

    // Calculate TP / SL price levels
    let tpPrice = null;
    let slPrice = null;
    if (signal.action === 'LONG') {
      tpPrice = Number((currentPrice * (1 + (this.takeProfitPct / 100 / effectiveLeverage))).toFixed(6));
      slPrice = Number((currentPrice * (1 - (this.stopLossPct / 100 / effectiveLeverage))).toFixed(6));
    } else if (signal.action === 'SHORT') {
      tpPrice = Number((currentPrice * (1 - (this.takeProfitPct / 100 / effectiveLeverage))).toFixed(6));
      slPrice = Number((currentPrice * (1 + (this.stopLossPct / 100 / effectiveLeverage))).toFixed(6));
    }

    try {
      let pos = null;

      if (isLive) {
        const liveOrder = await binanceService.executeLiveOrder({
          symbol: tradeSymbol,
          side: signal.action,
          amountUsdt: effectiveAllocation,
          leverage: effectiveLeverage
        });

        const cleanSym = tradeSymbol.replace('/', '').toUpperCase();
        const posId = `BINANCE-${cleanSym}-${signal.action}`;
        pos = {
          id: posId,
          symbol: cleanSym,
          side: signal.action,
          entryPrice: currentPrice,
          currentPrice,
          leverage: effectiveLeverage,
          margin: effectiveAllocation,
          tp: tpPrice,
          sl: slPrice,
          trailingStopPct: this.trailingStopPct,
          source: 'BINANCE_LIVE_BOT',
          binanceOrderId: liveOrder?.id || null,
          openedAt: new Date().toISOString()
        };

        if (this.marginGuardian) {
          this.marginGuardian.setTarget(posId, { tp: tpPrice, sl: slPrice, trailingStopPct: this.trailingStopPct });
          this.marginGuardian.setTarget(cleanSym, { tp: tpPrice, sl: slPrice, trailingStopPct: this.trailingStopPct });
        }
      } else {
        pos = paperTrading.openPosition({
          symbol: tradeSymbol,
          side: signal.action,
          amountUsdt: effectiveAllocation,
          leverage: effectiveLeverage,
          markPrice: currentPrice,
          tp: tpPrice,
          sl: slPrice,
          trailingStopPct: this.trailingStopPct,
          source: 'AUTO_BOT'
        });

        if (this.marginGuardian) {
          this.marginGuardian.setTarget(pos.id, { tp: tpPrice, sl: slPrice, trailingStopPct: this.trailingStopPct });
          this.marginGuardian.setTarget(tradeSymbol, { tp: tpPrice, sl: slPrice, trailingStopPct: this.trailingStopPct });
        }
      }

      this.lastSignalTime = Date.now();
      this.addLog(
        `⚡ Auto-Trade Executed: ${signal.action} on ${tradeSymbol} @ $${currentPrice} | Margin: $${effectiveAllocation} (${effectiveLeverage}x) | ${signal.rationale}${isLive ? ' [LIVE BINANCE]' : ' [DEMO]'}`,
        'ORDER',
        pos
      );

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
        this.io.emit('bot_status', this.getStatus());
      }

      if (this.onTradeCallback) {
        try { await this.onTradeCallback(); } catch {}
      }
    } catch (err) {
      this.addLog(`❌ Failed to execute ${signal.action} on ${tradeSymbol}: ${err.message}`, 'ERROR');
    }
  }
}
