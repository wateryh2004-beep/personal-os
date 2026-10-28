export const experienceChunkSize = 3 * 1024 * 1024;
export const experienceMaxImageSize = 15 * 1024 * 1024;

export function experienceChunkCount(size: number) {
  if (!Number.isSafeInteger(size) || size < 1 || size > experienceMaxImageSize) throw new Error("invalid_image_size");
  return Math.ceil(size / experienceChunkSize);
}

export function experienceChunkLength(size: number, index: number) {
  const count = experienceChunkCount(size);
  if (!Number.isInteger(index) || index < 0 || index >= count) throw new Error("invalid_chunk_index");
  return Math.min(experienceChunkSize, size - index * experienceChunkSize);
}
