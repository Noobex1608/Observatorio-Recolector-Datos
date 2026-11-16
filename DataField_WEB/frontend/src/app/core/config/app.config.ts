import { AppConfig } from './app-config.interface';

/**
 * Configuracion estatica de la aplicacion.
 * Centraliza la informacion que se repite en todo el sitio.
 */
export const APP_CONFIG: AppConfig = {
  app: {
    name: 'ULEAM DataField',
    shortName: 'ULEAM DataField',
    description: 'Plataforma de formularios dinámicos y recolección de datos en campo',
  },
  university: {
    name: 'Universidad Laica Eloy Alfaro de Manabi',
    shortName: 'ULEAM',
    url: 'https://www.uleam.edu.ec',
    address: 'Av. Circunvalacion - Via a San Mateo',
    location: 'Manta - Manabi - Ecuador',
  },
} as const;
