import type { ReactNode } from 'react';
import Icon from './Icon';
import ThemeToggle from './ThemeToggle';

/** The card sign-in, onboarding and full-page messages sit in: the operator console's sign-in look (logo, wordmark, theme switch). */
export default function AuthFrame({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="auth">
      <main className="auth-box" style={wide ? { maxWidth: 720 } : undefined}>
        <div className="auth-top">
          <div className="logo" aria-hidden="true"><Icon name="pin" /></div>
          <div><b>parkfnb<i>.</i></b><small>Owner dashboard</small></div>
          <ThemeToggle />
        </div>
        {children}
      </main>
    </div>
  );
}
