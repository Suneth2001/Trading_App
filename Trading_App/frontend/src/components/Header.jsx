import React, { useState } from 'react';
import { Zap, AlertTriangle, Settings, Radio, Download, Share, PlusSquare, X, Smartphone, RefreshCw } from 'lucide-react';

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
  onOpenTradingView,
  onRefresh
}) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const currentPrice = prices[activeSymbol] || 0;
  const stat = tickerStats[activeSymbol] || {};
  const changePct = stat.priceChangePercent !== undefined ? stat.priceChangePercent : 1.25;
  const isPositive = changePct >= 0;
  const [showInstallModal, setShowInstallModal] = useState(false);
  const isStandalone = typeof window !== 'undefined' && (
    window.navigator?.standalone === true ||
    window.matchMedia?.('(display-mode: standalone)')?.matches ||
    window.Capacitor?.isNativePlatform?.()
  );

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

        {/* Right Action Controls: Install App, Webhook, Panic, Settings */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
          {!isStandalone && (
            <button
              onClick={() => setShowInstallModal(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                background: 'rgba(168, 85, 247, 0.18)',
                border: '1px solid rgba(168, 85, 247, 0.5)',
                color: '#C084FC',
                padding: '6px 8px',
                borderRadius: '7px',
                fontSize: '10.5px',
                fontWeight: 800,
                cursor: 'pointer'
              }}
              title="Save / Install as Mobile App on iPhone or Android"
            >
              <Download size={13} color="#C084FC" />
              <span>App</span>
            </button>
          )}
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

          {/* Account Equity Box (Tap to Reload) */}
          <div
            onClick={async () => {
              if (!onRefresh || isRefreshing) return;
              setIsRefreshing(true);
              try {
                await onRefresh();
              } finally {
                setTimeout(() => setIsRefreshing(false), 500);
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              background: 'rgba(0, 245, 160, 0.06)',
              padding: '3px 8px',
              borderRadius: '6px',
              border: '1px solid rgba(0, 245, 160, 0.22)',
              cursor: 'pointer'
            }}
            title="Tap or Pull Down to Reload Balance & Market"
          >
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>Equity:</span>
            <span className="mono" style={{ fontSize: '12px', fontWeight: 800, color: '#00F5A0' }}>
              ${account?.equity !== undefined && account?.equity !== null
                ? Number(account.equity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : (isLive ? '0.00' : '10,000.00')}
            </span>
            <RefreshCw
              size={11}
              color="#00F5A0"
              style={{
                marginLeft: '2px',
                animation: isRefreshing ? 'spin 0.8s linear infinite' : 'none'
              }}
            />
          </div>
        </div>
      </div>

      {/* Save / Install as App Modal for iPhone & Android */}
      {showInstallModal && (
        <div
          onClick={() => setShowInstallModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.82)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: '420px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              background: '#0D131F',
              border: '1px solid rgba(0, 245, 160, 0.35)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '16px', color: '#FFFFFF' }}>
                <Smartphone size={18} color="#00F5A0" />
                <span>Install ApexAlgo Pro App</span>
              </div>
              <button
                onClick={() => setShowInstallModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Option 1: 1-Tap iOS Configuration Profile Download */}
            <div style={{
              background: 'rgba(0, 245, 160, 0.07)',
              border: '1px solid rgba(0, 245, 160, 0.3)',
              borderRadius: '10px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <div style={{ fontWeight: 800, fontSize: '13px', color: '#00F5A0' }}>
                🍏 Option 1: Direct iPhone App Profile Download
              </div>
              <div style={{ fontSize: '11.5px', color: '#CBD5E1', lineHeight: '1.45' }}>
                Tap below to download the iPhone App Installer, then open <strong>iPhone Settings → Profile Downloaded → Install</strong>.
              </div>
              <a
                href="./ApexAlgo-iPhone.mobileconfig"
                download="ApexAlgo-iPhone.mobileconfig"
                className="btn btn-primary"
                style={{ textDecoration: 'none', width: '100%', padding: '10px', fontSize: '12.5px', fontWeight: 800 }}
              >
                <Download size={15} />
                <span>Download iPhone App Installer</span>
              </a>
            </div>

            {/* Option 2: Safari Add to Home Screen */}
            <div style={{
              background: 'rgba(0, 210, 255, 0.06)',
              border: '1px solid rgba(0, 210, 255, 0.25)',
              borderRadius: '10px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              fontSize: '12px',
              color: '#E2E8F0',
              lineHeight: '1.5'
            }}>
              <div style={{ fontWeight: 800, fontSize: '13px', color: '#00D2FF' }}>
                📲 Option 2: Safari "Add to Home Screen" (Instant)
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Share size={15} color="#00D2FF" />
                <span>1. Tap the <strong>Share</strong> icon at the bottom of Safari.</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <PlusSquare size={15} color="#00F5A0" />
                <span>2. Select <strong>"Add to Home Screen"</strong> and tap <strong>Add</strong>.</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
export default Header;
