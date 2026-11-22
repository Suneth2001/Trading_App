import React, { useState } from 'react';
import { ArrowUpRight, ArrowDownRight, Shield, Zap, Percent, Sliders, DollarSign, Target, AlertCircle } from 'lucide-react';

export function OrderTerminal({ activeSymbol, currentPrice, balance, onExecuteOrder }) {
  const [side, setSide] = useState('LONG'); // 'LONG' | 'SHORT'
  const [leverage, setLeverage] = useState(10);
  const [marginAmount, setMarginAmount] = useState('250');
  const [tpPct, setTpPct] = useState('8');
  const [slPct, setSlPct] = useState('4');
  const [trailingStop, setTrailingStop] = useState(true);
  const [trailingStopPct, setTrailingStopPct] = useState('2.0');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const available = (balance?.availableBalance !== undefined && balance?.availableBalance !== null)
    ? Number(balance.availableBalance)
    : (balance?.isLive ? 0 : 10000);
  const numMargin = parseFloat(marginAmount) || 0;
  const positionValue = numMargin * leverage;
  const estimatedCoins = currentPrice > 0 ? (positionValue / currentPrice).toFixed(4) : '0';

  // Liquidation calculation estimate
  let estLiq = 0;
  if (currentPrice > 0 && leverage > 0) {
    if (side === 'LONG') {
      estLiq = currentPrice * (1 - (1 / leverage) + 0.005);
    } else {
      estLiq = currentPrice * (1 + (1 / leverage) - 0.005);
    }
  }

  // Risk and Reward in Dollars
  const dollarRisk = numMargin * (parseFloat(slPct || 4) / 100);
  const dollarReward = numMargin * (parseFloat(tpPct || 8) / 100);

  // Target prices
  const targetTpPrice = currentPrice > 0 ? (
    side === 'LONG' ? currentPrice * (1 + (parseFloat(tpPct || 8) / 100 / leverage)) :
                     currentPrice * (1 - (parseFloat(tpPct || 8) / 100 / leverage))
  ) : 0;

  const targetSlPrice = currentPrice > 0 ? (
    side === 'LONG' ? currentPrice * (1 - (parseFloat(slPct || 4) / 100 / leverage)) :
                     currentPrice * (1 + (parseFloat(slPct || 4) / 100 / leverage))
  ) : 0;

  // Handle Quick Percent Click
  const handleQuickPercent = (pct) => {
    if (available <= 0) {
      setMarginAmount('0');
      return;
    }
    const val = Math.floor((available * pct) / 100);
    setMarginAmount(val > 0 ? val.toString() : '0');
  };

  const handleSubmit = async () => {
    if (available <= 0) {
      alert(`Insufficient balance in Binance Futures wallet ($${available.toFixed(2)} USDT). Please transfer USDT to your Binance USD-M Futures wallet to execute live trades!`);
      return;
    }
    if (numMargin <= 0 || numMargin > available) {
      alert(`Invalid margin amount. Available: $${available.toFixed(2)} USDT`);
      return;
    }
    setIsSubmitting(true);
    try {
      await onExecuteOrder({
        symbol: activeSymbol,
        side,
        amountUsdt: numMargin,
        leverage,
        tp: targetTpPrice,
        sl: targetSlPrice,
        trailingStopPct: trailingStop ? parseFloat(trailingStopPct) : null
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Side Toggle: LONG vs SHORT */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', background: 'var(--bg-secondary)', padding: '4px', borderRadius: 'var(--radius-sm)' }}>
        <button
          onClick={() => setSide('LONG')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '10px',
            borderRadius: '6px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 800,
            fontSize: '13px',
            transition: 'all 0.2s ease',
            background: side === 'LONG' ? 'linear-gradient(135deg, #00F5A0, #059669)' : 'transparent',
            color: side === 'LONG' ? '#07090E' : 'var(--text-secondary)',
            boxShadow: side === 'LONG' ? '0 0 12px rgba(0, 245, 160, 0.35)' : 'none'
          }}
        >
          <ArrowUpRight size={16} strokeWidth={3} />
          LONG (BUY)
        </button>

        <button
          onClick={() => setSide('SHORT')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '10px',
            borderRadius: '6px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 800,
            fontSize: '13px',
            transition: 'all 0.2s ease',
            background: side === 'SHORT' ? 'linear-gradient(135deg, #FF3366, #E11D48)' : 'transparent',
            color: side === 'SHORT' ? '#FFFFFF' : 'var(--text-secondary)',
            boxShadow: side === 'SHORT' ? '0 0 12px rgba(255, 51, 102, 0.35)' : 'none'
          }}
        >
          <ArrowDownRight size={16} strokeWidth={3} />
          SHORT (SELL)
        </button>
      </div>

      {/* Leverage Slider */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', fontSize: '11px' }}>
          <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Sliders size={12} /> Leverage (Isolated Margin)
          </span>
          <span className="mono" style={{ fontWeight: 800, color: side === 'LONG' ? 'var(--color-long)' : 'var(--color-short)', fontSize: '13px' }}>
            {leverage}x
          </span>
        </div>

        <input
          type="range"
          min="1"
          max="50"
          value={leverage}
          onChange={(e) => setLeverage(Number(e.target.value))}
          style={{ width: '100%', accentColor: side === 'LONG' ? '#00F5A0' : '#FF3366', cursor: 'pointer' }}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3px' }}>
          {[1, 5, 10, 20, 50].map((lev) => (
            <button
              key={lev}
              onClick={() => setLeverage(lev)}
              style={{
                background: leverage === lev ? 'var(--border)' : 'transparent',
                border: '1px solid var(--border-subtle)',
                color: leverage === lev ? '#FFFFFF' : 'var(--text-muted)',
                borderRadius: '4px',
                padding: '1px 5px',
                fontSize: '10px',
                cursor: 'pointer'
              }}
            >
              {lev}x
            </button>
          ))}
        </div>
      </div>

      {/* Margin Amount Input & Presets */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', fontSize: '11px' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Position Margin (USDT)</span>
          <span className="mono" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
            Avail: ${available.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '6px 10px'
        }}>
          <span style={{ color: 'var(--text-muted)', marginRight: '6px', fontWeight: 700 }}>$</span>
          <input
            type="number"
            value={marginAmount}
            onChange={(e) => setMarginAmount(e.target.value)}
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              color: '#FFFFFF',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              fontSize: '14px',
              outline: 'none'
            }}
          />
          <span style={{ color: 'var(--text-secondary)', fontSize: '11px', fontWeight: 600 }}>USDT</span>
        </div>

        {/* Quick Dollar Presets */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px', marginTop: '6px' }}>
          {[50, 100, 250, 500, 1000].map((val) => (
            <button
              key={val}
              onClick={() => setMarginAmount(val.toString())}
              style={{
                background: marginAmount === val.toString() ? 'var(--border)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${marginAmount === val.toString() ? 'var(--color-accent)' : 'var(--border-subtle)'}`,
                color: marginAmount === val.toString() ? '#00D2FF' : 'var(--text-muted)',
                borderRadius: '6px',
                padding: '6px 0',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              ${val}
            </button>
          ))}
        </div>
      </div>

      {/* Target TP & SL Config */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <div style={{ background: 'rgba(0, 245, 160, 0.04)', padding: '8px', borderRadius: '6px', border: '1px solid rgba(0, 245, 160, 0.15)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '2px' }}>
            <span style={{ color: 'var(--color-long)', fontWeight: 700 }}>Take-Profit</span>
            <span className="mono" style={{ color: 'var(--color-long)' }}>+${dollarReward.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <input
              type="number"
              value={tpPct}
              onChange={(e) => setTpPct(e.target.value)}
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                color: 'var(--color-long)',
                fontFamily: 'var(--font-mono)',
                fontSize: '13px',
                fontWeight: 700,
                outline: 'none'
              }}
            />
            <span style={{ fontSize: '11px', color: 'var(--color-long)', fontWeight: 700 }}>%</span>
          </div>
          <div className="mono" style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Target: ${targetTpPrice > 0 ? targetTpPrice.toFixed(2) : '---'}
          </div>
        </div>

        <div style={{ background: 'rgba(255, 51, 102, 0.04)', padding: '8px', borderRadius: '6px', border: '1px solid rgba(255, 51, 102, 0.15)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '2px' }}>
            <span style={{ color: 'var(--color-short)', fontWeight: 700 }}>Stop-Loss</span>
            <span className="mono" style={{ color: 'var(--color-short)' }}>-${dollarRisk.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <input
              type="number"
              value={slPct}
              onChange={(e) => setSlPct(e.target.value)}
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                color: 'var(--color-short)',
                fontFamily: 'var(--font-mono)',
                fontSize: '13px',
                fontWeight: 700,
                outline: 'none'
              }}
            />
            <span style={{ fontSize: '11px', color: 'var(--color-short)', fontWeight: 700 }}>%</span>
          </div>
          <div className="mono" style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Stop: ${targetSlPrice > 0 ? targetSlPrice.toFixed(2) : '---'}
          </div>
        </div>
      </div>

      {/* Trailing Stop Lock Checkbox */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={trailingStop}
            onChange={(e) => setTrailingStop(e.target.checked)}
            style={{ accentColor: '#00D2FF', cursor: 'pointer' }}
          />
          <span>Trailing Stop Lock</span>
        </label>
        {trailingStop && (
          <span className="mono" style={{ color: '#00D2FF', fontWeight: 700 }}>
            {trailingStopPct}% Pullback
          </span>
        )}
      </div>

      {/* Position Value & Liquidation Summary */}
      <div style={{
        background: 'rgba(0,0,0,0.25)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-sm)',
        padding: '8px 10px',
        fontSize: '10px',
        display: 'flex',
        flexDirection: 'column',
        gap: '3px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-muted)' }}>Notional Value:</span>
          <span className="mono" style={{ color: '#FFFFFF', fontWeight: 600 }}>
            ${positionValue.toLocaleString(undefined, { minimumFractionDigits: 2 })} ({estimatedCoins} {activeSymbol.replace('USDT', '')})
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-muted)' }}>Est. Liquidation Price:</span>
          <span className="mono" style={{ color: '#F59E0B', fontWeight: 700 }}>
            ${estLiq > 0 ? estLiq.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '---'}
          </span>
        </div>
      </div>

      {/* Submit Button */}
      <button
        onClick={handleSubmit}
        disabled={isSubmitting}
        className={side === 'LONG' ? 'btn btn-long' : 'btn btn-short'}
        style={{ width: '100%', padding: '11px', fontSize: '13px' }}
      >
        <Zap size={15} />
        {isSubmitting ? 'EXECUTING...' : `EXECUTE ${side} POSITION`}
      </button>
    </div>
  );
}
