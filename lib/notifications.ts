import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { supabase } from './supabase'

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  })
}

export async function registerForPushNotifications(): Promise<boolean> {
  if (Platform.OS === 'web') return false
  const { status } = await Notifications.requestPermissionsAsync()
  return status === 'granted'
}

export async function scheduleEventReminder(
  eventId: string,
  title: string,
  date: Date,
  minutesBefore: number
) {
  if (Platform.OS === 'web') return

  const triggerDate = new Date(date.getTime() - minutesBefore * 60 * 1000)
  if (triggerDate <= new Date()) return

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Upcoming Event',
      body: `"${title}" is in ${minutesBefore} minutes`,
      data: { eventId },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate },
  })
}

export async function scheduleRemindersForAllEvents() {
  if (Platform.OS === 'web') return

  await Notifications.cancelAllScheduledNotificationsAsync()

  const { data: events } = await supabase
    .from('events')
    .select('*')
    .eq('reminder_enabled', true)

  if (!events) return

  for (const event of events) {
    const date = new Date(event.date)
    const minutesBefore = parseInt(event.reminder_interval || '30')
    await scheduleEventReminder(event.id, event.title, date, minutesBefore)
  }
}
