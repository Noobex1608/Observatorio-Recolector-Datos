import { CommonModule } from '@angular/common';
import { Component, computed } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { BaseChartComponent, CHART_COLORS } from './base-chart.component';

@Component({
  selector: 'app-bar-chart',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="modern-bar-chart" [style.min-height]="height">
      @if (total() === 0) {
        <div class="chart-empty">
          <span></span>
          <p>{{ 'forms.responses.chart.noData' | translate }}</p>
        </div>
      } @else {
        <div class="chart-summary">
          <div>
            <span>{{ 'forms.responses.chart.totalSelections' | translate }}</span>
            <strong>{{ formatNumber(total()) }}</strong>
          </div>
          <div>
            <span>{{ 'forms.responses.chart.mainAnswer' | translate }}</span>
            <strong>{{ topRow().category }}</strong>
          </div>
        </div>

        <div class="bar-list">
          @for (row of rows(); track row.category) {
            <div class="bar-row">
              <div class="bar-label">
                <span>{{ row.category }}</span>
                <strong>{{ formatNumber(row.value) }} &middot; {{ row.share }}%</strong>
              </div>
              <div class="bar-track">
                <span
                  class="bar-fill"
                  [style.width.%]="row.percent"
                  [style.--bar-color]="row.color"
                ></span>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      .modern-bar-chart {
        display: flex;
        flex-direction: column;
        gap: 0.9rem;
      }

      .chart-summary {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.65rem;
      }

      .chart-summary div {
        min-width: 0;
        padding: 0.7rem 0.75rem;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-lg);
        background: var(--card-bg);
      }

      .chart-summary span {
        display: block;
        color: var(--text-tertiary);
        font-size: 0.75rem;
        font-weight: 700;
      }

      .chart-summary strong {
        display: block;
        overflow: hidden;
        color: var(--text-primary);
        font-size: 1rem;
        font-weight: 800;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .bar-list {
        display: grid;
        gap: 0.8rem;
      }

      .bar-row {
        display: grid;
        gap: 0.4rem;
      }

      .bar-label {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        color: var(--text-secondary);
        font-size: 0.8125rem;
      }

      .bar-label span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .bar-label strong {
        color: var(--text-primary);
        font-variant-numeric: tabular-nums;
      }

      .bar-track {
        height: 16px;
        overflow: hidden;
        border-radius: var(--radius-full);
        background: var(--bg-secondary);
      }

      .bar-fill {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: var(--bar-color);
      }

      .chart-empty {
        display: grid;
        min-height: 180px;
        place-items: center;
        color: var(--text-tertiary);
        text-align: center;
      }

      .chart-empty span {
        width: 56px;
        height: 56px;
        border-radius: var(--radius-full);
        background: var(--bg-secondary);
      }

      .chart-empty p {
        margin: 0;
      }

      @media (max-width: 560px) {
        .chart-summary {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class BarChartComponent extends BaseChartComponent {
  total = computed(() => this._values().reduce((sum, value) => sum + value, 0));

  rows = computed(() => {
    const categories = this._categories();
    const values = this._values();
    const max = Math.max(...values, 1);
    const total = Math.max(this.total(), 1);

    return categories
      .map((category, index) => ({
        category,
        value: values[index] ?? 0,
        percent: ((values[index] ?? 0) / max) * 100,
        share: Math.round(((values[index] ?? 0) / total) * 100),
        color: CHART_COLORS[index % CHART_COLORS.length],
      }))
      .sort((a, b) => b.value - a.value);
  });

  topRow = computed(() => this.rows().find((row) => row.value > 0) ?? this.rows()[0]);
}
