import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormQuestion } from '../../db.service';

@Component({
  selector: 'app-question-note',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './question-note.component.html',
  styleUrls: ['./question-note.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class QuestionNoteComponent {
  question = input.required<FormQuestion & { properties?: any }>();

  get noteHint(): string | undefined {
    const q = this.question();
    return q.hint || q.properties?.help_text;
  }
}
