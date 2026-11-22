import { binanceService } from './binanceService.js';
import { IndicatorService } from './indicatorService.js';

export class BacktestEngine {
  /**
   * Run historical simulation for any strategy
   */
  static async run({
    strategyId = 'trend_following',
    symbol = 'BTCUSDT',
    timeframe = '15m',
    initialCapital = 10000,
    allocationPerTrade = 1000,
    leverage = 10,
    stopLossPct = 4.0,
    takeProfitPct = 8.0,
    marginAutoCloseRatio = 80,
    candleCount = 150
  }) {
    // 1. Fetch historical candles
    const candles = await binanceService.fetchKlines(symbol, timeframe, candleCount);
    if (!candles || candles.length < 50) {
      throw new Error(`Insufficient historical candle data for ${symbol}`);
    }

    let equity = initialCapital;
    let peakEquity = initialCapital;
    let maxDrawdown = 0;
    let activePosition = null; // { side, entryPrice, size, margin, entryTime }
    const trades = [];
    const equityCurve = [{ time: candles[30].time, equity: initialCapital }];

    // 2. Step through historical candles bar-by-bar
    for (let i = 30; i < candles.length; i++) {
      const slice = candles.slice(0, i + 1);
      const currentCandle = candles[i];
      const indicators = IndicatorService.calculateAll(slice);
      if (!indicators) continue;

      const currentPrice = currentCandle.close;

      // Check active position for exit conditions
      if (activePosition) {
        let shouldExit = false;
        let exitReason = '';
        let exitPrice = currentPrice;

        // Unrealized PnL
        let pnl = 0;
        if (activePosition.side === 'LONG') {
          pnl = (currentPrice - activePosition.entryPrice) * activePosition.size;
        } else {
          pnl = (activePosition.entryPrice - currentPrice) * activePosition.size;
        }
        const roePct = (pnl / activePosition.margin) * 100;

        // Check Margin Ratio
        const positionMarginBalance = Math.max(0.01, activePosition.margin + pnl);
        const maintenanceMargin = activePosition.size * currentPrice * 0.005;
        const marginRatio = (maintenanceMargin / positionMarginBalance) * 100;

        // A. Critical Margin Auto-Close Guardian
        if (marginRatio >= marginAutoCloseRatio) {
          shouldExit = true;
          exitReason = 'MARGIN_GUARDIAN_AUTO_CLOSE';
        }
        // B. Stop Loss
        else if (roePct <= -stopLossPct) {
          shouldExit = true;
          exitReason = 'STOP_LOSS';
        }
        // C. Take Profit
        else if (roePct >= takeProfitPct) {
          shouldExit = true;
          exitReason = 'TAKE_PROFIT';
        }

        if (shouldExit) {
          equity += pnl;
          trades.push({
            id: `BT-${trades.length + 1}`,
            symbol,
            side: activePosition.side,
            entryPrice: activePosition.entryPrice,
            exitPrice,
            size: activePosition.size,
            margin: activePosition.margin,
            pnl: Number(pnl.toFixed(2)),
            roePct: Number(roePct.toFixed(2)),
            reason: exitReason,
            entryTime: activePosition.entryTime,
            exitTime: currentCandle.time
          });
          activePosition = null;
        }
      }

      // If no active position, check for entry signal
      if (!activePosition) {
        const signal = this.evaluateSignal(strategyId, indicators);
        if (signal.action === 'LONG' || signal.action === 'SHORT') {
          const margin = Math.min(allocationPerTrade, equity * 0.5);
          if (margin > 10) {
            const positionValue = margin * leverage;
            const size = positionValue / currentPrice;

            activePosition = {
              side: signal.action,
              entryPrice: currentPrice,
              size,
              margin,
              entryTime: currentCandle.time,
              signalDetail: signal.rationale
            };
          }
        }
      }

      // Track equity curve & max drawdown
      if (equity > peakEquity) peakEquity = equity;
      const dd = peakEquity - equity;
      if (dd > maxDrawdown) maxDrawdown = dd;

      equityCurve.push({
        time: currentCandle.time,
        equity: Number(equity.toFixed(2))
      });
    }

    // Close any dangling position at final price
    if (activePosition) {
      const lastCandle = candles[candles.length - 1];
      const pnl = activePosition.side === 'LONG' ?
        (lastCandle.close - activePosition.entryPrice) * activePosition.size :
        (activePosition.entryPrice - lastCandle.close) * activePosition.size;
      equity += pnl;
      trades.push({
        id: `BT-${trades.length + 1}`,
        symbol,
        side: activePosition.side,
        entryPrice: activePosition.entryPrice,
        exitPrice: lastCandle.close,
        size: activePosition.size,
        margin: activePosition.margin,
        pnl: Number(pnl.toFixed(2)),
        roePct: Number(((pnl / activePosition.margin) * 100).toFixed(2)),
        reason: 'BACKTEST_END_CLOSE',
        entryTime: activePosition.entryTime,
        exitTime: lastCandle.time
      });
    }

    // Performance Calculations
    const totalTrades = trades.length;
    const winningTrades = trades.filter(t => t.pnl > 0).length;
    const losingTrades = trades.filter(t => t.pnl <= 0).length;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

    const totalProfit = trades.filter(t => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0);
    const totalLoss = Math.abs(trades.filter(t => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0));
    const profitFactor = totalLoss > 0 ? (totalProfit / totalLoss) : (totalProfit > 0 ? 99.9 : 1.0);

    const netProfit = equity - initialCapital;
    const netProfitPct = (netProfit / initialCapital) * 100;
    const maxDrawdownPct = peakEquity > 0 ? (maxDrawdown / peakEquity) * 100 : 0;

    // Sharpe Ratio approximation
    const returns = trades.map(t => t.roePct);
    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const variance = returns.length > 1 ? returns.reduce((a, b) => a + Math.pow(b - avgReturn, 2), 0) / (returns.length - 1) : 0;
    const stdDev = Math.sqrt(variance);
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) : 0;

    return {
      strategyId,
      symbol,
      timeframe,
      initialCapital,
      finalEquity: Number(equity.toFixed(2)),
      netProfit: Number(netProfit.toFixed(2)),
      netProfitPct: Number(netProfitPct.toFixed(2)),
      totalTrades,
      winningTrades,
      losingTrades,
      winRate: Number(winRate.toFixed(1)),
      profitFactor: Number(profitFactor.toFixed(2)),
      maxDrawdown: Number(maxDrawdown.toFixed(2)),
      maxDrawdownPct: Number(maxDrawdownPct.toFixed(2)),
      sharpeRatio: Number(sharpeRatio.toFixed(2)),
      equityCurve,
      trades: trades.slice(-30).reverse() // recent 30 trades
    };
  }

  static evaluateSignal(strategyId, ind) {
    const { price, rsi, macd, bollinger, ema, adx, volume, supertrend } = ind;
    switch (strategyId) {
      case 'trend_following':
        if (ema.goldenCross && adx.adx > 20) return { action: 'LONG', rationale: 'EMA 9/21 Golden Cross' };
        if (ema.deathCross && adx.adx > 20) return { action: 'SHORT', rationale: 'EMA 9/21 Death Cross' };
        break;
      case 'breakout_trading':
        if (price > bollinger.upper && volume.surgeRatio >= 1.25) return { action: 'LONG', rationale: 'Bollinger Breakout High' };
        if (price < bollinger.lower && volume.surgeRatio >= 1.25) return { action: 'SHORT', rationale: 'Bollinger Breakdown Low' };
        break;
      case 'mean_reversion':
        if (rsi < 32 && price <= bollinger.lower) return { action: 'LONG', rationale: 'Oversold BB bounce' };
        if (rsi > 68 && price >= bollinger.upper) return { action: 'SHORT', rationale: 'Overbought BB bounce' };
        break;
      case 'momentum_scalper':
        if (macd.crossover === 'BULLISH' && rsi > 52) return { action: 'LONG', rationale: 'MACD Bullish Cross' };
        if (macd.crossover === 'BEARISH' && rsi < 48) return { action: 'SHORT', rationale: 'MACD Bearish Cross' };
        break;
      case 'swing_trader':
        if (supertrend.direction === 'BULLISH' && price > ema.ema50) return { action: 'LONG', rationale: 'SuperTrend Bullish Wave' };
        if (supertrend.direction === 'BEARISH' && price < ema.ema50) return { action: 'SHORT', rationale: 'SuperTrend Bearish Wave' };
        break;
      case 'ai_sentiment_ml':
      default:
        if (ema.goldenCross || (rsi < 35 && macd.histogram > 0)) return { action: 'LONG', rationale: 'AI Confluence Bullish' };
        if (ema.deathCross || (rsi > 65 && macd.histogram < 0)) return { action: 'SHORT', rationale: 'AI Confluence Bearish' };
        break;
    }
    return { action: 'HOLD' };
  }
}
