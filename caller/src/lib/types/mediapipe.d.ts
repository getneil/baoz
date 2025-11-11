declare module '@mediapipe/pose' {
  export class Pose {
    constructor(opts?: { locateFile?: (file: string) => string });
    setOptions(opts: Record<string, unknown>): void;
    onResults(cb: (results: any) => void): void;
    send(input: { image: HTMLVideoElement | HTMLCanvasElement | ImageBitmap }): Promise<void>;
    close?: () => void;
  }
  export const POSE_LANDMARKS: Record<string, number>;
  export type Results = any;
}

declare module '@mediapipe/camera_utils' {
  export class Camera {
    constructor(videoEl: HTMLVideoElement, opts: { onFrame: () => Promise<void> | void; width?: number; height?: number });
    start(): Promise<void>;
    stop(): void;
  }
}
