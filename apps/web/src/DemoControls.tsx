import { CheckCircle2, RotateCcw } from 'lucide-react';
import type { Role, Workflow } from './types';

interface DemoControlsProps {
  role: Role;
  workflows: Workflow[];
  currentWorkflowId?: string;
  isWorking: boolean;
  navigationLocked: boolean;
  busy: string | null;
  resetPrompt: boolean;
  onRoleChange: (role: Role) => void;
  onOpenWorkflow: (id: string) => void;
  onResetPromptChange: (open: boolean) => void;
  onResetSandbox: () => void;
}

export function DemoControls({
  role,
  workflows,
  currentWorkflowId,
  isWorking,
  navigationLocked,
  busy,
  resetPrompt,
  onRoleChange,
  onOpenWorkflow,
  onResetPromptChange,
  onResetSandbox,
}: DemoControlsProps) {
  return (
    <details className="demo-controls">
      <summary>
        Explore permissions &amp; saved cases{' '}
        <span>{role === 'manager' ? 'Manager' : 'Employee'} access</span>
      </summary>
      <div className="demo-controls-body">
        <fieldset className="role-choices">
          <legend>Try a different access level</legend>
          {(['employee', 'manager'] as const).map((value) => (
            <label className="role-choice" key={value}>
              <input
                type="radio"
                name="demo-role"
                value={value}
                checked={role === value}
                disabled={isWorking}
                onChange={() => onRoleChange(value)}
              />
              <span>
                <strong>{value === 'employee' ? 'Employee' : 'Manager'}</strong>
                <small>
                  {value === 'employee'
                    ? 'Ordinary orders and standard cases'
                    : 'Restricted orders and urgent escalation'}
                </small>
              </span>
            </label>
          ))}
        </fieldset>
        <p className="small muted">
          Both roles are selectable for this demo. The server checks which orders, policies, and
          actions each role can access. Your demo data expires after 24 hours.
        </p>
        {workflows.length ? (
          <div>
            <h3>Your saved cases</h3>
            <nav className="saved-case-nav" aria-label="Saved reports">
              {workflows.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  disabled={navigationLocked}
                  aria-current={item.id === currentWorkflowId ? 'true' : undefined}
                  onClick={() => onOpenWorkflow(item.id)}
                >
                  <span>
                    {item.order.customer_name}
                    <small>
                      {item.order.id} · {item.state === 'completed' ? 'Created' : 'Needs review'}
                    </small>
                  </span>
                  {item.state === 'completed' ? <CheckCircle2 size={16} /> : null}
                </button>
              ))}
            </nav>
          </div>
        ) : null}
        {resetPrompt ? (
          <div className="reset-prompt">
            <p>Clear your saved reports and demo cases?</p>
            <div>
              <button
                type="button"
                className="text-button"
                disabled={isWorking}
                onClick={() => onResetPromptChange(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="text-button danger"
                disabled={isWorking}
                onClick={onResetSandbox}
              >
                {busy === 'reset' ? 'Clearing…' : 'Clear my demo data'}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="reset-button"
            disabled={isWorking}
            onClick={() => onResetPromptChange(true)}
          >
            <RotateCcw size={14} /> Reset my demo data
          </button>
        )}
      </div>
    </details>
  );
}
