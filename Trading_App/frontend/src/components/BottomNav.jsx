import React from 'react';
import { LayoutDashboard, Layers, Bot, ShieldCheck, BarChart2, Cpu, Radar } from 'lucide-react';

export function BottomNav({ activeTab, onSelectTab, openPositionsCount, isBotRunning, isAutoPilotRunning }) {
  const tabs = [
    { id: 'terminal', label: 'Terminal', icon: LayoutDashboard },
    { id: 'scanner', label: 'Radar', icon: Radar, isDot: isAutoPilotRunning },
    { id: 'positions', label: 'Positions', icon: Layers, badge: openPositionsCount > 0 ? openPositionsCount : null },
    { id: 'bot', label: 'Auto Bot', icon: Bot, isDot: isBotRunning },
    { id: 'guardian', label: 'Guardian', icon: ShieldCheck },
    { id: 'backtest', label: 'Backtest', icon: BarChart2 },
    { id: 'ai', label: 'AI Signals', icon: Cpu }
  ];

  return (
    <nav className="app-bottom-nav">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            style={{
              background: isActive ? 'rgba(0, 245, 160, 0.08)' : 'transparent',
              border: 'none',
              borderRadius: '8px',
              color: isActive ? '#00F5A0' : 'var(--text-muted)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 1,
              minWidth: 0,
              gap: '3px',
              padding: '5px 2px',
              cursor: 'pointer',
              position: 'relative',
              fontSize: 'clamp(9px, 2.4vw, 11px)',
              fontWeight: isActive ? 800 : 600,
              whiteSpace: 'nowrap',
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              transition: 'all 0.15s ease'
            }}
          >
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={18} strokeWidth={isActive ? 2.5 : 1.9} />

              {/* Number Badge (e.g. open positions) */}
              {tab.badge && (
                <span style={{
                  position: 'absolute',
                  top: '-5px',
                  right: '-9px',
                  background: '#00F5A0',
                  color: '#07090E',
                  fontSize: '9px',
                  fontWeight: 800,
                  borderRadius: '10px',
                  padding: '1px 5px',
                  lineHeight: '1.1'
                }}>
                  {tab.badge}
                </span>
              )}

              {/* Bot Active Glowing Dot */}
              {tab.isDot && (
                <span style={{
                  position: 'absolute',
                  top: '-2px',
                  right: '-5px',
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  background: '#00F5A0',
                  boxShadow: '0 0 6px #00F5A0'
                }} />
              )}
            </div>
            <span style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
export default BottomNav;
