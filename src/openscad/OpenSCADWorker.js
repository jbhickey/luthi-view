export class OpenSCADWorker {
  constructor() {
    this.worker = new Worker(
      new URL('./openscad.worker.js', import.meta.url),
      { type: 'module' }
    );
    this._nextId = 0;
    this._pending = new Map();

    this.worker.onmessage = (e) => {
      const { id, type, stl, error } = e.data;
      const pending = this._pending.get(id);
      if (!pending) return;
      this._pending.delete(id);

      if (type === 'result') {
        pending.resolve(stl);
      } else if (type === 'error') {
        pending.reject(new Error(error));
      }
    };

    this.worker.onerror = (err) => {
      // Reject all pending
      for (const [id, p] of this._pending) {
        p.reject(new Error('Worker error: ' + err.message));
      }
      this._pending.clear();
    };
  }

  render(code) {
    return new Promise((resolve, reject) => {
      const id = this._nextId++;
      this._pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, type: 'render', code });
    });
  }

  terminate() {
    this.worker.terminate();
  }
}
