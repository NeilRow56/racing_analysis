export function keyedStrategySummary(lines: string[]) {
  return lines.map((label, index) => ({
    key: `strategy-summary:${index}`,
    label,
  }));
}
