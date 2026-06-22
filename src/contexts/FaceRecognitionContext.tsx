import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
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
});

// How many distinct samples of an unknown visitor we keep for enrollment.
const MAX_CAPTURED_SAMPLES = 5;

export const useFaceRecognition = () => useContext(FaceRecognitionContext);

export const FaceRecognitionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { customers, setCustomers, setCurrentCustomer, currentCustomer } = useLoyaltyStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<number | null>(null);
  const notFoundTimerRef = useRef<number | null>(null);
  const customersRef = useRef(customers);
  const mountedRef = useRef(true);
  const recognizedRef = useRef(!!currentCustomer);

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

      // ── 3) Recognition loop (no-ops until a camera stream exists).
      intervalRef.current = window.setInterval(async () => {
        if (!videoRef.current || !streamRef.current || !mountedRef.current) return;
        if (recognizedRef.current) return;   // already recognised — pause scanning
        try {
          const result = await faceRecognition.scanFace(videoRef.current);
          if (!result) return; // no face in frame
          if (result.match) {
            const customer = customersRef.current.find(c => c.id === result.match!.id);
            if (customer) {
              recognizedRef.current = true; // guard immediately against re-fire
              clearCapturedFace();          // known visitor — drop any buffered face
              sound.recognize();
              setCurrentCustomer(customer);
              logRecognition({
                branchId: getBranchId(),
                customerId: customer.id,
                similarityScore: result.match.confidence,
                result: 'recognized',
              });
            }
          } else {
            // Unknown face present — quietly buffer it for sign-up at checkout.
            if (capturedFaceRef.current.length < MAX_CAPTURED_SAMPLES) {
              capturedFaceRef.current = [...capturedFaceRef.current, result.descriptor];
              setCapturedFace(capturedFaceRef.current);
            }
          }
        } catch {
          // ignore individual frame errors
        }
      }, 500);
    };

    init();

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (notFoundTimerRef.current) clearTimeout(notFoundTimerRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  return (
    <FaceRecognitionContext.Provider value={{ scanState, stream, products, loyaltyConfig, branchId, branch, kiosk, capturedFace, clearCapturedFace, captureNow }}>
      {/* Single hidden video element — shared across the whole app */}
      <video ref={videoRef} style={{ display: 'none' }} muted playsInline />
      {children}
    </FaceRecognitionContext.Provider>
  );
};
