import * as Notifications from 'expo-notifications'
import { supabase } from './supabase'

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

export async function registerForPushNotifications() {
  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') {
    return false
  }

  return true
}

export async function scheduleEventReminder(
  eventId: string,
  title: string,
  eventDate: Date,
  reminderMinutesBefore: number
) {
  const triggerDate = new Date(eventDate.getTime() - reminderMinutesBefore * 60 * 1000)

  // Don't schedule if the reminder time is in the past
  if (triggerDate <= new Date()) return

  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: '📅 Upcoming Event',
      body: `${title} is in ${reminderMinutesBefore} minutes`,
      data: { eventId },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
    },
  })

  return identifier
}

export async function cancelEventReminder(identifier: string) {
  await Notifications.cancelScheduledNotificationAsync(identifier)
}

export async function scheduleRemindersForAllEvents() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  // Cancel all existing scheduled notifications first
  await Notifications.cancelAllScheduledNotificationsAsync()

  // Get all events with reminders enabled
  const { data: events } = await supabase
    .from('events')
    .select('*')
    .eq('user_id', user.id)
    .eq('reminder_enabled', true)

  if (!events) return

  for (const event of events) {
    const eventDate = new Date(event.date)
    const interval = event.reminder_interval || '30'
    await scheduleEventReminder(
      event.id,
      event.title,
      eventDate,
      parseInt(interval)
    )
  }
}