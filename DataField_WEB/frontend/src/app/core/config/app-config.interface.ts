import { AppInfo } from './app-info.interface';
import { UniversityInfo } from './university-info.interface';

/**
 * Interfaz que define la configuración completa de la aplicación
 */
export interface AppConfig {
  readonly app: AppInfo;
  readonly university: UniversityInfo;
}
