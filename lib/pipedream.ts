import { PipedreamClient } from '@pipedream/sdk';
import { GoogleCalendarEvent } from './types';

class PipedreamService {
  private client: PipedreamClient | null = null;

  private getClient(): PipedreamClient {
    if (!this.client) {
      this.client = new PipedreamClient({
        clientId: process.env.PIPEDREAM_CLIENT_ID!,
        clientSecret: process.env.PIPEDREAM_CLIENT_SECRET!,
        projectEnvironment: process.env.PIPEDREAM_ENVIRONMENT as 'development' | 'production',
        projectId: process.env.PIPEDREAM_PROJECT_ID!
      });
    }
    return this.client;
  }

  /**
   * Generate Connect token for user authentication
   * @param externalUserId - Your app's user ID
   * @param webhookUri - Optional webhook URL to receive account connection notifications
   */
  async generateConnectToken(externalUserId: string, webhookUri?: string) {
    const client = this.getClient();
    const opts: any = {
      externalUserId: externalUserId
    };

    if (webhookUri) {
      opts.webhookUri = webhookUri;
    }

    return await client.tokens.create(opts);
  }

  /**
   * Deploy trigger (source) for monitoring calendar - new and updated events
   */
  async deploySource(
    externalUserId: string,
    accountId: string,
    calendarId: string,
    webhookUrl: string
  ) {
    const client = this.getClient();
    // Get emit_on_deploy setting from environment variable (default: false)
    const emitOnDeploy = process.env.EMIT_EVENTS_ON_DEPLOY === 'true';

    return await client.triggers.deploy({
      id: 'google_calendar-new-or-updated-event-instant',
      externalUserId: externalUserId,
      configuredProps: {
        googleCalendar: {
          authProvisionId: accountId
        },
        calendarIds: [calendarId]
      },
      webhookUrl: webhookUrl,
      emit_on_deploy: emitOnDeploy
    } as any);
  }

  /**
   * Deploy trigger (source) for monitoring cancelled/deleted events
   * This is a polling source that checks at regular intervals
   */
  async deployCancelledEventSource(
    externalUserId: string,
    accountId: string,
    calendarId: string,
    webhookUrl: string,
    intervalSeconds?: number // Optional: defaults to env var or 300 seconds
  ) {
    const client = this.getClient();
    // Get emit_on_deploy setting from environment variable (default: false)
    const emitOnDeploy = process.env.EMIT_EVENTS_ON_DEPLOY === 'true';

    // Get polling interval from environment variable (default: 300 seconds = 5 minutes)
    const pollInterval = intervalSeconds ??
      parseInt(process.env.DELETED_EVENTS_POLL_INTERVAL_SECONDS || '300', 10);

    return await client.triggers.deploy({
      id: 'google_calendar-event-cancelled',
      externalUserId: externalUserId,
      configuredProps: {
        googleCalendar: {
          authProvisionId: accountId
        },
        calendarId: calendarId,
        timer: {
          intervalSeconds: pollInterval
        }
      },
      webhookUrl: webhookUrl,
      emit_on_deploy: emitOnDeploy
    } as any);
  }

  /**
   * Delete a deployed trigger (source)
   */
  async deleteSource(sourceId: string, externalUserId: string) {
    const client = this.getClient();
    return await client.deployedTriggers.delete(sourceId, {
      externalUserId: externalUserId
    });
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
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`;

    const response = await client.proxy.get({
      url,
      externalUserId,
      accountId
    });

    return response as GoogleCalendarEvent;
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
      recurringEventId?: string; // For recurring event instances
    }
  ): Promise<GoogleCalendarEvent> {
    const client = this.getClient();
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;

    const mirrorData: any = {
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

    // Add recurringEventId if this is a recurring instance
    if (eventData.recurringEventId) {
      mirrorData.extendedProperties.private.mircal_recurring_event_id = eventData.recurringEventId;
    }

    const response = await client.proxy.post({
      url,
      externalUserId,
      accountId,
      body: mirrorData
    });

    return response as GoogleCalendarEvent;
  }

  /**
   * Update mirror event via proxy
   */
  async updateMirrorEvent(
    externalUserId: string,
    accountId: string,
    calendarId: string,
    eventId: string,
    eventData: {
      start: GoogleCalendarEvent['start'];
      end: GoogleCalendarEvent['end'];
    }
  ): Promise<GoogleCalendarEvent> {
    const client = this.getClient();
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`;

    const response = await client.proxy.patch({
      url,
      externalUserId,
      accountId,
      body: {
        start: eventData.start,
        end: eventData.end
      }
    });

    return response as GoogleCalendarEvent;
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
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`;

    await client.proxy.delete({
      url,
      externalUserId,
      accountId
    });
  }
}

// Singleton instance
export const pipedream = new PipedreamService();
