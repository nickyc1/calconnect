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
  account_id: string;
  account_display_name: string;
  google_email: string;
  is_source_account: boolean;
  is_active: boolean;
  calendar_id: string;
  color_id?: string;
  mirror_color_id?: string;
  mirror_label?: string;
  refresh_token: string;
  access_token: string;
  token_expiry: string;
  sync_token?: string;
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
  is_recurring: boolean;
  recurring_event_id?: string;
  created_at: string;
  updated_at: string;
}

// Watch channel types (replaces PipedreamSource)
export interface WatchChannel {
  id: string;
  user_id: string;
  account_id: string;
  calendar_id: string;
  channel_id: string;
  resource_id: string;
  expiration: string;
  webhook_url: string;
  sync_token?: string;
  created_at: string;
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
  status?: string;
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
  recurrence?: string[];
  recurringEventId?: string;
  updated?: string;
}
