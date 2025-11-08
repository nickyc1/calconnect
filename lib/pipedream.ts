import { GoogleCalendarEvent } from './types';

// Note: Pipedream SDK types may differ - adjust based on actual SDK
interface PipedreamClient {
  tokens: {
    create: (params: { externalUserId: string }) => Promise<{
      token: string;
      expires_at: string;
      connect_link_url: string;
    }>;
  };
  sources: {
    create: (params: any) => Promise<{ id: string; [key: string]: any }>;
    delete: (sourceId: string) => Promise<void>;
  };
  proxy: {
    get: (params: {
      externalUserId: string;
      accountId: string;
      url: string;
    }) => Promise<any>;
    post: (params: {
      externalUserId: string;
      accountId: string;
      url: string;
      body: any;
    }) => Promise<any>;
    delete: (params: {
      externalUserId: string;
      accountId: string;
      url: string;
    }) => Promise<any>;
  };
}

class PipedreamService {
  private client: PipedreamClient | null = null;

  private getClient(): PipedreamClient {
    if (!this.client) {
      // Import dynamically to avoid issues during build
      const { PipedreamClient } = require('@pipedream/sdk');

      this.client = new PipedreamClient({
        projectEnvironment: process.env.PIPEDREAM_ENVIRONMENT as 'development' | 'production',
        projectId: process.env.PIPEDREAM_PROJECT_ID!,
        clientId: process.env.PIPEDREAM_CLIENT_ID!,
        clientSecret: process.env.PIPEDREAM_CLIENT_SECRET!
      });
    }
    return this.client;
  }

  /**
   * Generate Connect token for user authentication
   */
  async generateConnectToken(externalUserId: string) {
    const client = this.getClient();
    return await client.tokens.create({ externalUserId });
  }

  /**
   * Deploy source for monitoring calendar
   */
  async deploySource(
    externalUserId: string,
    accountId: string,
    calendarId: string,
    webhookUrl: string
  ) {
    const client = this.getClient();
    return await client.sources.create({
      component_code: 'google_calendar-new-or-updated-event-instant',
      configured_props: {
        google_calendar: { account_id: accountId },
        calendarIds: [calendarId],
        http: { endpoint: webhookUrl }
      }
    });
  }

  /**
   * Delete a deployed source
   */
  async deleteSource(sourceId: string) {
    const client = this.getClient();
    return await client.sources.delete(sourceId);
  }

  /**
   * Get calendar event via proxy
   */
  async getCalendarEvent(
    externalUserId: string,
    accountId: string,
    calendarId: string,
    eventId: string
  ): Promise<GoogleCalendarEvent> {
    const client = this.getClient();
    return await client.proxy.get({
      externalUserId,
      accountId,
      url: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`
    });
  }

  /**
   * Create mirror event via proxy
   */
  async createMirrorEvent(
    externalUserId: string,
    accountId: string,
    calendarId: string,
    eventData: {
      start: GoogleCalendarEvent['start'];
      end: GoogleCalendarEvent['end'];
      sourceEventId: string;
      sourceAccountId: string;
      sourceCalendarId: string;
      colorId?: string;
    }
  ): Promise<GoogleCalendarEvent> {
    const client = this.getClient();

    const mirrorData = {
      summary: "Busy",
      start: eventData.start,
      end: eventData.end,
      visibility: "private" as const,
      transparency: "opaque" as const,
      attendees: [],
      colorId: eventData.colorId || "1",
      extendedProperties: {
        private: {
          mircal_source_event_id: eventData.sourceEventId,
          mircal_source_account_id: eventData.sourceAccountId,
          mircal_source_calendar_id: eventData.sourceCalendarId,
          mircal_is_mirror: "true"
        }
      }
    };

    return await client.proxy.post({
      externalUserId,
      accountId,
      url: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      body: mirrorData
    });
  }

  /**
   * Delete event via proxy
   */
  async deleteCalendarEvent(
    externalUserId: string,
    accountId: string,
    calendarId: string,
    eventId: string
  ): Promise<void> {
    const client = this.getClient();
    return await client.proxy.delete({
      externalUserId,
      accountId,
      url: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`
    });
  }
}

// Singleton instance
export const pipedream = new PipedreamService();
