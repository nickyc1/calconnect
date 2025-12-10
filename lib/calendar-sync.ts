import { pipedream } from './pipedream';
import { supabaseAdmin } from './supabase';
import { withRetry } from '@/utils/retry';
import { AppError } from '@/utils/error-handler';
import { MirroredEvent } from './types';

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
        mirrored_events: successful
      })
      .select()
      .single();

    if (mappingError) {
      console.error('Failed to store mapping:', mappingError);
    }

    return { successful, failed };
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
   */
  async handleEventDeleted(
    userId: string,
    externalUserId: string,
    sourceEventId: string,
    sourceCalendarId: string
  ) {
    console.log(`Processing event deleted: ${sourceEventId} for user ${userId}`);

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

    console.log(`Event deletion complete for ${sourceEventId}`);
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
