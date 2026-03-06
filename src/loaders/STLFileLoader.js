import { STLLoader } from 'three/addons/loaders/STLLoader.js';

export class STLFileLoader {
  constructor(sceneManager, statusBar) {
    this.sceneManager = sceneManager;
    this.statusBar = statusBar;
    this.loader = new STLLoader();

    this._initDragDrop();
    this._initFileInput();
  }

  _initFileInput() {
    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = '.stl';
    this.fileInput.multiple = true;
    this.fileInput.style.display = 'none';
    document.body.appendChild(this.fileInput);

    this.fileInput.addEventListener('change', (e) => {
      for (const file of e.target.files) {
        this._loadFile(file);
      }
    });
  }

  _initDragDrop() {
    const viewport = this.sceneManager.container;

    // Create drop overlay
    this.dropOverlay = document.createElement('div');
    this.dropOverlay.className = 'drop-overlay hidden';
    this.dropOverlay.innerHTML = '<div class="drop-message">Drop file here (STL / G-code)</div>';
    viewport.appendChild(this.dropOverlay);

    viewport.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.dropOverlay.classList.remove('hidden');
    });

    viewport.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!viewport.contains(e.relatedTarget)) {
        this.dropOverlay.classList.add('hidden');
      }
    });

    viewport.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.dropOverlay.classList.add('hidden');

      const files = e.dataTransfer.files;
      for (const file of files) {
        if (file.name.toLowerCase().endsWith('.stl')) {
          this._loadFile(file);
        }
      }
      // Non-STL files (e.g., G-code) handled by other loaders
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
        const geometry = this.loader.parse(e.target.result);
        this.sceneManager.addModel(geometry, file.name);

        const count = this.sceneManager.models.size;
        this._setStatus(`Loaded ${file.name} (${count} model${count > 1 ? 's' : ''} total)`);
      } catch (err) {
        this._setStatus(`Error loading ${file.name}: ${err.message}`);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  loadFromURL(url, name) {
    this._setStatus(`Loading ${name || url}...`);
    this.loader.load(
      url,
      (geometry) => {
        this.sceneManager.addModel(geometry, name || url);
        this._setStatus(`Loaded ${name || url}`);
      },
      undefined,
      (err) => {
        this._setStatus(`Error: ${err.message}`);
      }
    );
  }

  _setStatus(text) {
    if (this.statusBar) {
      this.statusBar.textContent = text;
    }
  }
}
