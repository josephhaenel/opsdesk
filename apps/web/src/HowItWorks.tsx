import { ArrowRight, BookOpen, CheckCheck, Database, FileText, LockKeyhole, ShieldCheck } from 'lucide-react';

const stages = [
  { icon: LockKeyhole, title: 'Authorize', description: 'The server issues a demo session and checks which customer accounts the selected role can access.' },
  { icon: Database, title: 'Read the record', description: 'Order status, delivery proof, and contact details come from versioned synthetic records.' },
  { icon: BookOpen, title: 'Find evidence', description: 'Applicable policies are filtered by permission before lexical ranking. Each passage can be inspected.' },
  { icon: FileText, title: 'Prepare a draft', description: 'Reference mode uses a deterministic template. There is no live language model in this increment.' },
  { icon: ShieldCheck, title: 'Review a revision', description: 'An edit creates a new saved revision. Human approval references the exact immutable revision on screen.' },
  { icon: CheckCheck, title: 'Create & recover', description: 'Approval, simulated case creation, and completion commit together. The same operation ID recovers the result on retry.' },
];

export function HowItWorks({ onExplore }: { onExplore: () => void }) {
  return <div className="how-it-works">
    <div className="page-heading"><div><span className="eyebrow">AN INSPECTABLE ENGINEERING PROJECT</span><h1>Follow the whole request.</h1><p>A small support workflow with explicit boundaries at every step.</p></div><button className="button primary" onClick={onExplore}>Explore the workspace <ArrowRight size={17} /></button></div>
    <section className="architecture-flow" aria-label="Request flow">{stages.map(({ icon: Icon, title, description }, index) => <article key={title} className="flow-card"><div className="flow-card-top"><Icon size={20} /><span>{String(index + 1).padStart(2, '0')}</span></div><h2>{title}</h2><p>{description}</p></article>)}</section>
    <div className="explanation-grid"><section className="panel explanation-card"><span className="eyebrow">WHAT YOU CAN TRY</span><h2>Three different paths</h2><ul><li><strong>AD-1042</strong><span>Review a missing delivery and create a standard investigation case.</span></li><li><strong>AD-1043</strong><span>Add the missing callback number and save a revision before approving.</span></li><li><strong>AD-2041 · manager</strong><span>Inspect a disputed signed delivery and manager escalation policies.</span></li></ul></section><section className="panel explanation-card"><span className="eyebrow">WHAT THIS DEMO ESTABLISHES</span><h2>Boundaries you can inspect</h2><ul><li><strong>Role checks live on the server</strong><span>Selectable roles demonstrate permissions within your own visitor sandbox.</span></li><li><strong>Retries have a stable identity</strong><span>The database enforces duplicate prevention; the browser preserves the operation ID.</span></li><li><strong>The action is deliberately scoped</strong><span>All records and cases are synthetic. Responses are stored as drafts and never sent.</span></li></ul></section></div>
    <div className="roadmap-note"><span className="badge warning">CURRENT INCREMENT</span><p>Reference drafting, policy retrieval, human approval, and simulated execution. Live model integration, durable worker recovery, and model quality evaluations are future work.</p></div>
  </div>;
}
