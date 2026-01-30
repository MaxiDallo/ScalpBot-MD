import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MarketService } from '../services/market.service';
import { BotEngineService, BotMode } from '../services/bot-engine.service';

@Component({
  selector: 'app-controls',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="bg-gray-900 border border-gray-800 rounded-lg flex flex-col h-full overflow-hidden">
      <!-- Header -->
      <div class="p-5 pb-2">
        <h2 class="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
          ScalpBot v1.0
        </h2>
        <p class="text-xs text-gray-500 mt-1">Algorithmic Trading Dashboard</p>
      </div>

      <!-- Mode Tabs -->
      <div class="flex border-b border-gray-800 bg-gray-950">
        <button (click)="setTab('VST')" 
                [class.text-cyan-400]="bot.currentMode() === 'VST'"
                [class.border-cyan-400]="bot.currentMode() === 'VST'"
                class="flex-1 py-3 text-xs font-bold uppercase tracking-wider border-b-2 border-transparent hover:bg-gray-800 transition-colors text-gray-400">
          VST Mode
        </button>
        <button (click)="setTab('BINANCE')"
                [class.text-yellow-400]="bot.currentMode() === 'BINANCE'"
                [class.border-yellow-400]="bot.currentMode() === 'BINANCE'" 
                class="flex-1 py-3 text-xs font-bold uppercase tracking-wider border-b-2 border-transparent hover:bg-gray-800 transition-colors text-gray-400">
          Binance
        </button>
        <button (click)="setTab('BINGX')"
                [class.text-blue-400]="bot.currentMode() === 'BINGX'"
                [class.border-blue-400]="bot.currentMode() === 'BINGX'"
                class="flex-1 py-3 text-xs font-bold uppercase tracking-wider border-b-2 border-transparent hover:bg-gray-800 transition-colors text-gray-400">
          BingX
        </button>
      </div>

      <div class="p-5 flex flex-col gap-6 flex-1 overflow-y-auto">
        
        <!-- Tab Content: VST -->
        @if (bot.currentMode() === 'VST') {
          <div class="bg-gray-800/50 rounded p-4 border border-cyan-500/20">
             <div class="flex justify-between items-center mb-2">
               <span class="text-xs text-cyan-200 font-bold uppercase">Virtual Balance</span>
               <button (click)="bot.resetVST()" class="text-[10px] text-cyan-500 hover:underline">Reset</button>
             </div>
             <div class="text-2xl font-mono font-bold text-white">
               \${{ bot.vstBalance().toFixed(2) }} <span class="text-sm text-gray-500">USDT</span>
             </div>
             <p class="text-[10px] text-gray-400 mt-2">Simulation mode using live market data but fake money.</p>
          </div>
        } 
        
        <!-- Tab Content: Binance/BingX Configuration -->
        @if (bot.currentMode() !== 'VST') {
          <div class="flex flex-col gap-3 animate-fade-in">
             <div class="flex gap-2 p-1 bg-gray-800 rounded">
                <button (click)="bot.setMarketType('SPOT')"
                        [class.bg-gray-600]="bot.marketType() === 'SPOT'"
                        [class.text-white]="bot.marketType() === 'SPOT'"
                        class="flex-1 py-1 rounded text-xs font-semibold text-gray-400 transition-all">
                  SPOT
                </button>
                <button (click)="bot.setMarketType('FUTURES')"
                        [class.bg-gray-600]="bot.marketType() === 'FUTURES'"
                        [class.text-white]="bot.marketType() === 'FUTURES'"
                        class="flex-1 py-1 rounded text-xs font-semibold text-gray-400 transition-all">
                  FUTURES
                </button>
             </div>

             <div class="space-y-2 mt-2">
               <label class="text-xs text-gray-400 font-semibold uppercase">API Credentials</label>
               <input type="password" placeholder="API Key" class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-cyan-500 transition-colors" />
               <input type="password" placeholder="Secret Key" class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-cyan-500 transition-colors" />
             </div>
          </div>
        }

        <!-- Common Settings -->
        <div class="h-px bg-gray-800"></div>

        <!-- Timeframe Selector -->
        <div class="flex flex-col gap-2">
          <label class="text-xs text-gray-400 uppercase font-semibold">Timeframe</label>
          <div class="grid grid-cols-3 gap-2">
            @for (tf of ['1m', '5m', '15m']; track tf) {
              <button 
                (click)="market.setInterval(tf)"
                [class.bg-cyan-600]="market.interval() === tf"
                [class.bg-gray-800]="market.interval() !== tf"
                class="px-3 py-2 rounded text-xs font-bold transition-all hover:bg-cyan-700 text-white">
                {{ tf }}
              </button>
            }
          </div>
        </div>

        <!-- Leverage Selector (VST or Futures) -->
        @if (bot.currentMode() === 'VST' || bot.marketType() === 'FUTURES') {
          <div class="flex flex-col gap-3">
             <div class="flex justify-between items-center">
               <label class="text-xs text-gray-400 uppercase font-semibold">Leverage</label>
               <span class="text-xs font-bold text-yellow-400">{{ levValue }}x</span>
             </div>
             <div class="flex items-center gap-3">
                <input 
                  type="range" 
                  min="1" 
                  max="125" 
                  step="1" 
                  [(ngModel)]="levValue" 
                  (ngModelChange)="bot.leverage.set(levValue)"
                  class="w-full accent-yellow-500 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
             </div>
             <div class="flex justify-between text-[10px] text-gray-600 font-mono">
               <span>1x</span>
               <span>20x</span>
               <span>50x</span>
               <span>125x</span>
             </div>
          </div>
          <div class="h-px bg-gray-800"></div>
        }

        <!-- Risk Management -->
        <div class="flex flex-col gap-3">
          <label class="text-xs text-gray-400 uppercase font-semibold">Order Size (Margin)</label>
          <div class="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded px-3 py-2">
            <span class="text-gray-500 text-xs">USDT</span>
            <input 
              type="number" 
              [(ngModel)]="posSize"
              (change)="bot.positionSize.set(posSize)"
              class="w-full bg-transparent text-right text-sm text-white focus:outline-none" />
          </div>
          <div class="text-[10px] text-gray-500 text-right">
             Effective Position: <span class="text-gray-300">{{ (posSize * levValue).toFixed(0) }} USDT</span>
          </div>
        </div>

        <!-- Main Toggle -->
        <div class="mt-auto pt-4">
          <button 
            (click)="toggleBot()"
            [class.bg-green-600]="!bot.isActive()"
            [class.hover:bg-green-500]="!bot.isActive()"
            [class.bg-red-600]="bot.isActive()"
            [class.hover:bg-red-500]="bot.isActive()"
            class="w-full py-4 rounded-lg font-bold text-white shadow-lg transition-all transform hover:scale-[1.02] active:scale-[0.98]">
            {{ bot.isActive() ? 'STOP ENGINE' : 'ACTIVATE ENGINE' }}
          </button>
          <div class="text-center mt-3">
             <span class="text-[10px] uppercase tracking-widest font-bold"
                   [class.text-green-500]="bot.isActive()"
                   [class.text-red-500]="!bot.isActive()">
               {{ bot.isActive() ? '● ' + bot.currentMode() + ' Live' : '○ System Offline' }}
             </span>
          </div>
        </div>
      </div>
    </div>
  `
})
export class ControlsComponent {
  market = inject(MarketService);
  bot = inject(BotEngineService);

  // Local component state
  posSize: number = 100;
  levValue: number = 1;

  setTab(mode: BotMode) {
    this.bot.setMode(mode);
  }

  toggleBot() {
    this.bot.toggleBot(!this.bot.isActive());
  }
}