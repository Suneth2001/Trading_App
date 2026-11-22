import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

export function TickerTape({ pairs, prices, tickerStats, activeSymbol, onSelectSymbol }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      overflowX: 'auto',
      padding: '8px 16px',
      background: 'rgba(8, 12, 18, 0.8)',
      borderBottom: '1px solid var(--border-subtle)',
      whiteSpace: 'nowrap',
      scrollbarWidth: 'none'
    }}>
      {pairs.map((pair) => {
        const sym = pair.symbol;
        const price = prices[sym] || 0;
        const stat = tickerStats[sym] || {};
        const changePct = stat.priceChangePercent !== undefined ? stat.priceChangePercent : 1.2;
        const isUp = changePct >= 0;
        const isSelected = activeSymbol === sym;

        return (
          <div
            key={sym}
            onClick={() => onSelectSymbol(sym)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '4px 10px',
              borderRadius: '6px',
              background: isSelected ? 'rgba(0, 245, 160, 0.08)' : 'rgba(255, 255, 255, 0.02)',
              border: `1px solid ${isSelected ? 'rgba(0, 245, 160, 0.3)' : 'transparent'}`,
              cursor: 'pointer',
              fontSize: '12px',
              transition: 'all 0.15s ease'
            }}
          >
            <span style={{ fontWeight: 700, color: isSelected ? '#FFFFFF' : 'var(--text-secondary)' }}>
              {pair.base}
            </span>
            <span className="mono" style={{ fontWeight: 600, color: '#FFFFFF' }}>
              ${price ? price.toLocaleString(undefined, { minimumFractionDigits: pair.precision, maximumFractionDigits: pair.precision }) : '---'}
            </span>
            <span className="mono" style={{
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              fontSize: '11px',
              fontWeight: 700,
              color: isUp ? 'var(--color-long)' : 'var(--color-short)'
            }}>
              {isUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
              {isUp ? '+' : ''}{changePct.toFixed(2)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
