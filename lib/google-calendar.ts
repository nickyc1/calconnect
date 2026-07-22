import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { GoogleCalendarEvent } from './types';
import { withRetry } from '@/utils/retry';

/**
 * Direct Google Calendar API service -- replaces all Pipedream proxy calls.
 * Every method takes an authenticated OAuth2Client.
 * Cost: $0 (Google Calendar API is free, 1M requests/day quota).
 */
class GoogleCalendarService {
  private getCalendar(auth: OAuth2Client): calendar_v3.Calendar {
    return google.calendar({ version: 'v3', auth });
  }

  /**
   * Fetch a single event by ID
   */
  async getEvent(
    auth: OAuth2Client,
    calendarId: string,
    eventId: string
  ): Promise<GoogleCalendarEvent> {
    const calendar = this.getCalendar(auth);
    const { data } = await calendar.events.get({
      calendarId,
      eventId,
    });
    return data as unknown as GoogleCalendarEvent;
  }

  /**
   * Create a mirror "Busy" event in a destination calendar
   */
  async createMirrorEvent(
    auth: OAuth2Client,
    calendarId: string,
    eventData: {
      start: GoogleCalendarEvent['start'];
      end: GoogleCalendarEvent['end'];
      sourceEventId: string;
      sourceAccountId: string;
      sourceCalendarId: string;
      colorId?: string;
      summary?: string;
      recurringEventId?: string;
    }
  ): Promise<GoogleCalendarEvent> {
    const calendar = this.getCalendar(auth);

    const mirrorData: any = {
      summary: eventData.summary || 'Busy',
      start: eventData.start,
      end: eventData.end,
      visibility: 'private',
      transparency: 'opaque',
      attendees: [],
      colorId: eventData.colorId || '8',
      extendedProperties: {
        private: {
          calconnect_source_event_id: eventData.sourceEventId,
          calconnect_source_account_id: eventData.sourceAccountId,
          calconnect_source_calendar_id: eventData.sourceCalendarId,
          calconnect_is_mirror: 'true',
        },
      },
    };

    if (eventData.recurringEventId) {
      mirrorData.extendedProperties.private.calconnect_recurring_event_id =
        eventData.recurringEventId;
    }

    const { data } = await calendar.events.insert({
      calendarId,
      requestBody: mirrorData,
    });

    return data as unknown as GoogleCalendarEvent;
  }

  /**
   * Update a mirror event (time changes only)
   */
  async updateMirrorEvent(
    auth: OAuth2Client,
    calendarId: string,
    eventId: string,
    eventData: {
      start: GoogleCalendarEvent['start'];
      end: GoogleCalendarEvent['end'];
    }
  ): Promise<GoogleCalendarEvent> {
    const calendar = this.getCalendar(auth);

    const { data } = await calendar.events.patch({
      calendarId,
      eventId,
      requestBody: {
        start: eventData.start,
        end: eventData.end,
      },
    });

    return data as unknown as GoogleCalendarEvent;
  }

  /**
   * Delete a calendar event
   */
  async deleteEvent(
    auth: OAuth2Client,
    calendarId: string,
    eventId: string
  ): Promise<void> {
    const calendar = this.getCalendar(auth);
    await calendar.events.delete({
      calendarId,
      eventId,
    });
  }

  /**
   * Set up a push notification watch channel on a calendar.
   * Google will POST to webhookUrl when events change.
   * Channels expire after ~7 days max; must be renewed.
   */
  async watchCalendar(
    auth: OAuth2Client,
    calendarId: string,
    webhookUrl: string
  ): Promise<{
    channelId: string;
    resourceId: string;
    expiration: string;
  }> {
    const calendar = this.getCalendar(auth);
    const channelId = crypto.randomUUID();

    const { data } = await calendar.events.watch({
      calendarId,
      requestBody: {
        id: channelId,
        type: 'web_hook',
        address: webhookUrl,
        // Request max expiration (Google caps at ~7 days)
        expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return {
      channelId: data.id!,
      resourceId: data.resourceId!,
      expiration: new Date(Number(data.expiration)).toISOString(),
    };
  }

  /**
   * Stop a push notification channel
   */
  async stopWatch(
    auth: OAuth2Client,
    channelId: string,
    resourceId: string
  ): Promise<void> {
    const calendar = this.getCalendar(auth);
    await calendar.channels.stop({
      requestBody: {
        id: channelId,
        resourceId,
      },
    });
  }

  /**
   * List events that changed since the last sync token.
   * On first call, pass no syncToken to get current state + a token for next time.
   */
  async listChangedEvents(
    auth: OAuth2Client,
    calendarId: string,
    syncToken?: string
  ): Promise<{
    events: GoogleCalendarEvent[];
    nextSyncToken: string;
  }> {
    const calendar = this.getCalendar(auth);
    const allEvents: GoogleCalendarEvent[] = [];
    let pageToken: string | undefined;
    let nextSyncToken = '';

    do {
      const params: any = {
        calendarId,
        maxResults: 250,
        singleEvents: true,
        showDeleted: true, // Important: includes cancelled events for deletion detection
      };

      if (syncToken) {
        params.syncToken = syncToken;
      } else {
        // First sync: only get events from now forward
        params.timeMin = new Date().toISOString();
      }

      if (pageToken) {
        params.pageToken = pageToken;
      }

      try {
        const { data } = await calendar.events.list(params);
        if (data.items) {
          allEvents.push(...(data.items as unknown as GoogleCalendarEvent[]));
        }
        pageToken = data.nextPageToken || undefined;
        if (data.nextSyncToken) {
          nextSyncToken = data.nextSyncToken;
        }
      } catch (error: any) {
        // 410 Gone means sync token is invalid, need full resync
        if (error.code === 410) {
          console.log('Sync token expired, performing full resync');
          return this.listChangedEvents(auth, calendarId);
        }
        throw error;
      }
    } while (pageToken);

    return { events: allEvents, nextSyncToken };
  }
}

export const googleCalendar = new GoogleCalendarService();
