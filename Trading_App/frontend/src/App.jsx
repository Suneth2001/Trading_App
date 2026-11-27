import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import confetti from 'canvas-confetti';
import { Header } from './components/Header';
import { TickerTape } from './components/TickerTape';
import { ChartSection } from './components/ChartSection';
import { OrderTerminal } from './components/OrderTerminal';
import { OrderBookPanel } from './components/OrderBookPanel';
import { PositionsPanel } from './components/PositionsPanel';
import { MarketScannerPanel } from './components/MarketScannerPanel';
import { AutoTradingBotPanel } from './components/AutoTradingBotPanel';
import { MarginGuardianPanel } from './components/MarginGuardianPanel';
import { TradingViewWebhookModal } from './components/TradingViewWebhookModal';
import { BacktesterPanel } from './components/BacktesterPanel';
import { AiIntelligencePanel } from './components/AiIntelligencePanel';
import { BottomNav } from './components/BottomNav';
import { SettingsModal } from './components/SettingsModal';
import { soundFX } from './utils/audioAlerts';
import { getSocketUrl } from './utils/apiConfig';
import { standaloneEngine, STRATEGIES, DEFAULT_PAIRS } from './utils/standaloneEngine';

export function App() {
  const [activeSymbol, setActiveSymbol] = useState(() => localStorage.getItem('apex_active_symbol') || 'BTCUSDT');
  const [pairs, setPairs] = useState(() => [...DEFAULT_PAIRS]);
  const [prices, setPrices] = useState(() => ({ ...standaloneEngine.prices }));
  const [tickerStats, setTickerStats] = useState({});
  const [candles, setCandles] = useState([]);
  const [timeframe, setTimeframe] = useState(() => localStorage.getItem('apex_active_timeframe') || '15m');
  const [indicators, setIndicators] = useState(null);
  const [account, setAccount] = useState(() => standaloneEngine.getAccountSummary());
  const [positions, setPositions] = useState(() => [...standaloneEngine.getActivePositions()]);
  const [history, setHistory] = useState(() => [...standaloneEngine.orderHistory]);
  const [botStatus, setBotStatus] = useState(() => ({ ...standaloneEngine.botStatus }));
  const [strategies, setStrategies] = useState(() => [...STRATEGIES]);
  const [guardianSettings, setGuardianSettings] = useState(() => ({ ...standaloneEngine.guardianSettings }));
  const [marketAnalysis, setMarketAnalysis] = useState(() => [...(standaloneEngine.marketAnalysisCache || [])]);
  const [autopilotStatus, setAutopilotStatus] = useState(() => ({ ...standaloneEngine.autopilotStatus }));
  const [aiData, setAiData] = useState(null);
  const [webhookData, setWebhookData] = useState(null);

  // UI Navigation & Modals (Persisted across app restarts)
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('apex_active_tab') || 'terminal');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTradingViewOpen, setIsTradingViewOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('apex_sound_enabled') !== 'false');
  const [notification, setNotification] = useState(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);

  const socketRef = useRef(null);
  const touchStartYRef = useRef(0);
  const touchStartXRef = useRef(0);
  const isPullingRef = useRef(false);

  // Initialize Socket.io and fetch Initial State
  useEffect(() => {
    const socket = io(getSocketUrl(), { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    // Load Initial Config
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        if (data.pairs) setPairs(data.pairs);
        if (data.strategies) setStrategies(data.strategies);
      })
      .catch(console.error);

    // Load Initial Account
    fetch('/api/account')
      .then(res => res.json())
      .then(data => {
        if (data.summary) setAccount(data.summary);
        if (data.positions) setPositions(data.positions);
        if (data.history) setHistory(data.history);
      })
      .catch(console.error);

    // Auto-restore live Binance credentials from localStorage if present
    const savedKey = localStorage.getItem('binance_api_key');
    const savedSecret = localStorage.getItem('binance_api_secret');
    const savedTestnet = localStorage.getItem('binance_use_testnet') === 'true';

    if (savedKey && savedSecret) {
      fetch('/api/account/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: savedKey,
          apiSecret: savedSecret,
          useTestnet: savedTestnet
        })
      })
      .then(res => res.json())
      .then(data => {
        if (data && data.success) {
          if (data.summary) setAccount(data.summary);
          if (data.positions) setPositions(data.positions);
        }
      })
      .catch(console.error);
    }

    // Load Initial Guardian Settings
    fetch('/api/guardian/settings')
      .then(res => res.json())
      .then(data => setGuardianSettings(data))
      .catch(console.error);

    // Load Initial Bot Status
    fetch('/api/bot/status')
      .then(res => res.json())
      .then(data => setBotStatus(data))
      .catch(console.error);

    // Load Initial Auto-Pilot Status
    fetch('/api/autopilot/status')
      .then(res => res.json())
      .then(data => setAutopilotStatus(data))
      .catch(console.error);

    // Load Initial Market Analysis
    fetch('/api/market/analysis')
      .then(res => res.json())
      .then(data => setMarketAnalysis(data || []))
      .catch(console.error);

    // Load Webhook Info
    fetch('/api/webhook/logs')
      .then(res => res.json())
      .then(data => setWebhookData(data))
      .catch(console.error);

    // Socket Event Listeners & Single-Master Backend Coordination
    socket.on('connect', () => {
      standaloneEngine.setExternalBackendActive(true);
    });

    socket.on('disconnect', () => {
      standaloneEngine.setExternalBackendActive(false);
    });

    socket.on('connect_error', () => {
      standaloneEngine.setExternalBackendActive(false);
    });

    socket.on('price_tick', ({ symbol, price, stats }) => {
      setPrices(prev => ({ ...prev, [symbol]: price }));
      if (stats) {
        setTickerStats(prev => ({ ...prev, [symbol]: stats }));
      }
    });

    socket.on('positions_update', (pos) => {
      setPositions(pos || []);
    });

    socket.on('account_summary', (acc) => {
      if (acc) setAccount(acc);
    });

    socket.on('bot_status', (status) => {
      if (status) setBotStatus(status);
    });

    socket.on('market_analysis_update', (analysis) => {
      if (Array.isArray(analysis)) setMarketAnalysis(analysis);
    });

    socket.on('autopilot_status', (status) => {
      if (status) setAutopilotStatus(status);
    });

    socket.on('guardian_settings', (g) => {
      if (g) setGuardianSettings(g);
    });

    socket.on('autopilot_trade', (tradeAlert) => {
      soundFX.playOrderPing();
      confetti({ particleCount: 50, spread: 45, origin: { y: 0.8 } });
      showNotification(`🤖 ${tradeAlert.message}`, 'SUCCESS');
    });

    socket.on('autopilot_error', (errData) => {
      if (errData?.message) {
        showNotification(`⚠️ Auto-Pilot: ${errData.message}`, 'DANGER');
      }
    });

    socket.on('bot_log', (log) => {
      setBotStatus(prev => ({
        ...prev,
        recentLogs: [log, ...(prev.recentLogs || [])].slice(0, 50)
      }));
    });

    socket.on('position_opened', (pos) => {
      soundFX.playOrderPing();
      showNotification(`⚡ Position Opened: ${pos.side} ${pos.symbol} (${pos.leverage}x)`, 'SUCCESS');
    });

    socket.on('position_closed', (closed) => {
      if (closed.realizedPnl > 0) {
        soundFX.playProfitChime();
        confetti({ particleCount: 60, spread: 50, origin: { y: 0.8 } });
        showNotification(`🎉 Take Profit: +$${closed.realizedPnl} (+${closed.roePct}%) on ${closed.symbol}`, 'SUCCESS');
      } else {
        showNotification(`Closed ${closed.side} ${closed.symbol}: $${closed.realizedPnl} (${closed.reason})`, 'INFO');
      }
      // Refresh history
      fetch('/api/account')
        .then(r => r.json())
        .then(d => {
          if (d.history) setHistory(d.history);
        });
    });

    socket.on('margin_guardian_alert', (alertData) => {
      soundFX.playMarginAlert();
      showNotification(`🚨 MARGIN GUARDIAN TRIGGER: ${alertData.detail}`, 'DANGER');
      fetch('/api/guardian/settings')
        .then(r => r.json())
        .then(d => setGuardianSettings(d));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Subscribe to Embedded Standalone Engine events when external Socket.io is offline
  useEffect(() => {
    standaloneEngine.start();
    const unsubs = [
      standaloneEngine.on('price_tick', ({ symbol, price, stats }) => {
        if (socketRef.current?.connected) return;
        setPrices(prev => ({ ...prev, [symbol]: price }));
        if (stats) setTickerStats(prev => ({ ...prev, [symbol]: stats }));
      }),
      standaloneEngine.on('positions_update', (pos) => {
        if (socketRef.current?.connected) return;
        setPositions(pos || []);
      }),
      standaloneEngine.on('account_summary', (acc) => {
        if (socketRef.current?.connected) return;
        if (acc) setAccount(acc);
      }),
      standaloneEngine.on('bot_status', (status) => {
        if (socketRef.current?.connected) return;
        if (status) setBotStatus(status);
      }),
      standaloneEngine.on('market_analysis_update', (analysis) => {
        if (socketRef.current?.connected) return;
        if (Array.isArray(analysis)) setMarketAnalysis(analysis);
      }),
      standaloneEngine.on('autopilot_status', (status) => {
        if (socketRef.current?.connected) return;
        if (status) setAutopilotStatus(status);
      }),
      standaloneEngine.on('autopilot_trade', (tradeAlert) => {
        if (socketRef.current?.connected) return;
        soundFX.playOrderPing();
        confetti({ particleCount: 50, spread: 45, origin: { y: 0.8 } });
        showNotification(`🤖 ${tradeAlert.message}`, 'SUCCESS');
      }),
      standaloneEngine.on('autopilot_error', (errData) => {
        if (socketRef.current?.connected) return;
        if (errData?.message) {
          showNotification(`⚠️ Auto-Pilot: ${errData.message}`, 'DANGER');
        }
      }),
      standaloneEngine.on('bot_log', (log) => {
        if (socketRef.current?.connected) return;
        setBotStatus(prev => ({
          ...prev,
          recentLogs: [log, ...(prev.recentLogs || [])].slice(0, 50)
        }));
      }),
      standaloneEngine.on('position_opened', (pos) => {
        if (socketRef.current?.connected) return;
        soundFX.playOrderPing();
        showNotification(`⚡ Position Opened: ${pos.side} ${pos.symbol} (${pos.leverage}x)`, 'SUCCESS');
      }),
      standaloneEngine.on('position_closed', (closed) => {
        if (socketRef.current?.connected) return;
        if (closed.realizedPnl > 0) {
          soundFX.playProfitChime();
          confetti({ particleCount: 60, spread: 50, origin: { y: 0.8 } });
          showNotification(`🎉 Take Profit: +$${closed.realizedPnl} (+${closed.roePct}%) on ${closed.symbol}`, 'SUCCESS');
        } else {
          showNotification(`Closed ${closed.side} ${closed.symbol}: $${closed.realizedPnl} (${closed.reason})`, 'INFO');
        }
        fetch('/api/account')
          .then(r => r.json())
          .then(d => {
            if (d.history) setHistory(d.history);
          });
      }),
      standaloneEngine.on('margin_guardian_alert', (alertData) => {
        if (socketRef.current?.connected) return;
        soundFX.playMarginAlert();
        showNotification(`🚨 MARGIN GUARDIAN TRIGGER: ${alertData.detail}`, 'DANGER');
        fetch('/api/guardian/settings')
          .then(r => r.json())
          .then(d => setGuardianSettings(d));
      })
    ];
    return () => unsubs.forEach(fn => fn && fn());
  }, []);

  // Persist active UI selections & mirror active bot/autopilot state to standaloneEngine localStorage
  useEffect(() => {
    try { localStorage.setItem('apex_active_symbol', activeSymbol); } catch {}
  }, [activeSymbol]);

  useEffect(() => {
    try { localStorage.setItem('apex_active_timeframe', timeframe); } catch {}
  }, [timeframe]);

  useEffect(() => {
    try { localStorage.setItem('apex_active_tab', activeTab); } catch {}
  }, [activeTab]);

  useEffect(() => {
    try { localStorage.setItem('apex_sound_enabled', soundEnabled ? 'true' : 'false'); } catch {}
  }, [soundEnabled]);

  // Fetch Klines & Indicators whenever symbol or timeframe changes
  useEffect(() => {
    const tf = (timeframe || '15m').toLowerCase();
    const fetchMarketSnapshot = () => {
      fetch(`/api/klines?symbol=${activeSymbol}&interval=${tf}&limit=100`)
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) setCandles(data);
        })
        .catch(console.error);

      fetch(`/api/indicators?symbol=${activeSymbol}&interval=${tf}`)
        .then(res => res.json())
        .then(data => setIndicators(data))
        .catch(console.error);

      fetch(`/api/ai/analysis?symbol=${activeSymbol}&timeframe=${tf}`)
        .then(res => res.json())
        .then(data => setAiData(data))
        .catch(console.error);
    };

    fetchMarketSnapshot();
    const timer = setInterval(fetchMarketSnapshot, activeTab === 'ai' ? 12000 : 30000);
    return () => clearInterval(timer);
  }, [activeSymbol, timeframe, activeTab]);

  const showNotification = (message, type = 'INFO') => {
    setNotification({ message, type, id: Date.now() });
    setTimeout(() => {
      setNotification(prev => (prev?.message === message ? null : prev));
    }, 4500);
  };

  // Actions
  const handleExecuteOrder = async (orderPayload) => {
    try {
      const res = await fetch('/api/order/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload)
      });
      const data = await res.json();
      if (!res.ok) {
        showNotification(`Order Failed: ${data.error || 'Unknown error'}`, 'DANGER');
      } else {
        if (data.summary) setAccount(data.summary);
        if (data.positions) setPositions(data.positions);
      }
      return data;
    } catch (err) {
      showNotification(`Order Error: ${err.message}`, 'DANGER');
      return { error: err.message };
    }
  };

  const handleRefreshAccount = async () => {
    try {
      const savedKey = localStorage.getItem('binance_api_key');
      const savedSecret = localStorage.getItem('binance_api_secret');
      const savedTestnet = localStorage.getItem('binance_use_testnet') === 'true';

      if (savedKey && savedSecret) {
        const keyRes = await fetch('/api/account/api-keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiKey: savedKey,
            apiSecret: savedSecret,
            useTestnet: savedTestnet
          })
        });
        const keyData = await keyRes.json();
        if (keyData && keyData.summary) setAccount(keyData.summary);
        if (keyData && keyData.positions) setPositions(keyData.positions);
      }

      const tf = (timeframe || '15m').toLowerCase();
      const [accRes, klineRes, indRes, scanRes] = await Promise.all([
        fetch('/api/account'),
        fetch(`/api/klines?symbol=${activeSymbol}&interval=${tf}&limit=100`),
        fetch(`/api/indicators?symbol=${activeSymbol}&interval=${tf}`),
        fetch('/api/market/analysis')
      ]);

      const d = await accRes.json();
      if (d.summary) setAccount(d.summary);
      if (d.positions) setPositions(d.positions);
      if (d.history) setHistory(d.history);

      const kData = await klineRes.json();
      if (Array.isArray(kData)) setCandles(kData);

      const iData = await indRes.json();
      if (iData) setIndicators(iData);

      const sData = await scanRes.json();
      if (Array.isArray(sData)) setMarketAnalysis(sData);

      soundFX.playOrderPing();
      showNotification('🔄 Live Binance Equity, Positions & Market Reloaded!', 'SUCCESS');
    } catch (e) {
      showNotification('Refresh failed: ' + e.message, 'DANGER');
    }
  };

  // Mobile Pull-Down-to-Reload (Pull-to-Refresh) Gesture
  useEffect(() => {
    const onTouchStart = (e) => {
      if (isSettingsOpen || isTradingViewOpen || isPullRefreshing) return;
      if (window.scrollY > 8) return;
      const touch = e.touches?.[0];
      if (!touch) return;
      touchStartYRef.current = touch.clientY;
      touchStartXRef.current = touch.clientX;
      isPullingRef.current = true;
    };

    const onTouchMove = (e) => {
      if (!isPullingRef.current || isPullRefreshing) return;
      if (window.scrollY > 8) {
        isPullingRef.current = false;
        setPullDistance(0);
        return;
      }
      const touch = e.touches?.[0];
      if (!touch) return;
      const dy = touch.clientY - touchStartYRef.current;
      const dx = Math.abs(touch.clientX - touchStartXRef.current);

      // Ignore horizontal swipes (e.g. TickerTape or Chart pan)
      if (dx > dy || dy <= 12) {
        setPullDistance(0);
        return;
      }

      const damped = Math.min(130, Math.round((dy - 12) * 0.55));
      setPullDistance(damped);
    };

    const onTouchEnd = async () => {
      if (!isPullingRef.current) return;
      isPullingRef.current = false;

      if (pullDistance >= 65) {
        const shouldHardReload = pullDistance >= 115;
        setIsPullRefreshing(true);
        setPullDistance(65);
        try {
          if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            for (const r of regs) {
              try { await r.update(); } catch {}
            }
          }
          await handleRefreshAccount();
          if (shouldHardReload) {
            setTimeout(() => window.location.reload(), 350);
            return;
          }
        } finally {
          setTimeout(() => {
            setIsPullRefreshing(false);
            setPullDistance(0);
          }, 500);
        }
      } else {
        setPullDistance(0);
      }
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [pullDistance, isPullRefreshing, isSettingsOpen, isTradingViewOpen, activeSymbol, timeframe]);

  const handleClosePosition = async (positionId) => {
    try {
      const res = await fetch('/api/order/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positionId })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showNotification('Position closed successfully!', 'SUCCESS');
        // Instantly reload account & positions
        const accRes = await fetch('/api/account');
        const accData = await accRes.json();
        if (accData.summary) setAccount(accData.summary);
        if (accData.positions) setPositions(accData.positions);
        if (accData.history) setHistory(accData.history);
      } else {
        showNotification(data.error || 'Failed to close position', 'DANGER');
      }
      return data;
    } catch (err) {
      showNotification('Close error: ' + err.message, 'DANGER');
    }
  };

  const handlePanicCloseAll = async () => {
    if (confirm('EMERGENCY: Close all open crypto positions immediately?')) {
      try {
        const res = await fetch('/api/order/close-all', { method: 'POST' });
        const data = await res.json();
        showNotification(`🚨 Panic closed ${data.count || 0} positions!`, 'DANGER');
        // Instantly reload account & positions
        const accRes = await fetch('/api/account');
        const accData = await accRes.json();
        if (accData.summary) setAccount(accData.summary);
        if (accData.positions) setPositions(accData.positions);
        if (accData.history) setHistory(accData.history);
      } catch (err) {
        showNotification('Panic close error: ' + err.message, 'DANGER');
      }
    }
  };

  const handleToggleLive = async () => {
    const nextMode = !account.isLive;
    if (nextMode) {
      if (!confirm('Switch to BINANCE LIVE trading mode? Real trades will be sent to Binance API!')) return;
    }
    try {
      const res = await fetch('/api/account/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isLive: nextMode })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        soundFX.playMarginAlert();
        showNotification(data.error || 'Failed to switch trading mode', 'DANGER');
        return;
      }
      if (data.summary) {
        setAccount(data.summary);
      } else {
        setAccount(prev => ({ ...prev, isLive: data.isLive }));
      }
      if (data.positions) {
        setPositions(data.positions);
      }
      showNotification(nextMode ? 'Switched to LIVE Binance Trading' : 'Switched to PAPER Demo Trading', 'INFO');
    } catch (err) {
      showNotification(`Mode error: ${err.message}`, 'DANGER');
    }
  };

  const handleStartBot = async () => {
    const res = await fetch('/api/bot/start', { method: 'POST' });
    const data = await res.json();
    setBotStatus(data);
    showNotification('🚀 Algorithmic Auto-Trading Bot is now ACTIVE!', 'SUCCESS');
  };

  const handleStopBot = async () => {
    const res = await fetch('/api/bot/stop', { method: 'POST' });
    const data = await res.json();
    setBotStatus(data);
    showNotification('🛑 Auto-Trading Bot Stopped', 'INFO');
  };

  const handleUpdateBotConfig = async (config) => {
    const res = await fetch('/api/bot/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    const data = await res.json();
    setBotStatus(data);
    showNotification('Bot strategy config updated', 'INFO');
  };

  const handleStartAutoPilot = async () => {
    const res = await fetch('/api/autopilot/start', { method: 'POST' });
    const data = await res.json();
    setAutopilotStatus(data);
    showNotification('🤖 AI Auto-Pilot ACTIVE: Automatically trading highest confidence setups!', 'SUCCESS');
  };

  const handleStopAutoPilot = async () => {
    const res = await fetch('/api/autopilot/stop', { method: 'POST' });
    const data = await res.json();
    setAutopilotStatus(data);
    showNotification('AI Auto-Pilot paused', 'INFO');
  };

  const handleUpdateAutoPilotConfig = async (cfg) => {
    const res = await fetch('/api/autopilot/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg)
    });
    const data = await res.json();
    setAutopilotStatus(data);
    showNotification('Auto-Pilot settings saved', 'INFO');
  };

  const handleUpdateGuardianSettings = async (settings) => {
    const res = await fetch('/api/guardian/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    const data = await res.json();
    setGuardianSettings(data);
    return data;
  };

  const handleRunBacktest = async (params) => {
    const res = await fetch('/api/backtest/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    return await res.json();
  };

  const handleSendTestWebhook = async (payload) => {
    const res = await fetch('/api/webhook/tradingview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  };

  const handleSaveApiKeys = async (keys) => {
    try {
      const res = await fetch('/api/account/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(keys)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.summary) setAccount(data.summary);
        if (data.positions) setPositions(data.positions);
        soundFX.playOrderPing();
        confetti({ particleCount: 60, spread: 60, origin: { y: 0.6 } });
        showNotification(data.message || 'Connected to Binance Live!', 'SUCCESS');
      } else {
        soundFX.playMarginAlert();
        showNotification(`Binance Error: ${data.error || 'Authentication failed'}`, 'DANGER');
      }
      return data;
    } catch (err) {
      showNotification(`Connection error: ${err.message}`, 'DANGER');
      return { success: false, error: err.message };
    }
  };

  const handleResetDemoBalance = async () => {
    if (confirm('Reset paper demo wallet balance to $10,000 USDT?')) {
      await fetch('/api/account/reset', { method: 'POST' });
      showNotification('Paper Wallet reset to $10,000 USDT', 'SUCCESS');
    }
  };

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundFX.toggleSound(next);
  };

  const handleUpdateWebhookSecret = async (secret) => {
    const res = await fetch('/api/webhook/secret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret })
    });
    const data = await res.json();
    setWebhookData(prev => ({ ...prev, secret: data.secret }));
  };

  return (
    <div className="app-container">
      {/* Mobile Pull-Down-to-Reload Indicator */}
      {(pullDistance > 0 || isPullRefreshing) && (
        <div
          style={{
            position: 'fixed',
            top: `${Math.min(72, pullDistance)}px`,
            left: '50%',
            transform: 'translate(-50%, -100%)',
            zIndex: 120,
            background: 'rgba(13, 19, 31, 0.96)',
            border: `1px solid ${pullDistance >= 65 || isPullRefreshing ? '#00F5A0' : '#00D2FF'}`,
            color: pullDistance >= 65 || isPullRefreshing ? '#00F5A0' : '#00D2FF',
            padding: '8px 18px',
            borderRadius: '999px',
            fontSize: '12px',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 8px 25px rgba(0,0,0,0.75)',
            transition: isPullRefreshing ? 'top 0.2s ease' : 'none',
            pointerEvents: 'none'
          }}
        >
          <span
            style={{
              display: 'inline-block',
              fontSize: '14px',
              transform: `rotate(${pullDistance * 3}deg)`,
              animation: isPullRefreshing ? 'spin 0.8s linear infinite' : 'none'
            }}
          >
            ↻
          </span>
          <span>
            {isPullRefreshing
              ? 'Reloading Live Binance Equity & Market...'
              : pullDistance >= 115
              ? 'Release for Full App Reload!'
              : pullDistance >= 65
              ? 'Release to Reload Live Data'
              : 'Pull down to reload...'}
          </span>
        </div>
      )}

      {/* Toast Notification Bar */}
      {notification && (
        <div style={{
          position: 'fixed',
          top: '64px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 90,
          background: notification.type === 'SUCCESS' ? 'rgba(0, 245, 160, 0.95)' :
                      notification.type === 'DANGER' ? 'rgba(255, 51, 102, 0.95)' : 'rgba(0, 210, 255, 0.95)',
          color: '#07090E',
          fontWeight: 800,
          fontSize: '13px',
          padding: '8px 20px',
          borderRadius: '24px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          animation: 'pulseGlow 2s infinite'
        }}>
          {notification.message}
        </div>
      )}

      {/* Top Header */}
      <Header
        activeSymbol={activeSymbol}
        setActiveSymbol={setActiveSymbol}
        pairs={pairs}
        prices={prices}
        tickerStats={tickerStats}
        account={account}
        guardianSettings={guardianSettings}
        isLive={account.isLive}
        onToggleLive={handleToggleLive}
        onPanicCloseAll={handlePanicCloseAll}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenTradingView={() => setIsTradingViewOpen(true)}
        onRefresh={handleRefreshAccount}
      />

      {/* Quick Ticker Tape */}
      <TickerTape
        pairs={pairs}
        prices={prices}
        tickerStats={tickerStats}
        activeSymbol={activeSymbol}
        onSelectSymbol={setActiveSymbol}
      />

      {/* Main Content View Switcher */}
      <main className="app-main-content">
        {activeTab === 'terminal' && (
          <div className="terminal-grid">
            {/* Left Column: Chart + Positions (Desktop) or Chart (Mobile) */}
            <div className="terminal-left-col">
              <ChartSection
                activeSymbol={activeSymbol}
                candles={candles}
                indicators={indicators}
                currentPrice={prices[activeSymbol]}
                positions={positions}
                timeframe={timeframe}
                setTimeframe={setTimeframe}
              />
              <div className="desktop-only">
                <PositionsPanel
                  positions={positions}
                  history={history}
                  guardianSettings={guardianSettings}
                  onClosePosition={handleClosePosition}
                  onPanicCloseAll={handlePanicCloseAll}
                  onRefresh={handleRefreshAccount}
                  isLive={Boolean(account?.isLive)}
                />
              </div>
            </div>

            {/* Right Column: Order Terminal & Live Order Book */}
            <div className="terminal-right-col">
              <OrderTerminal
                activeSymbol={activeSymbol}
                currentPrice={prices[activeSymbol]}
                balance={account}
                onExecuteOrder={handleExecuteOrder}
              />

              <OrderBookPanel
                activeSymbol={activeSymbol}
                currentPrice={prices[activeSymbol]}
                onQuickTrade={(side, price, size) => {
                  handleExecuteOrder({
                    symbol: activeSymbol,
                    side,
                    amountUsdt: size,
                    leverage: 10
                  });
                }}
              />

              {/* On mobile, Positions appears below Order Book in terminal view */}
              <div className="mobile-only">
                <PositionsPanel
                  positions={positions}
                  history={history}
                  guardianSettings={guardianSettings}
                  onClosePosition={handleClosePosition}
                  onPanicCloseAll={handlePanicCloseAll}
                  onRefresh={handleRefreshAccount}
                  isLive={Boolean(account?.isLive)}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'scanner' && (
          <MarketScannerPanel
            marketAnalysis={marketAnalysis}
            autopilotStatus={autopilotStatus}
            onStartAutoPilot={handleStartAutoPilot}
            onStopAutoPilot={handleStopAutoPilot}
            onUpdateAutoPilotConfig={handleUpdateAutoPilotConfig}
            onExecuteTradeSetup={handleExecuteOrder}
            onSelectCoin={(sym) => {
              setActiveSymbol(sym);
              setActiveTab('terminal');
            }}
          />
        )}

        {activeTab === 'positions' && (
          <PositionsPanel
            positions={positions}
            history={history}
            guardianSettings={guardianSettings}
            onClosePosition={handleClosePosition}
            onPanicCloseAll={handlePanicCloseAll}
            onRefresh={handleRefreshAccount}
            isLive={Boolean(account?.isLive)}
          />
        )}

        {activeTab === 'bot' && (
          <AutoTradingBotPanel
            botStatus={botStatus}
            strategies={strategies}
            pairs={pairs}
            activeSymbol={activeSymbol}
            isLive={Boolean(account?.isLive)}
            availableBalance={Number(account?.availableBalance || 0)}
            onStartBot={handleStartBot}
            onStopBot={handleStopBot}
            onUpdateConfig={handleUpdateBotConfig}
          />
        )}

        {activeTab === 'guardian' && (
          <MarginGuardianPanel
            guardianSettings={guardianSettings}
            onUpdateSettings={handleUpdateGuardianSettings}
          />
        )}

        {activeTab === 'backtest' && (
          <BacktesterPanel
            strategies={strategies}
            pairs={pairs}
            onRunBacktest={handleRunBacktest}
          />
        )}

        {activeTab === 'ai' && (
          <AiIntelligencePanel
            aiData={aiData}
            activeSymbol={activeSymbol}
            account={account}
            onExecuteRecommendedTrade={handleExecuteOrder}
          />
        )}
      </main>

      {/* Mobile & Desktop Bottom Navigation Bar */}
      <BottomNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        openPositionsCount={positions.length}
        isBotRunning={botStatus.isRunning}
        isAutoPilotRunning={autopilotStatus.isAutoPilotRunning}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        isLive={account.isLive}
        onSaveApiKeys={handleSaveApiKeys}
        onResetDemoBalance={handleResetDemoBalance}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
        webhookSecret={webhookData?.secret}
        onUpdateWebhookSecret={handleUpdateWebhookSecret}
      />

      {/* TradingView Webhook Helper Modal */}
      <TradingViewWebhookModal
        isOpen={isTradingViewOpen}
        onClose={() => setIsTradingViewOpen(false)}
        webhookData={webhookData}
        onSendTestWebhook={handleSendTestWebhook}
      />
    </div>
  );
}
export default App;
