import { Injectable, signal, computed, OnDestroy } from '@angular/core';

export interface Candle {
  time: number; // Unix timestamp in seconds for lightweight-charts
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface SMAData {
  time: number;
  value: number;
}

@Injectable({
  providedIn: 'root'
})
export class MarketService implements OnDestroy {
  // Signals for state
  candles = signal<Candle[]>([]);
  symbol = signal<string>('BTCUSDT'); // Binance Futures symbol for Perpetual is also BTCUSDT
  interval = signal<string>('1m');
  isLoading = signal<boolean>(false);
  isConnected = signal<boolean>(false);
  
  // Computed Indicators
  sma5 = computed(() => this.calculateSMA(this.candles(), 5));
  sma10 = computed(() => this.calculateSMA(this.candles(), 10));
  sma20 = computed(() => this.calculateSMA(this.candles(), 20));

  private ws: WebSocket | null = null;
  private reconnectTimer: any;
  private isDestroyed = false;

  constructor() {
    // Initial Load
    this.initializeDataFeed();
  }

  setInterval(newInterval: string) {
    this.interval.set(newInterval);
    this.initializeDataFeed();
  }

  private async initializeDataFeed() {
    this.isLoading.set(true);
    // 1. Get History via REST first to fill the chart
    await this.fetchHistoricalData();
    
    // 2. Connect to WebSocket for live updates
    this.connectWebSocket();
  }

  private async fetchHistoricalData() {
    try {
      // Use Binance Futures API (fapi) for BTC/USDT.P data
      const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${this.symbol()}&interval=${this.interval()}&limit=1000`;
      const response = await fetch(url);
      
      if (!response.ok) throw new Error('REST API Error');

      const rawData = await response.json();
      
      const parsedData: Candle[] = rawData.map((d: any) => ({
        time: d[0] / 1000,
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4])
      }));

      // Remove the last candle as it might be incomplete and WS will pick it up
      this.candles.set(parsedData);

    } catch (error) {
      console.error('Failed to fetch history:', error);
      // Fallback if REST fails, we still try WS
    } finally {
      this.isLoading.set(false);
    }
  }

  private connectWebSocket() {
    if (this.ws) {
      this.ws.close();
    }
    
    if (this.isDestroyed) return;

    // Use Binance Futures WebSocket (fstream)
    const wsUrl = `wss://fstream.binance.com/ws/${this.symbol().toLowerCase()}@kline_${this.interval()}`;
    
    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('Binance Futures WS Connected');
        this.isConnected.set(true);
      };

      this.ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.e === 'kline') {
          this.processKlineUpdate(message.k);
        }
      };

      this.ws.onclose = () => {
        this.isConnected.set(false);
        console.warn('Binance Futures WS Closed. Reconnecting...');
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.error('Binance Futures WS Error:', err);
        this.ws?.close();
      };

    } catch (e) {
      console.error('WS Connection failed:', e);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    if (!this.isDestroyed) {
      this.reconnectTimer = setTimeout(() => this.connectWebSocket(), 3000);
    }
  }

  private processKlineUpdate(k: any) {
    const candle: Candle = {
      time: k.t / 1000,
      open: parseFloat(k.o),
      high: parseFloat(k.h),
      low: parseFloat(k.l),
      close: parseFloat(k.c)
    };

    this.candles.update(current => {
      if (current.length === 0) return [candle];

      const lastCandle = current[current.length - 1];

      if (Math.abs(lastCandle.time - candle.time) < 1) {
        // Update current candle (same timestamp)
        // We create a new array ref to trigger signals, but we optimize by slicing
        const newCandles = [...current];
        newCandles[newCandles.length - 1] = candle;
        return newCandles;
      } else {
        // New candle started
        return [...current, candle];
      }
    });
  }

  // Simple Moving Average Calculation
  private calculateSMA(data: Candle[], period: number): SMAData[] {
    const smaLine: SMAData[] = [];
    if (data.length < period) return smaLine;

    // Optimization: Only calculate for the last few points if array is huge?
    // For now, full calc is fast enough for <1000 points.
    for (let i = period - 1; i < data.length; i++) {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += data[i - j].close;
      }
      smaLine.push({
        time: data[i].time,
        value: sum / period
      });
    }
    return smaLine;
  }

  // Fallback for simulation if needed (exposed but not used by default now)
  addTick() {
    // Legacy simulation method - keeping for interface compatibility if needed, 
    // but WS is primary.
  }

  ngOnDestroy() {
    this.isDestroyed = true;
    if (this.ws) {
      this.ws.close();
    }
    clearTimeout(this.reconnectTimer);
  }
}