import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BotEngineService } from '../services/bot-engine.service';
import { MarketService } from '../services/market.service';

@Component({
  selector: 'app-bottom-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex flex-col h-full bg-gray-900 border border-gray-800 rounded-lg overflow-hidden shadow-lg">
      <!-- Tab Header -->
      <div class="flex items-center justify-between bg-gray-800/80 backdrop-blur border-b border-gray-700 h-10 select-none">
        <div class="flex h-full">
           <!-- Position Tab -->
           <button 
             (click)="activeTab.set('POSITIONS'); isExpanded.set(true)" 
             [class.text-cyan-400]="activeTab() === 'POSITIONS' && isExpanded()"
             [class.border-cyan-400]="activeTab() === 'POSITIONS' && isExpanded()"
             [class.text-gray-400]="activeTab() !== 'POSITIONS' || !isExpanded()"
             [class.border-transparent]="activeTab() !== 'POSITIONS' || !isExpanded()"
             class="px-4 h-full text-xs font-bold uppercase tracking-wider border-b-2 hover:bg-gray-700/50 transition-colors flex items-center gap-2">
             Posiciones
             @if (bot.activePosition()) {
               <span class="bg-cyan-500/20 text-cyan-400 text-[10px] px-1.5 rounded-full">1</span>
             }
           </button>
           
           <!-- Metrics Tab -->
           <button 
             (click)="activeTab.set('METRICS'); isExpanded.set(true)" 
             [class.text-cyan-400]="activeTab() === 'METRICS' && isExpanded()"
             [class.border-cyan-400]="activeTab() === 'METRICS' && isExpanded()"
             [class.text-gray-400]="activeTab() !== 'METRICS' || !isExpanded()"
             [class.border-transparent]="activeTab() !== 'METRICS' || !isExpanded()"
             class="px-4 h-full text-xs font-bold uppercase tracking-wider border-b-2 hover:bg-gray-700/50 transition-colors flex items-center gap-2">
             Métricas y Rendimiento
           </button>

           <!-- Logs Tab -->
           <button 
             (click)="activeTab.set('LOGS'); isExpanded.set(true)" 
             [class.text-cyan-400]="activeTab() === 'LOGS' && isExpanded()"
             [class.border-cyan-400]="activeTab() === 'LOGS' && isExpanded()"
             [class.text-gray-400]="activeTab() !== 'LOGS' || !isExpanded()"
             [class.border-transparent]="activeTab() !== 'LOGS' || !isExpanded()"
             class="px-4 h-full text-xs font-bold uppercase tracking-wider border-b-2 hover:bg-gray-700/50 transition-colors flex items-center gap-2">
             Registro
           </button>
        </div>
        
        <!-- Collapse Toggle -->
        <button 
          (click)="isExpanded.set(!isExpanded())" 
          class="w-10 h-full flex items-center justify-center text-gray-500 hover:text-gray-200 hover:bg-gray-700 transition-colors">
          <svg [class.rotate-180]="!isExpanded()" class="w-4 h-4 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
             <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
      
      <!-- Content Body -->
      @if(isExpanded()) {
        <div class="flex-1 overflow-auto bg-gray-950/50 relative">
           
           <!-- POSITIONS VIEW -->
           @if(activeTab() === 'POSITIONS') {
              <div class="w-full">
                 @if (bot.activePosition(); as pos) {
                   <table class="w-full text-left border-collapse">
                     <thead class="bg-gray-900/50 text-[10px] uppercase text-gray-500 sticky top-0 z-10">
                       <tr>
                         <th class="px-4 py-2 font-medium">Par</th>
                         <th class="px-4 py-2 font-medium">Lado</th>
                         <th class="px-4 py-2 font-medium text-right">Tamaño</th>
                         <th class="px-4 py-2 font-medium text-right">Entrada</th>
                         <th class="px-4 py-2 font-medium text-right">Actual</th>
                         <th class="px-4 py-2 font-medium text-right">TP / SL</th>
                         <th class="px-4 py-2 font-medium text-right">PnL (ROE %)</th>
                         <th class="px-4 py-2 font-medium text-right">Acción</th>
                       </tr>
                     </thead>
                     <tbody class="text-xs font-mono">
                       <tr class="border-b border-gray-800 hover:bg-gray-800/30 transition-colors">
                         <td class="px-4 py-3 flex items-center gap-2">
                           <div class="w-1 h-4 rounded-full" [class.bg-green-500]="pos.side === 'LONG'" [class.bg-red-500]="pos.side === 'SHORT'"></div>
                           <span class="font-bold text-gray-200">BTCUSDT</span>
                           <span class="px-1.5 py-0.5 ml-1 rounded text-[10px] bg-yellow-900/30 text-yellow-500 border border-yellow-800/50">x{{pos.leverage}}</span>
                         </td>
                         <td class="px-4 py-3 font-bold" [class.text-green-500]="pos.side === 'LONG'" [class.text-red-500]="pos.side === 'SHORT'">
                           {{ pos.side }}
                         </td>
                         <td class="px-4 py-3 text-right text-gray-300">
                            {{ pos.amount.toFixed(2) }}
                            <div class="text-[9px] text-gray-500">Val: {{ (pos.amount * pos.leverage).toFixed(0) }}</div>
                         </td>
                         <td class="px-4 py-3 text-right text-gray-300">{{ pos.entryPrice.toFixed(2) }}</td>
                         <td class="px-4 py-3 text-right text-gray-300">{{ currentPrice().toFixed(2) }}</td>
                         <td class="px-4 py-3 text-right">
                           <span class="text-green-400">{{ pos.takeProfit.toFixed(2) }}</span> / 
                           <span class="text-red-400">{{ pos.stopLoss.toFixed(2) }}</span>
                         </td>
                         <td class="px-4 py-3 text-right font-bold" [class.text-green-500]="pnl().value >= 0" [class.text-red-500]="pnl().value < 0">
                            {{ pnl().value >= 0 ? '+' : '' }}{{ pnl().value.toFixed(2) }} 
                            <span class="text-[10px] opacity-75">({{ pnl().percent.toFixed(2) }}%)</span>
                         </td>
                         <td class="px-4 py-3 text-right">
                           <button (click)="bot.manualClosePosition()" class="px-3 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded text-[10px] text-gray-300 hover:text-white transition-all">
                             Cerrar
                           </button>
                         </td>
                       </tr>
                     </tbody>
                   </table>
                 } @else {
                   <div class="flex flex-col items-center justify-center h-32 text-gray-600 gap-2">
                     <span class="text-xs">No hay posiciones abiertas</span>
                   </div>
                 }
              </div>
           }

           <!-- METRICS VIEW -->
           @if(activeTab() === 'METRICS') {
             <div class="p-4 grid grid-cols-1 lg:grid-cols-4 gap-4 h-full">
               <!-- KPI Cards -->
               <div class="space-y-4 lg:col-span-1">
                 <div class="bg-gray-800/40 border border-gray-800 p-4 rounded-lg">
                   <div class="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Total PnL</div>
                   <div class="text-2xl font-mono font-bold" [class.text-green-400]="bot.metrics().totalPnL >= 0" [class.text-red-400]="bot.metrics().totalPnL < 0">
                     {{ bot.metrics().totalPnL >= 0 ? '+' : ''}}{{ bot.metrics().totalPnL.toFixed(2) }} USDT
                   </div>
                 </div>

                 <div class="bg-gray-800/40 border border-gray-800 p-4 rounded-lg">
                   <div class="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Win Rate Global</div>
                   <div class="flex items-end gap-2">
                     <div class="text-2xl font-mono font-bold text-white">{{ bot.metrics().winRate.toFixed(1) }}%</div>
                     <div class="text-xs text-gray-400 mb-1">de {{ bot.metrics().totalTrades }} trades</div>
                   </div>
                   <!-- Simple Progress Bar -->
                   <div class="w-full bg-gray-700 h-1.5 mt-2 rounded-full overflow-hidden">
                     <div class="bg-gradient-to-r from-cyan-500 to-blue-500 h-full" [style.width.%]="bot.metrics().winRate"></div>
                   </div>
                 </div>

                 <div class="grid grid-cols-2 gap-2">
                    <div class="bg-gray-800/40 border border-gray-800 p-3 rounded-lg">
                      <div class="text-[10px] text-gray-500 uppercase mb-1">Long Accuracy</div>
                      <div class="text-lg font-bold text-green-400">{{ bot.metrics().longWinRate.toFixed(0) }}%</div>
                      <div class="text-[10px] text-gray-600">{{ bot.metrics().longs }} Trades</div>
                    </div>
                    <div class="bg-gray-800/40 border border-gray-800 p-3 rounded-lg">
                      <div class="text-[10px] text-gray-500 uppercase mb-1">Short Accuracy</div>
                      <div class="text-lg font-bold text-red-400">{{ bot.metrics().shortWinRate.toFixed(0) }}%</div>
                      <div class="text-[10px] text-gray-600">{{ bot.metrics().shorts }} Trades</div>
                    </div>
                 </div>
               </div>

               <!-- History Table -->
               <div class="lg:col-span-3 bg-gray-800/20 border border-gray-800 rounded-lg overflow-hidden flex flex-col">
                  <div class="px-4 py-2 bg-gray-800/50 text-[10px] uppercase font-bold text-gray-400 border-b border-gray-800">
                    Historial de Señales y Operaciones
                  </div>
                  <div class="flex-1 overflow-auto custom-scroll">
                    <table class="w-full text-left border-collapse">
                      <thead class="bg-gray-900/50 text-[10px] uppercase text-gray-500 sticky top-0 z-10 backdrop-blur-sm">
                        <tr>
                          <th class="px-3 py-2">Fecha</th>
                          <th class="px-3 py-2">Modo</th>
                          <th class="px-3 py-2">Tipo</th>
                          <th class="px-3 py-2">Lev</th>
                          <th class="px-3 py-2">Señal / Razón de Entrada</th>
                          <th class="px-3 py-2">Salida</th>
                          <th class="px-3 py-2 text-right">PnL</th>
                        </tr>
                      </thead>
                      <tbody class="text-xs font-mono">
                        @for (trade of bot.tradeHistory(); track trade.id) {
                          <tr class="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                            <td class="px-3 py-2 text-gray-400">{{ formatTime(trade.closeTime) }}</td>
                            <td class="px-3 py-2">
                              <span class="px-1.5 py-0.5 rounded text-[9px] font-bold" [class.bg-purple-900]="trade.mode === 'VST'" [class.text-purple-300]="trade.mode === 'VST'">
                                {{ trade.mode }}
                              </span>
                            </td>
                            <td class="px-3 py-2 font-bold" [class.text-green-500]="trade.side === 'LONG'" [class.text-red-500]="trade.side === 'SHORT'">
                              {{ trade.side }}
                            </td>
                            <td class="px-3 py-2 text-yellow-500">x{{ trade.leverage }}</td>
                            <td class="px-3 py-2">
                              <div class="text-gray-300">{{ trade.triggerReason }}</div>
                              <div class="text-[10px] text-gray-600 mt-0.5">Entry: {{ trade.entryPrice.toFixed(2) }}</div>
                            </td>
                            <td class="px-3 py-2">
                              <div class="text-gray-400">{{ trade.closeReason }}</div>
                              <div class="text-[10px] text-gray-600 mt-0.5">Exit: {{ trade.exitPrice.toFixed(2) }}</div>
                            </td>
                            <td class="px-3 py-2 text-right font-bold" [class.text-green-500]="trade.pnl >= 0" [class.text-red-500]="trade.pnl < 0">
                              {{ trade.pnl >= 0 ? '+' : ''}}{{ trade.pnl.toFixed(2) }}
                              <div class="text-[9px] opacity-70">{{ trade.pnlPercent.toFixed(2) }}%</div>
                            </td>
                          </tr>
                        } @empty {
                          <tr><td colspan="7" class="p-8 text-center text-gray-600">No hay datos históricos disponibles</td></tr>
                        }
                      </tbody>
                    </table>
                  </div>
               </div>
             </div>
           }
           
           <!-- LOGS VIEW -->
           @if(activeTab() === 'LOGS') {
              <div class="p-4 space-y-1 font-mono text-xs custom-scroll h-full">
                @for (log of bot.logs(); track log.time + log.message) {
                  <div class="flex gap-3 border-b border-gray-800/50 pb-1 last:border-0">
                    <span class="text-gray-500 shrink-0 w-16 opacity-70">[{{log.time}}]</span>
                    <span [class]="getLogColor(log.type)">{{log.message}}</span>
                  </div>
                } @empty {
                  <div class="text-gray-600 text-center mt-4">Sin registros de actividad</div>
                }
              </div>
           }
        </div>
      }
    </div>
  `
})
export class BottomPanelComponent {
  bot = inject(BotEngineService);
  market = inject(MarketService);
  
  activeTab = signal<'POSITIONS' | 'LOGS' | 'METRICS'>('POSITIONS');
  isExpanded = signal<boolean>(true);

  // Computed helper for current price to avoid looking it up constantly in template
  currentPrice = computed(() => {
    const candles = this.market.candles();
    return candles.length > 0 ? candles[candles.length - 1].close : 0;
  });

  // Computed PnL for active position
  pnl = computed(() => {
    const pos = this.bot.activePosition();
    const current = this.currentPrice();
    
    if (!pos || current === 0) return { value: 0, percent: 0 };

    let pnlValue = 0;
    let pnlPercent = 0;

    // Calculate PnL based on Leverage
    // ROE% = (PriceDiff% * Leverage)
    const positionValue = pos.amount * pos.leverage;

    if (pos.side === 'LONG') {
       const rawPercent = (current - pos.entryPrice) / pos.entryPrice;
       pnlPercent = rawPercent * pos.leverage * 100;
       pnlValue = positionValue * rawPercent;
    } else {
       const rawPercent = (pos.entryPrice - current) / pos.entryPrice;
       pnlPercent = rawPercent * pos.leverage * 100;
       pnlValue = positionValue * rawPercent;
    }

    return { value: pnlValue, percent: pnlPercent };
  });

  formatTime(ms: number) {
    const date = new Date(ms);
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  getLogColor(type: string): string {
    switch(type) {
      case 'success': return 'text-green-400';
      case 'warning': return 'text-yellow-400';
      case 'error': return 'text-red-400';
      default: return 'text-cyan-200';
    }
  }
}