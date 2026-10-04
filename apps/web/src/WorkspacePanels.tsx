import { ArrowRight, BookOpen, Check, CheckCircle2, ChevronRight, Clock3, FileText, History, LoaderCircle, LockKeyhole, Package, Save, ShieldCheck } from 'lucide-react';
import { displayDate } from './api';
import type { DraftFields, Evidence, Order, Role, Workflow } from './types';

export function OrderDetails({ order }: { order: Order }) {
  return <section className="panel order-detail" aria-labelledby="order-detail-title">
    <div className="section-heading"><div><span className="eyebrow">SOURCE RECORD</span><h2 id="order-detail-title">Order details</h2></div><Package size={18} className="muted" /></div>
    <div className="order-title"><span>{order.id}</span><span className={`badge ${order.delivered_at ? 'neutral' : 'warning'}`}>{order.delivery_status.replaceAll('_', ' ')}</span></div>
    <p className="customer-name">{order.customer_name}</p>
    <dl className="details-list">
      <div><dt>Expected delivery</dt><dd>{displayDate(order.expected_at)}</dd></div>
      <div><dt>Delivery record</dt><dd>{order.delivered_at ? displayDate(order.delivered_at, true) : 'No delivery recorded'}</dd></div>
      <div><dt>Proof of delivery</dt><dd>{order.proof_of_delivery || 'None recorded'}</dd></div>
      <div><dt>Record version</dt><dd>v{order.version}</dd></div>
    </dl>
    <div className="line-items"><span className="eyebrow">ORDER ITEMS</span>{order.items.map((item, index) => <div key={`${item.name}-${index}`}><span>{item.name}</span><span className="muted">× {item.quantity}</span></div>)}</div>
  </section>;
}

export function EvidencePanel({ workflow, onOpen }: { workflow: Workflow; onOpen: (evidence: Evidence) => void }) {
  return <section className="panel evidence-panel" aria-labelledby="evidence-panel-title">
    <div className="section-heading"><div><span className="eyebrow">PERMISSION-FILTERED SOURCES</span><h2 id="evidence-panel-title">Evidence</h2></div><span className="count-label">{workflow.evidence.length}</span></div>
    <p className="panel-intro">Applicable policy passages, checked before the draft is prepared.</p>
    <div className="evidence-list">{workflow.evidence.length ? workflow.evidence.map((source, index) => <button type="button" key={source.id} className="evidence-card" onClick={() => onOpen(source)} aria-label={`Open source ${index + 1}: ${source.title}`}>
      <span className="source-number">{String(index + 1).padStart(2, '0')}</span>
      <span className="evidence-content"><strong>{source.title}</strong><span>{source.section} · v{source.version}</span><span className="evidence-excerpt">{source.text}</span>{source.audience === 'manager' ? <span className="policy-role"><LockKeyhole size={12} /> Manager policy</span> : null}</span>
      <ChevronRight size={17} className="muted" />
    </button>) : <p className="empty-note">No applicable evidence is available for this report.</p>}</div>
    <div className="quiet-note"><ShieldCheck size={14} /> Sources are checked again when you open them.</div>
  </section>;
}

interface ReviewProps {
  workflow: Workflow;
  fields: DraftFields;
  role: Role;
  changed: boolean;
  confirmed: boolean;
  busy: string | null;
  unresolvedApproval: boolean;
  onChange: (fields: DraftFields) => void;
  onConfirm: (confirmed: boolean) => void;
  onSave: () => void;
  onApprove: () => void;
}

export function ReviewPanel({ workflow, fields, role, changed, confirmed, busy, unresolvedApproval, onChange, onConfirm, onSave, onApprove }: ReviewProps) {
  const completed = workflow.state === 'completed';
  const locked = completed || busy !== null || unresolvedApproval;
  const missingContact = !fields.contact_name.trim() || !fields.callback.trim();
  const forbiddenPriority = fields.priority === 'urgent' && role !== 'manager';
  const blocked = changed || missingContact || forbiddenPriority || !workflow.can_approve || !confirmed;
  function update<K extends keyof DraftFields>(key: K, value: DraftFields[K]) { onChange({ ...fields, [key]: value }); }

  return <section className={`panel review-panel ${completed ? 'completed-panel' : ''}`} aria-labelledby="review-panel-title">
    <div className="section-heading"><div><span className="eyebrow">{completed ? 'SAVED RESPONSE' : 'HUMAN REVIEW'}</span><h2 id="review-panel-title">{completed ? 'Approved revision' : 'Review the proposal'}</h2></div><span className="badge neutral">Revision {workflow.revision.number}</span></div>
    <div className="reference-note"><FileText size={16} /><span>Reference draft · deterministic template · no model call</span></div>
    <form onSubmit={(event) => { event.preventDefault(); onSave(); }}>
      <label className="field-label" htmlFor="draft-response">Customer response <span className="label-note">Draft only; never sent</span></label>
      <textarea id="draft-response" rows={6} value={fields.response} onChange={(event) => update('response', event.target.value)} disabled={locked} maxLength={8000} className="response-textarea" />
      <div className="action-divider"><span>PROPOSED ACTION</span><span>Create a simulated support case</span></div>
      <label className="field-label" htmlFor="case-summary">Case summary</label>
      <textarea id="case-summary" rows={3} value={fields.summary} onChange={(event) => update('summary', event.target.value)} disabled={locked} maxLength={1200} />
      <div className="contact-fields">
        <div><label className="field-label" htmlFor="contact-name">Contact name <span aria-hidden="true">*</span></label><input id="contact-name" value={fields.contact_name} onChange={(event) => update('contact_name', event.target.value)} disabled={locked} maxLength={120} aria-required="true" /></div>
        <div><label className="field-label" htmlFor="callback">Callback number <span aria-hidden="true">*</span></label><input id="callback" type="tel" value={fields.callback} onChange={(event) => update('callback', event.target.value)} disabled={locked} maxLength={200} aria-required="true" /></div>
      </div>
      <div className="priority-row"><div><label className="field-label" htmlFor="priority">Priority</label><select id="priority" value={fields.priority} onChange={(event) => update('priority', event.target.value as DraftFields['priority'])} disabled={locked}><option value="standard">Standard investigation</option><option value="urgent" disabled={role !== 'manager'}>Urgent escalation</option></select></div><p><LockKeyhole size={13} /> Urgent priority requires the manager role.</p></div>
      {!completed ? <>
        {workflow.missing_fields.length ? <div className="missing-note"><span className="status-dot amber" /><span>Required information: {workflow.missing_fields.map((field) => field.replaceAll('_', ' ')).join(', ')}. Fill it in and save a revision.</span></div> : null}
        {forbiddenPriority ? <p className="inline-error">Switch to the manager role to approve this urgent proposal, or save standard priority.</p> : null}
        {!workflow.can_approve && !workflow.missing_fields.length && !forbiddenPriority ? <div className="missing-note"><span className="status-dot amber" /><span>{workflow.order.delivery_status === 'delivered' ? 'This order is recorded as delivered. A missing-delivery case is not permitted for this record.' : 'This saved proposal is not currently eligible for approval under the available record and policies.'}</span></div> : null}
        <div className="save-row"><span className="small muted">{changed ? 'Unsaved changes · approval is paused' : `Revision ${workflow.revision.number} is saved`}</span><button type="submit" className="button secondary compact" disabled={!changed || locked || !fields.response.trim() || !fields.summary.trim()}>{busy === 'save' ? <LoaderCircle size={15} className="spinner" /> : <Save size={15} />}{busy === 'save' ? 'Saving…' : 'Save revision'}</button></div>
        {unresolvedApproval ? <div className="missing-note"><span className="status-dot amber" /><span>The approval result is unknown. Retry the same operation to recover it before editing.</span></div> : <label className={`approval-check ${changed ? 'disabled' : ''}`}><input type="checkbox" checked={confirmed} onChange={(event) => onConfirm(event.target.checked)} disabled={changed || busy !== null || missingContact || forbiddenPriority || !workflow.can_approve} /><span>I reviewed revision {workflow.revision.number} and approve creating this simulated case.</span></label>}
        <button type="button" className="button primary approve-button" onClick={onApprove} disabled={busy !== null || (!unresolvedApproval && blocked)}>{busy === 'approve' ? <LoaderCircle size={17} className="spinner" /> : unresolvedApproval ? <History size={17} /> : <Check size={17} />}{busy === 'approve' ? 'Creating case…' : unresolvedApproval ? 'Recover approval result' : 'Approve & create simulated case'}{busy === null ? <ArrowRight size={17} /> : null}</button>
        <p className="approval-footnote">The server validates access, required information, and this exact saved revision.</p>
      </> : <div className="completed-note"><CheckCircle2 size={17} /> This revision is preserved with the completed case.</div>}
    </form>
  </section>;
}

export function ActivityPanel({ workflow }: { workflow: Workflow }) {
  return <section className="panel activity-panel" aria-labelledby="activity-title">
    <div className="section-heading"><div><span className="eyebrow">PERSISTED ON THE SERVER</span><h2 id="activity-title">Activity & trace</h2></div><History size={18} className="muted" /></div>
    <ol className="activity-list">{workflow.activity.map((event) => <li key={event.id}><span className={`activity-marker ${event.kind.includes('complet') || event.kind.includes('case') ? 'success' : ''}`} /><div><p>{event.message}</p><time dateTime={event.created_at}>{displayDate(event.created_at, true)}</time></div></li>)}</ol>
    <div className="trace-block"><div><Clock3 size={14} /><span>Reference preparation</span><strong>{workflow.generation.latency_ms.toFixed(1)} ms</strong></div><div><BookOpen size={14} /><span>Model usage</span><strong>No model call</strong></div><div><FileText size={14} /><span>Model cost</span><strong>N/A</strong></div><p className="trace-id">Trace ID <code>{workflow.trace_id}</code></p></div>
  </section>;
}
