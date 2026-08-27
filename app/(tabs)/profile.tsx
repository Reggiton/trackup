import * as ImagePicker from 'expo-image-picker'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { supabase } from '../../lib/supabase'
import { syncSchoologyFeed } from '../../lib/syncSchoology'

export default function ProfileScreen() {
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [totalEvents, setTotalEvents] = useState(0)
  const [friendsCount, setFriendsCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [editingUsername, setEditingUsername] = useState(false)
  const [editingDisplayName, setEditingDisplayName] = useState(false)
  const [editingPhone, setEditingPhone] = useState(false)
  const [editingPassword, setEditingPassword] = useState(false)
  const [userId, setUserId] = useState('')

  useFocusEffect(
    useCallback(() => {
      fetchProfile()
    }, [])
  )

  async function fetchProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)
    setEmail(user.email ?? '')

    const { data: profile } = await supabase
      .from('profiles')
      .select('username, phone, display_name, avatar_url')
      .eq('id', user.id)
      .single()

    if (profile) {
      setUsername(profile.username ?? '')
      setPhone(profile.phone ?? '')
      setDisplayName(profile.display_name ?? '')
      setAvatarUrl(profile.avatar_url ?? '')
    }

    const { count: eventCount } = await supabase
      .from('events')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    setTotalEvents(eventCount ?? 0)

    const { count: friendCount } = await supabase
      .from('friendships')
      .select('*', { count: 'exact', head: true })
      .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
      .eq('status', 'accepted')

    setFriendsCount(friendCount ?? 0)
  }

  async function pickAndUploadAvatar() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow access to your photo library')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    })

    if (result.canceled) return

    setLoading(true)
    const uri = result.assets[0].uri
    const ext = uri.split('.').pop()
    const fileName = `${userId}.${ext}`

    const response = await fetch(uri)
    const blob = await response.blob()
    const arrayBuffer = await new Response(blob).arrayBuffer()

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(fileName, arrayBuffer, {
        contentType: `image/${ext}`,
        upsert: true
      })

    if (uploadError) {
      Alert.alert('Error', uploadError.message)
      setLoading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(fileName)

    await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', userId)

    setAvatarUrl(publicUrl)
    Alert.alert('Success', 'Profile picture updated!')
    setLoading(false)
  }

  async function updateField(field: string, value: string, onSuccess: () => void) {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase
      .from('profiles')
      .update({ [field]: value })
      .eq('id', user!.id)

    if (error) Alert.alert('Error', field === 'username' ? 'Username may already be taken' : error.message)
    else { Alert.alert('Success', 'Updated!'); onSuccess() }
    setLoading(false)
  }

  async function updatePassword() {
    if (newPassword.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) Alert.alert('Error', error.message)
    else {
      Alert.alert('Success', 'Password updated!')
      setNewPassword('')
      setEditingPassword(false)
    }
    setLoading(false)
  }

  async function importSchoology() {
    Alert.prompt(
      'Import Schoology Calendar',
      'Paste your Schoology calendar feed URL here.\n\nIn Schoology: Calendar → Subscribe to Calendar → Copy the URL',
      async (url) => {
        if (!url) return
        setLoading(true)

        try {
          const fetchUrl = url.replace('webcal://', 'https://')
          const { data: { user } } = await supabase.auth.getUser()

          // Save the feed URL
          await supabase
            .from('calendar_feeds')
            .upsert({ 
              user_id: user!.id, 
              feed_url: fetchUrl, 
              last_synced: new Date().toISOString() 
            })

          // Use shared sync function
          await syncSchoologyFeed(user!.id)
          Alert.alert('Success', 'Schoology calendar imported and syncing automatically!')

        } catch (e: any) {
          Alert.alert('Error', 'Could not fetch calendar. Make sure the URL is correct.')
        }
        setLoading(false)
      },
      'plain-text'
    )
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.replace('/')
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>Profile</Text>

      {/* Avatar */}
      <TouchableOpacity style={styles.avatarContainer} onPress={pickAndUploadAvatar}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarPlaceholderText}>
              {displayName ? displayName[0].toUpperCase() : email[0]?.toUpperCase()}
            </Text>
          </View>
        )}
        <View style={styles.avatarEditBadge}>
          <Text style={styles.avatarEditText}>Edit</Text>
        </View>
      </TouchableOpacity>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{totalEvents}</Text>
          <Text style={styles.statLabel}>Events</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{friendsCount}</Text>
          <Text style={styles.statLabel}>Friends</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Account</Text>

      <View style={styles.infoCard}>
        <Text style={styles.infoLabel}>Email</Text>
        <Text style={styles.infoValue}>{email}</Text>
      </View>

      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <View>
            <Text style={styles.infoLabel}>Display Name</Text>
            <Text style={styles.infoValue}>{displayName || 'Not set'}</Text>
          </View>
          <TouchableOpacity onPress={() => setEditingDisplayName(!editingDisplayName)}>
            <Text style={styles.editText}>{editingDisplayName ? 'Cancel' : 'Edit'}</Text>
          </TouchableOpacity>
        </View>
        {editingDisplayName && (
          <View style={styles.editRow}>
            <TextInput
              style={styles.editInput}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Your display name"
            />
            <TouchableOpacity
              style={styles.saveButton}
              onPress={() => updateField('display_name', displayName, () => setEditingDisplayName(false))}
              disabled={loading}
            >
              <Text style={styles.saveButtonText}>Save</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <View>
            <Text style={styles.infoLabel}>Username</Text>
            <Text style={styles.infoValue}>{username ? `@${username}` : 'Not set'}</Text>
          </View>
          <TouchableOpacity onPress={() => setEditingUsername(!editingUsername)}>
            <Text style={styles.editText}>{editingUsername ? 'Cancel' : 'Edit'}</Text>
          </TouchableOpacity>
        </View>
        {editingUsername && (
          <View style={styles.editRow}>
            <TextInput
              style={styles.editInput}
              value={username}
              onChangeText={setUsername}
              placeholder="@username"
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={styles.saveButton}
              onPress={() => updateField('username', username, () => setEditingUsername(false))}
              disabled={loading}
            >
              <Text style={styles.saveButtonText}>Save</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <View>
            <Text style={styles.infoLabel}>Phone Number</Text>
            <Text style={styles.infoValue}>{phone || 'Not set'}</Text>
          </View>
          <TouchableOpacity onPress={() => setEditingPhone(!editingPhone)}>
            <Text style={styles.editText}>{editingPhone ? 'Cancel' : 'Edit'}</Text>
          </TouchableOpacity>
        </View>
        {editingPhone && (
          <View style={styles.editRow}>
            <TextInput
              style={styles.editInput}
              value={phone}
              onChangeText={setPhone}
              placeholder="+1 (555) 000-0000"
              keyboardType="phone-pad"
            />
            <TouchableOpacity
              style={styles.saveButton}
              onPress={() => updateField('phone', phone, () => setEditingPhone(false))}
              disabled={loading}
            >
              <Text style={styles.saveButtonText}>Save</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <Text style={styles.sectionTitle}>Security</Text>

      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <View>
            <Text style={styles.infoLabel}>Password</Text>
            <Text style={styles.infoValue}>••••••••</Text>
          </View>
          <TouchableOpacity onPress={() => setEditingPassword(!editingPassword)}>
            <Text style={styles.editText}>{editingPassword ? 'Cancel' : 'Change'}</Text>
          </TouchableOpacity>
        </View>
        {editingPassword && (
          <View style={styles.editRow}>
            <TextInput
              style={styles.editInput}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="New password"
              secureTextEntry
            />
            <TouchableOpacity style={styles.saveButton} onPress={updatePassword} disabled={loading}>
              <Text style={styles.saveButtonText}>Save</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      <Text style={styles.sectionTitle}>Integrations</Text>
      <TouchableOpacity style={styles.infoCard} onPress={importSchoology}>
        <View style={styles.infoRow}>
          <View>
            <Text style={styles.infoLabel}>Schoology Calendar</Text>
            <Text style={styles.infoValue}>Import assignments</Text>
          </View>
          <Text style={styles.editText}>Import →</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingTop: 60, paddingHorizontal: 16 },
  header: { fontSize: 28, fontWeight: 'bold', marginBottom: 24 },
  avatarContainer: { alignItems: 'center', marginBottom: 24 },
  avatar: { width: 90, height: 90, borderRadius: 45 },
  avatarPlaceholder: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  avatarPlaceholderText: { color: '#fff', fontSize: 36, fontWeight: 'bold' },
  avatarEditBadge: { backgroundColor: '#4A90E2', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3, marginTop: 6 },
  avatarEditText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  statCard: { flex: 1, backgroundColor: '#f5f5f5', borderRadius: 12, padding: 16, alignItems: 'center' },
  statNumber: { fontSize: 32, fontWeight: 'bold' },
  statLabel: { fontSize: 13, color: '#666', marginTop: 4 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  infoCard: { backgroundColor: '#f5f5f5', borderRadius: 12, padding: 16, marginBottom: 10 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  infoLabel: { fontSize: 12, color: '#666', marginBottom: 2 },
  infoValue: { fontSize: 16, fontWeight: '500' },
  editText: { color: '#4A90E2', fontWeight: '600' },
  editRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  editInput: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, fontSize: 15 },
  saveButton: { backgroundColor: '#000', borderRadius: 8, padding: 10, justifyContent: 'center' },
  saveButtonText: { color: '#fff', fontWeight: 'bold' },
  signOutButton: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 16, alignItems: 'center', marginTop: 24, marginBottom: 40 },
  signOutText: { color: '#333', fontWeight: '600' }
})