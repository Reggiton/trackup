import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://jvccydaknriidoqdznsk.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2Y2N5ZGFrbnJpaWRvcWR6bnNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1ODIzNjQsImV4cCI6MjA4ODE1ODM2NH0.lf1Q3qo0Lk1zcuqQLGipHqCc03q7IvNq_1C5cng646U'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})