import { CommonModule } from '@angular/common';
import { Component, Input, computed, signal } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { BaseChartComponent, CHART_COLORS } from './base-chart.component';

@Component({
  selector: 'app-pie-chart',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="modern-pie-chart" [style.min-height]="height">
      @if (segments().length === 0) {
        <div class="chart-empty">
          <span></span>
          <p>{{ 'forms.responses.chart.noData' | translate }}</p>
        </div>
      } @else {
        <div class="donut-wrap">
          <div
            class="donut"
            [class.full-pie]="!_isDonut()"
            [style.background]="donutGradient()"
            aria-hidden="true"
          >
            @if (_isDonut()) {
              <span>
                <strong>{{ formatNumber(total()) }}</strong>
                <small>{{ 'forms.responses.chart.responses' | translate }}</small>
              </span>
            }
          </div>
          <p>
            {{ 'forms.responses.chart.topFrequency' | translate }}:
            <strong>{{ topSegment().category }}</strong>
          </p>
        </div>

        <div class="pie-legend">
          @for (segment of segments(); track segment.category) {
            <div class="legend-row">
              <span class="legend-dot" [style.background]="segment.color"></span>
              <span class="legend-label">{{ segment.category }}</span>
              <strong>{{ formatNumber(segment.value) }} &middot; {{ segment.share }}%</strong>
              <span class="legend-meter">
                <span
                  [style.width.%]="segment.share"
                  [style.--segment-color]="segment.color"
                ></span>
              </span>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      .modern-pie-chart {
        display: grid;
        grid-template-columns: minmax(170px, 0.7fr) minmax(0, 1fr);
        align-items: center;
        gap: 1.15rem;
      }

      .donut-wrap {
        display: grid;
        justify-items: center;
        gap: 0.7rem;
        min-width: 0;
      }

      .donut {
        display: grid;
        width: min(190px, 100%);
        aspect-ratio: 1;
        place-items: center;
        border-radius: 50%;
        box-shadow:
          inset 0 0 0 40px var(--card-bg),
          0 14px 32px rgba(15, 23, 42, 0.1);
      }

      .donut.full-pie {
        box-shadow: 0 14px 32px rgba(15, 23, 42, 0.1);
      }

      .donut span {
        display: grid;
        place-items: center;
        width: 86px;
        height: 86px;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-full);
        background: var(--card-bg);
      }

      .donut strong {
        color: var(--text-primary);
        font-size: 1.35rem;
        font-weight: 900;
        line-height: 1;
      }

      .donut small {
        color: var(--text-tertiary);
        font-size: 0.68rem;
        font-weight: 700;
      }

      .donut-wrap p {
        margin: 0;
        color: var(--text-secondary);
        font-size: 0.8125rem;
        text-align: center;
      }

      .donut-wrap p strong {
        color: var(--text-primary);
      }

      .pie-legend {
        display: grid;
        gap: 0.7rem;
        min-width: 0;
      }

      .legend-row {
        display: grid;
        grid-template-columns: 10px minmax(0, 1fr) auto;
        align-items: center;
        gap: 0.55rem;
        color: var(--text-secondary);
        font-size: 0.8125rem;
      }

      .legend-dot {
        width: 10px;
        height: 10px;
        border-radius: var(--radius-full);
      }

      .legend-label {
        overflow: hidden;
        color: var(--text-primary);
        font-weight: 700;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .legend-row strong {
        color: var(--text-primary);
        font-variant-numeric: tabular-nums;
      }

      .legend-meter {
        grid-column: 2 / 4;
        height: 6px;
        overflow: hidden;
        border-radius: var(--radius-full);
        background: var(--bg-secondary);
      }

      .legend-meter span {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: var(--segment-color);
      }

      .chart-empty {
        display: grid;
        grid-column: 1 / -1;
        min-height: 180px;
        place-items: center;
        color: var(--text-tertiary);
        text-align: center;
      }

      .chart-empty span {
        width: 72px;
        height: 72px;
        border: 12px solid var(--bg-secondary);
        border-radius: var(--radius-full);
      }

      .chart-empty p {
        margin: 0;
      }

      @media (max-width: 620px) {
        .modern-pie-chart {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class PieChartComponent extends BaseChartComponent {
  @Input() set isDonut(value: boolean) { this._isDonut.set(value); }

  protected _isDonut = signal(false);

  total = computed(() => this._values().reduce((sum, value) => sum + value, 0));

  segments = computed(() => {
    const total = this.total();
    if (total <= 0) return [];

    return this._categories().map((category, index) => ({
      category,
      value: this._values()[index] ?? 0,
      color: CHART_COLORS[index % CHART_COLORS.length],
      degrees: ((this._values()[index] ?? 0) / total) * 360,
      share: Math.round(((this._values()[index] ?? 0) / total) * 100),
    }));
  });

  topSegment = computed(() =>
    this.segments().reduce((top, segment) => (segment.value > top.value ? segment : top), this.segments()[0]),
  );

  donutGradient = computed(() => {
    let cursor = 0;
    const stops = this.segments().map((segment) => {
      const start = cursor;
      cursor += segment.degrees;
      return `${segment.color} ${start}deg ${cursor}deg`;
    });

    return `conic-gradient(${stops.join(', ')})`;
  });
}
