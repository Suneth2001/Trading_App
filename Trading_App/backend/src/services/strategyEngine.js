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
    this.symbol = 'AUTO_BEST';
    this.direction = 'BOTH'; // 'BOTH' | 'LONG_ONLY' | 'SHORT_ONLY'
    this.allocationUsdt = 500;
    this.leverage = 10;
    this.stopLossPct = 4.5;
    this.takeProfitPct = 10.0;
    this.trailingStopPct = 1.5;
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
      `🚀 Auto-Trading Bot STARTED [${isLive ? 'LIVE BINANCE' : 'DEMO'}] | Strategy: ${this.activeStrategyId} | Pair: ${this.symbol} | 3-TF & Profit-Lock Armed`,
      'SUCCESS'
    );

    if (this.io) {
      this.io.emit('bot_status', this.getStatus());
    }

    this.evaluateCycle();
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
      type,
      data
    };
    this.logs.unshift(entry);
    if (this.logs.length > 200) this.logs.pop();

    if (this.io) {
      this.io.emit('bot_log', entry);
    }
  }

  resolveLiveSizing(avail, requestedAllocation, requestedLeverage) {
    const safeAvail = Number(avail || 0);
    if (safeAvail < 0.32) {
      return {
        ok: false,
        reason: `Insufficient Binance USDT available margin ($${safeAvail.toFixed(2)} available; need >= $0.35 at 20x for Binance $5 min notional)`
      };
    }

    const maxSafeMargin = Number((safeAvail * 0.85).toFixed(2));
    let effectiveAllocation = Math.min(Number(requestedAllocation || 10), maxSafeMargin);
    effectiveAllocation = Math.max(0.28, Number(effectiveAllocation.toFixed(2)));
    if (effectiveAllocation > safeAvail * 0.92) {
      effectiveAllocation = Number((safeAvail * 0.85).toFixed(2));
    }

    let effectiveLeverage = Math.max(1, Math.min(50, Number(requestedLeverage || 10)));

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
   * Run 3-TF strategy evaluation cycle
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
            this.addLog(`⚠️ Demo balance exhausted ($${demoAvail.toFixed(2)}). Reset demo wallet in Settings.`, 'ERROR');
          }
          return;
        }
        sizing.effectiveAllocation = Math.min(this.allocationUsdt, Number((demoAvail * 0.9).toFixed(2)));
        sizing.notional = sizing.effectiveAllocation * sizing.effectiveLeverage;
      }

      const configuredSymbol = this.symbol || 'AUTO_BEST';
      let candidatePairs = [];

      if (configuredSymbol === 'AUTO_BEST') {
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
              `💡 ${configuredSymbol} needs higher min notional than $${sizing.notional.toFixed(2)} — routing Live Bot to affordable pairs (${candidatePairs.slice(0, 4).map(p => p.symbol).join(', ')}).`,
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

      let bestEval = null;
      const evalLimit = configuredSymbol === 'AUTO_BEST' ? 6 : Math.min(candidatePairs.length, 4);

      for (const pair of candidatePairs.slice(0, evalLimit)) {
        const [candles, candles1h, candles5m] = await Promise.all([
          binanceService.fetchKlines(pair.symbol, this.timeframe, 65),
          binanceService.fetchKlines(pair.symbol, '1h', 60),
          binanceService.fetchKlines(pair.symbol, '5m', 45)
        ]);
        if (!candles || candles.length < 30) continue;

        const indicators = IndicatorService.calculateAll(candles);
        if (!indicators) continue;
        const ind1h = IndicatorService.calculateAll(candles1h);
        const ind5m = IndicatorService.calculateAll(candles5m);

        const currentPrice = binanceService.getPrice(pair.symbol) || indicators.price;
        const signal = this.calculateSignal(this.activeStrategyId, indicators, candles, ind1h, ind5m);
        const existingPos = currentPositions.find(p => p.symbol === pair.symbol);

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

        if (!bestEval) bestEval = candidate;
        else if (candidate.actionable && !bestEval.actionable) bestEval = candidate;
        else if (candidate.actionable === bestEval.actionable && candidate.signal.confidence > bestEval.signal.confidence) bestEval = candidate;
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
        adx: indicators.adx?.adx,
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
        if (now - this.lastSignalTime > 45000) {
          await this.handleSignal(signal, currentPrice, existingPos, targetSymbol, sizing);
          return;
        }
      }

      if (now - this.lastHeartbeatTime > 25000) {
        this.lastHeartbeatTime = now;
        const modeTag = isLive ? 'LIVE' : 'DEMO';
        if (existingPos) {
          this.addLog(
            `📡 [${modeTag}] Monitoring ${existingPos.side} ${targetSymbol} (${existingPos.roePct >= 0 ? '+' : ''}${existingPos.roePct || 0}% ROE) | Price $${currentPrice} | ${signal.rationale}`,
            'INFO'
          );
        } else if (isFiltered) {
          this.addLog(
            `🔍 [${modeTag}] ${targetSymbol} signal is ${signal.action}, filtered by ${this.direction} setting`,
            'INFO'
          );
        } else {
          this.addLog(
            `🔍 [${modeTag}] ${targetSymbol} (${this.activeStrategyId}): ${signal.action} (${signal.confidence}%) | ${signal.rationale}`,
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
   * High-discipline 3-TF strategy scoring (returns HOLD in choppy/overextended/counter-trend setups)
   */
  calculateSignal(strategyId, ind, candles, ind1h = null, ind5m = null) {
    const { price, rsi, macd, bollinger, ema, adx, volume, supertrend, divergence, traps, candlePatterns, vwap, atrDistFromEma21, stochRsi } = ind;

    let action = 'HOLD';
    let confidence = 50;
    let rationale = '';

    const isChoppy = adx.adx < 18;
    const htfBull = !ind1h || (ind1h.supertrend.direction === 'BULLISH' && ind1h.price >= ind1h.ema.ema21);
    const htfBear = !ind1h || (ind1h.supertrend.direction === 'BEARISH' && ind1h.price <= ind1h.ema.ema21);
    const ltfBullOk = !ind5m || (ind5m.ema.ema9 >= ind5m.ema.ema21 && ind5m.macd.histogram >= ind5m.macd.prevHistogram && ind5m.rsi <= 71);
    const ltfBearOk = !ind5m || (ind5m.ema.ema9 <= ind5m.ema.ema21 && ind5m.macd.histogram <= ind5m.macd.prevHistogram && ind5m.rsi >= 29);
    const aboveVwap = !vwap || vwap.priceAboveVwap;
    const belowVwap = !vwap || !vwap.priceAboveVwap;
    const overboughtBlock = rsi > 70 || atrDistFromEma21 > 1.8 || traps?.isBullTrap || traps?.isFallingKnife;
    const oversoldBlock = rsi < 30 || atrDistFromEma21 < -1.8 || traps?.isBearTrap;

    switch (strategyId) {
      case 'trend_following': {
        if (!isChoppy && htfBull && (ema.bullishAlignment || supertrend.direction === 'BULLISH') && price >= ema.ema21 && aboveVwap && ltfBullOk && !overboughtBlock) {
          action = 'LONG';
          confidence = 86;
          rationale = `3-TF Bull Trend: 1H+15M SuperTrend BULL | VWAP+ | ADX ${adx.adx} | RSI ${rsi}`;
        } else if (!isChoppy && htfBear && (ema.bearishAlignment || supertrend.direction === 'BEARISH') && price <= ema.ema21 && belowVwap && ltfBearOk && !oversoldBlock) {
          action = 'SHORT';
          confidence = 86;
          rationale = `3-TF Bear Trend: 1H+15M SuperTrend BEAR | Below VWAP | ADX ${adx.adx} | RSI ${rsi}`;
        } else {
          rationale = isChoppy ? `HOLD: Sideways chop (ADX ${adx.adx} < 18)` : `HOLD: Waiting for 1H+15M+5M trend & VWAP alignment (RSI ${rsi})`;
        }
        break;
      }

      case 'breakout_trading': {
        if (volume.surgeRatio >= 1.2 && price > bollinger.middle && macd.isExpandingBullish && htfBull && ltfBullOk && !overboughtBlock) {
          action = 'LONG';
          confidence = 85;
          rationale = `Confirmed Volume Breakout LONG (${volume.surgeRatio}x Vol, MACD expanding, 1H+5M aligned)`;
        } else if (volume.surgeRatio >= 1.2 && price < bollinger.middle && macd.histogram < 0 && htfBear && ltfBearOk && !oversoldBlock) {
          action = 'SHORT';
          confidence = 85;
          rationale = `Confirmed Volume Breakdown SHORT (${volume.surgeRatio}x Vol, 1H+5M aligned)`;
        } else {
          rationale = `HOLD: Waiting for >=1.2x volume squeeze expansion (Vol ${volume.surgeRatio}x)`;
        }
        break;
      }

      case 'mean_reversion': {
        if ((rsi <= 34 || price <= bollinger.lower * 1.002) && (stochRsi.isBullishCross || macd.isContractingBearish || ind5m?.candleStrength?.isBullishCandle) && !traps?.isFallingKnife) {
          action = 'LONG';
          confidence = 82;
          rationale = `Oversold Reversal Bounce: RSI ${rsi} + BB Lower bounce`;
        } else if ((rsi >= 66 || price >= bollinger.upper * 0.998) && (stochRsi.isBearishCross || ind5m?.candleStrength?.isBearishCandle)) {
          action = 'SHORT';
          confidence = 82;
          rationale = `Overbought Mean Rejection: RSI ${rsi} + BB Upper rejection`;
        } else {
          rationale = `HOLD: Price within fair value (RSI ${rsi}) — waiting for extreme reversal band`;
        }
        break;
      }

      case 'momentum_scalper': {
        if (!isChoppy && macd.histogram > 0 && macd.isExpandingBullish && rsi >= 48 && rsi <= 67 && aboveVwap && ltfBullOk && !overboughtBlock) {
          action = 'LONG';
          confidence = 84;
          rationale = `Turbo Momentum LONG: MACD expanding + VWAP + 5M trigger (RSI ${rsi})`;
        } else if (!isChoppy && macd.histogram < 0 && macd.histogram < macd.prevHistogram && rsi <= 52 && rsi >= 33 && belowVwap && ltfBearOk && !oversoldBlock) {
          action = 'SHORT';
          confidence = 84;
          rationale = `Turbo Momentum SHORT: MACD accelerating + Below VWAP + 5M trigger (RSI ${rsi})`;
        } else {
          rationale = `HOLD: Insufficient clean momentum (ADX ${adx.adx}, RSI ${rsi})`;
        }
        break;
      }

      case 'swing_trader': {
        if (!isChoppy && htfBull && supertrend.direction === 'BULLISH' && price >= ema.ema50 && !overboughtBlock) {
          action = 'LONG';
          confidence = 82;
          rationale = `Swing Wave LONG: 1H+15M SuperTrend BULL above EMA50 (ADX ${adx.adx})`;
        } else if (!isChoppy && htfBear && supertrend.direction === 'BEARISH' && price <= ema.ema50 && !oversoldBlock) {
          action = 'SHORT';
          confidence = 82;
          rationale = `Swing Wave SHORT: 1H+15M SuperTrend BEAR below EMA50 (ADX ${adx.adx})`;
        } else {
          rationale = `HOLD: Swing waiting for clear 1H+15M wave alignment`;
        }
        break;
      }

      case 'grid_dca': {
        if (atrDistFromEma21 <= -0.6 && rsi <= 45 && !traps?.isFallingKnife && (ind5m ? ind5m.candleStrength?.isBullishCandle : true)) {
          action = 'LONG';
          confidence = 78;
          rationale = `Grid Dip Entry: ${atrDistFromEma21} ATR dip below EMA21 with reversal candle (RSI ${rsi})`;
        } else if (atrDistFromEma21 >= 0.6 && rsi >= 55 && (ind5m ? ind5m.candleStrength?.isBearishCandle : true)) {
          action = 'SHORT';
          confidence = 78;
          rationale = `Grid Rally Entry: +${atrDistFromEma21} ATR above EMA21 with rejection candle (RSI ${rsi})`;
        } else {
          rationale = `HOLD: Grid waiting for >=0.6 ATR mean deviation (Curr ${atrDistFromEma21})`;
        }
        break;
      }

      case 'arbitrage_scanner': {
        const priceDev = vwap?.distFromVwapPct ?? (ema.ema21 > 0 ? ((price - ema.ema21) / ema.ema21) * 100 : 0);
        if (priceDev <= -0.45 && rsi < 48 && !traps?.isFallingKnife) {
          action = 'LONG';
          confidence = 79;
          rationale = `VWAP Discount Capture LONG (${priceDev.toFixed(2)}% below VWAP)`;
        } else if (priceDev >= 0.45 && rsi > 52) {
          action = 'SHORT';
          confidence = 79;
          rationale = `VWAP Premium Capture SHORT (+${priceDev.toFixed(2)}% above VWAP)`;
        } else {
          rationale = `HOLD: VWAP spread too tight (${priceDev.toFixed(2)}%)`;
        }
        break;
      }

      case 'ai_sentiment_ml':
      default: {
        let score = 0;
        if (supertrend.direction === 'BULLISH') score += 20; else score -= 20;
        if (ind1h) {
          if (ind1h.supertrend.direction === 'BULLISH' && ind1h.price >= ind1h.ema.ema21) score += 20;
          else if (ind1h.supertrend.direction === 'BEARISH' && ind1h.price <= ind1h.ema.ema21) score -= 20;
        }
        if (vwap) score += vwap.priceAboveVwap ? 12 : -12;
        if (ema.goldenCross) score += 18; else if (ema.deathCross) score -= 18;
        else if (ema.bullishAlignment) score += 12; else if (ema.bearishAlignment) score -= 12;

        if (macd.crossover === 'BULLISH') score += 15;
        else if (macd.crossover === 'BEARISH') score -= 15;
        else if (macd.isExpandingBullish) score += 10;
        else if (macd.histogram < 0 && macd.histogram < macd.prevHistogram) score -= 10;

        if (ind5m) {
          if (ltfBullOk) score += 12;
          else if (ltfBearOk) score -= 12;
        }

        if (rsi >= 42 && rsi <= 65) score += 8;
        else if (rsi >= 35 && rsi < 42) score -= 5;
        else if (rsi > 71) score -= 18; // Anti-chase
        else if (rsi < 29) score += 18; // Oversold bounce

        if (divergence?.detected) score += divergence.type.startsWith('BULLISH') ? 16 : -16;
        if (volume?.isHighVolume) score += score >= 0 ? 10 : -10;
        if (candlePatterns?.length > 0) {
          for (const cp of candlePatterns) score += cp.type === 'BULLISH' ? 8 : -8;
        }
        if (isChoppy) score = Math.round(score * 0.5);
        if (traps?.isBullTrap) score -= 25;
        if (traps?.isBearTrap) score += 25;
        if (traps?.isFallingKnife) score = Math.min(-30, score - 20);

        if (score >= 35 && !isChoppy && htfBull && ltfBullOk && !overboughtBlock) {
          action = 'LONG';
          confidence = Math.min(95, Math.round(68 + Math.abs(score) * 0.25));
          rationale = `AI 3-TF Confluence +${score} LONG (1H+15M+5M aligned, ADX ${adx.adx}, RSI ${rsi})`;
        } else if (score <= -35 && !isChoppy && htfBear && ltfBearOk && !oversoldBlock) {
          action = 'SHORT';
          confidence = Math.min(95, Math.round(68 + Math.abs(score) * 0.25));
          rationale = `AI 3-TF Confluence ${score} SHORT (1H+15M+5M aligned, ADX ${adx.adx}, RSI ${rsi})`;
        } else {
          action = 'HOLD';
          confidence = Math.min(68, Math.max(45, Math.round(50 + Math.abs(score) * 0.2)));
          if (isChoppy) rationale = `HOLD: Choppy market (ADX ${adx.adx} < 18)`;
          else if (overboughtBlock) rationale = `HOLD: Overextended top / Trap Shield (RSI ${rsi})`;
          else if (oversoldBlock) rationale = `HOLD: Overextended bottom / Trap Shield (RSI ${rsi})`;
          else rationale = `HOLD: Waiting for 3-TF alignment (Score ${score}, RSI ${rsi})`;
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
   * Handle executed trade signal (with anti-premature-loss-reversal protection)
   */
  async handleSignal(signal, currentPrice, existingPos, targetSymbol = null, precomputedSizing = null) {
    const tradeSymbol = targetSymbol || this.symbol || 'DOGEUSDT';
    if (signal.action === 'LONG' && this.direction === 'SHORT_ONLY') return;
    if (signal.action === 'SHORT' && this.direction === 'LONG_ONLY') return;
    if (existingPos && existingPos.side === signal.action) return;

    // Prevent premature flip-flopping into realized losses before position develops
    if (existingPos && existingPos.side !== signal.action) {
      const heldMs = existingPos.openedAt ? (Date.now() - new Date(existingPos.openedAt).getTime()) : 0;
      const currentRoe = Number(existingPos.roePct || 0);
      if (currentRoe < 2.0 && (heldMs < 90000 || signal.confidence < 82)) {
        return; // Let Margin Guardian / Profit-Lock manage active trade instead of cutting early at a loss
      }
    }

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

    if (existingPos && existingPos.side !== signal.action) {
      this.addLog(`🔄 High-Confidence Reversal (${existingPos.side} -> ${signal.action}) on ${tradeSymbol} at ${existingPos.roePct || 0}% ROE`, 'SIGNAL');
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

    // Leveraged TP / SL price levels (capped within disciplined 1:2+ R:R)
    const tpRoePct = Math.min(Math.max(this.takeProfitPct || 10.0, 6.0), 16.0);
    const slRoePct = Math.min(Math.max(this.stopLossPct || 4.5, 2.5), 7.5);
    let tpPrice = null;
    let slPrice = null;
    if (signal.action === 'LONG') {
      tpPrice = Number((currentPrice * (1 + (tpRoePct / 100 / effectiveLeverage))).toFixed(6));
      slPrice = Number((currentPrice * (1 - (slRoePct / 100 / effectiveLeverage))).toFixed(6));
    } else if (signal.action === 'SHORT') {
      tpPrice = Number((currentPrice * (1 - (tpRoePct / 100 / effectiveLeverage))).toFixed(6));
      slPrice = Number((currentPrice * (1 + (slRoePct / 100 / effectiveLeverage))).toFixed(6));
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
        `⚡ Auto-Trade Executed: ${signal.action} ${tradeSymbol} @ $${currentPrice} | TP +${tpRoePct}% / SL -${slRoePct}% (${effectiveLeverage}x) | ${signal.rationale}${isLive ? ' [LIVE BINANCE]' : ' [DEMO]'}`,
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
