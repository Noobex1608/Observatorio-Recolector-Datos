import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ListaEncuestasComponent } from './lista-encuestas.component';

describe('ListaEncuestasComponent', () => {
  let component: ListaEncuestasComponent;
  let fixture: ComponentFixture<ListaEncuestasComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ListaEncuestasComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ListaEncuestasComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
