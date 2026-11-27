import React, { useState } from 'react';
import {
  Radar, Bot, TrendingUp, TrendingDown, Play, Square, Sliders,
  ArrowUpRight, ArrowDownRight, Zap, Target, Shield, Check, Flame,
  BarChart2, Info, Activity, AlertTriangle, ChevronRight, Eye,
  Sparkles, Filter, RefreshCw, X, Cloud, Smartphone, Sun
} from 'lucide-react';

export function MarketScannerPanel({
  marketAnalysis,
  autopilotStatus,
  cloudEngine = { online: false },
  wakeLockEnabled = false,
  onToggleWakeLock,
  onStartAutoPilot,
  onStopAutoPilot,
  onUpdateAutoPilotConfig,
  onExecuteTradeSetup,
  onSelectCoin
}) {
  const [filter, setFilter] = useState('ALL'); // 'ALL' | 'HIGH_CONF' | 'BUY' | 'SELL' | 'DIVERGENCE' | 'SQUEEZE'
  const [sortBy, setSortBy] = useState('score'); // 'score' | 'winRate' | 'rr' | 'change'
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [selectedCoinModal, setSelectedCoinModal] = useState(null);
  const [minConfidence, setMinConfidence] = useState(autopilotStatus?.config?.minConfidence || 75);
  const [allocation, setAllocation] = useState(autopilotStatus?.config?.allocationUsdt || 300);
  const [direction, setDirection] = useState(autopilotStatus?.config?.directionPreference || 'BOTH');
  const [maxTrades, setMaxTrades] = useState(autopilotStatus?.config?.maxOpenTrades || 3);
  const [executingSymbol, setExecutingSymbol] = useState(null);

  React.useEffect(() => {
    if (autopilotStatus?.config) {
      if (autopilotStatus.config.minConfidence !== undefined) setMinConfidence(autopilotStatus.config.minConfidence);
      if (autopilotStatus.config.allocationUsdt !== undefined) setAllocation(autopilotStatus.config.allocationUsdt);
      if (autopilotStatus.config.directionPreference !== undefined) setDirection(autopilotStatus.config.directionPreference);
      if (autopilotStatus.config.maxOpenTrades !== undefined) setMaxTrades(autopilotStatus.config.maxOpenTrades);
    }
  }, [autopilotStatus]);

  const isAutoPilot = autopilotStatus?.isAutoPilotRunning || false;

  // Process & filter coins
  const rawCoins = (marketAnalysis || []).map(coin => {
    if (filter === 'BUY' && coin.longSetup) {
      return {
        ...coin,
        action: 'LONG',
        rating: coin.longSetup.rating,
        score: coin.longSetup.score,
        confidence: coin.longSetup.confidence,
        tpPrice: coin.longSetup.tpPrice,
        tp2Price: coin.longSetup.tp2Price,
        slPrice: coin.longSetup.slPrice,
        tpPct: coin.longSetup.tpPct,
        tp2Pct: coin.longSetup.tp2Pct,
        slPct: coin.longSetup.slPct,
        riskRewardRatio: coin.longSetup.riskRewardRatio,
        winRateProbability: coin.longSetup.winRateProbability,
        confluenceBreakdown: coin.longSetup.confluenceBreakdown
      };
    }
    if (filter === 'SELL' && coin.shortSetup) {
      return {
        ...coin,
        action: 'SHORT',
        rating: coin.shortSetup.rating,
        score: coin.shortSetup.score,
        confidence: coin.shortSetup.confidence,
        tpPrice: coin.shortSetup.tpPrice,
        tp2Price: coin.shortSetup.tp2Price,
        slPrice: coin.shortSetup.slPrice,
        tpPct: coin.shortSetup.tpPct,
        tp2Pct: coin.shortSetup.tp2Pct,
        slPct: coin.shortSetup.slPct,
        riskRewardRatio: coin.shortSetup.riskRewardRatio,
        winRateProbability: coin.shortSetup.winRateProbability,
        confluenceBreakdown: coin.shortSetup.confluenceBreakdown
      };
    }
    return coin;
  });

  // Calculate Market Telemetry
  const totalCoins = rawCoins.length;
  const longCount = rawCoins.filter(c => c.action === 'LONG').length;
  const shortCount = rawCoins.filter(c => c.action === 'SHORT').length;
  const highConfCount = rawCoins.filter(c => c.confidence >= 75).length;
  const divergenceCount = rawCoins.filter(c => c.divergence?.detected).length;
  const squeezeCount = rawCoins.filter(c => c.isSqueeze).length;
  const marketBullishPct = totalCoins > 0 ? Math.round((longCount / totalCoins) * 100) : 50;

  // Apply Filter
  const filteredCoins = rawCoins.filter(c => {
    if (filter === 'HIGH_CONF') return c.confidence >= 75;
    if (filter === 'DIVERGENCE') return Boolean(c.divergence?.detected);
    if (filter === 'SQUEEZE') return c.isSqueeze;
    if (filter === 'BUY') return c.action === 'LONG';
    if (filter === 'SELL') return c.action === 'SHORT';
    return true;
  });

  // Apply Sorting
  const sortedCoins = [...filteredCoins].sort((a, b) => {
    if (sortBy === 'winRate') return (b.winRateProbability || 50) - (a.winRateProbability || 50);
    if (sortBy === 'change') return Math.abs(b.change24h || 0) - Math.abs(a.change24h || 0);
    if (sortBy === 'rr') {
      const rrA = parseFloat((a.riskRewardRatio || '1:2.0').replace('1:', '')) || 2.0;
      const rrB = parseFloat((b.riskRewardRatio || '1:2.0').replace('1:', '')) || 2.0;
      return rrB - rrA;
    }
    // Default by score (distance from 50)
    return Math.abs(b.score - 50) - Math.abs(a.score - 50);
  });

  const handleSaveConfig = async () => {
    await onUpdateAutoPilotConfig({
      minConfidence: Number(minConfidence),
      allocationUsdt: Number(allocation),
      directionPreference: direction,
      maxOpenTrades: Number(maxTrades)
    });
    setIsConfigOpen(false);
  };

  const handleExecute = async (coin, e) => {
    if (e) e.stopPropagation();
    setExecutingSymbol(coin.symbol);
    try {
      await onExecuteTradeSetup({
        symbol: coin.symbol,
        side: coin.action,
        amountUsdt: allocation,
        leverage: coin.recommendedLeverage || 10,
        tp: coin.tpPrice,
        sl: coin.slPrice,
        trailingStopPct: 2.0
      });
    } finally {
      setTimeout(() => setExecutingSymbol(null), 1000);
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* ================= 1. HERO SCANNER HEADER & TELEMETRY ================= */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 20px',
        background: isAutoPilot ? 'rgba(0, 245, 160, 0.08)' : 'rgba(168, 85, 247, 0.08)',
        border: `1px solid ${isAutoPilot ? 'rgba(0, 245, 160, 0.35)' : 'rgba(168, 85, 247, 0.3)'}`,
        borderRadius: 'var(--radius-md)',
        flexWrap: 'wrap',
        gap: '14px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '12px',
            background: isAutoPilot ? 'linear-gradient(135deg, #00F5A0, #00D2FF)' : 'linear-gradient(135deg, #A855F7, #6366F1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: isAutoPilot ? '0 0 20px rgba(0, 245, 160, 0.5)' : '0 0 16px rgba(168, 85, 247, 0.35)'
          }}>
            <Radar size={24} color="#080B10" strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 800, fontSize: '18px', color: '#FFFFFF', letterSpacing: '-0.3px' }}>
                Institutional Market Scanner & Radar
              </span>
              <span style={{
                fontSize: '11px',
                fontWeight: 800,
                color: isAutoPilot ? 'var(--color-long)' : 'var(--color-ai)',
                background: isAutoPilot ? 'var(--color-long-subtle)' : 'rgba(168, 85, 247, 0.15)',
                padding: '3px 10px',
                borderRadius: '6px',
                border: `1px solid ${isAutoPilot ? 'rgba(0,245,160,0.3)' : 'rgba(168,85,247,0.3)'}`
              }}>
                {isAutoPilot ? '● AI AUTO-PILOT ACTIVE (AUTO-TRADING)' : '● SCANNER ACTIVE (4-PILLAR CONFLUENCE)'}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Multi-Timeframe 1H + 15M confirmation, RSI divergence detection, structural S&R pivots, and trap protection.
            </div>
          </div>
        </div>

        {/* Master Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', width: '100%', justifyContent: 'flex-start' }}>
          <button
            onClick={() => setIsConfigOpen(!isConfigOpen)}
            className="btn btn-outline"
            style={{ padding: '8px 14px', fontSize: '12px', gap: '6px' }}
          >
            <Sliders size={14} />
            <span>Auto-Pilot Config</span>
          </button>

          {isAutoPilot ? (
            <button
              onClick={onStopAutoPilot}
              className="btn btn-danger"
              style={{ padding: '10px 20px', fontSize: '12px', fontWeight: 800, gap: '6px', boxShadow: '0 0 15px rgba(255,51,102,0.4)' }}
            >
              <Square size={14} fill="currentColor" />
              STOP AUTO-PILOT
            </button>
          ) : (
            <button
              onClick={onStartAutoPilot}
              className="btn btn-primary"
              style={{ padding: '10px 20px', fontSize: '12px', fontWeight: 800, gap: '6px', boxShadow: '0 0 15px rgba(0,245,160,0.3)' }}
            >
              <Play size={14} fill="currentColor" />
              ACTIVATE AI AUTO-PILOT
            </button>
          )}
        </div>
      </div>

      {/* ================= 24/7 BACKGROUND EXECUTION STATUS ================= */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '8px',
        padding: '9px 12px',
        borderRadius: 'var(--radius-sm)',
        background: cloudEngine?.online ? 'rgba(0, 245, 160, 0.07)' : 'rgba(245, 158, 11, 0.08)',
        border: `1px solid ${cloudEngine?.online ? 'rgba(0, 245, 160, 0.28)' : 'rgba(245, 158, 11, 0.28)'}`,
        fontSize: '11px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', color: cloudEngine?.online ? '#00F5A0' : '#FBBF24', fontWeight: 700 }}>
          {cloudEngine?.online ? <Cloud size={14} /> : <Smartphone size={14} />}
          <span>
            {cloudEngine?.online
              ? '☁️ 24/7 Background Engine ONLINE — Safe to close phone app (Auto-Pilot + Native TP/SL keep running 24/7)'
              : '📱 Phone Standalone Mode — Native Binance TP/SL active; keep screen awake or run PC 24/7 Engine for background entries'}
          </span>
        </div>
        {!cloudEngine?.online && onToggleWakeLock && (
          <button
            type="button"
            onClick={onToggleWakeLock}
            style={{
              background: wakeLockEnabled ? 'rgba(0, 245, 160, 0.16)' : 'rgba(255,255,255,0.06)',
              border: `1px solid ${wakeLockEnabled ? '#00F5A0' : 'var(--border)'}`,
              color: wakeLockEnabled ? '#00F5A0' : '#E2E8F0',
              borderRadius: '5px',
              padding: '4px 9px',
              fontSize: '10.5px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <Sun size={12} />
            <span>{wakeLockEnabled ? 'Screen Awake: ON' : 'Keep Screen Awake'}</span>
          </button>
        )}
      </div>

      {/* ================= 2. LIVE TELEMETRY BAR ================= */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))',
        gap: '10px'
      }}>
        {/* Metric 1: Market Bias */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '12px 14px'
        }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
            <span>Market Trend Bias</span>
            <span style={{ fontWeight: 700, color: marketBullishPct >= 50 ? 'var(--color-long)' : 'var(--color-short)' }}>
              {marketBullishPct}% Bullish
            </span>
          </div>
          <div style={{
            height: '6px',
            background: 'var(--color-short)',
            borderRadius: '4px',
            overflow: 'hidden',
            marginTop: '8px',
            position: 'relative'
          }}>
            <div style={{
              width: `${marketBullishPct}%`,
              height: '100%',
              background: 'var(--color-long)',
              transition: 'width 0.4s ease'
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            <span>{longCount} Longs</span>
            <span>{shortCount} Shorts</span>
          </div>
        </div>

        {/* Metric 2: High Confluence Setups */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '12px 14px'
        }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>High-Probability Setups (≥75%)</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '4px' }}>
            <span className="mono" style={{ fontSize: '20px', fontWeight: 800, color: highConfCount > 0 ? '#00F5A0' : '#FFFFFF' }}>
              {highConfCount}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>/ {totalCoins} assets</span>
          </div>
        </div>

        {/* Metric 3: Active Divergences */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '12px 14px'
        }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>RSI Divergences Detected</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '4px' }}>
            <span className="mono" style={{ fontSize: '20px', fontWeight: 800, color: divergenceCount > 0 ? '#00D2FF' : '#94A3B8' }}>
              {divergenceCount}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Reversal / Continuation</span>
          </div>
        </div>

        {/* Metric 4: Squeeze Breakout Watch */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '12px 14px'
        }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Volatility Squeeze (BB)</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '4px' }}>
            <span className="mono" style={{ fontSize: '20px', fontWeight: 800, color: squeezeCount > 0 ? '#F59E0B' : '#94A3B8' }}>
              {squeezeCount}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Breakout Imminent</span>
          </div>
        </div>
      </div>

      {/* ================= 3. AUTO-PILOT CONFIG DRAWER ================= */}
      {isConfigOpen && (
        <div style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '16px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '14px',
          fontSize: '12px'
        }}>
          <div>
            <label style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
              Min Confidence to Auto-Trade (%)
            </label>
            <input
              type="number"
              min="60"
              max="95"
              value={minConfidence}
              onChange={(e) => setMinConfidence(e.target.value)}
              style={{ width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px', color: '#00F5A0', fontWeight: 700 }}
            />
          </div>

          <div>
            <label style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
              Margin Per Auto-Trade ($)
            </label>
            <input
              type="number"
              value={allocation}
              onChange={(e) => setAllocation(e.target.value)}
              style={{ width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px', color: '#fff', fontWeight: 700 }}
            />
          </div>

          <div>
            <label style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
              Direction Preference
            </label>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
              style={{ width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px', color: '#fff' }}
            >
              <option value="BOTH">Both (Long & Short)</option>
              <option value="LONG_ONLY">Long Only (Uptrend bias)</option>
              <option value="SHORT_ONLY">Short Only (Downtrend bias)</option>
            </select>
          </div>

          <div>
            <label style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
              Max Concurrent Auto Trades
            </label>
            <input
              type="number"
              min="1"
              max="6"
              value={maxTrades}
              onChange={(e) => setMaxTrades(e.target.value)}
              style={{ width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px', color: '#fff' }}
            />
          </div>

          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '8px' }}>
            <button onClick={handleSaveConfig} className="btn btn-primary" style={{ padding: '8px 20px', fontSize: '12px' }}>
              Save Auto-Pilot Parameters
            </button>
            <button onClick={() => setIsConfigOpen(false)} className="btn btn-outline" style={{ padding: '8px 16px', fontSize: '12px' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ================= 4. FILTER TABS & SORT CONTROLS ================= */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[
            { id: 'ALL', label: `All Cryptos (${totalCoins})` },
            { id: 'HIGH_CONF', label: `⚡ High Confluence (≥75%) [${highConfCount}]` },
            { id: 'BUY', label: `🟢 Long Setups (${longCount})` },
            { id: 'SELL', label: `🔴 Short Setups (${shortCount})` },
            { id: 'DIVERGENCE', label: `🎯 RSI Divergences (${divergenceCount})` },
            { id: 'SQUEEZE', label: `⚡ Squeeze Breakouts (${squeezeCount})` }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              style={{
                background: filter === tab.id ? 'var(--border)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${filter === tab.id ? 'var(--color-accent)' : 'var(--border-subtle)'}`,
                color: filter === tab.id ? '#FFFFFF' : 'var(--text-secondary)',
                borderRadius: '6px',
                padding: '6px 14px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Sort Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
          <span>Sort:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              color: '#FFFFFF',
              padding: '4px 8px',
              fontSize: '11px',
              cursor: 'pointer'
            }}
          >
            <option value="score">Confluence Score (Highest)</option>
            <option value="winRate">Est. Win-Rate (%)</option>
            <option value="rr">Risk : Reward Ratio</option>
            <option value="change">24h Volatility / Change</option>
          </select>
        </div>
      </div>

      {/* ================= 5. ENHANCED SCREENER CARDS GRID ================= */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))',
        gap: '14px'
      }}>
        {sortedCoins.map((coin) => {
          const isBuy = coin.action === 'LONG';
          const isStrong = coin.rating.includes('STRONG');
          const isUp = coin.change24h >= 0;
          const isMtfAligned = coin.mtfStatus?.startsWith('ALIGNED');
          const isCounterTrend = coin.mtfStatus?.includes('COUNTER_TREND');
          const breakdown = coin.confluenceBreakdown || { trend: 15, structure: 15, momentum: 15, volume: 15 };

          return (
            <div
              key={coin.symbol}
              onClick={() => setSelectedCoinModal(coin)}
              style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: `1px solid ${isStrong ? (isBuy ? 'rgba(0, 245, 160, 0.45)' : 'rgba(255, 51, 102, 0.45)') : 'var(--border)'}`,
                borderRadius: 'var(--radius-sm)',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                position: 'relative',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: isStrong ? (isBuy ? '0 0 16px rgba(0, 245, 160, 0.15)' : '0 0 16px rgba(255, 51, 102, 0.15)') : 'none'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = isBuy ? 'rgba(0, 245, 160, 0.7)' : 'rgba(255, 51, 102, 0.7)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = isStrong ? (isBuy ? 'rgba(0, 245, 160, 0.45)' : 'rgba(255, 51, 102, 0.45)') : 'var(--border)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              {/* Card Top: Symbol, Price & Rating Badge */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 800, fontSize: '16px', color: '#FFFFFF' }}>
                      {coin.base}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {coin.symbol}
                    </span>
                    {coin.isSqueeze && (
                      <span style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#F59E0B', fontSize: '9px', fontWeight: 800, padding: '1px 6px', borderRadius: '3px' }}>
                        ⚡ SQUEEZE
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '2px' }}>
                    <span className="mono" style={{ fontSize: '17px', fontWeight: 800, color: '#FFFFFF' }}>
                      ${coin.price.toLocaleString(undefined, { minimumFractionDigits: coin.pricePrecision, maximumFractionDigits: coin.pricePrecision })}
                    </span>
                    <span className="mono" style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: isUp ? 'var(--color-long)' : 'var(--color-short)'
                    }}>
                      {isUp ? '+' : ''}{coin.change24h.toFixed(2)}%
                    </span>
                  </div>
                </div>

                {/* Rating Badge */}
                <div style={{ textAlign: 'right' }}>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11px',
                    fontWeight: 800,
                    padding: '4px 10px',
                    borderRadius: '5px',
                    background: isBuy ? 'var(--color-long-subtle)' : 'var(--color-short-subtle)',
                    color: isBuy ? 'var(--color-long)' : 'var(--color-short)',
                    border: `1px solid ${isBuy ? 'rgba(0,245,160,0.35)' : 'rgba(255,51,102,0.35)'}`
                  }}>
                    {isBuy ? <ArrowUpRight size={14} strokeWidth={3} /> : <ArrowDownRight size={14} strokeWidth={3} />}
                    {coin.rating}
                  </span>
                  <div className="mono" style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px' }}>
                    Score: <strong style={{ color: isBuy ? '#00F5A0' : '#FF3366' }}>{coin.score}</strong>/100 (Est. {coin.winRateProbability || 78}% Win)
                  </div>
                </div>
              </div>

              {/* Multi-Timeframe Status Pill */}
              <div style={{
                background: isMtfAligned
                  ? (isBuy ? 'rgba(0, 245, 160, 0.08)' : 'rgba(255, 51, 102, 0.08)')
                  : isCounterTrend
                  ? 'rgba(245, 158, 11, 0.08)'
                  : 'rgba(255, 255, 255, 0.03)',
                border: `1px solid ${
                  isMtfAligned
                    ? (isBuy ? 'rgba(0, 245, 160, 0.25)' : 'rgba(255, 51, 102, 0.25)')
                    : isCounterTrend
                    ? 'rgba(245, 158, 11, 0.25)'
                    : 'var(--border-subtle)'
                }`,
                borderRadius: '5px',
                padding: '4px 8px',
                fontSize: '10.5px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                color: isMtfAligned ? (isBuy ? '#00F5A0' : '#FF3366') : isCounterTrend ? '#F59E0B' : 'var(--text-secondary)'
              }}>
                <span style={{ fontWeight: 700 }}>
                  {coin.mtfSummary || '1H + 15M Trend Analysis'}
                </span>
                {isMtfAligned && (
                  <span style={{ fontSize: '9px', fontWeight: 800, background: 'rgba(0,0,0,0.3)', padding: '1px 5px', borderRadius: '3px' }}>
                    MTF ALIGNED
                  </span>
                )}
              </div>

              {/* 4-Pillar Confluence Breakdown Progress Bar */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', marginBottom: '3px' }}>
                  <span>Confluence Pillars (Trend / Struct / Mom / Vol)</span>
                  <span className="mono">{breakdown.trend + breakdown.structure + breakdown.momentum + breakdown.volume}/100</span>
                </div>
                <div style={{
                  height: '5px',
                  borderRadius: '3px',
                  display: 'flex',
                  overflow: 'hidden',
                  background: 'rgba(255,255,255,0.06)',
                  gap: '2px'
                }}>
                  <div style={{ flex: breakdown.trend || 1, background: '#A855F7' }} title={`Trend: ${breakdown.trend}/25`} />
                  <div style={{ flex: breakdown.structure || 1, background: '#00D2FF' }} title={`Structure: ${breakdown.structure}/25`} />
                  <div style={{ flex: breakdown.momentum || 1, background: '#00F5A0' }} title={`Momentum: ${breakdown.momentum}/25`} />
                  <div style={{ flex: breakdown.volume || 1, background: '#F59E0B' }} title={`Volume: ${breakdown.volume}/25`} />
                </div>
              </div>

              {/* Dynamic Signal Badges (Divergence, Traps, Candle Pattern) */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', fontSize: '10px' }}>
                {coin.divergence && (
                  <span style={{
                    background: coin.divergence.type.startsWith('BULLISH') ? 'rgba(0, 245, 160, 0.15)' : 'rgba(255, 51, 102, 0.15)',
                    color: coin.divergence.type.startsWith('BULLISH') ? '#00F5A0' : '#FF3366',
                    border: `1px solid ${coin.divergence.type.startsWith('BULLISH') ? 'rgba(0,245,160,0.3)' : 'rgba(255,51,102,0.3)'}`,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontWeight: 700
                  }}>
                    ⚡ {coin.divergence.label}
                  </span>
                )}

                {coin.trapWarning && (
                  <span style={{
                    background: 'rgba(239, 35, 60, 0.15)',
                    color: '#EF233C',
                    border: '1px solid rgba(239, 35, 60, 0.3)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontWeight: 700
                  }}>
                    ⚠️ {coin.trapWarning}
                  </span>
                )}

                <span style={{ background: '#131A29', padding: '2px 6px', borderRadius: '4px', color: coin.rsi > 70 ? '#FF3366' : coin.rsi < 30 ? '#00F5A0' : '#94A3B8' }}>
                  RSI: <strong>{coin.rsi}</strong>
                </span>

                {coin.adx !== undefined && (
                  <span style={{
                    background: '#131A29',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    color: coin.isChoppy ? '#F59E0B' : '#00D2FF'
                  }}>
                    ADX: <strong>{coin.adx}</strong> {coin.isChoppy ? '(Chop)' : ''}
                  </span>
                )}

                {coin.entry5mConfirmed !== undefined && (
                  <span style={{
                    background: coin.entry5mConfirmed ? 'rgba(0, 245, 160, 0.14)' : '#131A29',
                    border: `1px solid ${coin.entry5mConfirmed ? 'rgba(0, 245, 160, 0.35)' : 'transparent'}`,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontWeight: 700,
                    color: coin.entry5mConfirmed ? '#00F5A0' : '#64748B'
                  }}>
                    {coin.entry5mConfirmed ? '✅ 5M Ready' : '⏳ 5M Wait'}
                  </span>
                )}

                {coin.vwap !== undefined && (
                  <span style={{
                    background: '#131A29',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    color: coin.priceAboveVwap ? '#00F5A0' : '#FF3366'
                  }}>
                    {coin.priceAboveVwap ? '▲ VWAP' : '▼ VWAP'}
                  </span>
                )}

                {coin.volumeSurgeRatio > 1.2 && (
                  <span style={{ background: '#131A29', padding: '2px 6px', borderRadius: '4px', color: '#00D2FF' }}>
                    Vol: <strong>{coin.volumeSurgeRatio}x</strong>
                  </span>
                )}

                {coin.candlePatterns && coin.candlePatterns.length > 0 && (
                  <span style={{ background: '#131A29', padding: '2px 6px', borderRadius: '4px', color: '#A855F7' }}>
                    🕯️ {coin.candlePatterns[0]}
                  </span>
                )}
              </div>

              {/* Support & Resistance Proximity Bar */}
              {coin.structureLevels && (
                <div style={{
                  background: 'rgba(0,0,0,0.2)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '4px',
                  padding: '6px 8px',
                  fontSize: '9.5px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div style={{ color: 'var(--color-long)' }}>
                    Supp: <strong>${coin.structureLevels.support?.toLocaleString()}</strong> (-{coin.structureLevels.distToSupportPct}%)
                  </div>
                  <div style={{ color: 'var(--text-muted)' }}>|</div>
                  <div style={{ color: 'var(--color-short)' }}>
                    Res: <strong>${coin.structureLevels.resistance?.toLocaleString()}</strong> (+{coin.structureLevels.distToResistancePct}%)
                  </div>
                </div>
              )}

              {/* Suggested Setup Box: TP1, TP2, SL & R:R */}
              <div style={{
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                padding: '10px',
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '8px',
                fontSize: '10px'
              }}>
                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Target TP1</div>
                  <div className="mono" style={{ fontWeight: 800, color: 'var(--color-long)', fontSize: '11px' }}>
                    ${coin.tpPrice?.toLocaleString(undefined, { minimumFractionDigits: coin.pricePrecision || 2, maximumFractionDigits: coin.pricePrecision || 4 })}
                  </div>
                  <div style={{ fontSize: '9px', color: 'var(--color-long)' }}>
                    +{coin.tpPct || '3.5'}% (Safe)
                  </div>
                </div>

                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Target TP2</div>
                  <div className="mono" style={{ fontWeight: 800, color: '#00D2FF', fontSize: '11px' }}>
                    ${coin.tp2Price?.toLocaleString(undefined, { minimumFractionDigits: coin.pricePrecision || 2, maximumFractionDigits: coin.pricePrecision || 4 })}
                  </div>
                  <div style={{ fontSize: '9px', color: '#00D2FF' }}>
                    +{coin.tp2Pct || '6.8'}% (Runner)
                  </div>
                </div>

                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Stop Loss</div>
                  <div className="mono" style={{ fontWeight: 800, color: 'var(--color-short)', fontSize: '11px' }}>
                    ${coin.slPrice?.toLocaleString(undefined, { minimumFractionDigits: coin.pricePrecision || 2, maximumFractionDigits: coin.pricePrecision || 4 })}
                  </div>
                  <div style={{ fontSize: '9px', color: 'var(--color-short)' }}>
                    -{coin.slPct || '1.8'}% (R:R {coin.riskRewardRatio})
                  </div>
                </div>
              </div>

              {/* Action Buttons: 1-Click Execute Setup + Deep Blueprint + View Chart */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr auto', gap: '8px', marginTop: '2px' }}>
                <button
                  onClick={(e) => handleExecute(coin, e)}
                  disabled={executingSymbol === coin.symbol || coin.action === 'HOLD'}
                  className={isBuy ? 'btn btn-long' : 'btn btn-short'}
                  style={{ padding: '8px 10px', fontSize: '11px', borderRadius: '5px' }}
                >
                  <Zap size={13} />
                  {executingSymbol === coin.symbol ? 'Executing...' : `1-Click ${coin.action}`}
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedCoinModal(coin);
                  }}
                  className="btn btn-outline"
                  style={{ padding: '8px 8px', fontSize: '11px', borderRadius: '5px', gap: '4px' }}
                >
                  <Sparkles size={12} color="#00D2FF" />
                  <span>Blueprint</span>
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onSelectCoin) onSelectCoin(coin.symbol);
                  }}
                  className="btn btn-outline"
                  style={{ padding: '8px 10px', fontSize: '11px', borderRadius: '5px' }}
                  title="View Chart"
                >
                  <BarChart2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ================= 6. DEEP ANALYSIS BLUEPRINT MODAL ================= */}
      {selectedCoinModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px'
        }} onClick={() => setSelectedCoinModal(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#0D131F',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              width: '100%',
              maxWidth: '680px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '18px',
              boxShadow: '0 10px 40px rgba(0,0,0,0.8)'
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontWeight: 800, fontSize: '20px', color: '#FFFFFF' }}>
                    {selectedCoinModal.name} ({selectedCoinModal.symbol})
                  </span>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: selectedCoinModal.action === 'LONG' ? 'var(--color-long-subtle)' : 'var(--color-short-subtle)',
                    color: selectedCoinModal.action === 'LONG' ? 'var(--color-long)' : 'var(--color-short)'
                  }}>
                    {selectedCoinModal.rating}
                  </span>
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Mark Price: <strong style={{ color: '#fff' }}>${selectedCoinModal.price.toLocaleString()}</strong> | 24h Change: {selectedCoinModal.change24h > 0 ? '+' : ''}{selectedCoinModal.change24h.toFixed(2)}%
                </div>
              </div>

              <button
                onClick={() => setSelectedCoinModal(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* MTF Analysis Banner */}
            <div style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '12px 16px'
            }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Multi-Timeframe Structure & Alignment
              </div>
              <div style={{ fontWeight: 700, fontSize: '14px', color: '#00D2FF' }}>
                {selectedCoinModal.mtfSummary}
              </div>
              {selectedCoinModal.invalidationRule && (
                <div style={{ fontSize: '11px', color: '#F59E0B', marginTop: '6px' }}>
                  ⚠️ Invalidation Condition: {selectedCoinModal.invalidationRule}
                </div>
              )}
            </div>

            {/* 4-Pillar Confluence Breakdown */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#FFFFFF', marginBottom: '8px' }}>
                4-Pillar Institutional Confluence Audit (Score: {selectedCoinModal.score}/100)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '10px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Pillar 1: Multi-Timeframe Trend</div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#A855F7', marginTop: '2px' }}>
                    {selectedCoinModal.confluenceBreakdown?.trend || 20} / 25 pts
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    1H SuperTrend, EMA 9/21/50 alignment & ADX
                  </div>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '10px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Pillar 2: Market Structure & S/R</div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#00D2FF', marginTop: '2px' }}>
                    {selectedCoinModal.confluenceBreakdown?.structure || 18} / 25 pts
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Support tests, Resistance breakout & Hammer wicks
                  </div>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '10px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Pillar 3: Momentum & Divergence</div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#00F5A0', marginTop: '2px' }}>
                    {selectedCoinModal.confluenceBreakdown?.momentum || 22} / 25 pts
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    RSI Divergence, StochRSI Cross & MACD momentum
                  </div>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '10px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Pillar 4: Volume & Volatility</div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#F59E0B', marginTop: '2px' }}>
                    {selectedCoinModal.confluenceBreakdown?.volume || 19} / 25 pts
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    On-Balance Volume (OBV), Volume surge & BB squeeze
                  </div>
                </div>
              </div>
            </div>

            {/* Catalysts & Highlights */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#FFFFFF', marginBottom: '6px' }}>
                Key Technical Highlights
              </div>
              <ul style={{ paddingLeft: '18px', fontSize: '11.5px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {(selectedCoinModal.highlights || []).map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </div>

            {/* Structural Targets Box */}
            <div style={{
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '14px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
              gap: '10px',
              textAlign: 'center'
            }}>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Entry Price</div>
                <div className="mono" style={{ fontSize: '13px', fontWeight: 800, color: '#FFFFFF', marginTop: '2px' }}>
                  ${selectedCoinModal.price.toLocaleString()}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--color-long)' }}>Target TP1 (Safe)</div>
                <div className="mono" style={{ fontSize: '13px', fontWeight: 800, color: 'var(--color-long)', marginTop: '2px' }}>
                  ${selectedCoinModal.tpPrice?.toLocaleString()}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#00D2FF' }}>Target TP2 (Runner)</div>
                <div className="mono" style={{ fontSize: '13px', fontWeight: 800, color: '#00D2FF', marginTop: '2px' }}>
                  ${selectedCoinModal.tp2Price?.toLocaleString()}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--color-short)' }}>Stop Loss (Invalidation)</div>
                <div className="mono" style={{ fontSize: '13px', fontWeight: 800, color: 'var(--color-short)', marginTop: '2px' }}>
                  ${selectedCoinModal.slPrice?.toLocaleString()}
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
              <button
                onClick={(e) => {
                  handleExecute(selectedCoinModal, e);
                  setSelectedCoinModal(null);
                }}
                className={selectedCoinModal.action === 'LONG' ? 'btn btn-long' : 'btn btn-short'}
                style={{ flex: 1, padding: '12px', fontSize: '13px', fontWeight: 800 }}
              >
                <Zap size={15} />
                Execute 1-Click {selectedCoinModal.action} (${allocation} Margin)
              </button>

              <button
                onClick={() => {
                  const sym = selectedCoinModal.symbol;
                  setSelectedCoinModal(null);
                  if (onSelectCoin) onSelectCoin(sym);
                }}
                className="btn btn-outline"
                style={{ padding: '12px 20px', fontSize: '13px', gap: '6px' }}
              >
                <BarChart2 size={15} />
                Open in Terminal Chart
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
