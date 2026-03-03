export class SimulationController {
  constructor(toolpathRenderer, stockSimulator) {
    this.toolpath = toolpathRenderer;
    this.stock = stockSimulator;

    this.totalMoves = 0;
    this.currentMove = -1;
    this.isPlaying = false;
    this.speed = 1;
    this._animId = null;
    this._lastTime = 0;
    this._accumulator = 0;
    this.movesPerSecond = 60;

    // Callbacks
    this.onProgressUpdate = null;   // (current, total) => {}
    this.onPlayStateChange = null;  // (isPlaying) => {}
  }

  /**
   * Initialize simulation with parsed moves.
   */
  init(moves) {
    this.stop();
    this.totalMoves = moves.length;
    this.currentMove = -1;
    this._notifyProgress();
  }

  play() {
    if (this.isPlaying) return;
    if (this.currentMove >= this.totalMoves - 1) return; // Already at end

    this.isPlaying = true;
    this._lastTime = performance.now();
    this._accumulator = 0;
    this._animId = requestAnimationFrame((t) => this._tick(t));
    this._notifyPlayState();
  }

  pause() {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    if (this._animId) {
      cancelAnimationFrame(this._animId);
      this._animId = null;
    }
    this._notifyPlayState();
  }

  stop() {
    this.pause();
    this.currentMove = -1;
    this._notifyProgress();
  }

  /**
   * Step forward by n moves.
   */
  stepForward(n = 1) {
    this.pause();
    const target = Math.min(this.currentMove + n, this.totalMoves - 1);
    this._advanceTo(target);
  }

  /**
   * Step backward by n moves. Requires replay from start.
   */
  stepBackward(n = 1) {
    this.pause();
    const target = Math.max(this.currentMove - n, -1);
    this._seekTo(target);
  }

  /**
   * Seek to specific move index. -1 means before any moves.
   */
  seekTo(index) {
    this.pause();
    this._seekTo(index);
  }

  /**
   * Set playback speed multiplier.
   */
  setSpeed(multiplier) {
    this.speed = multiplier;
  }

  _tick(time) {
    if (!this.isPlaying) return;

    const dt = (time - this._lastTime) / 1000;
    this._lastTime = time;

    this._accumulator += dt * this.movesPerSecond * this.speed;
    const movesToAdvance = Math.floor(this._accumulator);
    this._accumulator -= movesToAdvance;

    if (movesToAdvance > 0) {
      const target = Math.min(this.currentMove + movesToAdvance, this.totalMoves - 1);
      this._advanceTo(target);

      // Auto-pause at end
      if (this.currentMove >= this.totalMoves - 1) {
        this.pause();
        return;
      }
    }

    this._animId = requestAnimationFrame((t) => this._tick(t));
  }

  /**
   * Advance forward incrementally (no reset needed).
   */
  _advanceTo(target) {
    if (target <= this.currentMove) return;

    // Process stock for each new move
    for (let i = this.currentMove + 1; i <= target; i++) {
      this.stock.processMoveAt(i);
    }
    this.stock._updateMesh();

    this.currentMove = target;

    // Update toolpath visibility
    this.toolpath.showUpToMove(this.currentMove);

    this._notifyProgress();
  }

  /**
   * Seek to any position. If backward, must replay from start.
   */
  _seekTo(target) {
    target = Math.max(-1, Math.min(target, this.totalMoves - 1));

    if (target > this.currentMove) {
      // Forward - incremental
      this._advanceTo(target);
    } else if (target < this.currentMove) {
      // Backward - reset and replay
      this.stock.reset();
      this.currentMove = -1;

      if (target >= 0) {
        this.stock.processUpToMove(target);
        this.toolpath.showUpToMove(target);
      } else {
        // Before any moves - hide all
        if (this.toolpath.rapidLines) {
          this.toolpath.rapidLines.geometry.setDrawRange(0, 0);
        }
        if (this.toolpath.cutLines) {
          this.toolpath.cutLines.geometry.setDrawRange(0, 0);
        }
      }

      this.currentMove = target;
      this._notifyProgress();
    }
  }

  _notifyProgress() {
    if (this.onProgressUpdate) {
      this.onProgressUpdate(this.currentMove + 1, this.totalMoves);
    }
  }

  _notifyPlayState() {
    if (this.onPlayStateChange) {
      this.onPlayStateChange(this.isPlaying);
    }
  }
}
