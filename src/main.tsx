import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// ── ON-SCREEN KEYBOARD HANDLING ──────────────────────────────────────────────
// iOS Safari (and Android with resizes-visual) doesn't shrink the layout viewport
// when the keyboard opens, so bottom sheets and fields near the bottom end up behind
// it. Mirror the *visual* viewport into CSS variables that the stylesheet uses to
// pin modals above the keyboard and pad the scroll area, then scroll the focused
// field into view once the keyboard has finished animating in.
function trackVisualViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  const update = () => {
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    root.style.setProperty('--vv-top', `${vv.offsetTop}px`);
    root.style.setProperty('--vv-height', `${vv.height}px`);
    root.style.setProperty('--kb', `${kb}px`);
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  update();

  document.addEventListener('focusin', e => {
    const el = e.target as HTMLElement | null;
    if (!el || !el.matches('input, textarea, select')) return;
    // Fields inside a modal are already above the keyboard via --vv-*.
    if (el.closest('.set-modal-overlay')) return;
    setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 350);
  });
}
trackVisualViewport();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
