import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  signal,
  computed,
  effect
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormQuestion } from '../../db.service';

export type LikertValue = Record<string, string>;

@Component({
  selector: 'app-question-likert',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './question-likert.component.html',
  styleUrls: ['./question-likert.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class QuestionLikertComponent {
  // Signal Inputs
  question = input.required<FormQuestion>();
  value = input<LikertValue | null>(null);
  disabled = input<boolean>(false);

  // Signal Output
  valueChange = output<LikertValue>();

  // State Signal
  readonly answers = signal<LikertValue>({});

  readonly rows = computed<string[]>(() => {
    const q = this.question();
    return Array.isArray(q.likert_rows) ? q.likert_rows : [];
  });

  readonly columns = computed<string[]>(() => {
    const q = this.question();
    return Array.isArray(q.likert_columns) ? q.likert_columns : [];
  });

  readonly progressText = computed<string>(() => {
    const r = this.rows();
    if (r.length === 0) return '';
    const currentAnswers = this.answers();
    const answeredCount = r.filter(row => !!currentAnswers[row]).length;
    return `${answeredCount} de ${r.length} respondidas`;
  });

  constructor() {
    effect(() => {
      const val = this.value();
      if (val && typeof val === 'object') {
        this.answers.set({ ...val });
      } else {
        const initial: LikertValue = {};
        for (const row of this.rows()) {
          initial[row] = '';
        }
        this.answers.set(initial);
      }
    });
  }

  selectOption(row: string, col: string): void {
    if (this.disabled()) return;
    const updated = { ...this.answers(), [row]: col };
    this.answers.set(updated);
    this.valueChange.emit(updated);
  }

  isSelected(row: string, col: string): boolean {
    return this.answers()[row] === col;
  }

  trackByString(_index: number, item: string): string {
    return item;
  }
}
