import {
  ArrowRight,
  BookOpen,
  CheckCheck,
  CodeXml,
  Database,
  FileText,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react';

const capabilities = [
  {
    icon: BookOpen,
    title: 'Find the supporting facts',
    description:
      'Order records and relevant policies appear together. Open each source passage to check what supports the draft.',
  },
  {
    icon: LockKeyhole,
    title: 'Respect customer access',
    description:
      'Employees see their assigned customers. Managers can review escalations. Access is checked again when opening evidence or approving a case.',
  },
  {
    icon: ShieldCheck,
    title: 'Keep a person in control',
    description:
      'Review and edit the proposed response and case details. Approval applies to the saved version you reviewed; later edits need another review.',
  },
  {
    icon: CheckCheck,
    title: 'Recover without duplicate cases',
    description:
      'Refresh or retry after a lost response to recover the same saved case. The database protects against creating it twice.',
  },
];

const technicalStages = [
  {
    icon: LockKeyhole,
    title: 'Authorize',
    description:
      'An opaque cookie identifies an isolated visitor sandbox. The server resolves the selected demo role and its customer grants.',
  },
  {
    icon: Database,
    title: 'Read the record',
    description:
      'Order status, delivery proof, and contact details come from versioned synthetic PostgreSQL records.',
  },
  {
    icon: BookOpen,
    title: 'Find evidence',
    description:
      'Permission and applicability filters constrain PostgreSQL full-text ranking. Opening a saved citation repeats authorization.',
  },
  {
    icon: FileText,
    title: 'Prepare a draft',
    description:
      'A deterministic template uses the authorized record and policy references. No provider call, model usage, or AI quality result is claimed.',
  },
  {
    icon: ShieldCheck,
    title: 'Review a revision',
    description:
      'Edits create immutable revisions. Approval checks the revision ID, required contact fields, priority authority, and current source versions.',
  },
  {
    icon: CheckCheck,
    title: 'Create & recover',
    description:
      'Approval, the simulated case, operation result, and activity commit in one transaction. Stable operation IDs and uniqueness constraints protect retries.',
  },
];

export function HowItWorks({ onExplore }: { onExplore: () => void }) {
  return (
    <div className="how-it-works">
      <div className="page-heading">
        <div>
          <h1>About Casework</h1>
          <p>A delivery-support portfolio project by Joseph Haenel.</p>
        </div>
        <button className="button primary" onClick={onExplore}>
          Try the demo <ArrowRight size={17} />
        </button>
      </div>
      <section className="panel project-overview" aria-labelledby="project-problem">
        <h2 id="project-problem">From a missing delivery to a reviewed support case.</h2>
        <p>
          A support employee needs to check the order, find the right policy, and collect complete
          contact details before opening a case. Casework brings those steps into one workspace and
          keeps a person responsible for the final decision.
        </p>
        <p>
          This working demo uses fictional customer records and template drafts. Retrieval,
          permissions, review, and case recovery are implemented. Live AI drafting is the next
          increment.
        </p>
      </section>
      <section
        className="explanation-grid project-capabilities"
        aria-label="What the demo demonstrates"
      >
        {capabilities.map(({ icon: Icon, title, description }) => (
          <article key={title} className="flow-card">
            <div className="flow-card-top">
              <Icon size={20} />
            </div>
            <h2>{title}</h2>
            <p>{description}</p>
          </article>
        ))}
      </section>
      <div className="project-links">
        <a
          className="button secondary"
          href="https://github.com/josephhaenel/opsdesk"
          target="_blank"
          rel="noopener noreferrer"
        >
          <CodeXml size={17} /> View source
        </a>
        <a
          className="button secondary"
          href="https://github.com/josephhaenel/opsdesk#setup-and-verification"
          target="_blank"
          rel="noopener noreferrer"
        >
          <FileText size={17} /> Read the project notes
        </a>
      </div>
      <details className="panel project-details">
        <summary>Technical implementation and demo scenarios</summary>
        <section className="architecture-flow" aria-label="Server request flow">
          {technicalStages.map(({ icon: Icon, title, description }, index) => (
            <article key={title} className="flow-card">
              <div className="flow-card-top">
                <Icon size={20} />
                <span>{String(index + 1).padStart(2, '0')}</span>
              </div>
              <h2>{title}</h2>
              <p>{description}</p>
            </article>
          ))}
        </section>
        <div className="explanation-grid">
          <section className="explanation-card">
            <h2>Architecture</h2>
            <ul>
              <li>
                <strong>React / TypeScript → FastAPI → PostgreSQL</strong>
                <span>
                  The browser handles presentation. Authorization, policy retrieval, revisions, and
                  case execution run on the server. No model has execution authority.
                </span>
              </li>
              <li>
                <strong>Explicit demo boundaries</strong>
                <span>
                  Both roles are selectable within your own sandbox. They demonstrate access rules,
                  not real staff authentication. Cases are simulated and customer responses remain
                  unsent drafts.
                </span>
              </li>
              <li>
                <strong>What comes next</strong>
                <span>
                  A live model adapter, durable generation worker, and measured answer-quality
                  evaluations. Model accuracy, token usage, and costs have not been evaluated yet.
                </span>
              </li>
            </ul>
          </section>
          <section className="explanation-card">
            <h2>Try these scenarios</h2>
            <ul>
              <li>
                <strong>AD-1042 · employee</strong>
                <span>Review a missing delivery and create a standard investigation case.</span>
              </li>
              <li>
                <strong>AD-1043 · employee</strong>
                <span>Add a callback phone number or email before approving the case.</span>
              </li>
              <li>
                <strong>AD-2041 · manager</strong>
                <span>Inspect a disputed signed delivery and manager escalation policies.</span>
              </li>
            </ul>
          </section>
        </div>
      </details>
      <p className="project-credit">
        Built with AI assistance. Source, design decisions, and verification notes are public so the
        implementation can be inspected.
      </p>
    </div>
  );
}
