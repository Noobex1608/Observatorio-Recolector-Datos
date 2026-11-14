import {
  BarChart,
  BoxplotChart,
  FunnelChart,
  GaugeChart,
  HeatmapChart,
  LineChart,
  PictorialBarChart,
  PieChart,
  RadarChart,
  ScatterChart,
  TreemapChart,
} from 'echarts/charts';
import {
  DataZoomComponent,
  GraphicComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  MarkPointComponent,
  RadarComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';

// Registrar componentes de ECharts
echarts.use([
  // Charts
  BarChart,
  PieChart,
  LineChart,
  ScatterChart,
  HeatmapChart,
  RadarChart,
  TreemapChart,
  FunnelChart,
  GaugeChart,
  BoxplotChart,
  PictorialBarChart,
  // Components
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  DataZoomComponent,
  GraphicComponent,
  VisualMapComponent,
  RadarComponent,
  MarkLineComponent,
  MarkPointComponent,
  // Renderer
  CanvasRenderer,
]);

export { echarts };
