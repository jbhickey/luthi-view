import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

export class SceneManager {
  constructor(container) {
    this.container = container;
    this.models = new Map();
    this.selectedModel = null;
    this._modelCounter = 0;
    this._colorPalette = [0xc4a265, 0x65a2c4, 0xa265c4, 0x65c4a2, 0xc46565, 0x8cc465];
    this.onModelLoaded = null;
    this.onModelAdded = null;
    this.onModelRemoved = null;
    this._started = false;

    this._initScene();
    this._initLights();
    this._initHelpers();

    // Defer renderer init until container has actual dimensions
    const tryInit = () => {
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      if (w > 0 && h > 0) {
        this._initRenderer();
        this._initCSS2DRenderer();
        this._initCamera();
        this._initControls();
        this._animate();
        this._started = true;
        window.addEventListener('resize', () => this._onResize());
      } else {
        requestAnimationFrame(tryInit);
      }
    };
    tryInit();
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.container.appendChild(this.renderer.domElement);
  }

  _initCSS2DRenderer() {
    this.css2dRenderer = new CSS2DRenderer();
    this.css2dRenderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.css2dRenderer.domElement.style.position = 'absolute';
    this.css2dRenderer.domElement.style.top = '0';
    this.css2dRenderer.domElement.style.left = '0';
    this.css2dRenderer.domElement.style.pointerEvents = 'none';
    this.container.appendChild(this.css2dRenderer.domElement);
  }

  _initCamera() {
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.perspectiveCamera = new THREE.PerspectiveCamera(50, aspect, 0.1, 10000);
    this.perspectiveCamera.position.set(50, 50, 80);

    this.orthoCamera = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 10000);
    this.orthoCamera.position.set(0, 0, 100);

    this.activeCamera = this.perspectiveCamera;
  }

  _initControls() {
    this.controls = new OrbitControls(this.activeCamera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.target.set(0, 0, 0);
  }

  _initLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);

    const dir1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dir1.position.set(50, 80, 60);
    dir1.castShadow = true;
    this.scene.add(dir1);

    const dir2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dir2.position.set(-30, -20, -40);
    this.scene.add(dir2);
  }

  _initHelpers() {
    this.gridHelper = new THREE.GridHelper(200, 40, 0x444466, 0x333355);
    this.scene.add(this.gridHelper);

    this.axesHelper = new THREE.AxesHelper(30);
    this.scene.add(this.axesHelper);
  }

  _animate() {
    requestAnimationFrame(() => this._animate());
    this.controls.update();
    this.renderer.render(this.scene, this.activeCamera);
    this.css2dRenderer.render(this.scene, this.activeCamera);
  }

  _onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;

    this.perspectiveCamera.aspect = w / h;
    this.perspectiveCamera.updateProjectionMatrix();

    this._updateOrthoFrustum();

    this.renderer.setSize(w, h);
    this.css2dRenderer.setSize(w, h);
  }

  _updateOrthoFrustum() {
    const aspect = this.container.clientWidth / this.container.clientHeight;
    const frustumSize = this.orthoCamera.userData.frustumSize || 100;
    this.orthoCamera.left = -frustumSize * aspect / 2;
    this.orthoCamera.right = frustumSize * aspect / 2;
    this.orthoCamera.top = frustumSize / 2;
    this.orthoCamera.bottom = -frustumSize / 2;
    this.orthoCamera.updateProjectionMatrix();
  }

  get ready() {
    return this._started;
  }

  get currentModel() {
    return this.selectedModel || (this.models.size > 0 ? this.models.values().next().value : null);
  }

  addModel(geometry, name) {
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const modelId = `model_${this._modelCounter}`;
    const color = this._colorPalette[this._modelCounter % this._colorPalette.length];
    this._modelCounter++;

    const material = new THREE.MeshPhongMaterial({
      color: color,
      specular: 0x333333,
      shininess: 40,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.modelId = modelId;
    mesh.userData.modelName = name || modelId;
    mesh.userData.modelColor = color;
    this.scene.add(mesh);
    this.models.set(modelId, mesh);

    this._fitCameraToAll();

    if (this.onModelAdded) {
      this.onModelAdded(mesh);
    }
    if (this.onModelLoaded) {
      this.onModelLoaded(mesh);
    }

    return mesh;
  }

  removeModel(modelId) {
    const mesh = this.models.get(modelId);
    if (!mesh) return;

    this.scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
    this.models.delete(modelId);

    if (this.selectedModel === mesh) {
      this.selectedModel = null;
    }

    if (this.onModelRemoved) {
      this.onModelRemoved(modelId);
    }

    if (this.models.size > 0) {
      this._fitCameraToAll();
    }
  }

  getAllModels() {
    return Array.from(this.models.values());
  }

  getModelById(id) {
    return this.models.get(id) || null;
  }

  _fitCameraToAll() {
    const box = this._getCombinedBoundingBox();
    if (!box) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    this.controls.target.copy(center);

    const dist = maxDim * 2;
    this.perspectiveCamera.position.set(
      center.x + dist * 0.6,
      center.y + dist * 0.5,
      center.z + dist * 0.8
    );
    this.perspectiveCamera.lookAt(center);

    const frustumSize = maxDim * 1.5;
    this.orthoCamera.userData.frustumSize = frustumSize;
    this._updateOrthoFrustum();
    this.orthoCamera.position.set(center.x, center.y, center.z + dist);
    this.orthoCamera.lookAt(center);

    this.controls.update();
  }

  _getCombinedBoundingBox() {
    if (this.models.size === 0) return null;
    const box = new THREE.Box3();
    this.models.forEach((mesh) => {
      box.expandByObject(mesh);
    });
    return box;
  }

  setCamera(type) {
    if (type === 'orthographic') {
      this.activeCamera = this.orthoCamera;
    } else {
      this.activeCamera = this.perspectiveCamera;
    }
    this.controls.object = this.activeCamera;
    this.controls.update();
  }

  setOrthoView(direction) {
    if (this.models.size === 0) return;

    this.setCamera('orthographic');
    const box = this._getCombinedBoundingBox();
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const dist = maxDim * 2;

    const positions = {
      front:  [center.x, center.y, center.z + dist],
      back:   [center.x, center.y, center.z - dist],
      left:   [center.x - dist, center.y, center.z],
      right:  [center.x + dist, center.y, center.z],
      top:    [center.x, center.y + dist, center.z],
      bottom: [center.x, center.y - dist, center.z],
    };

    const ups = {
      front:  [0, 1, 0],
      back:   [0, 1, 0],
      left:   [0, 1, 0],
      right:  [0, 1, 0],
      top:    [0, 0, -1],
      bottom: [0, 0, 1],
    };

    const pos = positions[direction];
    const up = ups[direction];
    if (!pos) return;

    this.orthoCamera.position.set(...pos);
    this.orthoCamera.up.set(...up);
    this.controls.target.copy(center);
    this.orthoCamera.lookAt(center);
    this.controls.update();
  }

  getModelBoundingBox() {
    return this._getCombinedBoundingBox();
  }
}
