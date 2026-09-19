export function normalizeSeries(values: number[]): number[] {
  if (!values.length) {
    return [];
  }

  const max = Math.max(...values);
  return max === 0 ? values.map(() => 0) : values.map((value) => Number((value / max).toFixed(4)));
}
