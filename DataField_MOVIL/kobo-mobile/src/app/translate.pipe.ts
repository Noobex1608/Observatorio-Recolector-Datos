import { Pipe, PipeTransform, inject } from '@angular/core';
import { ThemeService } from './theme.service';

@Pipe({ name: 'translate', pure: false })
export class TranslatePipe implements PipeTransform {
  private theme = inject(ThemeService);

  transform(key: string): string {
    return this.theme.t(key);
  }
}
