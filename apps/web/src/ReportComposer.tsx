import { ArrowRight, ClipboardList, LoaderCircle, Search, ShieldCheck } from 'lucide-react';
import type { Order, PendingCreate } from './types';

interface ReportComposerProps {
  orders: Order[];
  orderId: string;
  message: string;
  pendingCreate: PendingCreate | null;
  busy: string | null;
  isWorking: boolean;
  onOrderChange: (id: string) => void;
  onMessageChange: (message: string) => void;
  onPrepare: () => void;
}

export function ReportComposer({
  orders,
  orderId,
  message,
  pendingCreate,
  busy,
  isWorking,
  onOrderChange,
  onMessageChange,
  onPrepare,
}: ReportComposerProps) {
  return (
    <section className="panel report-composer" aria-labelledby="composer-title">
      <div className="section-heading">
        <h2 id="composer-title">Customer report</h2>
        <ClipboardList size={18} className="muted" />
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onPrepare();
        }}
      >
        <label className="field-label" htmlFor="order-id">
          Order
        </label>
        <select
          id="order-id"
          value={orderId}
          disabled={isWorking || pendingCreate !== null}
          onChange={(event) => onOrderChange(event.target.value)}
        >
          {orders.map((order) => (
            <option key={order.id} value={order.id}>
              {order.id} · {order.customer_name}
            </option>
          ))}
        </select>
        <label className="field-label" htmlFor="report-message">
          What happened?
        </label>
        <textarea
          id="report-message"
          rows={4}
          value={message}
          onChange={(event) => onMessageChange(event.target.value)}
          disabled={isWorking || pendingCreate !== null}
          maxLength={3000}
        />
        <p className="form-hint">
          <ShieldCheck size={15} />
          Showing orders available to your demo role.
        </p>
        {pendingCreate ? (
          <div className="missing-note">
            <span className="status-dot amber" />
            <span>
              A previous request needs recovery. Retry uses the same report and operation ID.
            </span>
          </div>
        ) : null}
        <button
          className="button primary prepare-button"
          type="submit"
          disabled={isWorking || !orderId || !message.trim()}
        >
          {busy === 'create' ? (
            <LoaderCircle size={17} className="spinner" />
          ) : (
            <Search size={17} />
          )}
          {busy === 'create'
            ? 'Preparing investigation…'
            : pendingCreate
              ? 'Recover investigation'
              : 'Investigate report'}
          {busy !== 'create' ? <ArrowRight size={17} /> : null}
        </button>
      </form>
    </section>
  );
}
