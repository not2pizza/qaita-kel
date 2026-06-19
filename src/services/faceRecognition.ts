import * as faceapi from '@vladmandic/face-api';

// Models are bundled in /public/models so the kiosk doesn't depend on a CDN
// reachable over potentially-flaky café wifi. Falls back to the CDN if the
// local copy is somehow missing.
const LOCAL_MODEL_URL = '/models';
const CDN_MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';

class FaceRecognitionService {
  private modelsLoaded = false;
  private labeledDescriptors: faceapi.LabeledFaceDescriptors[] = [];

  private async loadFrom(url: string) {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(url),
      faceapi.nets.faceLandmark68Net.loadFromUri(url),
      faceapi.nets.faceRecognitionNet.loadFromUri(url),
    ]);
  }

  async loadModels() {
    if (this.modelsLoaded) return;
    try {
      await this.loadFrom(LOCAL_MODEL_URL);
    } catch (e) {
      console.warn('Local face models failed to load, falling back to CDN.', e);
      await this.loadFrom(CDN_MODEL_URL);
    }
    this.modelsLoaded = true;
  }

  loadCustomerDescriptors(customers: Array<{ id: string; faceDescriptors: number[][] }>) {
    this.labeledDescriptors = customers
      .filter(c => c.faceDescriptors.length > 0)
      .map(c => new faceapi.LabeledFaceDescriptors(
        c.id,
        c.faceDescriptors
          .filter(d => Array.isArray(d) && d.length === 128)
          .map(d => new Float32Array(d))
      ))
      .filter(ld => ld.descriptors.length > 0);
  }

  // Scans a single frame. Returns null only when NO face is detected. When a
  // face IS present, returns its descriptor plus a match (or null match if the
  // face is unknown) — so callers can buffer unknown faces for later sign-up.
  async scanFace(
    video: HTMLVideoElement
  ): Promise<{ descriptor: number[]; match: { id: string; confidence: number } | null } | null> {
    if (!this.modelsLoaded) await this.loadModels();

    const detection = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) return null;

    const descriptor = Array.from(detection.descriptor);

    if (this.labeledDescriptors.length === 0) return { descriptor, match: null };

    const matcher = new faceapi.FaceMatcher(this.labeledDescriptors, 0.42);
    const best = matcher.findBestMatch(detection.descriptor);

    if (best.label === 'unknown') return { descriptor, match: null };

    const confidence = 1 - best.distance;
    if (confidence < 0.6) return { descriptor, match: null };

    return { descriptor, match: { id: best.label, confidence } }; // label === customer id
  }

  async captureDescriptor(video: HTMLVideoElement): Promise<number[] | null> {
    if (!this.modelsLoaded) await this.loadModels();

    const detection = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) return null;
    return Array.from(detection.descriptor);
  }
}

export const faceRecognition = new FaceRecognitionService();
