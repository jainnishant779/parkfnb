import { useTheme } from '../lib/theme';
import Icon from './Icon';

/** The light/dark switch: a round button showing a moon (or a sun when dark). The same one every ParkFNB page has. */
export default function ThemeToggle() {
  const [theme, toggle] = useTheme();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      className="pf-theme"
      onClick={toggle}
      aria-pressed={dark}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
    >
      <Icon name={dark ? 'sun' : 'moon'} />
    </button>
  );
}
