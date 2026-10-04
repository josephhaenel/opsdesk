import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  History,
  LoaderCircle,
  LockKeyhole,
  Package,
  Save,
  ShieldCheck,
} from 'lucide-react';
import { displayDate } from './api';
import type { DraftFields, Evidence, Order, Role, Workflow } from './types';

export function OrderDetails({ order }: { order: Order }) {
  return (
    <section className="panel order-detail" aria-labelledby="order-detail-title">
      <div className="section-heading">
        <h2 id="order-detail-title">Order details</h2>
        <Package size={18} className="muted" />
      </div>
      <div className="order-title">
        <span>{order.id}</span>
        <span className={`badge ${order.delivered_at ? 'neutral' : 'warning'}`}>
          {order.delivery_status.replaceAll('_', ' ')}
        </span>
      </div>
      <p className="customer-name">{order.customer_name}</p>
      <dl className="details-list">
        <div>
          <dt>Expected delivery</dt>
          <dd>{displayDate(order.expected_at)}</dd>
        </div>
        <div>
          <dt>Delivery record</dt>
          <dd>
            {order.delivered_at ? displayDate(order.delivered_at, true) : 'No delivery recorded'}
          </dd>
        </div>
        <div>
          <dt>Proof of delivery</dt>
          <dd>{order.proof_of_delivery || 'None recorded'}</dd>
        </div>
        <div>
          <dt>Record version</dt>
          <dd>v{order.version}</dd>
        </div>
      </dl>
      <div className="line-items">
        <span className="eyebrow">ORDER ITEMS</span>
        {order.items.map((item, index) => (
          <div key={`${item.name}-${index}`}>
            <span>{item.name}</span>
            <span className="muted">× {item.quantity}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function EvidencePanel({
  workflow,
  onOpen,
}: {
  workflow: Workflow;
  onOpen: (evidence: Evidence) => void;
}) {
  return (
    <section className="panel evidence-panel" aria-labelledby="evidence-panel-title">
      <div className="section-heading">
        <h2 id="evidence-panel-title">Supporting policies</h2>
        <span className="count-label" aria-label={`${workflow.evidence.length} sources`}>
          {workflow.evidence.length}
        </span>
      </div>
      <p className="panel-intro">Open a source to read the full policy.</p>
      <div className="evidence-list">
        {workflow.evidence.length ? (
          workflow.evidence.map((source, index) => (
            <button
              type="button"
              key={source.id}
              className="evidence-card"
              onClick={() => onOpen(source)}
              aria-label={`Open source ${index + 1}: ${source.title}`}
            >
              <span className="source-number">{String(index + 1).padStart(2, '0')}</span>
              <span className="evidence-content">
                <strong>{source.title}</strong>
                <span>
                  {source.section} · v{source.version}
                </span>
                <span className="evidence-excerpt">{source.text}</span>
                {source.audience === 'manager' ? (
                  <span className="policy-role">
                    <LockKeyhole size={12} /> Manager policy
                  </span>
                ) : null}
              </span>
              <ChevronRight size={17} className="muted" />
            </button>
          ))
        ) : (
          <p className="empty-note">No applicable evidence is available for this report.</p>
        )}
      </div>
      <div className="quiet-note">
        <ShieldCheck size={14} /> Sources are checked again when you open them.
      </div>
    </section>
  );
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

export function ReviewPanel({
  workflow,
  fields,
  role,
  changed,
  confirmed,
  busy,
  unresolvedApproval,
  onChange,
  onConfirm,
  onSave,
  onApprove,
}: ReviewProps) {
  const completed = workflow.state === 'completed';
  const locked = completed || busy !== null || unresolvedApproval;
  const missingContact = !fields.contact_name.trim() || !fields.callback.trim();
  const forbiddenPriority = fields.priority === 'urgent' && role !== 'manager';
  const blocked =
    changed || missingContact || forbiddenPriority || !workflow.can_approve || !confirmed;
  const referenceMarker = '\n\nSupporting policy references:';
  const referenceIndex = fields.response.indexOf(referenceMarker);
  const reply = referenceIndex < 0 ? fields.response : fields.response.slice(0, referenceIndex);
  const references =
    referenceIndex < 0 ? '' : fields.response.slice(referenceIndex + referenceMarker.length).trim();
  function update<K extends keyof DraftFields>(key: K, value: DraftFields[K]) {
    onChange({ ...fields, [key]: value });
  }

  return (
    <section
      className={`panel review-panel ${completed ? 'completed-panel' : ''}`}
      aria-labelledby="review-panel-title"
    >
      <div className="section-heading">
        <h2 id="review-panel-title">{completed ? 'What you approved' : 'Suggested reply'}</h2>
        <span className="badge neutral">
          {changed ? 'Unsaved changes' : `Saved revision ${workflow.revision.number}`}
        </span>
      </div>
      <div className="review-preview">
        <p className="reply-preview">{reply}</p>
        <p className="small muted">Draft only. This reply will not be sent.</p>
        {references ? (
          <details className="response-references">
            <summary>Policy reference IDs</summary>
            <p>{references}</p>
          </details>
        ) : null}
      </div>
      <div className="case-preview">
        <h3>{completed ? 'Saved case details' : 'The case you would create'}</h3>
        <p>{fields.summary}</p>
        <dl className="case-preview-details">
          <div>
            <dt>Contact</dt>
            <dd>{fields.contact_name || 'Name needed'}</dd>
          </div>
          <div>
            <dt>Phone or email</dt>
            <dd>{fields.callback || 'Contact details needed'}</dd>
          </div>
          <div>
            <dt>Priority</dt>
            <dd>{fields.priority === 'urgent' ? 'Urgent escalation' : 'Standard investigation'}</dd>
          </div>
        </dl>
      </div>
      {!completed ? (
        <>
          <details className="edit-disclosure" open={missingContact || changed ? true : undefined}>
            <summary>
              {missingContact
                ? 'Add the missing contact details'
                : 'Edit the reply or case details'}
            </summary>
            <form
              className="review-editor"
              onSubmit={(event) => {
                event.preventDefault();
                if (!locked && changed) onSave();
              }}
            >
              <label className="field-label" htmlFor="draft-response">
                Customer reply
              </label>
              <textarea
                id="draft-response"
                rows={5}
                value={fields.response}
                onChange={(event) => update('response', event.target.value)}
                disabled={locked}
                maxLength={8000}
                className="response-textarea"
              />
              <label className="field-label" htmlFor="case-summary">
                Case summary
              </label>
              <textarea
                id="case-summary"
                rows={3}
                value={fields.summary}
                onChange={(event) => update('summary', event.target.value)}
                disabled={locked}
                maxLength={1200}
              />
              <div className="contact-fields">
                <div>
                  <label className="field-label" htmlFor="contact-name">
                    Contact name <span aria-hidden="true">*</span>
                  </label>
                  <input
                    id="contact-name"
                    value={fields.contact_name}
                    onChange={(event) => update('contact_name', event.target.value)}
                    disabled={locked}
                    maxLength={120}
                    aria-required="true"
                    aria-describedby={
                      workflow.missing_fields.length ? 'required-information' : undefined
                    }
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="callback">
                    Phone or email <span aria-hidden="true">*</span>
                  </label>
                  <input
                    id="callback"
                    type="text"
                    value={fields.callback}
                    onChange={(event) => update('callback', event.target.value)}
                    disabled={locked}
                    maxLength={200}
                    aria-required="true"
                    aria-describedby={
                      workflow.missing_fields.length ? 'required-information' : undefined
                    }
                  />
                </div>
              </div>
              <fieldset className="priority-choices">
                <legend>Case priority</legend>
                <label className="priority-choice">
                  <input
                    type="radio"
                    name="priority"
                    value="standard"
                    checked={fields.priority === 'standard'}
                    onChange={() => update('priority', 'standard')}
                    disabled={locked}
                  />
                  <span>Standard investigation</span>
                </label>
                <label className="priority-choice">
                  <input
                    type="radio"
                    name="priority"
                    value="urgent"
                    checked={fields.priority === 'urgent'}
                    onChange={() => update('priority', 'urgent')}
                    disabled={locked || role !== 'manager'}
                    aria-describedby={role !== 'manager' ? 'priority-permission' : undefined}
                  />
                  <span>Urgent escalation</span>
                </label>
              </fieldset>
              {role !== 'manager' ? (
                <p className="small muted" id="priority-permission">
                  <LockKeyhole size={14} /> Urgent escalation requires manager access.
                </p>
              ) : null}
              {workflow.missing_fields.length ? (
                <p className="missing-note" id="required-information">
                  {missingContact
                    ? 'Add a contact name and a phone number or email before creating this case.'
                    : 'Contact details added. Save changes to make this case ready for review.'}
                </p>
              ) : null}
              {changed || busy === 'save' ? (
                <div className="save-row">
                  <span className="small muted">Save these changes before approving.</span>
                  <button
                    type="submit"
                    className="button secondary compact"
                    disabled={
                      !changed || locked || !fields.response.trim() || !fields.summary.trim()
                    }
                  >
                    {busy === 'save' ? (
                      <LoaderCircle size={15} className="spinner" />
                    ) : (
                      <Save size={15} />
                    )}
                    {busy === 'save' ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
              ) : null}
            </form>
          </details>
          <div className="confirmation-block">
            {forbiddenPriority ? (
              <p className="inline-error">
                This urgent case requires manager access. Switch access or save standard priority.
              </p>
            ) : null}
            {!workflow.can_approve && !workflow.missing_fields.length && !forbiddenPriority ? (
              <p className="missing-note">
                {workflow.order.delivery_status === 'delivered'
                  ? 'The record says this order was delivered. A missing-delivery case cannot be created for this record.'
                  : 'The saved record and policies do not currently permit this case.'}
              </p>
            ) : null}
            {changed ? (
              <p className="inline-error" role="status">
                Save your changes to review the updated version.
              </p>
            ) : null}
            {unresolvedApproval ? (
              <p className="missing-note">
                The result has not arrived. Recover the existing approval before editing or trying
                another action.
              </p>
            ) : (
              <label className={`approval-check ${changed ? 'disabled' : ''}`}>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => onConfirm(event.target.checked)}
                  disabled={
                    changed ||
                    busy !== null ||
                    missingContact ||
                    forbiddenPriority ||
                    !workflow.can_approve
                  }
                />
                <span>
                  I reviewed the reply and case details in saved revision {workflow.revision.number}{' '}
                  and approve creating this demo case.
                </span>
              </label>
            )}
            <button
              type="button"
              className="button primary approve-button"
              onClick={onApprove}
              disabled={busy !== null || (!unresolvedApproval && blocked)}
            >
              {busy === 'approve' ? (
                <LoaderCircle size={17} className="spinner" />
              ) : unresolvedApproval ? (
                <History size={17} />
              ) : (
                <Check size={17} />
              )}
              {busy === 'approve'
                ? 'Creating case…'
                : unresolvedApproval
                  ? 'Recover existing case'
                  : 'Create demo case'}
              {busy === null ? <ArrowRight size={17} /> : null}
            </button>
            <p className="approval-footnote">
              Creates one simulated support case. No customer message is sent.
            </p>
          </div>
        </>
      ) : (
        <div className="completed-note">
          <CheckCircle2 size={17} /> Saved revision {workflow.revision.number} is preserved with
          this case.
        </div>
      )}
    </section>
  );
}

export function ActivityPanel({ workflow }: { workflow: Workflow }) {
  return (
    <section className="panel activity-panel" aria-labelledby="activity-title">
      <div className="section-heading">
        <h2 id="activity-title">Activity</h2>
        <History size={18} className="muted" />
      </div>
      <ol className="activity-list">
        {workflow.activity.map((event) => (
          <li key={event.id}>
            <span
              className={`activity-marker ${event.kind.includes('complet') || event.kind.includes('case') ? 'success' : ''}`}
            />
            <div>
              <p>{event.message}</p>
              <time dateTime={event.created_at}>{displayDate(event.created_at, true)}</time>
            </div>
          </li>
        ))}
      </ol>
      <details className="trace-details">
        <summary>Technical details</summary>
        <div className="trace-block">
          <div>
            <Clock3 size={15} />
            <span>Reference preparation</span>
            <strong>{workflow.generation.latency_ms.toFixed(1)} ms</strong>
          </div>
          <div>
            <BookOpen size={15} />
            <span>Model usage</span>
            <strong>No model call</strong>
          </div>
          <div>
            <FileText size={15} />
            <span>Model cost</span>
            <strong>N/A</strong>
          </div>
          <p className="trace-id">
            Trace ID <code>{workflow.trace_id}</code>
          </p>
        </div>
      </details>
    </section>
  );
}
