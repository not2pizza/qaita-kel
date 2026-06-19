import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ScanFace, Shuffle, ArrowRight, Sparkles, Check } from 'lucide-react';
import { findCustomerByPhone, addFaceProfile, enrollCustomer, getLastEnrollError } from '../lib/supabaseService';
import { useFaceRecognition } from '../contexts/FaceRecognitionContext';
import { useLanguage } from '../i18n/LanguageProvider';
import { faceRecognition } from '../services/faceRecognition';
import { pickRandomName } from '../data/names';
import { sound } from '../lib/sound';
import type { LoyaltyCustomer } from '../store/useLoyaltyStore';
import './RegistrationModal.css';

interface Props {
  open: boolean;
  capturedFace: number[][];     // head-start samples buffered while browsing
  captureNow: () => Promise<number[][]>;  // single-frame fallback
  welcomeBonus: number;
  onComplete: (customer: LoyaltyCustomer) => void;  // registered / matched
  onSkip: () => void;                                // order anonymously
}

type Step = 'phone' | 'name';

const TARGET_SAMPLES = 8;   // keep scanning up to this many while the modal is open

export const RegistrationModal: React.FC<Props> = ({
  open, capturedFace, captureNow, welcomeBonus, onComplete, onSkip,
}) => {
  const { stream } = useFaceRecognition();
  const { t } = useLanguage();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sampleCount, setSampleCount] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const samplesRef = useRef<number[][]>([]);

  // While the modal is open, actively scan the visitor's face from the live
  // camera (they're looking right at the kiosk as they type their number). This
  // is far more reliable than the passive background buffer.
  useEffect(() => {
    if (!open) {
      samplesRef.current = [];
      setSampleCount(0);
      return;
    }

    // Seed with whatever was already buffered while they browsed.
    samplesRef.current = capturedFace.length > 0 ? [...capturedFace] : [];
    setSampleCount(samplesRef.current.length);

    const v = videoRef.current;
    if (v && stream) {
      v.srcObject = stream;
      v.play().catch(() => {});
    }

    let alive = true;
    const id = window.setInterval(async () => {
      if (!alive || !videoRef.current) return;
      if (samplesRef.current.length >= TARGET_SAMPLES) return;
      try {
        const d = await faceRecognition.captureDescriptor(videoRef.current);
        if (d && alive) {
          samplesRef.current = [...samplesRef.current, d];
          setSampleCount(samplesRef.current.length);
        }
      } catch { /* ignore individual frames */ }
    }, 500);

    return () => { alive = false; clearInterval(id); };
  }, [open, stream]);

  const reset = () => { setStep('phone'); setPhone(''); setName(''); setBusy(false); setError(''); };

  // Best available face: live samples → browsing buffer → one last live grab.
  const collectFace = async (): Promise<number[][]> => {
    if (samplesRef.current.length > 0) return samplesRef.current;
    if (capturedFace.length > 0) return capturedFace;
    return captureNow();
  };

  const handlePhoneNext = async () => {
    if (busy || phone.trim().length < 5) return;
    setBusy(true);
    sound.tap();

    // Returning member who wasn't recognised? Link this fresh face to them.
    const existing = await findCustomerByPhone(phone.trim());
    if (existing) {
      const face = await collectFace();
      if (face.length > 0) await addFaceProfile(existing.id, face);
      reset();
      onComplete(existing);
      return;
    }

    // New member — collect a name next (face keeps scanning meanwhile).
    setBusy(false);
    setStep('name');
  };

  const handleFinish = async () => {
    if (busy) return;
    const finalName = name.trim() || pickRandomName();
    setBusy(true);
    setError('');
    const face = await collectFace();
    const customer = await enrollCustomer(finalName, face, {
      phone: phone.trim() || undefined,
      welcomeBonus,
    });
    if (customer) {
      reset();
      sound.recognize();
      onComplete(customer);
    } else {
      // Don't silently complete an anonymous order — let them retry.
      setBusy(false);
      setError(t('reg.couldntRegister', { err: getLastEnrollError() || 'unknown error' }));
    }
  };

  const handleSkip = () => { reset(); onSkip(); };

  const faceReady = sampleCount > 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="reg-backdrop"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          {/* Hidden capture surface — bound to the shared camera stream. */}
          <video ref={videoRef} style={{ display: 'none' }} muted playsInline autoPlay />

          <motion.div
            className="reg-modal liquid-glass"
            initial={{ y: 60, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 60, opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
          >
            <AnimatePresence mode="wait">
              {step === 'phone' ? (
                <motion.div key="phone" className="reg-step"
                  initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  <div className={`reg-face-badge ${faceReady ? 'ready' : 'scanning'}`}>
                    <ScanFace size={30} />
                    {faceReady && <span className="reg-face-dot" />}
                  </div>
                  <h2 className="reg-title">{t('reg.title')}</h2>
                  <p className="reg-sub">
                    {faceReady ? t('reg.subReady') : t('reg.subScanning')}
                  </p>

                  <div className={`reg-scan-status ${faceReady ? 'ok' : ''}`}>
                    {faceReady ? <><Check size={14} /> {t('reg.faceCaptured')}</> : t('reg.scanning')}
                  </div>

                  <input
                    className="reg-input"
                    type="tel"
                    inputMode="tel"
                    placeholder={t('reg.phonePlaceholder')}
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    maxLength={20}
                    autoFocus
                  />

                  <button className="reg-btn-primary" disabled={busy || phone.trim().length < 5} onClick={handlePhoneNext}>
                    {busy ? t('reg.checking') : <>{t('reg.continue')} <ArrowRight size={18} /></>}
                  </button>
                  <button className="reg-btn-ghost" disabled={busy} onClick={handleSkip}>
                    {t('reg.skip')}
                  </button>
                </motion.div>
              ) : (
                <motion.div key="name" className="reg-step"
                  initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  <div className="reg-face-badge ready"><Sparkles size={30} /></div>
                  <h2 className="reg-title">{t('reg.namePrompt')}</h2>
                  <p className="reg-sub">{t('reg.welcomePoints', { n: welcomeBonus })}</p>

                  <input
                    className="reg-input"
                    type="text"
                    placeholder={t('reg.namePlaceholder')}
                    value={name}
                    onChange={e => setName(e.target.value)}
                    maxLength={40}
                    autoFocus
                  />
                  <button className="reg-btn-surprise" type="button" onClick={() => { sound.tap(); setName(pickRandomName(name)); }}>
                    <Shuffle size={16} /> {t('reg.surpriseMe')}
                  </button>

                  <button className="reg-btn-primary" disabled={busy} onClick={handleFinish}>
                    {busy ? t('reg.creating') : <>{t('reg.finish')} <ArrowRight size={18} /></>}
                  </button>
                  {error && <span className="reg-error">{error}</span>}
                  <button className="reg-btn-ghost" disabled={busy} onClick={handleSkip}>
                    {t('reg.skip')}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
