# ⚡ ApexAlgo Pro - Next-Gen Crypto Auto-Trading Terminal

An algorithmic crypto auto-trading application supporting **Binance Spot & Futures**, **TradingView Webhooks**, **Long and Short Dual-Mode Execution**, and an automated **Margin Got Time Auto-Close Guardian** for desktop, iPhone (iOS), and Android devices.

---

## 🚀 Key Features

- **Dual-Mode Automated Trading (Long & Short):**
  - Seamlessly executes both Long (Bullish) and Short (Bearish) positions on Binance Futures with 1x to 125x leverage.
  - Three execution modes: `Both (Long & Short)`, `Long Only`, and `Short Only`.
- **🔍 Auto Market Analysis & Screener Engine (12 Cryptos):**
  - Continuous real-time multi-indicator scanner ranking BTC, ETH, SOL, BNB, DOGE, XRP, ADA, AVAX, LINK, SUI, NEAR, and PEPE.
  - Auto-calculates Opportunity Scores ($0-100$), Market Regimes, Support/Resistance, and Signal Badges (`STRONG BUY`, `BUY`, `NEUTRAL`, `SELL`, `STRONG SELL`).
  - Generates recommended Trade Setups with exact Entry, Target Take-Profit, and Stop-Loss prices.
  - Includes **1-Click "Execute Setup"** to immediately open Long or Short trades with armed Margin Guardian protection.
- **🤖 1-Click AI Auto-Pilot Mode:**
  - When enabled, the AI Auto-Pilot continuously monitors the Market Screener and automatically enters the highest-ranking opportunities ($>80\%$ confidence) 24/7.
  - Features configurable allocation per trade, max open positions, and direction filters.
- **📖 Live Order Book Depth & Buyer vs. Seller Pressure:**
  - Real-time Depth-15 bid/ask visualization with cumulative volume bars and spread calculations.
  - Live **Buyer Pressure vs. Seller Pressure** percentage meter.
  - **1-Tap Quick Execution:** Instant Market Long/Short buttons for $100, $250, and $500 presets.
- **🛡️ "Margin Got Time Auto-Close" Guardian:**
  - Background watchdog running every 500ms evaluating margin health across all open positions.
  - Automatically closes positions before exchange liquidation when the margin ratio reaches a user-defined threshold (e.g., 75% or 80%).
  - Integrated with **Trailing Stop-Loss**, **Hard Stop-Loss**, and **Take-Profit** ladders.
- **📡 TradingView Webhook Engine:**
  - Dedicated webhook endpoint (`/api/webhook/tradingview`) protected with HMAC/Secret authentication.
  - Accepts alerts from any TradingView Pine Script strategy to instantly trigger Long, Short, Close, SL, and TP orders in milliseconds.
- **🧠 AI & Market Sentiment Confluence Engine:**
  - Multi-indicator technical scoring (-100 to +100) combining EMA alignments, RSI, MACD histograms, SuperTrend, and Bollinger squeezes.
  - Real-time NLP-scraped news sentiment and Crypto Fear & Greed index integration.
- **📊 Quantitative Backtesting Framework:**
  - Simulate any strategy against historical Binance candlestick data.
  - Generates comprehensive performance reports: Net Profit ($ & %), Win Rate %, Profit Factor, Max Drawdown %, and Sharpe Ratio.
- **📱 iPhone & Android Ready (PWA Mobile Architecture):**
  - Native mobile feel with sticky bottom navigation tabs, touch-optimized sliders, and safe area support.
  - Can be added directly to the Home Screen on iPhone (Safari) and Android (Chrome) without app store delays.
- **🎮 Risk-Free Paper Trading vs. Binance Live Switch:**
  - Practice with a simulated $10,000 USDT demo wallet with 1-click reset.
  - Switch anytime to live Binance API keys (Spot or USD-M Futures Testnet/Mainnet).

---

## 📈 Supported Trading Strategies (Algorithms & Books Reference)

ApexAlgo implements the core algorithmic trading strategies described in quantitative literature:

| Strategy | Description | Indicators Used | Optimal Timeframe |
| :--- | :--- | :--- | :--- |
| **Trend Following** | Trades strictly in the direction of the dominant market momentum. Enters Long on Golden Crosses and Short on Death Crosses. | EMA 9/21/50, ADX (Trend Strength > 20) | 15m, 1h, 4h |
| **Breakout Squeeze** | Enters high-velocity breakouts after periods of low volatility (squeeze contraction). | Bollinger Bands (20,2), Volume MA Surge > 1.3x | 5m, 15m |
| **Mean Reversion** | Bets on extreme price swings reverting to their historical average value. | RSI (Overbought >70 / Oversold <30), Lower/Upper Bollinger | 15m, 1h |
| **Momentum Scalper** | Sub-minute and 5m high-frequency micro trades capturing rapid price impulses. | MACD Histogram Crossovers, RSI Turbo (52/48) | 1m, 5m |
| **Swing Wave Rider** | Holds positions across multi-hour to multi-day waves for major trend capturing. | SuperTrend (10, 3.0), EMA 50/200 Support/Resistance | 1h, 4h, 1D |
| **Dynamic Grid & DCA** | Deploys laddered buy and sell orders around consolidation zones to harvest sideways volatility. | Arithmetic Price Mesh, EMA 21 Pullbacks | 5m, 15m |
| **Pairs & Arbitrage** | Exploits statistical price deviations and funding rate discrepancies. | Statistical Standard Deviation, Mean Spread | 1m, 5m |
| **AI Sentiment & ML** | Neural confluence scoring aggregating 7 indicators with live Crypto Sentiment. | Multi-factor Confluence Model (-100 to +100) | 5m, 15m |

---

## 🛡️ "Margin Got Time Auto-Close" Guardian Explained

### The Problem in Crypto Futures:
When trading with leverage (e.g. 10x, 20x, 50x), if the market moves against your position, the exchange's **Margin Ratio** increases towards **100%**. At 100%, the exchange executes **forced liquidation**:
- **100% of your collateral is wiped out.**
- The exchange charges an additional **liquidation clearance fee**.

### How ApexAlgo Protects You:
The **Margin Guardian** acts as an emergency parachute:
1. Calculates real-time position margin ratio:
   $$\text{Margin Ratio} = \left(\frac{\text{Maintenance Margin}}{\text{Position Margin} + \text{Unrealized PnL}}\right) \times 100$$
2. If the Margin Ratio reaches your user-configured safety threshold (e.g., **80%**), the engine executes an **immediate market auto-close** before the exchange can liquidate your position.
3. Preserves the remaining 20% to 25% of your collateral.
4. Triggers an audible warning siren and saves an audit log entry with estimated saved capital.

---

## 📡 TradingView Webhook Setup (Pine Script)

### 1. Webhook Endpoint
- **URL:** `http://YOUR_SERVER_IP:5000/api/webhook/tradingview`
- **Method:** `POST`
- **Header:** `Content-Type: application/json`

### 2. Secret Passphrase
Configure your secret passphrase in the app's settings (Default: `AGY_AUTOTRADE_SECURE_TOKEN_2026`).

### 3. Pine Script Alert JSON Templates

#### Long (Buy) Signal Alert:
```json
{
  "secret": "AGY_AUTOTRADE_SECURE_TOKEN_2026",
  "action": "LONG",
  "symbol": "{{ticker}}",
  "amountUsdt": 250,
  "leverage": 10,
  "tp": 68000,
  "sl": 63000
}
```

#### Short (Sell) Signal Alert:
```json
{
  "secret": "AGY_AUTOTRADE_SECURE_TOKEN_2026",
  "action": "SHORT",
  "symbol": "{{ticker}}",
  "amountUsdt": 250,
  "leverage": 10
}
```

#### Close Position Alert:
```json
{
  "secret": "AGY_AUTOTRADE_SECURE_TOKEN_2026",
  "action": "CLOSE",
  "symbol": "{{ticker}}"
}
```

---

## 🛠️ Step-by-Step Installation & Quickstart

### Prerequisites
- [Node.js](https://nodejs.org/) v18+ or v20+ / v24+
- npm v10+

### Step 1: Install Dependencies
Open a terminal in the root project folder:

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### Step 2: Start the Backend Server
```bash
cd backend
npm run dev
```
The backend starts at `http://localhost:5000` and automatically connects to the live Binance Futures WebSocket stream.

### Step 3: Start the Frontend UI
In a second terminal:
```bash
cd frontend
npm run dev -- --host
```
The frontend is accessible at:
- **Local PC:** `http://localhost:5173/`
- **Mobile Devices (Same Wi-Fi):** `http://YOUR_LOCAL_IP:5173/` (displayed in terminal output)

---

## 📱 How to Use on iPhone (iOS) & Android Devices

ApexAlgo is built as a **Progressive Web App (PWA)** with native mobile device capabilities:

### On iPhone (iOS Safari):
1. Connect your iPhone to the same local Wi-Fi network as your computer.
2. Open Safari and navigate to your computer's local IP (e.g. `http://192.168.1.4:5173/`).
3. Tap the **Share** button at the bottom of Safari.
4. Scroll down and select **"Add to Home Screen"**.
5. ApexAlgo installs directly onto your iOS home screen as a standalone full-screen app!

### On Android (Google Chrome):
1. Open Google Chrome on your Android phone and navigate to `http://YOUR_LOCAL_IP:5173/`.
2. Tap the three-dot menu (**⋮**) in the top right corner.
3. Tap **"Install app"** or **"Add to Home screen"**.
4. The app icon will appear on your app drawer and home screen.

---

## ⚙️ Architecture & Directory Structure

```
Trading_App/
├── backend/
│   ├── src/
│   │   ├── config.js               # Global pairs, leverage, margin defaults
│   │   ├── index.js                # Express REST API & Socket.io server
│   │   └── services/
│   │       ├── binanceService.js   # Binance public REST, WebSocket & CCXT
│   │       ├── paperTradingService.js # Simulated wallet, leverage & PnL
│   │       ├── indicatorService.js # Technical indicators (RSI, MACD, BB, EMA, ATR)
│   │       ├── strategyEngine.js   # 8 automated Long/Short strategy runners
│   │       ├── marginGuardian.js   # Margin Got Time Auto-Close watchdog
│   │       ├── tradingViewWebhook.js # Pine Script webhook receiver
│   │       ├── backtestEngine.js   # Quantitative historical simulator
│   │       └── aiPredictorService.js # AI Confluence & NLP sentiment
│   └── package.json
├── frontend/
│   ├── public/
│   │   ├── manifest.json           # PWA mobile app manifest
│   │   ├── icon-192.svg            # Mobile app icon
│   │   └── icon-512.svg            # Mobile app splash icon
│   ├── src/
│   │   ├── components/
│   │   │   ├── Header.jsx          # Header with live tickers & panic close
│   │   │   ├── TickerTape.jsx      # Top asset horizontal ticker strip
│   │   │   ├── ChartSection.jsx    # TradingView Lightweight Candlestick Chart
│   │   │   ├── OrderTerminal.jsx   # Long/Short order input & leverage slider
│   │   │   ├── PositionsPanel.jsx  # Active positions & Margin Ratio meters
│   │   │   ├── AutoTradingBotPanel.jsx # 8-strategy bot controller & log stream
│   │   │   ├── MarginGuardianPanel.jsx # Dedicated Margin Auto-Close config
│   │   │   ├── TradingViewWebhookModal.jsx # Webhook setup & alert generator
│   │   │   ├── BacktesterPanel.jsx # Quantitative backtest engine view
│   │   │   ├── AiIntelligencePanel.jsx # AI Confluence & Sentiment score
│   │   │   ├── BottomNav.jsx       # Native mobile bottom tab bar
│   │   │   └── SettingsModal.jsx   # Binance API keys & paper wallet reset
│   │   ├── utils/
│   │   │   └── audioAlerts.js      # Web Audio API chimes & margin siren
│   │   ├── App.jsx                 # Root component with live WebSocket state
│   │   ├── index.css               # Obsidian dark crypto theme styles
│   │   └── main.jsx
│   ├── vite.config.js
│   └── package.json
└── README.md
```

---

## 🔒 Security & Best Practices

- **API Key Safety:** When connecting real Binance API keys, only enable **"Enable Futures"** or **"Enable Spot Trading"**. **NEVER enable "Enable Withdrawals"**.
- **Margin Threshold Recommendation:** Keep the Margin Guardian threshold set between **70% and 80%** to allow normal price breathing room while safeguarding against sudden flash crashes.
- **Test Before Capital:** Always run strategies in **Paper Trading Mode** for at least 48 hours to inspect execution behavior before deploying real capital.

---

## 📜 License
MIT License. Built for algorithmic crypto traders and quantitative developers.
