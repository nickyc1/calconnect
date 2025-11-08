// User types
export interface User {
  id: string;
  email: string;
  external_user_id: string;
  created_at: string;
  updated_at: string;
}

// Account types
export interface UserAccount {
  id: string;
  user_id: string;
  pipedream_account_id: string;
  account_email: string;
  account_name?: string;
  is_source: boolean;
  calendar_id: string;
  color_id?: string;
  created_at: string;
}

// Event mapping types
export interface MirroredEvent {
  event_id: string;
  account_id: string;
  calendar_id: string;
}

export interface EventMapping {
  id: string;
  user_id: string;
  source_event_id: string;
  source_account_id: string;
  source_calendar_id: string;
  mirrored_events: MirroredEvent[];
  created_at: string;
  updated_at: string;
}

// Pipedream source types
export interface PipedreamSource {
  id: string;
  user_id: string;
  source_id: string;
  account_id: string;
  calendar_id: string;
  webhook_url: string;
  status: 'active' | 'paused' | 'deleted';
  created_at: string;
  expires_at?: string;
}

// Webhook event types
export interface WebhookEvent {
  id: string;
  event_id: string;
  user_id: string;
  payload: any;
  processed_at: string;
}

// Google Calendar event types
export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  visibility?: 'default' | 'public' | 'private' | 'confidential';
  transparency?: 'opaque' | 'transparent';
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus?: string;
  }>;
  colorId?: string;
  extendedProperties?: {
    private?: Record<string, string>;
    shared?: Record<string, string>;
  };
  recurringEventId?: string;
  updated?: string;
}

// Webhook payload types
export interface WebhookPayload {
  event_id?: string;
  external_user_id: string;
  event_type: 'created' | 'updated' | 'deleted' | 'cancelled';
  source_event_id: string;
  source_account_id: string;
  source_calendar_id: string;
  google_resource_state?: string;
  google_resource_id?: string;
  google_channel_id?: string;
}
