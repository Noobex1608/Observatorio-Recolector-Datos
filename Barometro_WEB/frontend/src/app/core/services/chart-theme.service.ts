import { Injectable, computed, inject } from '@angular/core';
import { ChartThemeConfig } from './interfaces';
import { ThemeService } from './theme.service';

@Injectable({
  providedIn: 'root',
})
export class ChartThemeService {
  private readonly themeService = inject(ThemeService);

  // Paleta de colores para tema claro
  private readonly lightColors = [
    '#0F766E',
    '#14B8A6',
    '#334155',
    '#64748B',
    '#C8102E',
    '#2DD4BF',
    '#475569',
    '#99F6DF',
    '#A00D25',
    '#94A3B8',
    '#115E59',
    '#D73A4A',
  ];

  // Paleta de colores para tema oscuro (más brillantes)
  private readonly darkColors = [
    '#5EEAD0',
    '#14B8A6',
    '#CBD5E1',
    '#94A3B8',
    '#F87171',
    '#2DD4BF',
    '#64748B',
    '#99F6DF',
    '#EF4444',
    '#475569',
    '#CCFBF1',
    '#FCA5A5',
  ];

  // Gradientes para gráficos
  readonly lightGradients = [
    { start: '#0F766E', end: '#14B8A6' },
    { start: '#334155', end: '#64748B' },
    { start: '#2DD4BF', end: '#99F6DF' },
    { start: '#C8102E', end: '#D73A4A' },
    { start: '#64748B', end: '#94A3B8' },
  ];

  readonly darkGradients = [
    { start: '#5EEAD0', end: '#14B8A6' },
    { start: '#CBD5E1', end: '#64748B' },
    { start: '#99F6DF', end: '#2DD4BF' },
    { start: '#F87171', end: '#EF4444' },
    { start: '#94A3B8', end: '#475569' },
  ];

  // Computed para obtener configuración actual del tema
  readonly config = computed<ChartThemeConfig>(() => {
    const isDark = this.themeService.isDark();

    return isDark
      ? {
          colors: this.darkColors,
          backgroundColor: 'transparent',
          textColor: '#F3FAF7',
          textColorSecondary: '#B8C7C1',
          borderColor: '#243530',
          axisLineColor: '#3A514A',
          splitLineColor: '#243530',
          tooltipBg: 'rgba(13, 23, 21, 0.96)',
          tooltipBorder: '#3A514A',
        }
      : {
          colors: this.lightColors,
          backgroundColor: 'transparent',
          textColor: '#10201D',
          textColorSecondary: '#5F6F69',
          borderColor: '#DCE5E1',
          axisLineColor: '#B6C7C0',
          splitLineColor: '#E4ECE7',
          tooltipBg: 'rgba(251, 253, 252, 0.96)',
          tooltipBorder: '#DCE5E1',
        };
  });

  /**
   * Obtiene la paleta de colores actual según el tema
   */
  getColors(): string[] {
    return this.themeService.isDark() ? this.darkColors : this.lightColors;
  }

  /**
   * Obtiene un color específico de la paleta
   */
  getColor(index: number): string {
    const colors = this.getColors();
    return colors[index % colors.length];
  }

  /**
   * Obtiene los gradientes según el tema
   */
  getGradients(): { start: string; end: string }[] {
    return this.themeService.isDark() ? this.darkGradients : this.lightGradients;
  }

  /**
   * Obtiene un gradiente específico
   */
  getGradient(index: number): { start: string; end: string } {
    const gradients = this.getGradients();
    return gradients[index % gradients.length];
  }

  /**
   * Genera configuración base de ECharts con tema aplicado
   */
  getBaseChartOptions(): any {
    const cfg = this.config();

    return {
      backgroundColor: cfg.backgroundColor,
      textStyle: {
        color: cfg.textColor,
        fontFamily: "'Inter', system-ui, sans-serif",
      },
      title: {
        textStyle: {
          color: cfg.textColor,
          fontWeight: 600,
        },
        subtextStyle: {
          color: cfg.textColorSecondary,
        },
      },
      legend: {
        textStyle: {
          color: cfg.textColorSecondary,
        },
        pageTextStyle: {
          color: cfg.textColorSecondary,
        },
      },
      tooltip: {
        backgroundColor: cfg.tooltipBg,
        borderColor: cfg.tooltipBorder,
        textStyle: {
          color: cfg.textColor,
        },
        extraCssText: 'box-shadow: 0 4px 12px rgba(0,0,0,0.15); border-radius: 8px;',
      },
      xAxis: {
        axisLine: {
          lineStyle: { color: cfg.axisLineColor },
        },
        axisTick: {
          lineStyle: { color: cfg.axisLineColor },
        },
        axisLabel: {
          color: cfg.textColorSecondary,
        },
        splitLine: {
          lineStyle: { color: cfg.splitLineColor },
        },
      },
      yAxis: {
        axisLine: {
          lineStyle: { color: cfg.axisLineColor },
        },
        axisTick: {
          lineStyle: { color: cfg.axisLineColor },
        },
        axisLabel: {
          color: cfg.textColorSecondary,
        },
        splitLine: {
          lineStyle: { color: cfg.splitLineColor },
        },
      },
      grid: {
        borderColor: cfg.borderColor,
      },
      color: cfg.colors,
    };
  }

  /**
   * Obtiene opciones de tooltip mejoradas
   */
  getTooltipOptions(showPercentage = false): any {
    const cfg = this.config();

    return {
      trigger: 'item' as const,
      backgroundColor: cfg.tooltipBg,
      borderColor: cfg.tooltipBorder,
      borderWidth: 1,
      padding: [12, 16],
      textStyle: {
        color: cfg.textColor,
        fontSize: 13,
      },
      extraCssText: 'box-shadow: 0 4px 20px rgba(0,0,0,0.15); border-radius: 12px;',
      formatter: showPercentage
        ? (params: any) => {
            const value = params.value;
            const percent = params.percent ? `(${params.percent.toFixed(1)}%)` : '';
            return `<strong>${params.name}</strong><br/>${params.seriesName || ''}: ${value.toLocaleString()} ${percent}`;
          }
        : undefined,
    };
  }

  /**
   * Obtiene opciones de animación
   */
  getAnimationOptions(): any {
    return {
      animation: true,
      animationDuration: 800,
      animationEasing: 'cubicOut' as const,
      animationDelay: (idx: number) => idx * 50,
    };
  }

  /**
   * Obtiene opciones de animación extendidas para diferentes efectos
   */
  getEnhancedAnimations(type: 'bar' | 'pie' | 'line' | 'scatter' | 'default' = 'default'): any {
    const base = {
      animation: true,
      animationThreshold: 2000,
    };

    switch (type) {
      case 'bar':
        return {
          ...base,
          animationDuration: 600,
          animationEasing: 'elasticOut' as const,
          animationDelay: (idx: number) => idx * 30,
          animationDurationUpdate: 300,
        };
      case 'pie':
        return {
          ...base,
          animationDuration: 1000,
          animationType: 'scale' as const,
          animationEasing: 'elasticOut' as const,
        };
      case 'line':
        return {
          ...base,
          animationDuration: 1200,
          animationEasing: 'cubicInOut' as const,
        };
      case 'scatter':
        return {
          ...base,
          animationDuration: 600,
          animationEasing: 'cubicOut' as const,
          animationDelay: (idx: number) => idx * 5,
        };
      default:
        return {
          ...base,
          animationDuration: 800,
          animationEasing: 'cubicOut' as const,
        };
    }
  }

  /**
   * Obtiene opciones de leyenda mejoradas
   */
  getEnhancedLegend(position: 'bottom' | 'right' | 'top' = 'bottom'): any {
    const cfg = this.config();
    const base = {
      textStyle: {
        color: cfg.textColorSecondary,
        fontSize: 12,
      },
      itemGap: 16,
      itemWidth: 14,
      itemHeight: 14,
      icon: 'roundRect',
      pageTextStyle: { color: cfg.textColorSecondary },
      pageIconColor: cfg.textColorSecondary,
      pageIconInactiveColor: cfg.borderColor,
    };

    switch (position) {
      case 'right':
        return {
          ...base,
          orient: 'vertical' as const,
          right: 20,
          top: 'middle' as const,
          type: 'scroll' as const,
        };
      case 'top':
        return {
          ...base,
          orient: 'horizontal' as const,
          top: 10,
          left: 'center' as const,
        };
      default:
        return {
          ...base,
          orient: 'horizontal' as const,
          bottom: 10,
          left: 'center' as const,
          type: 'scroll' as const,
        };
    }
  }

  /**
   * Obtiene opciones de grid responsivas
   */
  getResponsiveGrid(hasLegendBottom = true): any {
    return {
      top: 70,
      right: 30,
      bottom: hasLegendBottom ? 80 : 50,
      left: 60,
      containLabel: true,
    };
  }

  /**
   * Obtiene opciones de zoom para gráficos de línea/área
   */
  getDataZoomOptions(): any[] {
    const cfg = this.config();

    return [
      {
        type: 'inside',
        start: 0,
        end: 100,
      },
      {
        type: 'slider',
        show: true,
        start: 0,
        end: 100,
        height: 20,
        bottom: 10,
        borderColor: cfg.borderColor,
        fillerColor: 'rgba(200, 16, 46, 0.16)',
        handleStyle: {
          color: cfg.colors[0],
        },
        textStyle: {
          color: cfg.textColorSecondary,
        },
      },
    ];
  }

  /**
   * Obtiene color según el valor de correlación
   */
  getCorrelationColor(correlation: number): string {
    const absCorr = Math.abs(correlation);

    if (absCorr >= 0.7) {
      return correlation > 0 ? '#111111' : '#EF4444'; // Verde fuerte / Rojo fuerte
    } else if (absCorr >= 0.4) {
      return correlation > 0 ? '#525252' : '#F87171'; // Verde medio / Rojo medio
    } else if (absCorr >= 0.2) {
      return '#737373'; // Amarillo (correlación débil)
    } else {
      return '#8A8A8A'; // Gris (sin correlación)
    }
  }

  /**
   * Obtiene texto descriptivo de correlación
   */
  getCorrelationText(correlation: number): string {
    const absCorr = Math.abs(correlation);
    const direction = correlation > 0 ? 'positiva' : 'negativa';

    if (absCorr >= 0.7) {
      return `Correlación ${direction} fuerte`;
    } else if (absCorr >= 0.4) {
      return `Correlación ${direction} moderada`;
    } else if (absCorr >= 0.2) {
      return `Correlación ${direction} débil`;
    } else {
      return 'Sin correlación significativa';
    }
  }
}
