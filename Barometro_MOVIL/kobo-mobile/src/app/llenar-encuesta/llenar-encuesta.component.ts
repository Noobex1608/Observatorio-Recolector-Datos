import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { RouterLink, Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { DbService, FormDefinition, FormQuestion, ProjectZoneInfo } from '../db.service';
import { StorageService } from '../storage.service';
import { LocationService } from '../services/location.service';
import { ThemeService } from '../theme.service';
import { ToastService } from '../toast.service';
import { TranslatePipe } from '../translate.pipe';
import { QuestionSignatureComponent } from '../questions/question-signature/question-signature.component';
import { QuestionGpsComponent } from '../questions/question-gps/question-gps.component';
import { QuestionMultimediaComponent } from '../questions/question-multimedia/question-multimedia.component';
import { QuestionDateTimeComponent } from '../questions/question-datetime/question-datetime.component';
import { QuestionNoteComponent } from '../questions/question-note/question-note.component';
import { QuestionRankingComponent } from '../questions/question-ranking/question-ranking.component';
import { QuestionRatingComponent } from '../questions/question-rating/question-rating.component';
import { QuestionBarcodeComponent } from '../questions/question-barcode/question-barcode.component';
import { QuestionLikertComponent } from '../questions/question-likert/question-likert.component';

@Component({
  selector: 'app-llenar-encuesta',
  imports: [
    RouterLink,
    FormsModule,
    CommonModule,
    TranslatePipe,
    QuestionSignatureComponent,
    QuestionGpsComponent,
    QuestionMultimediaComponent,
    QuestionDateTimeComponent,
    QuestionNoteComponent,
    QuestionRankingComponent,
    QuestionRatingComponent,
    QuestionBarcodeComponent,
    QuestionLikertComponent
  ],
  templateUrl: './llenar-encuesta.component.html',
  styleUrls: ['./llenar-encuesta.component.css']
})
export class LlenarEncuestaComponent implements OnInit, OnDestroy {
  private db = inject(DbService);
  private storage = inject(StorageService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);
  private toast = inject(ToastService);
  theme = inject(ThemeService);

  formulario: FormDefinition | null = null;
  respuestas: Record<string, any> = {};
  cargando = true;
  errorCarga = '';
  draftId: number | null = null;
  targetAlcanzado = false;
  flujoFinalizado = false;
  preguntaActualIndex = 0;

  tiempoInicio: Date = new Date();
  tiempoInicioFormato = '';
  duracionSegundos = 0;
  duracionTexto = '00:00';
  timerInterval: any = null;
  likertRespondidos: Record<string, boolean> = {};
  guardando = false;

  // Validación de Delimitación Zonal del Proyecto
  private locationService = inject(LocationService);
  mostrarValidacionZonal = false;
  estadoValidacion: 'inactivo' | 'verificando' | 'valido' | 'fuera_zona' | 'error' = 'inactivo';
  errorValidacionTexto = '';
  zonaValidada: ProjectZoneInfo | null = null;
  distanciaAZonaMetros: number | null = null;
  distanciaFormateada = '';
  coordenadasActuales: { lat: number; lng: number; precision: number } | null = null;
  justificacionFueraZona = '';
  mostrarModalJustificacion = false;

  // Consentimiento Informado Previo
  mostrarConsentimiento = false;

  get requiereConsentimiento(): boolean {
    return this.formulario?.require_consent !== false;
  }

  get textoConsentimiento(): string {
    return this.formulario?.consent_text?.trim() ||
      'Buenos días/tardes. Somos de la Universidad Laica Eloy Alfaro de Manabí (ULEAM). Estamos realizando una investigación académica y comunitaria. Su participación es completamente voluntaria y sus respuestas serán tratadas de manera anónima y confidencial. ¿Acepta participar en esta encuesta?';
  }

  async ngOnInit() {
    try {
      const formId = this.route.snapshot.paramMap.get('id');
      if (!formId) {
        this.errorCarga = 'ID de formulario no válido.';
        this.cargando = false;
        return;
      }

      const form = await this.db.forms.get(formId);
      if (!form) {
        this.errorCarga = 'Formulario no encontrado. Descárgalo primero desde el inicio.';
        this.cargando = false;
        return;
      }
      form.step_by_step = true;
      this.formulario = form;

      const today = new Date().toISOString().split('T')[0];
      if (form.start_date && today < form.start_date) {
        this.errorCarga = `Esta encuesta aún no está disponible. Su fecha de inicio es ${form.start_date}.`;
        this.cargando = false;
        this.cdr.detectChanges();
        return;
      }
      if (form.end_date && today > form.end_date) {
        this.errorCarga = `Esta encuesta ha finalizado y se encuentra archivada desde el ${form.end_date}. No se permiten más respuestas.`;
        this.cargando = false;
        this.cdr.detectChanges();
        return;
      }

      if (form.target_responses != null && form.target_responses > 0) {
        const serverCount = form.responses_count ?? 0;
        const pendingLocal = await this.db.responses
          .where({ formId: formId, estado: 'listo-para-enviar' })
          .count();
        if (serverCount + pendingLocal >= form.target_responses) {
          this.targetAlcanzado = true;
          this.cargando = false;
          this.cdr.detectChanges();
          return;
        }
      }

      // Solo cargar borrador si viene de "Continuar" (?continue=true)
      const continuar = this.route.snapshot.queryParamMap.get('continue');
      if (continuar === 'true') {
        const draft = await this.db.responses
          .where({ formId: formId, estado: 'borrador' })
          .first();
        if (draft && draft.answers) {
          this.respuestas = draft.answers;
          this.draftId = draft.id ?? null;
          if (draft.answers['_project_geofence']) {
            const geo = draft.answers['_project_geofence'];
            this.zonaValidada = this.zonasProyecto.find(z => z.id === geo.zone_id) || null;
            this.estadoValidacion = geo.valido ? 'valido' : 'fuera_zona';
            this.mostrarValidacionZonal = false;
          }
        } else {
          this.inicializarRespuestas();
        }
      } else {
        this.inicializarRespuestas();
      }

      if (this.tieneDelimitacionZonal && !this.respuestas['_project_geofence']) {
        this.mostrarValidacionZonal = true;
        this.verificarUbicacionZonal();
      } else if (this.requiereConsentimiento && !this.respuestas['_consentimiento_aceptado']) {
        this.mostrarConsentimiento = true;
      }
    } catch {
      this.errorCarga = 'Error al cargar el formulario.';
    }

    const ahora = new Date();
    const horas = String(ahora.getHours()).padStart(2, '0');
    const minutos = String(ahora.getMinutes()).padStart(2, '0');
    const dia = String(ahora.getDate()).padStart(2, '0');
    const mes = String(ahora.getMonth() + 1).padStart(2, '0');
    const anio = ahora.getFullYear();
    this.tiempoInicioFormato = `${horas}:${minutos} - ${dia}/${mes}/${anio}`;

    this.cargando = false;
    this.cdr.detectChanges();

    this.timerInterval = setInterval(() => {
      this.duracionSegundos += 1;
      this.duracionTexto = this.formatTime(this.duracionSegundos);
    }, 1000);
  }

  get preguntaActual(): FormQuestion | null {
    if (!this.formulario?.step_by_step) {
      return null;
    }
    return this.formulario.questions[this.preguntaActualIndex] ?? null;
  }

  get pasoActualTexto(): string {
    if (!this.formulario?.step_by_step) {
      return '';
    }
    return `Pregunta ${this.preguntaActualIndex + 1} de ${this.formulario.questions.length}`;
  }

  get porcentajeProgreso(): number {
    if (!this.formulario?.questions?.length) return 0;
    if (this.flujoFinalizado) return 100;
    const total = this.formulario.questions.length;
    const actual = Math.min(this.preguntaActualIndex + 1, total);
    return Math.round((actual / total) * 100);
  }

  get puedeAvanzar(): boolean {
    const pregunta = this.preguntaActual;
    if (!pregunta) {
      return true;
    }

    const respuesta = this.respuestas[pregunta.id];
    if (!pregunta.required) {
      return true;
    }

    if (pregunta.type === 'NOTE' || pregunta.type === 'CALCULATE') {
      return true;
    }

    if (pregunta.type === 'MULTIPLE_CHOICE') {
      return Array.isArray(respuesta) && respuesta.length > 0;
    }

    if (pregunta.type === 'LIKERT') {
      return pregunta.likert_rows?.every((row: string) => respuesta && respuesta[row]) ?? false;
    }

    if (pregunta.type === 'SIGNATURE') {
      return !!respuesta && (typeof respuesta === 'string' || !!respuesta.dataUrl || !!respuesta.blobId);
    }

    if (pregunta.type === 'GPS') {
      return !!respuesta && typeof respuesta.latitude === 'number' && typeof respuesta.longitude === 'number';
    }

    if (pregunta.type === 'MULTIMEDIA') {
      return !!respuesta && (!!respuesta.blobId || !!respuesta.objectUrl);
    }

    if (pregunta.type === 'RANKING') {
      return Array.isArray(respuesta) && respuesta.length > 0;
    }

    if (pregunta.type === 'RATING') {
      return typeof respuesta === 'number' && respuesta > 0;
    }

    if (pregunta.type === 'BARCODE') {
      return typeof respuesta === 'string' && respuesta.trim() !== '';
    }

    return respuesta !== undefined && respuesta !== null && String(respuesta).trim() !== '';
  }

  get hasStepByStep(): boolean {
    return !!this.formulario?.step_by_step;
  }

  get siguienteTexto(): string {
    const pregunta = this.preguntaActual;
    if (!pregunta) {
      return 'Siguiente';
    }

    const selectedIndex = this.selectedOptionIndex(pregunta, this.respuestas[pregunta.id]);
    const decision = this.branchDecisionForQuestion(pregunta, selectedIndex);
    if (decision.action === 'END_FORM') {
      return 'Finalizar';
    }

    return this.preguntaActualIndex + 1 === this.formulario?.questions.length ? 'Finalizar' : 'Siguiente';
  }

  private isEndFormAction(question: FormQuestion, answer: any): boolean {
    const selectedIndex = this.selectedOptionIndex(question, answer);
    const decision = this.branchDecisionForQuestion(question, selectedIndex);
    return decision.action === 'END_FORM';
  }

  private nextQuestionIndex(currentIndex: number): number {
    if (!this.formulario) {
      return currentIndex + 1;
    }

    const questions = this.formulario.questions;
    const conditionalTargetIds = this.conditionalTargetIds(questions);
    let nextIndex = currentIndex + 1;

    while (nextIndex < questions.length) {
      const candidate = questions[nextIndex];
      if (!candidate || !conditionalTargetIds[candidate.id]) {
        break;
      }
      nextIndex++;
    }

    return nextIndex;
  }

  private selectedOptionIndex(question: FormQuestion, answer: any): number | null {
    if (!Array.isArray(question.options)) {
      return null;
    }

    const options = question.options.filter((option: any) => option !== null && option !== undefined);
    const value = typeof answer === 'string' || typeof answer === 'number' ? String(answer).trim() : '';
    if (value === '') {
      return null;
    }

    return options.findIndex((option: any) => String(option) === value);
  }

  private branchDecisionForQuestion(question: FormQuestion, selectedIndex: number | null): { action: string; target: string | null } {
    if (selectedIndex === null || !Array.isArray(question.branch_rules)) {
      return { action: 'CONTINUE', target: null };
    }

    for (const rule of question.branch_rules) {
      if (!rule || typeof rule !== 'object') {
        continue;
      }
      const optionIndex = typeof rule.option_index === 'number' ? rule.option_index : null;
      if (optionIndex !== selectedIndex) {
        continue;
      }

      const action = typeof rule.action === 'string' && ['CONTINUE', 'GO_TO', 'END_FORM'].includes(rule.action) ? rule.action : 'CONTINUE';
      const target = typeof rule.next_question_id === 'string' && rule.next_question_id !== '' ? rule.next_question_id : null;
      return { action, target: action === 'GO_TO' ? target : null };
    }

    return { action: 'CONTINUE', target: null };
  }

  private conditionalTargetIds(questions: FormQuestion[]): Record<string, boolean> {
    const targets: Record<string, boolean> = {};
    for (const question of questions) {
      if (question.type !== 'SINGLE_CHOICE' || !Array.isArray(question.branch_rules)) {
        continue;
      }
      for (const rule of question.branch_rules) {
        if (!rule || typeof rule !== 'object') {
          continue;
        }
        const action = typeof rule.action === 'string' ? rule.action : (rule.next_question_id ? 'GO_TO' : 'CONTINUE');
        const target = typeof rule.next_question_id === 'string' && rule.next_question_id !== '' ? rule.next_question_id : null;
        if (action === 'GO_TO' && target) {
          targets[target] = true;
        }
      }
    }
    return targets;
  }

  avanzarPregunta() {
    const pregunta = this.preguntaActual;
    if (!pregunta) {
      return;
    }

    if (pregunta.required && !this.puedeAvanzar) {
      this.toast.show('Debes responder la pregunta antes de avanzar.', 'error');
      return;
    }

    const selectedIndex = this.selectedOptionIndex(pregunta, this.respuestas[pregunta.id]);
    const branchDecision = this.branchDecisionForQuestion(pregunta, selectedIndex);
    if (branchDecision.action === 'END_FORM') {
      this.flujoFinalizado = true;
      return;
    }

    const questionIndexes = Object.fromEntries(this.formulario!.questions.map((q, index) => [q.id, index]));

    let nextIndex = this.nextQuestionIndex(this.preguntaActualIndex);
    if (branchDecision.action === 'GO_TO' && branchDecision.target && questionIndexes[branchDecision.target] !== undefined) {
      const targetIndex = questionIndexes[branchDecision.target];
      if (targetIndex > this.preguntaActualIndex) {
        nextIndex = targetIndex;
      }
    }

    if (nextIndex >= this.formulario!.questions.length) {
      this.flujoFinalizado = true;
      return;
    }

    this.preguntaActualIndex = nextIndex;
  }

  retrocederPregunta() {
    if (!this.formulario?.step_by_step || this.preguntaActualIndex <= 0) {
      return;
    }
    this.preguntaActualIndex = Math.max(0, this.preguntaActualIndex - 1);
    this.flujoFinalizado = false;
  }

  private inicializarRespuestas() {
    if (!this.formulario) return;
    for (const q of this.formulario.questions) {
      if (q.type === 'MULTIPLE_CHOICE') {
        this.respuestas[q.id] = [];
      } else if (q.type === 'LIKERT') {
        this.respuestas[q.id] = {};
        if (q.likert_rows) {
          for (const row of q.likert_rows) {
            this.respuestas[q.id][row] = '';
          }
        }
      } else {
        this.respuestas[q.id] = '';
      }
    }
    this.preguntaActualIndex = 0;
    this.flujoFinalizado = false;
  }

  ngOnDestroy() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
    this.autoGuardarBorrador();
  }

  private autoGuardarBorrador() {
    if (!this.formulario || this.guardando) return;
    const tieneRespuestas = Object.values(this.respuestas).some(v => {
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === 'object' && v !== null) return Object.values(v).some(sub => !!sub);
      return !!v && v !== '';
    });
    if (!tieneRespuestas) return;

    const form = {
      formId: this.formulario.id,
      link_uuid: this.formulario.link_uuid,
      formTitle: this.formulario.title,
      answers: { ...this.respuestas },
      estado: 'borrador' as const,
      createdAt: this.tiempoInicioFormato,
      duration: this.duracionTexto
    };

    if (this.draftId) {
      this.db.responses.update(this.draftId, form);
    } else {
      this.storage.agregarFormulario(form as any).then(id => {
        this.draftId = id;
      });
    }
  }

  onCheckboxChange(qId: string, option: string, event: any) {
    const checked = event.target.checked;
    if (!Array.isArray(this.respuestas[qId])) {
      this.respuestas[qId] = [];
    }
    if (checked) {
      this.respuestas[qId].push(option);
    } else {
      this.respuestas[qId] = this.respuestas[qId].filter((o: string) => o !== option);
    }
  }

  onSingleChoiceChange(qId: string, option: string) {
    const pregunta = this.formulario?.questions.find(q => q.id === qId);
    if (!pregunta) {
      return;
    }

    const selectedIndex = this.selectedOptionIndex(pregunta, option);
    const decision = this.branchDecisionForQuestion(pregunta, selectedIndex);
    if (decision.action === 'END_FORM') {
      this.flujoFinalizado = true;
    }
  }

  trackByQuestionId(_index: number, q: FormQuestion) {
    return q.id;
  }

  trackByRow(_index: number, row: string) {
    return row;
  }

  onSignatureChange(qId: string, payload: any) {
    this.respuestas[qId] = payload;
    this.evaluarCalculosBackground();
  }

  onGpsChange(qId: string, payload: any) {
    this.respuestas[qId] = payload;
    this.evaluarCalculosBackground();
  }

  onMultimediaChange(qId: string, payload: any) {
    this.respuestas[qId] = payload;
    this.evaluarCalculosBackground();
  }

  onDateTimeChange(qId: string, payload: any) {
    this.respuestas[qId] = payload;
    this.evaluarCalculosBackground();
  }

  onRankingChange(qId: string, payload: any) {
    this.respuestas[qId] = payload;
    this.evaluarCalculosBackground();
  }

  onRatingChange(qId: string, payload: any) {
    this.respuestas[qId] = payload;
    this.evaluarCalculosBackground();
  }

  onBarcodeChange(qId: string, payload: any) {
    this.respuestas[qId] = payload;
    this.evaluarCalculosBackground();
  }

  onLikertChange(qId: string, payload: any) {
    this.respuestas[qId] = payload;
    this.evaluarCalculosBackground();
  }

  evaluarCalculosBackground(): void {
    if (!this.formulario) return;
    for (const q of this.formulario.questions) {
      if (q.type === 'CALCULATE' && q.calculation_expression) {
        try {
          let expr = q.calculation_expression;
          expr = expr.replace(/\$\{([^}]+)\}/g, (_, qId) => {
            const val = this.respuestas[qId];
            if (val === undefined || val === null || val === '') return '0';
            if (typeof val === 'number') return isNaN(val) ? '0' : String(val);
            if (typeof val === 'boolean') return val ? '1' : '0';
            if (typeof val === 'string') {
              const parsed = Number(val.trim());
              return isNaN(parsed) ? '0' : String(parsed);
            }
            return '0';
          });

          if (/^[0-9+\-*/().\s]+$/.test(expr)) {
            const calculatedValue = Function(`"use strict"; return (${expr})`)();
            if (typeof calculatedValue === 'number' && !isNaN(calculatedValue) && isFinite(calculatedValue)) {
              this.respuestas[q.id] = Number(calculatedValue.toFixed(4));
            } else {
              this.respuestas[q.id] = 0;
            }
          }
        } catch {
          this.respuestas[q.id] = 0;
        }
      }
    }
  }

  formValido(): boolean {
    if (!this.formulario) return false;
    this.evaluarCalculosBackground();
    for (const q of this.formulario.questions) {
      if (q.type === 'NOTE' || q.type === 'CALCULATE') continue;
      if (!q.required) continue;
      const val = this.respuestas[q.id];
      if (q.type === 'MULTIPLE_CHOICE' || q.type === 'RANKING') {
        if (!Array.isArray(val) || val.length === 0) return false;
      } else if (q.type === 'LIKERT') {
        if (q.likert_rows) {
          for (const row of q.likert_rows) {
            if (!val || !val[row]) return false;
          }
        }
      } else if (q.type === 'SIGNATURE') {
        if (!val || (!val.dataUrl && !val.blobId && typeof val !== 'string')) return false;
      } else if (q.type === 'GPS') {
        if (!val || typeof val.latitude !== 'number' || typeof val.longitude !== 'number') return false;
      } else if (q.type === 'MULTIMEDIA') {
        if (!val || (!val.blobId && !val.objectUrl)) return false;
      } else if (q.type === 'RATING') {
        if (typeof val !== 'number' || val <= 0) return false;
      } else if (q.type === 'BARCODE') {
        if (!val || (typeof val === 'string' && val.trim() === '')) return false;
      } else {
        if (!val || (typeof val === 'string' && val.trim() === '')) return false;
      }
    }
    return true;
  }

  private async guardarConEstado(estado: 'borrador' | 'listo-para-enviar') {
    if (!this.formulario) return;
    this.guardando = true;

    const form = {
      formId: this.formulario.id,
      link_uuid: this.formulario.link_uuid,
      formTitle: this.formulario.title,
      answers: { ...this.respuestas },
      estado,
      createdAt: this.tiempoInicioFormato,
      duration: this.duracionTexto
    };

    if (estado === 'borrador' && this.draftId) {
      await this.db.responses.update(this.draftId, form);
    } else {
      if (this.draftId) {
        await this.db.responses.delete(this.draftId);
        this.draftId = null;
      }
      const newId = await this.storage.agregarFormulario(form as any);
      if (estado === 'borrador') {
        this.draftId = newId;
      }
    }
  }

  async guardarBorrador() {
    await this.guardarConEstado('borrador');
    this.toast.show('Borrador guardado.');
    this.router.navigate(['/']);
  }

  async guardarFormulario() {
    await this.guardarConEstado('listo-para-enviar');
    this.toast.show('Formulario guardado.');
    this.router.navigate(['/']);
  }

  private formatTime(segundos: number): string {
    const mins = Math.floor(segundos / 60);
    const secs = segundos % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  get tieneDelimitacionZonal(): boolean {
    return !!(this.formulario?.project_zones && this.formulario.project_zones.length > 0);
  }

  get zonasProyecto(): ProjectZoneInfo[] {
    return this.formulario?.project_zones || [];
  }

  get nombreZonaActiva(): string {
    if (this.zonaValidada) {
      return this.zonaValidada.name;
    }
    if (this.zonasProyecto.length > 0) {
      return this.zonasProyecto[0].name;
    }
    return 'Zona del Proyecto';
  }

  get googleMapsUrlZona(): string {
    const targetLat = this.zonaValidada?.target_lat ?? this.zonasProyecto[0]?.target_lat;
    const targetLng = this.zonaValidada?.target_lng ?? this.zonasProyecto[0]?.target_lng;
    const user = this.coordenadasActuales;
    if (user && targetLat !== null && targetLat !== undefined && targetLng !== null && targetLng !== undefined) {
      return `https://www.google.com/maps/dir/${user.lat},${user.lng}/${targetLat},${targetLng}`;
    }
    if (targetLat !== null && targetLat !== undefined && targetLng !== null && targetLng !== undefined) {
      return `https://www.google.com/maps?q=${targetLat},${targetLng}`;
    }
    return '';
  }

  async verificarUbicacionZonal(): Promise<void> {
    if (!this.tieneDelimitacionZonal) {
      this.mostrarValidacionZonal = false;
      this.estadoValidacion = 'inactivo';
      return;
    }

    this.estadoValidacion = 'verificando';
    this.errorValidacionTexto = '';
    this.cdr.detectChanges();

    try {
      const position = await this.locationService.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 12000
      });

      const userLat = position.latitude;
      const userLng = position.longitude;
      const accuracy = position.accuracy;
      this.coordenadasActuales = { lat: userLat, lng: userLng, precision: accuracy };

      let matchedZone: ProjectZoneInfo | null = null;
      let minDistance = Infinity;
      let closestZone: ProjectZoneInfo | null = null;

      for (const zone of this.zonasProyecto) {
        let inside = false;
        let dist = Infinity;

        // Evaluación por polígono cartográfico INEC
        if (zone.geofence_type === 'manzana_polygon' || zone.geofence_type === 'custom_polygon') {
          if (zone.geometry_json) {
            inside = this.puntoEnGeometria(userLat, userLng, zone.geometry_json);
          }
        }

        // Evaluación por distancia circular
        if (zone.target_lat !== null && zone.target_lat !== undefined &&
            zone.target_lng !== null && zone.target_lng !== undefined) {
          dist = this.calcularDistanciaMetros(userLat, userLng, zone.target_lat, zone.target_lng);
          if (dist < minDistance) {
            minDistance = dist;
            closestZone = zone;
          }

          const allowedRadius = zone.radius_meters || 500;
          if (!inside && dist <= allowedRadius) {
            inside = true;
          }
        }

        if (inside) {
          matchedZone = zone;
          minDistance = dist !== Infinity ? dist : 0;
          break;
        }
      }

      if (matchedZone) {
        this.estadoValidacion = 'valido';
        this.zonaValidada = matchedZone;
        this.distanciaAZonaMetros = minDistance;
        this.distanciaFormateada = this.formatearDistancia(minDistance);

        this.respuestas['_project_geofence'] = {
          valido: true,
          fuera_de_zona: false,
          zone_id: matchedZone.id,
          zone_name: matchedZone.name,
          tipo: matchedZone.geofence_type,
          latitud: userLat,
          longitud: userLng,
          precision: accuracy,
          distancia_metros: minDistance,
          timestamp: new Date().toISOString()
        };
      } else {
        this.estadoValidacion = 'fuera_zona';
        this.zonaValidada = closestZone || this.zonasProyecto[0];
        this.distanciaAZonaMetros = minDistance !== Infinity ? minDistance : null;
        this.distanciaFormateada = this.distanciaAZonaMetros !== null ? this.formatearDistancia(this.distanciaAZonaMetros) : 'Desconocida';
      }
    } catch (err: any) {
      this.estadoValidacion = 'error';
      this.errorValidacionTexto = err?.message || 'No se pudo obtener la ubicación GPS del dispositivo.';
    }

    this.cdr.detectChanges();
  }

  calcularDistanciaMetros(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  }

  formatearDistancia(metros: number): string {
    if (metros < 1000) {
      return `${metros} metros`;
    }
    return `${(metros / 1000).toFixed(2)} km`;
  }

  puntoEnGeometria(lat: number, lng: number, geometry: any): boolean {
    if (!geometry || !geometry.coordinates) return false;

    try {
      const type = geometry.type;
      const coords = geometry.coordinates;

      if (type === 'Polygon') {
        return this.puntoEnPoligono([lng, lat], coords[0]);
      } else if (type === 'MultiPolygon') {
        for (const poly of coords) {
          if (this.puntoEnPoligono([lng, lat], poly[0])) {
            return true;
          }
        }
      }
    } catch {
      return false;
    }

    return false;
  }

  puntoEnPoligono(point: [number, number], vs: [number, number][]): boolean {
    if (!Array.isArray(vs) || vs.length < 3) return false;
    const x = point[0], y = point[1];
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      const xi = vs[i][0], yi = vs[i][1];
      const xj = vs[j][0], yj = vs[j][1];
      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  comenzarEncuestaValidada(): void {
    this.mostrarValidacionZonal = false;
    if (this.requiereConsentimiento && !this.respuestas['_consentimiento_aceptado']) {
      this.mostrarConsentimiento = true;
    }
    this.cdr.detectChanges();
  }

  continuarFueraDeZona(): void {
    const user = this.coordenadasActuales;
    const zone = this.zonaValidada;
    this.respuestas['_project_geofence'] = {
      valido: false,
      fuera_de_zona: true,
      zone_id: zone?.id,
      zone_name: zone?.name,
      tipo: zone?.geofence_type,
      latitud: user?.lat ?? null,
      longitud: user?.lng ?? null,
      precision: user?.precision ?? null,
      distancia_metros: this.distanciaAZonaMetros,
      justificacion: this.justificacionFueraZona.trim() || 'Levantamiento fuera de zona confirmado por encuestador',
      timestamp: new Date().toISOString()
    };

    this.mostrarValidacionZonal = false;
    if (this.requiereConsentimiento && !this.respuestas['_consentimiento_aceptado']) {
      this.mostrarConsentimiento = true;
    }
    this.toast.show('Encuesta iniciada fuera de la delimitación oficial.');
    this.cdr.detectChanges();
  }

  aceptarConsentimiento(): void {
    this.respuestas['_consentimiento_aceptado'] = true;
    this.respuestas['_consentimiento_fecha'] = new Date().toISOString();
    this.mostrarConsentimiento = false;
    this.toast.show('Consentimiento informado aceptado.');
    this.guardarBorrador();
    this.cdr.detectChanges();
  }

  async rechazarConsentimiento(): Promise<void> {
    if (this.draftId) {
      try {
        await this.db.responses.delete(this.draftId);
      } catch {}
    }
    this.toast.show('La persona no aceptó participar. Encuesta cerrada.');
    this.router.navigate(['/lista']);
  }
}
