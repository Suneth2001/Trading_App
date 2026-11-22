import { CONFIG } from '../config.js';
import { paperTrading } from './paperTradingService.js';
import { binanceService } from './binanceService.js';

export class TradingViewWebhookHandler {
  constructor(io) {
    this.io = io;
    this.secret = CONFIG.TRADINGVIEW.DEFAULT_SECRET;
    this.webhookLogs = [];
  }

  setSecret(newSecret) {
    if (newSecret && newSecret.trim()) {
      this.secret = newSecret.trim();
    }
    return this.secret;
  }

  getSecret() {
    return this.secret;
  }

  getLogs() {
    return this.webhookLogs.slice(0, 50);
  }

  /**
   * Process incoming TradingView alert payload
   */
  async processAlert(payload) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      id: `TV-${Date.now()}`,
      timestamp,
      rawPayload: payload,
      status: 'PENDING',
      message: ''
    };

    try {
      // 1. Verify Secret / Auth Token
      const incomingSecret = payload.secret || payload.passphrase || payload.token;
      if (incomingSecret !== this.secret) {
        logEntry.status = 'AUTH_FAILED';
        logEntry.message = 'Invalid or missing TradingView secret passphrase';
        this.addLog(logEntry);
        return { success: false, error: logEntry.message, code: 401 };
      }

      // 2. Parse Action and Symbol
      let action = (payload.action || payload.type || payload.side || '').toUpperCase();
      if (action === 'BUY') action = 'LONG';
      if (action === 'SELL') action = 'SHORT';

      const symbol = (payload.symbol || payload.ticker || 'BTCUSDT').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      const markPrice = payload.price ? parseFloat(payload.price) : binanceService.getPrice(symbol);

      if (!['LONG', 'SHORT', 'CLOSE'].includes(action)) {
        logEntry.status = 'INVALID_ACTION';
        logEntry.message = `Unsupported action "${action}". Allowed: LONG, SHORT, CLOSE`;
        this.addLog(logEntry);
        return { success: false, error: logEntry.message, code: 400 };
      }

      // 3. Handle CLOSE action
      if (action === 'CLOSE') {
        const targetPos = paperTrading.positions.find(p => p.symbol === symbol);
        if (!targetPos) {
          logEntry.status = 'SKIPPED';
          logEntry.message = `No active position found for ${symbol} to close`;
          this.addLog(logEntry);
          return { success: true, message: logEntry.message };
        }

        const closedRecord = paperTrading.closePosition(targetPos.id, markPrice, 'TRADINGVIEW_WEBHOOK_CLOSE');
        logEntry.status = 'EXECUTED';
        logEntry.message = `Successfully closed ${targetPos.side} on ${symbol} @ $${markPrice} (PnL: $${closedRecord.realizedPnl})`;
        this.addLog(logEntry);

        if (this.io) {
          this.io.emit('position_closed', closedRecord);
          this.io.emit('account_summary', paperTrading.getBalance());
          this.io.emit('positions_update', paperTrading.positions);
        }
        return { success: true, position: closedRecord };
      }

      // 4. Handle LONG or SHORT action
      const amountUsdt = payload.amountUsdt || payload.margin || 500;
      const leverage = payload.leverage || CONFIG.DEFAULT_LEVERAGE;
      const tp = payload.tp || payload.takeProfit || null;
      const sl = payload.sl || payload.stopLoss || null;
      const trailingStopPct = payload.trailingStopPct || null;

      const isLive = paperTrading.isLive && binanceService.liveExchange;

      // Close opposite position if already open
      const oppositeSide = action === 'LONG' ? 'SHORT' : 'LONG';
      const existingOpposite = paperTrading.positions.find(p => p.symbol === symbol && p.side === oppositeSide);
      if (existingOpposite) {
        if (isLive) {
          await binanceService.closeLivePosition({
            symbol: existingOpposite.symbol,
            side: existingOpposite.side,
            size: existingOpposite.size
          });
        }
        paperTrading.closePosition(existingOpposite.id, markPrice, 'TRADINGVIEW_AUTO_REVERSE');
      }

      let liveOrder = null;
      if (isLive) {
        liveOrder = await binanceService.executeLiveOrder({
          symbol,
          side: action,
          amountUsdt: Number(amountUsdt),
          leverage: Number(leverage)
        });
      }

      const openedPos = paperTrading.openPosition({
        symbol,
        side: action,
        amountUsdt,
        leverage,
        markPrice,
        tp,
        sl,
        trailingStopPct,
        source: isLive ? 'TRADINGVIEW_LIVE_WEBHOOK' : 'TRADINGVIEW_WEBHOOK'
      });

      if (liveOrder) {
        openedPos.binanceOrderId = liveOrder.id;
      }

      logEntry.status = 'EXECUTED';
      logEntry.message = `⚡ TradingView Webhook Order Executed: ${action} ${symbol} @ $${markPrice} | Lev: ${leverage}x | Margin: $${amountUsdt}${isLive ? ' [LIVE BINANCE]' : ''}`;
      this.addLog(logEntry);

      if (this.io) {
        this.io.emit('position_opened', openedPos);
        if (isLive) {
          const updatedBal = await binanceService.getLiveBalance();
          const updatedPos = await binanceService.getLivePositions();
          if (updatedBal) this.io.emit('account_summary', updatedBal);
          this.io.emit('positions_update', updatedPos || []);
        } else {
          this.io.emit('positions_update', paperTrading.positions);
          this.io.emit('account_summary', paperTrading.getBalance());
        }
        this.io.emit('tradingview_alert_received', logEntry);
      }

      return { success: true, position: openedPos };
    } catch (err) {
      logEntry.status = 'ERROR';
      logEntry.message = err.message;
      this.addLog(logEntry);
      return { success: false, error: err.message, code: 500 };
    }
  }

  addLog(entry) {
    this.webhookLogs.unshift(entry);
    if (this.webhookLogs.length > 100) this.webhookLogs.pop();
    if (this.io) {
      this.io.emit('webhook_log', entry);
    }
  }
}
