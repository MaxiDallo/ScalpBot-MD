import { Component, inject } from '@angular/core';
import { BotEngineService } from '../services/bot-engine.service';

@Component({
  selector: 'app-logs',
  standalone: true,
  template: `
    <div class="h-full flex flex-col bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      <div class="px-4 py-2 bg-gray-800 border-b border-gray-700 flex justify-between items-center">
        <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wider">System Logs</h3>
        <span class="text-[10px] text-gray-500">Live Feed</span>
      </div>
      <div class="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-xs custom-scroll">
        @for (log of bot.logs(); track log.time + log.message) {
          <div class="flex gap-3 animate-fade-in">
            <span class="text-gray-500 shrink-0">[{{log.time}}]</span>
            <span [class]="getColor(log.type)">{{log.message}}</span>
          </div>
        } @empty {
          <div class="text-gray-600 text-center mt-4">No activity recorded</div>
        }
      </div>
    </div>
  `
})
export class LogsComponent {
  bot = inject(BotEngineService);

  getColor(type: string): string {
    switch(type) {
      case 'success': return 'text-green-400';
      case 'warning': return 'text-yellow-400';
      case 'error': return 'text-red-400';
      default: return 'text-cyan-200';
    }
  }
}