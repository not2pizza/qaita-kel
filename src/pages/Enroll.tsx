import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Camera } from 'lucide-react';
import { faceRecognition } from '../services/faceRecognition';
import { useLoyaltyStore } from '../store/useLoyaltyStore';
import { useFaceRecognition } from '../contexts/FaceRecognitionContext';
import { enrollCustomer } from '../lib/supabaseService';
import './Enroll.css';

type EnrollState = 'name' | 'camera' | 'capturing' | 'done' | 'error';

const CAPTURES_NEEDED = 5;

export const Enroll: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromAdmin = searchParams.get('from') === 'admin';

  const { stream, loyaltyConfig } = useFaceRecognition();  // shared camera stream + config
  const { addCustomer, setCurrentCustomer } = useLoyaltyStore();

  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<EnrollState>('name');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [capturedCount, setCapturedCount] = useState(0);
  const [countdown, setCountdown] = useState(0);

  // Attach the shared stream whenever the video element enters the DOM
  useEffect(() => {
    if ((state === 'camera' || state === 'capturing') && videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [state, stream, videoRef.current]);

  const handleStartCamera = () => {
    setState('camera');
  };

  const handleCapture = async () => {
    if (!videoRef.current || state === 'capturing') return;
    setState('capturing');

    const descriptors: number[][] = [];

    for (let i = 0; i < CAPTURES_NEEDED; i++) {
      setCountdown(CAPTURES_NEEDED - i);
      await new Promise(r => setTimeout(r, 700));
      const desc = await faceRecognition.captureDescriptor(videoRef.current!);
      if (desc) {
        descriptors.push(desc);
        setCapturedCount(descriptors.length);
      }
    }

    setCountdown(0);

    if (descriptors.length < 2) {
      setState('error');
      return;
    }

    const customer = await enrollCustomer(name.trim(), descriptors, {
      phone: phone.trim() || undefined,
      welcomeBonus: loyaltyConfig.welcomeBonus,
    });
    if (!customer) {
      setState('error');
      return;
    }

    addCustomer(customer);
    if (!fromAdmin) setCurrentCustomer(customer);
    setState('done');
    setTimeout(() => navigate(fromAdmin ? '/admin' : '/menu'), 1800);
  };

  const handleBack = () => navigate(fromAdmin ? '/admin' : '/');

  return (
    <div className="enroll-page">
      <motion.button className="enroll-back" onClick={handleBack} whileTap={{ scale: 0.9 }}>
        <X size={22} />
      </motion.button>

      <AnimatePresence mode="wait">
        {/* Step 1: Name */}
        {state === 'name' && (
          <motion.div key="name" className="enroll-step"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
            <div className="enroll-icon">👋</div>
            <h2>Join Antigravity Loyalty</h2>
            <p>Earn points, unlock deals — recognized in seconds next time.</p>
            <input
              className="name-input"
              type="text"
              placeholder="Your full name"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={40}
              autoFocus
            />
            <input
              className="name-input"
              type="tel"
              placeholder="Phone (optional)"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              maxLength={20}
            />
            <motion.button
              className="enroll-btn-primary"
              onClick={handleStartCamera}
              disabled={name.trim().length < 2}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
            >
              Next: Scan Face
            </motion.button>
          </motion.div>
        )}

        {/* Step 2: Camera */}
        {(state === 'camera' || state === 'capturing') && (
          <motion.div key="camera" className="enroll-step"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
            <h2>Face Scan</h2>
            <p>Look straight at the camera, then press Capture.</p>

            <div className="enroll-camera-wrapper">
              <video ref={videoRef} className="enroll-video" muted playsInline autoPlay />
              <div className="enroll-ring" />
              {state === 'capturing' && countdown > 0 && (
                <div className="capture-countdown">{countdown}</div>
              )}
            </div>

            <div className="capture-progress">
              {Array.from({ length: CAPTURES_NEEDED }).map((_, i) => (
                <div key={i} className={`capture-dot ${i < capturedCount ? 'filled' : ''}`} />
              ))}
            </div>

            <motion.button
              className="enroll-btn-primary"
              onClick={handleCapture}
              disabled={state === 'capturing'}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
            >
              <Camera size={20} />
              {state === 'capturing' ? `Capturing… ${capturedCount}/${CAPTURES_NEEDED}` : 'Capture Face'}
            </motion.button>
          </motion.div>
        )}

        {/* Done */}
        {state === 'done' && (
          <motion.div key="done" className="enroll-step"
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
            <div className="enroll-icon">🎉</div>
            <h2>You're in, {name}!</h2>
            <p>{loyaltyConfig.welcomeBonus} welcome points added to your account.</p>
          </motion.div>
        )}

        {/* Error */}
        {state === 'error' && (
          <motion.div key="error" className="enroll-step"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="enroll-icon">⚠️</div>
            <h2>Couldn't detect your face</h2>
            <p>Make sure your face is well-lit and centred in the frame.</p>
            <motion.button
              className="enroll-btn-primary"
              onClick={() => { setCapturedCount(0); setState('camera'); }}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
            >
              Try Again
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
