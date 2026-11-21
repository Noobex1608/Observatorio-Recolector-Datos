import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { FormService, FormTechnicalSheet } from '@core/services/form.service';
import { NotificationService } from '@core/services/notification.service';
import { provideSpanishTranslations } from '../../../testing/spanish-translations';
import { FormTechnicalSheetComponent } from './form-technical-sheet.component';

const flush = () => new Promise((resolve) => setTimeout(resolve, 50));

const sheet = (overrides: Partial<FormTechnicalSheet> = {}): FormTechnicalSheet => ({
  id: null, form_id: 'f1', status: 'DRAFT', validated_at: null, validator: null, creator: null, updated_at: null,
  can_edit: true, can_validate: true,
  target_universe: null, geographic_coverage: null, sample_size: null,
  error_margin_confidence: null, field_technique: null, quality_control: null,
  ...overrides,
});

const complete = {
  target_universe: 'Población del cantón Pichincha mayor de 16 años.',
  geographic_coverage: 'Cabecera cantonal y parroquias rurales.',
  sample_size: '415 encuestas efectivas.',
  error_margin_confidence: 'Margen de error de 5%, confianza del 95%.',
  field_technique: 'Entrevista presencial (CAPI).',
  quality_control: 'Validación GPS al 100%.',
};

function setup(initial: FormTechnicalSheet, extra: Record<string, unknown> = {}) {
  const forms = { getFormSheet: vi.fn(() => of(initial)), saveFormSheet: vi.fn(), validateFormSheet: vi.fn(), ...extra };
  TestBed.configureTestingModule({
    providers: [
      ...provideSpanishTranslations(),
      { provide: FormService, useValue: forms },
      { provide: NotificationService, useValue: { success: vi.fn(), error: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(FormTechnicalSheetComponent);
  fixture.componentRef.setInput('formId', 'f1');
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, forms };
}

describe('FormTechnicalSheetComponent', () => {
  it('muestra los seis parámetros y la plantilla rellena solo los vacíos con marcadores', async () => {
    const { fixture, component } = setup(sheet({ sample_size: '415 encuestas' }));
    await flush();
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    for (const label of ['Universo objetivo', 'Cobertura geográfica', 'Tamaño muestral', 'Margen de error y confianza', 'Técnica de campo', 'Control de calidad']) {
      expect(text).toContain(label);
    }

    component.applyTemplate();
    expect(component.values().sample_size).toBe('415 encuestas');
    expect(component.values().target_universe).toContain('[');
    expect(component.hasPlaceholders()).toBe(true);
    expect(component.canValidateNow()).toBe(false);
  });

  it('solo permite validar una ficha guardada, completa y sin cambios pendientes', async () => {
    const saved = sheet({ id: 's1', ...complete });
    const validated = sheet({ ...saved, status: 'VALIDATED', validator: { id: 1, name: 'Líder', email: 'l@x.ec' } });
    const { component, forms } = setup(saved, { validateFormSheet: vi.fn(() => of(validated)) });
    await flush();

    expect(component.canValidateNow()).toBe(true);
    component.update('quality_control', 'Otra cosa');
    expect(component.canValidateNow()).toBe(false);
    component.update('quality_control', complete.quality_control);

    component.validate();
    expect(forms.validateFormSheet).toHaveBeenCalledWith('f1');
    expect(component.sheet()?.status).toBe('VALIDATED');
  });

  it('sin permiso de edición muestra el texto en solo lectura', async () => {
    const { fixture } = setup(sheet({ id: 's1', ...complete, can_edit: false, can_validate: false }));
    await flush();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('415 encuestas efectivas.');
  });
});
