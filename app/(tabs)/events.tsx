import { useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { supabase } from '../../lib/supabase'

export default function EventsScreen() {
  const [events, setEvents] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'schoolwork' | 'extra' | 'extracurricular'>('all')

  useFocusEffect(
    useCallback(() => {
      fetchEvents()
      deleteOldEvents()
    }, [])
  )

  async function fetchEvents() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: eventsData } = await supabase
      .from('events')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: true })

    if (!eventsData) return

    // For group events, fetch invite info with display names
    const groupEventIds = eventsData.filter(e => e.is_group_event).map(e => e.id)

    let inviteMap: any = {}
    if (groupEventIds.length > 0) {
      const { data: invites } = await supabase
        .from('event_invites')
        .select('event_id, receiver_id, status, profiles(display_name, username)')
        .in('event_id', groupEventIds)

      if (invites) {
        for (const invite of invites) {
          if (!inviteMap[invite.event_id]) inviteMap[invite.event_id] = []
          inviteMap[invite.event_id].push(invite)
        }
      }
    }

    const eventsWithInvites = eventsData.map(e => ({
      ...e,
      invites: inviteMap[e.id] || []
    }))

    setEvents(eventsWithInvites)
  }

  async function deleteOldEvents() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const twoMonthsAgo = new Date()
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2)

    await supabase
      .from('events')
      .delete()
      .eq('user_id', user.id)
      .eq('is_recurring', false)
      .eq('source', 'manual')
      .lt('date', twoMonthsAgo.toISOString())
  }

  async function deleteEvent(id: string, title: string) {
    Alert.alert('Delete Event', `Delete "${title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await supabase.from('events').delete().eq('id', id)
          fetchEvents()
        }
      }
    ])
  }

  const typeColor: any = {
    schoolwork: '#4A90E2',
    extra: '#E25555',
    extracurricular: '#27AE60'
  }

  const typeLabel: any = {
    schoolwork: 'School Work',
    extra: 'Extras',
    extracurricular: 'Extracurricular'
  }

  const filtered = events.filter(e => {
    const matchesSearch = e.title.toLowerCase().includes(search.toLowerCase())
    const matchesFilter = filter === 'all' || e.type === filter
    return matchesSearch && matchesFilter
  })

  return (
    <View style={styles.container}>
      <Text style={styles.header}>All Events</Text>

      <TextInput
        style={styles.input}
        placeholder="Search events..."
        value={search}
        onChangeText={setSearch}
      />

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {(['all', 'schoolwork', 'extra', 'extracurricular'] as const).map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterButton, filter === f && styles.filterButtonActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f === 'all' ? 'All' : f === 'schoolwork' ? 'School' : f === 'extra' ? 'Extras' : 'EC'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {filtered.length === 0 && (
        <Text style={styles.empty}>No events found</Text>
      )}

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.eventCard}
            onLongPress={() => deleteEvent(item.id, item.title)}
          >
            <View style={styles.eventRow}>
              <View style={[styles.typeDot, { backgroundColor: typeColor[item.type] || '#999' }]} />
              <View style={styles.eventInfo}>
                <Text style={styles.eventTitle}>{item.title}</Text>
                <Text style={styles.eventMeta}>
                  {new Date(item.date).toLocaleDateString('en-US', {
                    weekday: 'short', month: 'short', day: 'numeric'
                  })}
                  {item.is_recurring && item.recurrence_days?.length > 0 &&
                    ` · Every ${item.recurrence_days.join(', ')}`}
                  {' · '}{typeLabel[item.type] || item.type}
                </Text>
                {item.is_group_event && item.invites.length > 0 && (
                  <Text style={styles.sharedWith}>
                    Shared with: {item.invites.map((inv: any) =>
                      inv.profiles?.display_name || inv.profiles?.username || 'Unknown'
                    ).join(', ')}
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={() => deleteEvent(item.id, item.title)}>
                <Text style={styles.deleteText}>✕</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingTop: 60, paddingHorizontal: 16 },
  header: { fontSize: 28, fontWeight: 'bold', marginBottom: 16 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 12 },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  filterButton: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 8, alignItems: 'center' },
  filterButtonActive: { backgroundColor: '#000', borderColor: '#000' },
  filterText: { fontSize: 12, fontWeight: '600', color: '#333' },
  filterTextActive: { color: '#fff' },
  empty: { color: '#999', fontSize: 15, textAlign: 'center', marginTop: 40 },
  eventCard: { backgroundColor: '#f5f5f5', borderRadius: 10, padding: 14, marginBottom: 10 },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  typeDot: { width: 10, height: 10, borderRadius: 5 },
  eventInfo: { flex: 1 },
  eventTitle: { fontSize: 15, fontWeight: '600' },
  eventMeta: { fontSize: 13, color: '#666', marginTop: 3 },
  sharedWith: { fontSize: 12, color: '#4A90E2', marginTop: 4 },
  deleteText: { color: '#ccc', fontSize: 18, fontWeight: 'bold', paddingLeft: 8 }
})