import React, { useState } from 'react';
import { ArrowUpRight, ArrowDownRight, X, ShieldAlert, History, AlertCircle, Award, RefreshCw } from 'lucide-react';

export function PositionsPanel({
  positions,
  history,
  guardianSettings,
  onClosePosition,
  onPanicCloseAll,
  onRefresh,
  isLive
}) {
  const [activeTab, setActiveTab] = useState('positions'); // 'positions' | 'history'
  const [isRefreshing, setIsRefreshing] = useState(false);

  const criticalThreshold = guardianSettings?.criticalMarginRatio || 80;

  const handleRefreshClick = async () => {
    if (onRefresh) {
      setIsRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setTimeout(() => setIsRefreshing(false), 500);
      }
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Tab Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setActiveTab('positions')}
            style={{
              background: activeTab === 'positions' ? 'rgba(0, 245, 160, 0.1)' : 'transparent',
              color: activeTab === 'positions' ? '#00F5A0' : 'var(--text-secondary)',
              border: `1px solid ${activeTab === 'positions' ? 'rgba(0, 245, 160, 0.3)' : 'transparent'}`,
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>Open Positions</span>
            <span style={{
              background: '#1E293B',
              color: '#FFFFFF',
              borderRadius: '10px',
              padding: '1px 6px',
              fontSize: '10px'
            }}>
              {positions.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            style={{
              background: activeTab === 'history' ? 'rgba(0, 210, 255, 0.1)' : 'transparent',
              color: activeTab === 'history' ? '#00D2FF' : 'var(--text-secondary)',
              border: `1px solid ${activeTab === 'history' ? 'rgba(0, 210, 255, 0.3)' : 'transparent'}`,
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <History size={13} />
            <span>Trade History</span>
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {onRefresh && (
            <button
              onClick={handleRefreshClick}
              disabled={isRefreshing}
              className="btn btn-outline"
              style={{ padding: '4px 9px', fontSize: '11px', gap: '4px' }}
              title="Refresh open positions"
            >
              <RefreshCw size={12} style={{ animation: isRefreshing ? 'spin 0.8s linear infinite' : 'none' }} />
              <span>Refresh</span>
            </button>
          )}

          {positions.length > 1 && (
            <button
              onClick={onPanicCloseAll}
              className="btn btn-danger"
              style={{ padding: '4px 8px', fontSize: '11px' }}
            >
              Close All ({positions.length})
            </button>
          )}
        </div>
      </div>

      {/* POSITIONS TAB */}
      {activeTab === 'positions' && (
        <div>
          {positions.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '36px 16px',
              color: 'var(--text-muted)',
              fontSize: '13px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px'
            }}>
              <AlertCircle size={28} opacity={0.4} />
              <div>No open positions. Ready to execute Long or Short trades!</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {positions.map((pos) => {
                const isLong = pos.side === 'LONG';
                const isProfitable = (pos.unrealizedPnl || 0) >= 0;
                const rawMargin = parseFloat(pos.marginRatio);
                const marginRatio = (!isNaN(rawMargin) && rawMargin > 0) ? Math.min(100, Math.max(0.5, rawMargin)) : 10;
                const isCriticalMargin = marginRatio >= (criticalThreshold - 15);

                // Margin bar color
                let meterColor = '#00F5A0';
                if (marginRatio > 70) meterColor = '#FF3366';
                else if (marginRatio > 45) meterColor = '#F59E0B';

                return (
                  <div
                    key={pos.id}
                    style={{
                      background: 'rgba(255,255,255,0.02)',
                      border: `1px solid ${isCriticalMargin ? '#FF3366' : 'var(--border)'}`,
                      borderRadius: 'var(--radius-sm)',
                      padding: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      position: 'relative',
                      boxShadow: isCriticalMargin ? '0 0 15px rgba(255, 51, 102, 0.25)' : 'none'
                    }}
                  >
                    {/* Position Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span className={isLong ? 'badge-long' : 'badge-short'} style={{ fontSize: '11px' }}>
                          {isLong ? <ArrowUpRight size={13} strokeWidth={3} /> : <ArrowDownRight size={13} strokeWidth={3} />}
                          {pos.side}
                        </span>
                        <span style={{ fontWeight: 800, fontSize: '14px', color: '#FFFFFF' }}>
                          {pos.symbol}
                        </span>
                        <span style={{
                          fontSize: '10px',
                          color: 'var(--text-secondary)',
                          background: 'rgba(255,255,255,0.06)',
                          padding: '2px 6px',
                          borderRadius: '4px'
                        }}>
                          {pos.leverage}x Isolated
                        </span>
                        {pos.source === 'BINANCE_LIVE' ? (
                          <span style={{ fontSize: '9px', fontWeight: 700, color: '#00F5A0', background: 'rgba(0, 245, 160, 0.15)', border: '1px solid rgba(0, 245, 160, 0.3)', padding: '2px 6px', borderRadius: '4px' }}>
                            ● BINANCE LIVE
                          </span>
                        ) : pos.source && (
                          <span style={{ fontSize: '9px', color: 'var(--color-accent)', background: 'rgba(0, 210, 255, 0.1)', padding: '2px 5px', borderRadius: '4px' }}>
                            {pos.source}
                          </span>
                        )}
                      </div>

                      {/* Close Position Button */}
                      <button
                        onClick={() => onClosePosition(pos.id)}
                        className="btn btn-outline"
                        style={{ padding: '4px 8px', fontSize: '11px', color: '#FF3366', borderColor: 'rgba(255,51,102,0.3)' }}
                      >
                        <X size={12} />
                        <span>Close</span>
                      </button>
                    </div>

                    {/* Stats Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(75px, 1fr))', gap: '8px', fontSize: '11px' }}>
                      <div>
                        <div style={{ color: 'var(--text-muted)' }}>Entry Price</div>
                        <div className="mono" style={{ fontWeight: 600, color: '#FFFFFF' }}>
                          ${pos.entryPrice?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-muted)' }}>Mark Price</div>
                        <div className="mono" style={{ fontWeight: 600, color: '#FFFFFF' }}>
                          ${pos.currentPrice?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-muted)' }}>Liq. Price</div>
                        <div className="mono" style={{ fontWeight: 700, color: '#F59E0B' }}>
                          ${pos.liquidationPrice?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-muted)' }}>PnL (ROE %)</div>
                        <div className="mono" style={{
                          fontWeight: 800,
                          color: isProfitable ? 'var(--color-long)' : 'var(--color-short)',
                          fontSize: '12px'
                        }}>
                          {isProfitable ? '+' : ''}${pos.unrealizedPnl} ({isProfitable ? '+' : ''}{pos.roePct}%)
                        </div>
                      </div>
                    </div>

                    {/* Profit-Lock Status & TP/SL Strip */}
                    {(pos.profitLockFloorPct > 0 || pos.tp || pos.sl) && (
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '6px',
                        padding: '5px 8px',
                        borderRadius: '5px',
                        background: pos.profitLockFloorPct > 0 ? 'rgba(0, 245, 160, 0.08)' : 'rgba(255, 255, 255, 0.025)',
                        border: `1px solid ${pos.profitLockFloorPct > 0 ? 'rgba(0, 245, 160, 0.3)' : 'var(--border-subtle)'}`,
                        fontSize: '10px'
                      }}>
                        {pos.profitLockFloorPct > 0 ? (
                          <span style={{ color: '#00F5A0', fontWeight: 800 }}>
                            🔒 Profit Locked ≥ +{pos.profitLockFloorPct}% ROE (Peak +{pos.peakRoePct || pos.highestPnlPct || 0}%)
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>
                            🛡️ Profit-Lock arms at +3.5% ROE
                          </span>
                        )}
                        <div className="mono" style={{ display: 'flex', gap: '8px', color: 'var(--text-secondary)' }}>
                          {pos.tp && <span style={{ color: '#00F5A0' }}>TP: ${pos.tp}</span>}
                          {pos.sl && <span style={{ color: '#FF3366' }}>SL: ${pos.sl}</span>}
                        </div>
                      </div>
                    )}

                    {/* Margin Guardian Auto-Close Meter */}
                    <div style={{ marginTop: '2px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '3px' }}>
                        <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <ShieldAlert size={11} color={meterColor} />
                          Margin Ratio (Auto-Close Shield at {criticalThreshold}%)
                        </span>
                        <span className="mono" style={{ fontWeight: 700, color: meterColor }}>
                          {marginRatio.toFixed(1)}%
                        </span>
                      </div>
                      <div className="margin-meter-bg">
                        <div
                          className="margin-meter-fill"
                          style={{
                            width: `${marginRatio.toFixed(1)}%`,
                            background: meterColor
                          }}
                        />
                        {/* Threshold Marker */}
                        <div style={{
                          position: 'absolute',
                          left: `${criticalThreshold}%`,
                          top: 0,
                          bottom: 0,
                          width: '2px',
                          background: '#FF3366',
                          boxShadow: '0 0 4px #FF3366'
                        }} title={`Auto close trigger at ${criticalThreshold}%`} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* HISTORY TAB */}
      {activeTab === 'history' && (
        <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
          {history.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '12px' }}>
              No trade history yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {history.map((item) => {
                const isWin = item.realizedPnl >= 0;
                return (
                  <div
                    key={item.id}
                    style={{
                      background: 'rgba(255,255,255,0.015)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '6px',
                      padding: '8px 12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '11px'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{
                          fontWeight: 700,
                          color: item.side === 'LONG' ? 'var(--color-long)' : 'var(--color-short)'
                        }}>
                          {item.side} {item.symbol}
                        </span>
                        <span style={{ fontSize: '9px', background: '#1E293B', padding: '1px 5px', borderRadius: '3px', color: 'var(--text-muted)' }}>
                          {item.reason}
                        </span>
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                        Entry: ${item.entryPrice} → Exit: ${item.exitPrice}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div className="mono" style={{ fontWeight: 800, color: isWin ? 'var(--color-long)' : 'var(--color-short)' }}>
                        {isWin ? '+' : ''}${item.realizedPnl}
                      </div>
                      <div className="mono" style={{ fontSize: '10px', color: isWin ? 'var(--color-long)' : 'var(--color-short)' }}>
                        {isWin ? '+' : ''}{item.roePct}%
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
