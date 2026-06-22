import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { faceRecognition } from '../services/faceRecognition';
import { useLoyaltyStore } from '../store/useLoyaltyStore';
import {
  fetchCustomers,
  logRecognition,
  fetchLoyaltyConfig,
  fetchProducts,
  type LoyaltyConfig,
} from '../lib/supabaseService';
import { loadBranch, loadBranchById, getBranchId, type Branch } from '../lib/branch';
import { registerKiosk, type Kiosk } from '../lib/kiosk';
import { FALLBACK_PRODUCTS, type Product } from '../data/products';
import { sound } from '../lib/sound';
import type { ScanState } from '../components/LoyaltyBanner';

const DEFAULT_CONFIG: LoyaltyConfig = {
  pointsEnabled: true,
  tiersEnabled: true,
  stampsEnabled: false,
  pointsPerDollar: 10,
  welcomeBonus: 50,
};

interface FaceRecognitionContextValue {
  scanState: ScanState;
  stream: MediaStream | null;
  products: Product[];
  loyaltyConfig: LoyaltyConfig;
  branchId: string | null;
  /** The active branch (name/address) this kiosk is attributed to. */
  branch: Branch | null;
  /** This physical device's fleet identity (code, label, branch binding). */
  kiosk: Kiosk | null;
  /** Face descriptors of the current unknown visitor, buffered in memory so
   *  sign-up at checkout needs only a phone + name (no separate face scan). */
  capturedFace: number[][];
  clearCapturedFace: () => void;
  /** Returns the buffered face, or grabs a fresh sample from the live camera if
   *  the buffer is empty (so registration never saves a member with no face). */
  captureNow: () => Promise<number[][]>;
  /** Pause/resume the recognition loop — e.g. while the sign-up modal captures,
   *  so only ONE face detector runs on the shared camera at a time. */
  pauseScanning: () => void;
  resumeScanning: () => void;
  /** Grab one fresh descriptor from the shared camera (used by sign-up). */
  captureSample: () => Promise<number[] | null>;
}

const FaceRecognitionContext = createContext<FaceRecognitionContextValue>({
  scanState: 'scanning',
  stream: null,
  products: FALLBACK_PRODUCTS,
  loyaltyConfig: DEFAULT_CONFIG,
  branchId: null,
  branch: null,
  kiosk: null,
  capturedFace: [],
  clearCapturedFace: () => {},
  captureNow: async () => [],
  pauseScanning: () => {},
  resumeScanning: () => {},
  captureSample: async () => null,
});

// How many distinct samples of an unknown visitor we keep for enrollment.
const MAX_CAPTURED_SAMPLES = 5;
// Delay between scans (re-armed AFTER each scan finishes, so no overlap).
const SCAN_INTERVAL_MS = 400;

export const useFaceRecognition = () => useContext(FaceRecognitionContext);

export const FaceRecognitionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { customers, setCustomers, setCurrentCustomer, currentCustomer } = useLoyaltyStore();
  const location = useLocation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<number | null>(null);
  const notFoundTimerRef = useRef<number | null>(null);
  const customersRef = useRef(customers);
  const mountedRef = useRef(true);
  const recognizedRef = useRef(!!currentCustomer);
  const scanPausedRef = useRef(false);
  // Recognition only matters on the attract screen + menu (to greet). Pause it
  // elsewhere (cart/admin/success/enroll) to save CPU on the kiosk.
  const routeScanPausedRef = useRef(false);
  // Requires N consecutive frames matching the same id before greeting — guards
  // against a single-frame false positive (greeting / charging the wrong person).
  const pendingMatchRef = useRef<{ id: string | null; count: number }>({ id: null, count: 0 });

  const [scanState, setScanState] = useState<ScanState>(
    currentCustomer ? 'recognized' : 'scanning'
  );
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [products, setProducts] = useState<Product[]>(FALLBACK_PRODUCTS);
  const [loyaltyConfig, setLoyaltyConfig] = useState<LoyaltyConfig>(DEFAULT_CONFIG);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [kiosk, setKiosk] = useState<Kiosk | null>(null);
  const [capturedFace, setCapturedFace] = useState<number[][]>([]);
  const capturedFaceRef = useRef<number[][]>([]);

  const clearCapturedFace = () => {
    capturedFaceRef.current = [];
    setCapturedFace([]);
  };

  // Used at sign-up: prefer the buffered samples, otherwise grab one live frame.
  const captureNow = async (): Promise<number[][]> => {
    if (capturedFaceRef.current.length > 0) return capturedFaceRef.current;
    if (!videoRef.current) return [];
    try {
      const d = await faceRecognition.captureDescriptor(videoRef.current);
      return d ? [d] : [];
    } catch {
      return [];
    }
  };

  // One fresh descriptor from the shared camera (the sign-up modal polls this
  // while the recognition loop is paused, so only one detector runs at a time).
  const captureSample = async (): Promise<number[] | null> => {
    if (!videoRef.current) return null;
    try {
      return await faceRecognition.captureDescriptor(videoRef.current);
    } catch {
      return null;
    }
  };

  const pauseScanning = () => { scanPausedRef.current = true; };
  const resumeScanning = () => {
    scanPausedRef.current = false;
    pendingMatchRef.current = { id: null, count: 0 };
  };

  // Only scan on the attract screen + menu; pause the loop elsewhere.
  useEffect(() => {
    const p = location.pathname;
    routeScanPausedRef.current = !(p === '/' || p === '/menu');
  }, [location.pathname]);

  // Keep descriptors in sync when new customers are enrolled
  useEffect(() => {
    customersRef.current = customers;
    if (customers.length > 0) {
      faceRecognition.loadCustomerDescriptors(customers);
    }
  }, [customers]);

  // React to recognition state changes from the store
  useEffect(() => {
    recognizedRef.current = !!currentCustomer;
    if (currentCustomer) {
      setScanState('recognized');
      if (notFoundTimerRef.current) clearTimeout(notFoundTimerRef.current);
    } else {
      // Customer cleared (e.g. after checkout) — reset for next person
      setScanState('scanning');
      startNotFoundTimer();
    }
  }, [currentCustomer?.id]);

  const startNotFoundTimer = () => {
    if (notFoundTimerRef.current) clearTimeout(notFoundTimerRef.current);
    notFoundTimerRef.current = window.setTimeout(() => {
      setScanState(prev => prev !== 'recognized' ? 'not-found' : prev);
      // Analytics: a real (buffered) face was present but never matched → log once.
      if (!recognizedRef.current && capturedFaceRef.current.length > 0) {
        logRecognition({ branchId: getBranchId(), customerId: null, similarityScore: 0, result: 'not_found' });
      }
    }, 10_000);
  };

  useEffect(() => {
    mountedRef.current = true;

    const init = async () => {
      // ── 1) App data — loaded independently of the camera. This warms the
      // Supabase connection and makes branch/config/menu/customers ready BEFORE
      // anyone can reach checkout, so first-visit sign-up isn't a cold-start race.
      // Resolve the default branch, then this device's kiosk identity. A kiosk
      // bound to a different branch (by the admin) overrides the default.
      const defaultBranch = await loadBranch();
      const kioskInfo = await registerKiosk(defaultBranch?.id ?? null);
      let activeBranch = defaultBranch;
      if (kioskInfo.branchId && kioskInfo.branchId !== defaultBranch?.id) {
        activeBranch = (await loadBranchById(kioskInfo.branchId)) ?? defaultBranch;
      }
      if (mountedRef.current) {
        setBranchId(activeBranch?.id ?? null);
        setBranch(activeBranch);
        setKiosk(kioskInfo);
      }

      const [, loadedCustomers, config] = await Promise.all([
        faceRecognition.loadModels(),
        fetchCustomers(),
        fetchLoyaltyConfig(),     // also pushes tiers into the store
      ]);

      if (!mountedRef.current) return;
      setCustomers(loadedCustomers);
      customersRef.current = loadedCustomers;
      faceRecognition.loadCustomerDescriptors(loadedCustomers);
      setLoyaltyConfig(config);

      if (activeBranch) {
        const menu = await fetchProducts(activeBranch.id);
        if (mountedRef.current && menu.length > 0) setProducts(menu);
      }

      if (!currentCustomer) startNotFoundTimer();

      // ── 2) Camera — may prompt for permission; if it fails, recognition is
      // off but browsing/ordering/sign-up still work.
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
        if (!mountedRef.current) { s.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = s;
        setStream(s);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          await videoRef.current.play().catch(() => {});
        }
      } catch {
        // No camera access — leave scanState to the not-found timer.
      }

      // ── 3) Recognition loop — SELF-SCHEDULING (re-arms only after each scan
      // finishes) so heavy scans can't pile up and starve the TF backend, which
      // was a big cause of "recognises me sometimes" on iPad. No-ops (but keeps
      // re-arming) until a camera stream exists or while paused for sign-up.
      const scanLoop = async () => {
        if (!mountedRef.current) return;
        const v = videoRef.current;
        if (v && streamRef.current && !recognizedRef.current && !scanPausedRef.current && !routeScanPausedRef.current) {
          try {
            const result = await faceRecognition.scanFace(v);
            if (result?.match) {
              // Same id as last frame? grow the streak; else restart it.
              const id = result.match.id;
              const pm = pendingMatchRef.current;
              pendingMatchRef.current = pm.id === id ? { id, count: pm.count + 1 } : { id, count: 1 };

              if (pendingMatchRef.current.count >= 2) {   // confirmed over 2 frames
                const customer = customersRef.current.find(c => c.id === id);
                if (customer) {
                  recognizedRef.current = true;   // guard against re-fire
                  pendingMatchRef.current = { id: null, count: 0 };
                  clearCapturedFace();            // known visitor — drop buffered face
                  sound.recognize();
                  setCurrentCustomer(customer);
                  logRecognition({
                    branchId: getBranchId(),
                    customerId: customer.id,
                    similarityScore: result.match.confidence,
                    result: 'recognized',
                  });
                }
              }
            } else if (result) {
              // Face present but unknown — reset the streak, buffer for sign-up.
              pendingMatchRef.current = { id: null, count: 0 };
              if (capturedFaceRef.current.length < MAX_CAPTURED_SAMPLES) {
                capturedFaceRef.current = [...capturedFaceRef.current, result.descriptor];
                setCapturedFace(capturedFaceRef.current);
              }
            } else {
              pendingMatchRef.current = { id: null, count: 0 };   // no face → reset streak
            }
          } catch {
            // ignore individual frame errors
          }
        }
        if (mountedRef.current) intervalRef.current = window.setTimeout(scanLoop, SCAN_INTERVAL_MS);
      };
      scanLoop();
    };

    init();

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearTimeout(intervalRef.current);   // self-scheduled via setTimeout now
      if (notFoundTimerRef.current) clearTimeout(notFoundTimerRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  return (
    <FaceRecognitionContext.Provider value={{ scanState, stream, products, loyaltyConfig, branchId, branch, kiosk, capturedFace, clearCapturedFace, captureNow, pauseScanning, resumeScanning, captureSample }}>
      {/* Single shared camera element. Kept RENDERED but visually hidden (1px,
          off-screen) — NOT display:none, because iOS Safari stops decoding
          frames for display:none/hidden video, which broke recognition. */}
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        aria-hidden="true"
        style={{ position: 'fixed', top: 0, left: 0, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
      />
      {children}
    </FaceRecognitionContext.Provider>
  );
};
