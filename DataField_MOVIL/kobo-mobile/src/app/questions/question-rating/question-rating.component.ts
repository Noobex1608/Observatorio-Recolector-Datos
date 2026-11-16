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

@Component({
  selector: 'app-question-rating',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './question-rating.component.html',
  styleUrls: ['./question-rating.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class QuestionRatingComponent {
  // Signal Inputs
  question = input.required<FormQuestion>();
  value = input<number | null>(null);
  disabled = input<boolean>(false);

  // Signal Output
  valueChange = output<number | null>();

  // State Signals
  readonly selectedRating = signal<number | null>(null);
  readonly hoverRating = signal<number | null>(null);

  readonly maxStars = computed(() => {
    const q = this.question();
    if (Array.isArray(q.options) && q.options.length > 0) {
      return q.options.length;
    }
    return 5;
  });

  readonly starsArray = computed(() => {
    return Array.from({ length: this.maxStars() }, (_, i) => i + 1);
  });

  readonly ratingText = computed(() => {
    const r = this.selectedRating();
    if (!r) return 'Sin calificar';
    const labels = ['Muy insatisfecho', 'Insatisfecho', 'Neutral', 'Satisfecho', 'Muy satisfecho'];
    return labels[r - 1] || `${r} de ${this.maxStars()}`;
  });

  constructor() {
    effect(() => {
      const val = this.value();
      if (typeof val === 'number') {
        this.selectedRating.set(val);
      } else {
        this.selectedRating.set(null);
      }
    });
  }

  setRating(star: number): void {
    if (this.disabled()) return;
    this.selectedRating.set(star);
    this.valueChange.emit(star);
  }

  setHover(star: number | null): void {
    if (this.disabled()) return;
    this.hoverRating.set(star);
  }

  clearRating(): void {
    if (this.disabled()) return;
    this.selectedRating.set(null);
    this.valueChange.emit(null);
  }
}
