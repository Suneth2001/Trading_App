import { CONFIG } from '../config.js';
import { binanceService } from './binanceService.js';
import { IndicatorService } from './indicatorService.js';
import { paperTrading } from './paperTradingService.js';

export class MarketAnalysisService {
  constructor(io, marginGuardian = null) {
    this.io = io;
    this.marginGuardian = marginGuardian;
    this.analysisCache = [];
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
    this.lastAutoTradeTime = 0; // Allow immediate execution on activation
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

  /**
   * Start recurring automated market scanner
   */
  startScanner() {
    this.runFullScan();
    this.scanInterval = setInterval(() => {
      this.runFullScan();
    }, CONFIG.AUTO_MARKET_SCANNER?.SCAN_INTERVAL_MS || 5000);
  }

  /**
   * Analyze an individual cryptocurrency coin using Institutional Confluence Matrix
   * (Multi-Timeframe 1H + 15M, RSI Divergence, Market Structure, S&R Pivots, and Trap Shield)
   */
  async analyzeCoin(pair) {
    const symbol = pair.symbol;
    const currentPrice = binanceService.getPrice(symbol);
    const tickerStats = binanceService.getTickerStats()[symbol] || {};

    // 1. Fetch Multi-Timeframe Klines: 15m (Execution) & 1h (Macro Trend)
    const [candles15m, candles1h] = await Promise.all([
      binanceService.fetchKlines(symbol, '15m', 80),
      binanceService.fetchKlines(symbol, '1h', 60)
    ]);

    const ind15m = IndicatorService.calculateAll(candles15m);
    const ind1h = IndicatorService.calculateAll(candles1h);

    if (!ind15m || !currentPrice) {
      return null;
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
      traps
    } = ind15m;

    const atr = ind15m.atr > 0 ? ind15m.atr : (currentPrice * 0.015);

    // ================= 1. MULTI-TIMEFRAME (1H + 15M) TREND ANALYSIS ================= //
    let htfTrend = 'NEUTRAL';
    let htfScoreBonus = 0;

    if (ind1h) {
      const is1hBull = ind1h.supertrend.direction === 'BULLISH' && ind1h.price >= ind1h.ema.ema50;
      const is1hBear = ind1h.supertrend.direction === 'BEARISH' && ind1h.price <= ind1h.ema.ema50;
      if (is1hBull) {
        htfTrend = 'BULLISH';
        htfScoreBonus = 10;
      } else if (is1hBear) {
        htfTrend = 'BEARISH';
        htfScoreBonus = -10;
      } else if (ind1h.price > ind1h.ema.ema21) {
        htfTrend = 'MILD_BULLISH';
        htfScoreBonus = 5;
      } else if (ind1h.price < ind1h.ema.ema21) {
        htfTrend = 'MILD_BEARISH';
        htfScoreBonus = -5;
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
      mtfSummary = '1H: Bullish 🟢 | 15M: Pullback 🔴 (Dip Buying Zone)';
    }

    // ================= 2. 4-PILLAR CONFLUENCE SCORING ENGINE ================= //

    // --- LONG PILLARS (0 to 25 pts each) ---
    // Pillar 1: Trend
    let longPillarTrend = 8;
    if (htfScoreBonus > 0) longPillarTrend += 7;
    if (supertrend.direction === 'BULLISH') longPillarTrend += 5;
    if (ema.bullishAlignment || ema.goldenCross) longPillarTrend += 4;
    if (ema.priceAboveEma200) longPillarTrend += 2;
    if (adx.isTrending && adx.trendDirection === 'BULLISH') longPillarTrend += 2;
    longPillarTrend = Math.min(25, Math.max(5, longPillarTrend));

    // Pillar 2: Structure & Key Levels
    let longPillarStructure = 10;
    if (structure.isTestingSupport) longPillarStructure += 9;
    if (candlePatterns.some(p => p.type === 'BULLISH')) longPillarStructure += 6;
    if (structure.status === 'BREAKOUT_RESISTANCE') longPillarStructure += 7;
    if (structure.distToResistancePct >= 1.2) longPillarStructure += 5;
    if (structure.isTestingResistance && structure.status !== 'BREAKOUT_RESISTANCE') longPillarStructure -= 4;
    longPillarStructure = Math.min(25, Math.max(5, longPillarStructure));

    // Pillar 3: Momentum & Divergence
    let longPillarMomentum = 9;
    if (divergence.detected && divergence.type.startsWith('BULLISH')) longPillarMomentum += 11;
    if (stochRsi.isBullishCross || stochRsi.k > stochRsi.d) longPillarMomentum += 5;
    if (macd.crossover === 'BULLISH' || macd.isExpandingBullish || macd.histogram > 0) longPillarMomentum += 5;
    if (rsi >= 42 && rsi <= 68) longPillarMomentum += 4;
    if (rsi < 35) longPillarMomentum += 6;
    if (rsi > 76) longPillarMomentum -= 6;
    longPillarMomentum = Math.min(25, Math.max(5, longPillarMomentum));

    // Pillar 4: Volume & Volatility
    let longPillarVolume = 10;
    if (volume.isHighVolume && ind15m.price >= ind15m.prevPrice) longPillarVolume += 7;
    if (volume.obv.isAccumulation) longPillarVolume += 5;
    if (bollinger.isSqueeze) longPillarVolume += 4;
    if (volume.surgeRatio > 1.15) longPillarVolume += 3;
    longPillarVolume = Math.min(25, Math.max(5, longPillarVolume));

    let longRawScore = longPillarTrend + longPillarStructure + longPillarMomentum + longPillarVolume;

    // --- SHORT PILLARS (0 to 25 pts each) ---
    // Pillar 1: Trend
    let shortPillarTrend = 8;
    if (htfScoreBonus < 0) shortPillarTrend += 7;
    if (supertrend.direction === 'BEARISH') shortPillarTrend += 5;
    if (ema.bearishAlignment || ema.deathCross) shortPillarTrend += 4;
    if (!ema.priceAboveEma200) shortPillarTrend += 2;
    if (adx.isTrending && adx.trendDirection === 'BEARISH') shortPillarTrend += 2;
    shortPillarTrend = Math.min(25, Math.max(5, shortPillarTrend));

    // Pillar 2: Structure & Key Levels
    let shortPillarStructure = 10;
    if (structure.isTestingResistance) shortPillarStructure += 9;
    if (candlePatterns.some(p => p.type === 'BEARISH')) shortPillarStructure += 6;
    if (structure.status === 'BREAKDOWN_SUPPORT') shortPillarStructure += 7;
    if (structure.distToSupportPct >= 1.2) shortPillarStructure += 5;
    if (structure.isTestingSupport && structure.status !== 'BREAKDOWN_SUPPORT') shortPillarStructure -= 4;
    shortPillarStructure = Math.min(25, Math.max(5, shortPillarStructure));

    // Pillar 3: Momentum & Divergence
    let shortPillarMomentum = 9;
    if (divergence.detected && divergence.type.startsWith('BEARISH')) shortPillarMomentum += 11;
    if (stochRsi.isBearishCross || stochRsi.k < stochRsi.d) shortPillarMomentum += 5;
    if (macd.crossover === 'BEARISH' || macd.isContractingBearish || macd.histogram < 0) shortPillarMomentum += 5;
    if (rsi >= 32 && rsi <= 58) shortPillarMomentum += 4;
    if (rsi > 65) shortPillarMomentum += 6;
    if (rsi < 24) shortPillarMomentum -= 6;
    shortPillarMomentum = Math.min(25, Math.max(5, shortPillarMomentum));

    // Pillar 4: Volume & Volatility
    let shortPillarVolume = 10;
    if (volume.isHighVolume && ind15m.price <= ind15m.prevPrice) shortPillarVolume += 7;
    if (!volume.obv.isAccumulation) shortPillarVolume += 5;
    if (bollinger.isSqueeze) shortPillarVolume += 4;
    if (volume.surgeRatio > 1.15) shortPillarVolume += 3;
    shortPillarVolume = Math.min(25, Math.max(5, shortPillarVolume));

    let shortRawScore = shortPillarTrend + shortPillarStructure + shortPillarMomentum + shortPillarVolume;

    // ================= 3. TRAP SHIELD & PROTECTION FILTERS ================= //
    let trapWarning = traps.alert;

    if (traps.isBullTrap) {
      longRawScore = Math.max(15, longRawScore - 25);
      shortRawScore = Math.min(95, shortRawScore + 12);
    }
    if (traps.isBearTrap) {
      shortRawScore = Math.max(15, shortRawScore - 25);
      longRawScore = Math.min(95, longRawScore + 12);
    }
    if (traps.isFallingKnife) {
      // NEVER allow falling knife to trigger a Strong Long
      longRawScore = Math.min(48, longRawScore);
      shortRawScore = Math.min(95, shortRawScore + 15);
    }

    const longScore = Math.min(98, Math.max(15, Math.round(longRawScore)));
    const shortScore = Math.min(98, Math.max(15, Math.round(shortRawScore)));

    // ================= 4. STRUCTURAL TARGETS (TP1, TP2, SL) ================= //
    // Long Targets
    const longSlDist = Math.max(
      currentPrice * 0.015,
      Math.min(currentPrice * 0.045, Math.abs(currentPrice - structure.support) + (0.5 * atr))
    );
    const longSlPrice = Number((currentPrice - longSlDist).toFixed(pair.precision));
    const longTp1Dist = Math.max(longSlDist * 1.6, Math.max(currentPrice * 0.025, 1.8 * atr));
    const longTp1Price = Number((currentPrice + longTp1Dist).toFixed(pair.precision));
    const longTp2Dist = longSlDist * 2.8;
    const longTp2Price = Number((currentPrice + longTp2Dist).toFixed(pair.precision));
    const longRr = (longTp1Dist / longSlDist).toFixed(1);

    // Short Targets
    const shortSlDist = Math.max(
      currentPrice * 0.015,
      Math.min(currentPrice * 0.045, Math.abs(structure.resistance - currentPrice) + (0.5 * atr))
    );
    const shortSlPrice = Number((currentPrice + shortSlDist).toFixed(pair.precision));
    const shortTp1Dist = Math.max(shortSlDist * 1.6, Math.max(currentPrice * 0.025, 1.8 * atr));
    const shortTp1Price = Number((currentPrice - shortTp1Dist).toFixed(pair.precision));
    const shortTp2Dist = shortSlDist * 2.8;
    const shortTp2Price = Number((currentPrice - shortTp2Dist).toFixed(pair.precision));
    const shortRr = (shortTp1Dist / shortSlDist).toFixed(1);

    // Recommended Leverage based on volatility
    let recLeverage = 10;
    if (currentPrice > 1000) recLeverage = 15; // BTC/ETH
    else if (ind15m.atrPct > 3.0) recLeverage = 5; // Highly volatile
    else if (bollinger.isSqueeze) recLeverage = 8;
    else if (currentPrice < 1) recLeverage = 5; // Meme / micro altcoins

    // Long Setup Object
    const longRating = longScore >= 78 ? 'STRONG BUY' : longScore >= 58 ? 'BUY' : 'NEUTRAL';
    const longSetup = {
      action: 'LONG',
      rating: longRating,
      score: longScore,
      confidence: longScore,
      entryPrice: currentPrice,
      tpPrice: longTp1Price,
      tp2Price: longTp2Price,
      slPrice: longSlPrice,
      tpPct: Number(((longTp1Dist / currentPrice) * 100).toFixed(2)),
      tp2Pct: Number(((longTp2Dist / currentPrice) * 100).toFixed(2)),
      slPct: Number(((longSlDist / currentPrice) * 100).toFixed(2)),
      recommendedLeverage: recLeverage,
      riskRewardRatio: `1:${longRr}`,
      winRateProbability: Math.min(94, Math.max(50, Math.round(longScore * 0.95))),
      confluenceBreakdown: {
        trend: longPillarTrend,
        structure: longPillarStructure,
        momentum: longPillarMomentum,
        volume: longPillarVolume,
        total: longScore
      }
    };

    // Short Setup Object
    const shortRating = shortScore >= 78 ? 'STRONG SELL' : shortScore >= 58 ? 'SELL' : 'NEUTRAL';
    const shortSetup = {
      action: 'SHORT',
      rating: shortRating,
      score: shortScore,
      confidence: shortScore,
      entryPrice: currentPrice,
      tpPrice: shortTp1Price,
      tp2Price: shortTp2Price,
      slPrice: shortSlPrice,
      tpPct: Number(((shortTp1Dist / currentPrice) * 100).toFixed(2)),
      tp2Pct: Number(((shortTp2Dist / currentPrice) * 100).toFixed(2)),
      slPct: Number(((shortSlDist / currentPrice) * 100).toFixed(2)),
      recommendedLeverage: recLeverage,
      riskRewardRatio: `1:${shortRr}`,
      winRateProbability: Math.min(94, Math.max(50, Math.round(shortScore * 0.95))),
      confluenceBreakdown: {
        trend: shortPillarTrend,
        structure: shortPillarStructure,
        momentum: shortPillarMomentum,
        volume: shortPillarVolume,
        total: shortScore
      }
    };

    // Dominant Direction Selection
    const isDominantLong = longScore >= shortScore;
    const dominantSetup = isDominantLong ? longSetup : shortSetup;
    const dominantAction = isDominantLong ? 'LONG' : 'SHORT';
    const dominantScore = dominantSetup.score;
    const dominantRating = dominantSetup.rating;
    const dominantConfidence = dominantSetup.confidence;
    const dominantTpPrice = dominantSetup.tpPrice;
    const dominantTp2Price = dominantSetup.tp2Price;
    const dominantSlPrice = dominantSetup.slPrice;
    const dominantRr = dominantSetup.riskRewardRatio;

    // Build Highlights / Catalysts
    const highlights = [];
    if (divergence.detected) highlights.push(`⚡ ${divergence.label}`);
    if (mtfStatus.startsWith('ALIGNED')) highlights.push(`🏆 ${mtfSummary}`);
    if (traps.alert) highlights.push(`⚠️ ${traps.alert}`);
    if (structure.status === 'BREAKOUT_RESISTANCE') highlights.push('🚀 Breakout Above Key Resistance');
    if (structure.isTestingSupport) highlights.push(`🛡️ Bounce Off Support ($${structure.support})`);
    if (candlePatterns.length > 0) highlights.push(`🕯️ ${candlePatterns.map(p => p.name).join(', ')}`);
    if (bollinger.isSqueeze) highlights.push('⚡ Bollinger Band Squeeze (Breakout Imminent)');
    if (volume.isHighVolume) highlights.push(`📊 Volume Surge (${volume.surgeRatio}x)`);
    if (supertrend.direction === 'BULLISH') highlights.push('🟢 SuperTrend Bullish Support');
    if (supertrend.direction === 'BEARISH') highlights.push('🔴 SuperTrend Bearish Resistance');

    const invalidationRule = isDominantLong
      ? `Invalidated if candle closes below structural support ($${structure.support})`
      : `Invalidated if candle closes above structural resistance ($${structure.resistance})`;

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
      score: dominantScore,
      rating: dominantRating,
      action: dominantAction,
      confidence: dominantConfidence,
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
      stochRsiK: stochRsi.k,
      stochRsiD: stochRsi.d,
      macdHistogram: macd.histogram,
      supertrend: supertrend.direction,
      isSqueeze: bollinger.isSqueeze,
      volumeSurgeRatio: volume.surgeRatio,
      entryPrice: currentPrice,
      tpPrice: dominantTpPrice,
      tp2Price: dominantTp2Price,
      slPrice: dominantSlPrice,
      recommendedLeverage: recLeverage,
      riskRewardRatio: dominantRr,
      winRateProbability: dominantSetup.winRateProbability,
      invalidationRule,
      highlights,
      longSetup,
      shortSetup
    };
  }

  /**
   * Run full market scan across all configured cryptocurrency pairs
   */
  async runFullScan() {
    try {
      const results = [];
      for (const pair of CONFIG.DEFAULT_PAIRS) {
        const analysis = await this.analyzeCoin(pair);
        if (analysis) {
          results.push(analysis);
        }
      }

      // Sort by best trade opportunity (deviation from 50)
      results.sort((a, b) => Math.abs(b.score - 50) - Math.abs(a.score - 50));
      this.analysisCache = results;

      if (this.io) {
        this.io.emit('market_analysis_update', results);
      }

      // Evaluate AI Auto-Pilot if enabled
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
   * Auto-Pilot: Automatically trades the highest-ranking opportunities with dynamic TP / SL
   */
  async evaluateAutoPilot(rankedCoins) {
    const now = Date.now();
    // Cooldown: at least 20 seconds between auto trades
    if (now - this.lastAutoTradeTime < 20000) return;

    const isLive = paperTrading.isLive && binanceService.liveExchange;

    // Check open positions count
    const currentPositions = isLive ? await binanceService.getLivePositions() : paperTrading.positions;
    if (currentPositions.length >= this.autoPilotConfig.maxOpenTrades) return;

    let effectiveAllocation = this.autoPilotConfig.allocationUsdt;
    let effectiveLeverage = this.autoPilotConfig.leverage || 10;

    if (isLive) {
      const liveBal = await binanceService.getLiveBalance();
      const availableMargin = liveBal?.availableBalance || 0;
      if (availableMargin <= 0.3) return;
      if (availableMargin < effectiveAllocation) {
        // Adapt margin to fit user's available wallet balance (e.g. $1.45 wallet -> ~$0.75 margin at 10x = $7.50 notional)
        effectiveAllocation = Number(Math.max(0.6, availableMargin * 0.65).toFixed(2));
        if (effectiveAllocation > availableMargin) effectiveAllocation = Number((availableMargin * 0.92).toFixed(2));
        if (effectiveAllocation * effectiveLeverage < 5.6) {
          effectiveLeverage = Math.min(20, Math.ceil(6.0 / effectiveAllocation));
        }
      }
    }

    for (const coin of rankedCoins) {
      if (coin.confidence < this.autoPilotConfig.minConfidence) continue;
      if (coin.action === 'HOLD') continue;

      // Filter by direction preference
      if (coin.action === 'LONG' && this.autoPilotConfig.directionPreference === 'SHORT_ONLY') continue;
      if (coin.action === 'SHORT' && this.autoPilotConfig.directionPreference === 'LONG_ONLY') continue;

      // In Live mode, skip high-minNotional pairs (BTC/ETH/LINK) if position notional < pair's minNotional
      if (isLive) {
        const pairInfo = CONFIG.DEFAULT_PAIRS.find(p => p.symbol === coin.symbol);
        const minNotional = pairInfo?.minNotional || 5.5;
        const minCoinCost = (pairInfo?.minQty || 0.001) * coin.price;
        const requiredNotional = Math.max(minNotional, minCoinCost);
        if (effectiveAllocation * effectiveLeverage < requiredNotional) {
          continue; // Automatically pick the next high-confidence affordable pair (e.g. DOGE, XRP, ADA, SUI, SOL, NEAR)
        }
      }

      // Protection: Skip coins experiencing falling knife capitulation or severe trap warnings
      if (coin.isFallingKnife) continue;
      if (coin.action === 'LONG' && coin.trapWarning?.includes('BULL TRAP')) continue;
      if (coin.action === 'SHORT' && coin.trapWarning?.includes('BEAR TRAP')) continue;

      // Don't open if already in position for this coin
      const alreadyOpen = currentPositions.some(p => p.symbol === coin.symbol);
      if (alreadyOpen) continue;

      try {
        let liveOrder = null;
        if (isLive) {
          liveOrder = await binanceService.executeLiveOrder({
            symbol: coin.symbol,
            side: coin.action,
            amountUsdt: effectiveAllocation,
            leverage: effectiveLeverage
          });
        }

        const pos = paperTrading.openPosition({
          symbol: coin.symbol,
          side: coin.action,
          amountUsdt: effectiveAllocation,
          leverage: effectiveLeverage,
          markPrice: coin.price,
          tp: coin.tpPrice,
          sl: coin.slPrice,
          trailingStopPct: 2.0,
          source: isLive ? 'BINANCE_LIVE_AUTOPILOT' : 'AI_AUTO_PILOT'
        });

        if (liveOrder) {
          pos.binanceOrderId = liveOrder.id;
        }

        // Register dynamic TP/SL targets with Margin Guardian for 24/7 Auto-Close
        if (this.marginGuardian) {
          this.marginGuardian.setTarget(pos.id, {
            tp: coin.tpPrice,
            sl: coin.slPrice,
            trailingStopPct: 2.0
          });
          this.marginGuardian.setTarget(coin.symbol, {
            tp: coin.tpPrice,
            sl: coin.slPrice,
            trailingStopPct: 2.0
          });
          if (isLive) {
            const cleanSym = coin.symbol.replace('/', '').toUpperCase();
            this.marginGuardian.setTarget(`BINANCE-${cleanSym}-${coin.action}`, {
              tp: coin.tpPrice,
              sl: coin.slPrice,
              trailingStopPct: 2.0
            });
          }
        }

        this.lastAutoTradeTime = now;

        const tradeAlert = {
          id: `AP-${Date.now()}`,
          timestamp: new Date().toISOString(),
          message: `🤖 AI Auto-Pilot opened ${coin.action} on ${coin.symbol} @ $${coin.price} (TP1: $${coin.tpPrice}, SL: $${coin.slPrice}, Conf: ${coin.confidence}%) [${isLive ? 'LIVE BINANCE' : 'DEMO'}]`,
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
        break; // open 1 trade per cycle
      } catch (err) {
        console.warn('[MarketAnalysisService] Auto-Pilot open error:', err.message);
      }
    }
  }

  getLatestAnalysis() {
    return this.analysisCache;
  }
}
