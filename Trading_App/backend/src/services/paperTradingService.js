import { CONFIG } from '../config.js';

export class PaperTradingService {
  constructor() {
    this.balance = CONFIG.PAPER_TRADING_DEFAULT_BALANCE; // Available USDT
    this.initialBalance = CONFIG.PAPER_TRADING_DEFAULT_BALANCE;
    this.positions = []; // Open positions: [{ id, symbol, side: 'LONG'|'SHORT', size, entryPrice, leverage, margin, liquidationPrice, tp, sl, trailingStopPct, highestPnlPct, openedAt }]
    this.orderHistory = []; // Closed trades history
    this.tradeCounter = 1;
    this.isLive = false; // Toggle between paper & real Binance
  }

  getBalance() {
    // Total Equity = Available Balance + Total Position Initial Margin + Total Unrealized PnL
    const totalMargin = this.positions.reduce((sum, p) => sum + p.margin, 0);
    const totalUnrealizedPnl = this.positions.reduce((sum, p) => sum + (p.unrealizedPnl || 0), 0);
    const equity = this.balance + totalMargin + totalUnrealizedPnl;

    return {
      availableBalance: Number(this.balance.toFixed(2)),
      totalMargin: Number(totalMargin.toFixed(2)),
      totalUnrealizedPnl: Number(totalUnrealizedPnl.toFixed(2)),
      equity: Number(equity.toFixed(2)),
      initialBalance: this.initialBalance,
      totalPnl: Number((equity - this.initialBalance).toFixed(2)),
      totalPnlPct: Number((((equity - this.initialBalance) / this.initialBalance) * 100).toFixed(2)),
      isLive: this.isLive
    };
  }

  setLiveMode(isLive) {
    this.isLive = Boolean(isLive);
    return { isLive: this.isLive };
  }

  resetAccount(newBalance = CONFIG.PAPER_TRADING_DEFAULT_BALANCE) {
    this.balance = newBalance;
    this.initialBalance = newBalance;
    this.positions = [];
    this.orderHistory = [];
    return this.getBalance();
  }

  /**
   * Open a position (LONG or SHORT)
   */
  openPosition({ symbol, side, amountUsdt, leverage = CONFIG.DEFAULT_LEVERAGE, markPrice, tp = null, sl = null, trailingStopPct = null, source = 'MANUAL' }) {
    if (!markPrice || markPrice <= 0) {
      throw new Error('Valid mark price is required');
    }
    if (!['LONG', 'SHORT'].includes(side)) {
      throw new Error('Position side must be LONG or SHORT');
    }

    const marginRequired = Number(amountUsdt);
    if (this.balance < marginRequired) {
      throw new Error(`Insufficient margin balance. Available: $${this.balance.toFixed(2)}, Required: $${marginRequired.toFixed(2)}`);
    }

    // Deduct margin from available balance
    this.balance -= marginRequired;

    // Total position value with leverage
    const positionValue = marginRequired * leverage;
    const size = positionValue / markPrice;

    // Calculate Estimated Liquidation Price (isolated margin assumption)
    // Maintenance margin rate ~ 0.5% (0.005)
    const mmr = 0.005;
    let liquidationPrice;
    if (side === 'LONG') {
      liquidationPrice = markPrice * (1 - (1 / leverage) + mmr);
    } else {
      liquidationPrice = markPrice * (1 + (1 / leverage) - mmr);
    }
    liquidationPrice = Math.max(0.0001, liquidationPrice);

    const position = {
      id: `POS-${Date.now()}-${this.tradeCounter++}`,
      symbol,
      side,
      size: Number(size.toFixed(6)),
      entryPrice: markPrice,
      currentPrice: markPrice,
      leverage,
      margin: marginRequired,
      initialMargin: marginRequired,
      liquidationPrice: Number(liquidationPrice.toFixed(4)),
      marginRatio: 10.0, // starts healthy ~10%
      unrealizedPnl: 0,
      roePct: 0,
      tp: tp ? Number(tp) : null,
      sl: sl ? Number(sl) : null,
      trailingStopPct: trailingStopPct ? Number(trailingStopPct) : null,
      highestPnlPct: 0,
      source, // 'AUTO_BOT', 'TRADINGVIEW_WEBHOOK', 'MANUAL'
      openedAt: new Date().toISOString()
    };

    this.positions.push(position);
    return position;
  }

  /**
   * Update all positions with the latest live mark prices and recalculate PnL & Margin Ratios
   */
  updateMarketPrices(priceMap) {
    for (const pos of this.positions) {
      const currentPrice = priceMap[pos.symbol];
      if (!currentPrice) continue;

      pos.currentPrice = currentPrice;

      // PnL calculation
      let pnl = 0;
      if (pos.side === 'LONG') {
        pnl = (currentPrice - pos.entryPrice) * pos.size;
      } else {
        pnl = (pos.entryPrice - currentPrice) * pos.size;
      }
      pos.unrealizedPnl = Number(pnl.toFixed(2));
      pos.roePct = Number(((pnl / pos.margin) * 100).toFixed(2));

      // Track highest ROE for trailing stop
      if (pos.roePct > (pos.highestPnlPct || 0)) {
        pos.highestPnlPct = pos.roePct;
      }

      // Calculate Margin Ratio %
      // Margin Balance = Position Margin + Unrealized PnL
      // Maintenance Margin = Position Value * 0.005
      const currentPosValue = pos.size * currentPrice;
      const maintenanceMargin = currentPosValue * 0.005;
      const positionMarginBalance = Math.max(0.01, pos.margin + pnl);

      let marginRatio = (maintenanceMargin / positionMarginBalance) * 100;
      marginRatio = Math.min(100, Math.max(0, marginRatio));
      pos.marginRatio = Number(marginRatio.toFixed(2));
    }
    return this.positions;
  }

  /**
   * Close a position
   */
  closePosition(positionId, currentPrice, reason = 'MANUAL_CLOSE') {
    const index = this.positions.findIndex(p => p.id === positionId);
    if (index === -1) {
      throw new Error(`Position ${positionId} not found`);
    }

    const pos = this.positions[index];
    const exitPrice = currentPrice || pos.currentPrice || pos.entryPrice;

    // Realized PnL
    let pnl = 0;
    if (pos.side === 'LONG') {
      pnl = (exitPrice - pos.entryPrice) * pos.size;
    } else {
      pnl = (pos.entryPrice - exitPrice) * pos.size;
    }

    // Return remaining margin + pnl to available balance
    const returnedFunds = Math.max(0, pos.margin + pnl);
    this.balance += returnedFunds;

    const closedRecord = {
      id: pos.id,
      symbol: pos.symbol,
      side: pos.side,
      size: pos.size,
      entryPrice: pos.entryPrice,
      exitPrice: Number(exitPrice.toFixed(4)),
      leverage: pos.leverage,
      margin: pos.margin,
      realizedPnl: Number(pnl.toFixed(2)),
      roePct: Number(((pnl / pos.margin) * 100).toFixed(2)),
      reason, // 'TP', 'SL', 'MARGIN_GUARDIAN_AUTO_CLOSE', 'TRAILING_STOP', 'MANUAL_CLOSE'
      source: pos.source,
      openedAt: pos.openedAt,
      closedAt: new Date().toISOString()
    };

    this.orderHistory.unshift(closedRecord);
    if (this.orderHistory.length > 200) {
      this.orderHistory.pop();
    }

    this.positions.splice(index, 1);
    return closedRecord;
  }

  /**
   * Panic Close All Open Positions
   */
  closeAllPositions(priceMap, reason = 'PANIC_CLOSE_ALL') {
    const closed = [];
    const openCopy = [...this.positions];
    for (const pos of openCopy) {
      const price = priceMap[pos.symbol] || pos.currentPrice;
      const result = this.closePosition(pos.id, price, reason);
      closed.push(result);
    }
    return closed;
  }
}

export const paperTrading = new PaperTradingService();
