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
  question = input.required<FormQuestion>();
  value = input<string | null>(null);
  disabled = input<boolean>(false);

  valueChange = output<string | null>();

  readonly rawValue = signal<string>('');

  readonly qType = computed(() => this.question().type);

  readonly inputType = computed(() => {
    const type = this.qType();
    if (type === 'TIME') return 'time';
    if (type === 'DATETIME') return 'datetime-local';
    return 'date';
  });

  readonly quickLabel = computed(() => {
    return this.qType() === 'DATE' ? 'Hoy' : 'Ahora';
  });

  constructor() {
    effect(() => {
      const val = this.value();
      if (!val) {
        this.rawValue.set('');
        return;
      }
      const type = this.qType();
      if (type === 'DATETIME') {
        const d = new Date(val);
        if (!Number.isNaN(d.getTime())) {
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

    const type = this.qType();
    let normalized = val;

    if (type === 'DATETIME' && val) {
      const d = new Date(val);
      if (!Number.isNaN(d.getTime())) {
        normalized = d.toISOString();
      }
    }

    this.valueChange.emit(normalized);
  }

  setNow(): void {
    if (this.disabled()) return;
    const now = new Date();
    const type = this.qType();

    if (type === 'DATE') {
      const formatted = now.toISOString().split('T')[0];
      this.onValueInput(formatted);
    } else if (type === 'TIME') {
      const hours = String(now.getHours()).padStart(2, '0');
      const mins = String(now.getMinutes()).padStart(2, '0');
      this.onValueInput(`${hours}:${mins}`);
    } else if (type === 'DATETIME') {
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
