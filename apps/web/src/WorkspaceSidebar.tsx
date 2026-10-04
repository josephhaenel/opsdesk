import {
  ArrowUpRight,
  CheckCircle2,
  CircleHelp,
  LayoutDashboard,
  Plus,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import type { Workflow } from './types';

interface WorkspaceSidebarProps {
  tab: 'workspace' | 'guide';
  workflows: Workflow[];
  currentWorkflowId: string | undefined;
  reviewCount: number;
  hasSession: boolean;
  isWorking: boolean;
  busy: string | null;
  resetPrompt: boolean;
  onTabChange: (tab: 'workspace' | 'guide') => void;
  onOpenWorkflow: (id: string) => void;
  onNewReport: () => void;
  onResetPromptChange: (open: boolean) => void;
  onResetSandbox: () => void;
}

export function WorkspaceSidebar({
  tab,
  workflows,
  currentWorkflowId,
  reviewCount,
  hasSession,
  isWorking,
  busy,
  resetPrompt,
  onTabChange,
  onOpenWorkflow,
  onNewReport,
  onResetPromptChange,
  onResetSandbox,
}: WorkspaceSidebarProps) {
  return (
    <aside className="sidebar" aria-label="Primary navigation">
      <a className="brand" href="/" aria-label="OpsDesk home">
        <span className="brand-mark">
          <span />
          <span />
          <span />
          <span />
        </span>
        <span>
          OpsDesk<span className="brand-subtitle">SUPPORT OPERATIONS</span>
        </span>
      </a>
      <div className="workspace-label">
        <span className="company-mark">A</span>
        <div>
          Alder Distribution<span>Demo workspace</span>
        </div>
      </div>
      <nav className="main-nav">
        <button
          type="button"
          className={tab === 'workspace' ? 'active' : ''}
          aria-current={tab === 'workspace' ? 'page' : undefined}
          onClick={() => onTabChange('workspace')}
        >
          <LayoutDashboard size={18} />
          Workspace{reviewCount ? <span className="nav-count">{reviewCount}</span> : null}
        </button>
        <button
          type="button"
          className={tab === 'guide' ? 'active' : ''}
          aria-current={tab === 'guide' ? 'page' : undefined}
          onClick={() => onTabChange('guide')}
        >
          <CircleHelp size={18} />
          How it works
        </button>
      </nav>
      <div className="sidebar-section-title">
        <span>YOUR REPORTS</span>
        <button
          type="button"
          className="icon-button"
          onClick={onNewReport}
          disabled={isWorking}
          aria-label="Start a new report"
        >
          <Plus size={16} />
        </button>
      </div>
      <nav
        className={`workflow-nav${workflows.length ? ' has-reports' : ''}`}
        aria-label="Saved reports"
      >
        {workflows.length ? (
          workflows.map((item) => (
            <button
              type="button"
              className={currentWorkflowId === item.id ? 'selected' : ''}
              aria-current={
                currentWorkflowId === item.id && tab === 'workspace' ? 'true' : undefined
              }
              key={item.id}
              onClick={() => onOpenWorkflow(item.id)}
              disabled={isWorking}
            >
              <span className={`status-dot ${item.state === 'completed' ? 'green' : 'amber'}`} />
              <span>
                {item.order.id}
                <small>{item.order.customer_name}</small>
              </span>
              {item.state === 'completed' ? <CheckCircle2 size={14} /> : null}
            </button>
          ))
        ) : (
          <p>No reports yet.</p>
        )}
      </nav>
      <div className="sidebar-bottom">
        <div className="sandbox-note">
          <ShieldCheck size={17} />
          <div>
            Your own sandbox<span>Cases are isolated per visitor.</span>
          </div>
        </div>
        {resetPrompt ? (
          <div className="reset-prompt">
            <p>Clear your reports and simulated cases?</p>
            <div>
              <button
                type="button"
                onClick={() => onResetPromptChange(false)}
                className="text-button"
                disabled={isWorking}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onResetSandbox}
                className="text-button danger"
                disabled={isWorking}
              >
                {busy === 'reset' ? 'Clearing…' : 'Clear my sandbox'}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="reset-button"
            disabled={!hasSession || isWorking}
            onClick={() => onResetPromptChange(true)}
          >
            <RotateCcw size={13} />
            Reset my sandbox
          </button>
        )}
        <a
          className="portfolio-link"
          href="https://josephhaenel.com"
          target="_blank"
          rel="noreferrer"
        >
          Built with Joseph Haenel <ArrowUpRight size={13} />
        </a>
      </div>
    </aside>
  );
}
