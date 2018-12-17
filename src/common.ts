const SEED = Math.random();

export async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function hash(value: string): number {
  let hash = SEED;
  for (let i = 0; i < value.length; i++) {
    let num = value.charCodeAt(i);

    hash += num;
    hash %= 2147483648;
    hash += (hash << 10);
    hash %= 2147483648;
    hash ^= hash >> 6;
  }

  hash += hash << 3;
  hash %= 2147483648;
  hash ^= hash >> 11;
  hash += hash << 15;
  hash %= 2147483648;

  return hash >>> 0;
}
