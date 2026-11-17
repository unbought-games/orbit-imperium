export function decodePackagePng(
  bytes: ArrayBuffer,
  width: number,
  height: number,
): Promise<Uint8ClampedArray>

export function validatePackagePngHeader(
  bytes: ArrayBuffer | Uint8Array,
  width: number,
  height: number,
): { input: Uint8Array; view: DataView }
