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
import { FormsModule } from '@angular/forms';
import { FormQuestion } from '../../db.service';

@Component({
  selector: 'app-question-datetime',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './question-datetime.component.html',
  styleUrls: ['./question-datetime.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class QuestionDateTimeComponent {
  // Signal Inputs
  question = input.required<FormQuestion>();
  value = input<string | null>(null);
  disabled = input<boolean>(false);

  // Signal Output
  valueChange = output<string | null>();

  // State Signals
  readonly rawValue = signal<string>('');

  readonly inputType = computed(() => {
    const qType = this.question().type;
    if (qType === 'TIME') return 'time';
    if (qType === 'DATETIME') return 'datetime-local';
    return 'date';
  });

  constructor() {
    effect(() => {
      const val = this.value();
      if (!val) {
        this.rawValue.set('');
        return;
      }
      const qType = this.question().type;
      if (qType === 'DATETIME') {
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
          this.rawValue.set(this.formatForDatetimeLocal(d));
          return;
        }
      }
      this.rawValue.set(val);
    });
  }

  onValueInput(val: string): void {
    this.rawValue.set(val);
    if (!val) {
      this.valueChange.emit(null);
      return;
    }

    const qType = this.question().type;
    let normalized = val;

    if (qType === 'DATETIME' && val) {
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        normalized = d.toISOString();
      }
    }

    this.valueChange.emit(normalized);
  }

  setNow(): void {
    if (this.disabled()) return;
    const now = new Date();
    const qType = this.question().type;

    if (qType === 'DATE') {
      const formatted = now.toISOString().split('T')[0];
      this.onValueInput(formatted);
    } else if (qType === 'TIME') {
      const hours = String(now.getHours()).padStart(2, '0');
      const mins = String(now.getMinutes()).padStart(2, '0');
      this.onValueInput(`${hours}:${mins}`);
    } else if (qType === 'DATETIME') {
      const formatted = this.formatForDatetimeLocal(now);
      this.rawValue.set(formatted);
      this.valueChange.emit(now.toISOString());
    }
  }

  private formatForDatetimeLocal(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }
}
