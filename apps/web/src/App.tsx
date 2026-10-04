import { useEffect, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowRight, ArrowUpRight, CheckCircle2, ChevronDown, CircleHelp, ClipboardList, CornerDownRight, FileCheck2, LayoutDashboard, LoaderCircle, Plus, RotateCcw, Search, ShieldCheck, Sparkles, X } from 'lucide-react';
import { ApiError, draftFields, errorMessage, isKnownRejection, readSaved, request, saveLocal } from './api';
import { EvidenceDialog } from './EvidenceDialog';
import { HowItWorks } from './HowItWorks';
import { ActivityPanel, EvidencePanel, OrderDetails, ReviewPanel } from './WorkspacePanels';
import type { DraftFields, Evidence, PendingApproval, PendingCreate, Role, Session, Workflow } from './types';
import type { Order } from './types';

const defaultMessage = (id: string) => `Order ${id} has not arrived. We checked the receiving area.`;
const initialFields: DraftFields = { response: '', summary: '', priority: 'standard', contact_name: '', callback: '' };

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [fields, setFields] = useState<DraftFields>(initialFields);
  const [pendingCreate, setPendingCreate] = useState(() => readSaved<PendingCreate>('create'));
  const [pendingApproval, setPendingApproval] = useState(() => readSaved<PendingApproval>('approval'));
  const [orderId, setOrderId] = useState(() => readSaved<PendingCreate>('create')?.order_id ?? 'AD-1042');
  const [message, setMessage] = useState(() => readSaved<PendingCreate>('create')?.message ?? defaultMessage('AD-1042'));
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootstrap, setBootstrap] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<'connect' | 'create' | 'save' | 'approve' | 'refresh' | null>(null);
  const [tab, setTab] = useState<'workspace' | 'guide'>('workspace');
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const evidenceRequestRef = useRef(0);
  const [resetPrompt, setResetPrompt] = useState(false);

  function rememberCreate(value: PendingCreate | null) { setPendingCreate(value); saveLocal('create', value); }
  function rememberApproval(value: PendingApproval | null) { setPendingApproval(value); saveLocal('approval', value); }

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
        if (failure instanceof ApiError && failure.status === 401) nextSession = await request<Session>('/session', { body: { role: 'employee' } });
        else throw failure;
      }
      const [orderData, workflowData] = await Promise.all([
        request<{ orders: Order[] }>('/orders'),
        request<{ workflows: Workflow[] }>('/workflows'),
      ]);
      const selectedId = readSaved<string>('selected');
      let restored: Workflow | null = null;
      if (selectedId && workflowData.workflows.some((item) => item.id === selectedId)) restored = await request<Workflow>(`/workflows/${encodeURIComponent(selectedId)}`);
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
        const firstId = orderData.orders.find((order) => order.id === 'AD-1042')?.id ?? orderData.orders[0]?.id ?? '';
        setOrderId(firstId);
        setMessage(defaultMessage(firstId));
      }
    }
    connect().catch((failure: unknown) => { if (active) { setError(errorMessage(failure)); setRecovery('connect'); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // Reconnect is an explicit event; it restores server state and saved operation IDs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrap]);

  async function runAction(name: string, action: () => Promise<void>, retry: typeof recovery = null) {
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
    await runAction('load', async () => { adoptWorkflow(await request<Workflow>(`/workflows/${encodeURIComponent(id)}`)); }, 'refresh');
  }

  async function changeRole(role: Role) {
    if (!session || role === session.role) return;
    await runAction('role', async () => {
      const nextSession = await request<Session>('/session', { body: { role }, csrf: session.csrf_token });
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
      else { setWorkflow(null); setConfirmed(false); saveLocal('selected', null); }
      if (!pendingCreate && !orderData.orders.some((order) => order.id === orderId)) {
        const id = orderData.orders[0]?.id ?? '';
        setOrderId(id);
        setMessage(defaultMessage(id));
      }
    }, 'connect');
  }

  async function prepare() {
    if (!session || !orderId || !message.trim()) return;
    await runAction('create', async () => {
      const operation = pendingCreate ?? { order_id: orderId, message: message.trim(), operation_id: crypto.randomUUID() };
      rememberCreate(operation);
      try {
        const created = await request<Workflow>('/workflows', { body: operation, csrf: session.csrf_token });
        rememberCreate(null);
        adoptWorkflow(created);
      } catch (failure) {
        if (isKnownRejection(failure)) rememberCreate(null);
        throw failure;
      }
    }, 'create');
  }

  async function saveRevision() {
    if (!session || !workflow) return;
    await runAction('save', async () => {
      adoptWorkflow(await request<Workflow>(`/workflows/${encodeURIComponent(workflow.id)}/revisions`, {
        body: { base_revision_id: workflow.revision.id, ...fields }, csrf: session.csrf_token,
      }));
    }, 'refresh');
  }

  async function approve() {
    if (!session || !workflow) return;
    await runAction('approve', async () => {
      const existing = pendingApproval?.workflow_id === workflow.id ? pendingApproval : null;
      const operation = existing ?? { workflow_id: workflow.id, revision_id: workflow.revision.id, operation_id: crypto.randomUUID() };
      rememberApproval(operation);
      try {
        const completed = await request<Workflow>(`/workflows/${encodeURIComponent(operation.workflow_id)}/approve`, {
          body: { revision_id: operation.revision_id, operation_id: operation.operation_id }, csrf: session.csrf_token,
        });
        rememberApproval(null);
        adoptWorkflow(completed);
      } catch (failure) {
        if (isKnownRejection(failure)) rememberApproval(null);
        throw failure;
      }
    }, 'approve');
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
  const changed = workflow ? JSON.stringify(fields) !== JSON.stringify(draftFields(workflow.revision)) : false;
  const unresolvedApproval = pendingApproval?.workflow_id === workflow?.id;
  const reviewCount = workflows.filter((item) => item.state !== 'completed').length;
  const isWorking = loading || busy !== null;

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <aside className="sidebar" aria-label="Primary navigation">
      <a className="brand" href="/" aria-label="OpsDesk home"><span className="brand-mark"><span /><span /><span /><span /></span><span>OpsDesk<span className="brand-subtitle">SUPPORT OPERATIONS</span></span></a>
      <div className="workspace-label"><span className="company-mark">A</span><div>Alder Distribution<span>Synthetic workspace</span></div><ChevronDown size={14} /></div>
      <nav className="main-nav"><button type="button" className={tab === 'workspace' ? 'active' : ''} onClick={() => setTab('workspace')}><LayoutDashboard size={18} />Workspace{reviewCount ? <span className="nav-count">{reviewCount}</span> : null}</button><button type="button" className={tab === 'guide' ? 'active' : ''} onClick={() => setTab('guide')}><CircleHelp size={18} />How it works<ArrowUpRight size={15} /></button></nav>
      <div className="sidebar-section-title"><span>YOUR REPORTS</span><button type="button" className="icon-button" onClick={newReport} disabled={isWorking} aria-label="Start a new report"><Plus size={16} /></button></div>
      <div className="workflow-nav">{workflows.length ? workflows.map((item) => <button type="button" className={workflow?.id === item.id ? 'selected' : ''} key={item.id} onClick={() => { setTab('workspace'); void loadWorkflow(item.id); }} disabled={isWorking}><span className={`status-dot ${item.state === 'completed' ? 'green' : 'amber'}`} /><span>{item.order.id}<small>{item.order.customer_name}</small></span>{item.state === 'completed' ? <CheckCircle2 size={14} /> : null}</button>) : <p>Your saved reports will<br />appear here.</p>}</div>
      <div className="sidebar-bottom"><div className="sandbox-note"><ShieldCheck size={17} /><div>Your own sandbox<span>Cases are isolated per visitor.</span></div></div>{resetPrompt ? <div className="reset-prompt"><p>Clear your reports and simulated cases?</p><div><button type="button" onClick={() => setResetPrompt(false)} className="text-button" disabled={isWorking}>Cancel</button><button type="button" onClick={() => void resetSandbox()} className="text-button danger" disabled={isWorking}>{busy === 'reset' ? 'Clearing…' : 'Clear my sandbox'}</button></div></div> : <button type="button" className="reset-button" disabled={!session || isWorking} onClick={() => setResetPrompt(true)}><RotateCcw size={13} />Reset my sandbox</button>}<a className="portfolio-link" href="https://josephhaenel.com" target="_blank" rel="noreferrer">Built with Joseph Haenel <ArrowUpRight size={13} /></a></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb">WORKSPACE <span>/</span> {tab === 'guide' ? 'HOW IT WORKS' : 'DELIVERY SUPPORT'}</div><div className="topbar-actions"><span className="reference-pill"><span className="status-dot amber" />Reference mode</span><div className="role-picker"><label htmlFor="demo-role">DEMO ROLE</label><select id="demo-role" value={session?.role ?? 'employee'} onChange={(event) => void changeRole(event.target.value as Role)} disabled={!session || isWorking}><option value="employee">Employee</option><option value="manager">Manager</option></select></div><span className="avatar" aria-hidden="true">{session?.role === 'manager' ? 'M' : 'E'}</span></div></header>
      <div className="demo-banner"><Sparkles size={14} /><p><strong>Synthetic data. Real workflow boundaries.</strong> Reference drafts use templates; no live AI model or external tickets.</p><button type="button" onClick={() => setTab('guide')}>About this demo <ArrowUpRight size={13} /></button></div>
      <main id="main-content" tabIndex={-1}>
        {error ? <div className="error-banner" role="alert"><div><strong>The request needs attention</strong><p>{error}</p>{recovery === 'refresh' && changed ? <p className="small">Reloading will replace unsaved edits with the server's latest revision.</p> : null}</div><div>{recovery ? <button type="button" className="button secondary compact" onClick={retry} disabled={isWorking}>{recovery === 'refresh' ? 'Reload saved state' : recovery === 'connect' ? 'Reconnect' : 'Retry safely'}</button> : null}<button className="icon-button" type="button" onClick={() => setError(null)} aria-label="Dismiss error"><X size={17} /></button></div></div> : null}
        {loading ? <div className="loading-state" role="status"><LoaderCircle size={26} className="spinner" /><h1>Opening your workspace</h1><p>Restoring the demo session and saved reports.</p></div> : !session ? <div className="loading-state"><ShieldCheck size={30} /><h1>Workspace unavailable</h1><p>Reconnect when the server is available to restore your sandbox.</p><button type="button" className="button primary" onClick={() => setBootstrap((value) => value + 1)}>Reconnect <ArrowRight size={16} /></button></div> : tab === 'guide' ? <HowItWorks onExplore={() => setTab('workspace')} /> : <>
          <div className="page-heading"><div><span className="eyebrow">DELIVERY SUPPORT</span><h1>{workflow ? workflow.state === 'completed' ? 'One report. A clear outcome.' : 'Review before you act.' : 'From a report to a resolution.'}</h1><p>{workflow ? `Investigating ${workflow.order.id} for ${workflow.order.customer_name}.` : 'Find the facts, inspect the evidence, and approve the next step.'}</p></div>{workflow ? <button className="button secondary" type="button" onClick={newReport} disabled={isWorking}><Plus size={16} />New report</button> : <span className="workspace-status"><span className="status-dot green" />{orders.length} authorized orders</span>}</div>
          <div className="workflow-progress" aria-label="Workflow progress"><span className="current"><span>01</span>Investigate</span><span className={workflow ? 'current' : ''}><span>02</span>Review</span><span className={workflow?.state === 'completed' ? 'current' : ''}><span>03</span>Resolve</span><div>{workflow?.state === 'completed' ? <><CheckCircle2 size={14} /> Completed</> : workflow ? <><FileCheck2 size={14} /> {workflow.state === 'needs_information' ? 'Needs information' : 'Awaiting review'}</> : <><ClipboardList size={14} /> New investigation</>}</div></div>
          {workflow?.case ? <section className="case-result" aria-label="Simulated case created"><span className="result-icon"><CheckCircle2 size={23} /></span><div><span className="eyebrow">SIMULATED CASE CREATED</span><h2>{workflow.case.id}</h2><p>{workflow.case.summary}</p><span className="small">{workflow.case.priority === 'urgent' ? 'Urgent escalation' : 'Standard investigation'} · Saved with revision {workflow.revision.number}</span></div><span className="badge success">Complete</span></section> : null}
          <div className="workspace-grid">
            <div className="context-column">
              {workflow ? <section className="panel original-report"><div className="section-heading"><div><span className="eyebrow">STARTING POINT</span><h2>Customer report</h2></div><ArrowDownLeft size={18} className="muted" /></div><blockquote>{workflow.message}</blockquote><p className="quiet-note">Saved with this investigation</p></section> : <section className="panel report-composer" aria-labelledby="composer-title"><div className="section-heading"><div><span className="eyebrow">START AN INVESTIGATION</span><h2 id="composer-title">Customer report</h2></div><ClipboardList size={18} className="muted" /></div><form onSubmit={(event) => { event.preventDefault(); void prepare(); }}><label className="field-label" htmlFor="order-id">Order</label><select id="order-id" value={orderId} disabled={isWorking || pendingCreate !== null} onChange={(event) => { setOrderId(event.target.value); setMessage(defaultMessage(event.target.value)); }}>{orders.map((order) => <option key={order.id} value={order.id}>{order.id} · {order.customer_name}</option>)}</select><label className="field-label" htmlFor="report-message">What happened?</label><textarea id="report-message" rows={4} value={message} onChange={(event) => setMessage(event.target.value)} disabled={isWorking || pendingCreate !== null} maxLength={3000} /><p className="form-hint"><ShieldCheck size={13} />Only accounts available to the {session.role} role appear.</p>{pendingCreate ? <div className="missing-note"><span className="status-dot amber" /><span>A previous request needs recovery. Retry uses the same report and operation ID.</span></div> : null}<button className="button primary prepare-button" type="submit" disabled={isWorking || !orderId || !message.trim()}>{busy === 'create' ? <LoaderCircle size={17} className="spinner" /> : <Search size={17} />}{busy === 'create' ? 'Preparing investigation…' : pendingCreate ? 'Recover investigation' : 'Investigate report'}{busy !== 'create' ? <ArrowRight size={17} /> : null}</button></form></section>}
              {selectedOrder ? <OrderDetails order={selectedOrder} /> : null}
              {workflow ? <ActivityPanel workflow={workflow} /> : <div className="try-next"><CornerDownRight size={17} /><p><strong>Try a missing-information case.</strong> Choose AD-1043 to see approval blocked until a callback number is saved.</p></div>}
            </div>
            <div className="review-column">{workflow ? <><EvidencePanel workflow={workflow} onOpen={(source) => void openEvidence(source)} /><ReviewPanel workflow={workflow} fields={fields} role={session.role} changed={changed} confirmed={confirmed} busy={busy} unresolvedApproval={unresolvedApproval} onChange={(next) => { setFields(next); setConfirmed(false); }} onConfirm={setConfirmed} onSave={() => void saveRevision()} onApprove={() => void approve()} /></> : <section className="investigation-preview"><span className="preview-orbit"><span className="preview-icon"><FileCheck2 size={30} strokeWidth={1.5} /></span><span className="orbit-tag"><ShieldCheck size={13} />Human approval</span></span><span className="eyebrow">A CONSIDERED NEXT STEP</span><h2>Every action starts<br />with evidence.</h2><p>Open a report to see its source records,<br className="desktop-break" /> applicable policies, and a reviewable proposal.</p><div className="preview-features"><div><BookIcon />Inspect the sources</div><div><FileCheck2 size={16} />Edit the saved revision</div><div><ShieldCheck size={16} />Approve the exact action</div></div><span className="preview-footnote">No response is sent. No external system is changed.</span></section>}</div>
          </div>
        </>}
      </main>
      <footer className="main-footer"><span>OpsDesk · AI engineering portfolio</span><span>Fictional records · Isolated sandbox · Reference mode</span></footer>
    </div>
    {evidenceOpen ? <EvidenceDialog evidence={evidence} loading={evidenceLoading} error={evidenceError} onClose={() => { setEvidenceOpen(false); evidenceRequestRef.current += 1; }} /> : null}
  </div>;
}

function BookIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Z" /><path d="M12 5v15" /></svg>; }
