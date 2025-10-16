'use client';

import { useEffect, useState } from 'react';

export function KeyboardHint() {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if user has seen the hint before
    const seen = localStorage.getItem('keyboard-hint-seen');
    if (seen) {
      setDismissed(true);
      return;
    }

    // Show hint after 3 seconds
    const timer = setTimeout(() => {
      setShow(true);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    setShow(false);
    setDismissed(true);
    localStorage.setItem('keyboard-hint-seen', 'true');
  };

  if (dismissed || !show) return null;

  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 animate-fade-in">
      <div className="bg-black/90 backdrop-blur-sm text-white px-4 py-3 rounded-lg shadow-lg border border-white/10 max-w-sm">
        <div className="flex items-center gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-sm">
              <div className="flex items-center gap-1">
                <kbd className="px-2 py-1 bg-white/10 rounded text-xs font-mono">↑</kbd>
                <kbd className="px-2 py-1 bg-white/10 rounded text-xs font-mono">↓</kbd>
              </div>
              <span className="text-gray-300">Navigate</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <kbd className="px-2 py-1 bg-white/10 rounded text-xs font-mono">Space</kbd>
              <span className="text-gray-300">Play/Pause</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <kbd className="px-2 py-1 bg-white/10 rounded text-xs font-mono">M</kbd>
              <span className="text-gray-300">Mute/Unmute</span>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="ml-auto p-1 hover:bg-white/10 rounded transition-colors"
            aria-label="Dismiss hint"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

