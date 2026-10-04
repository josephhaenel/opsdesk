import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  CornerDownRight,
  FileCheck2,
  LoaderCircle,
  Plus,
  ShieldCheck,
  X,
} from 'lucide-react';
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
import { WorkspaceHeader } from './WorkspaceHeader';
import { WorkspaceSidebar } from './WorkspaceSidebar';
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
      const selectedId = readSaved<string>('selected');
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
        const current = workflowData.workflows.find((item) => item.id === workflow?.id);
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
    if (!session || !orderId || !message.trim()) return;
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
    if (busy) return;
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

  const selectedOrder = workflow?.order ?? orders.find((order) => order.id === orderId);
  const changed = workflow
    ? JSON.stringify(fields) !== JSON.stringify(draftFields(workflow.revision))
    : false;
  const unresolvedApproval = pendingApproval?.workflow_id === workflow?.id;
  const reviewCount = workflows.filter((item) => item.state !== 'completed').length;
  const isWorking = loading || busy !== null;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <WorkspaceSidebar
        tab={tab}
        workflows={workflows}
        currentWorkflowId={workflow?.id}
        reviewCount={reviewCount}
        hasSession={session !== null}
        isWorking={isWorking}
        busy={busy}
        resetPrompt={resetPrompt}
        onTabChange={setTab}
        onOpenWorkflow={(id) => {
          setTab('workspace');
          void loadWorkflow(id);
        }}
        onNewReport={newReport}
        onResetPromptChange={setResetPrompt}
        onResetSandbox={() => void resetSandbox()}
      />
      <div className="main-shell">
        <WorkspaceHeader
          tab={tab}
          role={session?.role}
          hasSession={session !== null}
          isWorking={isWorking}
          onRoleChange={(role) => void changeRole(role)}
          onShowGuide={() => setTab('guide')}
        />
        <main id="main-content" tabIndex={-1}>
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
              <h1>Opening your workspace</h1>
              <p>Restoring the demo session and saved reports.</p>
            </div>
          ) : !session ? (
            <div className="loading-state">
              <ShieldCheck size={30} />
              <h1>Workspace unavailable</h1>
              <p>Reconnect when the server is available to restore your sandbox.</p>
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
              <div className="page-heading">
                <div>
                  <h1>
                    {workflow
                      ? workflow.state === 'completed'
                        ? 'Support case created'
                        : 'Review the delivery report'
                      : 'Investigate a delivery'}
                  </h1>
                  <p>
                    {workflow
                      ? `${workflow.order.id} · ${workflow.order.customer_name}`
                      : 'Choose an order and describe what happened.'}
                  </p>
                </div>
                {workflow ? (
                  <button
                    className="button secondary"
                    type="button"
                    onClick={newReport}
                    disabled={isWorking}
                  >
                    <Plus size={16} />
                    New report
                  </button>
                ) : (
                  <span className="workspace-status">
                    <span className="status-dot green" />
                    {orders.length} available orders
                  </span>
                )}
              </div>
              <div className="workflow-progress" aria-label="Workflow progress">
                <span
                  className={workflow ? 'done' : 'current'}
                  aria-current={!workflow ? 'step' : undefined}
                >
                  <span>01</span>Investigate
                </span>
                <span
                  className={workflow?.state === 'completed' ? 'done' : workflow ? 'current' : ''}
                  aria-current={workflow && workflow.state !== 'completed' ? 'step' : undefined}
                >
                  <span>02</span>Review
                </span>
                <span
                  className={workflow?.state === 'completed' ? 'current' : ''}
                  aria-current={workflow?.state === 'completed' ? 'step' : undefined}
                >
                  <span>03</span>Create case
                </span>
                <div>
                  {workflow?.state === 'completed' ? (
                    <>
                      <CheckCircle2 size={16} /> Completed
                    </>
                  ) : workflow ? (
                    <>
                      <FileCheck2 size={16} />{' '}
                      {workflow.state === 'needs_information'
                        ? 'Needs information'
                        : 'Awaiting review'}
                    </>
                  ) : null}
                </div>
              </div>
              {workflow?.case ? (
                <section className="case-result" aria-label="Simulated case created">
                  <span className="result-icon">
                    <CheckCircle2 size={23} />
                  </span>
                  <div>
                    <span className="eyebrow">SIMULATED CASE CREATED</span>
                    <h2>{workflow.case.id}</h2>
                    <p>{workflow.case.summary}</p>
                    <span className="small">
                      {workflow.case.priority === 'urgent'
                        ? 'Urgent escalation'
                        : 'Standard investigation'}{' '}
                      · Saved with revision {workflow.revision.number}
                    </span>
                  </div>
                  <span className="badge success">Complete</span>
                </section>
              ) : null}
              <div className={`workspace-grid${workflow ? '' : ' is-starting'}`}>
                <div className="context-column">
                  {workflow ? (
                    <section className="panel original-report">
                      <div className="section-heading">
                        <h2>Customer report</h2>
                        <ClipboardList size={18} className="muted" />
                      </div>
                      <blockquote>{workflow.message}</blockquote>
                    </section>
                  ) : (
                    <ReportComposer
                      orders={orders}
                      orderId={orderId}
                      message={message}
                      pendingCreate={pendingCreate}
                      busy={busy}
                      isWorking={isWorking}
                      onOrderChange={(id) => {
                        setOrderId(id);
                        setMessage(defaultMessage(id));
                      }}
                      onMessageChange={setMessage}
                      onPrepare={() => void prepare()}
                    />
                  )}
                  {workflow && selectedOrder ? <OrderDetails order={selectedOrder} /> : null}
                  {workflow ? (
                    <ActivityPanel workflow={workflow} />
                  ) : (
                    <div className="try-next">
                      <CornerDownRight size={17} />
                      <p>
                        <strong>Try a missing-information case.</strong> Choose AD-1043 to see
                        approval blocked until a callback number is saved.
                      </p>
                    </div>
                  )}
                </div>
                <div className="review-column">
                  {workflow ? (
                    <>
                      <EvidencePanel
                        workflow={workflow}
                        onOpen={(source) => void openEvidence(source)}
                      />
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
                    </>
                  ) : (
                    <>
                      {selectedOrder ? <OrderDetails order={selectedOrder} /> : null}
                      <section className="investigation-preview">
                        <FileCheck2 size={22} />
                        <div>
                          <h2>Review before creating a case</h2>
                          <p>
                            After investigation, inspect the policies, edit the draft, and approve
                            the saved revision.
                          </p>
                        </div>
                      </section>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </main>
        <footer className="main-footer">
          <span>OpsDesk · AI engineering portfolio</span>
          <span>Fictional records · Isolated sandbox · Reference mode</span>
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
