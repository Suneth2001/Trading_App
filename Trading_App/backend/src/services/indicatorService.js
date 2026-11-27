import technicalindicators from 'technicalindicators';

const { RSI, MACD, BollingerBands, EMA, SMA, ATR, ADX, StochasticRSI, OBV } = technicalindicators;

export class IndicatorService {
  /**
   * Calculate all indicators for a given set of OHLCV candles
   * Candles format: [{ time, open, high, low, close, volume }]
   */
  static calculateAll(candles) {
    if (!candles || candles.length < 20) {
      return null;
    }

    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const opens = candles.map(c => c.open);
    const volumes = candles.map(c => c.volume);
    const n = closes.length;

    // 1. RSI (14)
    const rsiValues = RSI.calculate({ values: closes, period: 14 });
    const currentRsi = rsiValues.length > 0 ? Number(rsiValues[rsiValues.length - 1].toFixed(2)) : 50;
    const prevRsi = rsiValues.length > 1 ? Number(rsiValues[rsiValues.length - 2].toFixed(2)) : currentRsi;

    // 2. Stochastic RSI (14, 14, 3, 3)
    let stochRsi = { k: 50, d: 50, isBullishCross: false, isBearishCross: false, isOversold: false, isOverbought: false };
    try {
      const stochValues = StochasticRSI.calculate({
        values: closes,
        rsiPeriod: 14,
        stochasticPeriod: 14,
        kPeriod: 3,
        dPeriod: 3
      });
      if (stochValues.length > 0) {
        const curr = stochValues[stochValues.length - 1];
        const prev = stochValues.length > 1 ? stochValues[stochValues.length - 2] : curr;
        const k = Number(curr.k.toFixed(2));
        const d = Number(curr.d.toFixed(2));
        stochRsi = {
          k,
          d,
          isBullishCross: prev.k <= prev.d && curr.k > curr.d && curr.k < 35,
          isBearishCross: prev.k >= prev.d && curr.k < curr.d && curr.k > 65,
          isOversold: k < 20,
          isOverbought: k > 80
        };
      }
    } catch {
      // fallback
    }

    // 3. MACD (12, 26, 9)
    const macdValues = MACD.calculate({
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false
    });
    const currentMacd = macdValues.length > 0 ? macdValues[macdValues.length - 1] : { MACD: 0, signal: 0, histogram: 0 };
    const prevMacd = macdValues.length > 1 ? macdValues[macdValues.length - 2] : currentMacd;
    const macdHist = Number(currentMacd.histogram?.toFixed(4) || 0);
    const prevMacdHist = Number(prevMacd.histogram?.toFixed(4) || 0);

    // 4. Bollinger Bands (20, 2)
    const bbValues = BollingerBands.calculate({ period: 20, values: closes, stdDev: 2 });
    const currentBb = bbValues.length > 0 ? bbValues[bbValues.length - 1] : { upper: 0, middle: 0, lower: 0 };
    const currentBandwidth = currentBb.middle ? ((currentBb.upper - currentBb.lower) / currentBb.middle) * 100 : 0;
    const percentB = (currentBb.upper - currentBb.lower) > 0 ? (closes[n - 1] - currentBb.lower) / (currentBb.upper - currentBb.lower) : 0.5;

    // 5. EMAs (9, 21, 50, 200)
    const ema9Values = EMA.calculate({ period: 9, values: closes });
    const ema21Values = EMA.calculate({ period: 21, values: closes });
    const ema50Values = EMA.calculate({ period: 50, values: closes });
    let ema200Values = [];
    if (closes.length >= 100) {
      ema200Values = EMA.calculate({ period: Math.min(200, closes.length), values: closes });
    }

    const ema9 = ema9Values.length > 0 ? ema9Values[ema9Values.length - 1] : closes[n - 1];
    const prevEma9 = ema9Values.length > 1 ? ema9Values[ema9Values.length - 2] : ema9;
    const ema21 = ema21Values.length > 0 ? ema21Values[ema21Values.length - 1] : closes[n - 1];
    const prevEma21 = ema21Values.length > 1 ? ema21Values[ema21Values.length - 2] : ema21;
    const ema50 = ema50Values.length > 0 ? ema50Values[ema50Values.length - 1] : closes[n - 1];
    const prevEma50 = ema50Values.length > 1 ? ema50Values[ema50Values.length - 2] : ema50;
    const ema200 = ema200Values.length > 0 ? ema200Values[ema200Values.length - 1] : ema50;

    // 6. ATR (14)
    const atrValues = ATR.calculate({ high: highs, low: lows, close: closes, period: 14 });
    const currentAtr = atrValues.length > 0 ? atrValues[atrValues.length - 1] : (closes[n - 1] * 0.015);
    const atrPct = Number(((currentAtr / closes[n - 1]) * 100).toFixed(2));

    // 7. ADX (14) with +DI & -DI
    let adxData = { adx: 25, pdi: 20, mdi: 20, isTrending: true, isStrongTrend: false, trendDirection: 'NEUTRAL' };
    try {
      const adxValues = ADX.calculate({ high: highs, low: lows, close: closes, period: 14 });
      if (adxValues.length > 0) {
        const lastAdx = adxValues[adxValues.length - 1];
        const adxVal = Number(lastAdx.adx?.toFixed(2) || 25);
        const pdi = Number(lastAdx.pdi?.toFixed(2) || 20);
        const mdi = Number(lastAdx.mdi?.toFixed(2) || 20);
        adxData = {
          adx: adxVal,
          pdi,
          mdi,
          isTrending: adxVal >= 25,
          isStrongTrend: adxVal >= 35,
          trendDirection: pdi > mdi + 3 ? 'BULLISH' : mdi > pdi + 3 ? 'BEARISH' : 'NEUTRAL'
        };
      }
    } catch {
      // keep fallback
    }

    // 8. Volume & OBV
    const volMaValues = SMA.calculate({ period: 20, values: volumes });
    const currentVolMa = volMaValues.length > 0 ? volMaValues[volMaValues.length - 1] : volumes[n - 1];
    const currentVolume = volumes[n - 1];
    const volumeSurgeRatio = currentVolMa > 0 ? currentVolume / currentVolMa : 1;

    let obvData = { isAccumulation: true, surge: false };
    try {
      const obvValues = OBV.calculate({ close: closes, volume: volumes });
      if (obvValues.length >= 10) {
        const lastObv = obvValues[obvValues.length - 1];
        const prevObv = obvValues[obvValues.length - 5];
        obvData = {
          current: lastObv,
          isAccumulation: lastObv > prevObv,
          surge: lastObv > prevObv * 1.15
        };
      }
    } catch {
      // fallback
    }

    // 9. SuperTrend
    const supertrend = this.calculateSuperTrend(candles, 10, 3.0);

    // 10. RSI Divergences
    const divergence = this.detectRsiDivergences(candles, rsiValues);

    // 11. Market Structure & Pivot Points
    const structure = this.calculateMarketStructure(candles, closes[n - 1]);

    // 12. Candlestick Price Action Patterns
    const candlePatterns = this.detectCandlePatterns(candles);

    // 13. Trap Detection (Bull Trap, Bear Trap, Falling Knife)
    const traps = this.detectTraps(candles, currentBb, structure, volumeSurgeRatio);

    // 14. Session VWAP (Volume-Weighted Average Price)
    let cumPv = 0;
    let cumVol = 0;
    const vwapWindow = candles.slice(-48);
    for (const c of vwapWindow) {
      const typicalPrice = (c.high + c.low + c.close) / 3;
      const vol = Math.max(0.0001, c.volume || 1);
      cumPv += typicalPrice * vol;
      cumVol += vol;
    }
    const vwapVal = cumVol > 0 ? cumPv / cumVol : closes[n - 1];
    const distFromVwapPct = vwapVal > 0 ? Number((((closes[n - 1] - vwapVal) / vwapVal) * 100).toFixed(2)) : 0;

    // 15. Momentum Velocity (ROC-5), Overextension (ATR distance from EMA21), & Candle Strength
    const prev5Close = n > 5 ? closes[n - 6] : closes[0];
    const roc5 = prev5Close > 0 ? Number((((closes[n - 1] - prev5Close) / prev5Close) * 100).toFixed(2)) : 0;
    const atrDistFromEma21 = Number(((closes[n - 1] - ema21) / Math.max(currentAtr, closes[n - 1] * 0.001)).toFixed(2));
    const currCandle = candles[n - 1];
    const cRange = Math.max(1e-9, currCandle.high - currCandle.low);
    const cBody = Math.abs(currCandle.close - currCandle.open);
    const last3 = candles.slice(-3);
    const candleStrength = {
      isBullishCandle: currCandle.close > currCandle.open,
      isBearishCandle: currCandle.close < currCandle.open,
      bodyRatio: Number((cBody / cRange).toFixed(2)),
      last3Bullish: last3.filter(c => c.close > c.open).length,
      last3Bearish: last3.filter(c => c.close < c.open).length
    };

    return {
      price: closes[n - 1],
      prevPrice: closes[n - 2],
      rsi: currentRsi,
      prevRsi,
      stochRsi,
      macd: {
        macd: Number(currentMacd.MACD?.toFixed(4) || 0),
        signal: Number(currentMacd.signal?.toFixed(4) || 0),
        histogram: macdHist,
        prevHistogram: prevMacdHist,
        crossover: (prevMacdHist <= 0 && macdHist > 0) ? 'BULLISH' : 
                   (prevMacdHist >= 0 && macdHist < 0) ? 'BEARISH' : 'NEUTRAL',
        isExpandingBullish: macdHist > 0 && macdHist > prevMacdHist,
        isContractingBearish: macdHist < 0 && macdHist > prevMacdHist
      },
      bollinger: {
        upper: Number(currentBb.upper?.toFixed(2) || 0),
        middle: Number(currentBb.middle?.toFixed(2) || 0),
        lower: Number(currentBb.lower?.toFixed(2) || 0),
        bandwidthPct: Number(currentBandwidth.toFixed(2)),
        percentB: Number(percentB.toFixed(2)),
        isSqueeze: currentBandwidth < 3.8
      },
      ema: {
        ema9: Number(ema9.toFixed(2)),
        ema21: Number(ema21.toFixed(2)),
        ema50: Number(ema50.toFixed(2)),
        ema200: Number(ema200.toFixed(2)),
        goldenCross: (prevEma9 <= prevEma21 && ema9 > ema21),
        deathCross: (prevEma9 >= prevEma21 && ema9 < ema21),
        macroGoldenCross: (prevEma50 <= ema200 && ema50 > ema200),
        macroDeathCross: (prevEma50 >= ema200 && ema50 < ema200),
        bullishAlignment: ema9 > ema21 && ema21 > ema50,
        bearishAlignment: ema9 < ema21 && ema21 < ema50,
        priceAboveEma200: closes[n - 1] > ema200
      },
      adx: adxData,
      atr: Number(currentAtr.toFixed(4)),
      atrPct,
      vwap: {
        value: Number(vwapVal.toFixed(4)),
        priceAboveVwap: closes[n - 1] >= vwapVal,
        distFromVwapPct
      },
      roc5,
      atrDistFromEma21,
      candleStrength,
      volume: {
        current: currentVolume,
        ma20: currentVolMa,
        surgeRatio: Number(volumeSurgeRatio.toFixed(2)),
        isHighVolume: volumeSurgeRatio > 1.35,
        obv: obvData
      },
      supertrend,
      divergence,
      structure,
      candlePatterns,
      traps
    };
  }

  /**
   * RSI Divergence Scanner
   */
  static detectRsiDivergences(candles, rsiValues) {
    if (!rsiValues || rsiValues.length < 20 || !candles || candles.length < 20) {
      return { detected: false, type: null, label: null, strength: null };
    }

    const n = candles.length;
    const rsiOffset = n - rsiValues.length;
    const lookback = Math.min(25, rsiValues.length - 2);
    const startIndex = n - lookback;

    let recentLowIdx = -1;
    let priorLowIdx = -1;
    let recentHighIdx = -1;
    let priorHighIdx = -1;

    // Find local lows
    for (let i = n - 2; i >= startIndex; i--) {
      if (candles[i].low <= candles[i - 1].low && candles[i].low <= candles[i + 1].low) {
        if (recentLowIdx === -1) {
          recentLowIdx = i;
        } else if (priorLowIdx === -1 && (recentLowIdx - i) >= 3) {
          priorLowIdx = i;
          break;
        }
      }
    }

    // Find local highs
    for (let i = n - 2; i >= startIndex; i--) {
      if (candles[i].high >= candles[i - 1].high && candles[i].high >= candles[i + 1].high) {
        if (recentHighIdx === -1) {
          recentHighIdx = i;
        } else if (priorHighIdx === -1 && (recentHighIdx - i) >= 3) {
          priorHighIdx = i;
          break;
        }
      }
    }

    // Regular Bullish Divergence (Price Lower Low or Double Bottom, RSI Higher Low)
    if (recentLowIdx !== -1 && priorLowIdx !== -1) {
      const pRecentLow = candles[recentLowIdx].low;
      const pPriorLow = candles[priorLowIdx].low;
      const rsiRecent = rsiValues[recentLowIdx - rsiOffset];
      const rsiPrior = rsiValues[priorLowIdx - rsiOffset];

      if (rsiRecent !== undefined && rsiPrior !== undefined) {
        if (pRecentLow <= pPriorLow * 1.002 && rsiRecent >= rsiPrior + 1.8 && rsiRecent < 48) {
          return {
            detected: true,
            type: 'BULLISH_REGULAR',
            label: `Bullish Divergence (RSI ${rsiRecent.toFixed(0)} vs ${rsiPrior.toFixed(0)})`,
            strength: rsiRecent < 35 ? 'HIGH' : 'MEDIUM'
          };
        }
        if (pRecentLow > pPriorLow * 1.005 && rsiRecent < rsiPrior - 2.5 && rsiRecent < 55) {
          return {
            detected: true,
            type: 'BULLISH_HIDDEN',
            label: 'Hidden Bullish Divergence (Trend Continuation)',
            strength: 'MEDIUM'
          };
        }
      }
    }

    // Regular Bearish Divergence (Price Higher High or Double Top, RSI Lower High)
    if (recentHighIdx !== -1 && priorHighIdx !== -1) {
      const pRecentHigh = candles[recentHighIdx].high;
      const pPriorHigh = candles[priorHighIdx].high;
      const rsiRecent = rsiValues[recentHighIdx - rsiOffset];
      const rsiPrior = rsiValues[priorHighIdx - rsiOffset];

      if (rsiRecent !== undefined && rsiPrior !== undefined) {
        if (pRecentHigh >= pPriorHigh * 0.998 && rsiRecent <= rsiPrior - 1.8 && rsiRecent > 52) {
          return {
            detected: true,
            type: 'BEARISH_REGULAR',
            label: `Bearish Divergence (RSI ${rsiRecent.toFixed(0)} vs ${rsiPrior.toFixed(0)})`,
            strength: rsiRecent > 65 ? 'HIGH' : 'MEDIUM'
          };
        }
        if (pRecentHigh < pPriorHigh * 0.995 && rsiRecent > rsiPrior + 2.5 && rsiRecent > 45) {
          return {
            detected: true,
            type: 'BEARISH_HIDDEN',
            label: 'Hidden Bearish Divergence (Trend Continuation)',
            strength: 'MEDIUM'
          };
        }
      }
    }

    return { detected: false, type: null, label: null, strength: null };
  }

  /**
   * Market Structure & Pivot Points Calculator
   */
  static calculateMarketStructure(candles, currentPrice) {
    if (!candles || candles.length < 20) {
      return {
        support: currentPrice * 0.98,
        resistance: currentPrice * 1.02,
        pivot: currentPrice,
        distToSupportPct: 2.0,
        distToResistancePct: 2.0,
        status: 'RANGING',
        isTestingSupport: false,
        isTestingResistance: false
      };
    }

    const n = candles.length;
    const lookback = Math.min(30, n);
    const slice = candles.slice(n - lookback);

    const high = Math.max(...slice.map(c => c.high));
    const low = Math.min(...slice.map(c => c.low));
    const close = candles[n - 1].close;

    // Classic Pivot Points
    const pp = (high + low + close) / 3;
    const r1 = (2 * pp) - low;
    const s1 = (2 * pp) - high;
    const r2 = pp + (high - low);
    const s2 = pp - (high - low);

    const swingHigh = high;
    const swingLow = low;

    const distToSupportPct = Number((((currentPrice - swingLow) / currentPrice) * 100).toFixed(2));
    const distToResistancePct = Number((((swingHigh - currentPrice) / currentPrice) * 100).toFixed(2));

    const isTestingSupport = currentPrice <= swingLow * 1.012 || currentPrice <= s1 * 1.008;
    const isTestingResistance = currentPrice >= swingHigh * 0.988 || currentPrice >= r1 * 0.992;

    let status = 'RANGING';
    if (currentPrice >= swingHigh * 0.998) status = 'BREAKOUT_RESISTANCE';
    else if (currentPrice <= swingLow * 1.002) status = 'BREAKDOWN_SUPPORT';
    else if (isTestingSupport) status = 'TESTING_SUPPORT';
    else if (isTestingResistance) status = 'TESTING_RESISTANCE';

    return {
      pivot: Number(pp.toFixed(4)),
      support: Number(swingLow.toFixed(4)),
      resistance: Number(swingHigh.toFixed(4)),
      s1: Number(s1.toFixed(4)),
      r1: Number(r1.toFixed(4)),
      s2: Number(s2.toFixed(4)),
      r2: Number(r2.toFixed(4)),
      distToSupportPct,
      distToResistancePct,
      status,
      isTestingSupport,
      isTestingResistance
    };
  }

  /**
   * Candlestick Pattern Recognition
   */
  static detectCandlePatterns(candles) {
    if (!candles || candles.length < 2) return [];
    const curr = candles[candles.length - 1];
    const prev = candles[candles.length - 2];

    const patterns = [];
    const currBody = Math.abs(curr.close - curr.open);
    const currRange = curr.high - curr.low;

    if (currRange === 0) return patterns;

    const upperWick = curr.high - Math.max(curr.open, curr.close);
    const lowerWick = Math.min(curr.open, curr.close) - curr.low;

    // Hammer / Lower Rejection Pin
    if (lowerWick >= 2.0 * currBody && upperWick <= 0.35 * currRange && currRange > 0) {
      patterns.push({ name: 'Bullish Hammer / Lower Rejection Pin', type: 'BULLISH', weight: 15 });
    }

    // Shooting Star / Upper Rejection Pin
    if (upperWick >= 2.0 * currBody && lowerWick <= 0.35 * currRange && currRange > 0) {
      patterns.push({ name: 'Shooting Star / Upper Rejection Pin', type: 'BEARISH', weight: 15 });
    }

    // Bullish Engulfing
    if (prev.close < prev.open && curr.close > curr.open && curr.close >= prev.open && curr.open <= prev.close) {
      patterns.push({ name: 'Bullish Engulfing Candle', type: 'BULLISH', weight: 18 });
    }

    // Bearish Engulfing
    if (prev.close > prev.open && curr.close < curr.open && curr.close <= prev.open && curr.open >= prev.close) {
      patterns.push({ name: 'Bearish Engulfing Candle', type: 'BEARISH', weight: 18 });
    }

    return patterns;
  }

  /**
   * Trap & Fakeout Detection
   */
  static detectTraps(candles, bb, structure, volumeSurgeRatio) {
    if (!candles || candles.length < 3) return { isBullTrap: false, isBearTrap: false, isFallingKnife: false, alert: null };

    const curr = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const pprev = candles[candles.length - 3];

    // Bull Trap
    const testedHigh = Math.max(prev.high, curr.high);
    const isBullTrap = (testedHigh >= structure.resistance || (bb.upper && testedHigh >= bb.upper)) &&
                       curr.close < structure.resistance &&
                       (curr.close < curr.open || curr.high - Math.max(curr.open, curr.close) > curr.close - curr.open);

    // Bear Trap
    const testedLow = Math.min(prev.low, curr.low);
    const isBearTrap = (testedLow <= structure.support || (bb.lower && testedLow <= bb.lower)) &&
                       curr.close > structure.support &&
                       curr.close > curr.open;

    // Falling Knife
    const isConsecutiveRed = curr.close < curr.open && prev.close < prev.open && pprev.close < pprev.open;
    const dropPct = ((pprev.open - curr.close) / pprev.open) * 100;
    const lowerWick = Math.min(curr.open, curr.close) - curr.low;
    const body = curr.open - curr.close;
    const isFallingKnife = isConsecutiveRed && dropPct > 2.0 && volumeSurgeRatio > 1.4 && lowerWick < (body * 0.3);

    let alert = null;
    if (isBullTrap) alert = 'BULL TRAP FAKEOUT (Resistance Rejection)';
    else if (isBearTrap) alert = 'BEAR TRAP / LIQUIDITY SWEEP (Support Reclaim)';
    else if (isFallingKnife) alert = 'FALLING KNIFE (High Momentum Dump - Avoid Longs)';

    return {
      isBullTrap,
      isBearTrap,
      isFallingKnife,
      alert
    };
  }

  /**
   * Authentic SuperTrend calculation with trailing bands (TradingView standard)
   */
  static calculateSuperTrend(candles, period = 10, multiplier = 3.0) {
    if (!candles || candles.length < period + 2) return { direction: 'BULLISH', value: 0 };
    
    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);

    const atrValues = ATR.calculate({ high: highs, low: lows, close: closes, period });
    if (!atrValues.length) return { direction: 'BULLISH', value: 0 };

    let prevUpper = 0;
    let prevLower = 0;
    let prevClose = closes[0];
    let direction = 'BULLISH';

    const offset = candles.length - atrValues.length;

    for (let i = 0; i < atrValues.length; i++) {
      const candleIdx = i + offset;
      const c = candles[candleIdx];
      const atr = atrValues[i];
      const hl2 = (c.high + c.low) / 2;

      const basicUpper = hl2 + (multiplier * atr);
      const basicLower = hl2 - (multiplier * atr);

      const finalUpper = (basicUpper < prevUpper || prevClose > prevUpper) ? basicUpper : prevUpper;
      const finalLower = (basicLower > prevLower || prevClose < prevLower) ? basicLower : prevLower;

      if (c.close > prevUpper) {
        direction = 'BULLISH';
      } else if (c.close < prevLower) {
        direction = 'BEARISH';
      }

      prevUpper = finalUpper;
      prevLower = finalLower;
      prevClose = c.close;
    }

    return {
      direction,
      value: Number((direction === 'BULLISH' ? prevLower : prevUpper).toFixed(2))
    };
  }
}
