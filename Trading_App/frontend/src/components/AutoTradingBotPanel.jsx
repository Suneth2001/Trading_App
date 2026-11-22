import React, { useState } from 'react';
import { Play, Square, Bot, Sliders, Shield, Zap, CheckCircle2, AlertTriangle, ArrowUpRight, ArrowDownRight, Compass } from 'lucide-react';

export function AutoTradingBotPanel({ botStatus, strategies, onStartBot, onStopBot, onUpdateConfig }) {
  const isRunning = botStatus?.isRunning || false;
  const [selectedStrategy, setSelectedStrategy] = useState(botStatus?.activeStrategyId || 'trend_following');
  const [direction, setDirection] = useState(botStatus?.direction || 'BOTH'); // 'BOTH' | 'LONG_ONLY' | 'SHORT_ONLY'
  const [allocation, setAllocation] = useState(botStatus?.allocationUsdt || 500);
  const [leverage, setLeverage] = useState(botStatus?.leverage || 10);
  const [timeframe, setTimeframe] = useState(botStatus?.timeframe || '15m');
  const [stopLossPct, setStopLossPct] = useState(botStatus?.stopLossPct || 4.0);
  const [takeProfitPct, setTakeProfitPct] = useState(botStatus?.takeProfitPct || 8.0);

  React.useEffect(() => {
    if (!botStatus) return;
    if (botStatus.activeStrategyId) setSelectedStrategy(botStatus.activeStrategyId);
    if (botStatus.direction) setDirection(botStatus.direction);
    if (botStatus.allocationUsdt !== undefined) setAllocation(botStatus.allocationUsdt);
    if (botStatus.leverage !== undefined) setLeverage(botStatus.leverage);
    if (botStatus.timeframe) setTimeframe(botStatus.timeframe);
    if (botStatus.stopLossPct !== undefined) setStopLossPct(botStatus.stopLossPct);
    if (botStatus.takeProfitPct !== undefined) setTakeProfitPct(botStatus.takeProfitPct);
  }, [botStatus?.activeStrategyId, botStatus?.direction, botStatus?.allocationUsdt, botStatus?.leverage, botStatus?.timeframe, botStatus?.stopLossPct, botStatus?.takeProfitPct]);

  const currentStratInfo = strategies.find(s => s.id === selectedStrategy) || strategies[0];

  const handleApplyConfig = async () => {
    await onUpdateConfig({
      activeStrategyId: selectedStrategy,
      direction,
      allocationUsdt: allocation,
      leverage,
      timeframe,
      stopLossPct,
      takeProfitPct
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Mode: {direction === 'BOTH' ? 'Bi-Directional (Long & Short)' : direction} | 24/7 Engine
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
            Both (Long & Short)
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

      {/* Strategy Selection & Info Card */}
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

        {currentStratInfo && (
          <div style={{
            marginTop: '8px',
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
      </div>

      {/* Bot Parameters Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
        {/* Margin Per Trade */}
        <div>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
            Margin Per Trade ($)
          </label>
          <input
            type="number"
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

        {/* Stop Loss % */}
        <div>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
            Auto Stop-Loss (%)
          </label>
          <input
            type="number"
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
        style={{ padding: '8px', fontSize: '12px', alignSelf: 'flex-start' }}
      >
        Update Bot Strategy Parameters
      </button>

      {/* Live Activity & Signal Log Stream */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
            Live Bot Event Stream
          </span>
          <span className="mono" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
            Active Monitoring Loop: 3.0s
          </span>
        </div>

        <div style={{
          background: '#06090F',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)',
          padding: '10px',
          maxHeight: '160px',
          overflowY: 'auto',
          fontSize: '11px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px'
        }}>
          {(botStatus?.recentLogs || []).length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
              Engine standby. Click "START AUTO BOT" to activate live execution.
            </div>
          ) : (
            botStatus.recentLogs.map((log) => {
              let logColor = '#94A3B8';
              if (log.type === 'ORDER') logColor = '#00F5A0';
              if (log.type === 'ERROR') logColor = '#FF3366';
              if (log.type === 'SIGNAL') logColor = '#00D2FF';

              return (
                <div key={log.id} style={{ display: 'flex', gap: '8px', color: logColor }}>
                  <span className="mono" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
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
