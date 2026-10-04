import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, LoaderCircle, Plus, ShieldCheck, X } from 'lucide-react';
import {
  ApiError,
  draftFields,
  errorMessage,
  isKnownRejection,
  readSaved,
  request,
  saveLocal,
} from './api';
import { EvidenceDialog } from './EvidenceDialog';
import { HowItWorks } from './HowItWorks';
import { ReportComposer } from './ReportComposer';
import { DemoControls } from './DemoControls';
import { DemoNavigation } from './DemoNavigation';
import { ActivityPanel, EvidencePanel, OrderDetails, ReviewPanel } from './WorkspacePanels';
import type {
  DraftFields,
  Evidence,
  Order,
  PendingApproval,
  PendingCreate,
  Role,
  Session,
  Workflow,
} from './types';

const defaultMessage = (id: string) =>
  `Order ${id} has not arrived. We checked the receiving area.`;
const initialFields: DraftFields = {
  response: '',
  summary: '',
  priority: 'standard',
  contact_name: '',
  callback: '',
};

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [fields, setFields] = useState<DraftFields>(initialFields);
  const [pendingCreate, setPendingCreate] = useState(() => readSaved<PendingCreate>('create'));
  const [pendingApproval, setPendingApproval] = useState(() =>
    readSaved<PendingApproval>('approval'),
  );
  const [orderId, setOrderId] = useState(
    () => readSaved<PendingCreate>('create')?.order_id ?? 'AD-1042',
  );
  const [message, setMessage] = useState(
    () => readSaved<PendingCreate>('create')?.message ?? defaultMessage('AD-1042'),
  );
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootstrap, setBootstrap] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<
    'connect' | 'create' | 'save' | 'approve' | 'refresh' | null
  >(null);
  const [tab, setTab] = useState<'workspace' | 'guide'>('workspace');
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const evidenceRequestRef = useRef(0);
  const [resetPrompt, setResetPrompt] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  function rememberCreate(value: PendingCreate | null) {
    setPendingCreate(value);
    saveLocal('create', value);
  }
  function rememberApproval(value: PendingApproval | null) {
    setPendingApproval(value);
    saveLocal('approval', value);
  }

  function adoptWorkflow(value: Workflow) {
    setWorkflow(value);
    setFields(draftFields(value.revision));
    setConfirmed(false);
    saveLocal('selected', value.id);
    setWorkflows((current) => [value, ...current.filter((item) => item.id !== value.id)]);
    if (value.state === 'completed') rememberApproval(null);
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    async function connect() {
      let nextSession: Session;
      try {
        nextSession = await request<Session>('/session');
      } catch (failure) {
        if (failure instanceof ApiError && failure.status === 401)
          nextSession = await request<Session>('/session', { body: { role: 'employee' } });
        else throw failure;
      }
      const [orderData, workflowData] = await Promise.all([
        request<{ orders: Order[] }>('/orders'),
        request<{ workflows: Workflow[] }>('/workflows'),
      ]);
      const selectedId =
        readSaved<string>('selected') ?? readSaved<PendingApproval>('approval')?.workflow_id;
      let restored: Workflow | null = null;
      if (selectedId && workflowData.workflows.some((item) => item.id === selectedId))
        restored = await request<Workflow>(`/workflows/${encodeURIComponent(selectedId)}`);
      if (!active) return;
      setSession(nextSession);
      setOrders(orderData.orders);
      setWorkflows(workflowData.workflows);
      if (restored) {
        setWorkflow(restored);
        setFields(draftFields(restored.revision));
        if (restored.state === 'completed') rememberApproval(null);
      } else {
        setWorkflow(null);
        saveLocal('selected', null);
      }
      const pending = readSaved<PendingCreate>('create');
      if (!pending && !orderData.orders.some((order) => order.id === orderId)) {
        const firstId =
          orderData.orders.find((order) => order.id === 'AD-1042')?.id ??
          orderData.orders[0]?.id ??
          '';
        setOrderId(firstId);
        setMessage(defaultMessage(firstId));
      }
    }
    connect()
      .catch((failure: unknown) => {
        if (active) {
          setError(errorMessage(failure));
          setRecovery('connect');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // Reconnect is an explicit event; it restores server state and saved operation IDs.
  }, [bootstrap]);

  async function runAction(
    name: string,
    action: () => Promise<void>,
    retry: typeof recovery = null,
  ) {
    if (busyRef.current || loading) return;
    busyRef.current = name;
    setBusy(name);
    setError(null);
    setRecovery(null);
    try {
      await action();
    } catch (failure) {
      setError(errorMessage(failure));
      setRecovery(retry);
    } finally {
      busyRef.current = null;
      setBusy(null);
    }
  }

  async function loadWorkflow(id: string) {
    await runAction(
      'load',
      async () => {
        adoptWorkflow(await request<Workflow>(`/workflows/${encodeURIComponent(id)}`));
      },
      'refresh',
    );
  }

  async function changeRole(role: Role) {
    if (!session || role === session.role) return;
    await runAction(
      'role',
      async () => {
        const nextSession = await request<Session>('/session', {
          body: { role },
          csrf: session.csrf_token,
        });
        setSession(nextSession);
        setEvidenceOpen(false);
        const [orderData, workflowData] = await Promise.all([
          request<{ orders: Order[] }>('/orders'),
          request<{ workflows: Workflow[] }>('/workflows'),
        ]);
        setOrders(orderData.orders);
        setWorkflows(workflowData.workflows);
        const current = workflowData.workflows.find(
          (item) => item.id === (workflow?.id ?? pendingApproval?.workflow_id),
        );
        if (current) adoptWorkflow(current);
        else {
          setWorkflow(null);
          setConfirmed(false);
          saveLocal('selected', null);
        }
        if (!pendingCreate && !orderData.orders.some((order) => order.id === orderId)) {
          const id = orderData.orders[0]?.id ?? '';
          setOrderId(id);
          setMessage(defaultMessage(id));
        }
      },
      'connect',
    );
  }

  async function prepare() {
    if (!session || !orderId || !message.trim() || pendingApproval) return;
    await runAction(
      'create',
      async () => {
        const operation = pendingCreate ?? {
          order_id: orderId,
          message: message.trim(),
          operation_id: crypto.randomUUID(),
        };
        rememberCreate(operation);
        try {
          const created = await request<Workflow>('/workflows', {
            body: operation,
            csrf: session.csrf_token,
          });
          rememberCreate(null);
          adoptWorkflow(created);
        } catch (failure) {
          if (isKnownRejection(failure)) rememberCreate(null);
          throw failure;
        }
      },
      'create',
    );
  }

  async function saveRevision() {
    if (!session || !workflow) return;
    await runAction(
      'save',
      async () => {
        adoptWorkflow(
          await request<Workflow>(`/workflows/${encodeURIComponent(workflow.id)}/revisions`, {
            body: { base_revision_id: workflow.revision.id, ...fields },
            csrf: session.csrf_token,
          }),
        );
      },
      'refresh',
    );
  }

  async function approve() {
    if (!session || !workflow) return;
    if (pendingApproval && pendingApproval.workflow_id !== workflow.id) {
      setError('Recover the earlier approval result before creating another case.');
      return;
    }
    await runAction(
      'approve',
      async () => {
        const existing = pendingApproval?.workflow_id === workflow.id ? pendingApproval : null;
        const operation = existing ?? {
          workflow_id: workflow.id,
          revision_id: workflow.revision.id,
          operation_id: crypto.randomUUID(),
        };
        rememberApproval(operation);
        try {
          const completed = await request<Workflow>(
            `/workflows/${encodeURIComponent(operation.workflow_id)}/approve`,
            {
              body: { revision_id: operation.revision_id, operation_id: operation.operation_id },
              csrf: session.csrf_token,
            },
          );
          rememberApproval(null);
          adoptWorkflow(completed);
        } catch (failure) {
          if (isKnownRejection(failure)) rememberApproval(null);
          throw failure;
        }
      },
      'approve',
    );
  }

  async function resetSandbox() {
    if (!session) return;
    await runAction('reset', async () => {
      await request<{ ok: boolean }>('/reset', { body: {}, csrf: session.csrf_token });
      setWorkflows([]);
      setWorkflow(null);
      setConfirmed(false);
      setResetPrompt(false);
      rememberApproval(null);
      rememberCreate(null);
      saveLocal('selected', null);
      setOrderId(orders.find((order) => order.id === 'AD-1042')?.id ?? orders[0]?.id ?? '');
      setMessage(defaultMessage('AD-1042'));
    });
  }

  function newReport() {
    if (busy || pendingApproval || pendingCreate) return;
    setWorkflow(null);
    setConfirmed(false);
    setError(null);
    saveLocal('selected', null);
    setTab('workspace');
  }

  async function openEvidence(source: Evidence) {
    const requestId = ++evidenceRequestRef.current;
    setEvidenceOpen(true);
    setEvidence(null);
    setEvidenceLoading(true);
    setEvidenceError(null);
    try {
      const result = await request<Evidence>(`/evidence/${encodeURIComponent(source.id)}`);
      if (requestId === evidenceRequestRef.current) setEvidence(result);
    } catch (failure) {
      if (requestId === evidenceRequestRef.current) setEvidenceError(errorMessage(failure));
    } finally {
      if (requestId === evidenceRequestRef.current) setEvidenceLoading(false);
    }
  }

  function retry() {
    if (recovery === 'create') void prepare();
    else if (recovery === 'approve') void approve();
    else if (recovery === 'save') void saveRevision();
    else if (recovery === 'refresh' && workflow) void loadWorkflow(workflow.id);
    else setBootstrap((value) => value + 1);
  }

  useEffect(() => {
    if (!loading) {
      headingRef.current?.focus();
      window.scrollTo({ top: 0 });
    }
  }, [loading, tab, workflow?.id, workflow?.state, workflow?.revision.id]);

  const selectedOrder = workflow?.order ?? orders.find((order) => order.id === orderId);
  const changed = workflow
    ? JSON.stringify(fields) !== JSON.stringify(draftFields(workflow.revision))
    : false;
  const unresolvedApproval = pendingApproval?.workflow_id === workflow?.id;
  const isWorking = loading || busy !== null;
  const navigationLocked = isWorking || pendingApproval !== null || pendingCreate !== null;

  return (
    <div className="app-shell guided-demo">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <DemoNavigation tab={tab} onTabChange={setTab} />
      <div className="main-shell">
        <main id="main-content" tabIndex={-1}>
          {pendingApproval && !unresolvedApproval && !loading ? (
            <div className="error-banner" role="status">
              <div>
                <strong>An earlier case needs result recovery</strong>
                <p>Use the original access level under permissions, then resume the saved case.</p>
              </div>
              <button
                type="button"
                className="button secondary compact"
                disabled={isWorking}
                onClick={() => void loadWorkflow(pendingApproval.workflow_id)}
              >
                Resume saved case
              </button>
            </div>
          ) : null}
          {error ? (
            <div className="error-banner" role="alert">
              <div>
                <strong>The request needs attention</strong>
                <p>{error}</p>
                {recovery === 'refresh' && changed ? (
                  <p className="small">
                    Reloading will replace unsaved edits with the server's latest revision.
                  </p>
                ) : null}
              </div>
              <div>
                {recovery ? (
                  <button
                    type="button"
                    className="button secondary compact"
                    onClick={retry}
                    disabled={isWorking}
                  >
                    {recovery === 'refresh'
                      ? 'Reload saved state'
                      : recovery === 'connect'
                        ? 'Reconnect'
                        : 'Retry safely'}
                  </button>
                ) : null}
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => setError(null)}
                  aria-label="Dismiss error"
                >
                  <X size={17} />
                </button>
              </div>
            </div>
          ) : null}
          {loading ? (
            <div className="loading-state" role="status">
              <LoaderCircle size={26} className="spinner" />
              <h1>Opening the demo</h1>
              <p>Restoring your saved cases.</p>
            </div>
          ) : !session ? (
            <div className="loading-state">
              <ShieldCheck size={30} />
              <h1>Demo unavailable</h1>
              <p>Reconnect to restore your saved cases.</p>
              <button
                type="button"
                className="button primary"
                onClick={() => setBootstrap((value) => value + 1)}
              >
                Reconnect <ArrowRight size={16} />
              </button>
            </div>
          ) : tab === 'guide' ? (
            <HowItWorks onExplore={() => setTab('workspace')} />
          ) : (
            <>
              <div className="demo-intro">
                <div>
                  <span className="demo-kicker">Interactive AI engineering portfolio</span>
                  <h1 ref={headingRef} tabIndex={-1}>
                    {workflow
                      ? workflow.state === 'completed'
                        ? 'A delivery report, handled with review.'
                        : 'Review the reply and proposed case.'
                      : 'From a missing delivery to a reviewed support case.'}
                  </h1>
                  <p className="demo-description">
                    {workflow
                      ? workflow.state === 'completed'
                        ? 'Your case is saved. Refresh the page to see the same result.'
                        : 'Check the draft below. You decide whether to create the case.'
                      : 'OpsDesk checks order facts, finds relevant policies, and prepares a support case for a person to approve. Try the workflow in about two minutes.'}
                  </p>
                  <p className="demo-meta">
                    Fictional orders · Template drafts, no live AI call · No messages sent
                  </p>
                </div>
                {workflow ? (
                  <button
                    className="button secondary compact"
                    type="button"
                    onClick={newReport}
                    disabled={navigationLocked}
                  >
                    <Plus size={16} /> Try another scenario
                  </button>
                ) : null}
              </div>
              <ol className="demo-steps" aria-label="Demo progress">
                {['Choose a scenario', 'Review the draft', 'Create a demo case'].map(
                  (label, index) => {
                    const step = workflow?.state === 'completed' ? 2 : workflow ? 1 : 0;
                    return (
                      <li
                        key={label}
                        className={index === step ? 'current' : index < step ? 'done' : ''}
                        aria-current={index === step ? 'step' : undefined}
                      >
                        <span>{index < step ? <CheckCircle2 size={16} /> : index + 1}</span>
                        {label}
                      </li>
                    );
                  },
                )}
              </ol>
              {workflow?.case ? (
                <section className="case-result" aria-label="Demo case created">
                  <span className="result-icon">
                    <CheckCircle2 size={23} />
                  </span>
                  <div>
                    <span className="demo-kicker">Step 3 complete</span>
                    <h2>Demo case created</h2>
                    <p>{workflow.case.summary}</p>
                    <p className="small">
                      Case <code>{workflow.case.id}</code> · Saved from revision{' '}
                      {workflow.revision.number}
                    </p>
                    <p className="small muted">
                      A refresh or retry recovers this case instead of creating a duplicate. The
                      reply remains a draft.
                    </p>
                  </div>
                </section>
              ) : null}
              <div className={`guided-content${workflow ? '' : ' is-starting'}`}>
                {workflow ? (
                  <ReviewPanel
                    workflow={workflow}
                    fields={fields}
                    role={session.role}
                    changed={changed}
                    confirmed={confirmed}
                    busy={busy}
                    unresolvedApproval={unresolvedApproval}
                    onChange={(next) => {
                      setFields(next);
                      setConfirmed(false);
                    }}
                    onConfirm={setConfirmed}
                    onSave={() => void saveRevision()}
                    onApprove={() => void approve()}
                  />
                ) : (
                  <ReportComposer
                    orders={orders}
                    orderId={orderId}
                    message={message}
                    pendingCreate={pendingCreate}
                    busy={busy}
                    isWorking={isWorking || pendingApproval !== null}
                    onOrderChange={(id) => {
                      setOrderId(id);
                      setMessage(defaultMessage(id));
                    }}
                    onMessageChange={setMessage}
                    onPrepare={() => void prepare()}
                  />
                )}
                {workflow ? (
                  <aside className="demo-support" aria-label="Evidence and case history">
                    <section className="checks-summary">
                      <h2>Why this draft?</h2>
                      <p>
                        Prepared from the order record and {workflow.evidence.length} available
                        policies. You can inspect both before approving.
                      </p>
                    </section>
                    <details className="context-disclosure">
                      <summary>
                        Read the supporting policies <span>{workflow.evidence.length}</span>
                      </summary>
                      <div className="context-disclosure-body">
                        <EvidencePanel
                          workflow={workflow}
                          onOpen={(source) => void openEvidence(source)}
                        />
                      </div>
                    </details>
                    <details className="context-disclosure">
                      <summary>Customer report &amp; order facts</summary>
                      <div className="context-disclosure-body">
                        <blockquote className="report-preview">{workflow.message}</blockquote>
                        {selectedOrder ? <OrderDetails order={selectedOrder} /> : null}
                      </div>
                    </details>
                    <details className="context-disclosure">
                      <summary>Activity &amp; technical details</summary>
                      <div className="context-disclosure-body">
                        <ActivityPanel workflow={workflow} />
                      </div>
                    </details>
                  </aside>
                ) : null}
              </div>
              <DemoControls
                role={session.role}
                workflows={workflows}
                currentWorkflowId={workflow?.id}
                isWorking={isWorking}
                navigationLocked={navigationLocked}
                busy={busy}
                resetPrompt={resetPrompt}
                onRoleChange={(role) => void changeRole(role)}
                onOpenWorkflow={(id) => {
                  setTab('workspace');
                  void loadWorkflow(id);
                }}
                onResetPromptChange={setResetPrompt}
                onResetSandbox={() => void resetSandbox()}
              />
            </>
          )}
        </main>
        <footer className="main-footer">
          <a href="https://josephhaenel.com" target="_blank" rel="noreferrer">
            Joseph Haenel · Portfolio
          </a>
          <span>Built with AI assistance · Demo data expires after 24 hours</span>
        </footer>
      </div>
      {evidenceOpen ? (
        <EvidenceDialog
          evidence={evidence}
          loading={evidenceLoading}
          error={evidenceError}
          onClose={() => {
            setEvidenceOpen(false);
            evidenceRequestRef.current += 1;
          }}
        />
      ) : null}
    </div>
  );
}
