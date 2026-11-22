import React, { useState, useEffect } from 'react';
import {
  X,
  Key,
  Shield,
  Volume2,
  VolumeX,
  RotateCcw,
  Check,
  Lock,
  Eye,
  EyeOff,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  PowerOff,
  CheckCircle2,
  Info,
  Copy,
  CheckCheck,
  Server,
  Wifi
} from 'lucide-react';
import { getServerUrl, setServerUrl } from '../utils/apiConfig';

export function SettingsModal({
  isOpen,
  onClose,
  isLive,
  onSaveApiKeys,
  onResetDemoBalance,
  soundEnabled,
  onToggleSound,
  webhookSecret,
  onUpdateWebhookSecret
}) {
  if (!isOpen) return null;

  // Initialize from localStorage (useTestnet defaults to FALSE for real accounts)
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('binance_api_key') || '');
  const [apiSecret, setApiSecret] = useState(() => localStorage.getItem('binance_api_secret') || '');
  const [useTestnet, setUseTestnet] = useState(() => localStorage.getItem('binance_use_testnet') === 'true');
  const [showSecret, setShowSecret] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null); // { type: 'success' | 'error' | 'info', title: '', message: '' }
  const [userIp, setUserIp] = useState('112.134.246.225');
  const [copiedIp, setCopiedIp] = useState(false);

  useEffect(() => {
    fetch('/api/my-ip')
      .then(r => r.json())
      .then(d => {
        if (d.ip) setUserIp(d.ip);
      })
      .catch(() => {});
  }, []);

  const [secretVal, setSecretVal] = useState(webhookSecret || '');
  const [secretSaved, setSecretSaved] = useState(false);

  const [serverUrlInput, setServerUrlInput] = useState(() => getServerUrl() || 'http://192.168.1.4:5000');
  const [serverStatus, setServerStatus] = useState(null);
  const [isTestingServer, setIsTestingServer] = useState(false);

  const handleTestServer = async () => {
    setIsTestingServer(true);
    setServerStatus(null);
    try {
      const url = serverUrlInput.trim().replace(/\/+$/, '');
      const res = await fetch(`${url}/api/health`, { timeout: 4000 });
      if (res.ok) {
        setServerStatus({ ok: true, message: 'Server Connected Successfully! (Online)' });
      } else {
        setServerStatus({ ok: false, message: `Server responded with status ${res.status}` });
      }
    } catch (err) {
      setServerStatus({ ok: false, message: `Connection failed: ${err.message}` });
    } finally {
      setIsTestingServer(false);
    }
  };

  const handleSaveServer = () => {
    setServerUrl(serverUrlInput.trim());
    setServerStatus({ ok: true, message: 'Server URL saved! Reconnecting...' });
    setTimeout(() => {
      window.location.reload();
    }, 600);
  };

  const handleSaveKeys = async () => {
    const cleanKey = apiKey.trim();
    const cleanSecret = apiSecret.trim();

    if (!cleanKey || !cleanSecret) {
      setStatusMessage({
        type: 'error',
        title: 'Missing Credentials',
        message: 'Please enter both your Binance API Key and Secret Key.'
      });
      return;
    }

    setIsLoading(true);
    setStatusMessage(null);

    try {
      const res = await onSaveApiKeys({
        apiKey: cleanKey,
        apiSecret: cleanSecret,
        useTestnet
      });

      if (res && res.success) {
        localStorage.setItem('binance_api_key', cleanKey);
        localStorage.setItem('binance_api_secret', cleanSecret);
        localStorage.setItem('binance_use_testnet', useTestnet ? 'true' : 'false');

        setStatusMessage({
          type: 'success',
          title: 'Connected Successfully!',
          message: res.message || 'Connected to Binance Futures! Live Trading is now active.'
        });
      } else {
        setStatusMessage({
          type: 'error',
          title: 'Authentication Failed',
          message: res?.error || 'Failed to authenticate with Binance. Check your credentials and permissions.'
        });
      }
    } catch (err) {
      setStatusMessage({
        type: 'error',
        title: 'Connection Error',
        message: err.message || 'Network error communicating with the trading backend.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect Binance API keys and revert to Paper Demo Mode?')) return;
    setIsLoading(true);
    try {
      await onSaveApiKeys({ apiKey: '', apiSecret: '', useTestnet: false });
      localStorage.removeItem('binance_api_key');
      localStorage.removeItem('binance_api_secret');
      localStorage.removeItem('binance_use_testnet');
      setApiKey('');
      setApiSecret('');
      setUseTestnet(false);
      setStatusMessage({
        type: 'info',
        title: 'Disconnected',
        message: 'Binance credentials removed. Switched back to Paper Trading Demo mode.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveWebhookSecret = async () => {
    if (onUpdateWebhookSecret) {
      await onUpdateWebhookSecret(secretVal);
      setSecretSaved(true);
      setTimeout(() => setSecretSaved(false), 3000);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.85)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: '16px'
    }}>
      <div className="glass-panel" style={{
        width: '100%',
        maxWidth: '560px',
        maxHeight: '92vh',
        overflowY: 'auto',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        boxShadow: '0 20px 50px rgba(0,0,0,0.7)',
        borderRadius: '16px'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: '18px', color: '#FFFFFF' }}>
              App Configuration & Binance API
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Setup your live trading keys, sound alerts, and mobile app
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              borderRadius: '8px',
              padding: '6px',
              display: 'flex'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Status / Feedback Banner */}
        {statusMessage && (
          <div style={{
            padding: '14px',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            fontSize: '13px',
            lineHeight: '1.4',
            background: statusMessage.type === 'success' ? 'rgba(0, 245, 160, 0.12)' :
                        statusMessage.type === 'error' ? 'rgba(255, 51, 102, 0.12)' : 'rgba(0, 210, 255, 0.12)',
            border: `1px solid ${statusMessage.type === 'success' ? '#00F5A0' :
                                statusMessage.type === 'error' ? '#FF3366' : '#00D2FF'}`,
            color: '#FFFFFF'
          }}>
            {statusMessage.type === 'success' && <CheckCircle2 size={18} color="#00F5A0" style={{ flexShrink: 0, marginTop: '2px' }} />}
            {statusMessage.type === 'error' && <AlertCircle size={18} color="#FF3366" style={{ flexShrink: 0, marginTop: '2px' }} />}
            {statusMessage.type === 'info' && <Info size={18} color="#00D2FF" style={{ flexShrink: 0, marginTop: '2px' }} />}
            <div>
              <div style={{ fontWeight: 800, marginBottom: '2px', color: statusMessage.type === 'success' ? '#00F5A0' : statusMessage.type === 'error' ? '#FF3366' : '#00D2FF' }}>
                {statusMessage.title}
              </div>
              <div style={{ color: '#E2E8F0' }}>{statusMessage.message}</div>
            </div>
          </div>
        )}

        {/* Binance API Credentials Box */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          background: 'rgba(255,255,255,0.02)',
          padding: '16px',
          borderRadius: '12px',
          border: '1px solid var(--border)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 700, color: '#FFFFFF' }}>
              <Key size={17} color="#00D2FF" />
              <span>Binance Futures API Keys</span>
            </div>
            <span style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '20px',
              fontWeight: 700,
              background: isLive ? 'rgba(0, 245, 160, 0.15)' : 'rgba(255, 255, 255, 0.05)',
              color: isLive ? '#00F5A0' : 'var(--text-muted)',
              border: `1px solid ${isLive ? 'rgba(0,245,160,0.3)' : 'var(--border)'}`
            }}>
              {isLive ? '● LIVE MODE ACTIVE' : '○ PAPER DEMO'}
            </span>
          </div>

          {/* API Key Input */}
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '5px', fontWeight: 600 }}>
              Binance API Key
            </label>
            <input
              type="text"
              placeholder="Paste your 64-character Binance API Key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '10px 12px',
                color: '#fff',
                fontSize: '13px',
                fontFamily: 'monospace'
              }}
            />
          </div>

          {/* Secret Key Input */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                Binance Secret Key
              </label>
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px'
                }}
              >
                {showSecret ? <EyeOff size={13} /> : <Eye size={13} />}
                <span>{showSecret ? 'Hide' : 'Show'}</span>
              </button>
            </div>
            <div style={{ position: 'relative' }}>
              <input
                type={showSecret ? 'text' : 'password'}
                placeholder="Paste your Binance Secret Key"
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                style={{
                  width: '100%',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  color: '#fff',
                  fontSize: '13px',
                  fontFamily: 'monospace'
                }}
              />
            </div>
          </div>

          {/* Real Account vs Testnet Selector Box */}
          <div style={{
            background: useTestnet ? 'rgba(255, 170, 0, 0.08)' : 'rgba(0, 245, 160, 0.06)',
            border: `1px solid ${useTestnet ? 'rgba(255, 170, 0, 0.3)' : 'rgba(0, 245, 160, 0.25)'}`,
            padding: '12px',
            borderRadius: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={useTestnet}
                onChange={(e) => setUseTestnet(e.target.checked)}
                style={{ width: '16px', height: '16px', accentColor: '#00D2FF', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '12px', fontWeight: 700, color: useTestnet ? '#FFAA00' : '#00F5A0' }}>
                {useTestnet ? '🟡 Using Binance Futures TESTNET Sandbox' : '🟢 Real Binance Account (Default)'}
              </span>
            </label>
            <div style={{ fontSize: '11px', color: '#94A3B8', paddingLeft: '26px', lineHeight: '1.4' }}>
              {useTestnet
                ? 'Only check this if your keys were generated at testnet.binancefuture.com.'
                : 'Keep UNCHECKED for real binance.com accounts. Real keys fail if Testnet is checked!'}
            </div>
          </div>

          {/* Important Binance Permission Checklist & IP Whitelist Helper */}
          <div style={{
            background: 'rgba(0, 210, 255, 0.04)',
            border: '1px solid rgba(0, 210, 255, 0.2)',
            padding: '12px',
            borderRadius: '10px',
            fontSize: '12px',
            lineHeight: '1.5',
            color: '#CBD5E1'
          }}>
            <div style={{ fontWeight: 800, color: '#00D2FF', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Shield size={15} />
              <span>Binance එකේ "Enable Futures" ටික් එක Gray වී තිබේද?</span>
            </div>
            <div style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '8px' }}>
              Binance ආරක්ෂිත නීති අනුව <strong>"Unrestricted"</strong> ඇති විට Trading checkboxes lock වී ඇත. එය unlock කරගැනීමට:
            </div>
            
            <div style={{
              background: 'rgba(0,0,0,0.3)',
              padding: '8px 10px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '8px'
            }}>
              <div>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block' }}>Your Public IP for Binance Whitelist:</span>
                <span className="mono" style={{ fontSize: '13px', fontWeight: 700, color: '#00F5A0' }}>{userIp}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(userIp);
                  setCopiedIp(true);
                  setTimeout(() => setCopiedIp(false), 2500);
                }}
                style={{
                  background: copiedIp ? 'rgba(0,245,160,0.2)' : 'rgba(0, 210, 255, 0.15)',
                  border: `1px solid ${copiedIp ? '#00F5A0' : 'rgba(0, 210, 255, 0.4)'}`,
                  color: copiedIp ? '#00F5A0' : '#00D2FF',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                {copiedIp ? <CheckCheck size={13} /> : <Copy size={13} />}
                <span>{copiedIp ? 'Copied!' : 'Copy IP'}</span>
              </button>
            </div>

            <div style={{ fontSize: '11px', lineHeight: '1.6', color: '#E2E8F0' }}>
              1. Binance හි <strong>"Restrict access to trusted IPs only (Recommended)"</strong> තෝරන්න.<br />
              2. ඉහත IP එක paste කර <strong>Confirm</strong> ඔබන්න.<br />
              3. එවිට <strong>"Enable Futures"</strong> ටික් එක Active වේ! එය ටික් කර <strong>Save</strong> කරන්න.
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '4px', flexWrap: 'wrap' }}>
            <button
              onClick={handleSaveKeys}
              disabled={isLoading}
              className="btn btn-primary"
              style={{
                flex: '1',
                padding: '10px 16px',
                fontSize: '13px',
                fontWeight: 700,
                opacity: isLoading ? 0.6 : 1,
                cursor: isLoading ? 'not-allowed' : 'pointer'
              }}
            >
              {isLoading ? (
                <>
                  <RefreshCw size={14} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
                  <span>Verifying with Binance...</span>
                </>
              ) : (
                <>
                  <Check size={14} />
                  <span>Save & Connect Binance</span>
                </>
              )}
            </button>

            {apiKey && (
              <button
                onClick={handleDisconnect}
                disabled={isLoading}
                style={{
                  background: 'rgba(255, 51, 102, 0.1)',
                  border: '1px solid rgba(255, 51, 102, 0.3)',
                  color: '#FF3366',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <PowerOff size={13} />
                <span>Disconnect</span>
              </button>
            )}
          </div>
        </div>

        {/* Audio Alerts & Sound Effects */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(255,255,255,0.02)',
          padding: '14px',
          borderRadius: '12px',
          border: '1px solid var(--border)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {soundEnabled ? <Volume2 size={20} color="#00F5A0" /> : <VolumeX size={20} color="#94A3B8" />}
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF' }}>Audio Alerts & Margin Sirens</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Chimes on order execution & margin alarms</div>
            </div>
          </div>
          <button
            onClick={onToggleSound}
            style={{
              background: soundEnabled ? 'rgba(0,245,160,0.15)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${soundEnabled ? '#00F5A0' : 'var(--border)'}`,
              color: soundEnabled ? '#00F5A0' : 'var(--text-muted)',
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            {soundEnabled ? 'ENABLED' : 'MUTED'}
          </button>
        </div>

        {/* Reset Demo Paper Balance */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(255,255,255,0.02)',
          padding: '14px',
          borderRadius: '12px',
          border: '1px solid var(--border)'
        }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF' }}>Reset Paper Demo Wallet</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Reset demo capital back to $10,000.00 USDT</div>
          </div>
          <button
            onClick={onResetDemoBalance}
            className="btn btn-outline"
            style={{ padding: '8px 14px', fontSize: '12px', gap: '6px' }}
          >
            <RotateCcw size={13} />
            <span>Reset $10K</span>
          </button>
        </div>

        {/* Mobile APK & LAN Server Connection */}
        <div style={{
          background: 'rgba(0, 210, 255, 0.04)',
          border: '1px solid rgba(0, 210, 255, 0.25)',
          padding: '14px',
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Server size={16} color="#00D2FF" />
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF' }}>
                Backend Server URL (Mobile APK & LAN)
              </span>
            </div>
            <span style={{ fontSize: '10px', background: 'rgba(0,210,255,0.15)', color: '#00D2FF', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
              PORT 5000
            </span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            Point your mobile APK or local network device to your PC's IP address. Default: <code>http://192.168.1.4:5000</code>.
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={serverUrlInput}
              onChange={(e) => setServerUrlInput(e.target.value)}
              placeholder="http://192.168.1.4:5000"
              style={{
                flex: 1,
                minWidth: '200px',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                padding: '8px 10px',
                color: '#00F5A0',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)'
              }}
            />
            <button
              onClick={handleTestServer}
              disabled={isTestingServer}
              className="btn btn-outline"
              style={{ padding: '8px 12px', fontSize: '11px', gap: '4px' }}
            >
              <Wifi size={13} />
              <span>{isTestingServer ? 'Testing...' : 'Test Link'}</span>
            </button>
            <button
              onClick={handleSaveServer}
              className="btn btn-primary"
              style={{ padding: '8px 14px', fontSize: '11px' }}
            >
              Save URL
            </button>
          </div>
          {serverStatus && (
            <div style={{
              fontSize: '11px',
              fontWeight: 700,
              color: serverStatus.ok ? 'var(--color-long)' : 'var(--color-short)',
              background: serverStatus.ok ? 'var(--color-long-subtle)' : 'var(--color-short-subtle)',
              padding: '6px 10px',
              borderRadius: '4px'
            }}>
              {serverStatus.message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
export default SettingsModal;
