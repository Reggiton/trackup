import { useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { Alert, FlatList, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { supabase } from '../../lib/supabase'

export default function FriendsScreen() {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [friendsSearch, setFriendsSearch] = useState('')
  const [friends, setFriends] = useState<any[]>([])
  const [pending, setPending] = useState<any[]>([])
  const [invites, setInvites] = useState<any[]>([])
  const [currentUserId, setCurrentUserId] = useState('')
  const [loading, setLoading] = useState(false)

  useFocusEffect(
    useCallback(() => {
      fetchFriends()
    }, [])
  )

  async function fetchFriends() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setCurrentUserId(user.id)

    // Get accepted friends (both directions)
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
        .select('id, email, username, display_name, avatar_url')
        .in('id', otherUserIds)

      const friendsWithProfiles = friendData.map((f: any) => {
        const otherId = f.user_id === user.id ? f.friend_id : f.user_id
        return {
          ...f,
          profiles: profileData?.find((pr: any) => pr.id === otherId)
        }
      })
      setFriends(friendsWithProfiles)
    } else {
      setFriends([])
    }

    // Get pending requests sent to me
    const { data: pendingData } = await supabase
      .from('friendships')
      .select('*')
      .eq('friend_id', user.id)
      .eq('status', 'pending')

    if (pendingData && pendingData.length > 0) {
      const userIds = pendingData.map((p: any) => p.user_id)
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, email, username, display_name, avatar_url')
        .in('id', userIds)

      const pendingWithProfiles = pendingData.map((p: any) => ({
        ...p,
        profiles: profileData?.find((pr: any) => pr.id === p.user_id)
      }))
      setPending(pendingWithProfiles)
    } else {
      setPending([])
    }

    // Get event invites
    const { data: inviteData } = await supabase
      .from('event_invites')
      .select(`id, status, receiver_id, sender_id, event_id, events (id, title, date, type)`)
      .eq('receiver_id', user.id)
      .eq('status', 'pending')

    if (inviteData) {
      setInvites(inviteData.filter((i: any) => i.events !== null))
    }
  }

  async function searchUsers(query: string) {
    setSearchQuery(query)
    if (query.length < 2) {
      setSearchResults([])
      return
    }

    const { data: { user } } = await supabase.auth.getUser()

    const { data } = await supabase
      .from('profiles')
      .select('id, username, display_name, email, avatar_url')
      .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
      .neq('id', user!.id)
      .limit(8)

    setSearchResults(data ?? [])
  }

  async function sendFriendRequest(friendId: string) {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()

    const { error } = await supabase.from('friendships').insert({
      user_id: user?.id,
      friend_id: friendId,
      status: 'pending'
    })

    if (error) Alert.alert('Error', 'Request already sent or something went wrong')
    else {
      Alert.alert('Success', 'Friend request sent!')
      setSearchQuery('')
      setSearchResults([])
    }
    setLoading(false)
  }

  async function acceptRequest(friendshipId: string) {
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('id', friendshipId)

    if (!error) fetchFriends()
  }

  async function declineRequest(friendshipId: string) {
    const { error } = await supabase
      .from('friendships')
      .delete()
      .eq('id', friendshipId)

    if (!error) fetchFriends()
  }

  async function acceptInvite(invite: any) {
    const { data: { user } } = await supabase.auth.getUser()

    await supabase.from('events').insert({
      user_id: user?.id,
      title: invite.events.title,
      date: invite.events.date,
      type: invite.events.type,
      is_group_event: true,
      source: 'manual'
    })

    await supabase.from('event_invites').update({ status: 'accepted' }).eq('id', invite.id)
    fetchFriends()
  }

  async function declineInvite(inviteId: string) {
    await supabase.from('event_invites').update({ status: 'declined' }).eq('id', inviteId)
    fetchFriends()
  }

  const filteredFriends = friends.filter(f => {
    const q = friendsSearch.toLowerCase()
    return (
      f.profiles?.display_name?.toLowerCase().includes(q) ||
      f.profiles?.username?.toLowerCase().includes(q) ||
      f.profiles?.email?.toLowerCase().includes(q)
    )
  })

  function Avatar({ profile, size = 40 }: { profile: any, size?: number }) {
    if (profile?.avatar_url) {
      return <Image source={{ uri: profile.avatar_url }} style={{ width: size, height: size, borderRadius: size / 2 }} />
    }
    const initial = (profile?.display_name || profile?.username || profile?.email || '?')[0].toUpperCase()
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: size * 0.4 }}>{initial}</Text>
      </View>
    )
  }

  const listHeader = (
    <>
      <Text style={styles.header}>Friends</Text>

      <Text style={styles.sectionTitle}>Add Friend</Text>
      <TextInput
        style={styles.input}
        placeholder="Search by username or display name..."
        value={searchQuery}
        onChangeText={searchUsers}
        autoCapitalize="none"
      />

      {searchResults.length > 0 && (
        <View style={styles.searchResults}>
          {searchResults.map(result => (
            <TouchableOpacity
              key={result.id}
              style={styles.searchResultRow}
              onPress={() => sendFriendRequest(result.id)}
            >
              <View style={styles.friendRow}>
                <Avatar profile={result} />
                <View style={{ marginLeft: 10 }}>
                  <Text style={styles.resultName}>{result.display_name || result.username || result.email}</Text>
                  {result.username && (
                    <Text style={styles.resultUsername}>@{result.username}</Text>
                  )}
                </View>
              </View>
              <Text style={styles.addText}>+ Add</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {searchQuery.length >= 2 && searchResults.length === 0 && (
        <Text style={styles.noResults}>No users found</Text>
      )}

      {pending.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Pending Requests</Text>
          {pending.map(item => (
            <View key={item.id} style={styles.friendCard}>
              <View style={styles.friendRow}>
                <Avatar profile={item.profiles} />
                <View style={styles.friendInfo}>
                  <Text style={styles.friendName}>
                    {item.profiles?.display_name || item.profiles?.username || item.profiles?.email}
                  </Text>
                  {item.profiles?.username && (
                    <Text style={styles.friendUsername}>@{item.profiles.username}</Text>
                  )}
                </View>
              </View>
              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.acceptButton} onPress={() => acceptRequest(item.id)}>
                  <Text style={styles.acceptText}>Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.declineButton} onPress={() => declineRequest(item.id)}>
                  <Text style={styles.declineText}>Decline</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </>
      )}

      {invites.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Event Invites</Text>
          {invites.map(item => (
            <View key={item.id} style={styles.friendCard}>
              <Text style={styles.friendName}>{item.events?.title}</Text>
              <Text style={styles.inviteDate}>
                {item.events?.date
                  ? new Date(item.events.date).toLocaleString('en-US', {
                      weekday: 'short', month: 'short', day: 'numeric',
                      hour: '2-digit', minute: '2-digit'
                    })
                  : 'No date set'}
              </Text>
              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.acceptButton} onPress={() => acceptInvite(item)}>
                  <Text style={styles.acceptText}>Add to Calendar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.declineButton} onPress={() => declineInvite(item.id)}>
                  <Text style={styles.declineText}>Decline</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </>
      )}

      <Text style={styles.sectionTitle}>My Friends ({friends.length})</Text>
      {friends.length > 4 && (
        <TextInput
          style={[styles.input, { marginBottom: 12 }]}
          placeholder="Search friends..."
          value={friendsSearch}
          onChangeText={setFriendsSearch}
          autoCapitalize="none"
        />
      )}
      {filteredFriends.length === 0 && friends.length === 0 && (
        <Text style={styles.noResults}>No friends added yet</Text>
      )}
    </>
  )

  return (
    <FlatList
      style={styles.container}
      data={filteredFriends}
      keyExtractor={item => item.id}
      ListHeaderComponent={listHeader}
      renderItem={({ item }) => (
        <View style={styles.friendCard}>
          <View style={styles.friendRow}>
            <Avatar profile={item.profiles} />
            <View style={styles.friendInfo}>
              <Text style={styles.friendName}>
                {item.profiles?.display_name || item.profiles?.username || item.profiles?.email}
              </Text>
              {item.profiles?.username && (
                <Text style={styles.friendUsername}>@{item.profiles.username}</Text>
              )}
            </View>
          </View>
        </View>
      )}
    />
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingTop: 60, paddingHorizontal: 16 },
  header: { fontSize: 28, fontWeight: 'bold', marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12, marginTop: 8 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 8 },
  searchResults: { borderWidth: 1, borderColor: '#eee', borderRadius: 8, marginBottom: 16, overflow: 'hidden' },
  searchResultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#eee' },
  resultName: { fontSize: 15, fontWeight: '600' },
  resultUsername: { fontSize: 13, color: '#666', marginTop: 2 },
  addText: { color: '#4A90E2', fontWeight: '700', fontSize: 15 },
  noResults: { color: '#999', fontSize: 15, marginBottom: 16 },
  friendCard: { backgroundColor: '#f5f5f5', borderRadius: 10, padding: 14, marginBottom: 10 },
  friendName: { fontSize: 15, fontWeight: '600' },
  friendUsername: { fontSize: 13, color: '#666', marginTop: 2 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  acceptButton: { flex: 1, backgroundColor: '#000', borderRadius: 8, padding: 10, alignItems: 'center' },
  acceptText: { color: '#fff', fontWeight: 'bold' },
  declineButton: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, alignItems: 'center' },
  declineText: { color: '#333', fontWeight: 'bold' },
  inviteDate: { fontSize: 13, color: '#666', marginTop: 2, marginBottom: 6 },
  friendRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  friendInfo: { flex: 1 }
})