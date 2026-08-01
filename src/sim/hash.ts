/**
 * FNV-1a de 32 bits sobre um buffer empacotado. Barato o bastante pra rodar
 * todo tick e cobrir todo estado relevante de gameplay.
 */
export function fnv1a(bytes: Uint8Array): string {
  let h = 0x811c9dc5
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]!
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, "0")
}

/** Empacotador incremental: floats como f64 little-endian, inteiros como u32. */
export class Packer {
  private view: DataView
  private bytes: Uint8Array
  private offset = 0

  constructor(byteLength = 256) {
    const buffer = new ArrayBuffer(byteLength)
    this.view = new DataView(buffer)
    this.bytes = new Uint8Array(buffer)
  }

  /** Cresce dobrando. O número de inimigos varia; o buffer não pode limitar o hash. */
  private ensure(extra: number): void {
    if (this.offset + extra <= this.bytes.length) return
    let size = this.bytes.length
    while (size < this.offset + extra) size *= 2
    const buffer = new ArrayBuffer(size)
    const bytes = new Uint8Array(buffer)
    bytes.set(this.bytes)
    this.view = new DataView(buffer)
    this.bytes = bytes
  }

  f64(v: number): this {
    this.ensure(8)
    this.view.setFloat64(this.offset, v, true)
    this.offset += 8
    return this
  }

  u32(v: number): this {
    this.ensure(4)
    this.view.setUint32(this.offset, v >>> 0, true)
    this.offset += 4
    return this
  }

  u8(v: number): this {
    this.ensure(1)
    this.view.setUint8(this.offset, v & 0xff)
    this.offset += 1
    return this
  }

  bool(v: boolean): this {
    return this.u8(v ? 1 : 0)
  }

  reset(): this {
    this.offset = 0
    return this
  }

  digest(): string {
    return fnv1a(this.bytes.subarray(0, this.offset))
  }
}

/** FNV-1a sobre uma string UTF-8. Usado para o `tuningHash` do replay. */
export function hashString(text: string): string {
  return fnv1a(new TextEncoder().encode(text))
}
