import { CONFIG } from '../config.js';
import { paperTrading } from './paperTradingService.js';
import { binanceService } from './binanceService.js';

export class MarginGuardian {
  constructor(io) {
    this.io = io; // Socket.io instance for instant push notifications
    this.enabled = true;
    this.criticalMarginRatio = CONFIG.MARGIN_GUARDIAN.DEFAULT_CRITICAL_MARGIN_RATIO; // e.g. 80%
    this.defaultStopLossPct = CONFIG.MARGIN_GUARDIAN.DEFAULT_STOP_LOSS_PCT;           // e.g. 4.5%
    this.defaultTakeProfitPct = CONFIG.MARGIN_GUARDIAN.DEFAULT_TAKE_PROFIT_PCT;       // e.g. 9.0%
    this.trailingStopPct = CONFIG.MARGIN_GUARDIAN.DEFAULT_TRAILING_STOP_PCT;         // e.g. 2.0%
    this.maxAccountDrawdownPct = CONFIG.MARGIN_GUARDIAN.MAX_ACCOUNT_DRAWDOWN_PCT;    // e.g. 15%
    this.alertLogs = [];
    this.positionTargets = {}; // { [positionKey]: { tp, sl, trailingStopPct, highestRoePct } }
  }

  setSettings(settings) {
    if (settings.enabled !== undefined) this.enabled = Boolean(settings.enabled);
    if (settings.criticalMarginRatio !== undefined) this.criticalMarginRatio = Number(settings.criticalMarginRatio);
    if (settings.defaultStopLossPct !== undefined) this.defaultStopLossPct = Number(settings.defaultStopLossPct);
    if (settings.defaultTakeProfitPct !== undefined) this.defaultTakeProfitPct = Number(settings.defaultTakeProfitPct);
    if (settings.trailingStopPct !== undefined) this.trailingStopPct = Number(settings.trailingStopPct);
    if (settings.maxAccountDrawdownPct !== undefined) this.maxAccountDrawdownPct = Number(settings.maxAccountDrawdownPct);

    return this.getSettings();
  }

  getSettings() {
    return {
      enabled: this.enabled,
      criticalMarginRatio: this.criticalMarginRatio,
      defaultStopLossPct: this.defaultStopLossPct,
      defaultTakeProfitPct: this.defaultTakeProfitPct,
      trailingStopPct: this.trailingStopPct,
      maxAccountDrawdownPct: this.maxAccountDrawdownPct,
      recentAlerts: this.alertLogs.slice(0, 30)
    };
  }

  /**
   * Set or update specific TP/SL targets for a position (Paper or Live)
   */
  setTarget(positionIdOrSymbol, { tp, sl, trailingStopPct }) {
    if (!positionIdOrSymbol) return;
    this.positionTargets[positionIdOrSymbol] = {
      tp: tp ? Number(tp) : null,
      sl: sl ? Number(sl) : null,
      trailingStopPct: trailingStopPct ? Number(trailingStopPct) : this.trailingStopPct,
      highestRoePct: 0
    };
  }

  /**
   * Monitor all open positions (Live and Demo) and execute auto-close when TP, SL, Trailing Stop, or Critical Margin is hit
   */
  async evaluatePositions(positions, priceMap, isLive = false) {
    if (!this.enabled || !positions || positions.length === 0) return [];

    const closedActions = [];

    for (const pos of positions) {
      const currentPrice = priceMap[pos.symbol] || pos.currentPrice;
      if (!currentPrice || currentPrice <= 0) continue;

      const target = this.positionTargets[pos.id] || this.positionTargets[pos.symbol] || {};
      const tp = target.tp || pos.tp;
      const sl = target.sl || pos.sl;
      const trailPct = target.trailingStopPct || pos.trailingStopPct || this.trailingStopPct;

      let shouldClose = false;
      let closeReason = '';
      let triggerDetail = '';

      // 1. CRITICAL MARGIN RATIO AUTO-CLOSE ("Margin Got Time Auto Close")
      if (pos.marginRatio >= this.criticalMarginRatio) {
        shouldClose = true;
        closeReason = 'MARGIN_GUARDIAN_AUTO_CLOSE';
        triggerDetail = `Margin Ratio reached ${pos.marginRatio}% (Threshold: ${this.criticalMarginRatio}%). Closed early to prevent liquidation!`;
      }

      // 2. TAKE-PROFIT CHECK (Exact Target Price or Default ROE %)
      if (!shouldClose) {
        if (tp) {
          if (pos.side === 'LONG' && currentPrice >= tp) {
            shouldClose = true;
            closeReason = 'AUTO_TAKE_PROFIT';
            triggerDetail = `Take-Profit reached! Mark Price $${currentPrice} >= TP target $${tp}`;
          } else if (pos.side === 'SHORT' && currentPrice <= tp) {
            shouldClose = true;
            closeReason = 'AUTO_TAKE_PROFIT';
            triggerDetail = `Take-Profit reached! Mark Price $${currentPrice} <= TP target $${tp}`;
          }
        }

        // Also check target TP percentage
        const tpPct = tp && pos.entryPrice ? Math.abs(((tp - pos.entryPrice) / pos.entryPrice) * 100 * pos.leverage) : this.defaultTakeProfitPct;
        if (!shouldClose && pos.roePct >= tpPct) {
          shouldClose = true;
          closeReason = 'AUTO_TAKE_PROFIT';
          triggerDetail = `Take-Profit reached at +${pos.roePct.toFixed(2)}% ROE (Target TP: +${tpPct.toFixed(1)}%)`;
        }
      }

      // 3. STOP-LOSS CHECK (Exact Target Price or Default ROE %)
      if (!shouldClose) {
        if (sl) {
          if (pos.side === 'LONG' && currentPrice <= sl) {
            shouldClose = true;
            closeReason = 'AUTO_STOP_LOSS';
            triggerDetail = `Stop-Loss hit! Mark Price $${currentPrice} <= SL target $${sl}`;
          } else if (pos.side === 'SHORT' && currentPrice >= sl) {
            shouldClose = true;
            closeReason = 'AUTO_STOP_LOSS';
            triggerDetail = `Stop-Loss hit! Mark Price $${currentPrice} >= SL target $${sl}`;
          }
        }

        // Also check target SL percentage
        const slPct = sl && pos.entryPrice ? Math.abs(((pos.entryPrice - sl) / pos.entryPrice) * 100 * pos.leverage) : this.defaultStopLossPct;
        if (!shouldClose && pos.roePct <= -slPct) {
          shouldClose = true;
          closeReason = 'AUTO_STOP_LOSS';
          triggerDetail = `Stop-Loss hit at ${pos.roePct.toFixed(2)}% ROE (Target SL: -${slPct.toFixed(1)}%)`;
        }
      }

      // 4. TRAILING STOP-LOSS CHECK
      if (!shouldClose) {
        target.highestRoePct = Math.max(target.highestRoePct || 0, pos.roePct || 0);
        if (target.highestRoePct >= 2.5) { // activate trailing stop when trade reaches +2.5% profit
          const pullback = target.highestRoePct - pos.roePct;
          if (pullback >= trailPct) {
            shouldClose = true;
            closeReason = 'TRAILING_STOP_LOCK';
            triggerDetail = `Trailing stop triggered. Peak was +${target.highestRoePct.toFixed(2)}% ROE, pulled back ${pullback.toFixed(2)}% (Trail: ${trailPct}%)`;
          }
        }
      }

      // EXECUTE AUTO-CLOSE IF TRIGGERED
      if (shouldClose) {
        try {
          const isLivePos = isLive || pos.source === 'BINANCE_LIVE' || (pos.id && pos.id.startsWith('BINANCE-'));
          let closedResult = null;

          if (isLivePos && binanceService.liveExchange) {
            console.log(`[Margin Guardian] AUTO-CLOSING LIVE BINANCE POSITION: ${pos.symbol} (${closeReason}) - ${triggerDetail}`);
            await binanceService.closeLivePosition({
              symbol: pos.symbol,
              side: pos.side,
              size: pos.size
            });

            // Wipe cache for instant fresh state
            binanceService._cachedLivePositions = null;
            binanceService._lastPosTime = 0;
            binanceService._cachedLiveBal = null;
            binanceService._lastBalTime = 0;

            closedResult = {
              id: pos.id,
              symbol: pos.symbol,
              side: pos.side,
              realizedPnl: pos.unrealizedPnl || 0,
              roePct: pos.roePct || 0,
              exitPrice: currentPrice,
              reason: closeReason
            };
          } else {
            console.log(`[Margin Guardian] AUTO-CLOSING DEMO POSITION: ${pos.symbol} (${closeReason}) - ${triggerDetail}`);
            closedResult = paperTrading.closePosition(pos.id, currentPrice, closeReason);
          }

          delete this.positionTargets[pos.id];
          delete this.positionTargets[pos.symbol];

          const alertRecord = {
            id: `ALERT-${Date.now()}`,
            timestamp: new Date().toISOString(),
            symbol: pos.symbol,
            side: pos.side,
            reason: closeReason,
            detail: triggerDetail,
            pnl: closedResult.realizedPnl,
            roePct: closedResult.roePct,
            exitPrice: closedResult.exitPrice
          };

          this.alertLogs.unshift(alertRecord);
          closedActions.push(alertRecord);

          // Broadcast alerts & position closures via WebSocket
          if (this.io) {
            this.io.emit('margin_guardian_alert', alertRecord);
            this.io.emit('position_closed', closedResult);
            if (isLivePos) {
              const liveBal = await binanceService.getLiveBalance();
              const livePos = await binanceService.getLivePositions();
              if (liveBal) this.io.emit('account_summary', liveBal);
              this.io.emit('positions_update', livePos || []);
            } else {
              this.io.emit('account_summary', paperTrading.getBalance());
              this.io.emit('positions_update', paperTrading.positions);
            }
          }
        } catch (err) {
          console.error(`[Margin Guardian] Error auto-closing position ${pos.id}:`, err.message);
        }
      }
    }

    return closedActions;
  }
}
