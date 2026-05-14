# Supabase JS SDK Reference

## Setup

```ts
import { createClient } from '@supabase/supabase-js'

// Client-side
const supabase = createClient(supabase_url, anon_key)

// Server-side
const supabase = createClient(supabase_url, anon_key, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
})

// Admin (service role)
const supabase = createClient(supabase_url, service_role_key, {
  auth: { autoRefreshToken: false, persistSession: false }
})
const adminAuthClient = supabase.auth.admin
```

---

## Database

### delete()
```ts
await supabase.from('countries').delete().eq('id', 1)
const { data, error } = await supabase.from('countries').delete().eq('id', 1).select()
await supabase.from('countries').delete().in('id', [1, 2, 3])
```

### rpc()
```ts
const { data, error } = await supabase.rpc('hello_world')
const { data, error } = await supabase.rpc('echo', { say: '👋' })
const { data, error } = await supabase.rpc('list_stored_countries').eq('id', 1).single()
const { data, error } = await supabase.rpc('hello_world', undefined, { get: true })
```

### Filters
```ts
// Filters go AFTER select(), BEFORE modifiers
const { data, error } = await supabase.from('instruments').select('name').eq('name', 'violin') // ✅
await supabase.from('instruments').eq('name', 'violin').select('name') // ❌ wrong order

// Chaining
const { data, error } = await supabase.from('cities').select('name').gte('population', 1000).lt('population', 10000)

// Conditional chaining
let query = supabase.from('cities').select('name')
if (filterByName)  { query = query.eq('name', filterByName) }
if (filterPopLow)  { query = query.gte('population', filterPopLow) }
const { data, error } = await query
```

### Filter methods
```ts
.eq('col', value)
.neq('col', value)
.gt('col', value)
.gte('col', value)
.lt('col', value)
.lte('col', value)
.like('name', '%Lu%')          // case-sensitive
.ilike('name', '%lu%')         // case-insensitive
.is('name', null)              // null checks
.in('name', ['Leia', 'Han'])
.contains('tags', ['is:open'])
.containedBy('days', ['monday', 'tuesday'])
.overlaps('tags', ['is:closed'])
.match({ id: 2, name: 'Leia' })
.not('name', 'is', null)
.or('id.eq.2,name.eq.Han')
.or('id.gt.3,and(id.eq.1,name.eq.Luke)')
.filter('name', 'in', '("Han","Yoda")')
.textSearch('content', `'eggs' & 'ham'`, { type: 'plain', config: 'english' })
```

### Modifiers
```ts
.select()                          // return inserted/updated/deleted rows
.order('id', { ascending: false })
.limit(10)
.range(0, 9)
.single()                          // errors if not exactly 1 row
.maybeSingle()                     // null if 0 rows, errors if >1
.abortSignal(AbortSignal.timeout(1000))
.returns<Array<MyType>>()
.csv()
.explain()
.explain({ analyze: true, verbose: true })
```

---

## Auth

### Sign in
```ts
// Email + password
const { data, error } = await supabase.auth.signInWithPassword({ email, password })

// OTP (magic link)
const { data, error } = await supabase.auth.signInWithOtp({
  email: 'example@email.com',
  options: { emailRedirectTo: 'https://example.com/welcome' }
})

// OAuth
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'github',
  options: { redirectTo: 'https://example.com/welcome' }
})

// SSO
const { data, error } = await supabase.auth.signInWithSSO({ domain: 'company.com' })

// ID token (Google etc.)
const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: 'your-id-token' })

// Anonymous
const { data, error } = await supabase.auth.signInAnonymously()
```

### Session
```ts
const { data, error } = await supabase.auth.getSession()
const { data: { user } } = await supabase.auth.getUser()
const { data, error } = await supabase.auth.refreshSession()
const { data, error } = await supabase.auth.setSession({ access_token, refresh_token })
supabase.auth.exchangeCodeForSession('code')
const { error } = await supabase.auth.signOut()
const { error } = await supabase.auth.signOut({ scope: 'local' })  // current session only
```

### User management
```ts
const { data, error } = await supabase.auth.updateUser({ email: 'new@email.com' })
const { data, error } = await supabase.auth.updateUser({ password: 'new-password' })
const { data, error } = await supabase.auth.updateUser({ data: { hello: 'world' } })
const { data, error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: '...' })
const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
```

### Auth state listener
```ts
const { data } = supabase.auth.onAuthStateChange((event, session) => {
  // events: INITIAL_SESSION | SIGNED_IN | SIGNED_OUT | PASSWORD_RECOVERY | TOKEN_REFRESHED | USER_UPDATED
})
data.subscription.unsubscribe()
```

### Admin
```ts
const { data, error } = await supabase.auth.admin.getUserById(userId)
const { data: { users } } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true })
const { data, error } = await supabase.auth.admin.deleteUser(userId)
const { data, error } = await supabase.auth.admin.updateUserById(userId, { email, password, ban_duration: '876000h' })
const { data, error } = await supabase.auth.admin.inviteUserByEmail('email@example.com')
```

### MFA
```ts
const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'my-device' })
const { data, error } = await supabase.auth.mfa.challenge({ factorId })
const { data, error } = await supabase.auth.mfa.verify({ factorId, challengeId, code: '123456' })
const { data, error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: '123456' })
const { data, error } = await supabase.auth.mfa.unenroll({ factorId })
const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
```

---

## Edge Functions

```ts
const { data, error } = await supabase.functions.invoke('function-name', {
  body: { foo: 'bar' }
})

// Error handling
import { FunctionsHttpError, FunctionsRelayError, FunctionsFetchError } from "@supabase/supabase-js"
if (error instanceof FunctionsHttpError) {
  const errorMessage = await error.context.json()
} else if (error instanceof FunctionsRelayError) {
  console.log('Relay error:', error.message)
} else if (error instanceof FunctionsFetchError) {
  console.log('Fetch error:', error.message)
}
```

---

## Realtime

```ts
// Broadcast
const channel = supabase.channel('room1')
channel.on('broadcast', { event: 'cursor-pos' }, (payload) => {
  console.log(payload)
}).subscribe((status) => {
  if (status === 'SUBSCRIBED') {
    channel.send({ type: 'broadcast', event: 'cursor-pos', payload: { x: 1, y: 2 } })
  }
})

// Postgres changes
supabase.channel('room1')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'countries' }, payload => {
    console.log(payload)
  })
  .subscribe()

// Presence
const channel = supabase.channel('room1')
channel
  .on('presence', { event: 'sync' }, () => console.log(channel.presenceState()))
  .on('presence', { event: 'join' }, ({ newPresences }) => console.log(newPresences))
  .on('presence', { event: 'leave' }, ({ leftPresences }) => console.log(leftPresences))
  .subscribe(async (status) => {
    if (status === 'SUBSCRIBED') await channel.track({ online_at: new Date().toISOString() })
  })

// Cleanup
supabase.removeChannel(channel)
supabase.removeAllChannels()
const channels = supabase.getChannels()
```