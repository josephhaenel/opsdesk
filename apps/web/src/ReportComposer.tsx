import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  LoaderCircle,
  Package,
  UserRound,
} from 'lucide-react';
import { SelectField } from './SelectField';
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
  onScenarioChange?: (id: string) => void;
  selectedScenario?: string;
}

const scenarios = [
  {
    id: 'AD-1042',
    title: 'Missing delivery',
    description: 'Review a delivery report, then approve a standard support case.',
    recommended: true,
    icon: Package,
  },
  {
    id: 'AD-1043',
    title: 'Missing contact details',
    description: 'See why the case is blocked, then add the missing contact information.',
    recommended: false,
    icon: UserRound,
  },
];

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
  onScenarioChange,
  selectedScenario,
}: ReportComposerProps) {
  const locked = isWorking || pendingCreate !== null;
  const selectedOrder = orders.find((order) => order.id === orderId);
  const activeScenario = selectedScenario ?? orderId;
  const availableScenarios = scenarios.filter((scenario) =>
    orders.some((order) => order.id === scenario.id),
  );

  return (
    <section className="panel report-composer" aria-labelledby="composer-title">
      <div className="section-heading">
        <h2 id="composer-title">Choose a scenario</h2>
        <ClipboardList size={18} className="muted" />
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onPrepare();
        }}
      >
        {availableScenarios.length ? (
          <div className="scenario-options" role="group" aria-label="Demo scenarios">
            {availableScenarios.map((scenario) => {
              const Icon = scenario.icon;
              const selected = activeScenario === scenario.id;
              return (
                <button
                  key={scenario.id}
                  type="button"
                  className={`scenario-card${selected ? ' is-selected' : ''}`}
                  aria-pressed={selected}
                  aria-describedby={`scenario-${scenario.id}-description`}
                  disabled={locked}
                  onClick={() => (onScenarioChange ?? onOrderChange)(scenario.id)}
                >
                  <span className="scenario-icon">
                    <Icon size={20} aria-hidden="true" />
                  </span>
                  <span className="scenario-card-content">
                    <strong>{scenario.title}</strong>
                    <span
                      className="scenario-description"
                      id={`scenario-${scenario.id}-description`}
                    >
                      {scenario.description}
                    </span>
                    {scenario.recommended ? (
                      <span className="scenario-tag">Recommended</span>
                    ) : null}
                  </span>
                  {selected ? (
                    <CheckCircle2 size={18} className="scenario-check" aria-hidden="true" />
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}
        <div className="selected-order-context">
          <strong>{selectedOrder?.customer_name ?? 'Selected order'}</strong>
          <span>{orderId}</span>
        </div>
        <div className="report-preview">
          <span className="report-preview-label">Customer report</span>
          <blockquote>{message}</blockquote>
        </div>
        <details className="report-options">
          <summary>Edit report or choose another order</summary>
          <div className="report-options-body">
            <SelectField
              id="order-id"
              label="Order"
              value={orderId}
              disabled={locked}
              options={orders.map((order) => ({
                value: order.id,
                label: `${order.customer_name} · ${order.id}`,
                description:
                  order.delivery_status === 'disputed'
                    ? 'Disputed delivery · Manager review'
                    : order.delivery_status === 'delivered'
                      ? 'Recorded as delivered'
                      : !order.callback
                        ? 'Missing contact details'
                        : order.delivery_status === 'in_transit'
                          ? 'Delivery in progress'
                          : 'Missing delivery',
              }))}
              onChange={onOrderChange}
            />
            <label className="field-label" htmlFor="report-message">
              What happened?
            </label>
            <textarea
              id="report-message"
              rows={4}
              value={message}
              onChange={(event) => onMessageChange(event.target.value)}
              disabled={locked}
              maxLength={3000}
            />
          </div>
        </details>
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
            <ClipboardList size={17} />
          )}
          {busy === 'create'
            ? 'Preparing case…'
            : pendingCreate
              ? 'Recover draft'
              : 'Prepare a support case'}
          {busy !== 'create' ? <ArrowRight size={17} /> : null}
        </button>
      </form>
    </section>
  );
}
