import React, { useState } from 'react';
import { X, Copy, Check, Radio, Send, Terminal, Shield, Zap } from 'lucide-react';

export function TradingViewWebhookModal({ isOpen, onClose, webhookData, onSendTestWebhook }) {
  if (!isOpen) return null;

  const [copiedField, setCopiedField] = useState(null);
  const [testAction, setTestAction] = useState('LONG');
  const [testSymbol, setTestSymbol] = useState('BTCUSDT');
  const [testAmount, setTestAmount] = useState('200');
  const [testResult, setTestResult] = useState(null);
  const [isSending, setIsSending] = useState(false);

  const webhookUrl = webhookData?.webhookUrl || 'http://localhost:5000/api/webhook/tradingview';
  const secret = webhookData?.secret || 'AGY_AUTOTRADE_SECURE_TOKEN_2026';

  const longTemplate = JSON.stringify({
    secret: secret,
    action: "LONG",
    symbol: "{{ticker}}",
    amountUsdt: 250,
    leverage: 10,
    tp: "{{plot_0}}",
    sl: "{{plot_1}}"
  }, null, 2);

  const shortTemplate = JSON.stringify({
    secret: secret,
    action: "SHORT",
    symbol: "{{ticker}}",
    amountUsdt: 250,
    leverage: 10
  }, null, 2);

  const closeTemplate = JSON.stringify({
    secret: secret,
    action: "CLOSE",
    symbol: "{{ticker}}"
  }, null, 2);

  const handleCopy = (text, fieldName) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleSendTest = async () => {
    setIsSending(true);
    try {
      const res = await onSendTestWebhook({
        secret,
        action: testAction,
        symbol: testSymbol,
        amountUsdt: Number(testAmount),
        leverage: 10
      });
      setTestResult(res);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.8)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: '16px'
    }}>
      <div className="glass-panel" style={{
        width: '100%',
        maxWidth: '720px',
        maxHeight: '90vh',
        overflowY: 'auto',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '18px',
        position: 'relative'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #00D2FF 0%, #00F5A0 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Radio size={20} color="#080B10" />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '18px', color: '#FFFFFF' }}>
                TradingView Webhook Integration
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Execute Long & Short trades automatically from Pine Script alerts
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Webhook URL Field */}
        <div>
          <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
            Webhook URL (Paste into TradingView Alert "Webhook URL" field)
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              readOnly
              value={webhookUrl}
              style={{
                width: '100%',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '10px',
                color: '#00D2FF',
                fontFamily: 'var(--font-mono)',
                fontSize: '13px'
              }}
            />
            <button
              onClick={() => handleCopy(webhookUrl, 'url')}
              className="btn btn-outline"
              style={{ padding: '10px 14px' }}
            >
              {copiedField === 'url' ? <Check size={16} color="#00F5A0" /> : <Copy size={16} />}
            </button>
          </div>
        </div>

        {/* Passphrase Secret */}
        <div>
          <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
            Secret Authentication Passphrase
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              readOnly
              value={secret}
              style={{
                width: '100%',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '10px',
                color: '#FFFFFF',
                fontFamily: 'var(--font-mono)',
                fontSize: '13px'
              }}
            />
            <button
              onClick={() => handleCopy(secret, 'secret')}
              className="btn btn-outline"
              style={{ padding: '10px 14px' }}
            >
              {copiedField === 'secret' ? <Check size={16} color="#00F5A0" /> : <Copy size={16} />}
            </button>
          </div>
        </div>

        {/* Copyable Pine Script Alert JSON Templates */}
        <div>
          <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
            TradingView Alert Message JSON Templates (Copy into "Message" box)
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
            {/* Long Alert Template */}
            <div style={{ background: 'rgba(0, 245, 160, 0.05)', border: '1px solid rgba(0, 245, 160, 0.2)', borderRadius: '6px', padding: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-long)' }}>LONG ALERT</span>
                <button onClick={() => handleCopy(longTemplate, 'long')} style={{ background: 'none', border: 'none', color: 'var(--color-long)', cursor: 'pointer' }}>
                  {copiedField === 'long' ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
              <pre className="mono" style={{ fontSize: '10px', color: '#94A3B8', overflowX: 'auto' }}>
                {longTemplate}
              </pre>
            </div>

            {/* Short Alert Template */}
            <div style={{ background: 'rgba(255, 51, 102, 0.05)', border: '1px solid rgba(255, 51, 102, 0.2)', borderRadius: '6px', padding: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-short)' }}>SHORT ALERT</span>
                <button onClick={() => handleCopy(shortTemplate, 'short')} style={{ background: 'none', border: 'none', color: 'var(--color-short)', cursor: 'pointer' }}>
                  {copiedField === 'short' ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
              <pre className="mono" style={{ fontSize: '10px', color: '#94A3B8', overflowX: 'auto' }}>
                {shortTemplate}
              </pre>
            </div>

            {/* Close Alert Template */}
            <div style={{ background: 'rgba(0, 210, 255, 0.05)', border: '1px solid rgba(0, 210, 255, 0.2)', borderRadius: '6px', padding: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#00D2FF' }}>CLOSE ALERT</span>
                <button onClick={() => handleCopy(closeTemplate, 'close')} style={{ background: 'none', border: 'none', color: '#00D2FF', cursor: 'pointer' }}>
                  {copiedField === 'close' ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
              <pre className="mono" style={{ fontSize: '10px', color: '#94A3B8', overflowX: 'auto' }}>
                {closeTemplate}
              </pre>
            </div>
          </div>
        </div>

        {/* Live Test Webhook Simulator */}
        <div style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF' }}>
            Simulate Incoming TradingView Webhook Order
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <select
              value={testAction}
              onChange={(e) => setTestAction(e.target.value)}
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '4px', padding: '6px 10px', color: '#fff', fontSize: '12px' }}
            >
              <option value="LONG">Action: LONG</option>
              <option value="SHORT">Action: SHORT</option>
              <option value="CLOSE">Action: CLOSE</option>
            </select>

            <select
              value={testSymbol}
              onChange={(e) => setTestSymbol(e.target.value)}
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '4px', padding: '6px 10px', color: '#fff', fontSize: '12px' }}
            >
              <option value="BTCUSDT">BTCUSDT</option>
              <option value="ETHUSDT">ETHUSDT</option>
              <option value="SOLUSDT">SOLUSDT</option>
            </select>

            <input
              type="number"
              placeholder="Margin $"
              value={testAmount}
              onChange={(e) => setTestAmount(e.target.value)}
              style={{ width: '90px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '4px', padding: '6px 8px', color: '#fff', fontSize: '12px' }}
            />

            <button
              onClick={handleSendTest}
              disabled={isSending}
              className="btn btn-primary"
              style={{ padding: '6px 14px', fontSize: '12px' }}
            >
              <Send size={13} />
              {isSending ? 'Sending...' : 'Trigger Webhook Alert'}
            </button>
          </div>

          {testResult && (
            <div style={{
              background: testResult.success ? 'rgba(0, 245, 160, 0.1)' : 'rgba(255, 51, 102, 0.1)',
              border: `1px solid ${testResult.success ? '#00F5A0' : '#FF3366'}`,
              borderRadius: '4px',
              padding: '8px',
              fontSize: '11px',
              color: testResult.success ? '#00F5A0' : '#FF3366'
            }}>
              {testResult.success ? `Webhook Executed! Position: ${testResult.position?.id || 'Closed'}` : `Error: ${testResult.error}`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
