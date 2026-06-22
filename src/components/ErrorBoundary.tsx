import React from 'react';

interface State { hasError: boolean; }

// Unattended-kiosk safety net: if any screen throws, don't leave a dead white
// screen — show a friendly card and auto-reload back to the attract screen
// (a full reload clears any corrupt in-memory state).
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false };
  private timer?: number;

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error('Kiosk crashed, auto-recovering:', error, info);
    this.timer = window.setTimeout(() => window.location.assign('/'), 4000);
  }

  componentWillUnmount() {
    if (this.timer) clearTimeout(this.timer);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          position: 'fixed', inset: 0, zIndex: 99999,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 16,
          textAlign: 'center', padding: 32,
          background: 'var(--bg-color, #f7f9fa)', color: 'var(--text-main, #1d1d1f)',
          fontFamily: 'var(--font-primary, sans-serif)',
        }}
      >
        <div style={{ fontSize: '4rem' }}>☕</div>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
          One moment…
        </h1>
        <p style={{ color: 'var(--text-muted, #86868b)', fontSize: '1rem' }}>
          We’re getting things back on track.
        </p>
        <button
          onClick={() => window.location.assign('/')}
          style={{
            marginTop: 8, minHeight: 48, padding: '12px 28px',
            fontSize: '1rem', fontWeight: 700, color: '#fff',
            background: 'var(--primary-accent, #f87b32)',
            borderRadius: 9999, border: 'none',
          }}
        >
          Tap to restart
        </button>
      </div>
    );
  }
}
