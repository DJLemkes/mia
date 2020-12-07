export function filterUndefined<T>(ts: (T | undefined)[]): T[] {
  return ts.filter((t: T | undefined): t is T => !!t)
}

export const pascalToCamel = (input: string) =>
  `${input.slice(0, 1).toLowerCase()}${input.slice(1)}`
