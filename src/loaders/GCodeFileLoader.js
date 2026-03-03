import { GCodeParser } from '../cnc/GCodeParser.js';

const GCODE_EXTENSIONS = ['.nc', '.gcode', '.ngc', '.tap', '.cnc'];

export class GCodeFileLoader {
  constructor(sceneManager, statusBar) {
    this.sceneManager = sceneManager;
    this.statusBar = statusBar;
    this.onGCodeLoaded = null;

    this._initFileInput();
    this._initDragDrop();
  }

  _initFileInput() {
    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = GCODE_EXTENSIONS.join(',');
    this.fileInput.style.display = 'none';
    document.body.appendChild(this.fileInput);

    this.fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this._loadFile(e.target.files[0]);
      }
      // Reset so the same file can be re-selected
      this.fileInput.value = '';
    });
  }

  _initDragDrop() {
    const viewport = this.sceneManager.container;

    viewport.addEventListener('drop', (e) => {
      const file = e.dataTransfer?.files[0];
      if (!file) return;

      const ext = '.' + file.name.split('.').pop().toLowerCase();
      if (GCODE_EXTENSIONS.includes(ext)) {
        e.preventDefault();
        e.stopPropagation();
        this._loadFile(file);
      }
      // If not a G-code file, let it fall through to STL handler
    }, true); // Use capture phase to check before STL loader

    // Update drop overlay message when dragging G-code files
    viewport.addEventListener('dragover', (e) => {
      const items = e.dataTransfer?.items;
      if (items && items.length > 0) {
        // Can't reliably check extension during dragover in all browsers
        // so we just let it show the overlay
      }
    });
  }

  openFilePicker() {
    this.fileInput.click();
  }

  _loadFile(file) {
    this._setStatus(`Loading ${file.name}...`);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const result = GCodeParser.parse(text);

        if (result.warnings.length > 0) {
          console.warn('G-code warnings:', result.warnings);
        }

        const { metadata, bounds } = result;
        const size = {
          x: (bounds.max.x - bounds.min.x).toFixed(1),
          y: (bounds.max.y - bounds.min.y).toFixed(1),
          z: (bounds.max.z - bounds.min.z).toFixed(1),
        };

        this._setStatus(
          `${file.name} — ${metadata.moveCount} moves (${metadata.cutCount} cuts, ` +
          `${metadata.rapidCount} rapids) — extents: ${size.x} × ${size.y} × ${size.z} mm`
        );

        if (this.onGCodeLoaded) {
          this.onGCodeLoaded(result, file.name);
        }
      } catch (err) {
        this._setStatus(`Error parsing ${file.name}: ${err.message}`);
        console.error('G-code parse error:', err);
      }
    };
    reader.readAsText(file);
  }

  _setStatus(text) {
    if (this.statusBar) {
      this.statusBar.textContent = text;
    }
  }
}
