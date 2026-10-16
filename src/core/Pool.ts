/** Generic free-list pool. Objects are reset by the caller on acquire. */
export class Pool<T> {
  private free: T[] = [];
  constructor(private factory: () => T, prewarm = 0) {
    for (let i = 0; i < prewarm; i++) this.free.push(factory());
  }
  acquire(): T {
    return this.free.pop() ?? this.factory();
  }
  release(item: T): void {
    this.free.push(item);
  }
  get available(): number {
    return this.free.length;
  }
}
