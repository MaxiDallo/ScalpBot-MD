import { Component } from '@angular/core';
import { ChartComponent } from './components/chart.component';
import { ControlsComponent } from './components/controls.component';
import { BottomPanelComponent } from './components/bottom-panel.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ChartComponent, ControlsComponent, BottomPanelComponent],
  templateUrl: './app.component.html',
})
export class AppComponent {}