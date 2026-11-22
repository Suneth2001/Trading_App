import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType } from 'lightweight-charts';
import { Layers, Clock, Activity, Zap } from 'lucide-react';

// Helper to compute Exponential Moving Average for chart overlay
function calculateEMA(data, period) {
  if (!data || data.length < period) return [];
  const k = 2 / (period + 1);
  let ema = data[0].close;
  const result = [];
  
  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      ema = data[0].close;
    } else {
      ema = (data[i].close * k) + (ema * (1 - k));
    }
    if (i >= period - 1) {
      result.push({ time: data[i].time, value: Number(ema.toFixed(2)) });
    }
  }
  return result;
}

export function ChartSection({
  activeSymbol,
  candles,
  indicators,
  currentPrice,
  positions,
  timeframe = '15m',
  setTimeframe
}) {
  const chartContainerRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const ema9SeriesRef = useRef(null);
  const ema21SeriesRef = useRef(null);
  const cleanCandlesRef = useRef([]);

  const [showIndicators, setShowIndicators] = useState(true);
  const [isLiveWsConnected, setIsLiveWsConnected] = useState(false);
  const [livePrice, setLivePrice] = useState(null);

  // Available standard Binance intervals
  const timeframes = ['1m', '5m', '15m', '1h', '4h', '1D'];

  // Initialize Lightweight Chart
  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    const initialHeight = isMobile ? 310 : 380;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: initialHeight,
      layout: {
        background: { type: ColorType.Solid, color: '#090D15' },
        textColor: '#94A3B8',
        fontSize: isMobile ? 10 : 11,
        fontFamily: "'JetBrains Mono', 'Inter', monospace"
      },
      grid: {
        vertLines: { color: 'rgba(30, 41, 59, 0.4)' },
        horzLines: { color: 'rgba(30, 41, 59, 0.4)' }
      },
      crosshair: {
        vertLine: { color: '#00D2FF', width: 1, style: 3 },
        horzLine: { color: '#00D2FF', width: 1, style: 3 }
      },
      rightPriceScale: {
        borderColor: '#1E293B',
        scaleMargins: { top: 0.1, bottom: 0.25 }
      },
      timeScale: {
        borderColor: '#1E293B',
        timeVisible: true,
        secondsVisible: false
      }
    });

    // 1. Candlestick Series
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#00F5A0',
      downColor: '#FF3366',
      borderVisible: false,
      wickUpColor: '#00F5A0',
      wickDownColor: '#FF3366'
    });

    // 2. Volume Series
    const volumeSeries = chart.addHistogramSeries({
      color: '#1E293B',
      priceFormat: { type: 'volume' },
      priceScaleId: '', // overlay
      scaleMargins: { top: 0.82, bottom: 0 }
    });

    // 3. EMA 9 Overlay (Cyan)
    const ema9Series = chart.addLineSeries({
      color: '#00D2FF',
      lineWidth: 1.5,
      priceLineVisible: false
    });

    // 4. EMA 21 Overlay (Amber)
    const ema21Series = chart.addLineSeries({
      color: '#F59E0B',
      lineWidth: 1.5,
      priceLineVisible: false
    });

    chartInstanceRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    ema9SeriesRef.current = ema9Series;
    ema21SeriesRef.current = ema21Series;

    // Handle Window & Container Resize via ResizeObserver
    const handleResize = () => {
      if (chartContainerRef.current && chartInstanceRef.current) {
        const mobile = window.innerWidth < 768;
        const w = Math.max(240, chartContainerRef.current.clientWidth);
        chartInstanceRef.current.applyOptions({
          width: w,
          height: mobile ? 290 : 380
        });
      }
    };
    window.addEventListener('resize', handleResize);
    let ro = null;
    if (typeof ResizeObserver !== 'undefined' && chartContainerRef.current) {
      ro = new ResizeObserver(handleResize);
      ro.observe(chartContainerRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      if (ro) ro.disconnect();
      chart.remove();
    };
  }, []);

  // Update Base Candles, Volume and Indicators when data arrives
  useEffect(() => {
    if (!candleSeriesRef.current || !candles || candles.length === 0) return;

    try {
      // Deduplicate and sort by time
      const cleanData = candles
        .map(c => ({
          time: c.time,
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close)
        }))
        .filter((c, idx, arr) => idx === 0 || c.time > arr[idx - 1].time)
        .sort((a, b) => a.time - b.time);

      cleanCandlesRef.current = cleanData;
      candleSeriesRef.current.setData(cleanData);

      if (volumeSeriesRef.current) {
        const volData = candles
          .map(c => ({
            time: c.time,
            value: Number(c.volume || 10),
            color: c.close >= c.open ? 'rgba(0, 245, 160, 0.25)' : 'rgba(255, 51, 102, 0.25)'
          }))
          .filter((c, idx, arr) => idx === 0 || c.time > arr[idx - 1].time)
          .sort((a, b) => a.time - b.time);

        volumeSeriesRef.current.setData(volData);
      }

      // Render EMAs on Chart
      if (showIndicators) {
        const ema9Data = calculateEMA(cleanData, 9);
        const ema21Data = calculateEMA(cleanData, 21);
        if (ema9SeriesRef.current) ema9SeriesRef.current.setData(ema9Data);
        if (ema21SeriesRef.current) ema21SeriesRef.current.setData(ema21Data);
      } else {
        if (ema9SeriesRef.current) ema9SeriesRef.current.setData([]);
        if (ema21SeriesRef.current) ema21SeriesRef.current.setData([]);
      }

      // Add position entry markers
      if (positions && positions.length > 0) {
        const symbolPositions = positions.filter(p => p.symbol === activeSymbol);
        const markers = symbolPositions.map(p => ({
          time: cleanData[cleanData.length - 1]?.time || Math.floor(Date.now() / 1000),
          position: p.side === 'LONG' ? 'belowBar' : 'aboveBar',
          color: p.side === 'LONG' ? '#00F5A0' : '#FF3366',
          shape: p.side === 'LONG' ? 'arrowUp' : 'arrowDown',
          text: `${p.side} ${p.leverage}x @ $${p.entryPrice}`
        }));
        if (markers.length > 0) {
          candleSeriesRef.current.setMarkers(markers);
        }
      }
    } catch (e) {
      console.warn('[ChartSection] Error setting candle data:', e);
    }
  }, [candles, activeSymbol, positions, showIndicators]);

  // Real-time direct Binance WebSocket Kline Stream (Zero latency matching TradingView/Binance)
  useEffect(() => {
    if (!activeSymbol || !timeframe) return;

    const normInterval = timeframe.toLowerCase();
    const streamSymbol = activeSymbol.toLowerCase();
    const wsUrl = `wss://stream.binance.com:9443/ws/${streamSymbol}@kline_${normInterval}`;

    let ws = null;
    let isMounted = true;

    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (isMounted) setIsLiveWsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (!msg.k || !candleSeriesRef.current) return;

          const k = msg.k;
          const time = Math.floor(k.t / 1000);
          const open = parseFloat(k.o);
          const high = parseFloat(k.h);
          const low = parseFloat(k.l);
          const close = parseFloat(k.c);
          const volume = parseFloat(k.v);

          if (isMounted) {
            setLivePrice(close);
          }

          // Real-time zero-delay candlestick update
          candleSeriesRef.current.update({
            time,
            open,
            high,
            low,
            close
          });

          // Real-time volume bar update
          if (volumeSeriesRef.current) {
            volumeSeriesRef.current.update({
              time,
              value: volume,
              color: close >= open ? 'rgba(0, 245, 160, 0.25)' : 'rgba(255, 51, 102, 0.25)'
            });
          }
        } catch {
          // ignore malformed message
        }
      };

      ws.onerror = () => {
        if (isMounted) setIsLiveWsConnected(false);
      };

      ws.onclose = () => {
        if (isMounted) setIsLiveWsConnected(false);
      };
    } catch {
      if (isMounted) setIsLiveWsConnected(false);
    }

    return () => {
      isMounted = false;
      if (ws) {
        try {
          ws.close();
        } catch {}
      }
    };
  }, [activeSymbol, timeframe]);

  // Fallback update if direct WS is buffering: tick with backend price
  useEffect(() => {
    if (isLiveWsConnected || !candleSeriesRef.current || !currentPrice) return;
    if (!cleanCandlesRef.current || cleanCandlesRef.current.length === 0) return;

    const lastCandle = cleanCandlesRef.current[cleanCandlesRef.current.length - 1];
    if (!lastCandle) return;

    candleSeriesRef.current.update({
      time: lastCandle.time,
      open: lastCandle.open,
      high: Math.max(lastCandle.high, currentPrice),
      low: Math.min(lastCandle.low, currentPrice),
      close: currentPrice
    });
  }, [currentPrice, isLiveWsConnected]);

  const displayPrice = livePrice || currentPrice;

  return (
    <div className="glass-panel" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Chart Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'rgba(10, 14, 22, 0.6)',
        flexWrap: 'wrap',
        gap: '8px'
      }}>
        {/* Left: Timeframe pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
          <Clock size={13} color="var(--text-muted)" style={{ marginRight: '4px' }} />
          {timeframes.map(tf => {
            const isSelected = (timeframe || '15m').toLowerCase() === tf.toLowerCase();
            return (
              <button
                key={tf}
                onClick={() => setTimeframe && setTimeframe(tf)}
                style={{
                  background: isSelected ? 'var(--border)' : 'transparent',
                  color: isSelected ? '#00F5A0' : 'var(--text-secondary)',
                  border: isSelected ? '1px solid rgba(0, 245, 160, 0.3)' : '1px solid transparent',
                  borderRadius: '4px',
                  padding: '3px 8px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {tf}
              </button>
            );
          })}

          {/* Real-time Stream Indicator */}
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: '10px',
            color: isLiveWsConnected ? '#00F5A0' : '#00D2FF',
            fontWeight: 700,
            padding: '2px 8px',
            background: isLiveWsConnected ? 'rgba(0, 245, 160, 0.12)' : 'rgba(0, 210, 255, 0.12)',
            borderRadius: '12px',
            marginLeft: '6px',
            border: isLiveWsConnected ? '1px solid rgba(0, 245, 160, 0.25)' : '1px solid rgba(0, 210, 255, 0.25)'
          }}>
            <span style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: isLiveWsConnected ? '#00F5A0' : '#00D2FF',
              boxShadow: isLiveWsConnected ? '0 0 6px #00F5A0' : '0 0 6px #00D2FF'
            }} />
            {isLiveWsConnected ? 'LIVE BINANCE (0s delay)' : 'REALTIME SYNC'}
          </span>
        </div>

        {/* Right: Indicator Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px' }}>
          {indicators && (
            <>
              <span style={{ color: '#00D2FF', fontWeight: 600 }}>
                EMA9: <span className="mono">${indicators.ema?.ema9 || '---'}</span>
              </span>
              <span style={{ color: '#F59E0B', fontWeight: 600 }} className="desktop-only">
                EMA21: <span className="mono">${indicators.ema?.ema21 || '---'}</span>
              </span>
              <span style={{
                color: indicators.rsi > 70 ? 'var(--color-short)' : indicators.rsi < 30 ? 'var(--color-long)' : 'var(--text-secondary)',
                fontWeight: 700
              }}>
                RSI: <span className="mono">{indicators.rsi || 50}</span>
              </span>
              <span style={{
                background: indicators.supertrend?.direction === 'BULLISH' ? 'var(--color-long-subtle)' : 'var(--color-short-subtle)',
                color: indicators.supertrend?.direction === 'BULLISH' ? 'var(--color-long)' : 'var(--color-short)',
                padding: '2px 6px',
                borderRadius: '4px',
                fontWeight: 700,
                fontSize: '10px'
              }}>
                {indicators.supertrend?.direction || 'NEUTRAL'}
              </span>
            </>
          )}

          <button
            onClick={() => setShowIndicators(!showIndicators)}
            title={showIndicators ? 'Hide EMA Overlays' : 'Show EMA Overlays'}
            style={{
              background: showIndicators ? 'rgba(0, 210, 255, 0.15)' : 'transparent',
              border: showIndicators ? '1px solid rgba(0, 210, 255, 0.3)' : '1px solid transparent',
              color: showIndicators ? '#00D2FF' : 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 6px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 600
            }}
          >
            <Layers size={13} />
            <span className="desktop-only">EMA</span>
          </button>
        </div>
      </div>

      {/* Chart Canvas Container */}
      <div
        ref={chartContainerRef}
        style={{ width: '100%', height: typeof window !== 'undefined' && window.innerWidth < 768 ? '310px' : '380px', position: 'relative' }}
      />
    </div>
  );
}
export default ChartSection;
