import * as faceapi from '@vladmandic/face-api';

// Models are bundled in /public/models so the kiosk doesn't depend on a CDN
// reachable over potentially-flaky café wifi. Falls back to the CDN if the
// local copy is somehow missing.
const LOCAL_MODEL_URL = '/models';
const CDN_MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';

// Match tuning. A bit looser than before (was 0.4) so enrolled members aren't
// missed; false positives are guarded separately by requiring 2 consecutive
// agreeing frames before greeting (see FaceRecognitionContext).
const MATCH_DISTANCE = 0.5;   // FaceMatcher threshold (distance > this → unknown)
const MIN_CONFIDENCE = 0.5;   // 1 - distance must be at least this

// A video frame is only usable once the element has decoded data and real
// dimensions — scanning before that yields false "no face" results.
function frameReady(v: HTMLVideoElement): boolean {
  return v.readyState >= 2 && v.videoWidth > 0 && v.videoHeight > 0;
}

class FaceRecognitionService {
  private modelsLoaded = false;
  private labeledDescriptors: faceapi.LabeledFaceDescriptors[] = [];
  private matcher: faceapi.FaceMatcher | null = null;

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

    // Build the matcher ONCE here instead of per-frame (was rebuilt every scan).
    this.matcher = this.labeledDescriptors.length > 0
      ? new faceapi.FaceMatcher(this.labeledDescriptors, MATCH_DISTANCE)
      : null;
  }

  // Scans a single frame. Returns null only when NO face is detected. When a
  // face IS present, returns its descriptor plus a match (or null match if the
  // face is unknown) — so callers can buffer unknown faces for later sign-up.
  async scanFace(
    video: HTMLVideoElement
  ): Promise<{ descriptor: number[]; match: { id: string; confidence: number } | null } | null> {
    if (!this.modelsLoaded) await this.loadModels();
    if (!frameReady(video)) return null;   // no decoded frame yet → don't waste a scan

    const detection = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) return null;

    const descriptor = Array.from(detection.descriptor);

    if (!this.matcher) return { descriptor, match: null };

    const best = this.matcher.findBestMatch(detection.descriptor);
    if (best.label === 'unknown') return { descriptor, match: null };

    const confidence = 1 - best.distance;
    if (confidence < MIN_CONFIDENCE) return { descriptor, match: null };

    return { descriptor, match: { id: best.label, confidence } }; // label === customer id
  }

  async captureDescriptor(video: HTMLVideoElement): Promise<number[] | null> {
    if (!this.modelsLoaded) await this.loadModels();
    if (!frameReady(video)) return null;

    const detection = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) return null;
    return Array.from(detection.descriptor);
  }
}

export const faceRecognition = new FaceRecognitionService();
