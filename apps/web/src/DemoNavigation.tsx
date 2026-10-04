import { ArrowUpRight } from 'lucide-react';

interface DemoNavigationProps {
  tab: 'workspace' | 'guide';
  onTabChange: (tab: 'workspace' | 'guide') => void;
}

export function DemoNavigation({ tab, onTabChange }: DemoNavigationProps) {
  return (
    <header className="demo-navigation">
      <a className="demo-brand" href="/" aria-label="OpsDesk home">
        <span className="brand-mark" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </span>
        <span>
          OpsDesk<small>By Joseph Haenel</small>
        </span>
      </a>
      <nav className="demo-nav-links" aria-label="Demo navigation">
        <button
          type="button"
          className={tab === 'workspace' ? 'active' : ''}
          aria-current={tab === 'workspace' ? 'page' : undefined}
          onClick={() => onTabChange('workspace')}
        >
          Try the demo
        </button>
        <button
          type="button"
          className={tab === 'guide' ? 'active' : ''}
          aria-current={tab === 'guide' ? 'page' : undefined}
          onClick={() => onTabChange('guide')}
        >
          About the project
        </button>
        <a href="https://github.com/josephhaenel/opsdesk" target="_blank" rel="noreferrer">
          Source <ArrowUpRight size={14} />
        </a>
      </nav>
    </header>
  );
}
