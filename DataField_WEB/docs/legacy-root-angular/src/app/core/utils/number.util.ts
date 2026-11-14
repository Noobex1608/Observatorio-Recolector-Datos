export function toPercentage(numerator: number, denominator: number): number {
  if (!denominator) {
    return 0;
  }

  return Number(((numerator / denominator) * 100).toFixed(2));
}
