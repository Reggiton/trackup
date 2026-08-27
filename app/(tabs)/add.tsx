import DateTimePicker from '@react-native-community/datetimepicker'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { registerForPushNotifications, scheduleEventReminder } from '../../lib/notifications'
import { supabase } from '../../lib/supabase'

export default function AddScreen() {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(new Date())
  const [showPicker, setShowPicker] = useState(false)
  const [reminderEnabled, setReminderEnabled] = useState(false)
  const [isGroupEvent, setIsGroupEvent] = useState(false)
  const [showFriendsModal, setShowFriendsModal] = useState(false)
  const [showPlanModal, setShowPlanModal] = useState(false)
  const [newEventId, setNewEventId] = useState('')
  const [friends, setFriends] = useState<any[]>([])
  const [selectedFriends, setSelectedFriends] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [reminderInterval, setReminderInterval] = useState('30')
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurringDays, setRecurringDays] = useState<string[]>([])
  const [type, setType] = useState<'schoolwork' | 'extra' | 'extracurricular'>('schoolwork')

  function toggleDay(day: string) {
    setRecurringDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    )
  }

  useFocusEffect(
    useCallback(() => {
      fetchFriends()
    }, [])
  )

  async function fetchFriends() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: friendData } = await supabase
      .from('friendships')
      .select('*')
      .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
      .eq('status', 'accepted')

    if (friendData && friendData.length > 0) {
      const otherUserIds = friendData.map((f: any) =>
        f.user_id === user.id ? f.friend_id : f.user_id
      )
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, email')
        .in('id', otherUserIds)

      setFriends(profileData ?? [])
    }
  }

  function toggleFriend(friendId: string) {
    setSelectedFriends(prev =>
      prev.includes(friendId)
        ? prev.filter(id => id !== friendId)
        : [...prev, friendId]
    )
  }

  function resetForm() {
    setTitle('')
    setDate(new Date())
    setType('schoolwork')
    setReminderEnabled(false)
    setIsGroupEvent(false)
    setSelectedFriends([])
    setRecurringDays([])
    setIsRecurring(false)
    setLoading(false)
  }

  async function handleAddEvent() {
    if (!title) {
      Alert.alert('Error', 'Please enter a title')
      return
    }

    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()

    if (type === 'extracurricular' && recurringDays.length > 0) {
      const recurringEvents = []
      const startDate = new Date(date)
      const endDate = new Date()
      endDate.setMonth(endDate.getMonth() + 6)

      const current = new Date(startDate)
      while (current <= endDate) {
        const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][current.getDay()]
        if (recurringDays.includes(dayName)) {
          recurringEvents.push({
            user_id: user?.id,
            title,
            date: new Date(new Date(current).setHours(startDate.getHours(), startDate.getMinutes())).toISOString(),
            type,
            is_group_event: isGroupEvent,
            reminder_enabled: reminderEnabled,
            reminder_interval: reminderEnabled ? reminderInterval : null,
            is_recurring: true,
            recurrence_days: recurringDays,
            source: 'manual'
          })
        }
        current.setDate(current.getDate() + 1)
      }

      const { error } = await supabase.from('events').insert(recurringEvents)
      if (error) {
        Alert.alert('Error', error.message)
        setLoading(false)
        return
      }

      Alert.alert('Success', 'Recurring events added!')
      resetForm()

    } else {
      const { data: newEvent, error } = await supabase.from('events').insert({
        user_id: user?.id,
        title,
        date: date.toISOString(),
        type,
        is_group_event: isGroupEvent,
        reminder_enabled: reminderEnabled,
        reminder_interval: reminderEnabled ? reminderInterval : null,
        is_recurring: isRecurring,
        recurrence_days: recurringDays.length > 0 ? recurringDays : null,
        source: 'manual'
      }).select().single()

      if (error) {
        Alert.alert('Error', error.message)
        setLoading(false)
        return
      }

      if (reminderEnabled && newEvent) {
        const granted = await registerForPushNotifications()
        if (granted) {
          await scheduleEventReminder(
            newEvent.id,
            title,
            date,
            parseInt(reminderInterval)
          )
        }
      }

      if (isGroupEvent && selectedFriends.length > 0 && newEvent) {
        const invites = selectedFriends.map(friendId => ({
          event_id: newEvent.id,
          sender_id: user?.id,
          receiver_id: friendId,
          status: 'pending'
        }))
        await supabase.from('event_invites').insert(invites)
      }

      if (isGroupEvent && newEvent) {
        setNewEventId(newEvent.id)
        setShowPlanModal(true)
        setLoading(false)
      } else {
        Alert.alert('Success', 'Event added!')
        resetForm()
      }
    }
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>Add Event</Text>

      <Text style={styles.label}>Title</Text>
      <TextInput
        style={styles.input}
        placeholder="Event name"
        value={title}
        onChangeText={setTitle}
      />

      <Text style={styles.label}>Date & Time</Text>
      <TouchableOpacity style={styles.dateDisplay} onPress={() => setShowPicker(!showPicker)}>
        <Text style={styles.dateText}>
          {date.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' })}
          {' · '}
          {date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </TouchableOpacity>

      {showPicker && (
        <DateTimePicker
          value={date}
          mode="datetime"
          display="spinner"
          onChange={(event, selectedDate) => {
            if (selectedDate) setDate(selectedDate)
          }}
          style={styles.picker}
          textColor="#000"
        />
      )}

      <Text style={styles.label}>Type</Text>
      <View style={styles.typeRow}>
        <TouchableOpacity
          style={[styles.typeButton, type === 'schoolwork' && styles.typeButtonActive]}
          onPress={() => setType('schoolwork')}
        >
          <Text style={[styles.typeButtonText, type === 'schoolwork' && styles.typeButtonTextActive]}>
            School Work
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.typeButton, type === 'extra' && styles.typeButtonActive]}
          onPress={() => setType('extra')}
        >
          <Text style={[styles.typeButtonText, type === 'extra' && styles.typeButtonTextActive]}>
            Extras
          </Text>
        </TouchableOpacity>
      </View>
      <View style={styles.typeRow}>
        <TouchableOpacity
          style={[styles.typeButton, type === 'extracurricular' && styles.typeButtonActive]}
          onPress={() => { setType('extracurricular'); setIsRecurring(true) }}
        >
          <Text style={[styles.typeButtonText, type === 'extracurricular' && styles.typeButtonTextActive]}>
            Extracurricular
          </Text>
        </TouchableOpacity>
      </View>

      {type === 'extracurricular' && (
        <>
          <Text style={styles.label}>Recurring Days</Text>
          <View style={styles.typeRow}>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(day => (
              <TouchableOpacity
                key={day}
                style={[styles.typeButton, recurringDays.includes(day) && styles.typeButtonActive]}
                onPress={() => toggleDay(day)}
              >
                <Text style={[styles.typeButtonText, recurringDays.includes(day) && styles.typeButtonTextActive]}>
                  {day}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.typeRow}>
            {['Sat', 'Sun'].map(day => (
              <TouchableOpacity
                key={day}
                style={[styles.typeButton, recurringDays.includes(day) && styles.typeButtonActive]}
                onPress={() => toggleDay(day)}
              >
                <Text style={[styles.typeButtonText, recurringDays.includes(day) && styles.typeButtonTextActive]}>
                  {day}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      <Text style={styles.label}>Event Style</Text>
      <View style={styles.typeRow}>
        <TouchableOpacity
          style={[styles.typeButton, !isGroupEvent && styles.typeButtonActive]}
          onPress={() => { setIsGroupEvent(false); setSelectedFriends([]) }}
        >
          <Text style={[styles.typeButtonText, !isGroupEvent && styles.typeButtonTextActive]}>
            Solo
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.typeButton, isGroupEvent && styles.typeButtonActive]}
          onPress={() => { setIsGroupEvent(true); setShowFriendsModal(true) }}
        >
          <Text style={[styles.typeButtonText, isGroupEvent && styles.typeButtonTextActive]}>
            Group
          </Text>
        </TouchableOpacity>
      </View>

      {isGroupEvent && selectedFriends.length > 0 && (
        <TouchableOpacity onPress={() => setShowFriendsModal(true)}>
          <Text style={styles.selectedFriendsText}>
            {selectedFriends.length} friend{selectedFriends.length > 1 ? 's' : ''} invited — tap to edit
          </Text>
        </TouchableOpacity>
      )}

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

      <TouchableOpacity style={styles.button} onPress={handleAddEvent} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Adding...' : 'Add Event'}</Text>
      </TouchableOpacity>

      {/* Friends Modal */}
      <Modal
        visible={showFriendsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFriendsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Add Friends</Text>
            <Text style={styles.modalSubtitle}>
              Selected friends will get an invite to add this event to their calendar.
            </Text>

            {friends.length === 0 ? (
              <View style={styles.modalPlaceholder}>
                <Text style={styles.modalPlaceholderText}>
                  No friends added yet.{'\n'}Add friends in the Friends tab first!
                </Text>
              </View>
            ) : (
              friends.map(friend => (
                <TouchableOpacity
                  key={friend.id}
                  style={[styles.friendRow, selectedFriends.includes(friend.id) && styles.friendRowSelected]}
                  onPress={() => toggleFriend(friend.id)}
                >
                  <Text style={[styles.friendEmail, selectedFriends.includes(friend.id) && styles.friendEmailSelected]}>
                    {friend.email}
                  </Text>
                  {selectedFriends.includes(friend.id) && (
                    <Text style={styles.checkmark}>✓</Text>
                  )}
                </TouchableOpacity>
              ))
            )}

            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => setShowFriendsModal(false)}
            >
              <Text style={styles.modalButtonText}>
                Done {selectedFriends.length > 0 ? `(${selectedFriends.length} selected)` : ''}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => { setIsGroupEvent(false); setSelectedFriends([]); setShowFriendsModal(false) }}
            >
              <Text style={styles.modalCancel}>Cancel Group Event</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Plan Modal */}
      <Modal
        visible={showPlanModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPlanModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Plan Your Project 📋</Text>
            <Text style={styles.modalSubtitle}>
              Would you like to break this project into smaller tasks? All invited friends will be able to see them.
            </Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => {
                setShowPlanModal(false)
                router.push({ pathname: '/plan', params: { eventId: newEventId, eventTitle: title } })
                resetForm()
              }}
            >
              <Text style={styles.modalButtonText}>Yes, let's plan it!</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setShowPlanModal(false)
                Alert.alert('Success', 'Event added!')
                resetForm()
              }}
            >
              <Text style={styles.modalCancel}>No thanks, skip planning</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingTop: 60, paddingHorizontal: 16 },
  header: { fontSize: 28, fontWeight: 'bold', marginBottom: 24 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6, color: '#333' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 16 },
  dateDisplay: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, marginBottom: 8 },
  dateText: { fontSize: 16, color: '#333' },
  picker: { marginBottom: 16, marginTop: -10, height: 150 },
  typeRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  typeButton: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, alignItems: 'center' },
  typeButtonActive: { backgroundColor: '#000', borderColor: '#000' },
  typeButtonText: { fontSize: 14, fontWeight: '600', color: '#333' },
  typeButtonTextActive: { color: '#fff' },
  selectedFriendsText: { color: '#4A90E2', fontSize: 14, marginBottom: 16 },
  button: { backgroundColor: '#000', borderRadius: 8, padding: 16, alignItems: 'center', marginTop: 24, marginBottom: 40 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 8 },
  modalSubtitle: { fontSize: 14, color: '#666', marginBottom: 20 },
  modalPlaceholder: { backgroundColor: '#f5f5f5', borderRadius: 10, padding: 20, alignItems: 'center', marginBottom: 20 },
  modalPlaceholderText: { color: '#999', textAlign: 'center', lineHeight: 22 },
  friendRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#ccc', marginBottom: 8 },
  friendRowSelected: { backgroundColor: '#000', borderColor: '#000' },
  friendEmail: { fontSize: 15, color: '#333' },
  friendEmailSelected: { color: '#fff' },
  checkmark: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  modalButton: { backgroundColor: '#000', borderRadius: 8, padding: 16, alignItems: 'center', marginBottom: 12, marginTop: 8 },
  modalButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  modalCancel: { textAlign: 'center', color: '#999', fontSize: 14 }
})