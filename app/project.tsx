import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { supabase } from '../lib/supabase'

export default function ProjectScreen() {
  const { eventId, eventTitle } = useLocalSearchParams()
  const [event, setEvent] = useState<any>(null)
  const [subEvents, setSubEvents] = useState<any[]>([])
  const [members, setMembers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchProjectDetails()
  }, [])

  async function fetchProjectDetails() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Get primary event
    const { data: eventData } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single()

    if (eventData) setEvent(eventData)

    // Get sub events (tasks)
    const { data: subData } = await supabase
      .from('sub_events')
      .select('*')
      .eq('parent_event_id', eventId)
      .order('date', { ascending: true })

    if (subData) setSubEvents(subData)

    // Get group members from invites
    const { data: inviteData } = await supabase
      .from('event_invites')
      .select('receiver_id, status, profiles(display_name, username, avatar_url)')
      .eq('event_id', eventId)

    if (inviteData) setMembers(inviteData)

    setLoading(false)
  }

  async function deleteSubEvent(subEventId: string, title: string) {
    Alert.alert('Delete Task', `Delete "${title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await supabase.from('sub_events').delete().eq('id', subEventId)
          // Also delete from events table
          await supabase.from('events')
            .delete()
            .eq('parent_event_id', eventId)
            .eq('title', `📌 ${title}`)
          fetchProjectDetails()
        }
      }
    ])
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>Loading...</Text>
      </View>
    )
  }

  const completedCount = subEvents.filter(s => s.completed).length

  return (
    <ScrollView style={styles.container}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.header}>{eventTitle}</Text>

      {event && (
        <Text style={styles.dueDate}>
          Due: {new Date(event.date).toLocaleDateString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
          })}
        </Text>
      )}

      {/* Members */}
      {members.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Group Members</Text>
          <View style={styles.membersRow}>
            {members.map((member: any) => (
              <View key={member.receiver_id} style={styles.memberBadge}>
                <Text style={styles.memberName}>
                  {member.profiles?.display_name || member.profiles?.username || 'Unknown'}
                </Text>
                <Text style={styles.memberStatus}>
                  {member.status === 'accepted' ? '✓' : '⏳'}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}

      {/* Progress */}
      {subEvents.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>
            Tasks ({completedCount}/{subEvents.length} done)
          </Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, {
              width: `${subEvents.length > 0 ? (completedCount / subEvents.length) * 100 : 0}%`
            }]} />
          </View>
        </>
      )}

      {/* Sub Events / Tasks */}
      {subEvents.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>No tasks added yet</Text>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => router.push({ pathname: '/plan', params: { eventId, eventTitle } })}
          >
            <Text style={styles.addButtonText}>+ Add Tasks</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {subEvents.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.taskCard, item.completed && styles.taskCardDone]}
              onLongPress={() => deleteSubEvent(item.id, item.title)}
              onPress={async () => {
                await supabase.from('sub_events')
                  .update({ completed: !item.completed })
                  .eq('id', item.id)
                fetchProjectDetails()
              }}
            >
              <View style={styles.taskRow}>
                <View style={[styles.checkbox, item.completed && styles.checkboxDone]}>
                  {item.completed && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <View style={styles.taskInfo}>
                  <Text style={[styles.taskTitle, item.completed && styles.taskTitleDone]}>
                    {item.title}
                  </Text>
                  <Text style={styles.taskDate}>
                    {new Date(item.date).toLocaleDateString('en-US', {
                      weekday: 'short', month: 'short', day: 'numeric',
                      hour: '2-digit', minute: '2-digit'
                    })}
                  </Text>
                  {item.note ? <Text style={styles.taskNote}>{item.note}</Text> : null}
                </View>
              </View>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={styles.addMoreButton}
            onPress={() => router.push({ pathname: '/plan', params: { eventId, eventTitle } })}
          >
            <Text style={styles.addMoreText}>+ Add More Tasks</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingTop: 60, paddingHorizontal: 16 },
  loading: { textAlign: 'center', marginTop: 100, color: '#999' },
  backButton: { marginBottom: 16 },
  backText: { fontSize: 16, color: '#4A90E2', fontWeight: '600' },
  header: { fontSize: 26, fontWeight: 'bold', marginBottom: 6 },
  dueDate: { fontSize: 14, color: '#666', marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12, marginTop: 8 },
  membersRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  memberBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, gap: 4 },
  memberName: { fontSize: 13, fontWeight: '600' },
  memberStatus: { fontSize: 12 },
  progressBar: { height: 8, backgroundColor: '#f0f0f0', borderRadius: 4, marginBottom: 16, overflow: 'hidden' },
  progressFill: { height: 8, backgroundColor: '#000', borderRadius: 4 },
  taskCard: { backgroundColor: '#f5f5f5', borderRadius: 10, padding: 14, marginBottom: 10 },
  taskCardDone: { opacity: 0.5 },
  taskRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#ccc', justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  checkboxDone: { backgroundColor: '#000', borderColor: '#000' },
  checkmark: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  taskInfo: { flex: 1 },
  taskTitle: { fontSize: 15, fontWeight: '600' },
  taskTitleDone: { textDecorationLine: 'line-through', color: '#999' },
  taskDate: { fontSize: 13, color: '#666', marginTop: 3 },
  taskNote: { fontSize: 13, color: '#888', marginTop: 4, fontStyle: 'italic' },
  emptyBox: { alignItems: 'center', marginTop: 40 },
  emptyText: { color: '#999', fontSize: 15, marginBottom: 16 },
  addButton: { backgroundColor: '#000', borderRadius: 8, padding: 14, alignItems: 'center' },
  addButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  addMoreButton: { borderWidth: 2, borderColor: '#000', borderRadius: 8, borderStyle: 'dashed', padding: 14, alignItems: 'center', marginTop: 8, marginBottom: 40 },
  addMoreText: { fontSize: 15, fontWeight: '600', color: '#000' }
})