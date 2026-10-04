import { useEffect, useRef } from 'react';
import { BookOpen, ExternalLink, ShieldCheck, X } from 'lucide-react';
import type { Evidence } from './types';
import { displayDate } from './api';

interface Props {
  evidence: Evidence | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}

export function EvidenceDialog({ evidence, loading, error, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return <dialog ref={dialogRef} className="evidence-dialog" aria-labelledby="evidence-title" onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="dialog-heading">
      <span className="eyebrow"><BookOpen size={15} /> POLICY SOURCE</span>
      <button className="icon-button" type="button" onClick={onClose} aria-label="Close evidence"><X size={20} /></button>
    </div>
    <h2 id="evidence-title">{loading ? 'Opening authorized source…' : evidence?.title ?? 'Source unavailable'}</h2>
    {loading ? <p className="muted" role="status">The server is checking access to this policy.</p> : error ? <p className="inline-error" role="alert">{error}</p> : evidence ? <>
      <div className="source-metadata">
        <span>Version {evidence.version}</span><span>{evidence.section}</span><span>Effective {displayDate(evidence.effective_at)}</span>
      </div>
      <blockquote className="source-text">{evidence.text}</blockquote>
      <div className="source-footer"><ShieldCheck size={17} /><span>{evidence.audience === 'manager' ? 'Manager policy' : 'Employee policy'} · Access verified by the server</span></div>
      <p className="small muted source-id"><ExternalLink size={13} /> Source ID <code>{evidence.id}</code></p>
    </> : null}
  </dialog>;
}
