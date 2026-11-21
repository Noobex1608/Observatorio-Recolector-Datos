import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Form, FormQuestion, FormService } from '@core/services/form.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { normalizeTextFormat, textFormatError, textFormatInput, textFormatOf } from '@core/utils/text-format';
import { maxVideoSeconds, readVideoDuration } from '@core/utils/video-duration';
import { allowedOptions, choiceFilterOf, pruneCascadeAnswers, showIfMatches, showIfOf } from '@core/utils/choice-filter';

/** Avance de una encuesta pública guardado en la pestaña para sobrevivir a una recarga. */
interface SavedProgress {
  answers: Record<string, unknown>;
  consentAccepted: boolean;
  consentDeclined: boolean;
  currentStepIndex: number;
  stepHistory: number[];
  clientSubmissionId: string;
  submitted: boolean;
}

interface QuestionVisualMeta {
  level: number;
  displayNumber: string;
  sectionName: string;
}

@Component({
  selector: 'app-form-collect',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    RouterLink,
    TranslateModule,
  ],
  template: `
    <div class="collect-page">
      @if (testMode) {
        <aside class="test-bar" role="note">
          <mat-icon aria-hidden="true">science</mat-icon>
          <p>
            <strong>{{ 'forms.collect.test.title' | translate }}</strong>
            <span>{{ 'forms.collect.test.banner' | translate }}</span>
          </p>
          @if (!testToken) {
            <a mat-stroked-button [routerLink]="['/admin/forms', testFormId, 'edit']">{{ 'forms.collect.test.backToEditor' | translate }}</a>
          }
        </aside>
      }
      @if (loading()) {
        <div class="state-box">
          <mat-spinner diameter="40"></mat-spinner>
          <p>{{ 'forms.collect.loading' | translate }}</p>
        </div>
      } @else if (error()) {
        <div class="state-box error">
          <mat-icon>error_outline</mat-icon>
          <p>{{ error() }}</p>
        </div>
      } @else if (form()?.availability === 'SCHEDULED') {
        <div class="state-box">
          <mat-icon>event</mat-icon>
          <h1>{{ form()!.title }}</h1>
          <p>{{ 'forms.collect.page.availableFrom' | translate: { date: (form()!.start_date | date:'dd/MM/yyyy') } }}</p>
        </div>
      } @else if (submitted() && testMode) {
        <div class="state-box success">
          <mat-icon>task_alt</mat-icon>
          <h2>{{ 'forms.collect.test.doneTitle' | translate }}</h2>
          <p>{{ 'forms.collect.test.doneText' | translate: { answered: testAnswered() } }}</p>
          <button mat-raised-button color="primary" (click)="resetForm()" type="button">
            {{ 'forms.collect.test.again' | translate }}
          </button>
        </div>
      } @else if (submitted()) {
        <div class="state-box success">
          <mat-icon>check_circle</mat-icon>
          <h2>{{ 'forms.collect.submittedTitle' | translate }}</h2>
          <p>{{ 'forms.collect.submittedText' | translate }}</p>
          <button mat-raised-button color="primary" (click)="resetForm()" type="button">
            {{ 'forms.collect.sendAnother' | translate }}
          </button>
        </div>
      } @else if (form()) {
        <div class="collect-card">
          <header class="collect-header">
            <h1>{{ form()!.title }}</h1>
            @if (form()!.description) {
              <p>{{ form()!.description }}</p>
            }
          </header>

          @if (!consentAccepted()) {
            <section class="collect-form" [attr.aria-label]="'forms.collect.page.consent' | translate">
              <h2>{{ 'forms.collect.page.consent' | translate }}</h2>
              <p style="white-space:pre-line">{{ form()!.consent_text || 'Su participación es voluntaria. ¿Acepta responder esta encuesta?' }}</p>
              @if (consentDeclined()) { <p>{{ 'forms.collect.page.consentDeclined' | translate }}</p> }
              @else {
                <div class="consent-actions">
                  <button mat-raised-button color="primary" type="button" (click)="acceptConsent()">{{ 'forms.collect.page.accept' | translate }}</button>
                  <button mat-stroked-button type="button" (click)="consentDeclined.set(true)">{{ 'forms.collect.page.decline' | translate }}</button>
                </div>
              }
            </section>
          } @else {
          <form (ngSubmit)="onSubmit()" class="collect-form" novalidate>
            @if (form()!.step_by_step) {
              <div class="step-progress">
                <span>{{ currentStepNumber() }} / {{ totalStepCount() }}</span>
                <p>{{ 'forms.collect.stepMode' | translate }}</p>
              </div>
            }

            @for (question of orderedQuestions(); track question.id; let i = $index) {
              @if ((!form()!.step_by_step || i === currentStepIndex()) && isQuestionActive(question)) {
                @if (shouldShowSectionHeader(i, question)) {
                  <div class="section-divider">
                    <span class="section-divider__line"></span>
                    <strong>{{ getQuestionSectionName(question) }}</strong>
                    <span class="section-divider__line"></span>
                  </div>
                }

                <div
                  class="question-block"
                  [class.invalid]="questionError(question.id)"
                  [class.subquestion]="getQuestionLevel(question.id) > 0"
                  [style.--indent]="getQuestionIndent(question.id) + 'px'"
                >
                  <label class="question-label">
                    {{ getQuestionDisplayNumber(question.id) }}. {{ question.label }}
                    @if (question.required) {
                      <span class="required">*</span>
                    }
                  </label>

                  @if (getQuestionLevel(question.id) > 0) {
                    <span class="subquestion-chip">{{ 'forms.collect.subquestion' | translate }}</span>
                  }

                  @switch (question.type) {
                    @case ('SINGLE_CHOICE') {
                      <div class="options-list">
                        @for (opt of getChoiceOptions(question); track $index) {
                          <label class="option">
                            <input
                              type="radio"
                              [name]="question.id"
                              [value]="opt"
                              [ngModel]="answers()[question.id]"
                              (ngModelChange)="setAnswer(question.id, $event)"
                              [required]="question.required"
                            />
                            {{ opt }}
                          </label>
                        }
                      </div>
                      @if (cascadeHint(question); as hint) { <p class="question-help">{{ hint }}</p> }
                    }
                    @case ('MULTIPLE_CHOICE') {
                      <div class="options-list">
                        @for (opt of getChoiceOptions(question); track $index) {
                          <label class="option">
                            <input
                              type="checkbox"
                              [checked]="isSelected(question.id, opt)"
                              (change)="toggleMulti(question.id, opt, $any($event.target).checked)"
                            />
                            {{ opt }}
                          </label>
                        }
                      </div>
                      @if (cascadeHint(question); as hint) { <p class="question-help">{{ hint }}</p> }
                    }
                    @case ('LIKERT') {
                      <!-- En pantallas angostas cada fila se muestra como un grupo de opciones, sin desplazamiento lateral. -->
                      <div class="likert-stacked">
                        @for (row of getLikertRows(question); track row; let rowIndex = $index) {
                          <fieldset class="likert-group">
                            <legend>{{ row }}</legend>
                            <div class="options-list">
                              @for (column of getLikertColumns(question); track column) {
                                <label class="option">
                                  <input
                                    type="radio"
                                    [name]="question.id + '-m-' + rowIndex"
                                    [value]="column"
                                    [ngModel]="getLikertAnswer(question.id, row)"
                                    (ngModelChange)="setLikertAnswer(question.id, row, $event)"
                                  />
                                  {{ column }}
                                </label>
                              }
                            </div>
                          </fieldset>
                        }
                      </div>
                      <div class="likert-table-wrap">
                        <div
                          class="likert-table"
                          [style.grid-template-columns]="'minmax(160px, 1.35fr) repeat(' + getLikertColumns(question).length + ', minmax(96px, 1fr))'"
                        >
                          <span></span>
                          @for (column of getLikertColumns(question); track $index) {
                            <strong>{{ column }}</strong>
                          }
                          @for (row of getLikertRows(question); track row; let rowIndex = $index) {
                            <span class="likert-row-label">{{ row }}</span>
                            @for (column of getLikertColumns(question); track column) {
                              <label class="likert-cell">
                                <input
                                  type="radio"
                                  [name]="question.id + '-' + rowIndex"
                                  [value]="column"
                                  [ngModel]="getLikertAnswer(question.id, row)"
                                  (ngModelChange)="setLikertAnswer(question.id, row, $event)"
                                  [required]="question.required"
                                />
                              </label>
                            }
                          }
                        </div>
                      </div>
                    }
                    @case ('TEXT') {
                      @if (textFormatOf(question.properties); as format) {
                        <input
                          class="text-input"
                          [type]="textFormatInput(format).type"
                          [attr.inputmode]="textFormatInput(format).inputmode"
                          [attr.autocomplete]="textFormatInput(format).autocomplete"
                          [attr.maxlength]="textFormatInput(format).maxlength"
                          [name]="question.id" [attr.aria-label]="question.label"
                          [attr.aria-invalid]="questionError(question.id) ? 'true' : null"
                          [ngModel]="answers()[question.id]"
                          (ngModelChange)="setAnswer(question.id, $event)"
                          (blur)="checkTextFormat(question)"
                          [required]="question.required"
                          [placeholder]="textFormatInput(format).placeholder"
                        />
                      } @else {
                      <textarea
                        class="text-input"
                        [name]="question.id" [attr.aria-label]="question.label"
                        rows="3"
                        [ngModel]="answers()[question.id]"
                        (ngModelChange)="setAnswer(question.id, $event)"
                        [required]="question.required"
                        [placeholder]="'forms.collect.textPlaceholder' | translate"
                      ></textarea>
                      }
                    }
                    @case ('NUMBER') {
                      <input
                        type="number"
                        class="number-input"
                        [name]="question.id" [attr.aria-label]="question.label"
                        [ngModel]="answers()[question.id]"
                        (ngModelChange)="setAnswer(question.id, $event)"
                        [required]="question.required"
                        placeholder="0"
                      />
                    }
                    @case ('NOTE') {
                      <p class="question-help">{{ question.properties?.help_text || question.label }}</p>
                    }
                    @case ('DATE') {
                      <input class="text-input" type="date" [name]="question.id" [attr.aria-label]="question.label"
                        [min]="question.properties?.min_date || null" [max]="question.properties?.max_date || null"
                        [ngModel]="answers()[question.id]" (ngModelChange)="setAnswer(question.id, $event)" />
                    }
                    @case ('TIME') {
                      <input class="text-input" type="time" [name]="question.id" [attr.aria-label]="question.label"
                        [ngModel]="answers()[question.id]" (ngModelChange)="setAnswer(question.id, $event)" />
                    }
                    @case ('DATETIME') {
                      <input class="text-input" type="datetime-local" [name]="question.id" [attr.aria-label]="question.label"
                        [ngModel]="answers()[question.id]" (ngModelChange)="setAnswer(question.id, $event)" />
                    }
                    @case ('RATING') {
                      <div class="options-list">
                        @for (rating of ratingOptions(question); track rating) {
                          <label class="option"><input type="radio" [name]="question.id" [value]="rating"
                            [ngModel]="answers()[question.id]" (ngModelChange)="setNumericAnswer(question.id, $event)" />{{ rating }}</label>
                        }
                      </div>
                    }
                    @case ('RANKING') {
                      <div class="ranking-list">
                        @for (option of rankingOptions(question); track option; let rank = $index) {
                          <div class="ranking-row"><span>{{ rank + 1 }}. {{ option }}</span>
                            <button type="button" mat-stroked-button (click)="moveRanking(question, rank, -1)" [disabled]="rank === 0">↑</button>
                            <button type="button" mat-stroked-button (click)="moveRanking(question, rank, 1)" [disabled]="rank === rankingOptions(question).length - 1">↓</button>
                          </div>
                        }
                      </div>
                    }
                    @case ('BARCODE') {
                      <input class="text-input" type="text" [name]="question.id" maxlength="512" [attr.aria-label]="question.label"
                        [ngModel]="answers()[question.id]" (ngModelChange)="setAnswer(question.id, $event)"
                        [placeholder]="'forms.collect.page.scanPlaceholder' | translate" />
                    }
                    @case ('MULTIMEDIA') {
                      <input class="text-input" type="file" accept="image/*,audio/*,video/*" [attr.aria-label]="question.label"
                        (change)="captureMedia(question, $event)" />
                      @if (['all', 'video'].includes(question.properties?.allowed_media || 'all')) {
                        <p class="question-help">{{ 'forms.collect.page.videoLimit' | translate: { seconds: maxVideoSeconds(question) } }}</p>
                      }
                    }
                    @case ('SIGNATURE') {
                      <input class="text-input" type="file" accept="image/*" capture="user"
                        (change)="captureMedia(question, $event)" [attr.aria-label]="'forms.collect.page.signatureFile' | translate" />
                    }
                    @case ('CALCULATE') {
                      <p class="question-help">{{ 'forms.collect.page.calculated' | translate }}</p>
                    }
                    @case ('GPS') {
                      <div class="gps-answer" role="group" [attr.aria-label]="question.label">
                        @let gps = gpsState()[question.id];
                        @if (gpsAnswer(question.id); as point) {
                          <div class="gps-point">
                            <mat-icon aria-hidden="true">place</mat-icon>
                            <div>
                              <p class="gps-coords">{{ 'forms.collect.page.coords' | translate: { lat: point.latitude, lng: point.longitude } }}</p>
                              <p class="gps-meta">
                                <span class="gps-accuracy" [class.gps-accuracy--low]="point.accuracy > 30">{{ 'forms.collect.page.accuracy' | translate: { meters: point.accuracy } }}</span>
                                @if (point.capturedAt) { · {{ 'forms.collect.page.capturedAt' | translate: { date: (point.capturedAt | date: 'short') } }} }
                              </p>
                              @if (point.accuracy > 30) {
                                <p class="gps-meta">{{ 'forms.collect.page.weakSignal' | translate }}</p>
                              }
                            </div>
                          </div>
                        }
                        @if (gps?.state === 'locating') {
                          <p class="gps-status" aria-live="polite">
                            <mat-spinner diameter="18"></mat-spinner> {{ gps?.message }}
                          </p>
                        }
                        <div class="gps-actions">
                          <button mat-stroked-button type="button" [disabled]="gps?.state === 'locating'" (click)="captureGps(question.id)">
                            <mat-icon>my_location</mat-icon>
                            {{ gpsAnswer(question.id) ? ('forms.collect.page.recapture' | translate) : (gps?.state === 'error' ? ('forms.collect.page.retry' | translate) : ('forms.collect.page.capture' | translate)) }}
                          </button>
                          @if (gpsAnswer(question.id) && !question.required) {
                            <button mat-button type="button" (click)="clearGps(question.id)">Quitar</button>
                          }
                        </div>
                      </div>
                    }
                  }

                  @if (questionError(question.id)) {
                    <p class="question-error">{{ questionError(question.id) }}</p>
                  }
                </div>
              }
            }

            @if (submitError()) {
              <p class="submit-error" role="alert">{{ submitError() }}</p>
            }

            @if (form()!.step_by_step) {
              <div class="step-actions">
                <button
                  mat-stroked-button
                  color="primary"
                  type="button"
                  class="submit-btn secondary"
                  (click)="goBack()"
                  [disabled]="submitting() || !canGoBack()"
                >
                  {{ 'forms.collect.back' | translate }}
                </button>

                <button
                  mat-raised-button
                  color="primary"
                  type="button"
                  class="submit-btn"
                  (click)="onSubmit()"
                  [disabled]="submitting()"
                >
                  @if (submitting()) {
                    {{ 'forms.collect.submitting' | translate }}
                  } @else if (isLastStep()) {
                    {{ 'forms.collect.finish' | translate }}
                  } @else {
                    {{ 'forms.collect.next' | translate }}
                  }
                </button>
              </div>
            } @else {
              <button
                mat-raised-button
                color="primary"
                type="submit"
                class="submit-btn"
                [disabled]="submitting()"
              >
                @if (submitting()) {
                  {{ 'forms.collect.submitting' | translate }}
                } @else {
                  {{ (testMode ? 'forms.collect.test.submit' : 'forms.collect.submit') | translate }}
                }
              </button>
            }
          </form>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      .collect-page {
        min-height: 100vh;
        min-height: 100dvh;
        background: var(--bg-primary);
        padding: 1.5rem 1rem;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
      }

      /* Aviso del modo de prueba: plano, con borde, sin color de alarma. */
      .test-bar {
        width: 100%;
        max-width: 900px;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem 1rem;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-lg);
        background: var(--bg-secondary);

        mat-icon { flex: none; color: var(--primary-text-600); }

        p {
          flex: 1;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 0.125rem;
          font-size: 0.875rem;
          line-height: 1.4;
          color: var(--text-secondary);
        }

        strong { color: var(--text-primary); font-size: 0.9375rem; }
        a { flex: none; }
      }

      @media (max-width: 560px) {
        .test-bar { flex-wrap: wrap; }
        .test-bar a { width: 100%; }
      }

      .collect-card {
        width: 100%;
        max-width: 900px;
        background: var(--card-bg);
        border: 1px solid var(--card-border);
        border-radius: var(--radius-xl);
        overflow: hidden;
      }

      /* Colores explícitos: los estilos globales de h1/p no deben ganarle al fondo azul (contraste AA). */
      .collect-header {
        padding: 1.5rem;
        background: #0059a8;
        color: #ffffff;

        h1 {
          margin: 0 0 0.5rem;
          font-size: 1.5rem;
          line-height: 1.3;
          color: #ffffff;
          background: none;
          overflow-wrap: anywhere;
        }

        p {
          margin: 0;
          font-size: 0.9375rem;
          line-height: 1.5;
          color: #e6f0fa;
          background: none;
          white-space: pre-line;
          overflow-wrap: anywhere;
        }
      }

      .collect-form {
        padding: 1.5rem;
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
      }

      .step-progress {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 1rem;
        padding: 0.9rem 1rem;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-lg);
        background: var(--bg-secondary);

        span {
          font-weight: 800;
          color: var(--primary-text-600);
        }

        p {
          margin: 0;
          color: var(--text-secondary);
          font-size: 0.875rem;
        }
      }

      .question-block {
        margin-left: var(--indent, 0);
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding: 0.9rem;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-lg);
        background: var(--bg-primary);
      }

      .question-block.subquestion {
        border-style: dashed;
        background: var(--bg-secondary);
      }

      .question-block.invalid {
        border: 1px solid rgba(239, 68, 68, 0.28);
        background: var(--error-bg);
      }

      .section-divider {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: center;
        gap: 0.75rem;
        margin: 0.35rem 0 0.15rem;

        strong {
          font-size: 0.8rem;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--text-secondary);
        }
      }

      .section-divider__line {
        height: 1px;
        background: var(--border-color);
      }

      .question-label {
        font-weight: 600;
        font-size: 0.9375rem;
        color: var(--text-primary);
      }

      .subquestion-chip {
        display: inline-flex;
        align-self: flex-start;
        font-size: 0.72rem;
        font-weight: 700;
        color: var(--primary-text-700);
        background: var(--primary-100);
        border: 1px solid var(--primary-200);
        border-radius: var(--radius-full);
        padding: 0.16rem 0.5rem;
      }

      .required {
        color: var(--uleam-red);
      }

      .question-error {
        margin: 0;
        color: var(--error-color);
        font-size: 0.8125rem;
        font-weight: 600;
      }

      .options-list {
        display: flex;
        flex-direction: column;
        gap: 0.375rem;
      }

      .option {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        min-height: 44px;
        padding: 0.35rem 0.6rem;
        border-radius: var(--radius-md);
        font-size: 0.9375rem;
        color: var(--text-secondary);
        cursor: pointer;
        overflow-wrap: anywhere;
      }

      .option:hover {
        background: var(--hover-bg);
      }

      .option input {
        flex: none;
        width: 20px;
        height: 20px;
        accent-color: var(--primary-600);
      }

      .consent-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
      }

      .submit-error {
        margin: 0;
        padding: 0.75rem 1rem;
        border-radius: var(--radius-md);
        background: var(--error-bg);
        color: var(--error-color);
        font-weight: 600;
      }

      .likert-stacked {
        display: none;
      }

      .likert-group {
        margin: 0 0 0.75rem;
        padding: 0.5rem 0.75rem 0.25rem;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
      }

      .likert-group legend {
        padding: 0 0.35rem;
        font-weight: 600;
        color: var(--text-primary);
      }

      .likert-table-wrap {
        overflow-x: auto;
      }

      .likert-table {
        display: grid;
        min-width: 100%;
        overflow: hidden;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
      }

      .likert-table > * {
        display: grid;
        min-height: 46px;
        place-items: center;
        border-right: 1px solid var(--border-color);
        border-bottom: 1px solid var(--border-color);
        padding: 0.55rem;
        color: var(--text-secondary);
        font-size: 0.8125rem;
        text-align: center;
      }

      .likert-table strong {
        background: var(--bg-secondary);
        color: var(--text-primary);
        font-weight: 700;
      }

      .likert-row-label {
        justify-items: start;
        background: var(--bg-secondary);
        color: var(--text-primary);
        font-weight: 600;
        text-align: left;
      }

      .likert-cell {
        cursor: pointer;

        input {
          accent-color: var(--primary-600);
        }
      }

      .text-input,
      .number-input {
        width: 100%;
        padding: 0.625rem 0.75rem;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        background: var(--bg-primary);
        color: var(--text-primary);
        /* 16px evita que iOS amplíe la página al enfocar el campo */
        font-size: 1rem;
      }

      .submit-btn {
        width: 100%;
        margin-top: 0.5rem;
      }

      .ranking-row { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
      .ranking-row span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
      .ranking-row button { min-width: 44px; min-height: 44px; }
      .gps-answer { display: grid; gap: 0.5rem; }
      .gps-answer p { margin: 0; overflow-wrap: anywhere; }
      .gps-point { display: flex; gap: 0.5rem; align-items: flex-start; padding: 0.625rem 0.75rem; border: 1px solid #d1d5db; border-radius: 8px; }
      .gps-point mat-icon { color: #b91c1c; flex: none; }
      .gps-coords { font-weight: 600; font-variant-numeric: tabular-nums; }
      .gps-meta { font-size: 0.85rem; color: #4b5563; }
      .gps-accuracy--low { color: #b45309; font-weight: 600; }
      .gps-status { display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; }
      .gps-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
      .gps-actions button { min-height: 44px; }

      @media (max-width: 600px) {
        .collect-page { padding: 0; }
        .collect-card { border: none; border-radius: 0; }
        .collect-header { padding: 1.1rem 1rem; }
        .collect-header h1 { font-size: 1.25rem; }
        .collect-form { padding: 1rem; gap: 1rem; }
        .question-block { padding: 0.75rem; }
        .question-block.subquestion { margin-left: min(var(--indent, 0px), 12px); }
        .step-progress { flex-direction: column; gap: 0.25rem; }
        .likert-stacked { display: block; }
        .likert-table-wrap { display: none; }
        .consent-actions > button { flex: 1 1 100%; }
        .step-actions {
          position: sticky;
          bottom: 0;
          padding: 0.75rem 0 calc(0.75rem + env(safe-area-inset-bottom));
          background: var(--card-bg);
          border-top: 1px solid var(--border-color);
        }
        .state-box { padding: 2.5rem 1.25rem; }
      }
      .question-help { margin: 0; color: var(--text-secondary); }

      .step-actions {
        display: grid;
        grid-template-columns: 1fr 1.5fr;
        gap: 0.75rem;
      }

      .submit-btn.secondary {
        margin-top: 0.5rem;
      }

      .state-box {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.75rem;
        padding: 3rem 2rem;
        text-align: center;
        color: var(--text-secondary);

        mat-icon {
          font-size: 48px;
          width: 48px;
          height: 48px;
        }

        &.error mat-icon {
          color: var(--error-color);
        }

        &.success mat-icon {
          color: var(--text-primary);
        }

        h2 {
          margin: 0;
          color: var(--text-primary);
        }
      }
    `,
  ],
})
export class FormCollectComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private formService = inject(FormService);
  private translate = inject(TranslateService);

  form = signal<Form | null>(null);
  answers = signal<Record<string, unknown>>({});
  validationErrors = signal<Record<string, string>>({});
  loading = signal(true);
  submitting = signal(false);
  submitted = signal(false);
  private clientSubmissionId: string = crypto.randomUUID();
  consentAccepted = signal(false);
  consentDeclined = signal(false);
  error = signal('');
  currentStepIndex = signal(0);
  stepHistory = signal<number[]>([0]);
  submitError = signal('');
  private restored = false;

  orderedQuestions = computed(() =>
    [...(this.form()?.questions ?? [])].sort((left, right) => left.order - right.order),
  );

  questionVisualMeta = computed(() => this.buildQuestionVisualMeta(this.orderedQuestions()));

  currentQuestion = computed(() => {
    const form = this.form();
    if (!form?.step_by_step) {
      return null;
    }

    return this.orderedQuestions()[this.currentStepIndex()] ?? null;
  });

  isLastStep = computed(() => {
    const form = this.form();
    const questions = this.orderedQuestions();
    const currentQuestion = this.currentQuestion();

    if (!form?.step_by_step || questions.length === 0 || !currentQuestion) {
      return false;
    }

    return this.getNextStepIndex(currentQuestion, questions) >= questions.length;
  });

  totalStepCount = computed(() => {
    if (!this.form()?.step_by_step) {
      return this.orderedQuestions().length;
    }

    const flow = this.getFlowQuestions();
    return flow.length > 0 ? flow.length : 1;
  });

  currentStepNumber = computed(() => {
    const currentQuestion = this.currentQuestion();
    if (!currentQuestion || !this.form()?.step_by_step) {
      return 1;
    }

    const flow = this.getFlowQuestions();
    const currentPosition = flow.findIndex((question) => question.id === currentQuestion.id);
    return currentPosition >= 0 ? currentPosition + 1 : 1;
  });

  canGoBack = computed(() => {
    if (!this.form()?.step_by_step) {
      return false;
    }

    return this.stepHistory().length > 1;
  });

  private linkUuid = '';

  /** Modo de prueba (/prueba/:formId): mismo recorrido que el encuestado, sin guardar respuestas. */
  readonly testMode = this.route.snapshot.data?.['testMode'] === true;
  readonly testFormId = this.route.snapshot.paramMap.get('formId') ?? '';
  /** Token del enlace de prueba compartido (?token=): permite probar sin iniciar sesión. */
  readonly testToken = this.route.snapshot.queryParamMap?.get('token') ?? '';
  readonly testAnswered = signal(0);

  constructor() {
    // Guarda el avance en la pestaña cada vez que cambia, para que una recarga no lo pierda.
    effect(() => {
      // Una prueba terminada no deja rastro: al volver a abrir el enlace se empieza de cero.
      if (this.testMode && this.submitted()) {
        if (this.restored) this.clearProgress();
        return;
      }
      const progress: SavedProgress = {
        answers: this.answers(),
        consentAccepted: this.consentAccepted(),
        consentDeclined: this.consentDeclined(),
        currentStepIndex: this.currentStepIndex(),
        stepHistory: this.stepHistory(),
        clientSubmissionId: this.clientSubmissionId,
        submitted: this.submitted(),
      };
      if (this.restored) this.saveProgress(progress);
    });
  }

  private get storageKey(): string {
    return this.testMode ? `uleam:collect:prueba:${this.testFormId}` : `uleam:collect:${this.linkUuid}`;
  }

  private saveProgress(progress: SavedProgress): void {
    try {
      sessionStorage.setItem(this.storageKey, JSON.stringify(progress));
    } catch {
      // Sin espacio (p. ej. fotos grandes): se guarda el resto y los archivos se vuelven a adjuntar.
      try {
        const answers = Object.fromEntries(Object.entries(progress.answers)
          .filter(([, value]) => !(typeof value === 'string' && value.startsWith('data:'))));
        sessionStorage.setItem(this.storageKey, JSON.stringify({ ...progress, answers }));
      } catch { /* almacenamiento no disponible: la encuesta sigue funcionando sin guardar */ }
    }
  }

  private clearProgress(): void {
    try { sessionStorage.removeItem(this.storageKey); } catch { /* sin almacenamiento */ }
  }

  /** Restaura el avance guardado si corresponde a las preguntas actuales del formulario. */
  private restoreProgress(questions: FormQuestion[]): void {
    let saved: Partial<SavedProgress> | null = null;
    try { saved = JSON.parse(sessionStorage.getItem(this.storageKey) ?? 'null'); } catch { saved = null; }
    if (saved && typeof saved === 'object') {
      const ids = new Set(questions.map((question) => question.id));
      const answers = Object.fromEntries(Object.entries(saved.answers ?? {})
        .filter(([key]) => ids.has(key) || key.startsWith('_')));
      const valid = (index: unknown) => Number.isInteger(index) && (index as number) >= 0 && (index as number) < questions.length;
      const history = Array.isArray(saved.stepHistory) && saved.stepHistory.every(valid) && saved.stepHistory.length > 0
        ? saved.stepHistory : [0];
      this.answers.update((current) => ({ ...current, ...answers }));
      this.consentAccepted.set(saved.consentAccepted === true);
      this.stepHistory.set(history);
      this.currentStepIndex.set(valid(saved.currentStepIndex) ? saved.currentStepIndex! : history[history.length - 1]);
      if (typeof saved.clientSubmissionId === 'string' && saved.clientSubmissionId) {
        this.clientSubmissionId = saved.clientSubmissionId;
      }
      this.submitted.set(saved.submitted === true && !this.testMode);
    }
    this.restored = true;
  }

  ngOnInit(): void {
    this.linkUuid = this.route.snapshot.paramMap.get('uuid') ?? '';
    if (this.testMode ? !this.testFormId : !this.linkUuid) {
      this.error.set(this.translate.instant('forms.collect.errors.invalidLink'));
      this.loading.set(false);
      return;
    }
    this.loadForm();
  }

  loadForm(): void {
    const request = !this.testMode
      ? this.formService.fetchPublicForm(this.linkUuid)
      : this.testToken
        ? this.formService.fetchSharedTestForm(this.testFormId, this.testToken)
        : this.formService.fetchTestForm(this.testFormId);
    request.subscribe({
      next: (form) => {
        this.form.set({ ...form, questions: form.questions ?? [] });
        if (form.availability === 'SCHEDULED') {
          this.loading.set(false);
          return;
        }
        this.answers.set(Object.fromEntries((form.questions ?? [])
          .filter((question) => question.type === 'RANKING')
          .map((question) => [question.id, this.getChoiceOptions(question)])));
        this.currentStepIndex.set(0);
        this.stepHistory.set([0]);
        this.restoreProgress(form.questions ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(this.translate.instant(!this.testMode ? 'forms.collect.errors.load'
          : this.testToken ? 'forms.collect.test.linkInvalid' : 'forms.collect.test.loadError'));
        this.loading.set(false);
      },
    });
  }

  acceptConsent(): void {
    this.consentAccepted.set(true);
    this.answers.update((answers) => ({
      ...answers, _consentimiento_aceptado: true, _consentimiento_fecha: new Date().toISOString(),
    }));
  }

  /** Estado de la captura GPS en curso por pregunta (la respuesta capturada vive en `answers`). */
  readonly gpsState = signal<Record<string, { state: 'locating' | 'error'; message: string }>>({});

  gpsAnswer(questionId: string): { latitude: number; longitude: number; accuracy: number; capturedAt: string | null } | null {
    const answer = this.answers()[questionId];
    if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return null;
    const point = answer as Record<string, unknown>;
    return typeof point['latitude'] === 'number' && typeof point['longitude'] === 'number'
      ? {
          latitude: point['latitude'],
          longitude: point['longitude'],
          accuracy: Math.round(Number(point['accuracy'] ?? 0)),
          capturedAt: typeof point['timestamp'] === 'string' ? point['timestamp'] : null,
        }
      : null;
  }

  /**
   * Captura la ubicación del dispositivo. Primero pide alta precisión (satélite); si se agota el
   * tiempo, reintenta solo con la red (Wi-Fi/antenas), que responde antes aunque sea menos precisa.
   */
  captureGps(questionId: string, highAccuracy = true): void {
    const setState = (state: 'locating' | 'error' | null, message = '') =>
      this.gpsState.update((current) => {
        const next = { ...current };
        if (state) next[questionId] = { state, message };
        else delete next[questionId];
        return next;
      });
    const fail = (message: string) => {
      setState('error', message);
      this.validationErrors.update((errors) => ({ ...errors, [questionId]: message }));
    };

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      fail(this.translate.instant('forms.collect.page.gps.unsupported'));
      return;
    }
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      fail(this.translate.instant('forms.collect.page.gps.insecure'));
      return;
    }

    this.clearQuestionError(questionId);
    setState('locating', this.translate.instant(highAccuracy ? 'forms.collect.page.gps.searching' : 'forms.collect.page.gps.network'));
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setState(null);
        this.setAnswer(questionId, {
          latitude: Number(position.coords.latitude.toFixed(7)),
          longitude: Number(position.coords.longitude.toFixed(7)),
          accuracy: Number(position.coords.accuracy.toFixed(1)),
          altitude: position.coords.altitude === null ? null : Number(position.coords.altitude.toFixed(2)),
          timestamp: new Date(position.timestamp).toISOString(),
        });
      },
      (error) => {
        if (error.code === error.TIMEOUT && highAccuracy) {
          this.captureGps(questionId, false);
          return;
        }
        fail(
          error.code === error.PERMISSION_DENIED
            ? this.translate.instant('forms.collect.page.gps.denied')
            : error.code === error.POSITION_UNAVAILABLE
              ? this.translate.instant('forms.collect.page.gps.unavailable')
              : this.translate.instant('forms.collect.page.gps.timeout'),
        );
      },
      highAccuracy
        ? { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        : { enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 },
    );
  }

  clearGps(questionId: string): void {
    const answers = { ...this.answers() };
    delete answers[questionId];
    this.answers.set(answers);
  }

  setAnswer(questionId: string, value: unknown): void {
    // Al cambiar la provincia se quita el cantón que ya no le corresponde (y así en cadena).
    this.answers.update((answers) => pruneCascadeAnswers(this.orderedQuestions(), { ...answers, [questionId]: value }));
    this.clearQuestionError(questionId);
  }

  setNumericAnswer(questionId: string, value: unknown): void {
    this.setAnswer(questionId, Number(value));
  }

  ratingOptions(question: FormQuestion): number[] {
    const max = Math.max(1, Math.min(20, Number(question.properties?.max_rating ?? 5)));
    return Array.from({ length: max }, (_, index) => index + 1);
  }

  rankingOptions(question: FormQuestion): string[] {
    const current = this.answers()[question.id];
    return Array.isArray(current) && current.length === this.getChoiceOptions(question).length
      ? current.map(String) : this.getChoiceOptions(question);
  }

  moveRanking(question: FormQuestion, index: number, direction: -1 | 1): void {
    const options = [...this.rankingOptions(question)];
    const next = index + direction;
    if (next < 0 || next >= options.length) return;
    [options[index], options[next]] = [options[next], options[index]];
    this.setAnswer(question.id, options);
  }

  /** Límite de duración de video de la pregunta (5–120 s). */
  maxVideoSeconds(question: FormQuestion): number {
    return maxVideoSeconds(question.properties);
  }

  async captureMedia(question: FormQuestion, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const maxBytes = Math.min(30, Math.max(1, Number(question.properties?.max_file_size_mb ?? 10))) * 1024 * 1024;
    if (file.size > maxBytes || !/^(image|audio|video)\//.test(file.type)
      || (question.type === 'SIGNATURE' && !file.type.startsWith('image/'))) {
      this.validationErrors.update((errors) => ({ ...errors, [question.id]: this.translate.instant('forms.collect.page.media.invalid') }));
      input.value = '';
      return;
    }
    if (file.type.startsWith('video/')) {
      const limit = this.maxVideoSeconds(question);
      const duration = await readVideoDuration(file);
      if (duration !== null && duration > limit + 0.5) {
        this.validationErrors.update((errors) => ({
          ...errors, [question.id]: this.translate.instant('forms.collect.page.media.tooLong', { duration: Math.round(duration), limit }),
        }));
        input.value = '';
        return;
      }
    }
    const reader = new FileReader();
    reader.onload = () => this.setAnswer(question.id, reader.result);
    reader.onerror = () => this.validationErrors.update((errors) => ({ ...errors, [question.id]: this.translate.instant('forms.collect.page.media.readFailed') }));
    reader.readAsDataURL(file);
  }

  isSelected(questionId: string, option: string): boolean {
    const value = this.answers()[questionId];
    return Array.isArray(value) && value.includes(option);
  }

  toggleMulti(questionId: string, option: string, checked: boolean): void {
    const current = this.answers()[questionId];
    const selected = Array.isArray(current) ? [...current] : [];

    if (checked && !selected.includes(option)) {
      selected.push(option);
    } else if (!checked) {
      const index = selected.indexOf(option);
      if (index >= 0) selected.splice(index, 1);
    }

    this.setAnswer(questionId, selected);
  }

  getChoiceOptions(question: FormQuestion): string[] {
    const options = Array.isArray(question.options)
      ? question.options.map((option) => String(option))
      : [];
    const filter = question.type === 'SINGLE_CHOICE' || question.type === 'MULTIPLE_CHOICE' ? choiceFilterOf(question.properties) : null;
    // El filtro va por posición, así que se aplica antes de descartar opciones vacías.
    return allowedOptions(options, filter, filter ? this.answers()[filter.question_id] : null).filter(Boolean);
  }

  /** Aviso cuando las opciones dependen de una pregunta anterior que aún no habilita ninguna. */
  cascadeHint(question: FormQuestion): string {
    const filter = choiceFilterOf(question.properties);
    if (!filter || this.getChoiceOptions(question).length > 0) return '';
    const source = this.orderedQuestions().find((item) => item.id === filter.question_id);
    const answer = source ? this.answers()[source.id] : undefined;
    const answered = answer !== undefined && answer !== null && answer !== '' && !(Array.isArray(answer) && answer.length === 0);
    return this.translate.instant(answered ? 'forms.collect.noOptionsFor' : 'forms.collect.answerFirst', { question: source?.label ?? '' });
  }

  getLikertRows(question: FormQuestion): string[] {
    if (Array.isArray(question.likert_rows)) {
      return question.likert_rows.map((row) => String(row)).filter(Boolean);
    }

    if (question.options && !Array.isArray(question.options) && Array.isArray(question.options.rows)) {
      return question.options.rows.map((row) => String(row)).filter(Boolean);
    }

    return [question.label];
  }

  getLikertColumns(question: FormQuestion): string[] {
    if (Array.isArray(question.likert_columns)) {
      return question.likert_columns.map((column) => String(column)).filter(Boolean);
    }

    if (question.options && !Array.isArray(question.options) && Array.isArray(question.options.columns)) {
      return question.options.columns.map((column) => String(column)).filter(Boolean);
    }

    if (Array.isArray(question.options)) {
      return question.options.map((column) => String(column)).filter(Boolean);
    }

    return [];
  }

  getLikertAnswer(questionId: string, row: string): unknown {
    const value = this.answers()[questionId];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return (value as Record<string, unknown>)[row];
    }

    return value;
  }

  setLikertAnswer(questionId: string, row: string, value: unknown): void {
    const current = this.answers()[questionId];
    const matrix = current && typeof current === 'object' && !Array.isArray(current)
      ? { ...(current as Record<string, unknown>) }
      : {};

    matrix[row] = value;
    this.setAnswer(questionId, matrix);
  }

  onSubmit(): void {
    if (this.submitting()) return;

    if (this.form()?.step_by_step) {
      this.advanceStep();
      return;
    }

    if (!this.validateRequiredQuestions()) return;

    this.submitAnswers();
  }

  goBack(): void {
    if (!this.form()?.step_by_step || this.stepHistory().length <= 1) {
      return;
    }

    this.stepHistory.update((history) => history.slice(0, -1));
    const history = this.stepHistory();
    this.currentStepIndex.set(history[history.length - 1] ?? 0);
    this.clearStepErrors();
  }

  advanceStep(): void {
    const form = this.form();
    const currentQuestion = this.currentQuestion();

    if (!form?.step_by_step || !currentQuestion) {
      return;
    }

    if (!this.validateQuestion(currentQuestion)) {
      return;
    }

    const orderedQuestions = this.orderedQuestions();
    const nextStep = this.getNextStepIndex(currentQuestion, orderedQuestions);

    if (nextStep >= orderedQuestions.length) {
      if (!this.validateFlowQuestions()) {
        return;
      }

      this.submitAnswers();
      return;
    }

    this.currentStepIndex.set(nextStep);
    this.stepHistory.update((history) => [...history, nextStep]);
  }

  resetForm(): void {
    this.answers.set(Object.fromEntries(this.orderedQuestions()
      .filter((question) => question.type === 'RANKING')
      .map((question) => [question.id, this.getChoiceOptions(question)])));
    this.validationErrors.set({});
    this.currentStepIndex.set(0);
    this.stepHistory.set([0]);
    this.submitted.set(false);
    this.clientSubmissionId = crypto.randomUUID();
    this.consentAccepted.set(false);
    this.consentDeclined.set(false);
    this.error.set('');
    this.submitError.set('');
    this.clearProgress();
  }

  readonly textFormatOf = textFormatOf;
  readonly textFormatInput = textFormatInput;

  /** Al salir del campo avisa de inmediato si el correo, la cédula o el teléfono no son válidos. */
  checkTextFormat(question: FormQuestion): void {
    const errorKey = textFormatError(textFormatOf(question.properties), this.answers()[question.id]);
    const message = errorKey ? this.translate.instant(errorKey) : null;
    const errors = { ...this.validationErrors() };
    if (message) errors[question.id] = message;
    else if (errors[question.id] && !this.answerErrorFor(question)) delete errors[question.id];
    this.validationErrors.set(errors);
  }

  questionError(questionId: string): string {
    return this.validationErrors()[questionId] ?? '';
  }

  getQuestionDisplayNumber(questionId: string): string {
    return this.questionVisualMeta().get(questionId)?.displayNumber ?? '0';
  }

  getQuestionLevel(questionId: string): number {
    return this.questionVisualMeta().get(questionId)?.level ?? 0;
  }

  getQuestionIndent(questionId: string): number {
    return this.getQuestionLevel(questionId) * 16;
  }

  getQuestionSectionName(question: FormQuestion): string {
    const section = this.questionVisualMeta().get(question.id)?.sectionName?.trim();
    return section || this.translate.instant('forms.collect.sectionGeneral');
  }

  shouldShowSectionHeader(index: number, question: FormQuestion): boolean {
    if (index === 0) return true;

    const questions = this.orderedQuestions();
    const previous = questions[index - 1];
    if (!previous) return true;

    return this.getQuestionSectionName(previous) !== this.getQuestionSectionName(question);
  }

  private submitAnswers(): void {
    if (!this.consentAccepted()) return;
    this.submitting.set(true);
    this.submitError.set('');

    if (this.testMode) {
      const check = this.testToken
        ? this.formService.submitSharedTestResponse(this.testFormId, this.testToken, this.normalizedAnswers())
        : this.formService.submitTestResponse(this.testFormId, this.normalizedAnswers());
      check.subscribe({
        next: (result) => {
          this.testAnswered.set(result.answered);
          this.submitted.set(true);
          this.submitting.set(false);
        },
        error: (err) => {
          // Mismas reglas que un envío real: se marcan las preguntas que el servidor rechazó.
          const fieldErrors = (err?.error?.errors ?? {}) as Record<string, string[]>;
          const byQuestion: Record<string, string> = {};
          for (const [key, messages] of Object.entries(fieldErrors)) {
            const id = key.startsWith('data.') ? key.slice(5) : key;
            if (Array.isArray(messages) && messages[0]) byQuestion[id] = messages[0];
          }
          this.validationErrors.update((errors) => ({ ...errors, ...byQuestion }));
          this.submitError.set(err?.error?.message || this.translate.instant('forms.collect.errors.submit'));
          this.submitting.set(false);
        },
      });
      return;
    }

    this.formService.submitResponse(this.linkUuid, this.normalizedAnswers(), this.clientSubmissionId).subscribe({
      next: () => {
        this.submitted.set(true);
        this.submitting.set(false);
      },
      error: (err) => {
        // El formulario y las respuestas se conservan: el encuestado puede corregir o reintentar.
        this.submitError.set(err?.error?.message || this.translate.instant('forms.collect.errors.submit'));
        this.submitting.set(false);
      },
    });
  }

  private validateRequiredQuestions(): boolean {
    const form = this.form();
    if (!form) return false;

    const errors = this.buildValidationErrors(form.questions ?? []);
    this.validationErrors.set(errors);
    return Object.keys(errors).length === 0;
  }

  private validateFlowQuestions(): boolean {
    const errors = this.buildValidationErrors(this.getFlowQuestions());
    this.validationErrors.set(errors);
    return Object.keys(errors).length === 0;
  }

  private validateQuestion(question: FormQuestion): boolean {
    if (!this.isQuestionActive(question)) {
      this.clearQuestionError(question.id);
      return true;
    }

    const errors = { ...this.validationErrors() };
    const message = this.answerErrorFor(question);

    if (!message) {
      delete errors[question.id];
      this.validationErrors.set(errors);
      return true;
    }

    errors[question.id] = message;
    this.validationErrors.set(errors);
    return false;
  }

  /** Error de la respuesta: obligatoria sin contestar o con formato inválido (correo, cédula, teléfono). */
  private answerErrorFor(question: FormQuestion): string | null {
    if (['NOTE', 'CALCULATE'].includes(question.type)) return null;
    if (question.required && !this.hasRequiredAnswer(question)) {
      return question.type === 'LIKERT'
        ? this.translate.instant('forms.collect.errors.requiredLikert')
        : this.translate.instant('forms.collect.errors.required');
    }
    const formatError = question.type === 'TEXT' ? textFormatError(textFormatOf(question.properties), this.answers()[question.id]) : null;
    return formatError ? this.translate.instant(formatError) : null;
  }

  /** Respuestas listas para enviar: correo en minúsculas, cédula y teléfono solo con dígitos. */
  private normalizedAnswers(): Record<string, unknown> {
    const answers = { ...this.answers() };
    for (const question of this.form()?.questions ?? []) {
      // Lo respondido en una subpregunta que quedó oculta (se desmarcó «Otro») no se envía.
      if (!this.isQuestionActive(question)) {
        delete answers[question.id];
        continue;
      }
      const format = question.type === 'TEXT' ? textFormatOf(question.properties) : null;
      const value = answers[question.id];
      if (format && typeof value === 'string' && value.trim() !== '') answers[question.id] = normalizeTextFormat(format, value);
    }
    return answers;
  }

  private buildValidationErrors(questions: FormQuestion[]): Record<string, string> {
    const errors: Record<string, string> = {};

    for (const question of questions) {
      if (!this.isQuestionActive(question)) {
        continue;
      }

      const message = this.answerErrorFor(question);
      if (message) errors[question.id] = message;
    }

    return errors;
  }

  private clearStepErrors(): void {
    const currentQuestion = this.currentQuestion();
    if (!currentQuestion) {
      return;
    }

    this.clearQuestionError(currentQuestion.id);
  }

  private getFlowQuestions(): FormQuestion[] {
    const form = this.form();
    const questions = this.orderedQuestions();

    if (!form?.step_by_step || questions.length === 0) {
      return questions;
    }

    const indexById = new Map(questions.map((question, index) => [question.id, index]));
    const conditionalTargetIds = this.getConditionalTargetIds(questions);
    const visited = new Set<string>();
    const flow: FormQuestion[] = [];
    let currentIndex = 0;

    while (currentIndex < questions.length) {
      const question = questions[currentIndex];

      if (visited.has(question.id)) {
        break;
      }

      visited.add(question.id);
      flow.push(question);

      const nextIndex = this.getNextStepIndex(question, questions, indexById, conditionalTargetIds);
      if (nextIndex <= currentIndex) {
        break;
      }

      currentIndex = nextIndex;
    }

    return flow;
  }

  private getNextStepIndex(
    question: FormQuestion,
    questions: FormQuestion[],
    indexById: Map<string, number> = new Map(questions.map((item, index) => [item.id, index])),
    conditionalTargetIds: Set<string> = this.getConditionalTargetIds(questions),
  ): number {
    const currentIndex = questions.findIndex((item) => item.id === question.id);
    if (currentIndex < 0) {
      return questions.length;
    }

    const sequentialNextIndex = this.getSequentialNextIndex(currentIndex, questions, conditionalTargetIds);

    if (!this.form()?.step_by_step || question.type !== 'SINGLE_CHOICE') {
      return sequentialNextIndex;
    }

    const answer = this.answers()[question.id];
    if (typeof answer !== 'string' || !Array.isArray(question.options)) {
      return sequentialNextIndex;
    }

    const selectedIndex = question.options.findIndex((option) => String(option) === answer);
    if (selectedIndex < 0) {
      return sequentialNextIndex;
    }

    const branchDecision = question.branch_rules?.find((rule) => rule.option_index === selectedIndex);
    const action = branchDecision?.action ?? (branchDecision?.next_question_id ? 'GO_TO' : 'CONTINUE');

    if (action === 'END_FORM') {
      return questions.length;
    }

    const branchTargetId = action === 'GO_TO' ? branchDecision?.next_question_id : null;
    if (!branchTargetId) {
      return sequentialNextIndex;
    }

    const branchTargetIndex = indexById.get(branchTargetId);
    if (branchTargetIndex === undefined || branchTargetIndex <= currentIndex) {
      return sequentialNextIndex;
    }

    // Si el destino es una subpregunta que no aplica, se sigue con la siguiente que sí.
    return this.isQuestionActive(questions[branchTargetIndex])
      ? branchTargetIndex
      : this.getSequentialNextIndex(branchTargetIndex, questions, conditionalTargetIds);
  }

  private getConditionalTargetIds(questions: FormQuestion[]): Set<string> {
    const targetIds = new Set<string>();

    for (const question of questions) {
      if (question.type !== 'SINGLE_CHOICE' || !Array.isArray(question.branch_rules)) {
        continue;
      }

      for (const rule of question.branch_rules) {
        const action = rule.action ?? (rule.next_question_id ? 'GO_TO' : 'CONTINUE');
        if (action !== 'GO_TO' || typeof rule.next_question_id !== 'string') {
          continue;
        }

        targetIds.add(rule.next_question_id);
      }
    }

    return targetIds;
  }

  private getSequentialNextIndex(
    currentIndex: number,
    questions: FormQuestion[],
    conditionalTargetIds: Set<string>,
  ): number {
    let nextIndex = currentIndex + 1;

    // Se saltan los destinos de saltos y las subpreguntas que no corresponden a lo respondido.
    while (nextIndex < questions.length
      && (conditionalTargetIds.has(questions[nextIndex].id) || !this.isQuestionActive(questions[nextIndex]))) {
      nextIndex += 1;
    }

    return nextIndex;
  }

  private hasRequiredAnswer(question: FormQuestion): boolean {
    const answer = this.answers()[question.id];

    if (question.type === 'MULTIPLE_CHOICE') {
      return Array.isArray(answer) && answer.length > 0;
    }

    if (question.type === 'LIKERT') {
      const rows = this.getLikertRows(question);
      if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return false;

      const matrix = answer as Record<string, unknown>;
      return rows.every((row) => matrix[row] !== undefined && matrix[row] !== null && String(matrix[row]).trim() !== '');
    }

    if (question.type === 'GPS') {
      return this.gpsAnswer(question.id) !== null;
    }

    return answer !== undefined && answer !== null && String(answer).trim() !== '';
  }

  /**
   * Una subpregunta se muestra si su padre está visible y tiene respuesta; con «mostrar solo si se
   * elige…», además, si entre lo elegido en el padre está alguna de esas opciones (ej. «Otro»).
   */
  isQuestionActive(question: FormQuestion, depth = 0): boolean {
    const parentId = question.parent_question_id;
    if (!parentId || depth > 20) {
      return true;
    }

    const parent = this.orderedQuestions().find((item) => item.id === parentId);
    if (!parent) {
      return true;
    }
    if (!this.isQuestionActive(parent, depth + 1) || !this.hasRequiredAnswer(parent)) {
      return false;
    }

    const options = showIfOf(question.properties);
    return !options || showIfMatches(options, this.answers()[parent.id]);
  }

  private clearQuestionError(questionId: string): void {
    if (!this.validationErrors()[questionId]) return;

    this.validationErrors.update((errors) => {
      const next = { ...errors };
      delete next[questionId];
      return next;
    });
  }

  private buildQuestionVisualMeta(questions: FormQuestion[]): Map<string, QuestionVisualMeta> {
    const byParent = new Map<string | null, FormQuestion[]>();

    for (const question of questions) {
      const parentId = question.parent_question_id ?? null;
      const siblings = byParent.get(parentId) ?? [];
      siblings.push(question);
      byParent.set(parentId, siblings);
    }

    for (const siblings of byParent.values()) {
      siblings.sort((left, right) => left.order - right.order);
    }

    const rootQuestions = (byParent.get(null) ?? []).slice().sort((left, right) => left.order - right.order);
    const meta = new Map<string, QuestionVisualMeta>();

    rootQuestions.forEach((root, rootIndex) => {
      const sectionName = (root.section_name ?? '').trim();
      this.walkQuestionTree(root, byParent, meta, [rootIndex + 1], 0, sectionName);
    });

    return meta;
  }

  private walkQuestionTree(
    question: FormQuestion,
    byParent: Map<string | null, FormQuestion[]>,
    meta: Map<string, QuestionVisualMeta>,
    path: number[],
    level: number,
    inheritedSection: string,
  ): void {
    const sectionName = (question.section_name ?? '').trim() || inheritedSection;

    meta.set(question.id, {
      level,
      displayNumber: path.join('.'),
      sectionName,
    });

    const children = (byParent.get(question.id) ?? []).slice().sort((left, right) => left.order - right.order);
    children.forEach((child, childIndex) => {
      this.walkQuestionTree(child, byParent, meta, [...path, childIndex + 1], level + 1, sectionName);
    });
  }
}
