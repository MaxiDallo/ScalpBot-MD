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
  leverage: number;
  startTime: number;
  triggerReason: string;
  isTrailingActive: boolean; // To track if Break Even has been triggered
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

  // Strategy Risk Settings
  tpPercent = signal<number>(0.5); // 0.5% default
  slPercent = signal<number>(0.3); // 0.3% default
  useTrailingStop = signal<boolean>(false);
  useSignalExit = signal<boolean>(false); // NEW: Toggle for Signal Exit logic
  
  logs = signal<LogEntry[]>([]);
  
  // Strategy State
  activePosition = signal<ActivePosition | null>(null);
  lastClosedCandleTime = 0; // To prevent over-trading on same candle
  
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
        // We use the last closed candle for signal confirmation if desired, 
        // but for real-time scalping, we often look at the current forming candle or the last completed one.
        // The requirement says "analyze the close of each candle", implying we check the latest closed state.
        // However, in live streaming, 'candles' updates every tick. 
        // We will check strategy on the LATEST available price point (current candle).
        const currentCandle = candles[candles.length - 1];
        
        // Ensure arrays are aligned
        if(sma5.length > 0 && sma10.length > 0 && sma20.length > 0) {
            this.checkStrategy(currentCandle, sma5, sma10, sma20);
        }
      }
    });
    
    // Check for TP/SL hits (Tick by Tick)
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

  private checkStrategy(currentCandle: any, sma5Data: any[], sma10Data: any[], sma20Data: any[]) {
    // Need at least one valid point
    if (sma5Data.length < 1 || sma10Data.length < 1 || sma20Data.length < 1) return;

    const currentPrice = currentCandle.close;
    
    // Get latest SMA values (corresponding to current time)
    const sma5 = sma5Data[sma5Data.length - 1].value;
    const sma10 = sma10Data[sma10Data.length - 1].value;
    const sma20 = sma20Data[sma20Data.length - 1].value;

    const pos = this.activePosition();

    // --- EXIT LOGIC (Signal Exit) ---
    // "Salida por Señal: Si no toca TP ni SL, cerrar la posición inmediatamente si se pierde la alineación"
    // OPTIONAL: Only if enabled by user
    if (pos) {
       if (this.useSignalExit()) {
           if (pos.side === 'LONG') {
             // Long Exit: If SMA5 crosses below SMA10 (Loss of momentum)
             if (sma5 < sma10) {
                this.closePosition(currentPrice, 'Signal Exit (5 < 10)');
             }
           } else {
             // Short Exit: If SMA5 crosses above SMA10
             if (sma5 > sma10) {
                this.closePosition(currentPrice, 'Signal Exit (5 > 10)');
             }
           }
       }
       return; // Don't check entry if we are in a position
    }

    // --- ENTRY LOGIC ---
    
    // 1. Cool-down Check (Over-trading prevention)
    // Wait at least 1 candle from the last close before entering again.
    // We approximate this by checking if the current candle time is strictly greater than the last closed candle time.
    if (currentCandle.time <= this.lastClosedCandleTime) {
       return; 
    }

    // 2. Noise Filter
    // "Evitar entrar si la diferencia porcentual entre la SMA5 y la SMA20 es menor al 0.1%"
    const volatility = Math.abs(sma5 - sma20) / sma20;
    const isVolatile = volatility >= 0.001; // 0.1%

    if (!isVolatile) return; // Market is too flat

    // 3. Alignment Algorithm
    // LONG: Close > SMA5 > SMA10 > SMA20
    const isLongAligned = currentPrice > sma5 && sma5 > sma10 && sma10 > sma20;
    
    // SHORT: Close < SMA5 < SMA10 < SMA20
    const isShortAligned = currentPrice < sma5 && sma5 < sma10 && sma10 < sma20;

    if (isLongAligned) {
       this.openPosition('LONG', currentPrice, `Aligned: 5>10>20 (Vol: ${(volatility*100).toFixed(2)}%)`);
    } else if (isShortAligned) {
       // Only Short in Futures or VST
       if (this.currentMode() === 'VST' || this.marketType() === 'FUTURES') {
          this.openPosition('SHORT', currentPrice, `Aligned: 5<10<20 (Vol: ${(volatility*100).toFixed(2)}%)`);
       }
    }
  }

  private checkTpSl(currentPrice: number, pos: ActivePosition) {
    // 1. Check Hard TP/SL
    if (pos.side === 'LONG') {
        if (currentPrice >= pos.takeProfit) {
            this.closePosition(currentPrice, 'Take Profit');
            return;
        } else if (currentPrice <= pos.stopLoss) {
            this.closePosition(currentPrice, 'Stop Loss');
            return;
        }
    } else {
        if (currentPrice <= pos.takeProfit) {
            this.closePosition(currentPrice, 'Take Profit');
            return;
        } else if (currentPrice >= pos.stopLoss) {
            this.closePosition(currentPrice, 'Stop Loss');
            return;
        }
    }

    // 2. Trailing Stop Logic (Break Even)
    // "Si el precio se mueve X% a favor, mover el SL al punto de entrada"
    // We'll define "X%" as 50% of the way to the Take Profit.
    if (this.useTrailingStop() && !pos.isTrailingActive) {
        const tpDist = Math.abs(pos.takeProfit - pos.entryPrice);
        const triggerDist = tpDist * 0.5; // Trigger at 50% of TP distance

        if (pos.side === 'LONG') {
            if (currentPrice >= pos.entryPrice + triggerDist) {
                // Move SL to Break Even (Entry Price + small buffer to cover fees maybe? let's stick to Entry)
                const newSl = pos.entryPrice * 1.0005; // Entry + 0.05% to cover fees
                this.updatePositionSL(newSl, true);
                this.addLog(`Trailing Stop Activated: SL moved to Break Even (${newSl.toFixed(2)})`, 'info');
            }
        } else {
             if (currentPrice <= pos.entryPrice - triggerDist) {
                const newSl = pos.entryPrice * 0.9995; // Entry - 0.05%
                this.updatePositionSL(newSl, true);
                this.addLog(`Trailing Stop Activated: SL moved to Break Even (${newSl.toFixed(2)})`, 'info');
             }
        }
    }
  }

  private updatePositionSL(newSl: number, isTrailing: boolean) {
      this.activePosition.update(p => {
          if (!p) return null;
          return { ...p, stopLoss: newSl, isTrailingActive: isTrailing };
      });
  }

  private openPosition(side: 'LONG' | 'SHORT', price: number, reason: string) {
    const amount = this.positionSize();
    const lev = this.leverage();
    
    // Dynamic TP/SL from User Inputs
    const tpP = this.tpPercent() / 100;
    const slP = this.slPercent() / 100;

    let tp, sl;

    if (side === 'LONG') {
        tp = price * (1 + tpP);
        sl = price * (1 - slP);
    } else {
        tp = price * (1 - tpP);
        sl = price * (1 + slP);
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
            triggerReason: reason,
            isTrailingActive: false
        });
        
        this.addLog(`VST ${side} OPENED @ ${price.toFixed(2)} (x${lev}). TP: ${this.tpPercent()}%, SL: ${this.slPercent()}%`, 'success');
    } else {
        this.addLog(`SIGNAL: Open ${side} @ ${price.toFixed(2)} (x${lev})`, 'warning');
    }
  }

  private closePosition(price: number, reason: string) {
    const pos = this.activePosition();
    if (!pos) return;

    // Record the time of the candle used for closing (approximate to now)
    // We use this to block re-entry on the current candle
    const candles = this.market.candles();
    if (candles.length > 0) {
        this.lastClosedCandleTime = candles[candles.length - 1].time;
    }

    if (this.currentMode() === 'VST') {
        let pnl = 0;
        let pnlPercent = 0;
        const entry = pos.entryPrice;
        
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