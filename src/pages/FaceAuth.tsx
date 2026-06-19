import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, UserPlus } from 'lucide-react';
import { useFaceRecognition } from '../contexts/FaceRecognitionContext';
import { useLoyaltyStore } from '../store/useLoyaltyStore';
import './FaceAuth.css';

export const FaceAuth: React.FC = () => {
  const navigate = useNavigate();
  const { scanState, stream } = useFaceRecognition();
  const { currentCustomer } = useLoyaltyStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [localState, setLocalState] = useState<'scanning' | 'recognized' | 'not-found'>('scanning');
  const [recognizedName, setRecognizedName] = useState('');

  // Attach shared stream to local video element for display
  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  // React to the global scan state
  useEffect(() => {
    if (scanState === 'recognized' && currentCustomer) {
      setRecognizedName(currentCustomer.name.split(' ')[0]);
      setLocalState('recognized');
      const t = setTimeout(() => navigate('/menu'), 1800);
      return () => clearTimeout(t);
    }
    if (scanState === 'not-found') {
      setLocalState('not-found');
    }
  }, [scanState, currentCustomer]);

  const ringColor =
    localState === 'recognized' ? '#22c55e' :
    localState === 'not-found'  ? '#f87b32' : '#ffffff44';

  return (
    <div className="face-auth">
      <motion.button
        className="face-auth-back"
        onClick={() => navigate('/menu')}
        whileTap={{ scale: 0.9 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
      >
        <X size={24} />
      </motion.button>

      <motion.div
        className="face-auth-title"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h2>Loyalty Login</h2>
        <p>Look into the camera to identify yourself</p>
      </motion.div>

      <motion.div
        className="camera-wrapper"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.15 }}
      >
        <video ref={videoRef} className="camera-video" muted playsInline autoPlay />

        <motion.div
          className="scan-ring"
          animate={{ borderColor: ringColor }}
          transition={{ duration: 0.4 }}
        />

        {localState === 'scanning' && (
          <motion.div
            className="scan-laser"
            animate={{ top: ['10%', '90%', '10%'] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}

        {(['tl', 'tr', 'bl', 'br'] as const).map(corner => (
          <div key={corner} className={`corner-mark corner-${corner}`}
            style={{ borderColor: ringColor }} />
        ))}
      </motion.div>

      <AnimatePresence mode="wait">
        {localState === 'scanning' && (
          <motion.div key="scanning" className="scan-status"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="status-dot scan-dot" />
            <span>Scanning for your profile…</span>
          </motion.div>
        )}

        {localState === 'recognized' && (
          <motion.div key="recognized" className="scan-status success"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <div className="status-dot success-dot" />
            <span>Welcome back, {recognizedName}! ✓</span>
          </motion.div>
        )}

        {localState === 'not-found' && (
          <motion.div key="not-found" className="scan-status not-found"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <p className="not-found-label">Profile not found</p>
            <div className="not-found-actions">
              <motion.button
                className="btn-primary"
                onClick={() => navigate('/menu')}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
              >
                Continue as Guest
              </motion.button>
              <motion.button
                className="btn-ghost"
                onClick={() => navigate('/enroll')}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
              >
                <UserPlus size={18} />
                Join Loyalty Program
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
