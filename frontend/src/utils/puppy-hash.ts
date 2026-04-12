const PUPPY_COUNT = 20;

/** Deterministic puppy index from a userId (stable across sessions). */
export function puppyIndex(userId: string): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  return ((hash % PUPPY_COUNT) + PUPPY_COUNT) % PUPPY_COUNT;
}

export function puppySrc(userId: string): string {
  return `/puppies/${String(puppyIndex(userId)).padStart(2, '0')}.jpg`;
}
