import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, UserPlus, Star, Search, Plus, Minus, Trash2, ScanFace, Calendar, Monitor, Save, Check } from 'lucide-react';
import { useLoyaltyStore, getTier, type LoyaltyCustomer } from '../store/useLoyaltyStore';
import { fetchCustomers, adjustPoints, deactivateCustomer } from '../lib/supabaseService';
import { useFaceRecognition } from '../contexts/FaceRecognitionContext';
import { fetchBranches, type Branch } from '../lib/branch';
import { updateKiosk } from '../lib/kiosk';
import './Admin.css';

const TIER_COLOR: Record<string, string> = {
  Bronze: '#cd7f32',
  Silver: '#a8a9ad',
  Gold: '#ffd700',
};

export const Admin: React.FC = () => {
  const navigate = useNavigate();
  const { customers, setCustomers, updateCustomerPoints, removeCustomer } = useLoyaltyStore();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchCustomers().then(setCustomers);
  }, []);

  const filtered = useMemo(
    () => customers.filter(c => c.name.toLowerCase().includes(query.trim().toLowerCase())),
    [customers, query]
  );

  const selected = customers.find(c => c.id === selectedId) ?? null;

  const tierCounts = useMemo(() => {
    const counts = { Gold: 0, Silver: 0, Bronze: 0 };
    customers.forEach(c => { counts[getTier(c.points)]++; });
    return counts;
  }, [customers]);

  const handleAdjust = async (delta: number) => {
    if (!selected || busy) return;
    setBusy(true);
    const newTotal = await adjustPoints(selected.id, delta);
    if (newTotal != null) updateCustomerPoints(selected.id, newTotal);
    setBusy(false);
  };

  const handleDeactivate = async () => {
    if (!selected || busy) return;
    if (!window.confirm(`Deactivate ${selected.name}? They'll need to re-enroll to be recognized again.`)) return;
    setBusy(true);
    const ok = await deactivateCustomer(selected.id);
    if (ok) {
      removeCustomer(selected.id);
      setSelectedId(null);
    }
    setBusy(false);
  };

  return (
    <div className="admin-page">
      <div className="admin-console">
        {/* Top bar with live stats */}
        <header className="admin-topbar">
          <div className="admin-titles">
            <h2 className="admin-title">Admin Console</h2>
            <p className="admin-subtitle">Loyalty member management</p>
          </div>

          <div className="admin-stats">
            <Stat label="Members" value={customers.length} />
            <Stat label="Gold" value={tierCounts.Gold} color={TIER_COLOR.Gold} />
            <Stat label="Silver" value={tierCounts.Silver} color={TIER_COLOR.Silver} />
            <Stat label="Bronze" value={tierCounts.Bronze} color={TIER_COLOR.Bronze} />
          </div>

          <motion.button className="admin-close" onClick={() => navigate('/menu')} whileTap={{ scale: 0.9 }}>
            <X size={20} />
          </motion.button>
        </header>

        <KioskBindCard />

        <div className="admin-body">
          {/* Left: searchable member list */}
          <aside className="admin-list-pane">
            <div className="admin-search">
              <Search size={18} />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search members…"
                className="admin-search-input"
              />
            </div>

            <div className="admin-members">
              {filtered.length === 0 ? (
                <div className="admin-empty">
                  <p>{customers.length === 0 ? 'No members enrolled yet.' : 'No matches.'}</p>
                </div>
              ) : (
                filtered.map((c, i) => (
                  <MemberRow
                    key={c.id}
                    customer={c}
                    index={i}
                    active={c.id === selectedId}
                    onClick={() => setSelectedId(c.id)}
                  />
                ))
              )}
            </div>

            <motion.button
              className="admin-enroll-btn"
              onClick={() => navigate('/enroll?from=admin')}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              <UserPlus size={20} />
              Enroll New Member
            </motion.button>
          </aside>

          {/* Right: member detail */}
          <section className="admin-detail-pane">
            <AnimatePresence mode="wait">
              {selected ? (
                <MemberDetail
                  key={selected.id}
                  customer={selected}
                  busy={busy}
                  onAdjust={handleAdjust}
                  onDeactivate={handleDeactivate}
                />
              ) : (
                <motion.div
                  key="empty"
                  className="admin-detail-empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <ScanFace size={48} strokeWidth={1.4} />
                  <p>Select a member to view details</p>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        </div>
      </div>
    </div>
  );
};

// This device's fleet identity + branch binding. A manager opens the hidden
// admin on the kiosk itself and assigns it here (stopgap until the owner panel).
const KioskBindCard: React.FC = () => {
  const { kiosk, branch } = useFaceRecognition();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState('');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { fetchBranches().then(setBranches); }, []);
  useEffect(() => {
    setBranchId(kiosk?.branchId ?? branch?.id ?? '');
    setLabel(kiosk?.label ?? '');
  }, [kiosk?.id, kiosk?.branchId, kiosk?.label, branch?.id]);

  if (!kiosk) return null;

  const canManage = !kiosk.local && !!kiosk.id;

  const save = async () => {
    if (!canManage || saving) return;
    setSaving(true);
    const ok = await updateKiosk(kiosk.id, { branchId: branchId || null, label: label.trim() || null });
    setSaving(false);
    if (ok) { setSaved(true); setTimeout(() => setSaved(false), 2000); }
  };

  return (
    <div className="kiosk-card">
      <div className="kiosk-card-id">
        <Monitor size={22} />
        <div className="kiosk-card-id-text">
          <span className="kiosk-card-code">{kiosk.code}</span>
          <span className="kiosk-card-device">device {kiosk.deviceId.slice(0, 8)}</span>
        </div>
      </div>

      {canManage ? (
        <div className="kiosk-card-fields">
          <label className="kiosk-field">
            <span>Label</span>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Front counter" maxLength={40} />
          </label>
          <label className="kiosk-field">
            <span>Branch</span>
            <select value={branchId} onChange={e => setBranchId(e.target.value)}>
              <option value="">— Unassigned —</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <button className="kiosk-save" onClick={save} disabled={saving}>
            {saved ? <><Check size={16} /> Saved</> : <><Save size={16} /> {saving ? 'Saving…' : 'Save'}</>}
          </button>
        </div>
      ) : (
        <p className="kiosk-card-note">Run the kiosks migration (0003) in Supabase to bind this device to a branch.</p>
      )}
    </div>
  );
};

const Stat: React.FC<{ label: string; value: number; color?: string }> = ({ label, value, color }) => (
  <div className="admin-stat">
    <span className="admin-stat-value" style={color ? { color } : undefined}>{value}</span>
    <span className="admin-stat-label">{label}</span>
  </div>
);

const MemberRow: React.FC<{
  customer: LoyaltyCustomer;
  index: number;
  active: boolean;
  onClick: () => void;
}> = ({ customer, index, active, onClick }) => {
  const tier = getTier(customer.points);
  const initials = customer.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <motion.button
      className={`member-row ${active ? 'active' : ''}`}
      onClick={onClick}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
    >
      <div className="member-avatar" style={{ borderColor: TIER_COLOR[tier] }}>
        <span>{initials}</span>
      </div>
      <div className="member-info">
        <p className="member-name">{customer.name}</p>
        <p className="member-points-line">
          <Star size={11} /> {customer.points} pts
        </p>
      </div>
      <span className="member-tier-dot" style={{ background: TIER_COLOR[tier] }} />
    </motion.button>
  );
};

const MemberDetail: React.FC<{
  customer: LoyaltyCustomer;
  busy: boolean;
  onAdjust: (delta: number) => void;
  onDeactivate: () => void;
}> = ({ customer, busy, onAdjust, onDeactivate }) => {
  const tier = getTier(customer.points);
  const color = TIER_COLOR[tier];
  const initials = customer.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const faceCount = customer.faceDescriptors?.length ?? 0;

  return (
    <motion.div
      className="detail-card"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="detail-header">
        <div
          className="detail-avatar"
          style={{ background: `linear-gradient(135deg, ${color}55, ${color}22)`, borderColor: color }}
        >
          <span>{initials}</span>
        </div>
        <div>
          <h3 className="detail-name">{customer.name}</h3>
          <span className="detail-tier" style={{ color, borderColor: `${color}55` }}>{tier} Member</span>
        </div>
      </div>

      <div className="detail-meta">
        <div className="detail-meta-item">
          <Calendar size={15} />
          Joined {new Date(customer.joinedAt).toLocaleDateString()}
        </div>
        <div className="detail-meta-item">
          <ScanFace size={15} />
          {faceCount > 0 ? `${faceCount} face sample${faceCount > 1 ? 's' : ''}` : 'No face profile'}
        </div>
      </div>

      <div className="detail-points">
        <span className="detail-points-value">{customer.points.toLocaleString()}</span>
        <span className="detail-points-label">points</span>
      </div>

      <div className="detail-adjust">
        <span className="detail-adjust-label">Adjust points</span>
        <div className="detail-adjust-row">
          <button className="adjust-btn minus" disabled={busy} onClick={() => onAdjust(-50)}>
            <Minus size={14} /> 50
          </button>
          <button className="adjust-btn minus" disabled={busy} onClick={() => onAdjust(-10)}>
            <Minus size={14} /> 10
          </button>
          <button className="adjust-btn plus" disabled={busy} onClick={() => onAdjust(10)}>
            <Plus size={14} /> 10
          </button>
          <button className="adjust-btn plus" disabled={busy} onClick={() => onAdjust(50)}>
            <Plus size={14} /> 50
          </button>
        </div>
      </div>

      <button className="detail-deactivate" disabled={busy} onClick={onDeactivate}>
        <Trash2 size={16} /> Deactivate member
      </button>
    </motion.div>
  );
};
