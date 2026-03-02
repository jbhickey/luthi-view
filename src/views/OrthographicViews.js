import * as THREE from 'three';

export class OrthographicViews {
  constructor(sceneManager, container) {
    this.sceneManager = sceneManager;
    this.container = container;
    this.active = false;
    this.cameras = {};
    this.labels = [];

    this._savedRenderLoop = null;
    this._animFrameId = null;

    this._initCameras();
  }

  _initCameras() {
    const views = ['front', 'top', 'right'];
    views.forEach((name) => {
      const cam = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 10000);
      cam.userData.viewName = name;
      this.cameras[name] = cam;
    });
  }

  enable() {
    if (this.active) return;
    this.active = true;

    this._fitCameras();
    this._createLabels();
    this._startQuadRender();
  }

  disable() {
    if (!this.active) return;
    this.active = false;

    this._removeLabels();
    this._stopQuadRender();

    // Restore full viewport
    const renderer = this.sceneManager.renderer;
    const css2d = this.sceneManager.css2dRenderer;
    renderer.setScissorTest(false);
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    renderer.setViewport(0, 0, w, h);
    renderer.setSize(w, h);
    css2d.setSize(w, h);
  }

  _fitCameras() {
    const model = this.sceneManager.currentModel;
    if (!model) return;

    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const dist = maxDim * 2;
    const frustumSize = maxDim * 1.5;

    const setup = (cam, pos, up) => {
      const aspect = 1; // will be updated in render
      cam.left = -frustumSize * aspect / 2;
      cam.right = frustumSize * aspect / 2;
      cam.top = frustumSize / 2;
      cam.bottom = -frustumSize / 2;
      cam.position.set(...pos);
      cam.up.set(...up);
      cam.lookAt(center);
      cam.updateProjectionMatrix();
    };

    setup(this.cameras.front, [center.x, center.y, center.z + dist], [0, 1, 0]);
    setup(this.cameras.top, [center.x, center.y + dist, center.z], [0, 0, -1]);
    setup(this.cameras.right, [center.x + dist, center.y, center.z], [0, 1, 0]);
  }

  _createLabels() {
    this._removeLabels();
    const names = ['Front', 'Top', 'Right', 'Perspective'];
    names.forEach((name) => {
      const label = document.createElement('div');
      label.className = 'view-label';
      label.textContent = name;
      label.style.display = 'none';
      this.container.appendChild(label);
      this.labels.push(label);
    });
  }

  _removeLabels() {
    this.labels.forEach((l) => l.remove());
    this.labels = [];
  }

  _startQuadRender() {
    this._stopQuadRender();

    const renderer = this.sceneManager.renderer;
    const scene = this.sceneManager.scene;
    const perspCam = this.sceneManager.perspectiveCamera;

    renderer.setScissorTest(true);

    const render = () => {
      if (!this.active) return;
      this._animFrameId = requestAnimationFrame(render);

      this.sceneManager.controls.update();

      const fullW = this.container.clientWidth;
      const fullH = this.container.clientHeight;
      const halfW = Math.floor(fullW / 2);
      const halfH = Math.floor(fullH / 2);

      renderer.setSize(fullW, fullH, false);

      // Quadrants: [col, row, camera, labelIndex]
      const quads = [
        [0, halfH, this.cameras.front, 0],       // top-left: Front
        [halfW, halfH, this.cameras.top, 1],      // top-right: Top
        [0, 0, this.cameras.right, 2],            // bottom-left: Right
        [halfW, 0, perspCam, 3],                  // bottom-right: Perspective
      ];

      quads.forEach(([x, y, cam, labelIdx]) => {
        // Update ortho aspect
        if (cam.isOrthographicCamera) {
          const aspect = halfW / halfH;
          const frustumSize = cam.top * 2;
          cam.left = -frustumSize * aspect / 2;
          cam.right = frustumSize * aspect / 2;
          cam.updateProjectionMatrix();
        }

        renderer.setViewport(x, y, halfW, halfH);
        renderer.setScissor(x, y, halfW, halfH);
        renderer.render(scene, cam);

        // Position CSS label
        if (this.labels[labelIdx]) {
          const label = this.labels[labelIdx];
          label.style.display = 'block';
          // CSS coordinates: top-left origin
          const cssX = x;
          const cssY = fullH - y - halfH;
          label.style.left = `${cssX + 8}px`;
          label.style.top = `${cssY + 4}px`;
        }
      });

      // Render CSS2D labels only for the perspective view
      this.sceneManager.css2dRenderer.setSize(fullW, fullH);
      this.sceneManager.css2dRenderer.render(scene, perspCam);
    };

    render();
  }

  _stopQuadRender() {
    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = null;
    }
  }
}
