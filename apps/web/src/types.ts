export type Role = 'employee' | 'manager';
export type Priority = 'standard' | 'urgent';

export interface Session {
  session_id: string;
  role: Role;
  csrf_token: string;
  company: string;
  generation_mode: 'reference';
}

export interface Order {
  id: string;
  customer_id: string;
  customer_name: string;
  delivery_status: string;
  expected_at: string;
  delivered_at: string | null;
  proof_of_delivery: string | null;
  items: { name: string; quantity: number }[];
  contact_name: string;
  callback: string;
  version: number;
}

export interface Revision {
  id: string;
  number: number;
  response: string;
  summary: string;
  priority: Priority;
  contact_name: string;
  callback: string;
  evidence_ids: string[];
  created_at: string;
}

export interface Evidence {
  id: string;
  title: string;
  version: number;
  section: string;
  text: string;
  audience: Role;
  effective_at: string;
  score: number;
}

export interface DraftFields {
  response: string;
  summary: string;
  priority: Priority;
  contact_name: string;
  callback: string;
}

export interface Workflow {
  id: string;
  order: Order;
  message: string;
  state: 'needs_information' | 'needs_review' | 'completed' | 'failed';
  revision: Revision;
  evidence: Evidence[];
  missing_fields: string[];
  case: null | { id: string; priority: Priority; summary: string; created_at: string };
  trace_id: string;
  created_at: string;
  activity: { id: string; kind: string; message: string; created_at: string }[];
  generation: {
    mode: 'reference';
    provider: null;
    model: null;
    input_tokens: null;
    output_tokens: null;
    estimated_cost_usd: null;
    latency_ms: number;
  };
  can_approve: boolean;
}

export interface PendingCreate {
  operation_id: string;
  order_id: string;
  message: string;
}

export interface PendingApproval {
  workflow_id: string;
  revision_id: string;
  operation_id: string;
}
