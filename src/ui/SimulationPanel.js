const SPEEDS = [0.25, 0.5, 1, 2, 5, 10];

export class SimulationPanel {
  constructor(container) {
    this.container = container;
    this.controller = null;
    this.el = null;
    this.visible = false;

    this._build();
  }

  _build() {
    this.el = document.createElement('div');
    this.el.className = 'sim-panel hidden';
    this.el.innerHTML = `
      <div class="sim-controls">
        <button class="sim-btn" data-action="reset" title="Reset">|&lt;&lt;</button>
        <button class="sim-btn" data-action="stepBack" title="Step Back">&lt;</button>
        <button class="sim-btn sim-play-btn" data-action="playPause" title="Play/Pause">&#9654;</button>
        <button class="sim-btn" data-action="stepFwd" title="Step Forward">&gt;</button>
        <button class="sim-btn" data-action="end" title="Go to End">&gt;&gt;|</button>
        <input type="range" class="sim-scrubber" min="0" max="100" value="0" />
        <select class="sim-speed">
          ${SPEEDS.map(s => `<option value="${s}" ${s === 1 ? 'selected' : ''}>${s}x</option>`).join('')}
        </select>
        <span class="sim-progress">0 / 0</span>
      </div>
    `;

    this.container.appendChild(this.el);

    // Cache elements
    this.playBtn = this.el.querySelector('[data-action="playPause"]');
    this.scrubber = this.el.querySelector('.sim-scrubber');
    this.speedSelect = this.el.querySelector('.sim-speed');
    this.progressLabel = this.el.querySelector('.sim-progress');

    // Wire button events
    this.el.querySelectorAll('.sim-btn').forEach(btn => {
      btn.addEventListener('click', () => this._onButton(btn.dataset.action));
    });

    // Scrubber
    this.scrubber.addEventListener('input', () => {
      if (this.controller) {
        const index = parseInt(this.scrubber.value, 10) - 1;
        this.controller.seekTo(index);
      }
    });

    // Speed
    this.speedSelect.addEventListener('change', () => {
      if (this.controller) {
        this.controller.setSpeed(parseFloat(this.speedSelect.value));
      }
    });
  }

  /**
   * Bind to a SimulationController.
   */
  setController(controller) {
    this.controller = controller;

    controller.onProgressUpdate = (current, total) => {
      this.progressLabel.textContent = `${current} / ${total}`;
      this.scrubber.max = total;
      this.scrubber.value = current;
    };

    controller.onPlayStateChange = (isPlaying) => {
      this.playBtn.innerHTML = isPlaying ? '&#9646;&#9646;' : '&#9654;';
      this.playBtn.title = isPlaying ? 'Pause' : 'Play';
    };
  }

  _onButton(action) {
    if (!this.controller) return;

    switch (action) {
      case 'reset':
        this.controller.seekTo(-1);
        break;
      case 'stepBack':
        this.controller.stepBackward(1);
        break;
      case 'playPause':
        if (this.controller.isPlaying) {
          this.controller.pause();
        } else {
          // If at end, reset first
          if (this.controller.currentMove >= this.controller.totalMoves - 1) {
            this.controller.seekTo(-1);
          }
          this.controller.play();
        }
        break;
      case 'stepFwd':
        this.controller.stepForward(1);
        break;
      case 'end':
        this.controller.seekTo(this.controller.totalMoves - 1);
        break;
    }
  }

  show() {
    this.visible = true;
    this.el.classList.remove('hidden');
  }

  hide() {
    this.visible = false;
    this.el.classList.add('hidden');
    if (this.controller) {
      this.controller.pause();
    }
  }

  toggle() {
    if (this.visible) {
      this.hide();
    } else {
      this.show();
    }
    return this.visible;
  }
}
