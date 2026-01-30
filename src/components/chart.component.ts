import { Component, ElementRef, viewChild, effect, inject, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { createChart, IChartApi, ISeriesApi, LineStyle, CandlestickSeries, LineSeries, IPriceLine, Time } from 'lightweight-charts';
import { MarketService } from '../services/market.service';
import { BotEngineService } from '../services/bot-engine.service';

@Component({
  selector: 'app-chart',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="w-full h-full relative group" #chartContainer>
      @if (market.isLoading()) {
        <div class="absolute inset-0 flex items-center justify-center bg-gray-900/50 z-10">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500"></div>
        </div>
      }
      
      <!-- Timezone Selector Overlay -->
      <div class="absolute bottom-1 right-1 z-20 opacity-50 group-hover:opacity-100 transition-opacity duration-200">
        <select 
          [ngModel]="bot.timezoneOffset()" 
          (ngModelChange)="bot.timezoneOffset.set(+$event)"
          class="bg-gray-900/90 border border-gray-700 text-[10px] text-gray-400 rounded px-1 py-0.5 focus:outline-none focus:border-cyan-500 cursor-pointer hover:bg-gray-800 hover:text-gray-200 shadow-lg backdrop-blur-sm">
            <option value="0">UTC</option>
            <option value="-3">UTC-3 (ARG)</option>
            <option value="-4">UTC-4 (NYC)</option>
            <option value="-5">UTC-5 (CHI)</option>
            <option value="1">UTC+1 (LON)</option>
            <option value="2">UTC+2 (BER)</option>
            <option value="8">UTC+8 (SIN)</option>
            <option value="9">UTC+9 (TYO)</option>
        </select>
      </div>
    </div>
  `
})
export class ChartComponent implements OnDestroy {
  market = inject(MarketService);
  bot = inject(BotEngineService);
  chartContainer = viewChild<ElementRef>('chartContainer');

  private chart: IChartApi | null = null;
  private candleSeries: ISeriesApi<"Candlestick"> | null = null;
  private sma5Series: ISeriesApi<"Line"> | null = null;
  private sma10Series: ISeriesApi<"Line"> | null = null;
  private sma20Series: ISeriesApi<"Line"> | null = null;

  // Price Lines for active position
  private entryLine: IPriceLine | null = null;
  private tpLine: IPriceLine | null = null;
  private slLine: IPriceLine | null = null;
  
  // New: Trailing Trigger Line
  private beTriggerLine: IPriceLine | null = null;

  constructor() {
    effect(() => {
      const container = this.chartContainer()?.nativeElement;
      if (container && !this.chart) {
        this.initChart(container);
      }
    });

    effect(() => {
      const candles = this.market.candles();
      if (this.candleSeries && candles.length) {
        this.candleSeries.setData(candles as any);
      }
    });

    effect(() => {
      const sma5 = this.market.sma5();
      if (this.sma5Series && sma5.length) {
        this.sma5Series.setData(sma5 as any);
      }
    });

    effect(() => {
      const sma10 = this.market.sma10();
      if (this.sma10Series && sma10.length) {
        this.sma10Series.setData(sma10 as any);
      }
    });

    effect(() => {
      const sma20 = this.market.sma20();
      if (this.sma20Series && sma20.length) {
        this.sma20Series.setData(sma20 as any);
      }
    });

    // Handle Timezone Changes
    effect(() => {
      const offset = this.bot.timezoneOffset();
      if (this.chart) {
        this.chart.applyOptions({
          localization: {
            timeFormatter: (timestamp: number) => {
              // Convert Unix timestamp (seconds) to formatted string with offset
              // Timestamp * 1000 = UTC ms
              const date = new Date(timestamp * 1000);
              const utcHours = date.getUTCHours();
              const utcMinutes = date.getUTCMinutes();
              
              let adjustedHour = utcHours + offset;
              // Handle day wrapping simply for display
              if (adjustedHour < 0) adjustedHour += 24;
              if (adjustedHour >= 24) adjustedHour -= 24;

              const hourStr = adjustedHour.toString().padStart(2, '0');
              const minStr = utcMinutes.toString().padStart(2, '0');
              
              return `${hourStr}:${minStr}`;
            }
          }
        });
      }
    });

    // Effect to handle Active Position Lines (Creation/Deletion)
    effect(() => {
      const pos = this.bot.activePosition();
      const useTrailing = this.bot.useTrailingStop();
      
      // Clean up old lines
      if (this.entryLine) { this.candleSeries?.removePriceLine(this.entryLine); this.entryLine = null; }
      if (this.tpLine) { this.candleSeries?.removePriceLine(this.tpLine); this.tpLine = null; }
      if (this.slLine) { this.candleSeries?.removePriceLine(this.slLine); this.slLine = null; }
      if (this.beTriggerLine) { this.candleSeries?.removePriceLine(this.beTriggerLine); this.beTriggerLine = null; }

      if (pos && this.candleSeries) {
        const isLong = pos.side === 'LONG';
        
        // ENTRY
        this.entryLine = this.candleSeries.createPriceLine({
          price: pos.entryPrice,
          color: isLong ? '#26a69a' : '#ef5350', // Green for Long Entry, Red for Short Entry
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: `${pos.side} ENTRY`,
        });

        // TAKE PROFIT (Always Green)
        this.tpLine = this.candleSeries.createPriceLine({
          price: pos.takeProfit,
          color: '#26a69a', 
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'TP',
        });

        // STOP LOSS (Always Red)
        this.slLine = this.candleSeries.createPriceLine({
          price: pos.stopLoss,
          color: '#ef5350', 
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'SL',
        });

        // TRAILING TRIGGER LINE (Visual Aid)
        // Show only if enabled and NOT yet triggered
        if (useTrailing && !pos.isTrailingActive) {
            const tpDist = Math.abs(pos.takeProfit - pos.entryPrice);
            const triggerPrice = isLong 
                ? pos.entryPrice + (tpDist * 0.5)
                : pos.entryPrice - (tpDist * 0.5);

            this.beTriggerLine = this.candleSeries.createPriceLine({
                price: triggerPrice,
                color: '#3b82f6', // Blue
                lineWidth: 1,
                lineStyle: LineStyle.SparseDotted,
                axisLabelVisible: false,
                title: 'BE TRIGGER',
            });
        }
      }
    });

    // New Effect: Real-time PnL Update on Entry Line Label
    effect(() => {
      const pos = this.bot.activePosition();
      const candles = this.market.candles();
      
      // Only run if we have an active position, an entry line, and price data
      if (pos && this.entryLine && candles.length > 0) {
        const currentPrice = candles[candles.length - 1].close;
        const leverage = pos.leverage || 1;
        let roe = 0;
        
        if (pos.side === 'LONG') {
           roe = ((currentPrice - pos.entryPrice) / pos.entryPrice) * leverage * 100;
        } else {
           roe = ((pos.entryPrice - currentPrice) / pos.entryPrice) * leverage * 100;
        }
        
        const sign = roe >= 0 ? '+' : '';
        // Update the label title dynamically
        this.entryLine.applyOptions({
           title: `${pos.side} ENTRY (${sign}${roe.toFixed(2)}%)`
        });
      }
    });
  }

  private initChart(container: HTMLElement) {
    this.chart = createChart(container, {
      layout: {
        background: { color: '#171923' },
        textColor: '#A0AEC0',
      },
      grid: {
        vertLines: { color: '#2D3748' },
        horzLines: { color: '#2D3748' },
      },
      width: container.clientWidth,
      height: container.clientHeight,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: '#4A5568',
      },
      rightPriceScale: {
        borderColor: '#4A5568',
      },
    });

    // Use addSeries instead of deprecated addCandlestickSeries
    this.candleSeries = this.chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    // SMA 5 - Blue/Cyan
    this.sma5Series = this.chart.addSeries(LineSeries, {
      color: '#06b6d4',
      lineWidth: 2,
      priceLineVisible: false,
    });

    // SMA 10 - Yellow/Orange
    this.sma10Series = this.chart.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 2,
      priceLineVisible: false,
    });

    // SMA 20 - Purple
    this.sma20Series = this.chart.addSeries(LineSeries, {
      color: '#a855f7',
      lineWidth: 2,
      priceLineVisible: false,
    });

    // Handle Resize
    const resizeObserver = new ResizeObserver(entries => {
      if (entries.length === 0 || entries[0].target !== container) { return; }
      const newRect = entries[0].contentRect;
      this.chart?.applyOptions({ height: newRect.height, width: newRect.width });
    });
    resizeObserver.observe(container);
  }

  ngOnDestroy() {
    if (this.chart) {
      this.chart.remove();
    }
  }
}