import { Injectable, signal, computed, effect, inject } from '@angular/core';
import { MarketService } from './market.service';

export interface LogEntry {
  time: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

export interface ActivePosition {
  id: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  takeProfit: number;
  stopLoss: number;
  amount: number;
  leverage: number; // Added leverage field
  startTime: number;
  triggerReason: string;
}

export interface ClosedTrade extends ActivePosition {
  exitPrice: number;
  closeTime: number;
  pnl: number;
  pnlPercent: number;
  closeReason: string;
  mode: BotMode;
}

export type BotMode = 'VST' | 'BINANCE' | 'BINGX';
export type MarketType = 'SPOT' | 'FUTURES';

@Injectable({
  providedIn: 'root'
})
export class BotEngineService {
  private market = inject(MarketService);

  // Bot Configuration
  isActive = signal(false);
  
  // Mode & connection settings
  currentMode = signal<BotMode>('VST');
  marketType = signal<MarketType>('SPOT');
  
  // Timezone Settings (Default UTC-3 for Argentina)
  timezoneOffset = signal<number>(-3);
  
  // VST Specific
  vstBalance = signal<number>(10000); // 10k Demo money
  
  // Trading settings
  positionSize = signal<number>(100); // USDT Margin
  leverage = signal<number>(1); // Default 1x
  
  logs = signal<LogEntry[]>([]);
  
  // Strategy State
  activePosition = signal<ActivePosition | null>(null);
  
  // HISTORY & METRICS
  tradeHistory = signal<ClosedTrade[]>([]);

  // Computed Metrics
  metrics = computed(() => {
    const history = this.tradeHistory();
    const totalTrades = history.length;
    
    if (totalTrades === 0) {
      return {
        winRate: 0,
        totalPnL: 0,
        totalTrades: 0,
        longWinRate: 0,
        shortWinRate: 0,
        longs: 0,
        shorts: 0,
        profitFactor: 0
      };
    }

    const wins = history.filter(t => t.pnl > 0).length;
    const totalPnL = history.reduce((acc, t) => acc + t.pnl, 0);
    
    const longs = history.filter(t => t.side === 'LONG');
    const shorts = history.filter(t => t.side === 'SHORT');
    
    const longWins = longs.filter(t => t.pnl > 0).length;
    const shortWins = shorts.filter(t => t.pnl > 0).length;

    const grossProfit = history.filter(t => t.pnl > 0).reduce((acc, t) => acc + t.pnl, 0);
    const grossLoss = Math.abs(history.filter(t => t.pnl < 0).reduce((acc, t) => acc + t.pnl, 0));

    return {
      winRate: (wins / totalTrades) * 100,
      totalPnL,
      totalTrades,
      longWinRate: longs.length > 0 ? (longWins / longs.length) * 100 : 0,
      shortWinRate: shorts.length > 0 ? (shortWins / shorts.length) * 100 : 0,
      longs: longs.length,
      shorts: shorts.length,
      profitFactor: grossLoss === 0 ? grossProfit : grossProfit / grossLoss
    };
  });

  constructor() {
    this.addLog('System initialized. Connecting to Live Feed...', 'info');

    // Run strategy whenever data updates
    effect(() => {
      const candles = this.market.candles();
      const sma5 = this.market.sma5();
      const sma10 = this.market.sma10();
      const sma20 = this.market.sma20();

      if (this.isActive() && candles.length > 0) {
        this.checkStrategy(candles[candles.length - 1].close, sma5, sma10, sma20);
      }
    });
    
    // Check for TP/SL hits
    effect(() => {
        const candles = this.market.candles();
        const pos = this.activePosition();
        if (pos && candles.length > 0) {
            const currentPrice = candles[candles.length - 1].close;
            this.checkTpSl(currentPrice, pos);
        }
    });
  }

  setMode(mode: BotMode) {
    this.currentMode.set(mode);
    this.isActive.set(false);
    this.addLog(`Switched to ${mode} Mode`, 'info');
  }

  setMarketType(type: MarketType) {
    this.marketType.set(type);
    this.addLog(`Market set to ${type}`, 'info');
  }

  toggleBot(state: boolean) {
    this.isActive.set(state);
    const context = this.currentMode() === 'VST' ? 'VST Simulation' : `${this.currentMode()} (${this.marketType()})`;
    
    if (state) {
      this.addLog(`Bot STARTED on ${context}`, 'success');
    } else {
      this.addLog('Bot STOPPED', 'warning');
    }
  }

  resetVST() {
    this.vstBalance.set(10000);
    this.activePosition.set(null);
    this.tradeHistory.set([]);
    this.addLog('VST Balance & History reset', 'info');
  }

  manualClosePosition() {
    const candles = this.market.candles();
    if (this.activePosition() && candles.length > 0) {
      const currentPrice = candles[candles.length - 1].close;
      this.closePosition(currentPrice, 'Manual Close');
    }
  }

  addLog(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const offsetTime = new Date(utc + (3600000 * this.timezoneOffset()));
    const time = offsetTime.toLocaleTimeString('en-GB', { hour12: false });
    
    this.logs.update(logs => [{ time, message, type }, ...logs].slice(0, 50));
  }

  private checkStrategy(currentPrice: number, sma5Data: any[], sma10Data: any[], sma20Data: any[]) {
    if (sma5Data.length < 2 || sma10Data.length < 2 || sma20Data.length < 2) return;

    const currSMA5 = sma5Data[sma5Data.length - 1].value;
    const prevSMA5 = sma5Data[sma5Data.length - 2].value;
    const currSMA10 = sma10Data[sma10Data.length - 1].value;
    const prevSMA10 = sma10Data[sma10Data.length - 2].value;
    const currSMA20 = sma20Data[sma20Data.length - 1].value;

    const isCrossUp = prevSMA5 <= prevSMA10 && currSMA5 > currSMA10;
    const isCrossDown = prevSMA5 >= prevSMA10 && currSMA5 < currSMA10;
    const isUptrend = currentPrice > currSMA20;
    const isDowntrend = currentPrice < currSMA20;

    const pos = this.activePosition();

    if (!pos) {
        if (isCrossUp && isUptrend) {
            this.openPosition('LONG', currentPrice, 'SMA 5/10 Cross UP + > SMA20');
        } else if (isCrossDown && isDowntrend) {
            if (this.currentMode() === 'VST' || this.marketType() === 'FUTURES') {
                this.openPosition('SHORT', currentPrice, 'SMA 5/10 Cross DOWN + < SMA20');
            }
        }
    } else {
        if (pos.side === 'LONG' && isCrossDown) {
            this.closePosition(currentPrice, 'Signal Reversal (Cross Down)');
        } else if (pos.side === 'SHORT' && isCrossUp) {
            this.closePosition(currentPrice, 'Signal Reversal (Cross Up)');
        }
    }
  }

  private checkTpSl(currentPrice: number, pos: ActivePosition) {
    if (pos.side === 'LONG') {
        if (currentPrice >= pos.takeProfit) {
            this.closePosition(currentPrice, 'Take Profit');
        } else if (currentPrice <= pos.stopLoss) {
            this.closePosition(currentPrice, 'Stop Loss');
        }
    } else {
        if (currentPrice <= pos.takeProfit) {
            this.closePosition(currentPrice, 'Take Profit');
        } else if (currentPrice >= pos.stopLoss) {
            this.closePosition(currentPrice, 'Stop Loss');
        }
    }
  }

  private openPosition(side: 'LONG' | 'SHORT', price: number, reason: string) {
    const amount = this.positionSize();
    const lev = this.leverage();
    
    // Calculate TP/SL adjusted for leverage to ensure safety? 
    // Usually TP/SL is percentage of price movement, independent of leverage for the trigger, 
    // but the PnL impact is leveraged.
    
    let tp, sl;
    // We keep strict 1.5% and 1% price movement TP/SL
    const tpPercent = 0.015; 
    const slPercent = 0.010; 

    if (side === 'LONG') {
        tp = price * (1 + tpPercent);
        sl = price * (1 - slPercent);
    } else {
        tp = price * (1 - tpPercent);
        sl = price * (1 + slPercent);
    }

    if (this.currentMode() === 'VST') {
        const balance = this.vstBalance();
        if (balance < amount) {
            this.addLog('VST Error: Insufficient funds', 'error');
            return;
        }
        this.vstBalance.update(b => b - amount); // Deduct margin
        
        this.activePosition.set({
            id: crypto.randomUUID().split('-')[0],
            side,
            entryPrice: price,
            takeProfit: tp,
            stopLoss: sl,
            amount,
            leverage: lev,
            startTime: Date.now(),
            triggerReason: reason
        });
        
        this.addLog(`VST ${side} OPENED @ ${price.toFixed(2)} (x${lev})`, 'success');
    } else {
        this.addLog(`SIGNAL: Open ${side} @ ${price.toFixed(2)} (x${lev})`, 'warning');
    }
  }

  private closePosition(price: number, reason: string) {
    const pos = this.activePosition();
    if (!pos) return;

    if (this.currentMode() === 'VST') {
        let pnl = 0;
        let pnlPercent = 0;
        const entry = pos.entryPrice;
        
        // PnL Logic with Leverage:
        // Position Value = Margin * Leverage
        // PnL = Position Value * % Price Change
        const positionValue = pos.amount * pos.leverage;

        if (pos.side === 'LONG') {
            const priceChange = (price - entry) / entry;
            pnl = positionValue * priceChange;
            pnlPercent = priceChange * pos.leverage * 100;
        } else {
            // SHORT
            const priceChange = (entry - price) / entry;
            pnl = positionValue * priceChange;
            pnlPercent = priceChange * pos.leverage * 100;
        }

        const returnAmount = pos.amount + pnl;
        this.vstBalance.update(b => b + returnAmount);
        
        const type = pnl >= 0 ? 'success' : 'error';
        const sign = pnl >= 0 ? '+' : '';
        this.addLog(`VST ${pos.side} CLOSED @ ${price.toFixed(2)}. PnL: ${sign}${pnl.toFixed(2)} (${pnlPercent.toFixed(2)}%)`, type);
        
        const closedTrade: ClosedTrade = {
          ...pos,
          exitPrice: price,
          closeTime: Date.now(),
          pnl: pnl,
          pnlPercent: pnlPercent,
          closeReason: reason,
          mode: this.currentMode()
        };

        this.tradeHistory.update(history => [closedTrade, ...history]);
        this.activePosition.set(null);
    } else {
         this.addLog(`SIGNAL: Close ${pos.side} @ ${price.toFixed(2)} (${reason})`, 'warning');
         this.activePosition.set(null);
    }
  }
}