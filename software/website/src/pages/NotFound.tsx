import { ArrowRight, Home as HomeIcon } from 'lucide-react';
import { Button } from '../components/ui';
import { usePageMeta } from '../components/blocks';
import IsoCar from '../components/IsoCar';

export default function NotFound() {
  usePageMeta('Page not found');
  return (
    <section className="section" style={{ paddingTop: 40 }}>
      <div className="container not-found">
        <IsoCar tone="grey" className="iso" />
        <p className="code">404</p>
        <h1 className="h1">This bay is empty.</h1>
        <p className="lead">The page you were looking for has moved or never existed.</p>
        <div className="btn-row" style={{ justifyContent: 'center' }}>
          <Button to="/" icon={HomeIcon}>
            Back home
          </Button>
          <Button to="/faq" variant="white" iconRight={ArrowRight}>
            Browse the FAQ
          </Button>
        </div>
      </div>
    </section>
  );
}
