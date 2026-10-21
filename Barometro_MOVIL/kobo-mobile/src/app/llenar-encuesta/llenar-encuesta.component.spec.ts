import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';

import { LlenarEncuestaComponent } from './llenar-encuesta.component';

describe('LlenarEncuestaComponent', () => {
  let component: LlenarEncuestaComponent;
  let fixture: ComponentFixture<LlenarEncuestaComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LlenarEncuestaComponent],
      providers: [provideRouter([]), provideHttpClient()],
    }).compileComponents();

    fixture = TestBed.createComponent(LlenarEncuestaComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
