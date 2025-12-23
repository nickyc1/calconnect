import { pipedream } from './pipedream';
import { supabaseAdmin } from './supabase';
import { withRetry } from '@/utils/retry';
import { AppError } from '@/utils/error-handler';
import { MirroredEvent } from './types';
import {
  isRecurringEvent,
  isRecurringInstance,
  expandRecurringEvent,
  generateInstanceId
} from './recurring-events';

export class CalendarSyncService {
  /**
   * Handle source event creation
   */
  async handleEventCreated(
    userId: string,
    externalUserId: string,
    sourceEventId: string,
    sourceAccountId: string,
    sourceCalendarId: string
  ) {
    console.log(`Processing event created: ${sourceEventId} for user ${userId}`);

    // Check for existing mapping (idempotency)
    const { data: existingMapping } = await (supabaseAdmin as any)
      .from('event_mappings')
      .select('*')
      .eq('user_id', userId)
      .eq('source_event_id', sourceEventId)
      .eq('source_calendar_id', sourceCalendarId)
      .single();

    if (existingMapping) {
      console.log(`Event ${sourceEventId} already mapped, skipping`);
      return existingMapping;
    }

    // Fetch full source event with retry
    const sourceEvent = await withRetry(
      () => pipedream.getCalendarEvent(
        externalUserId,
        sourceAccountId,
        sourceCalendarId,
        sourceEventId
      )
    );

    console.log(`Fetched source event: ${sourceEvent.summary}`);

    // Get destination accounts
    const { data: destAccounts, error: accountsError } = await (supabaseAdmin as any)
      .from('user_accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('is_source', false);

    if (accountsError) {
      throw new AppError(
        'Failed to fetch destination accounts',
        'ACCOUNTS_FETCH_ERROR',
        500
      );
    }

    if (!destAccounts || destAccounts.length === 0) {
      console.log('No destination accounts configured, skipping mirror creation');
      return null;
    }

    console.log(`Creating mirrors in ${destAccounts.length} destination calendars`);

    // Create mirrors in parallel with individual error handling
    const mirrorPromises = destAccounts.map(async (dest: any) => {
      try {
        const result = await withRetry(() =>
          pipedream.createMirrorEvent(
            externalUserId,
            dest.pipedream_account_id,
            dest.calendar_id,
            {
              start: sourceEvent.start,
              end: sourceEvent.end,
              sourceEventId,
              sourceAccountId,
              sourceCalendarId,
              colorId: dest.color_id
            }
          )
        );

        return {
          event_id: result.id,
          account_id: dest.pipedream_account_id,
          calendar_id: dest.calendar_id
        } as MirroredEvent;
      } catch (error) {
        console.error(`Failed to create mirror in ${dest.calendar_id}:`, error);
        return null;
      }
    });

    const mirrorResults = await Promise.all(mirrorPromises);

    // Filter out failed mirrors
    const successfulMirrors = mirrorResults.filter(
      (r): r is MirroredEvent => r !== null
    );

    if (successfulMirrors.length === 0) {
      throw new AppError(
        'All mirror creations failed',
        'MIRROR_CREATION_FAILED',
        500
      );
    }

    console.log(`Successfully created ${successfulMirrors.length} mirrors`);

    // Store mapping
    const { data: mapping, error: mappingError } = await (supabaseAdmin as any)
      .from('event_mappings')
      .insert({
        user_id: userId,
        source_event_id: sourceEventId,
        source_account_id: sourceAccountId,
        source_calendar_id: sourceCalendarId,
        mirrored_events: successfulMirrors
      })
      .select()
      .single();

    if (mappingError) {
      console.error('Failed to store mapping:', mappingError);
      throw new AppError(
        'Failed to store event mapping',
        'MAPPING_STORAGE_ERROR',
        500
      );
    }

    // Log any partial failures
    const failedCount = mirrorResults.length - successfulMirrors.length;
    if (failedCount > 0) {
      console.warn(`${failedCount} mirror(s) failed to create`);
    }

    return mapping;
  }

  /**
   * Create mirror events in destination accounts
   * Called directly from webhook handler when we already have the event and accounts
   * Handles both single events and recurring events
   */
  async createMirrorEvents(
    userId: string,
    sourceAccountId: string,
    sourceCalendarId: string,
    sourceEvent: any,
    destAccounts: any[]
  ) {
    const sourceEventId = sourceEvent.id;
    console.log(`Creating mirrors for event: ${sourceEventId} (${sourceEvent.summary})`);

    // Check for existing mapping (idempotency)
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
        failed: []
      };
    }

    // Check if this is a recurring event
    if (isRecurringEvent(sourceEvent)) {
      console.log(`Detected recurring event, expanding instances...`);
      return await this.createRecurringMirrors(
        userId,
        sourceAccountId,
        sourceCalendarId,
        sourceEvent,
        destAccounts
      );
    }

    console.log(`Creating mirrors in ${destAccounts.length} destination calendar(s)`);

    // Create mirrors in parallel with individual error handling
    const mirrorPromises = destAccounts.map(async (dest) => {
      try {
        const result = await withRetry(() =>
          pipedream.createMirrorEvent(
            userId,
            dest.account_id,
            'primary', // For POC, always use primary calendar
            {
              start: sourceEvent.start,
              end: sourceEvent.end,
              sourceEventId,
              sourceAccountId,
              sourceCalendarId,
              colorId: dest.color_id || '1'
            }
          )
        );

        return {
          success: true,
          mirror: {
            event_id: result.id,
            account_id: dest.account_id,
            calendar_id: 'primary'
          }
        };
      } catch (error) {
        console.error(`Failed to create mirror in account ${dest.account_id}:`, error);
        return {
          success: false,
          error: error
        };
      }
    });

    const results = await Promise.all(mirrorPromises);

    // Separate successful and failed mirrors
    const successful = results
      .filter(r => r.success)
      .map(r => r.mirror) as MirroredEvent[];

    const failed = results.filter(r => !r.success);

    if (successful.length === 0) {
      console.error('All mirror creations failed');
      return { successful: [], failed };
    }

    console.log(`Successfully created ${successful.length} mirror(s)`);

    // Store mapping
    const { data: mapping, error: mappingError } = await (supabaseAdmin as any)
      .from('event_mappings')
      .insert({
        user_id: userId,
        source_event_id: sourceEventId,
        source_account_id: sourceAccountId,
        source_calendar_id: sourceCalendarId,
        mirrored_events: successful,
        is_recurring: false
      })
      .select()
      .single();

    if (mappingError) {
      console.error('Failed to store mapping:', mappingError);
    }

    return { successful, failed };
  }

  /**
   * Create mirrors for a recurring event by expanding all instances
   */
  private async createRecurringMirrors(
    userId: string,
    sourceAccountId: string,
    sourceCalendarId: string,
    sourceEvent: any,
    destAccounts: any[]
  ) {
    const baseEventId = sourceEvent.id;

    // Expand recurring event to instances
    const instances = expandRecurringEvent(sourceEvent);

    if (instances.length === 0) {
      console.error('Failed to expand recurring event');
      return { successful: [], failed: [] };
    }

    console.log(`Creating mirrors for ${instances.length} instances in ${destAccounts.length} destination(s)`);

    const allSuccessful: MirroredEvent[] = [];
    const allFailed: any[] = [];

    // Create mirrors for each instance
    for (const instance of instances) {
      const instanceId = generateInstanceId(baseEventId, instance.instanceDate);

      const mirrorPromises = destAccounts.map(async (dest) => {
        try {
          const result = await withRetry(() =>
            pipedream.createMirrorEvent(
              userId,
              dest.account_id,
              'primary',
              {
                start: instance.start,
                end: instance.end,
                sourceEventId: instanceId,
                sourceAccountId,
                sourceCalendarId,
                colorId: dest.color_id || '1',
                recurringEventId: baseEventId // Track base event for recurring instances
              }
            )
          );

          return {
            success: true,
            mirror: {
              event_id: result.id,
              account_id: dest.account_id,
              calendar_id: 'primary',
              instance_date: instance.instanceDate
            }
          };
        } catch (error) {
          console.error(`Failed to create mirror for instance ${instanceId}:`, error);
          return {
            success: false,
            error: error
          };
        }
      });

      const results = await Promise.all(mirrorPromises);
      const successful = results.filter(r => r.success).map(r => r.mirror) as MirroredEvent[];
      const failed = results.filter(r => !r.success);

      allSuccessful.push(...successful);
      allFailed.push(...failed);

      // Store mapping for this instance
      if (successful.length > 0) {
        await (supabaseAdmin as any)
          .from('event_mappings')
          .insert({
            user_id: userId,
            source_event_id: instanceId,
            source_account_id: sourceAccountId,
            source_calendar_id: sourceCalendarId,
            mirrored_events: successful,
            is_recurring: true,
            recurring_event_id: baseEventId
          });
      }
    }

    console.log(`Created ${allSuccessful.length} total mirrors for ${instances.length} instances`);

    // Create base event marker to prevent duplicate processing from multiple webhooks
    // Google Calendar sends multiple webhooks for the same base recurring event
    // This marker enables the idempotency check to catch duplicate webhooks
    try {
      await (supabaseAdmin as any)
        .from('event_mappings')
        .insert({
          user_id: userId,
          source_event_id: baseEventId,  // BASE event ID (without instance date suffix)
          source_account_id: sourceAccountId,
          source_calendar_id: sourceCalendarId,
          mirrored_events: [],  // Empty - actual mirrors tracked per instance
          is_recurring: false,  // This is the base event, not an instance
          recurring_event_id: null  // This IS the base (doesn't point to another event)
        });

      console.log(`Created base event marker for ${baseEventId} to prevent duplicate processing`);
    } catch (error) {
      // If marker already exists (duplicate insert), that's fine - it means we're protected
      console.log(`Base event marker for ${baseEventId} already exists or failed to create:`, error);
    }

    return { successful: allSuccessful, failed: allFailed };
  }

  /**
   * Update mirror events in destination accounts
   * Called when source event is updated (time/date changes)
   */
  async updateMirrorEvents(
    userId: string,
    sourceEventId: string,
    sourceCalendarId: string,
    sourceEvent: any
  ) {
    console.log(`Updating mirrors for event: ${sourceEventId} (${sourceEvent.summary})`);

    // Get existing mapping
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

    // Update mirrors in parallel
    const updatePromises = mapping.mirrored_events.map(async (mirror: MirroredEvent) => {
      try {
        await withRetry(() =>
          pipedream.updateMirrorEvent(
            userId,
            mirror.account_id,
            mirror.calendar_id,
            mirror.event_id,
            {
              start: sourceEvent.start,
              end: sourceEvent.end
            }
          )
        );

        console.log(`Updated mirror ${mirror.event_id} in account ${mirror.account_id}`);
        return { success: true, mirror };
      } catch (error) {
        console.error(`Failed to update mirror ${mirror.event_id}:`, error);
        return { success: false, error };
      }
    });

    const results = await Promise.all(updatePromises);

    const successful = results
      .filter(r => r.success)
      .map(r => r.mirror) as MirroredEvent[];

    const failed = results.filter(r => !r.success);

    console.log(`Successfully updated ${successful.length} mirror(s)`);

    return { successful, failed };
  }

  /**
   * Handle source event deletion
   * Handles both single events and recurring event instances
   */
  async handleEventDeleted(
    userId: string,
    externalUserId: string,
    sourceEventId: string,
    sourceCalendarId: string
  ) {
    console.log(`Processing event deleted: ${sourceEventId} for user ${userId}`);

    // Check if this is a recurring event instance (contains underscore)
    if (sourceEventId.includes('_')) {
      console.log(`Detected recurring instance deletion: ${sourceEventId}`);
      return await this.handleRecurringInstanceDeleted(
        userId,
        externalUserId,
        sourceEventId,
        sourceCalendarId
      );
    }

    // Get mapping
    const { data: mapping, error: fetchError } = await (supabaseAdmin as any)
      .from('event_mappings')
      .select('*')
      .eq('user_id', userId)
      .eq('source_event_id', sourceEventId)
      .eq('source_calendar_id', sourceCalendarId)
      .single();

    if (fetchError || !mapping) {
      console.log(`No mapping found for event ${sourceEventId}`);
      return;
    }

    // Check if this is a base recurring event - need to delete all instances
    if (mapping.is_recurring === false && mapping.recurring_event_id === null) {
      // Regular single event deletion
      await this.deleteMirrorEvents(userId, externalUserId, mapping);
    } else {
      // This is a base recurring event - delete all related instances
      console.log(`Deleting all instances for recurring event ${sourceEventId}`);
      await this.handleRecurringBaseDeleted(
        userId,
        externalUserId,
        sourceEventId,
        sourceCalendarId
      );
    }

    console.log(`Event deletion complete for ${sourceEventId}`);
  }

  /**
   * Delete mirror events for a single event mapping
   */
  private async deleteMirrorEvents(
    userId: string,
    externalUserId: string,
    mapping: any
  ) {
    if (!mapping.mirrored_events || mapping.mirrored_events.length === 0) {
      console.log('No mirrored events to delete');
      await this.deleteMappingRecord(mapping.id);
      return;
    }

    console.log(`Deleting ${mapping.mirrored_events.length} mirror(s)`);

    // Delete mirrors in parallel
    const deletePromises = mapping.mirrored_events.map(async (mirror: any) => {
      try {
        await withRetry(() =>
          pipedream.deleteCalendarEvent(
            externalUserId,
            mirror.account_id,
            mirror.calendar_id,
            mirror.event_id
          )
        );
        console.log(`Deleted mirror ${mirror.event_id}`);
      } catch (error: any) {
        // 404 is acceptable (event already deleted)
        if (error?.status !== 404) {
          console.error(`Failed to delete mirror ${mirror.event_id}:`, error);
        }
      }
    });

    await Promise.allSettled(deletePromises);

    // Remove mapping
    await this.deleteMappingRecord(mapping.id);
  }

  /**
   * Handle deletion of a recurring event instance
   * This handles "Delete This Event" scenario
   */
  private async handleRecurringInstanceDeleted(
    userId: string,
    externalUserId: string,
    instanceId: string,
    sourceCalendarId: string
  ) {
    console.log(`Deleting mirrors for recurring instance: ${instanceId}`);

    // Get mapping for this specific instance
    const { data: mapping, error: fetchError } = await (supabaseAdmin as any)
      .from('event_mappings')
      .select('*')
      .eq('user_id', userId)
      .eq('source_event_id', instanceId)
      .eq('source_calendar_id', sourceCalendarId)
      .single();

    if (fetchError || !mapping) {
      console.log(`No mapping found for instance ${instanceId}`);
      return;
    }

    await this.deleteMirrorEvents(userId, externalUserId, mapping);
  }

  /**
   * Handle deletion of base recurring event
   * This handles "Delete All Events" scenario
   */
  private async handleRecurringBaseDeleted(
    userId: string,
    externalUserId: string,
    baseEventId: string,
    sourceCalendarId: string
  ) {
    console.log(`Deleting all instances for recurring event: ${baseEventId}`);

    // Get all instance mappings for this base event
    const { data: instanceMappings, error: fetchError } = await (supabaseAdmin as any)
      .from('event_mappings')
      .select('*')
      .eq('user_id', userId)
      .eq('recurring_event_id', baseEventId)
      .eq('source_calendar_id', sourceCalendarId);

    if (fetchError) {
      console.error('Error fetching instance mappings:', fetchError);
      return;
    }

    if (!instanceMappings || instanceMappings.length === 0) {
      console.log(`No instance mappings found for base event ${baseEventId}`);
      return;
    }

    console.log(`Found ${instanceMappings.length} instance(s) to delete`);

    // Delete mirrors for each instance
    for (const mapping of instanceMappings) {
      await this.deleteMirrorEvents(userId, externalUserId, mapping);
    }
  }

  /**
   * Delete mapping record from database
   */
  private async deleteMappingRecord(mappingId: string) {
    const { error } = await (supabaseAdmin as any)
      .from('event_mappings')
      .delete()
      .eq('id', mappingId);

    if (error) {
      console.error('Failed to delete mapping:', error);
    }
  }

  /**
   * Get user configuration
   */
  async getUserConfig(userId: string) {
    const { data: accounts, error } = await (supabaseAdmin as any)
      .from('user_accounts')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      throw new AppError(
        'Failed to fetch user configuration',
        'CONFIG_FETCH_ERROR',
        500
      );
    }

    const sourceAccount = accounts?.find((acc: any) => acc.is_source);
    const destAccounts = accounts?.filter((acc: any) => !acc.is_source);

    return {
      sourceAccount,
      destAccounts
    };
  }
}

// Singleton instance
export const calendarSync = new CalendarSyncService();
