import React, { useState } from 'react';
import { Play, TrendingUp, BarChart2, ShieldCheck, Award, AlertTriangle, ArrowUpRight, ArrowDownRight, Layers } from 'lucide-react';

export function BacktesterPanel({ strategies, pairs, onRunBacktest }) {
  const [strategyId, setStrategyId] = useState('trend_following');
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('15m');
  const [capital, setCapital] = useState(10000);
  const [leverage, setLeverage] = useState(10);
  const [stopLossPct, setStopLossPct] = useState(4.0);
  const [takeProfitPct, setTakeProfitPct] = useState(8.0);
  const [marginCloseRatio, setMarginCloseRatio] = useState(80);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState(null);

  const handleRun = async () => {
    setIsLoading(true);
    try {
      const data = await onRunBacktest({
        strategyId,
        symbol,
        timeframe,
        initialCapital: Number(capital),
        allocationPerTrade: Number(capital) * 0.1,
        leverage: Number(leverage),
        stopLossPct: Number(stopLossPct),
        takeProfitPct: Number(takeProfitPct),
        marginAutoCloseRatio: Number(marginCloseRatio),
        candleCount: 150
      });
      setResults(data);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: '36px',
          height: '36px',
          borderRadius: '8px',
          background: 'linear-gradient(135deg, #A855F7 0%, #00D2FF 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <BarChart2 size={20} color="#080B10" />
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: '16px', color: '#FFFFFF' }}>
            Quantitative Strategy Backtester
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Simulate algorithmic performance on historical Binance candle data
          </div>
        </div>
      </div>

      {/* Configuration Controls */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
        <div>
          <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
            Strategy
          </label>
          <select
            value={strategyId}
            onChange={(e) => setStrategyId(e.target.value)}
            style={{ width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px', color: '#fff', fontSize: '12px' }}
          >
            {strategies.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
            Pair
          </label>
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            style={{ width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px', color: '#fff', fontSize: '12px' }}
          >
            {pairs.map(p => (
              <option key={p.symbol} value={p.symbol}>{p.symbol}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
            Timeframe
          </label>
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value)}
            style={{ width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px', color: '#fff', fontSize: '12px' }}
          >
            <option value="5m">5m (Scalping)</option>
            <option value="15m">15m (Day Trading)</option>
            <option value="1h">1h (Swing Trading)</option>
            <option value="4h">4h (Macro Waves)</option>
          </select>
        </div>

        <div>
          <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
            Leverage
          </label>
          <input
            type="number"
            value={leverage}
            onChange={(e) => setLeverage(Number(e.target.value))}
            style={{ width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px', color: '#fff', fontSize: '12px' }}
          />
        </div>

        <div>
          <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
            Stop Loss (%)
          </label>
          <input
            type="number"
            value={stopLossPct}
            onChange={(e) => setStopLossPct(Number(e.target.value))}
            style={{ width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px', color: 'var(--color-short)', fontSize: '12px' }}
          />
        </div>

        <div>
          <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
            Take Profit (%)
          </label>
          <input
            type="number"
            value={takeProfitPct}
            onChange={(e) => setTakeProfitPct(Number(e.target.value))}
            style={{ width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px', color: 'var(--color-long)', fontSize: '12px' }}
          />
        </div>
      </div>

      {/* Run Button */}
      <button
        onClick={handleRun}
        disabled={isLoading}
        className="btn btn-primary"
        style={{ padding: '12px', fontSize: '14px', width: '100%' }}
      >
        <Play size={16} fill="currentColor" />
        {isLoading ? 'SIMULATING QUANTITATIVE STRATEGY...' : 'RUN QUANTITATIVE SIMULATION'}
      </button>

      {/* Results Dashboard */}
      {results && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '10px' }}>
          {/* Key Metrics Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: '6px', padding: '12px' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Net Profit</div>
              <div className="mono" style={{ fontSize: '16px', fontWeight: 800, color: results.netProfit >= 0 ? 'var(--color-long)' : 'var(--color-short)' }}>
                {results.netProfit >= 0 ? '+' : ''}${results.netProfit} ({results.netProfitPct}%)
              </div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: '6px', padding: '12px' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Win Rate</div>
              <div className="mono" style={{ fontSize: '16px', fontWeight: 800, color: '#00D2FF' }}>
                {results.winRate}% ({results.winningTrades}W / {results.losingTrades}L)
              </div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: '6px', padding: '12px' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Profit Factor</div>
              <div className="mono" style={{ fontSize: '16px', fontWeight: 800, color: '#FFFFFF' }}>
                {results.profitFactor}
              </div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: '6px', padding: '12px' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Max Drawdown</div>
              <div className="mono" style={{ fontSize: '16px', fontWeight: 800, color: 'var(--color-short)' }}>
                -{results.maxDrawdownPct}% (${results.maxDrawdown})
              </div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: '6px', padding: '12px' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Sharpe Ratio</div>
              <div className="mono" style={{ fontSize: '16px', fontWeight: 800, color: '#A855F7' }}>
                {results.sharpeRatio}
              </div>
            </div>
          </div>

          {/* Historical Trade Log */}
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Simulated Trade Executions
            </div>
            <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {results.trades.map((t) => {
                const isWin = t.pnl >= 0;
                return (
                  <div
                    key={t.id}
                    style={{
                      background: 'rgba(255,255,255,0.02)',
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
                      <div style={{ fontWeight: 700, color: t.side === 'LONG' ? 'var(--color-long)' : 'var(--color-short)' }}>
                        {t.side} {t.symbol} ({t.reason})
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                        Entry: ${t.entryPrice} → Exit: ${t.exitPrice}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="mono" style={{ fontWeight: 800, color: isWin ? 'var(--color-long)' : 'var(--color-short)' }}>
                        {isWin ? '+' : ''}${t.pnl} ({isWin ? '+' : ''}{t.roePct}%)
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
