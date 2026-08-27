import { supabase } from './supabase'

export async function syncSchoologyFeed(userId: string) {
  try {
    // Get the saved feed URL
    const { data: feed } = await supabase
      .from('calendar_feeds')
      .select('feed_url')
      .eq('user_id', userId)
      .single()

    if (!feed?.feed_url) return

    const response = await fetch(feed.feed_url)
    const icsText = await response.text()

    const ICAL = require('ical.js')
    const jcalData = ICAL.parse(icsText)
    const comp = new ICAL.Component(jcalData)
    const vevents = comp.getAllSubcomponents('vevent')

    // Delete old Schoology events
    await supabase
      .from('events')
      .delete()
      .eq('user_id', userId)
      .eq('source', 'schoology')

    // Insert fresh events
    const events = vevents.map((vevent: any) => {
      const event = new ICAL.Event(vevent)
      return {
        user_id: userId,
        title: event.summary || 'Untitled',
        date: event.startDate.toJSDate().toISOString(),
        type: 'schoolwork',
        source: 'schoology',
        reminder_enabled: false,
        is_group_event: false,
      }
    }).filter((e: any) => e.date)

    if (events.length > 0) {
      await supabase.from('events').insert(events)
    }

    // Update last synced timestamp
    await supabase
      .from('calendar_feeds')
      .update({ last_synced: new Date().toISOString() })
      .eq('user_id', userId)

  } catch (e) {
    // Fail silently in background
    console.log('Background sync failed:', e)
  }
}