export const CONFIG = {
  PORT: process.env.PORT || 5000,
  DEFAULT_PAIRS: [
    { symbol: 'BTCUSDT', name: 'Bitcoin', base: 'BTC', quote: 'USDT', precision: 2, minQty: 0.001, stepDecimals: 3, minNotional: 50 },
    { symbol: 'ETHUSDT', name: 'Ethereum', base: 'ETH', quote: 'USDT', precision: 2, minQty: 0.001, stepDecimals: 3, minNotional: 20 },
    { symbol: 'SOLUSDT', name: 'Solana', base: 'SOL', quote: 'USDT', precision: 2, minQty: 0.01, stepDecimals: 2, minNotional: 5.5 },
    { symbol: 'BNBUSDT', name: 'BNB', base: 'BNB', quote: 'USDT', precision: 2, minQty: 0.01, stepDecimals: 2, minNotional: 5.5 },
    { symbol: 'DOGEUSDT', name: 'Dogecoin', base: 'DOGE', quote: 'USDT', precision: 4, minQty: 1, stepDecimals: 0, minNotional: 5.5 },
    { symbol: 'XRPUSDT', name: 'Ripple', base: 'XRP', quote: 'USDT', precision: 4, minQty: 0.1, stepDecimals: 1, minNotional: 5.5 },
    { symbol: 'ADAUSDT', name: 'Cardano', base: 'ADA', quote: 'USDT', precision: 4, minQty: 1, stepDecimals: 0, minNotional: 5.5 },
    { symbol: 'AVAXUSDT', name: 'Avalanche', base: 'AVAX', quote: 'USDT', precision: 2, minQty: 1, stepDecimals: 0, minNotional: 5.5 },
    { symbol: 'LINKUSDT', name: 'Chainlink', base: 'LINK', quote: 'USDT', precision: 3, minQty: 0.01, stepDecimals: 2, minNotional: 20 },
    { symbol: 'SUIUSDT', name: 'Sui', base: 'SUI', quote: 'USDT', precision: 4, minQty: 0.1, stepDecimals: 1, minNotional: 5.5 },
    { symbol: 'NEARUSDT', name: 'NEAR Protocol', base: 'NEAR', quote: 'USDT', precision: 3, minQty: 1, stepDecimals: 0, minNotional: 5.5 },
    { symbol: 'PEPEUSDT', name: 'Pepe', base: 'PEPE', quote: 'USDT', precision: 8, minQty: 1, stepDecimals: 0, minNotional: 5.5 }
  ],
  AUTO_MARKET_SCANNER: {
    SCAN_INTERVAL_MS: 5000,
    MIN_CONFIDENCE_AUTO_TRADE: 80,
    TOP_OPPORTUNITIES_LIMIT: 6
  },
  DEFAULT_LEVERAGE: 10,
  MAX_LEVERAGE: 125,
  PAPER_TRADING_DEFAULT_BALANCE: 10000.0, // $10,000 USDT Demo Balance
  
  // MARGIN AUTO CLOSE GUARDIAN DEFAULTS
  MARGIN_GUARDIAN: {
    DEFAULT_CRITICAL_MARGIN_RATIO: 80, // Auto close when margin ratio reaches 80% to avoid liquidation
    DEFAULT_STOP_LOSS_PCT: 4.5,        // Auto close if loss > 4.5%
    DEFAULT_TAKE_PROFIT_PCT: 9.0,      // Auto close if profit > 9.0%
    DEFAULT_TRAILING_STOP_PCT: 2.0,    // Trailing lock-in
    MAX_ACCOUNT_DRAWDOWN_PCT: 15.0,    // Account kill-switch
    CHECK_INTERVAL_MS: 500             // Monitor margin every 500ms
  },

  // STRATEGIES METADATA
  STRATEGIES: [
    {
      id: 'trend_following',
      name: 'Trend Following (EMA & ADX)',
      description: 'Trades in the direction of dominant trend using EMA 9/21 cross with ADX trend strength validation.',
      timeframe: '15m',
      riskLevel: 'Moderate',
      recommendedLeverage: 10
    },
    {
      id: 'breakout_trading',
      name: 'Breakout Squeeze (Bollinger + Volume)',
      description: 'Detects volatility contraction (squeeze) and enters when price pierces bands with surging volume.',
      timeframe: '5m',
      riskLevel: 'High',
      recommendedLeverage: 12
    },
    {
      id: 'mean_reversion',
      name: 'Mean Reversion (RSI & BB Bounce)',
      description: 'Capitalizes on overextended price swings reverting to the moving average when RSI reaches extreme levels.',
      timeframe: '15m',
      riskLevel: 'Moderate',
      recommendedLeverage: 8
    },
    {
      id: 'momentum_scalper',
      name: 'Momentum Scalper (MACD + RSI Turbo)',
      description: 'Rapid entries on sub-minute to 5-minute charts capturing fast price bursts with tight trailing stops.',
      timeframe: '1m',
      riskLevel: 'High',
      recommendedLeverage: 15
    },
    {
      id: 'swing_trader',
      name: 'Swing Wave Rider (EMA 50/200 & SuperTrend)',
      description: 'Multi-hour to multi-day macro position trading riding major trend waves.',
      timeframe: '1h',
      riskLevel: 'Low',
      recommendedLeverage: 5
    },
    {
      id: 'grid_dca',
      name: 'Dynamic Grid & DCA Mesh',
      description: 'Automated laddered buy/sell orders capturing volatility in sideways and range-bound markets.',
      timeframe: '5m',
      riskLevel: 'Low-Moderate',
      recommendedLeverage: 5
    },
    {
      id: 'arbitrage_scanner',
      name: 'Pairs & Funding Rate Arbitrage',
      description: 'Simulates cross-asset divergence and funding rate capture between Spot and Perpetual Futures.',
      timeframe: '1m',
      riskLevel: 'Very Low',
      recommendedLeverage: 3
    },
    {
      id: 'ai_sentiment_ml',
      name: 'AI & Sentiment ML Confluence Engine',
      description: 'Neural aggregate scoring engine combining multi-timeframe indicators with live crypto market sentiment.',
      timeframe: '5m',
      riskLevel: 'Adaptive',
      recommendedLeverage: 10
    }
  ],

  TRADINGVIEW: {
    WEBHOOK_PATH: '/api/webhook/tradingview',
    DEFAULT_SECRET: 'AGY_AUTOTRADE_SECURE_TOKEN_2026'
  }
};
