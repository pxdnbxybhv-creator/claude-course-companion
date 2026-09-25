// The last step of every frame: the scene drawn to the screen, optionally through a colour grade
// (warmth, saturation, a paper-like vignette). The world calls grade.render() instead of
// renderer.render(); a grade that is not worth its cost on a device just renders straight.
import * as THREE from 'three';

export interface Grade {
  /** Draw the scene to the screen (through the grade, if any). */
  render(scene: THREE.Scene, camera: THREE.Camera): void;
  /** The canvas size changed (CSS pixels; the renderer's pixel ratio applies). */
  setSize(w: number, h: number): void;
  /** Night 0..1 and a warm tint of the hour, from the sky each frame. */
  setLight(o: { night: number; tint: THREE.Color }): void;
  dispose(): void;
}

/** For now: straight to the screen. */
export function createGrade(renderer: THREE.WebGLRenderer, _o: { lowEnd: boolean; reduced: boolean }): Grade {
  return {
    render: (scene, camera) => renderer.render(scene, camera),
    setSize: () => {},
    setLight: () => {},
    dispose: () => {},
  };
}
