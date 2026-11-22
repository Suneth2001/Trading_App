import React from 'react';
import { Zap, AlertTriangle, Settings, Radio } from 'lucide-react';

export function Header({
  activeSymbol,
  setActiveSymbol,
  pairs,
  prices,
  tickerStats,
  account,
  guardianSettings,
  isLive,
  onToggleLive,
  onPanicCloseAll,
  onOpenSettings,
  onOpenTradingView
}) {
  const currentPrice = prices[activeSymbol] || 0;
  const stat = tickerStats[activeSymbol] || {};
  const changePct = stat.priceChangePercent !== undefined ? stat.priceChangePercent : 1.25;
  const isPositive = changePct >= 0;

  return (
    <header className="app-header">
      {/* Row 1: Brand + Mode Switch on Left | Webhook, Panic & Settings on Right */}
      <div className="header-top-row">
        {/* Brand + Live/Demo Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <div style={{
            width: '30px',
            height: '30px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #00F5A0 0%, #00D2FF 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 0 10px rgba(0, 245, 160, 0.35)'
          }}>
            <Zap size={16} color="#080B10" strokeWidth={2.5} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
            <span style={{ fontWeight: 800, fontSize: '15px', letterSpacing: '-0.3px', color: '#FFFFFF' }}>
              ApexAlgo
            </span>
            <span style={{
              fontSize: '9px',
              background: '#1E293B',
              color: '#00F5A0',
              padding: '1px 5px',
              borderRadius: '3px',
              fontWeight: 800
            }}>
              PRO
            </span>
          </div>

          {/* Mode Toggle Pill (DEMO vs LIVE) */}
          <button
            onClick={onToggleLive}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              background: isLive ? 'rgba(255, 51, 102, 0.16)' : 'rgba(0, 210, 255, 0.12)',
              border: `1px solid ${isLive ? 'rgba(255, 51, 102, 0.45)' : 'rgba(0, 210, 255, 0.4)'}`,
              color: isLive ? '#FF3366' : '#00D2FF',
              padding: '4px 8px',
              borderRadius: '6px',
              fontSize: '10px',
              fontWeight: 800,
              cursor: 'pointer',
              flexShrink: 0
            }}
            title="Switch between Demo Paper Mode and Live Binance Mode"
          >
            <span
              className={isLive ? 'glow-dot danger' : 'glow-dot'}
              style={{ width: 6, height: 6, background: isLive ? '#FF3366' : '#00D2FF' }}
            />
            {isLive ? 'LIVE' : 'DEMO'}
          </button>
        </div>

        {/* Right Action Controls: Webhook, Panic, Settings (Always visible on Mobile & Desktop) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          {/* TradingView Webhook Button */}
          <button
            onClick={onOpenTradingView}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              background: 'rgba(0, 210, 255, 0.1)',
              border: '1px solid rgba(0, 210, 255, 0.35)',
              color: '#00D2FF',
              padding: '6px 9px',
              borderRadius: '7px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
            title="TradingView Webhook Setup"
          >
            <Radio size={14} color="#00D2FF" />
            <span className="hide-xs">Webhook</span>
          </button>

          {/* Panic Close All Button */}
          <button
            onClick={onPanicCloseAll}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              background: 'rgba(239, 35, 60, 0.16)',
              border: '1px solid rgba(239, 35, 60, 0.45)',
              color: '#FF4D6D',
              padding: '6px 9px',
              borderRadius: '7px',
              fontSize: '11px',
              fontWeight: 800,
              cursor: 'pointer'
            }}
            title="Emergency Close All Open Positions Immediately"
          >
            <AlertTriangle size={14} />
            <span>Panic</span>
          </button>

          {/* Settings & API Keys Button (High Visibility on Mobile & Desktop) */}
          <button
            onClick={onOpenSettings}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
              background: 'linear-gradient(135deg, rgba(0, 245, 160, 0.18) 0%, rgba(0, 210, 255, 0.18) 100%)',
              border: '1px solid rgba(0, 245, 160, 0.5)',
              color: '#00F5A0',
              padding: '6px 10px',
              borderRadius: '7px',
              fontSize: '11px',
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 0 10px rgba(0, 245, 160, 0.15)'
            }}
            title="Settings & Binance API Keys"
          >
            <Settings size={15} color="#00F5A0" />
            <span>Settings</span>
          </button>
        </div>
      </div>

      {/* Row 2: Symbol Selector + Live Price + Equity */}
      <div className="header-bottom-row">
        {/* Left: Symbol Dropdown */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '6px',
          padding: '4px 8px',
          flex: '1 1 135px',
          maxWidth: '220px',
          minWidth: '120px'
        }}>
          <select
            value={activeSymbol}
            onChange={(e) => setActiveSymbol(e.target.value)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              fontWeight: 800,
              fontSize: '12.5px',
              cursor: 'pointer',
              outline: 'none',
              width: '100%',
              textOverflow: 'ellipsis'
            }}
          >
            {pairs.map((p) => (
              <option key={p.symbol} value={p.symbol} style={{ background: '#0F1523', color: '#fff' }}>
                {p.symbol} ({p.base})
              </option>
            ))}
          </select>
        </div>

        {/* Right: Live Price + 24h Change + Account Equity */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '8px',
          flexWrap: 'wrap'
        }}>
          {/* Live Price & Change Badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span className="mono" style={{ fontSize: '14.5px', fontWeight: 800, color: '#FFFFFF' }}>
              ${currentPrice ? currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: currentPrice < 1 ? 6 : 2 }) : '---'}
            </span>
            <span className="mono" style={{
              fontSize: '10.5px',
              fontWeight: 700,
              color: isPositive ? 'var(--color-long)' : 'var(--color-short)',
              background: isPositive ? 'var(--color-long-subtle)' : 'var(--color-short-subtle)',
              padding: '2px 5px',
              borderRadius: '4px'
            }}>
              {isPositive ? '+' : ''}{changePct.toFixed(2)}%
            </span>
          </div>

          {/* Account Equity Box */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            background: 'rgba(0, 245, 160, 0.06)',
            padding: '3px 8px',
            borderRadius: '6px',
            border: '1px solid rgba(0, 245, 160, 0.22)'
          }}>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>Equity:</span>
            <span className="mono" style={{ fontSize: '12px', fontWeight: 800, color: '#00F5A0' }}>
              ${account?.equity !== undefined && account?.equity !== null
                ? Number(account.equity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : (isLive ? '0.00' : '10,000.00')}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
export default Header;
