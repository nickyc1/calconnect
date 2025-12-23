import { RRule, rrulestr } from 'rrule'

/**
 * Recurring Events Utility
 * Handles RRULE parsing, expansion, and instance management for calendar events
 */

export interface RecurringEventInstance {
  instanceDate: string // ISO 8601 date string
  start: any // Google Calendar start object
  end: any // Google Calendar end object
}

/**
 * Check if an event is a recurring event (has recurrence rule)
 */
export function isRecurringEvent(event: any): boolean {
  return !!(event.recurrence && event.recurrence.length > 0)
}

/**
 * Check if an event is an instance of a recurring event
 */
export function isRecurringInstance(event: any): boolean {
  return !!event.recurringEventId
}

/**
 * Parse RRULE from Google Calendar event and expand to individual instances
 *
 * @param event - Google Calendar event with recurrence field
 * @returns Array of instance dates with start/end times
 */
export function expandRecurringEvent(event: any): RecurringEventInstance[] {
  if (!event.recurrence || event.recurrence.length === 0) {
    return []
  }

  try {
    // Get the base start time
    const baseStart = event.start.dateTime || event.start.date
    const baseEnd = event.end.dateTime || event.end.date

    // Parse RRULE string(s)
    // Google Calendar sends RRULE in format: ["RRULE:FREQ=WEEKLY;COUNT=4;..."]
    const rruleString = event.recurrence.find((r: string) => r.startsWith('RRULE:'))

    if (!rruleString) {
      console.warn('No RRULE found in recurrence array:', event.recurrence)
      return []
    }

    // Parse the RRULE
    const rrule = rrulestr(rruleString, {
      dtstart: new Date(baseStart),
      forceset: false
    })

    // Generate all instance dates
    const instances = rrule.all().map((instanceStart: Date) => {
      // Calculate duration from original event
      const duration = new Date(baseEnd).getTime() - new Date(baseStart).getTime()
      const instanceEnd = new Date(instanceStart.getTime() + duration)

      // Format back to Google Calendar format
      const isAllDay = !!event.start.date

      return {
        instanceDate: instanceStart.toISOString(),
        start: isAllDay
          ? { date: instanceStart.toISOString().split('T')[0] }
          : { dateTime: instanceStart.toISOString(), timeZone: event.start.timeZone },
        end: isAllDay
          ? { date: instanceEnd.toISOString().split('T')[0] }
          : { dateTime: instanceEnd.toISOString(), timeZone: event.end.timeZone }
      }
    })

    console.log(`Expanded recurring event ${event.id} to ${instances.length} instances`)
    return instances
  } catch (error) {
    console.error('Error expanding recurring event:', error)
    return []
  }
}

/**
 * Generate instance ID for a recurring event instance
 * Format: {baseEventId}_{instanceDate}
 *
 * This matches Google Calendar's format for recurring instances
 */
export function generateInstanceId(baseEventId: string, instanceDate: string): string {
  // Convert ISO date to Google Calendar instance ID format
  // Example: 2025-12-24T18:00:00Z → 20251224T180000Z
  const formatted = instanceDate.replace(/[-:]/g, '').replace(/\.\d{3}Z/, 'Z')
  return `${baseEventId}_${formatted}`
}

/**
 * Parse instance ID to extract base event ID and instance date
 */
export function parseInstanceId(instanceId: string): { baseEventId: string; instanceDate: string } | null {
  const match = instanceId.match(/^(.+)_(\d{8}T\d{6}Z)$/)
  if (!match) {
    return null
  }

  const [, baseEventId, dateStr] = match

  // Convert back to ISO format
  // 20251224T180000Z → 2025-12-24T18:00:00Z
  const iso = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 11)}:${dateStr.substring(11, 13)}:${dateStr.substring(13)}`

  return {
    baseEventId,
    instanceDate: iso
  }
}
