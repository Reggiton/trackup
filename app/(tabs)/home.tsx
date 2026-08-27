import { BlurView } from '@react-native-community/blur'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Calendar } from 'react-native-calendars'
import { supabase } from '../../lib/supabase'

export default function HomeScreen() {
  const [selected, setSelected] = useState('')
  const [markedDates, setMarkedDates] = useState<any>({})
  const [events, setEvents] = useState<any[]>([])
  const [selectedEvents, setSelectedEvents] = useState<any[]>([])

  useFocusEffect(
    useCallback(() => {
      fetchEvents()
      syncSchoology()
    }, [])
  )

  async function syncSchoology() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: feeds } = await supabase.from('calendar_feeds').select('*').eq('user_id', user.id)
    if (!feeds || feeds.length === 0) return

    for (const feed of feeds) {
      try {
        const url = feed.feed_url.replace('webcal://', 'https://')
        const res = await fetch(url)
        const icsText = await res.text()
        const ICAL = require('ical.js')
        const jcalData = ICAL.parse(icsText)
        const comp = new ICAL.Component(jcalData)
        const vevents = comp.getAllSubcomponents('vevent')

        const eventsToInsert = []
        for (const vevent of vevents) {
          const event = new ICAL.Event(vevent)
          const title = event.summary
          const date = event.startDate?.toJSDate()
          if (!title || !date) continue
          eventsToInsert.push({
            user_id: user.id,
            title,
            date: date.toISOString(),
            type: 'schoolwork',
            source: 'schoology',
            is_recurring: false,
            is_group_event: false,
            reminder_enabled: false,
          })
        }

        if (eventsToInsert.length > 0) {
          await supabase.from('events').delete().eq('user_id', user.id).eq('source', 'schoology')
          await supabase.from('events').insert(eventsToInsert)
        }

        await supabase.from('calendar_feeds')
          .update({ last_synced: new Date().toISOString() })
          .eq('id', feed.id)
      } catch (e) {
        console.log('Sync error:', e)
      }
    }
    fetchEvents()
  }

  async function fetchEvents() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase.from('events').select('*').eq('user_id', user.id)
    if (!data) return
    setEvents(data)

    const marks: any = {}
    data.forEach((event: any) => {
      const eventDate = new Date(event.date)
      const dateStr = `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, '0')}-${String(eventDate.getDate()).padStart(2, '0')}`
      if (!marks[dateStr]) marks[dateStr] = { dots: [] }
      const color = event.type === 'schoolwork' ? '#4A90E2' : event.type === 'extracurricular' ? '#27AE60' : '#E25555'
      const alreadyHasColor = marks[dateStr].dots.some((d: any) => d.color === color)
      if (!alreadyHasColor) marks[dateStr].dots.push({ color, selectedDotColor: color })
    })
    setMarkedDates(marks)
  }

  function onDayPress(day: any) {
    setSelected(day.dateString)
    const filtered = events.filter(event => {
      const eventDate = new Date(event.date)
      const localDate = `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, '0')}-${String(eventDate.getDate()).padStart(2, '0')}`
      return localDate === day.dateString
    })
    setSelectedEvents(filtered)
  }

  const typeColor: any = {
    schoolwork: '#4A90E2',
    extra: '#E25555',
    extracurricular: '#27AE60',
  }

  const typeLabel: any = {
    schoolwork: 'School Work',
    extra: 'Extras',
    extracurricular: 'Extracurricular',
  }

  return (
    <View style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Calendar</Text>
        <Text style={styles.headerSub}>
          {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Neumorphic Calendar Card — outer dark shadow + outer light shadow = raised effect */}
        <View style={styles.neuOuter}>
          <View style={styles.neuInner}>
            <Calendar
              onDayPress={onDayPress}
              markedDates={{
                ...markedDates,
                ...(selected ? {
                  [selected]: {
                    ...(markedDates[selected] || {}),
                    selected: true,
                    selectedColor: '#1A1A2E',
                  }
                } : {})
              }}
              markingType="multi-dot"
              theme={{
                backgroundColor: 'transparent',
                calendarBackground: 'transparent',
                textSectionTitleColor: '#9CA3AF',
                selectedDayBackgroundColor: '#1A1A2E',
                selectedDayTextColor: '#ffffff',
                todayTextColor: '#4A90E2',
                dayTextColor: '#1A1A2E',
                textDisabledColor: '#D1D5DB',
                dotColor: '#4A90E2',
                monthTextColor: '#1A1A2E',
                textMonthFontWeight: '700',
                textMonthFontSize: 17,
                textDayFontSize: 14,
                textDayFontWeight: '500',
                arrowColor: '#1A1A2E',
              }}
            />
          </View>
        </View>

        {/* Legend */}
        <View style={styles.legend}>
          {[
            { color: '#4A90E2', label: 'School' },
            { color: '#E25555', label: 'Extras' },
            { color: '#27AE60', label: 'EC' },
          ].map(({ color, label }) => (
            <View key={label} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: color }]} />
              <Text style={styles.legendText}>{label}</Text>
            </View>
          ))}
        </View>

        {/* Selected Day Events */}
        {selected !== '' && (
          <View style={styles.eventsSection}>
            <Text style={styles.eventsSectionTitle}>
              {new Date(selected + 'T12:00:00').toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric'
              })}
            </Text>

            {selectedEvents.length === 0 ? (
              /* Neumorphic empty state — pressed/inset look */
              <View style={styles.neuEmpty}>
                <Text style={styles.emptyText}>No events this day</Text>
              </View>
            ) : (
              selectedEvents.map(item => (
                /* Glass event card with real blur */
                <TouchableOpacity
                  key={item.id}
                  style={styles.glassCardOuter}
                  activeOpacity={0.85}
                  onPress={() => {
                    if (item.is_group_event && !item.parent_event_id) {
                      router.push({ pathname: '/project', params: { eventId: item.id, eventTitle: item.title } })
                    }
                  }}
                  onLongPress={() => {
                    Alert.alert('Delete Event', `Delete "${item.title}"?`, [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Delete', style: 'destructive',
                        onPress: async () => {
                          await supabase.from('events').delete().eq('id', item.id)
                          fetchEvents()
                          setSelectedEvents(prev => prev.filter(e => e.id !== item.id))
                        }
                      }
                    ])
                  }}
                >
                  {/* Real BlurView for frosted glass effect */}
                  <BlurView
                    style={StyleSheet.absoluteFill}
                    blurType="light"
                    blurAmount={18}
                    reducedTransparencyFallbackColor="rgba(255,255,255,0.85)"
                  />

                  {/* Glass tint overlay */}
                  <View style={styles.glassTint} />

                  {/* Color accent bar */}
                  <View style={[styles.eventColorBar, { backgroundColor: typeColor[item.type] || '#999' }]} />

                  <View style={styles.eventContent}>
                    <Text style={styles.eventTitle}>{item.title}</Text>
                    <View style={styles.eventMetaRow}>
                      <Text style={styles.eventTime}>
                        {new Date(item.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                      <View style={[styles.typePill, { backgroundColor: typeColor[item.type] + '22' }]}>
                        <Text style={[styles.typePillText, { color: typeColor[item.type] }]}>
                          {typeLabel[item.type] || item.type}
                        </Text>
                      </View>
                      {item.is_group_event && !item.parent_event_id && (
                        <View style={styles.groupPill}>
                          <Text style={styles.groupPillText}>👥 Group</Text>
                        </View>
                      )}
                      {item.parent_event_id && (
                        <View style={styles.groupPill}>
                          <Text style={styles.groupPillText}>📌 Task</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  )
}

const NEU_BG = '#E8ECF0'

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: NEU_BG,
  },
  header: {
    paddingTop: 64,
    paddingBottom: 16,
    paddingHorizontal: 24,
    backgroundColor: NEU_BG,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1A1A2E',
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 2,
    fontWeight: '500',
  },
  scroll: {
    paddingHorizontal: 20,
  },

  // ── Neumorphism: two-layer raised card ──
  // Outer layer: dark shadow bottom-right
  neuOuter: {
    backgroundColor: NEU_BG,
    borderRadius: 28,
    marginBottom: 20,
    shadowColor: '#B8C0CC',
    shadowOffset: { width: 8, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 16,
  },
  // Inner layer: light shadow top-left (white highlight)
  neuInner: {
    backgroundColor: NEU_BG,
    borderRadius: 28,
    padding: 12,
    shadowColor: '#FFFFFF',
    shadowOffset: { width: -8, height: -8 },
    shadowOpacity: 1,
    shadowRadius: 16,
  },

  // Legend
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginBottom: 24,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500',
  },

  // Events section
  eventsSection: {
    marginTop: 4,
  },
  eventsSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A2E',
    marginBottom: 14,
    letterSpacing: -0.3,
  },

  // ── Neumorphism: inset / pressed empty state ──
  neuEmpty: {
    backgroundColor: NEU_BG,
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    // inset effect: reverse the shadow directions
    shadowColor: '#FFFFFF',
    shadowOffset: { width: -4, height: -4 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(184,192,204,0.4)',
  },
  emptyText: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '500',
  },

  // ── Glassmorphism event card ──
  glassCardOuter: {
    flexDirection: 'row',
    borderRadius: 18,
    marginBottom: 12,
    overflow: 'hidden',
    // Glass border highlight
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    // Soft drop shadow underneath
    shadowColor: '#B8C0CC',
    shadowOffset: { width: 4, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  // Semi-transparent white tint over the blur
  glassTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  eventColorBar: {
    width: 4,
    borderRadius: 2,
    margin: 14,
    marginRight: 0,
    zIndex: 1,
  },
  eventContent: {
    flex: 1,
    padding: 14,
    zIndex: 1,
  },
  eventTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A2E',
    marginBottom: 6,
  },
  eventMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  eventTime: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  typePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  typePillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  groupPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    backgroundColor: 'rgba(26,26,46,0.07)',
  },
  groupPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1A1A2E',
  },
})