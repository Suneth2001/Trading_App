import React, { useState } from 'react';
import { Play, Square, Bot, Zap, ArrowUpRight, ArrowDownRight, Compass, Radio } from 'lucide-react';

export function AutoTradingBotPanel({
  botStatus,
  strategies = [],
  pairs = [],
  activeSymbol = 'BTCUSDT',
  isLive = false,
  availableBalance = 0,
  onStartBot,
  onStopBot,
  onUpdateConfig
}) {
  const isRunning = botStatus?.isRunning || false;
  const [selectedStrategy, setSelectedStrategy] = useState(botStatus?.activeStrategyId || 'trend_following');
  const [symbol, setSymbol] = useState(botStatus?.symbol || 'AUTO_BEST');
  const [direction, setDirection] = useState(botStatus?.direction || 'BOTH'); // 'BOTH' | 'LONG_ONLY' | 'SHORT_ONLY'
  const [allocation, setAllocation] = useState(botStatus?.allocationUsdt ?? 500);
  const [leverage, setLeverage] = useState(botStatus?.leverage ?? 10);
  const [timeframe, setTimeframe] = useState(botStatus?.timeframe || '15m');
  const [stopLossPct, setStopLossPct] = useState(botStatus?.stopLossPct ?? 4.0);
  const [takeProfitPct, setTakeProfitPct] = useState(botStatus?.takeProfitPct ?? 8.0);

  React.useEffect(() => {
    if (!botStatus) return;
    if (botStatus.activeStrategyId) setSelectedStrategy(botStatus.activeStrategyId);
    if (botStatus.symbol) setSymbol(botStatus.symbol);
    if (botStatus.direction) setDirection(botStatus.direction);
    if (botStatus.allocationUsdt !== undefined) setAllocation(botStatus.allocationUsdt);
    if (botStatus.leverage !== undefined) setLeverage(botStatus.leverage);
    if (botStatus.timeframe) setTimeframe(botStatus.timeframe);
    if (botStatus.stopLossPct !== undefined) setStopLossPct(botStatus.stopLossPct);
    if (botStatus.takeProfitPct !== undefined) setTakeProfitPct(botStatus.takeProfitPct);
  }, [
    botStatus?.activeStrategyId,
    botStatus?.symbol,
    botStatus?.direction,
    botStatus?.allocationUsdt,
    botStatus?.leverage,
    botStatus?.timeframe,
    botStatus?.stopLossPct,
    botStatus?.takeProfitPct
  ]);

  const currentStratInfo = strategies.find(s => s.id === selectedStrategy) || strategies[0];
  const scan = botStatus?.lastScanSummary;

  const handleApplyConfig = async () => {
    await onUpdateConfig({
      activeStrategyId: selectedStrategy,
      symbol,
      direction,
      allocationUsdt: Number(allocation),
      leverage: Number(leverage),
      timeframe,
      stopLossPct: Number(stopLossPct),
      takeProfitPct: Number(takeProfitPct)
    });
  };

  return (
    <div className="glass-panel" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Bot Header & Master Switch */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        background: isRunning ? 'rgba(0, 245, 160, 0.08)' : 'rgba(255, 51, 102, 0.08)',
        border: `1px solid ${isRunning ? 'rgba(0, 245, 160, 0.3)' : 'rgba(255, 51, 102, 0.3)'}`,
        borderRadius: 'var(--radius-md)',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: isRunning ? 'linear-gradient(135deg, #00F5A0, #00D2FF)' : '#1E293B',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: isRunning ? '0 0 15px rgba(0, 245, 160, 0.4)' : 'none'
          }}>
            <Bot size={22} color={isRunning ? '#07090E' : '#94A3B8'} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 800, fontSize: '15px', color: '#FFFFFF' }}>
                Algorithmic Auto-Trader
              </span>
              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                color: isRunning ? 'var(--color-long)' : 'var(--color-short)',
                background: isRunning ? 'var(--color-long-subtle)' : 'var(--color-short-subtle)',
                padding: '2px 8px',
                borderRadius: '4px'
              }}>
                {isRunning ? 'RUNNING AUTOMATICALLY' : 'STOPPED'}
              </span>
              <span style={{
                fontSize: '10px',
                fontWeight: 800,
                color: isLive ? '#F59E0B' : '#00D2FF',
                background: isLive ? 'rgba(245, 158, 11, 0.14)' : 'rgba(0, 210, 255, 0.12)',
                border: `1px solid ${isLive ? 'rgba(245, 158, 11, 0.35)' : 'rgba(0, 210, 255, 0.3)'}`,
                padding: '2px 7px',
                borderRadius: '4px'
              }}>
                {isLive ? `LIVE BINANCE ($${availableBalance.toFixed(2)})` : `PAPER DEMO ($${availableBalance.toFixed(2)})`}
              </span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Pair: {symbol === 'AUTO_BEST' ? 'AI Auto-Select Best Coin' : symbol} | Mode: {direction === 'BOTH' ? 'Bi-Directional (Long & Short)' : direction} | {timeframe}
            </div>
          </div>
        </div>

        {/* Start / Stop Button */}
        {isRunning ? (
          <button
            onClick={onStopBot}
            className="btn btn-danger"
            style={{ padding: '10px 20px', fontSize: '13px', fontWeight: 800, gap: '6px' }}
          >
            <Square size={16} fill="currentColor" />
            STOP AUTO BOT
          </button>
        ) : (
          <button
            onClick={async () => {
              await handleApplyConfig();
              await onStartBot();
            }}
            className="btn btn-primary"
            style={{ padding: '10px 20px', fontSize: '13px', fontWeight: 800, gap: '6px' }}
          >
            <Play size={16} fill="currentColor" />
            START AUTO BOT
          </button>
        )}
      </div>

      {/* Live Scan Telemetry Strip */}
      {isRunning && scan && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
          padding: '9px 12px',
          borderRadius: 'var(--radius-sm)',
          background: 'rgba(0, 210, 255, 0.06)',
          border: '1px solid rgba(0, 210, 255, 0.22)',
          fontSize: '11px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#00D2FF', fontWeight: 700 }}>
            <Radio size={14} />
            <span>Active Scan: {scan.symbol} (${scan.price})</span>
          </div>
          <div className="mono" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', color: 'var(--text-secondary)' }}>
            <span>
              Signal:{' '}
              <strong style={{
                color: scan.signal === 'LONG' ? 'var(--color-long)' : scan.signal === 'SHORT' ? 'var(--color-short)' : '#94A3B8'
              }}>
                {scan.signal} ({scan.confidence}%)
              </strong>
            </span>
            <span>RSI: <strong>{scan.rsi}</strong></span>
            <span>Size: <strong>${scan.effectiveMargin} × {scan.effectiveLeverage}x</strong></span>
            {scan.holdingSide && (
              <span style={{ color: '#F59E0B', fontWeight: 700 }}>Holding {scan.holdingSide}</span>
            )}
          </div>
        </div>
      )}

      {/* Small Live Wallet Notice */}
      {isLive && availableBalance > 0 && availableBalance < 10 && (
        <div style={{
          padding: '8px 12px',
          borderRadius: 'var(--radius-sm)',
          background: 'rgba(245, 158, 11, 0.08)',
          border: '1px solid rgba(245, 158, 11, 0.28)',
          fontSize: '11px',
          color: '#FBBF24'
        }}>
          ⚡ Live Small-Wallet Auto-Scaling Active (${availableBalance.toFixed(2)} USDT): The bot automatically scales margin &amp; leverage to satisfy Binance&apos;s $5.50 minimum notional and selects affordable pairs (DOGE, XRP, ADA, SUI, NEAR, SOL).
        </div>
      )}

      {/* Direction Mode Selector: BOTH, LONG ONLY, SHORT ONLY */}
      <div>
        <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
          Trading Direction Mode
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(95px, 1fr))', gap: '8px' }}>
          <button
            onClick={() => setDirection('BOTH')}
            style={{
              padding: '10px 8px',
              borderRadius: '8px',
              border: `1px solid ${direction === 'BOTH' ? 'var(--color-accent)' : 'var(--border)'}`,
              background: direction === 'BOTH' ? 'rgba(0, 210, 255, 0.12)' : 'rgba(255,255,255,0.02)',
              color: direction === 'BOTH' ? '#00D2FF' : 'var(--text-secondary)',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <Compass size={14} />
            Both (Long &amp; Short)
          </button>

          <button
            onClick={() => setDirection('LONG_ONLY')}
            style={{
              padding: '10px 8px',
              borderRadius: '8px',
              border: `1px solid ${direction === 'LONG_ONLY' ? 'var(--color-long)' : 'var(--border)'}`,
              background: direction === 'LONG_ONLY' ? 'var(--color-long-subtle)' : 'rgba(255,255,255,0.02)',
              color: direction === 'LONG_ONLY' ? 'var(--color-long)' : 'var(--text-secondary)',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <ArrowUpRight size={14} />
            Long Only
          </button>

          <button
            onClick={() => setDirection('SHORT_ONLY')}
            style={{
              padding: '10px 8px',
              borderRadius: '8px',
              border: `1px solid ${direction === 'SHORT_ONLY' ? 'var(--color-short)' : 'var(--border)'}`,
              background: direction === 'SHORT_ONLY' ? 'var(--color-short-subtle)' : 'rgba(255,255,255,0.02)',
              color: direction === 'SHORT_ONLY' ? 'var(--color-short)' : 'var(--text-secondary)',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <ArrowDownRight size={14} />
            Short Only
          </button>
        </div>
      </div>

      {/* Target Pair + Strategy Selection */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
              Target Trading Pair
            </label>
            <button
              type="button"
              onClick={() => setSymbol(activeSymbol)}
              style={{
                background: 'rgba(0, 210, 255, 0.1)',
                border: '1px solid rgba(0, 210, 255, 0.25)',
                color: '#00D2FF',
                borderRadius: '4px',
                padding: '2px 7px',
                fontSize: '10px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Use {activeSymbol}
            </button>
          </div>
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            style={{
              width: '100%',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px 12px',
              color: '#00F5A0',
              fontWeight: 700,
              fontSize: '13px',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="AUTO_BEST" style={{ background: '#0F1523', color: '#00F5A0' }}>
              🤖 AI Auto-Select Best Coin (All Pairs)
            </option>
            {pairs.map((p) => (
              <option key={p.symbol} value={p.symbol} style={{ background: '#0F1523', color: '#fff' }}>
                {p.symbol} — {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
            Active Algorithmic Strategy
          </label>
          <select
            value={selectedStrategy}
            onChange={(e) => setSelectedStrategy(e.target.value)}
            style={{
              width: '100%',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px 12px',
              color: '#FFFFFF',
              fontWeight: 700,
              fontSize: '13px',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            {strategies.map((strat) => (
              <option key={strat.id} value={strat.id} style={{ background: '#0F1523', color: '#fff' }}>
                {strat.name} ({strat.riskLevel} Risk)
              </option>
            ))}
          </select>
        </div>
      </div>

      {currentStratInfo && (
        <div style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)',
          padding: '10px',
          fontSize: '11px',
          color: 'var(--text-secondary)',
          lineHeight: '1.4'
        }}>
          {currentStratInfo.description}
        </div>
      )}

      {/* Bot Parameters Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(115px, 1fr))', gap: '10px' }}>
        {/* Margin Per Trade */}
        <div>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
            Margin Per Trade ($)
          </label>
          <input
            type="number"
            step="0.1"
            value={allocation}
            onChange={(e) => setAllocation(Number(e.target.value))}
            style={{
              width: '100%',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px',
              color: '#FFFFFF',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              fontSize: '13px',
              outline: 'none'
            }}
          />
        </div>

        {/* Leverage */}
        <div>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
            Leverage (x)
          </label>
          <input
            type="number"
            min="1"
            max="50"
            value={leverage}
            onChange={(e) => setLeverage(Number(e.target.value))}
            style={{
              width: '100%',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px',
              color: '#FFFFFF',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              fontSize: '13px',
              outline: 'none'
            }}
          />
        </div>

        {/* Timeframe */}
        <div>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
            Timeframe
          </label>
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value)}
            style={{
              width: '100%',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px',
              color: '#00D2FF',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              fontSize: '13px',
              outline: 'none'
            }}
          >
            {['1m', '5m', '15m', '1h'].map(tf => (
              <option key={tf} value={tf} style={{ background: '#0F1523', color: '#fff' }}>{tf}</option>
            ))}
          </select>
        </div>

        {/* Stop Loss % */}
        <div>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
            Auto Stop-Loss (%)
          </label>
          <input
            type="number"
            step="0.5"
            value={stopLossPct}
            onChange={(e) => setStopLossPct(Number(e.target.value))}
            style={{
              width: '100%',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px',
              color: 'var(--color-short)',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              fontSize: '13px',
              outline: 'none'
            }}
          />
        </div>

        {/* Take Profit % */}
        <div>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
            Auto Take-Profit (%)
          </label>
          <input
            type="number"
            step="0.5"
            value={takeProfitPct}
            onChange={(e) => setTakeProfitPct(Number(e.target.value))}
            style={{
              width: '100%',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px',
              color: 'var(--color-long)',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              fontSize: '13px',
              outline: 'none'
            }}
          />
        </div>
      </div>

      {/* Save Settings Button */}
      <button
        onClick={handleApplyConfig}
        className="btn btn-outline"
        style={{ padding: '8px 14px', fontSize: '12px', alignSelf: 'flex-start', gap: '6px' }}
      >
        <Zap size={13} />
        Update Bot Strategy Parameters
      </button>

      {/* Live Activity & Signal Log Stream */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
            Live Bot Event Stream
          </span>
          <span className="mono" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
            Active Monitoring Loop: 3.5s
          </span>
        </div>

        <div style={{
          background: '#06090F',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)',
          padding: '10px',
          maxHeight: '180px',
          overflowY: 'auto',
          fontSize: '11px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px'
        }}>
          {(botStatus?.recentLogs || []).length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
              Engine standby. Click &quot;START AUTO BOT&quot; to activate live execution.
            </div>
          ) : (
            botStatus.recentLogs.map((log) => {
              let logColor = '#94A3B8';
              if (log.type === 'ORDER' || log.type === 'SUCCESS') logColor = '#00F5A0';
              if (log.type === 'ERROR') logColor = '#FF3366';
              if (log.type === 'SIGNAL') logColor = '#00D2FF';

              return (
                <div key={log.id} style={{ display: 'flex', gap: '8px', color: logColor }}>
                  <span className="mono" style={{ color: 'var(--text-muted)', fontSize: '10px', flexShrink: 0 }}>
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span>{log.message}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
