import React from 'react';
import { Cpu, Sparkles, TrendingUp, TrendingDown, Target, Shield, Compass, Newspaper, Activity } from 'lucide-react';

export function AiIntelligencePanel({ aiData, activeSymbol, onExecuteRecommendedTrade }) {
  if (!aiData) return null;

  const { aiScore = 0, recommendation = 'NEUTRAL', confidence = 70, targetPrice, stopLoss, factors = [], patterns = [], sentiment = {} } = aiData;

  const isBullish = aiScore > 10;
  const isBearish = aiScore < -10;

  return (
    <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #A855F7 0%, #00D2FF 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 15px rgba(168, 85, 247, 0.4)'
          }}>
            <Cpu size={22} color="#080B10" />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '16px', color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>AI & Sentiment Confluence Engine</span>
              <Sparkles size={16} color="#00D2FF" />
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Deep Learning multi-factor technical scoring & NLP news sentiment
            </div>
          </div>
        </div>

        {/* Confidence Badge */}
        <div style={{
          background: 'rgba(168, 85, 247, 0.12)',
          border: '1px solid rgba(168, 85, 247, 0.3)',
          padding: '4px 10px',
          borderRadius: '20px',
          fontSize: '11px',
          color: '#C084FC',
          fontWeight: 700
        }}>
          AI Confidence: {confidence}%
        </div>
      </div>

      {/* Main Signal Display */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '12px'
      }}>
        {/* Recommendation Card */}
        <div style={{
          background: isBullish ? 'rgba(0, 245, 160, 0.05)' : isBearish ? 'rgba(255, 51, 102, 0.05)' : 'rgba(255,255,255,0.02)',
          border: `1px solid ${isBullish ? 'rgba(0, 245, 160, 0.3)' : isBearish ? 'rgba(255, 51, 102, 0.3)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-sm)',
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Primary Recommendation ({activeSymbol})
          </div>
          <div style={{
            fontSize: '20px',
            fontWeight: 800,
            color: isBullish ? 'var(--color-long)' : isBearish ? 'var(--color-short)' : '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            {isBullish ? <TrendingUp size={22} /> : isBearish ? <TrendingDown size={22} /> : <Activity size={22} />}
            {recommendation}
          </div>
          <div className="mono" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            AI Confluence Score: <strong style={{ color: isBullish ? '#00F5A0' : '#FF3366' }}>{aiScore > 0 ? '+' : ''}{aiScore}</strong> / 100
          </div>
          {(isBullish || isBearish) && onExecuteRecommendedTrade && (
            <button
              onClick={() => onExecuteRecommendedTrade({
                symbol: activeSymbol,
                side: isBullish ? 'LONG' : 'SHORT',
                amountUsdt: 250,
                leverage: 10,
                tp: targetPrice,
                sl: stopLoss,
                trailingStopPct: 2.0
              })}
              className={isBullish ? 'btn btn-long' : 'btn btn-short'}
              style={{ marginTop: '4px', padding: '7px 12px', fontSize: '11px', fontWeight: 800 }}
            >
              Execute 1-Click AI {isBullish ? 'LONG' : 'SHORT'} ($250)
            </button>
          )}
        </div>

        {/* Projected Targets */}
        <div style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px'
        }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            AI Projected Targets
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
            <span style={{ color: 'var(--color-long)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Target size={13} /> Target Take-Profit:
            </span>
            <span className="mono" style={{ fontWeight: 700, color: '#FFFFFF' }}>
              ${targetPrice?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
            <span style={{ color: 'var(--color-short)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Shield size={13} /> Suggested Stop-Loss:
            </span>
            <span className="mono" style={{ fontWeight: 700, color: '#FFFFFF' }}>
              ${stopLoss?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Fear & Greed Sentiment */}
        <div style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px'
        }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Crypto Fear & Greed Sentiment
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span className="mono" style={{ fontSize: '20px', fontWeight: 800, color: '#00D2FF' }}>
              {sentiment.fearGreedIndex || 68}
            </span>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-long)' }}>
              {sentiment.sentimentStatus || 'GREED'}
            </span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            Social Sentiment Surge: {sentiment.socialVolumeSurge || '+24.5%'}
          </div>
        </div>
      </div>

      {/* Recognized Patterns */}
      {patterns.length > 0 && (
        <div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
            Recognized Algorithmic Patterns
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {patterns.map((p, idx) => (
              <span key={idx} style={{
                background: 'rgba(168, 85, 247, 0.08)',
                border: '1px solid rgba(168, 85, 247, 0.25)',
                color: '#C084FC',
                padding: '4px 10px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 600
              }}>
                ✓ {p}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Technical Factors Table */}
      <div>
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
          Multi-Factor Confluence Breakdown
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '6px' }}>
          {factors.map((f, idx) => (
            <div key={idx} style={{
              background: 'rgba(255,255,255,0.015)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              padding: '8px 10px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '11px'
            }}>
              <span style={{ color: '#E2E8F0' }}>{f.name}</span>
              <span className="mono" style={{
                fontWeight: 700,
                color: f.status === 'BULLISH' ? 'var(--color-long)' : f.status === 'BEARISH' ? 'var(--color-short)' : '#00D2FF'
              }}>
                {f.impact}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* News Sentiment Feed */}
      <div>
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Newspaper size={14} />
          NLP Scraped News Sentiment Feed
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {(sentiment.newsHeadlines || []).map((news, idx) => (
            <div key={idx} style={{
              background: 'rgba(255,255,255,0.015)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              padding: '8px 12px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '11px'
            }}>
              <div>
                <span style={{ color: '#FFFFFF', fontWeight: 500 }}>{news.title}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '10px', marginLeft: '8px' }}>{news.time}</span>
              </div>
              <span style={{
                fontSize: '10px',
                fontWeight: 700,
                color: news.sentiment === 'POSITIVE' ? 'var(--color-long)' : 'var(--color-short)',
                background: news.sentiment === 'POSITIVE' ? 'var(--color-long-subtle)' : 'var(--color-short-subtle)',
                padding: '2px 6px',
                borderRadius: '4px'
              }}>
                {news.sentiment}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
