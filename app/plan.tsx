import DateTimePicker from '@react-native-community/datetimepicker'
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { registerForPushNotifications, scheduleEventReminder } from '../lib/notifications'
import { supabase } from '../lib/supabase'

export default function PlanScreen() {
  const { eventId, eventTitle } = useLocalSearchParams()
  const [subEvents, setSubEvents] = useState<any[]>([])
  const [showAddTask, setShowAddTask] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskNote, setTaskNote] = useState('')
  const [taskDate, setTaskDate] = useState(new Date())
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [reminderEnabled, setReminderEnabled] = useState(false)
  const [reminderInterval, setReminderInterval] = useState('30')
  const [loading, setLoading] = useState(false)

  async function addSubEvent() {
    if (!taskTitle) {
      Alert.alert('Error', 'Please enter a task title')
      return
    }

    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()

    // Insert into sub_events table
    const { error: subError } = await supabase.from('sub_events').insert({
      parent_event_id: eventId,
      title: taskTitle,
      date: taskDate.toISOString(),
      note: taskNote,
      created_by: user?.id
    })

    if (subError) {
      Alert.alert('Error', subError.message)
      setLoading(false)
      return
    }

    // Also insert into events table so it shows on calendar
    const { data: newEvent, error: eventError } = await supabase.from('events').insert({
      user_id: user?.id,
      title: `📌 ${taskTitle}`,
      date: taskDate.toISOString(),
      type: 'schoolwork',
      source: 'manual',
      is_group_event: true,
      parent_event_id: eventId as string,
      reminder_enabled: reminderEnabled,
      reminder_interval: reminderEnabled ? reminderInterval : null,
      is_recurring: false,
    }).select().single()

    if (eventError) {
      Alert.alert('Error', eventError.message)
      setLoading(false)
      return
    }

    // Schedule reminder if enabled
    if (reminderEnabled && newEvent) {
      const granted = await registerForPushNotifications()
      if (granted) {
        await scheduleEventReminder(
          newEvent.id,
          taskTitle,
          taskDate,
          parseInt(reminderInterval)
        )
      }
    }

    setSubEvents(prev => [...prev, {
      title: taskTitle,
      date: taskDate.toISOString(),
      note: taskNote,
      reminderEnabled
    }])
    setTaskTitle('')
    setTaskNote('')
    setTaskDate(new Date())
    setReminderEnabled(false)
    setShowAddTask(false)
    setLoading(false)
  }

  return (
    <ScrollView style={styles.container}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.header}>Plan: {eventTitle}</Text>
      <Text style={styles.subtitle}>Break your project into tasks. All group members can see these on their calendar.</Text>

      {subEvents.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Tasks Added</Text>
          {subEvents.map((item, index) => (
            <View key={index} style={styles.taskCard}>
              <Text style={styles.taskTitle}>{item.title}</Text>
              <Text style={styles.taskDate}>
                {new Date(item.date).toLocaleDateString('en-US', {
                  weekday: 'short', month: 'short', day: 'numeric',
                  hour: '2-digit', minute: '2-digit'
                })}
              </Text>
              {item.note ? <Text style={styles.taskNote}>{item.note}</Text> : null}
              {item.reminderEnabled && <Text style={styles.reminderBadge}>🔔 Reminder set</Text>}
            </View>
          ))}
        </>
      )}

      {showAddTask ? (
        <View style={styles.addTaskBox}>
          <Text style={styles.sectionTitle}>New Task</Text>

          <Text style={styles.label}>Task Title</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Get slides done"
            value={taskTitle}
            onChangeText={setTaskTitle}
          />

          <Text style={styles.label}>Due Date</Text>
          <TouchableOpacity style={styles.dateDisplay} onPress={() => setShowDatePicker(!showDatePicker)}>
            <Text style={styles.dateText}>
              {taskDate.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' })}
              {' · '}
              {taskDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </TouchableOpacity>

          {showDatePicker && (
            <DateTimePicker
              value={taskDate}
              mode="datetime"
              display="spinner"
              onChange={(e, selectedDate) => {
                if (selectedDate) setTaskDate(selectedDate)
              }}
              style={styles.picker}
              textColor="#000"
            />
          )}

          <Text style={styles.label}>Note (optional)</Text>
          <TextInput
            style={[styles.input, styles.noteInput]}
            placeholder="What needs to get done?"
            value={taskNote}
            onChangeText={setTaskNote}
            multiline
          />

          <Text style={styles.label}>Reminder</Text>
          <TouchableOpacity
            style={[styles.typeButton, reminderEnabled && styles.typeButtonActive]}
            onPress={() => setReminderEnabled(!reminderEnabled)}
          >
            <Text style={[styles.typeButtonText, reminderEnabled && styles.typeButtonTextActive]}>
              {reminderEnabled ? 'Reminder On' : 'Reminder Off'}
            </Text>
          </TouchableOpacity>

          {reminderEnabled && (
            <>
              <Text style={[styles.label, { marginTop: 12 }]}>Remind me before</Text>
              <View style={styles.typeRow}>
                {['5', '15', '30', '60'].map(mins => (
                  <TouchableOpacity
                    key={mins}
                    style={[styles.typeButton, reminderInterval === mins && styles.typeButtonActive]}
                    onPress={() => setReminderInterval(mins)}
                  >
                    <Text style={[styles.typeButtonText, reminderInterval === mins && styles.typeButtonTextActive]}>
                      {mins === '60' ? '1hr' : `${mins}m`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.typeRow}>
                {['120', '360', '720', '1440'].map(mins => (
                  <TouchableOpacity
                    key={mins}
                    style={[styles.typeButton, reminderInterval === mins && styles.typeButtonActive]}
                    onPress={() => setReminderInterval(mins)}
                  >
                    <Text style={[styles.typeButtonText, reminderInterval === mins && styles.typeButtonTextActive]}>
                      {mins === '120' ? '2hr' : mins === '360' ? '6hr' : mins === '720' ? '12hr' : '1day'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <TouchableOpacity style={styles.button} onPress={addSubEvent} disabled={loading}>
            <Text style={styles.buttonText}>{loading ? 'Adding...' : 'Add Task'}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setShowAddTask(false)}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.addButton} onPress={() => setShowAddTask(true)}>
          <Text style={styles.addButtonText}>+ Add Task</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={[styles.button, { marginTop: 24 }]}
        onPress={() => {
          Alert.alert('Plan saved!', `${subEvents.length} task${subEvents.length !== 1 ? 's' : ''} added to your project.`)
          router.back()
        }}
      >
        <Text style={styles.buttonText}>Done Planning</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingTop: 60, paddingHorizontal: 16 },
  backButton: { marginBottom: 16 },
  backText: { fontSize: 16, color: '#4A90E2', fontWeight: '600' },
  header: { fontSize: 26, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  taskCard: { backgroundColor: '#f5f5f5', borderRadius: 10, padding: 14, marginBottom: 10 },
  taskTitle: { fontSize: 15, fontWeight: '600' },
  taskDate: { fontSize: 13, color: '#666', marginTop: 3 },
  taskNote: { fontSize: 13, color: '#888', marginTop: 4, fontStyle: 'italic' },
  reminderBadge: { fontSize: 12, color: '#4A90E2', marginTop: 4 },
  addTaskBox: { backgroundColor: '#f9f9f9', borderRadius: 12, padding: 16, marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6, color: '#333' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 16 },
  noteInput: { height: 80, textAlignVertical: 'top' },
  dateDisplay: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, marginBottom: 8 },
  dateText: { fontSize: 16, color: '#333' },
  picker: { marginBottom: 16, marginTop: -10, height: 150 },
  typeRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  typeButton: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, alignItems: 'center' },
  typeButtonActive: { backgroundColor: '#000', borderColor: '#000' },
  typeButtonText: { fontSize: 14, fontWeight: '600', color: '#333' },
  typeButtonTextActive: { color: '#fff' },
  button: { backgroundColor: '#000', borderRadius: 8, padding: 16, alignItems: 'center', marginBottom: 12 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  addButton: { borderWidth: 2, borderColor: '#000', borderRadius: 8, borderStyle: 'dashed', padding: 16, alignItems: 'center', marginBottom: 16 },
  addButtonText: { fontSize: 16, fontWeight: '600', color: '#000' },
  cancelText: { textAlign: 'center', color: '#999', fontSize: 14, marginBottom: 16 }
})