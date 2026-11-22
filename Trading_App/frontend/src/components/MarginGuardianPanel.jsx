import React, { useState } from 'react';
import { ShieldCheck, ShieldAlert, AlertTriangle, Lock, RefreshCw, Zap, CheckCircle, Info } from 'lucide-react';

export function MarginGuardianPanel({ guardianSettings, onUpdateSettings }) {
  const [enabled, setEnabled] = useState(guardianSettings?.enabled ?? true);
  const [criticalMarginRatio, setCriticalMarginRatio] = useState(guardianSettings?.criticalMarginRatio || 80);
  const [defaultStopLossPct, setDefaultStopLossPct] = useState(guardianSettings?.defaultStopLossPct || 4.5);
  const [defaultTakeProfitPct, setDefaultTakeProfitPct] = useState(guardianSettings?.defaultTakeProfitPct || 9.0);
  const [trailingStopPct, setTrailingStopPct] = useState(guardianSettings?.trailingStopPct || 2.0);
  const [maxAccountDrawdownPct, setMaxAccountDrawdownPct] = useState(guardianSettings?.maxAccountDrawdownPct || 15.0);
  const [isSaved, setIsSaved] = useState(false);

  React.useEffect(() => {
    if (!guardianSettings) return;
    if (guardianSettings.enabled !== undefined) setEnabled(guardianSettings.enabled);
    if (guardianSettings.criticalMarginRatio !== undefined) setCriticalMarginRatio(guardianSettings.criticalMarginRatio);
    if (guardianSettings.defaultStopLossPct !== undefined) setDefaultStopLossPct(guardianSettings.defaultStopLossPct);
    if (guardianSettings.defaultTakeProfitPct !== undefined) setDefaultTakeProfitPct(guardianSettings.defaultTakeProfitPct);
    if (guardianSettings.trailingStopPct !== undefined) setTrailingStopPct(guardianSettings.trailingStopPct);
    if (guardianSettings.maxAccountDrawdownPct !== undefined) setMaxAccountDrawdownPct(guardianSettings.maxAccountDrawdownPct);
  }, [guardianSettings]);

  const handleSave = async () => {
    await onUpdateSettings({
      enabled,
      criticalMarginRatio,
      defaultStopLossPct,
      defaultTakeProfitPct,
      trailingStopPct,
      maxAccountDrawdownPct
    });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  return (
    <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Title & Status */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 18px',
        background: enabled ? 'rgba(0, 245, 160, 0.08)' : 'rgba(255, 51, 102, 0.08)',
        border: `1px solid ${enabled ? 'rgba(0, 245, 160, 0.3)' : 'rgba(255, 51, 102, 0.3)'}`,
        borderRadius: 'var(--radius-md)',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '10px',
            background: enabled ? 'linear-gradient(135deg, #00F5A0, #00D2FF)' : '#1E293B',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: enabled ? '0 0 15px rgba(0, 245, 160, 0.4)' : 'none'
          }}>
            {enabled ? <ShieldCheck size={24} color="#080B10" strokeWidth={2.5} /> : <ShieldAlert size={24} color="#FF3366" />}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 800, fontSize: '16px', color: '#FFFFFF' }}>
                Margin Got Time Auto-Close Guardian
              </span>
              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                color: enabled ? 'var(--color-long)' : 'var(--color-short)',
                background: enabled ? 'var(--color-long-subtle)' : 'var(--color-short-subtle)',
                padding: '2px 8px',
                borderRadius: '4px'
              }}>
                {enabled ? 'SHIELD ARMED & ACTIVE' : 'DISABLED'}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Sub-second liquidation prevention & margin safety net
            </div>
          </div>
        </div>

        {/* Enable / Disable Switch */}
        <button
          onClick={() => setEnabled(!enabled)}
          style={{
            background: enabled ? 'rgba(0, 245, 160, 0.15)' : 'rgba(255, 51, 102, 0.15)',
            border: `1px solid ${enabled ? '#00F5A0' : '#FF3366'}`,
            color: enabled ? '#00F5A0' : '#FF3366',
            padding: '8px 16px',
            borderRadius: 'var(--radius-sm)',
            fontWeight: 800,
            fontSize: '13px',
            cursor: 'pointer'
          }}
        >
          {enabled ? 'ARMED (ENABLED)' : 'DISABLED (CLICK TO ARM)'}
        </button>
      </div>

      {/* Info Callout */}
      <div style={{
        background: 'rgba(0, 210, 255, 0.05)',
        border: '1px solid rgba(0, 210, 255, 0.2)',
        borderRadius: 'var(--radius-sm)',
        padding: '12px 14px',
        fontSize: '12px',
        color: '#94A3B8',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        lineHeight: '1.5'
      }}>
        <Info size={18} color="#00D2FF" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div>
          <strong style={{ color: '#00D2FF' }}>How Margin Got Time Auto-Close Works:</strong> In volatile crypto futures markets, exchange liquidations occur at 100% margin ratio, wiping out 100% of your collateral plus heavy penalty fees. Margin Guardian actively watches every position in the background (every 500ms). When adverse movement causes the margin ratio to hit your threshold (e.g. <strong>{criticalMarginRatio}%</strong>), it executes an instant auto-close, preserving your remaining capital before exchange liquidation!
        </div>
      </div>

      {/* Settings Sliders & Inputs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))', gap: '14px' }}>
        {/* 1. Critical Margin Ratio Slider */}
        <div style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF' }}>
              Critical Margin Ratio Threshold
            </span>
            <span className="mono" style={{ fontSize: '16px', fontWeight: 800, color: '#FF3366' }}>
              {criticalMarginRatio}%
            </span>
          </div>
          <input
            type="range"
            min="50"
            max="95"
            step="1"
            value={criticalMarginRatio}
            onChange={(e) => setCriticalMarginRatio(Number(e.target.value))}
            style={{ accentColor: '#FF3366', cursor: 'pointer', width: '100%' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)' }}>
            <span>50% (Ultra Conservative)</span>
            <span>80% (Recommended)</span>
            <span>95% (High Risk)</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            Triggers emergency auto-close if position margin ratio reaches this level.
          </div>
        </div>

        {/* 2. Hard Stop-Loss % */}
        <div style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF' }}>
              Default Hard Stop-Loss
            </span>
            <span className="mono" style={{ fontSize: '16px', fontWeight: 800, color: 'var(--color-short)' }}>
              -{defaultStopLossPct}%
            </span>
          </div>
          <input
            type="range"
            min="1.0"
            max="20.0"
            step="0.5"
            value={defaultStopLossPct}
            onChange={(e) => setDefaultStopLossPct(Number(e.target.value))}
            style={{ accentColor: '#FF3366', cursor: 'pointer', width: '100%' }}
          />
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            Auto closes position if negative Return on Equity reaches this loss percentage.
          </div>
        </div>

        {/* 3. Take-Profit % */}
        <div style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF' }}>
              Default Take-Profit
            </span>
            <span className="mono" style={{ fontSize: '16px', fontWeight: 800, color: 'var(--color-long)' }}>
              +{defaultTakeProfitPct}%
            </span>
          </div>
          <input
            type="range"
            min="2.0"
            max="50.0"
            step="0.5"
            value={defaultTakeProfitPct}
            onChange={(e) => setDefaultTakeProfitPct(Number(e.target.value))}
            style={{ accentColor: '#00F5A0', cursor: 'pointer', width: '100%' }}
          />
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            Locks in profit automatically when target gain percentage is reached.
          </div>
        </div>

        {/* 4. Trailing Stop Lock % */}
        <div style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF' }}>
              Trailing Stop Pullback Lock
            </span>
            <span className="mono" style={{ fontSize: '16px', fontWeight: 800, color: '#00D2FF' }}>
              {trailingStopPct}%
            </span>
          </div>
          <input
            type="range"
            min="0.5"
            max="8.0"
            step="0.5"
            value={trailingStopPct}
            onChange={(e) => setTrailingStopPct(Number(e.target.value))}
            style={{ accentColor: '#00D2FF', cursor: 'pointer', width: '100%' }}
          />
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            After position is in profit, auto-closes if price retraces by this pullback amount.
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={handleSave}
          className="btn btn-primary"
          style={{ padding: '10px 24px', fontSize: '13px' }}
        >
          <Lock size={15} />
          Save Guardian Protection Settings
        </button>
        {isSaved && (
          <span style={{ color: 'var(--color-long)', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
            <CheckCircle size={14} /> Settings Saved & Synced to Guardian Engine!
          </span>
        )}
      </div>

      {/* Recent Guardian Triggers Log */}
      <div>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>
          Recent Auto-Close Protection Log
        </div>

        <div style={{
          background: '#06090F',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)',
          padding: '12px',
          maxHeight: '180px',
          overflowY: 'auto'
        }}>
          {(guardianSettings?.recentAlerts || []).length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center', padding: '16px' }}>
              No emergency margin triggers yet. All open positions are currently safe!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {guardianSettings.recentAlerts.map((alert) => (
                <div
                  key={alert.id}
                  style={{
                    background: 'rgba(255,51,102,0.06)',
                    border: '1px solid rgba(255,51,102,0.2)',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    fontSize: '11px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, color: '#FF3366', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <AlertTriangle size={12} />
                      {alert.reason} on {alert.symbol} ({alert.side})
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '10px', marginTop: '2px' }}>
                      {alert.detail}
                    </div>
                  </div>
                  <div className="mono" style={{ textAlign: 'right', fontSize: '10px', color: 'var(--text-muted)' }}>
                    {new Date(alert.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
