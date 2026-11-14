import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';

import { ListaEncuestasComponent } from './lista-encuestas.component';

describe('ListaEncuestasComponent', () => {
  let component: ListaEncuestasComponent;
  let fixture: ComponentFixture<ListaEncuestasComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ListaEncuestasComponent],
      providers: [provideRouter([]), provideHttpClient()],
    }).compileComponents();

    fixture = TestBed.createComponent(ListaEncuestasComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
