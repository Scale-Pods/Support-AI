export interface User {
  id: string
  email: string
  full_name: string
  role: 'client' | 'admin'
  product_id: string | null
  is_admin: boolean
  created_at: string
  products?: { name: string; slug: string }
}

export interface Product {
  id: string
  name: string
  slug: string
  is_active: boolean
  created_by: string
  created_at: string
  creator?: { full_name: string; email: string }
}

export interface Workflow {
  id: string
  n8n_workflow_id?: string | null
  name: string
  webhook_path: string | null
  is_active: boolean
  status: string
  has_webhook: boolean
  steps_count?: number
  created_at?: string
}

export interface WorkflowContext {
  workflows: Workflow[]
}

export interface MessageFile { name: string; type: string; data?: string; url?: string }

export interface Message {
  id: string
  session_id: string
  sender: 'user' | 'ai' | 'agent'
  content: string
  category?: string
  confidence?: number
  created_at: string
  should_escalate?: string
  files?: MessageFile[] | null
}

export interface Session {
  id: string
  session_token: string
  user_id: string
  product_id: string | null
  channel: string
  created_at: string
  public_messages?: Message[]
}

export interface Ticket {
  id: string
  session_id: string
  user_id: string
  product_id: string
  title: string
  description: string
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  priority: 'low' | 'medium' | 'high' | 'critical'
  assigned_team: string
  admin_only: boolean
  created_at: string
  resolved_at: string | null
}

export interface Escalation {
  id: string
  ticket_id: string
  session_id?: string | null
  reason: string
  triggered_by: string
  confidence_at_trigger: number
  routed_to: string
  client_reason?: string | null
  client_note?: string | null
  created_at: string
}

export interface AuditLog {
  id: string
  user_id: string
  session_id: string
  query: string
  response_preview: string
  category: string
  confidence: number
  escalated: boolean
  sentiment: string
  created_at: string
}

export interface ChatResponse {
  reply: string
  confidence: number
  category: string
  should_escalate: boolean
  sources: string[]
  suggested_actions: string[]
  sentiment: string
  session_id: string
}
