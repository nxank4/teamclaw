/**
 * Types for async webhook-based approval flow.
 */

export interface WebhookApprovalConfig {
  url: string;
  secret: string;
  provider: "slack" | "generic";
  timeoutSeconds: number;
  retryAttempts: number;
  callbackBaseUrl: string;
  sessionId: string;
}

export interface ApprovalWebhookPayload {
  event: "approval_request";
  sessionId: string;
  taskId: string;
  task: {
    description: string;
    assignedTo: string;
    confidence: number | null;
    resultPreview: string;
    reworkCount: number;
  };
  callbackUrl: string;
  expiresAt: number;
  approveToken: string;
  rejectToken: string;
  escalateToken: string;
}

export interface WebhookCallbackBody {
  token: string;
  feedback?: string;
  respondedBy?: string;
}

export interface WebhookTokenPayload {
  taskId: string;
  action: "approve" | "reject" | "escalate";
  sessionId: string;
  expiresAt: number;
}
