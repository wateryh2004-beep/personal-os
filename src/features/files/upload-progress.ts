/** Calculate byte-weighted progress once per event, independent of batch size. */
export function createUploadProgress(sizes: number[]) {
  const percentages = sizes.map(() => 0);
  const total = sizes.reduce((sum, size) => sum + size, 0);
  let transferred = 0;
  return (index: number, percentage: number) => {
    if (!Number.isInteger(index) || index < 0 || index >= sizes.length || !Number.isFinite(percentage)) return total ? Math.round(transferred / total * 100) : 0;
    const next = Math.max(percentages[index], Math.min(100, percentage));
    transferred += sizes[index] * (next - percentages[index]) / 100;
    percentages[index] = next;
    return total ? Math.min(100, Math.round(transferred / total * 100)) : 0;
  };
}
