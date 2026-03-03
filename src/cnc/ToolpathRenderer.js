import * as THREE from 'three';
import { gcodeToThree } from './GCodeParser.js';

export class ToolpathRenderer {
  constructor(scene) {
    this.scene = scene;
    this.rapidLines = null;
    this.cutLines = null;
    this.moves = null;
    this.moveVertexOffsets = []; // index into cut/rapid vertex arrays per move
    this.rapidsVisible = true;
  }

  /**
   * Load parsed toolpath moves and build Three.js line geometry.
   * @param {Array} moves - Array of move objects from GCodeParser
   * @param {{ min: number, max: number }} feedRange - feedrate range for color mapping
   */
  loadToolpath(moves, feedRange) {
    this.clear();
    this.moves = moves;

    const rapidPositions = [];
    const cutPositions = [];
    const cutColors = [];

    // Track vertex offsets for each move (for progressive reveal)
    // Each move maps to: { type: 'rapid'|'cut', startVertex, endVertex }
    this.moveVertexOffsets = [];

    let rapidVertexCount = 0;
    let cutVertexCount = 0;

    for (const move of moves) {
      const from = gcodeToThree(move.from.x, move.from.y, move.from.z);
      const to = gcodeToThree(move.to.x, move.to.y, move.to.z);

      if (move.type === 'rapid') {
        this.moveVertexOffsets.push({
          type: 'rapid',
          startVertex: rapidVertexCount,
          vertexCount: 2,
        });
        rapidPositions.push(from.x, from.y, from.z, to.x, to.y, to.z);
        rapidVertexCount += 2;
      } else {
        // Color based on feedrate: blue (slow) → red (fast)
        const t = feedRange.max > feedRange.min
          ? (move.feedrate - feedRange.min) / (feedRange.max - feedRange.min)
          : 0.5;
        const color = new THREE.Color();
        color.setHSL(0.66 - t * 0.66, 1.0, 0.5); // blue(0.66) to red(0.0)

        this.moveVertexOffsets.push({
          type: 'cut',
          startVertex: cutVertexCount,
          vertexCount: 2,
        });
        cutPositions.push(from.x, from.y, from.z, to.x, to.y, to.z);
        cutColors.push(color.r, color.g, color.b, color.r, color.g, color.b);
        cutVertexCount += 2;
      }
    }

    // Create rapid lines (gray dashed)
    if (rapidPositions.length > 0) {
      const rapidGeom = new THREE.BufferGeometry();
      rapidGeom.setAttribute('position', new THREE.Float32BufferAttribute(rapidPositions, 3));
      const rapidMat = new THREE.LineDashedMaterial({
        color: 0x888888,
        dashSize: 2,
        gapSize: 1,
        linewidth: 1,
      });
      this.rapidLines = new THREE.LineSegments(rapidGeom, rapidMat);
      this.rapidLines.computeLineDistances();
      this.scene.add(this.rapidLines);
    }

    // Create cut lines (vertex-colored)
    if (cutPositions.length > 0) {
      const cutGeom = new THREE.BufferGeometry();
      cutGeom.setAttribute('position', new THREE.Float32BufferAttribute(cutPositions, 3));
      cutGeom.setAttribute('color', new THREE.Float32BufferAttribute(cutColors, 3));
      const cutMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        linewidth: 1,
      });
      this.cutLines = new THREE.LineSegments(cutGeom, cutMat);
      this.scene.add(this.cutLines);
    }
  }

  /**
   * Show toolpath up to the given move index (0-based, inclusive).
   * O(1) per frame using drawRange.
   */
  showUpToMove(index) {
    if (!this.moves) return;

    const clampedIndex = Math.min(index, this.moves.length - 1);

    let maxRapidVertex = 0;
    let maxCutVertex = 0;

    for (let i = 0; i <= clampedIndex; i++) {
      const offset = this.moveVertexOffsets[i];
      if (offset.type === 'rapid') {
        maxRapidVertex = offset.startVertex + offset.vertexCount;
      } else {
        maxCutVertex = offset.startVertex + offset.vertexCount;
      }
    }

    if (this.rapidLines) {
      this.rapidLines.geometry.setDrawRange(0, this.rapidsVisible ? maxRapidVertex : 0);
    }
    if (this.cutLines) {
      this.cutLines.geometry.setDrawRange(0, maxCutVertex);
    }
  }

  /**
   * Show all moves.
   */
  showAll() {
    if (this.rapidLines) {
      const count = this.rapidLines.geometry.attributes.position.count;
      this.rapidLines.geometry.setDrawRange(0, this.rapidsVisible ? count : 0);
    }
    if (this.cutLines) {
      const count = this.cutLines.geometry.attributes.position.count;
      this.cutLines.geometry.setDrawRange(0, count);
    }
  }

  /**
   * Toggle rapid move visibility.
   */
  setRapidsVisible(visible) {
    this.rapidsVisible = visible;
    if (this.rapidLines) {
      this.rapidLines.visible = visible;
    }
  }

  /**
   * Remove all toolpath geometry from scene.
   */
  clear() {
    if (this.rapidLines) {
      this.scene.remove(this.rapidLines);
      this.rapidLines.geometry.dispose();
      this.rapidLines.material.dispose();
      this.rapidLines = null;
    }
    if (this.cutLines) {
      this.scene.remove(this.cutLines);
      this.cutLines.geometry.dispose();
      this.cutLines.material.dispose();
      this.cutLines = null;
    }
    this.moves = null;
    this.moveVertexOffsets = [];
  }
}
