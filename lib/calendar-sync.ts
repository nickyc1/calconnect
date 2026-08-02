import { googleAuth } from './google-auth';
import { googleCalendar } from './google-calendar';
import { supabaseAdmin } from './supabase';
import { withRetry } from '@/utils/retry';
import { AppError } from '@/utils/error-handler';
import { MirroredEvent } from './types';
import {
  isRecurringEvent,
  expandRecurringEvent,
  generateInstanceId,
} from './recurring-events';
import { eventOverlapsWindow, type MirrorWindow } from './mirror-window';

export class CalendarSyncService {
  /**
   * Create mirror events in destination accounts.
   * Handles both single events and recurring events.
   */
  async createMirrorEvents(
    userId: string,
    sourceAccountId: string,
    sourceCalendarId: string,
    sourceEvent: any,
    destAccounts: any[],
    viaBackfill: boolean = false,
  ) {
    const sourceEventId = sourceEvent.id;
    console.log(`Creating mirrors for event: ${sourceEventId} (${sourceEvent.summary})`);

    // Idempotency check
    const { data: existingMapping } = await (supabaseAdmin as any)
      .from('event_mappings')
      .select('*')
      .eq('user_id', userId)
      .eq('source_event_id', sourceEventId)
      .eq('source_calendar_id', sourceCalendarId)
      .single();

    if (existingMapping) {
      console.log(`Event ${sourceEventId} already mapped, skipping`);
      return {
        successful: existingMapping.mirrored_events || [],
        failed: [],
      };
    }

    // Fetch the source account's per-source customization (color + label + window).
    // These govern how mirrored blocks appear on the OTHER calendars, so a
    // user can tell "block from personal" apart from "block from side project"
    // at a glance without event details leaking.
    const { sourceMirrorColorId, sourceMirrorLabel, mirrorWindow } =
      await this.getSourceMirrorConfig(userId, sourceAccountId);

    // Handle recurring events. Window filtering happens per-instance inside
    // createRecurringMirrors because different instances of the same series
    // land on different days/times.
    if (isRecurringEvent(sourceEvent)) {
      console.log('Detected recurring event, expanding instances...');
      return await this.createRecurringMirrors(
        userId,
        sourceAccountId,
        sourceCalendarId,
        sourceEvent,
        destAccounts,
        sourceMirrorColorId,
        sourceMirrorLabel,
        mirrorWindow,
        viaBackfill,
      );
    }

    // Pro feature: time/day window. If the source has a window configured and
    // this single (non-recurring) event doesn't overlap, skip mirroring.
    if (mirrorWindow) {
      const overlaps = eventOverlapsWindow(
        {
          startDateTime: sourceEvent.start?.dateTime,
          endDateTime: sourceEvent.end?.dateTime,
          startDate: sourceEvent.start?.date,
          endDate: sourceEvent.end?.date,
          timeZone: sourceEvent.start?.timeZone,
        },
        mirrorWindow,
      );
      if (!overlaps) {
        console.log(`Event ${sourceEventId} outside mirror window, skipping`);
        return { successful: [], failed: [] };
      }
    }

    console.log(`Creating mirrors in ${destAccounts.length} destination calendar(s)`);

    // Create mirrors in parallel
    const mirrorPromises = destAccounts.map(async (dest: any) => {
      try {
        const auth = await googleAuth.getClientByAccountId(userId, dest.account_id);
        const result = await withRetry(() =>
          googleCalendar.createMirrorEvent(auth, 'primary', {
            start: sourceEvent.start,
            end: sourceEvent.end,
            sourceEventId,
            sourceAccountId,
            sourceCalendarId,
            colorId: sourceMirrorColorId,
            summary: sourceMirrorLabel,
          })
        );

        return {
          success: true,
          mirror: {
            event_id: result.id,
            account_id: dest.account_id,
            calendar_id: 'primary',
          },
        };
      } catch (error) {
        console.error(`Failed to create mirror in account ${dest.account_id}:`, error);
        return { success: false, error };
      }
    });

    const results = await Promise.all(mirrorPromises);
    const successful = results
      .filter((r) => r.success)
      .map((r) => r.mirror) as MirroredEvent[];
    const failed = results.filter((r) => !r.success);

    if (successful.length === 0) {
      console.error('All mirror creations failed');
      return { successful: [], failed };
    }

    console.log(`Successfully created ${successful.length} mirror(s)`);

    // Store mapping. via_backfill=true if this mirror was created during a
    // Pro-tier backfill of existing events (lets us later delete only these
    // if the user turns the toggle off).
    await (supabaseAdmin as any).from('event_mappings').insert({
      user_id: userId,
      source_event_id: sourceEventId,
      source_account_id: sourceAccountId,
      source_calendar_id: sourceCalendarId,
      mirrored_events: successful,
      is_recurring: false,
      via_backfill: viaBackfill,
    });

    return { successful, failed };
  }

  /**
   * Look up the source account's mirror display config. Returns safe defaults
   * ('8' = Graphite, 'Busy', null window = 24/7) so this is safe to call in
   * envs that haven't run migrations 015 or 018 yet.
   */
  private async getSourceMirrorConfig(userId: string, sourceAccountId: string) {
    const { data } = await (supabaseAdmin as any)
      .from('user_accounts')
      .select('mirror_color_id, mirror_label, mirror_window')
      .eq('user_id', userId)
      .eq('account_id', sourceAccountId)
      .maybeSingle();

    return {
      sourceMirrorColorId: (data && data.mirror_color_id) || '8',
      sourceMirrorLabel: (data && data.mirror_label) || 'Busy',
      mirrorWindow: (data && data.mirror_window) as MirrorWindow | null,
    };
  }

  /**
   * Create mirrors for a recurring event by expanding all instances
   */
  private async createRecurringMirrors(
    userId: string,
    sourceAccountId: string,
    sourceCalendarId: string,
    sourceEvent: any,
    destAccounts: any[],
    sourceMirrorColorId: string,
    sourceMirrorLabel: string,
    mirrorWindow: MirrorWindow | null,
    viaBackfill: boolean = false,
  ) {
    const baseEventId = sourceEvent.id;
    const instances = expandRecurringEvent(sourceEvent);

    if (instances.length === 0) {
      console.error('Failed to expand recurring event');
      return { successful: [], failed: [] };
    }

    console.log(
      `Creating mirrors for ${instances.length} instances in ${destAccounts.length} destination(s)`
    );

    const allSuccessful: MirroredEvent[] = [];
    const allFailed: any[] = [];

    for (const instance of instances) {
      // Per-instance window check for recurring events
      if (mirrorWindow) {
        const overlaps = eventOverlapsWindow(
          {
            startDateTime: instance.start?.dateTime,
            endDateTime: instance.end?.dateTime,
            startDate: instance.start?.date,
            endDate: instance.end?.date,
            timeZone: instance.start?.timeZone || sourceEvent.start?.timeZone,
          },
          mirrorWindow,
        );
        if (!overlaps) continue;
      }

      const instanceId = generateInstanceId(baseEventId, instance.instanceDate);

      const mirrorPromises = destAccounts.map(async (dest: any) => {
        try {
          const auth = await googleAuth.getClientByAccountId(userId, dest.account_id);
          const result = await withRetry(() =>
            googleCalendar.createMirrorEvent(auth, 'primary', {
              start: instance.start,
              end: instance.end,
              sourceEventId: instanceId,
              sourceAccountId,
              sourceCalendarId,
              colorId: sourceMirrorColorId,
            summary: sourceMirrorLabel,
              recurringEventId: baseEventId,
            })
          );

          return {
            success: true,
            mirror: {
              event_id: result.id,
              account_id: dest.account_id,
              calendar_id: 'primary',
              instance_date: instance.instanceDate,
            },
          };
        } catch (error) {
          console.error(`Failed to create mirror for instance ${instanceId}:`, error);
          return { success: false, error };
        }
      });

      const results = await Promise.all(mirrorPromises);
      const successful = results.filter((r) => r.success).map((r) => r.mirror) as MirroredEvent[];
      const failed = results.filter((r) => !r.success);

      allSuccessful.push(...successful);
      allFailed.push(...failed);

      if (successful.length > 0) {
        await (supabaseAdmin as any).from('event_mappings').insert({
          user_id: userId,
          source_event_id: instanceId,
          source_account_id: sourceAccountId,
          source_calendar_id: sourceCalendarId,
          mirrored_events: successful,
          is_recurring: true,
          recurring_event_id: baseEventId,
          via_backfill: viaBackfill,
        });
      }
    }

    console.log(`Created ${allSuccessful.length} total mirrors for ${instances.length} instances`);

    // Create base event marker to prevent duplicate processing
    try {
      await (supabaseAdmin as any).from('event_mappings').insert({
        user_id: userId,
        source_event_id: baseEventId,
        source_account_id: sourceAccountId,
        source_calendar_id: sourceCalendarId,
        mirrored_events: [],
        is_recurring: false,
        recurring_event_id: null,
      });
      console.log(`Created base event marker for ${baseEventId}`);
    } catch (error) {
      console.log(`Base event marker for ${baseEventId} already exists or failed:`, error);
    }

    return { successful: allSuccessful, failed: allFailed };
  }

  /**
   * Update mirror events when source event time changes
   */
  async updateMirrorEvents(
    userId: string,
    sourceEventId: string,
    sourceCalendarId: string,
    sourceEvent: any
  ) {
    console.log(`Updating mirrors for event: ${sourceEventId}`);

    const { data: mapping } = await (supabaseAdmin as any)
      .from('event_mappings')
      .select('*')
      .eq('user_id', userId)
      .eq('source_event_id', sourceEventId)
      .eq('source_calendar_id', sourceCalendarId)
      .single();

    if (!mapping || !mapping.mirrored_events || mapping.mirrored_events.length === 0) {
      console.log(`No existing mirrors found for event ${sourceEventId}`);
      return { successful: [], failed: [] };
    }

    console.log(`Updating ${mapping.mirrored_events.length} mirror(s)`);

    const updatePromises = mapping.mirrored_events.map(async (mirror: MirroredEvent) => {
      try {
        const auth = await googleAuth.getClientByAccountId(userId, mirror.account_id);
        await withRetry(() =>
          googleCalendar.updateMirrorEvent(auth, mirror.calendar_id, mirror.event_id, {
            start: sourceEvent.start,
            end: sourceEvent.end,
          })
        );
        return { success: true, mirror };
      } catch (error) {
        console.error(`Failed to update mirror ${mirror.event_id}:`, error);
        return { success: false, error };
      }
    });

    const results = await Promise.all(updatePromises);
    const successful = results.filter((r) => r.success).map((r) => r.mirror) as MirroredEvent[];
    const failed = results.filter((r) => !r.success);

    console.log(`Successfully updated ${successful.length} mirror(s)`);
    return { successful, failed };
  }

  /**
   * Handle source event deletion (single or recurring)
   */
  async handleEventDeleted(
    userId: string,
    externalUserId: string,
    sourceEventId: string,
    sourceCalendarId: string
  ) {
    console.log(`Processing event deleted: ${sourceEventId} for user ${userId}`);

    // Check if recurring instance
    if (sourceEventId.includes('_')) {
      return await this.handleRecurringInstanceDeleted(
        userId,
        sourceEventId,
        sourceCalendarId
      );
    }

    const { data: mapping } = await (supabaseAdmin as any)
      .from('event_mappings')
      .select('*')
      .eq('user_id', userId)
      .eq('source_event_id', sourceEventId)
      .eq('source_calendar_id', sourceCalendarId)
      .single();

    if (!mapping) {
      console.log(`No mapping found for event ${sourceEventId}`);
      return;
    }

    if (mapping.is_recurring === false && mapping.recurring_event_id === null) {
      await this.deleteMirrorEvents(userId, mapping);
    } else {
      await this.handleRecurringBaseDeleted(userId, sourceEventId, sourceCalendarId);
    }

    console.log(`Event deletion complete for ${sourceEventId}`);
  }

  /**
   * Delete mirror events for a single mapping
   */
  private async deleteMirrorEvents(userId: string, mapping: any) {
    if (!mapping.mirrored_events || mapping.mirrored_events.length === 0) {
      await this.deleteMappingRecord(mapping.id);
      return;
    }

    console.log(`Deleting ${mapping.mirrored_events.length} mirror(s)`);

    const deletePromises = mapping.mirrored_events.map(async (mirror: any) => {
      try {
        const auth = await googleAuth.getClientByAccountId(userId, mirror.account_id);
        await withRetry(() =>
          googleCalendar.deleteEvent(auth, mirror.calendar_id, mirror.event_id)
        );
        console.log(`Deleted mirror ${mirror.event_id}`);
      } catch (error: any) {
        if (error?.code !== 404 && error?.status !== 404) {
          console.error(`Failed to delete mirror ${mirror.event_id}:`, error);
        }
      }
    });

    await Promise.allSettled(deletePromises);
    await this.deleteMappingRecord(mapping.id);
  }

  private async handleRecurringInstanceDeleted(
    userId: string,
    instanceId: string,
    sourceCalendarId: string
  ) {
    const { data: mapping } = await (supabaseAdmin as any)
      .from('event_mappings')
      .select('*')
      .eq('user_id', userId)
      .eq('source_event_id', instanceId)
      .eq('source_calendar_id', sourceCalendarId)
      .single();

    if (!mapping) {
      console.log(`No mapping found for instance ${instanceId}`);
      return;
    }

    await this.deleteMirrorEvents(userId, mapping);
  }

  private async handleRecurringBaseDeleted(
    userId: string,
    baseEventId: string,
    sourceCalendarId: string
  ) {
    console.log(`Deleting all instances for recurring event: ${baseEventId}`);

    const { data: instanceMappings } = await (supabaseAdmin as any)
      .from('event_mappings')
      .select('*')
      .eq('user_id', userId)
      .eq('recurring_event_id', baseEventId)
      .eq('source_calendar_id', sourceCalendarId);

    if (!instanceMappings || instanceMappings.length === 0) {
      console.log(`No instance mappings found for base event ${baseEventId}`);
      return;
    }

    for (const mapping of instanceMappings) {
      await this.deleteMirrorEvents(userId, mapping);
    }
  }

  private async deleteMappingRecord(mappingId: string) {
    const { error } = await (supabaseAdmin as any)
      .from('event_mappings')
      .delete()
      .eq('id', mappingId);

    if (error) {
      console.error('Failed to delete mapping:', error);
    }
  }

  async getUserConfig(userId: string) {
    const { data: accounts, error } = await (supabaseAdmin as any)
      .from('user_accounts')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      throw new AppError('Failed to fetch user configuration', 'CONFIG_FETCH_ERROR', 500);
    }

    const sourceAccount = accounts?.find((acc: any) => acc.is_source);
    const destAccounts = accounts?.filter((acc: any) => !acc.is_source);

    return { sourceAccount, destAccounts };
  }
}

export const calendarSync = new CalendarSyncService();
