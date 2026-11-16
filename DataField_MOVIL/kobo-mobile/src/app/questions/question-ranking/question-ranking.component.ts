import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  signal,
  effect
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormQuestion } from '../../db.service';

@Component({
  selector: 'app-question-ranking',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './question-ranking.component.html',
  styleUrls: ['./question-ranking.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class QuestionRankingComponent {
  question = input.required<FormQuestion>();
  value = input<string[] | null>(null);
  disabled = input<boolean>(false);

  valueChange = output<string[]>();

  readonly items = signal<string[]>([]);

  constructor() {
    effect(() => {
      const val = this.value();
      const q = this.question();

      if (Array.isArray(val) && val.length > 0) {
        this.items.set([...val]);
      } else if (Array.isArray(q.options) && q.options.length > 0) {
        this.items.set([...q.options]);
      } else {
        this.items.set([]);
      }
    });
  }

  moveUp(index: number): void {
    if (this.disabled() || index <= 0) return;
    const current = [...this.items()];
    const temp = current[index - 1];
    current[index - 1] = current[index];
    current[index] = temp;

    this.items.set(current);
    this.valueChange.emit(current);
  }

  moveDown(index: number): void {
    if (this.disabled() || index >= this.items().length - 1) return;
    const current = [...this.items()];
    const temp = current[index + 1];
    current[index + 1] = current[index];
    current[index] = temp;

    this.items.set(current);
    this.valueChange.emit(current);
  }

  trackByString(_index: number, item: string): string {
    return item;
  }
}
