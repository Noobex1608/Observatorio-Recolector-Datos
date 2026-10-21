import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { DbService } from './db.service';
import { FieldTrackingService } from './field-tracking.service';
import { LocationService } from './services/location.service';

describe('FieldTrackingService', () => {
  it('rejects a stale cached zone before starting a shift', async () => {
    localStorage.removeItem('field_tracking_active_shift');
    const api = {
      fetchFormById: vi.fn().mockResolvedValue({ state: 'DEPLOYED', project_zones: [] }),
      startFieldTracking: vi.fn(),
    };
    const db = { forms: { update: vi.fn().mockResolvedValue(1) } };
    TestBed.configureTestingModule({ providers: [
      { provide: ApiService, useValue: api },
      { provide: AuthService, useValue: { obtenerUrlServidor: () => 'http://localhost:8000', esModoDemo: () => false } },
      { provide: DbService, useValue: db },
      { provide: LocationService, useValue: {} },
    ] });

    const service = TestBed.inject(FieldTrackingService);
    await expect(service.start('form-1', 'old-zone')).rejects.toThrow('La zona seleccionada ya no está asignada');
    expect(db.forms.update).toHaveBeenCalledWith('form-1', { project_zones: [] });
    expect(api.startFieldTracking).not.toHaveBeenCalled();
  });
});
