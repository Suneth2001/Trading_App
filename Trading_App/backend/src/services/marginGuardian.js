import { CONFIG } from '../config.js';
import { paperTrading } from './paperTradingService.js';
import { binanceService } from './binanceService.js';

export class MarginGuardian {
  constructor(io) {
    this.io = io;
    this.enabled = true;
    this.criticalMarginRatio = CONFIG.MARGIN_GUARDIAN.DEFAULT_CRITICAL_MARGIN_RATIO; // 80%
    this.defaultStopLossPct = CONFIG.MARGIN_GUARDIAN.DEFAULT_STOP_LOSS_PCT;           // 4.5% ROE
    this.defaultTakeProfitPct = 10.0;                                                // +10.0% ROE realistic leveraged TP
    this.trailingStopPct = 1.5;                                                      // 1.5% tight trailing pullback
    this.breakevenTriggerPct = 3.5;                                                  // Lock fee-covered profit once +3.5% ROE reached
    this.smartProfitLockEnabled = true;                                              // Stepped profit-lock ratchet
    this.maxTpRoeCapPct = 16.0;                                                      // Cap distant unleveraged TP targets
    this.maxAccountDrawdownPct = CONFIG.MARGIN_GUARDIAN.MAX_ACCOUNT_DRAWDOWN_PCT;    // 15%
    this.alertLogs = [];
    this.positionTargets = {}; // { [positionKey]: { tp, sl, trailingStopPct, highestRoePct } }
  }

  setSettings(settings) {
    if (settings.enabled !== undefined) this.enabled = Boolean(settings.enabled);
    if (settings.criticalMarginRatio !== undefined) this.criticalMarginRatio = Number(settings.criticalMarginRatio);
    if (settings.defaultStopLossPct !== undefined) this.defaultStopLossPct = Number(settings.defaultStopLossPct);
    if (settings.defaultTakeProfitPct !== undefined) this.defaultTakeProfitPct = Number(settings.defaultTakeProfitPct);
    if (settings.trailingStopPct !== undefined) this.trailingStopPct = Number(settings.trailingStopPct);
    if (settings.breakevenTriggerPct !== undefined) this.breakevenTriggerPct = Number(settings.breakevenTriggerPct);
    if (settings.smartProfitLockEnabled !== undefined) this.smartProfitLockEnabled = Boolean(settings.smartProfitLockEnabled);
    if (settings.maxTpRoeCapPct !== undefined) this.maxTpRoeCapPct = Number(settings.maxTpRoeCapPct);
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
      breakevenTriggerPct: this.breakevenTriggerPct,
      smartProfitLockEnabled: this.smartProfitLockEnabled,
      maxTpRoeCapPct: this.maxTpRoeCapPct,
      maxAccountDrawdownPct: this.maxAccountDrawdownPct,
      recentAlerts: this.alertLogs.slice(0, 30)
    };
  }

  /**
   * Set or update specific TP/SL targets for a position (Paper or Live)
   */
  setTarget(positionIdOrSymbol, { tp, sl, trailingStopPct }) {
    if (!positionIdOrSymbol) return;
    const prev = this.positionTargets[positionIdOrSymbol] || {};
    this.positionTargets[positionIdOrSymbol] = {
      tp: tp ? Number(tp) : (prev.tp || null),
      sl: sl ? Number(sl) : (prev.sl || null),
      trailingStopPct: trailingStopPct ? Number(trailingStopPct) : (prev.trailingStopPct || this.trailingStopPct),
      highestRoePct: prev.highestRoePct || 0
    };
  }

  /**
   * Persistent peak ROE tracking + stepped fee-aware Profit-Lock ratchet
   */
  getProfitLockState(pos) {
    if (!this.positionTargets[pos.id]) {
      const symTarget = this.positionTargets[pos.symbol] || {};
      this.positionTargets[pos.id] = {
        tp: pos.tp || symTarget.tp || null,
        sl: pos.sl || symTarget.sl || null,
        trailingStopPct: pos.trailingStopPct || symTarget.trailingStopPct || this.trailingStopPct,
        highestRoePct: Math.max(pos.highestPnlPct || 0, pos.roePct || 0, 0)
      };
    }

    const target = this.positionTargets[pos.id];
    const currentRoe = Number(pos.roePct || 0);
    const peakRoe = Math.max(target.highestRoePct || 0, pos.highestPnlPct || 0, currentRoe, 0);
    target.highestRoePct = Number(peakRoe.toFixed(2));
    pos.highestPnlPct = target.highestRoePct;
    pos.peakRoePct = target.highestRoePct;

    // Fee-covered minimum floor: ~0.12% round-trip notional cost * leverage (e.g. 1.2% ROE at 10x)
    const leverage = Number(pos.leverage || 10);
    const feeFloorRoe = Number(Math.max(1.0, 0.12 * leverage).toFixed(2));
    const baseTrail = Number(target.trailingStopPct || pos.trailingStopPct || this.trailingStopPct || 1.5);

    let lockedFloorPct = null;
    let dynamicTrailPct = baseTrail;

    if (this.smartProfitLockEnabled) {
      if (peakRoe >= 20) {
        lockedFloorPct = 15.5;
        dynamicTrailPct = Math.min(baseTrail, 2.0);
      } else if (peakRoe >= 14) {
        lockedFloorPct = 10.5;
        dynamicTrailPct = Math.min(baseTrail, 1.8);
      } else if (peakRoe >= 9) {
        lockedFloorPct = 6.2;
        dynamicTrailPct = Math.min(baseTrail, 1.5);
      } else if (peakRoe >= 6) {
        lockedFloorPct = 3.6;
        dynamicTrailPct = Math.min(baseTrail, 1.4);
      } else if (peakRoe >= this.breakevenTriggerPct) {
        lockedFloorPct = Number(Math.max(1.2, feeFloorRoe + 0.3).toFixed(2));
        dynamicTrailPct = Math.min(baseTrail, 1.5);
      }
    }

    pos.profitLockFloorPct = lockedFloorPct;
    return { target, peakRoe, feeFloorRoe, lockedFloorPct, dynamicTrailPct };
  }

  /**
   * Monitor all open positions (Live & Demo) and lock profits / protect capital automatically
   */
  async evaluatePositions(positions, priceMap, isLive = false, marketSnapshotMap = null) {
    if (!this.enabled || !positions || positions.length === 0) return [];

    const closedActions = [];

    for (const pos of positions) {
      const currentPrice = priceMap[pos.symbol] || pos.currentPrice;
      if (!currentPrice || currentPrice <= 0) continue;

      const { target, peakRoe, feeFloorRoe, lockedFloorPct, dynamicTrailPct } = this.getProfitLockState(pos);
      const symTarget = this.positionTargets[pos.symbol] || {};
      const tp = target.tp || pos.tp || symTarget.tp;
      const sl = target.sl || pos.sl || symTarget.sl;
      const currentRoe = Number(pos.roePct || 0);

      let shouldClose = false;
      let closeReason = '';
      let triggerDetail = '';

      // 1. CRITICAL MARGIN RATIO AUTO-CLOSE
      if (pos.marginRatio >= this.criticalMarginRatio) {
        shouldClose = true;
        closeReason = 'MARGIN_GUARDIAN_AUTO_CLOSE';
        triggerDetail = `Margin Ratio reached ${pos.marginRatio}% (Threshold: ${this.criticalMarginRatio}%). Closed early to prevent liquidation!`;
      }

      // 2. REALISTIC LEVERAGED TAKE-PROFIT CHECK
      if (!shouldClose) {
        const rawTpRoe = tp && pos.entryPrice
          ? Math.abs(((tp - pos.entryPrice) / pos.entryPrice) * 100 * (pos.leverage || 10))
          : this.defaultTakeProfitPct;
        const effectiveTpRoe = Math.min(rawTpRoe, Math.max(this.defaultTakeProfitPct, this.maxTpRoeCapPct));

        if (tp && ((pos.side === 'LONG' && currentPrice >= tp) || (pos.side === 'SHORT' && currentPrice <= tp))) {
          shouldClose = true;
          closeReason = 'AUTO_TAKE_PROFIT';
          triggerDetail = `Take-Profit reached! Mark Price $${currentPrice} >= TP $${tp} (+${currentRoe.toFixed(2)}% ROE)`;
        } else if (currentRoe >= effectiveTpRoe) {
          shouldClose = true;
          closeReason = 'AUTO_TAKE_PROFIT';
          triggerDetail = `Take-Profit secured at +${currentRoe.toFixed(2)}% ROE (Target: +${effectiveTpRoe.toFixed(1)}%)`;
        }
      }

      // 3. STEPPED PROFIT-LOCK & TRAILING PROFIT LOCK (NEVER LET A WINNER TURN RED)
      if (!shouldClose && lockedFloorPct !== null) {
        const pullback = peakRoe - currentRoe;
        const trailActivation = Math.max(5.0, feeFloorRoe + 2.5);

        if (currentRoe <= lockedFloorPct) {
          shouldClose = true;
          closeReason = 'PROFIT_LOCK_PROTECTED';
          triggerDetail = `Profit-Lock triggered at +${currentRoe.toFixed(2)}% ROE (Peak: +${peakRoe.toFixed(2)}%, Protected Floor: +${lockedFloorPct.toFixed(2)}%)`;
        } else if (peakRoe >= trailActivation && pullback >= dynamicTrailPct) {
          shouldClose = true;
          closeReason = 'TRAILING_PROFIT_LOCK';
          triggerDetail = `Trailing profit locked at +${currentRoe.toFixed(2)}% ROE (Peak was +${peakRoe.toFixed(2)}%, Trail: ${dynamicTrailPct}%)`;
        }
      }

      // 4. MOMENTUM EXHAUSTION SMART PROFIT-TAKE
      if (!shouldClose && marketSnapshotMap && currentRoe >= Math.max(4.5, feeFloorRoe + 3.0)) {
        const snap = marketSnapshotMap[pos.symbol];
        if (snap) {
          const longExhausted = pos.side === 'LONG' && (
            snap.rsi >= 75 ||
            snap.trapWarning?.includes('BULL TRAP') ||
            (snap.supertrend === 'BEARISH' && Number(snap.macdHistogram || 0) < 0)
          );
          const shortExhausted = pos.side === 'SHORT' && (
            snap.rsi <= 25 ||
            snap.trapWarning?.includes('BEAR TRAP') ||
            (snap.supertrend === 'BULLISH' && Number(snap.macdHistogram || 0) > 0)
          );
          if (longExhausted || shortExhausted) {
            shouldClose = true;
            closeReason = 'SMART_PROFIT_TAKE';
            triggerDetail = `Momentum reversal/exhaustion detected while in +${currentRoe.toFixed(2)}% profit — secured gains early!`;
          }
        }
      }

      // 5. DISCIPLINED STOP-LOSS CHECK
      if (!shouldClose) {
        const rawSlRoe = sl && pos.entryPrice
          ? Math.abs(((pos.entryPrice - sl) / pos.entryPrice) * 100 * (pos.leverage || 10))
          : this.defaultStopLossPct;
        const effectiveSlRoe = Math.min(rawSlRoe, Math.max(this.defaultStopLossPct, 7.5));

        if (sl && ((pos.side === 'LONG' && currentPrice <= sl) || (pos.side === 'SHORT' && currentPrice >= sl))) {
          shouldClose = true;
          closeReason = 'AUTO_STOP_LOSS';
          triggerDetail = `Stop-Loss hit! Mark Price $${currentPrice} vs SL $${sl} (${currentRoe.toFixed(2)}% ROE)`;
        } else if (currentRoe <= -effectiveSlRoe) {
          shouldClose = true;
          closeReason = 'AUTO_STOP_LOSS';
          triggerDetail = `Disciplined Stop-Loss hit at ${currentRoe.toFixed(2)}% ROE (Max Risk: -${effectiveSlRoe.toFixed(1)}%)`;
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
