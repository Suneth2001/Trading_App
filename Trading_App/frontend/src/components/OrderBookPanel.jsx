import React, { useState, useEffect } from 'react';
import { BookOpen, TrendingUp, TrendingDown, Zap, ArrowUpRight, ArrowDownRight, Layers } from 'lucide-react';

export function OrderBookPanel({ activeSymbol, currentPrice, onQuickTrade }) {
  const [orderBook, setOrderBook] = useState(null);
  const [quickSize, setQuickSize] = useState(250);

  useEffect(() => {
    let isMounted = true;
    const fetchDepth = async () => {
      try {
        const res = await fetch(`/api/market/orderbook?symbol=${activeSymbol}&limit=8`);
        const data = await res.json();
        if (isMounted) setOrderBook(data);
      } catch {
        // fallback
      }
    };

    fetchDepth();
    const interval = setInterval(fetchDepth, 2000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activeSymbol]);

  const bids = orderBook?.bids || [];
  const asks = orderBook?.asks || [];
  const buyerPressure = orderBook?.buyerPressure ?? 52.5;
  const sellerPressure = orderBook?.sellerPressure ?? 47.5;

  const maxBidQty = Math.max(...bids.map(b => b[1]), 1);
  const maxAskQty = Math.max(...asks.map(a => a[1]), 1);

  return (
    <div className="glass-panel" style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700, color: '#FFFFFF' }}>
          <BookOpen size={15} color="#00D2FF" />
          <span>Live Order Book & Depth</span>
        </div>
        <span className="mono" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
          Spread: ${orderBook?.spread ?? '0.01'}
        </span>
      </div>

      {/* Buyer vs Seller Pressure Meter */}
      <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: '6px', padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontWeight: 700 }}>
          <span style={{ color: 'var(--color-long)' }}>Buyers: {buyerPressure}%</span>
          <span style={{ color: 'var(--color-short)' }}>Sellers: {sellerPressure}%</span>
        </div>
        <div style={{ height: '5px', width: '100%', background: 'rgba(255, 51, 102, 0.4)', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${buyerPressure}%`, background: '#00F5A0', transition: 'width 0.4s ease' }} />
        </div>
      </div>

      {/* Asks (Sell Orders - Red, reverse order) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '11px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', color: 'var(--text-muted)', fontSize: '9px', fontWeight: 700, marginBottom: '2px' }}>
          <span>PRICE (USDT)</span>
          <span style={{ textAlign: 'right' }}>SIZE</span>
        </div>

        {asks.slice(0, 6).reverse().map(([price, qty], idx) => {
          const depthPct = Math.min(100, (qty / maxAskQty) * 100);
          return (
            <div
              key={idx}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                position: 'relative',
                padding: '1px 4px',
                cursor: 'pointer'
              }}
              onClick={() => onQuickTrade && onQuickTrade('SHORT', price, quickSize)}
            >
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 0,
                  bottom: 0,
                  width: `${depthPct}%`,
                  background: 'rgba(255, 51, 102, 0.12)',
                  zIndex: 0
                }}
              />
              <span className="mono" style={{ color: 'var(--color-short)', fontWeight: 600, zIndex: 1 }}>
                ${price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
              <span className="mono" style={{ textAlign: 'right', color: 'var(--text-secondary)', zIndex: 1 }}>
                {qty.toFixed(3)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Mid Market Price Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '5px 8px',
        background: 'rgba(255, 255, 255, 0.03)',
        borderRadius: '4px',
        border: '1px solid var(--border-subtle)'
      }}>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Mark Price</span>
        <span className="mono" style={{ fontSize: '14px', fontWeight: 800, color: '#FFFFFF' }}>
          ${currentPrice ? currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '---'}
        </span>
      </div>

      {/* Bids (Buy Orders - Green) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '11px' }}>
        {bids.slice(0, 6).map(([price, qty], idx) => {
          const depthPct = Math.min(100, (qty / maxBidQty) * 100);
          return (
            <div
              key={idx}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                position: 'relative',
                padding: '1px 4px',
                cursor: 'pointer'
              }}
              onClick={() => onQuickTrade && onQuickTrade('LONG', price, quickSize)}
            >
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 0,
                  bottom: 0,
                  width: `${depthPct}%`,
                  background: 'rgba(0, 245, 160, 0.12)',
                  zIndex: 0
                }}
              />
              <span className="mono" style={{ color: 'var(--color-long)', fontWeight: 600, zIndex: 1 }}>
                ${price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
              <span className="mono" style={{ textAlign: 'right', color: 'var(--text-secondary)', zIndex: 1 }}>
                {qty.toFixed(3)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Quick Trade Trigger Controls */}
      <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px' }}>
          <span style={{ color: 'var(--text-muted)' }}>1-Tap Size:</span>
          <div style={{ display: 'flex', gap: '4px' }}>
            {[100, 250, 500].map(sz => (
              <button
                key={sz}
                onClick={() => setQuickSize(sz)}
                style={{
                  background: quickSize === sz ? 'var(--border)' : 'transparent',
                  border: '1px solid var(--border-subtle)',
                  color: quickSize === sz ? '#00D2FF' : 'var(--text-muted)',
                  borderRadius: '3px',
                  padding: '1px 6px',
                  fontSize: '9px',
                  cursor: 'pointer',
                  fontWeight: 700
                }}
              >
                ${sz}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
          <button
            onClick={() => onQuickTrade && onQuickTrade('LONG', currentPrice, quickSize)}
            className="btn btn-long"
            style={{ padding: '6px 8px', fontSize: '11px', borderRadius: '4px' }}
          >
            <ArrowUpRight size={13} strokeWidth={3} />
            Quick Long ${quickSize}
          </button>
          <button
            onClick={() => onQuickTrade && onQuickTrade('SHORT', currentPrice, quickSize)}
            className="btn btn-short"
            style={{ padding: '6px 8px', fontSize: '11px', borderRadius: '4px' }}
          >
            <ArrowDownRight size={13} strokeWidth={3} />
            Quick Short ${quickSize}
          </button>
        </div>
      </div>
    </div>
  );
}
