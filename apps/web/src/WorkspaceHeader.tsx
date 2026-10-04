import { Sparkles } from 'lucide-react';
import type { Role } from './types';

interface WorkspaceHeaderProps {
  tab: 'workspace' | 'guide';
  role: Role | undefined;
  hasSession: boolean;
  isWorking: boolean;
  onRoleChange: (role: Role) => void;
  onShowGuide: () => void;
}

export function WorkspaceHeader({
  tab,
  role,
  hasSession,
  isWorking,
  onRoleChange,
  onShowGuide,
}: WorkspaceHeaderProps) {
  return (
    <>
      <header className="topbar">
        <div className="breadcrumb">
          Workspace <span>/</span> {tab === 'guide' ? 'How it works' : 'Delivery support'}
        </div>
        <div className="topbar-actions">
          <span className="reference-pill">
            <span className="status-dot amber" />
            Reference mode
          </span>
          <div className="role-picker">
            <label htmlFor="demo-role">Demo role</label>
            <select
              id="demo-role"
              value={role ?? 'employee'}
              onChange={(event) => onRoleChange(event.target.value as Role)}
              disabled={!hasSession || isWorking}
            >
              <option value="employee">Employee</option>
              <option value="manager">Manager</option>
            </select>
          </div>
        </div>
      </header>
      <div className="demo-banner">
        <Sparkles size={16} />
        <p>
          <strong>Demo workspace.</strong> Synthetic data, template drafts, and simulated cases.
        </p>
        <button type="button" onClick={onShowGuide}>
          About the demo
        </button>
      </div>
    </>
  );
}
