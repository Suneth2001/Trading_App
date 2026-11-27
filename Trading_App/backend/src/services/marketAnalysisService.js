import { CONFIG } from '../config.js';
import { binanceService } from './binanceService.js';
import { IndicatorService } from './indicatorService.js';
import { paperTrading } from './paperTradingService.js';

export class MarketAnalysisService {
  constructor(io, marginGuardian = null) {
    this.io = io;
    this.marginGuardian = marginGuardian;
    this.analysisCache = [];
    this.btcMacroBias = { direction: 'NEUTRAL', isDumping: false, isPumping: false, changeScore: 0 };
    this.isAutoPilotRunning = false;
    this.autoPilotConfig = {
      minConfidence: 75,
      allocationUsdt: 300,
      maxOpenTrades: 3,
      leverage: 10,
      directionPreference: 'BOTH' // 'BOTH' | 'LONG_ONLY' | 'SHORT_ONLY'
    };
    this.scanInterval = null;
    this.lastAutoTradeTime = 0;
    this.isEvaluatingAutoPilot = false;
    this.lastAutoPilotErrorTime = 0;
    this.onTradeCallback = null;
  }

  setMarginGuardian(guardian) {
    this.marginGuardian = guardian;
  }

  getAutoPilotStatus() {
    return {
      isAutoPilotRunning: this.isAutoPilotRunning,
      config: this.autoPilotConfig
    };
  }

  updateAutoPilotConfig(cfg) {
    if (cfg.minConfidence !== undefined) this.autoPilotConfig.minConfidence = Number(cfg.minConfidence);
    if (cfg.allocationUsdt !== undefined) this.autoPilotConfig.allocationUsdt = Number(cfg.allocationUsdt);
    if (cfg.maxOpenTrades !== undefined) this.autoPilotConfig.maxOpenTrades = Number(cfg.maxOpenTrades);
    if (cfg.leverage !== undefined) this.autoPilotConfig.leverage = Number(cfg.leverage);
    if (cfg.directionPreference !== undefined) this.autoPilotConfig.directionPreference = cfg.directionPreference;
    return this.getAutoPilotStatus();
  }

  startAutoPilot() {
    this.isAutoPilotRunning = true;
    this.lastAutoTradeTime = 0;
    if (this.io) {
      this.io.emit('autopilot_status', this.getAutoPilotStatus());
    }
    if (this.analysisCache && this.analysisCache.length > 0) {
      this.evaluateAutoPilot(this.analysisCache).catch(() => {});
    } else {
      this.runFullScan().catch(() => {});
    }
    return this.getAutoPilotStatus();
  }

  stopAutoPilot() {
    this.isAutoPilotRunning = false;
    if (this.io) {
      this.io.emit('autopilot_status', this.getAutoPilotStatus());
    }
    return this.getAutoPilotStatus();
  }

  startScanner() {
    this.runFullScan();
    this.scanInterval = setInterval(() => {
      this.runFullScan();
    }, CONFIG.AUTO_MARKET_SCANNER?.SCAN_INTERVAL_MS || 5000);
  }

  /**
   * Compute BTC Macro Regime first so altcoin setups don't fight BTC dumps/pumps
   */
  updateBtcMacroBias(btcInd1h, btcInd15m) {
    if (!btcInd15m) return;
    const is1hBull = btcInd1h ? (btcInd1h.supertrend.direction === 'BULLISH' && btcInd1h.price >= btcInd1h.ema.ema21) : true;
    const is1hBear = btcInd1h ? (btcInd1h.supertrend.direction === 'BEARISH' && btcInd1h.price <= btcInd1h.ema.ema21) : false;
    const isDumping = (btcInd15m.roc5 < -1.1 && btcInd15m.supertrend.direction === 'BEARISH') || Boolean(btcInd15m.traps?.isFallingKnife);
    const isPumping = btcInd15m.roc5 > 1.1 && btcInd15m.supertrend.direction === 'BULLISH';

    let direction = 'NEUTRAL';
    if ((is1hBull && btcInd15m.supertrend.direction === 'BULLISH') || isPumping) direction = 'BULLISH';
    else if ((is1hBear && btcInd15m.supertrend.direction === 'BEARISH') || isDumping) direction = 'BEARISH';

    this.btcMacroBias = { direction, isDumping, isPumping };
  }

  /**
   * 3-Timeframe (1H + 15M + 5M) Institutional Confluence Engine + VWAP + ADX Chop Shield
   */
  async analyzeCoin(pair) {
    const symbol = pair.symbol;
    const currentPrice = binanceService.getPrice(symbol);
    const tickerStats = binanceService.getTickerStats()[symbol] || {};

    const [candles15m, candles1h, candles5m] = await Promise.all([
      binanceService.fetchKlines(symbol, '15m', 80),
      binanceService.fetchKlines(symbol, '1h', 60),
      binanceService.fetchKlines(symbol, '5m', 50)
    ]);

    const ind15m = IndicatorService.calculateAll(candles15m);
    const ind1h = IndicatorService.calculateAll(candles1h);
    const ind5m = IndicatorService.calculateAll(candles5m);

    if (!ind15m || !currentPrice) return null;

    if (symbol === 'BTCUSDT') {
      this.updateBtcMacroBias(ind1h, ind15m);
    }

    const {
      rsi,
      stochRsi,
      macd,
      bollinger,
      ema,
      adx,
      volume,
      supertrend,
      divergence,
      structure,
      candlePatterns,
      traps,
      vwap,
      atrDistFromEma21
    } = ind15m;

    const atr = ind15m.atr > 0 ? ind15m.atr : (currentPrice * 0.012);
    const isChoppy = adx.adx < 18;
    const priceAboveVwap = vwap ? vwap.priceAboveVwap : currentPrice >= ema.ema21;

    // 1. MULTI-TIMEFRAME 1H + 15M ALIGNMENT
    let htfTrend = 'NEUTRAL';
    let htfScoreBonus = 0;

    if (ind1h) {
      const is1hBull = ind1h.supertrend.direction === 'BULLISH' && ind1h.price >= ind1h.ema.ema21;
      const is1hBear = ind1h.supertrend.direction === 'BEARISH' && ind1h.price <= ind1h.ema.ema21;
      if (is1hBull) {
        htfTrend = 'BULLISH';
        htfScoreBonus = 10;
      } else if (is1hBear) {
        htfTrend = 'BEARISH';
        htfScoreBonus = -10;
      } else if (ind1h.price > ind1h.ema.ema50) {
        htfTrend = 'MILD_BULLISH';
        htfScoreBonus = 4;
      } else if (ind1h.price < ind1h.ema.ema50) {
        htfTrend = 'MILD_BEARISH';
        htfScoreBonus = -4;
      }
    }

    let mtfStatus = 'CHOP';
    let mtfSummary = '1H: Neutral ⚪ | 15M: Range-Bound ⚪';

    if (htfTrend.includes('BULLISH') && supertrend.direction === 'BULLISH') {
      mtfStatus = 'ALIGNED_BULLISH';
      mtfSummary = '1H: Bullish 🟢 | 15M: Bullish 🟢 (MTF Confluence)';
    } else if (htfTrend.includes('BEARISH') && supertrend.direction === 'BEARISH') {
      mtfStatus = 'ALIGNED_BEARISH';
      mtfSummary = '1H: Bearish 🔴 | 15M: Bearish 🔴 (MTF Confluence)';
    } else if (htfTrend.includes('BEARISH') && supertrend.direction === 'BULLISH') {
      mtfStatus = 'COUNTER_TREND_PULLBACK';
      mtfSummary = '1H: Bearish 🔴 | 15M: Bounce 🟢 (Counter-Trend Risk)';
    } else if (htfTrend.includes('BULLISH') && supertrend.direction === 'BEARISH') {
      mtfStatus = 'COUNTER_TREND_PULLBACK';
      mtfSummary = '1H: Bullish 🟢 | 15M: Pullback 🔴 (Counter-Trend Risk)';
    }

    // 2. PRECISION 5M ENTRY TIMING CONFIRMATION
    const is5mBullConfirmed = ind5m
      ? (ind5m.ema.ema9 >= ind5m.ema.ema21 &&
         ind5m.macd.histogram >= ind5m.macd.prevHistogram &&
         ind5m.rsi >= 42 && ind5m.rsi <= 71 &&
         ind5m.candleStrength?.isBullishCandle)
      : false;

    const is5mBearConfirmed = ind5m
      ? (ind5m.ema.ema9 <= ind5m.ema.ema21 &&
         ind5m.macd.histogram <= ind5m.macd.prevHistogram &&
         ind5m.rsi <= 58 && ind5m.rsi >= 29 &&
         ind5m.candleStrength?.isBearishCandle)
      : false;

    // 3. ANTI-CHASE & BTC MACRO FILTER
    const longOverextended = atrDistFromEma21 > 1.8 || rsi > 71 || structure.distToResistancePct < 0.4;
    const shortOverextended = atrDistFromEma21 < -1.8 || rsi < 29 || structure.distToSupportPct < 0.4;
    const longBtcAligned = !this.btcMacroBias.isDumping && this.btcMacroBias.direction !== 'BEARISH';
    const shortBtcAligned = !this.btcMacroBias.isPumping && this.btcMacroBias.direction !== 'BULLISH';

    // 4. RECALIBRATED 4-PILLAR CONFLUENCE MATRIX (Base 5/pillar = 20, strictly rewards real confluence)
    // --- LONG PILLARS ---
    let longPillarTrend = 5;
    if (htfScoreBonus > 0) longPillarTrend += 7;
    if (supertrend.direction === 'BULLISH') longPillarTrend += 5;
    if (ema.bullishAlignment || ema.goldenCross) longPillarTrend += 4;
    if (priceAboveVwap) longPillarTrend += 4;
    if (adx.isTrending && adx.trendDirection === 'BULLISH') longPillarTrend += 3;
    if (isChoppy) longPillarTrend -= 5;
    longPillarTrend = Math.min(25, Math.max(3, longPillarTrend));

    let longPillarStructure = 5;
    if (structure.isTestingSupport) longPillarStructure += 7;
    if (candlePatterns.some(p => p.type === 'BULLISH')) longPillarStructure += 6;
    if (structure.status === 'BREAKOUT_RESISTANCE') longPillarStructure += 6;
    if (structure.distToResistancePct >= 1.2) longPillarStructure += 5;
    if (longOverextended) longPillarStructure -= 7;
    longPillarStructure = Math.min(25, Math.max(3, longPillarStructure));

    let longPillarMomentum = 5;
    if (is5mBullConfirmed) longPillarMomentum += 7;
    if (divergence.detected && divergence.type.startsWith('BULLISH')) longPillarMomentum += 7;
    if (stochRsi.isBullishCross || stochRsi.k > stochRsi.d) longPillarMomentum += 4;
    if (macd.crossover === 'BULLISH' || macd.isExpandingBullish || macd.histogram > 0) longPillarMomentum += 4;
    if (rsi >= 42 && rsi <= 65) longPillarMomentum += 4;
    else if (rsi > 71) longPillarMomentum -= 6;
    longPillarMomentum = Math.min(25, Math.max(3, longPillarMomentum));

    let longPillarVolume = 5;
    if (volume.isHighVolume && ind15m.price >= ind15m.prevPrice) longPillarVolume += 7;
    if (volume.obv.isAccumulation) longPillarVolume += 5;
    if (bollinger.isSqueeze) longPillarVolume += 4;
    if (volume.surgeRatio > 1.15) longPillarVolume += 3;
    if (longBtcAligned) longPillarVolume += 4;
    else if (this.btcMacroBias.isDumping) longPillarVolume -= 10;
    longPillarVolume = Math.min(25, Math.max(3, longPillarVolume));

    let longRawScore = longPillarTrend + longPillarStructure + longPillarMomentum + longPillarVolume;

    // --- SHORT PILLARS ---
    let shortPillarTrend = 5;
    if (htfScoreBonus < 0) shortPillarTrend += 7;
    if (supertrend.direction === 'BEARISH') shortPillarTrend += 5;
    if (ema.bearishAlignment || ema.deathCross) shortPillarTrend += 4;
    if (!priceAboveVwap) shortPillarTrend += 4;
    if (adx.isTrending && adx.trendDirection === 'BEARISH') shortPillarTrend += 3;
    if (isChoppy) shortPillarTrend -= 5;
    shortPillarTrend = Math.min(25, Math.max(3, shortPillarTrend));

    let shortPillarStructure = 5;
    if (structure.isTestingResistance) shortPillarStructure += 7;
    if (candlePatterns.some(p => p.type === 'BEARISH')) shortPillarStructure += 6;
    if (structure.status === 'BREAKDOWN_SUPPORT') shortPillarStructure += 6;
    if (structure.distToSupportPct >= 1.2) shortPillarStructure += 5;
    if (shortOverextended) shortPillarStructure -= 7;
    shortPillarStructure = Math.min(25, Math.max(3, shortPillarStructure));

    let shortPillarMomentum = 5;
    if (is5mBearConfirmed) shortPillarMomentum += 7;
    if (divergence.detected && divergence.type.startsWith('BEARISH')) shortPillarMomentum += 7;
    if (stochRsi.isBearishCross || stochRsi.k < stochRsi.d) shortPillarMomentum += 4;
    if (macd.crossover === 'BEARISH' || macd.isContractingBearish || macd.histogram < 0) shortPillarMomentum += 4;
    if (rsi >= 35 && rsi <= 58) shortPillarMomentum += 4;
    else if (rsi < 29) shortPillarMomentum -= 6;
    shortPillarMomentum = Math.min(25, Math.max(3, shortPillarMomentum));

    let shortPillarVolume = 5;
    if (volume.isHighVolume && ind15m.price <= ind15m.prevPrice) shortPillarVolume += 7;
    if (!volume.obv.isAccumulation) shortPillarVolume += 5;
    if (bollinger.isSqueeze) shortPillarVolume += 4;
    if (volume.surgeRatio > 1.15) shortPillarVolume += 3;
    if (shortBtcAligned) shortPillarVolume += 4;
    else if (this.btcMacroBias.isPumping) shortPillarVolume -= 10;
    shortPillarVolume = Math.min(25, Math.max(3, shortPillarVolume));

    let shortRawScore = shortPillarTrend + shortPillarStructure + shortPillarMomentum + shortPillarVolume;

    // 5. TRAP SHIELD ADJUSTMENTS
    const trapWarning = traps.alert;
    if (traps.isBullTrap) {
      longRawScore = Math.max(15, longRawScore - 25);
      shortRawScore = Math.min(95, shortRawScore + 10);
    }
    if (traps.isBearTrap) {
      shortRawScore = Math.max(15, shortRawScore - 25);
      longRawScore = Math.min(95, longRawScore + 10);
    }
    if (traps.isFallingKnife) {
      longRawScore = Math.min(42, longRawScore);
      shortRawScore = Math.min(95, shortRawScore + 12);
    }

    const longScore = Math.min(98, Math.max(15, Math.round(longRawScore)));
    const shortScore = Math.min(98, Math.max(15, Math.round(shortRawScore)));

    // 6. REALISTIC LEVERAGED TARGETS (e.g. at 10x: SL ~ 4.2-6.0% ROE, TP1 ~ 8.8-13.0% ROE)
    let recLeverage = 10;
    if (currentPrice > 1000) recLeverage = 12;
    else if (ind15m.atrPct > 3.0) recLeverage = 6;
    else if (bollinger.isSqueeze) recLeverage = 10;
    else if (currentPrice < 1) recLeverage = 10;

    const lev = Math.max(1, Number(this.autoPilotConfig.leverage || recLeverage));
    const minSlPricePct = 0.042 / lev; // ~4.2% ROE
    const maxSlPricePct = 0.062 / lev; // ~6.2% ROE
    const rawAtrPricePct = Math.max(0.003, (atr / currentPrice) * 0.9);
    const slPricePct = Math.min(maxSlPricePct, Math.max(minSlPricePct, rawAtrPricePct));
    const slDist = currentPrice * slPricePct;
    const tp1Dist = slDist * 2.1; // +8.8% to +13.0% ROE (realistic 1:2.1 R:R!)
    const tp2Dist = slDist * 3.2; // +13.4% to +19.8% ROE runner

    const longSlPrice = Number((currentPrice - slDist).toFixed(pair.precision));
    const longTp1Price = Number((currentPrice + tp1Dist).toFixed(pair.precision));
    const longTp2Price = Number((currentPrice + tp2Dist).toFixed(pair.precision));
    const longSetup = {
      action: 'LONG',
      rating: longScore >= 78 ? 'STRONG BUY' : longScore >= 60 ? 'BUY' : 'NEUTRAL',
      score: longScore,
      confidence: longScore,
      entryPrice: currentPrice,
      tpPrice: longTp1Price,
      tp2Price: longTp2Price,
      slPrice: longSlPrice,
      tpPct: Number(((tp1Dist / currentPrice) * 100).toFixed(2)),
      tp2Pct: Number(((tp2Dist / currentPrice) * 100).toFixed(2)),
      slPct: Number(((slDist / currentPrice) * 100).toFixed(2)),
      recommendedLeverage: recLeverage,
      riskRewardRatio: '1:2.1',
      winRateProbability: Math.min(93, Math.max(48, Math.round(longScore * 0.94))),
      confluenceBreakdown: {
        trend: longPillarTrend,
        structure: longPillarStructure,
        momentum: longPillarMomentum,
        volume: longPillarVolume,
        total: longScore
      }
    };

    const shortSlPrice = Number((currentPrice + slDist).toFixed(pair.precision));
    const shortTp1Price = Number((currentPrice - tp1Dist).toFixed(pair.precision));
    const shortTp2Price = Number((currentPrice - tp2Dist).toFixed(pair.precision));
    const shortSetup = {
      action: 'SHORT',
      rating: shortScore >= 78 ? 'STRONG SELL' : shortScore >= 60 ? 'SELL' : 'NEUTRAL',
      score: shortScore,
      confidence: shortScore,
      entryPrice: currentPrice,
      tpPrice: shortTp1Price,
      tp2Price: shortTp2Price,
      slPrice: shortSlPrice,
      tpPct: Number(((tp1Dist / currentPrice) * 100).toFixed(2)),
      tp2Pct: Number(((tp2Dist / currentPrice) * 100).toFixed(2)),
      slPct: Number(((slDist / currentPrice) * 100).toFixed(2)),
      recommendedLeverage: recLeverage,
      riskRewardRatio: '1:2.1',
      winRateProbability: Math.min(93, Math.max(48, Math.round(shortScore * 0.94))),
      confluenceBreakdown: {
        trend: shortPillarTrend,
        structure: shortPillarStructure,
        momentum: shortPillarMomentum,
        volume: shortPillarVolume,
        total: shortScore
      }
    };

    const isDominantLong = longScore >= shortScore;
    const dominantSetup = isDominantLong ? longSetup : shortSetup;
    const dominantAction = isDominantLong ? 'LONG' : 'SHORT';
    const entry5mConfirmed = isDominantLong ? is5mBullConfirmed : is5mBearConfirmed;
    const isOverextended = isDominantLong ? longOverextended : shortOverextended;
    const btcAligned = isDominantLong ? longBtcAligned : shortBtcAligned;

    const highlights = [];
    if (divergence.detected) highlights.push(`⚡ ${divergence.label}`);
    if (mtfStatus.startsWith('ALIGNED')) highlights.push(`🏆 ${mtfSummary}`);
    if (entry5mConfirmed) highlights.push('🎯 5M Precision Entry Trigger Confirmed');
    if (isChoppy) highlights.push(`⚠️ Choppy / Sideways Market (ADX ${adx.adx})`);
    if (trapWarning) highlights.push(`⚠️ ${trapWarning}`);
    if (structure.status === 'BREAKOUT_RESISTANCE') highlights.push('🚀 Breakout Above Key Resistance');
    if (candlePatterns.length > 0) highlights.push(`🕯️ ${candlePatterns.map(p => p.name).join(', ')}`);
    if (bollinger.isSqueeze) highlights.push('⚡ Bollinger Band Squeeze');
    if (volume.isHighVolume) highlights.push(`📊 Volume Surge (${volume.surgeRatio}x)`);

    const invalidationRule = isDominantLong
      ? `Invalidated below support ($${structure.support})`
      : `Invalidated above resistance ($${structure.resistance})`;

    return {
      symbol,
      name: pair.name,
      base: pair.base,
      price: currentPrice,
      pricePrecision: pair.precision,
      change24h: tickerStats.priceChangePercent !== undefined ? tickerStats.priceChangePercent : 1.5,
      high24h: tickerStats.highPrice || currentPrice * 1.02,
      low24h: tickerStats.lowPrice || currentPrice * 0.98,
      volume24h: tickerStats.volume || 100000,
      score: dominantSetup.score,
      rating: dominantSetup.rating,
      action: dominantAction,
      confidence: dominantSetup.confidence,
      trend: isDominantLong ? 'BULLISH ADVANCE' : 'BEARISH DISTRIBUTION',
      mtfStatus,
      mtfSummary,
      confluenceBreakdown: dominantSetup.confluenceBreakdown,
      divergence: divergence.detected ? divergence : null,
      marketStructure: structure.status,
      structureLevels: {
        pivot: structure.pivot,
        support: structure.support,
        resistance: structure.resistance,
        distToSupportPct: structure.distToSupportPct,
        distToResistancePct: structure.distToResistancePct
      },
      trapWarning,
      isFallingKnife: traps.isFallingKnife,
      candlePatterns: candlePatterns.map(p => p.name),
      rsi,
      adx: adx.adx,
      vwap: vwap?.value || currentPrice,
      priceAboveVwap,
      atrDistFromEma21,
      entry5mConfirmed,
      btcAligned,
      isChoppy,
      isOverextended,
      stochRsiK: stochRsi.k,
      stochRsiD: stochRsi.d,
      macdHistogram: macd.histogram,
      supertrend: supertrend.direction,
      isSqueeze: bollinger.isSqueeze,
      volumeSurgeRatio: volume.surgeRatio,
      entryPrice: currentPrice,
      tpPrice: dominantSetup.tpPrice,
      tp2Price: dominantSetup.tp2Price,
      slPrice: dominantSetup.slPrice,
      tpPct: dominantSetup.tpPct,
      tp2Pct: dominantSetup.tp2Pct,
      slPct: dominantSetup.slPct,
      recommendedLeverage: recLeverage,
      riskRewardRatio: dominantSetup.riskRewardRatio,
      winRateProbability: dominantSetup.winRateProbability,
      invalidationRule,
      highlights,
      longSetup,
      shortSetup
    };
  }

  async runFullScan() {
    try {
      const results = [];
      for (const pair of CONFIG.DEFAULT_PAIRS) {
        const analysis = await this.analyzeCoin(pair);
        if (analysis) results.push(analysis);
      }

      results.sort((a, b) => {
        const aReady = (a.entry5mConfirmed && a.mtfStatus?.startsWith('ALIGNED') && !a.isChoppy) ? 1 : 0;
        const bReady = (b.entry5mConfirmed && b.mtfStatus?.startsWith('ALIGNED') && !b.isChoppy) ? 1 : 0;
        if (aReady !== bReady) return bReady - aReady;
        return b.confidence - a.confidence;
      });
      this.analysisCache = results;

      if (this.io) {
        this.io.emit('market_analysis_update', results);
      }

      if (this.isAutoPilotRunning) {
        await this.evaluateAutoPilot(results);
      }

      return results;
    } catch (err) {
      console.error('[MarketAnalysisService] Scan error:', err.message);
      return this.analysisCache;
    }
  }

  /**
   * Auto-Pilot: Strict 6-Gate Institutional Quality Filter before opening any trade
   */
  async evaluateAutoPilot(rankedCoins) {
    if (this.isEvaluatingAutoPilot) return;
    this.isEvaluatingAutoPilot = true;

    try {
      const now = Date.now();
      // 45s cooldown prevents spraying correlated altcoin entries simultaneously
      if (now - this.lastAutoTradeTime < 45000) return;

      const isLive = Boolean(paperTrading.isLive && binanceService.liveExchange);
      const currentPositions = isLive ? await binanceService.getLivePositions() : paperTrading.positions;
      if (currentPositions.length >= this.autoPilotConfig.maxOpenTrades) return;

      let effectiveAllocation = Number(this.autoPilotConfig.allocationUsdt || 10);
      let effectiveLeverage = Number(this.autoPilotConfig.leverage || 10);

      if (isLive) {
        const liveBal = await binanceService.getLiveBalance();
        const availableMargin = liveBal?.availableBalance || 0;
        if (availableMargin < 0.32) {
          if (now - this.lastAutoPilotErrorTime > 30000 && this.io) {
            this.lastAutoPilotErrorTime = now;
            this.io.emit('autopilot_error', {
              message: `Insufficient Binance available margin ($${availableMargin.toFixed(2)}). Need at least $0.35 USDT at 20x.`,
              timestamp: new Date().toISOString()
            });
          }
          return;
        }

        const maxSafeMargin = Number((availableMargin * 0.85).toFixed(2));
        effectiveAllocation = Math.max(0.28, Math.min(effectiveAllocation, maxSafeMargin));
        if (effectiveAllocation > availableMargin * 0.92) effectiveAllocation = maxSafeMargin;

        if (effectiveAllocation * effectiveLeverage < 5.6) {
          effectiveLeverage = Math.min(20, Math.max(effectiveLeverage, Math.ceil(6.0 / Math.max(0.28, effectiveAllocation))));
        }
        if (effectiveAllocation * effectiveLeverage < 5.5 && maxSafeMargin * 20 >= 5.5) {
          effectiveAllocation = Number(Math.min(maxSafeMargin, 0.32).toFixed(2));
          effectiveLeverage = 20;
        }
        if (effectiveAllocation * effectiveLeverage < 5.5) {
          if (now - this.lastAutoPilotErrorTime > 30000 && this.io) {
            this.lastAutoPilotErrorTime = now;
            this.io.emit('autopilot_error', {
              message: `Available Binance margin ($${availableMargin.toFixed(2)}) is below Binance $5.50 minimum notional at 20x.`,
              timestamp: new Date().toISOString()
            });
          }
          return;
        }
      }

      for (const coin of rankedCoins) {
        // GATE 1: High Confluence Threshold
        if (coin.confidence < this.autoPilotConfig.minConfidence) continue;
        if (coin.action === 'HOLD') continue;

        // GATE 2: Direction Filter
        if (coin.action === 'LONG' && this.autoPilotConfig.directionPreference === 'SHORT_ONLY') continue;
        if (coin.action === 'SHORT' && this.autoPilotConfig.directionPreference === 'LONG_ONLY') continue;

        // GATE 3: Mandatory 1H + 15M MTF Alignment (NEVER trade counter-trend!)
        if (coin.action === 'LONG' && coin.mtfStatus !== 'ALIGNED_BULLISH') continue;
        if (coin.action === 'SHORT' && coin.mtfStatus !== 'ALIGNED_BEARISH') continue;

        // GATE 4: Sideways Chop Shield + 5M Entry Confirmation + Anti-Chase
        if (coin.isChoppy) continue;
        if (!coin.entry5mConfirmed) continue;
        if (coin.isOverextended) continue;
        if (coin.action === 'LONG' && coin.rsi > 69) continue;
        if (coin.action === 'SHORT' && coin.rsi < 31) continue;

        // GATE 5: BTC Macro Alignment & Trap Shield
        if (coin.btcAligned === false) continue;
        if (coin.isFallingKnife) continue;
        if (coin.action === 'LONG' && coin.trapWarning?.includes('BULL TRAP')) continue;
        if (coin.action === 'SHORT' && coin.trapWarning?.includes('BEAR TRAP')) continue;

        // GATE 6: Affordability & Duplicate Pair Check
        if (isLive) {
          const pairInfo = CONFIG.DEFAULT_PAIRS.find(p => p.symbol === coin.symbol);
          const minNotional = pairInfo?.minNotional || 5.5;
          const minCoinCost = (pairInfo?.minQty || 0.001) * coin.price;
          if (effectiveAllocation * effectiveLeverage < Math.max(minNotional, minCoinCost) * 0.98) {
            continue;
          }
        }
        if (currentPositions.some(p => p.symbol === coin.symbol)) continue;

        try {
          let pos = null;

          if (isLive) {
            const liveOrder = await binanceService.executeLiveOrder({
              symbol: coin.symbol,
              side: coin.action,
              amountUsdt: effectiveAllocation,
              leverage: effectiveLeverage,
              tp: coin.tpPrice,
              sl: coin.slPrice
            });

            const cleanSym = coin.symbol.replace('/', '').toUpperCase();
            const posId = `BINANCE-${cleanSym}-${coin.action}`;
            pos = {
              id: posId,
              symbol: cleanSym,
              side: coin.action,
              entryPrice: coin.price,
              currentPrice: coin.price,
              leverage: effectiveLeverage,
              margin: effectiveAllocation,
              tp: coin.tpPrice,
              sl: coin.slPrice,
              trailingStopPct: this.marginGuardian?.trailingStopPct || 1.5,
              source: 'BINANCE_LIVE_AUTOPILOT',
              binanceOrderId: liveOrder?.id || null,
              openedAt: new Date().toISOString()
            };

            if (this.marginGuardian) {
              this.marginGuardian.setTarget(posId, { tp: coin.tpPrice, sl: coin.slPrice, trailingStopPct: this.marginGuardian.trailingStopPct || 1.5 });
              this.marginGuardian.setTarget(cleanSym, { tp: coin.tpPrice, sl: coin.slPrice, trailingStopPct: this.marginGuardian.trailingStopPct || 1.5 });
            }
          } else {
            pos = paperTrading.openPosition({
              symbol: coin.symbol,
              side: coin.action,
              amountUsdt: effectiveAllocation,
              leverage: effectiveLeverage,
              markPrice: coin.price,
              tp: coin.tpPrice,
              sl: coin.slPrice,
              trailingStopPct: this.marginGuardian?.trailingStopPct || 1.5,
              source: 'AI_AUTO_PILOT'
            });

            if (this.marginGuardian) {
              this.marginGuardian.setTarget(pos.id, { tp: coin.tpPrice, sl: coin.slPrice, trailingStopPct: this.marginGuardian.trailingStopPct || 1.5 });
              this.marginGuardian.setTarget(coin.symbol, { tp: coin.tpPrice, sl: coin.slPrice, trailingStopPct: this.marginGuardian.trailingStopPct || 1.5 });
            }
          }

          this.lastAutoTradeTime = now;

          const tradeAlert = {
            id: `AP-${Date.now()}`,
            timestamp: new Date().toISOString(),
            message: `🤖 AI Auto-Pilot opened ${coin.action} ${coin.symbol} @ $${coin.price} | TP: $${coin.tpPrice} (+${coin.tpPct}%) | SL: $${coin.slPrice} (-${coin.slPct}%) | 3-TF + 5M Ready (Conf: ${coin.confidence}%, ADX ${coin.adx}) [${isLive ? 'LIVE' : 'DEMO'}]`,
            position: pos
          };

          if (this.io) {
            this.io.emit('position_opened', pos);
            this.io.emit('autopilot_trade', tradeAlert);
            if (isLive) {
              const updatedLiveBal = await binanceService.getLiveBalance();
              const updatedLivePos = await binanceService.getLivePositions();
              if (updatedLiveBal) this.io.emit('account_summary', updatedLiveBal);
              this.io.emit('positions_update', updatedLivePos || []);
            } else {
              this.io.emit('account_summary', paperTrading.getBalance());
              this.io.emit('positions_update', paperTrading.positions);
            }
          }

          if (this.onTradeCallback) {
            try { await this.onTradeCallback(); } catch {}
          }
          break;
        } catch (err) {
          console.warn('[MarketAnalysisService] Auto-Pilot open error:', err.message);
          if (now - this.lastAutoPilotErrorTime > 15000 && this.io) {
            this.lastAutoPilotErrorTime = now;
            this.io.emit('autopilot_error', {
              symbol: coin.symbol,
              message: `Auto-Pilot order failed on ${coin.symbol}: ${err.message}`,
              timestamp: new Date().toISOString()
            });
          }
        }
      }
    } finally {
      this.isEvaluatingAutoPilot = false;
    }
  }

  getLatestAnalysis() {
    return this.analysisCache;
  }

  getLatestAnalysisMap() {
    const map = {};
    for (const item of this.analysisCache || []) {
      map[item.symbol] = item;
    }
    return map;
  }
}
