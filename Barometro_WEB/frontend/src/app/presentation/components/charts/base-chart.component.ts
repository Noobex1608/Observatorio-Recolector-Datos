import { Component, Input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

export const CHART_COLORS = [
  '#0F766E',
  '#14B8A6',
  '#334155',
  '#64748B',
  '#C8102E',
  '#2DD4BF',
  '#475569',
  '#99F6DF',
  '#A00D25',
  '#94A3B8',
];

@Component({
  template: '',
  standalone: true,
  imports: [CommonModule],
})
export abstract class BaseChartComponent {
  @Input() set categories(value: string[]) { this._categories.set(value); }
  @Input() set values(value: number[]) { this._values.set(value); }
  @Input() set title(value: string) { this._title.set(value); }
  @Input() height = '300px';

  protected _categories = signal<string[]>([]);
  protected _values = signal<number[]>([]);
  protected _title = signal('');

  formatNumber(value: number): string {
    if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
    if (value >= 1000) return (value / 1000).toFixed(1) + 'K';
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
}
