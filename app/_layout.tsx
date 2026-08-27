import { router, Stack } from 'expo-router'
import { useEffect } from 'react'
import { registerForPushNotifications, scheduleRemindersForAllEvents } from '../lib/notifications'
import { supabase } from '../lib/supabase'

export default function RootLayout() {
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: any } }) => {
      if (!session) router.replace('/')
      else {
        registerForPushNotifications()
        scheduleRemindersForAllEvents()
      }
    })
  }, [])

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="plan" options={{ headerShown: false }} />
      <Stack.Screen name="project" options={{ headerShown: false }} />
    </Stack>
  )
}