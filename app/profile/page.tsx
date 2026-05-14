'use client'

import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

interface Profile {
  id: string
  full_name: string | null
  college: string | null
  branch: string | null
  semester: number | null
  avatar_url?: string | null
}

export default function ProfilePage() {
  const router = useRouter()

  // ✅ Memoize supabase client (identity stability)
  const supabase = useMemo(() => createClient(), [])

  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [colleges, setColleges] = useState<Array<{ id: string, name: string, short_code: string }>>([])

  // Form state
  const [fullName, setFullName] = useState('')
  const [college, setCollege] = useState('')
  const [branch, setBranch] = useState('')
  const [semester, setSemester] = useState('')

  // ✅ Memoize hasChanges calculation
  const hasChanges = useMemo(() => {
    if (!profile) return false

    return (
      fullName !== (profile.full_name || '') ||
      college !== (profile.college || '') ||
      branch !== (profile.branch || '') ||
      semester !== (profile.semester?.toString() || '')
    )
  }, [profile, fullName, college, branch, semester])

  // ✅ Memoize initials calculation
  const initials = useMemo(() => {
    if (profile?.full_name) {
      return profile.full_name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    }
    return user?.email?.[0]?.toUpperCase() || '?'
  }, [profile?.full_name, user?.email])

  useEffect(() => {
    loadUser()
    loadColleges()
  }, [])

  const loadColleges = async () => {
    try {
      const response = await fetch('/api/colleges')
      const data = await response.json()

      if (data.success && data.data) {
        setColleges(data.data)
      }
    } catch (error) {
      console.error('Error loading colleges:', error)
    }
  }

  const loadUser = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.push('/dev-test')
      return
    }

    setUser(user)
    await loadProfile()
    setLoading(false)
  }

  const loadProfile = async () => {
    try {
      const response = await fetch('/api/profile')
      const data = await response.json()

      if (data.success && data.data) {
        setProfile(data.data)
        setFullName(data.data.full_name || '')
        setCollege(data.data.college || '')
        setBranch(data.data.branch || '')
        setSemester(data.data.semester?.toString() || '')
      }
    } catch (error) {
      console.error('Error loading profile:', error)
    }
  }

  // ✅ Memoize save handler
  const handleSave = useCallback(async () => {
    // Validate required field: college
    if (!college) {
      alert('Please select your college')
      return
    }

    if (!hasChanges) return

    setIsSaving(true)

    try {
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName,
          college: college,
          branch: branch,
          semester: semester ? parseInt(semester) : null
        })
      })

      const data = await response.json()

      if (data.success) {
        setProfile(data.data)
        setIsEditing(false)
        alert('✅ Profile updated successfully!')
      } else {
        alert('❌ Error: ' + data.error)
      }
    } catch (error: any) {
      alert('❌ Error: ' + error.message)
    } finally {
      setIsSaving(false)
    }
  }, [fullName, college, branch, semester, hasChanges])

  // ✅ Memoize cancel handler
  const handleCancel = useCallback(() => {
    if (!profile) return

    // Reset form to original values
    setFullName(profile.full_name || '')
    setCollege(profile.college || '')
    setBranch(profile.branch || '')
    setSemester(profile.semester?.toString() || '')
    setIsEditing(false)
  }, [profile])

  // ✅ Memoize edit handler
  const handleEdit = useCallback(() => {
    setIsEditing(true)
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center relative">
        {/* AI Generated Space Background */}
        <div 
          className="absolute inset-0 z-0 pointer-events-none opacity-60 bg-cover bg-center bg-fixed"
          style={{ backgroundImage: `url('/space_universe_bg.png')` }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/20 via-slate-950/40 to-slate-950/90"></div>
        </div>
        
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-400 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading profile...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 relative">
      {/* AI Generated Space Background */}
      <div 
        className="absolute inset-0 z-0 pointer-events-none opacity-60 bg-cover bg-center bg-fixed"
        style={{ backgroundImage: `url('/space_universe_bg.png')` }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/20 via-slate-950/40 to-slate-950/90"></div>
      </div>

      <div className="relative z-10">
        {/* Header */}
        <div className="bg-slate-900/50 backdrop-blur-sm border-b border-slate-800">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-sky-400">Profile</h1>
          <button
            onClick={() => router.push('/dev-test')}
            className="px-4 py-2 bg-slate-800 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-700 transition text-sm"
          >
            ← Back to Dashboard
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* VIEW MODE */}
        {!isEditing && (
          <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
            {/* Cover Photo Placeholder */}
            <div className="h-32 bg-gradient-to-r from-sky-900 to-blue-900"></div>

            {/* Profile Content */}
            <div className="relative px-6 pb-6">
              {/* Avatar */}
              <div className="absolute -top-16 left-6">
                <div className="w-32 h-32 rounded-full bg-sky-600 border-4 border-slate-800 flex items-center justify-center">
                  <span className="text-4xl font-bold text-white">
                    {initials}
                  </span>
                </div>
              </div>

              {/* Edit Button */}
              <div className="flex justify-end pt-4">
                <button
                  onClick={handleEdit}
                  className="px-6 py-2 bg-sky-400 text-slate-950 font-semibold rounded-lg hover:bg-sky-500 transition"
                >
                  ✏️ Edit Profile
                </button>
              </div>

              {/* Profile Info */}
              <div className="mt-12">
                <h2 className="text-3xl font-bold text-slate-100 mb-1">
                  {profile?.full_name || 'Not set'}
                </h2>
                <p className="text-slate-400 text-sm mb-6">{user?.email}</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <InfoCard
                    icon="🎓"
                    label="College"
                    value={profile?.college || 'Not set'}
                  />
                  <InfoCard
                    icon="📚"
                    label="Branch"
                    value={profile?.branch || 'Not set'}
                  />
                  <InfoCard
                    icon="📅"
                    label="Semester"
                    value={profile?.semester ? `Semester ${profile.semester}` : 'Not set'}
                  />
                  <InfoCard
                    icon="📧"
                    label="Email"
                    value={user?.email || 'Not set'}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* EDIT MODE */}
        {isEditing && (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-sky-400">Edit Profile</h2>
              <button
                onClick={handleCancel}
                className="text-slate-400 hover:text-slate-300 transition"
              >
                ✕ Cancel
              </button>
            </div>

            <div className="space-y-4">
              {/* Avatar Upload Placeholder */}
              <div className="flex items-center gap-4 p-4 bg-slate-900 rounded-lg border border-slate-700">
                <div className="w-20 h-20 rounded-full bg-sky-600 flex items-center justify-center">
                  <span className="text-2xl font-bold text-white">
                    {initials}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-300 mb-1">Profile Picture</p>
                  <button className="text-xs text-sky-400 hover:underline">
                    📸 Upload Photo (Coming Soon)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Full Name
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter your full name"
                  className="w-full px-4 py-2 bg-slate-950 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-sky-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  College/University <span className="text-red-400">*</span>
                </label>
                <select
                  value={college}
                  onChange={(e) => setCollege(e.target.value)}
                  required
                  className="w-full px-4 py-2 bg-slate-950 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-sky-400"
                >
                  <option value="">Select your college</option>
                  {colleges.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Branch/Department
                </label>
                <input
                  type="text"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="e.g., Computer Science"
                  className="w-full px-4 py-2 bg-slate-950 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-sky-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Semester (1-12)
                </label>
                <input
                  type="number"
                  min="1"
                  max="12"
                  value={semester}
                  onChange={(e) => setSemester(e.target.value)}
                  placeholder="e.g., 5"
                  className="w-full px-4 py-2 bg-slate-950 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-sky-400"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleSave}
                  disabled={isSaving || !hasChanges}
                  className="flex-1 px-6 py-3 bg-sky-400 text-slate-950 font-semibold rounded-lg hover:bg-sky-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? 'Saving...' : '💾 Save Changes'}
                </button>
                <button
                  onClick={handleCancel}
                  className="px-6 py-3 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition"
                >
                  Cancel
                </button>
              </div>

              {/* Helper text when no changes */}
              {!hasChanges && (
                <p className="text-xs text-slate-500 text-center mt-2">
                  Make changes to enable save button
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  </div>
  )
}

// ✅ Memoized Info Card Component
const InfoCard = memo(({ icon, label, value }: { icon: string, label: string, value: string }) => {
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{icon}</span>
        <div>
          <p className="text-xs text-slate-500 mb-1">{label}</p>
          <p className="text-slate-200 font-medium">{value}</p>
        </div>
      </div>
    </div>
  )
})

InfoCard.displayName = 'InfoCard'
