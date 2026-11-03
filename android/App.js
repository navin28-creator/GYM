import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { apiRequest, loadSession, saveSession } from './api';

const COLORS = {
  ink: '#152322',
  muted: '#647572',
  paper: '#f4f7f3',
  white: '#ffffff',
  line: '#dce5df',
  green: '#087e59',
  paleGreen: '#e1f4e9',
  coral: '#bd4d3e',
};

const today = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

function Field({ label, value, onChangeText, placeholder, keyboardType = 'default', multiline = false, ...inputProps }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder || label}
        placeholderTextColor="#8b9994"
        keyboardType={keyboardType}
        autoCapitalize={keyboardType === 'email-address' || keyboardType === 'url' ? 'none' : 'sentences'}
        multiline={multiline}
        style={[styles.input, multiline && styles.multiline]}
        {...inputProps}
      />
    </View>
  );
}

function ActionButton({ label, onPress, secondary = false, disabled = false }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondaryButton,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>{label}</Text>
    </Pressable>
  );
}

function StatusTag({ status }) {
  const isPositive = ['active', 'upcoming'].includes(status);
  return (
    <View style={[styles.statusTag, isPositive ? styles.statusGood : styles.statusQuiet]}>
      <Text style={[styles.statusText, isPositive ? styles.statusGoodText : styles.statusQuietText]}>
        {status || 'no membership'}
      </Text>
    </View>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [screen, setScreen] = useState('members');
  const [members, setMembers] = useState([]);
  const [member, setMember] = useState(null);
  const [plans, setPlans] = useState([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [apiUrl, setApiUrl] = useState(process.env.EXPO_PUBLIC_API_URL || '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newMember, setNewMember] = useState({ name: '', phone: '', email: '' });
  const [membershipForm, setMembershipForm] = useState({ planId: '', startDate: today() });
  const [paymentForm, setPaymentForm] = useState({ membershipId: '', amount: '', paymentDate: today(), method: 'cash' });

  async function callApi(route, options = {}, activeSession = session) {
    try {
      return await apiRequest(activeSession.apiUrl, route, {
        ...options,
        token: activeSession.token,
      });
    } catch (requestError) {
      if (requestError.status === 401) {
        await saveSession(null);
        setSession(null);
        setScreen('members');
      }
      throw requestError;
    }
  }

  async function refreshMembers(query = search, activeSession = session) {
    if (!activeSession) return;
    const result = await callApi(`/api/members?search=${encodeURIComponent(query)}`, {}, activeSession);
    setMembers(result.members);
  }

  async function openMember(memberId) {
    const result = await callApi(`/api/members/${memberId}`);
    setMember(result);
    setScreen('detail');
  }

  useEffect(() => {
    let active = true;
    loadSession().then(async (savedSession) => {
      if (!active || !savedSession) return;
      try {
        const result = await apiRequest(savedSession.apiUrl, '/api/me', { token: savedSession.token });
        if (!active) return;
        setSession({ ...savedSession, user: result.user });
        await refreshMembers('', savedSession);
      } catch {
        await saveSession(null);
      }
    }).catch(() => setError('Could not read the saved sign-in.'));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(() => {
      refreshMembers(search).catch((requestError) => setError(requestError.message));
    }, 250);
    return () => clearTimeout(timer);
  }, [search, session]);

  async function signIn() {
    setBusy(true);
    setError('');
    try {
      const cleanUrl = apiUrl.trim().replace(/\/+$/, '');
      const parsedUrl = new URL(cleanUrl);
      if (parsedUrl.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(parsedUrl.hostname)) {
        throw new Error('Use the HTTPS address shown by Tailscale for secure mobile access.');
      }
      const result = await apiRequest(cleanUrl, '/api/mobile/login', {
        method: 'POST',
        body: { username: username.trim(), password },
      });
      const nextSession = { apiUrl: cleanUrl, token: result.token, user: result.user };
      await saveSession(nextSession);
      setSession(nextSession);
      setPassword('');
      await refreshMembers('', nextSession);
      setSearch('');
    } catch (requestError) {
      setError(requestError.message || 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    try {
      if (session) await callApi('/api/logout', { method: 'POST' });
    } catch {
      await saveSession(null);
    }
    await saveSession(null);
    setSession(null);
    setMember(null);
    setMembers([]);
  }

  async function createMember() {
    setBusy(true);
    setError('');
    try {
      const result = await callApi('/api/members', {
        method: 'POST',
        body: newMember,
      });
      setNewMember({ name: '', phone: '', email: '' });
      await refreshMembers();
      await openMember(result.id);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveMember() {
    setBusy(true);
    setError('');
    try {
      await callApi(`/api/members/${member.member.id}`, {
        method: 'PATCH',
        body: {
          name: member.member.name,
          phone: member.member.phone,
          email: member.member.email,
          notes: member.member.notes,
        },
      });
      await openMember(member.member.id);
      await refreshMembers();
      Alert.alert('Saved', 'Member details updated.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function loadPlans() {
    try {
      const result = await callApi('/api/plans');
      setPlans(result.plans.filter((plan) => plan.is_active));
      setScreen('membership');
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function createMembership() {
    setBusy(true);
    setError('');
    try {
      await callApi('/api/memberships', {
        method: 'POST',
        body: { memberId: member.member.id, ...membershipForm },
      });
      await openMember(member.member.id);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function createPayment() {
    setBusy(true);
    setError('');
    try {
      await callApi('/api/payments', {
        method: 'POST',
        body: paymentForm,
      });
      await openMember(member.member.id);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  function goBack() {
    setError('');
    setScreen(member ? 'detail' : 'members');
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.paper} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
          <ScrollView contentContainerStyle={styles.loginPage} keyboardShouldPersistTaps="handled">
            <View style={styles.brandMark}><Text style={styles.brandMarkText}>G</Text></View>
            <Text style={styles.eyebrow}>GOODFORM GYM</Text>
            <Text style={styles.loginTitle}>Your gym, in reach.</Text>
            <Text style={styles.loginIntro}>Sign in to the desktop system on your private Tailscale network.</Text>
            <View style={styles.form}>
              <Field label="Tailscale HTTPS address" value={apiUrl} onChangeText={setApiUrl} placeholder="https://gym-pc.example.ts.net" keyboardType="url" />
              <Field label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" />
              <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry />
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              <ActionButton label={busy ? 'Signing in…' : 'Sign in'} onPress={signIn} disabled={busy || !apiUrl || !username || !password} />
              {busy ? <ActivityIndicator color={COLORS.green} /> : null}
            </View>
            <Text style={styles.loginFootnote}>Private connection · SQLite stays on your gym computer</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.paper} />
      <View style={styles.topBar}>
        <View>
          <Text style={styles.eyebrow}>GOODFORM GYM</Text>
          <Text style={styles.topTitle}>{screen === 'members' ? 'Members' : screen === 'detail' ? 'Member record' : screen === 'add' ? 'New member' : screen === 'membership' ? 'New membership' : 'Record payment'}</Text>
        </View>
        <Pressable onPress={signOut} hitSlop={12}><Text style={styles.signOut}>Sign out</Text></Pressable>
      </View>

      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

      {screen === 'members' ? (
        <>
          <View style={styles.listTools}>
            <TextInput value={search} onChangeText={setSearch} placeholder="Search name or phone" placeholderTextColor="#82918b" style={styles.searchInput} />
            <Pressable style={styles.addButton} onPress={() => setScreen('add')}><Text style={styles.addButtonText}>+ Add</Text></Pressable>
          </View>
          <Text style={styles.resultCount}>{members.length} records · signed in as {session.user.username}</Text>
          <ScrollView contentContainerStyle={styles.listContent}>
            {members.map((item) => (
              <Pressable key={item.id} onPress={() => openMember(item.id)} style={({ pressed }) => [styles.memberRow, pressed && styles.pressed]}>
                <View style={styles.memberInitial}><Text style={styles.memberInitialText}>{item.name.slice(0, 1).toUpperCase()}</Text></View>
                <View style={styles.memberCopy}>
                  <Text style={styles.memberName}>{item.name}</Text>
                  <Text style={styles.memberMeta}>{item.phone}{item.plan_name ? `  ·  ${item.plan_name}` : ''}</Text>
                </View>
                <StatusTag status={item.status} />
              </Pressable>
            ))}
            {!members.length ? <Text style={styles.emptyText}>No matching members.</Text> : null}
          </ScrollView>
        </>
      ) : null}

      {screen === 'add' ? (
        <ScrollView contentContainerStyle={styles.formPage} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionTitle}>Member details</Text>
          <Field label="Full name" value={newMember.name} onChangeText={(name) => setNewMember({ ...newMember, name })} />
          <Field label="Phone number" value={newMember.phone} onChangeText={(phone) => setNewMember({ ...newMember, phone })} keyboardType="phone-pad" />
          <Field label="Email (optional)" value={newMember.email} onChangeText={(email) => setNewMember({ ...newMember, email })} keyboardType="email-address" />
          <ActionButton label={busy ? 'Saving…' : 'Create member'} onPress={createMember} disabled={busy || !newMember.name || !newMember.phone} />
          <ActionButton label="Cancel" onPress={goBack} secondary />
        </ScrollView>
      ) : null}

      {screen === 'detail' && member ? (
        <ScrollView contentContainerStyle={styles.formPage} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionTitle}>Profile</Text>
          <Field label="Full name" value={member.member.name} onChangeText={(name) => setMember({ ...member, member: { ...member.member, name } })} />
          <Field label="Phone number" value={member.member.phone} onChangeText={(phone) => setMember({ ...member, member: { ...member.member, phone } })} keyboardType="phone-pad" />
          <Field label="Email" value={member.member.email} onChangeText={(email) => setMember({ ...member, member: { ...member.member, email } })} keyboardType="email-address" />
          <Field label="Notes" value={member.member.notes} onChangeText={(notes) => setMember({ ...member, member: { ...member.member, notes } })} multiline />
          <ActionButton label={busy ? 'Saving…' : 'Save changes'} onPress={saveMember} disabled={busy} />
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>Memberships</Text>
            <Pressable onPress={loadPlans}><Text style={styles.inlineAction}>+ Add</Text></Pressable>
          </View>
          {member.memberships.map((item) => (
            <View key={item.id} style={styles.infoRow}>
              <View style={styles.memberCopy}>
                <Text style={styles.memberName}>{item.plan_name}</Text>
                <Text style={styles.memberMeta}>{item.start_date} to {item.end_date}</Text>
                <Text style={styles.balance}>Balance ₹{(item.balance_paise / 100).toFixed(2)}</Text>
              </View>
              <StatusTag status={item.status} />
            </View>
          ))}
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>Payments</Text>
            {member.memberships.length ? <Pressable onPress={() => {
              setPaymentForm({ ...paymentForm, membershipId: String(member.memberships[0].id) });
              setScreen('payment');
            }}><Text style={styles.inlineAction}>+ Record</Text></Pressable> : null}
          </View>
          {member.payments.map((item) => (
            <View key={item.id} style={styles.paymentRow}>
              <View><Text style={styles.memberName}>{item.payment_date} · {item.method}</Text><Text style={styles.memberMeta}>{item.plan_name}</Text></View>
              <Text style={styles.paymentAmount}>₹{(item.amount_paise / 100).toFixed(2)}</Text>
            </View>
          ))}
          {!member.payments.length ? <Text style={styles.emptyText}>No payments recorded.</Text> : null}
        </ScrollView>
      ) : null}

      {screen === 'membership' ? (
        <ScrollView contentContainerStyle={styles.formPage} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionTitle}>For {member?.member.name}</Text>
          <Text style={styles.fieldLabel}>Plan</Text>
          {plans.map((plan) => (
            <Pressable key={plan.id} onPress={() => setMembershipForm({ ...membershipForm, planId: String(plan.id) })} style={[styles.choiceRow, membershipForm.planId === String(plan.id) && styles.choiceSelected]}>
              <Text style={styles.memberName}>{plan.name} · ₹{(plan.price_paise / 100).toFixed(2)}</Text>
              <Text style={styles.memberMeta}>{plan.duration_days} days</Text>
            </Pressable>
          ))}
          <Field label="Start date (YYYY-MM-DD)" value={membershipForm.startDate} onChangeText={(startDate) => setMembershipForm({ ...membershipForm, startDate })} />
          <ActionButton label={busy ? 'Saving…' : 'Create membership'} onPress={createMembership} disabled={busy || !membershipForm.planId} />
          <ActionButton label="Cancel" onPress={goBack} secondary />
        </ScrollView>
      ) : null}

      {screen === 'payment' ? (
        <ScrollView contentContainerStyle={styles.formPage} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionTitle}>Payment for {member?.member.name}</Text>
          <Text style={styles.fieldLabel}>Membership</Text>
          {member?.memberships.map((item) => (
            <Pressable key={item.id} onPress={() => setPaymentForm({ ...paymentForm, membershipId: String(item.id) })} style={[styles.choiceRow, paymentForm.membershipId === String(item.id) && styles.choiceSelected]}>
              <Text style={styles.memberName}>{item.plan_name}</Text>
              <Text style={styles.memberMeta}>{item.start_date} to {item.end_date}</Text>
            </Pressable>
          ))}
          <Field label="Amount (₹)" value={paymentForm.amount} onChangeText={(amount) => setPaymentForm({ ...paymentForm, amount })} keyboardType="decimal-pad" />
          <Field label="Payment date (YYYY-MM-DD)" value={paymentForm.paymentDate} onChangeText={(paymentDate) => setPaymentForm({ ...paymentForm, paymentDate })} />
          <Text style={styles.fieldLabel}>Method</Text>
          <View style={styles.methodOptions}>
            {['cash', 'upi', 'card', 'bank_transfer', 'other'].map((method) => (
              <Pressable key={method} onPress={() => setPaymentForm({ ...paymentForm, method })} style={[styles.methodOption, paymentForm.method === method && styles.methodSelected]}>
                <Text style={[styles.methodText, paymentForm.method === method && styles.methodTextSelected]}>{method.replace('_', ' ')}</Text>
              </Pressable>
            ))}
          </View>
          <ActionButton label={busy ? 'Saving…' : 'Record payment'} onPress={createPayment} disabled={busy || !paymentForm.membershipId || !paymentForm.amount} />
          <ActionButton label="Cancel" onPress={goBack} secondary />
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.paper },
  fill: { flex: 1 },
  loginPage: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 26, paddingVertical: 36 },
  brandMark: { width: 52, height: 52, borderRadius: 16, backgroundColor: COLORS.green, alignItems: 'center', justifyContent: 'center', marginBottom: 26 },
  brandMarkText: { color: COLORS.white, fontSize: 26, fontWeight: '800' },
  eyebrow: { color: COLORS.green, fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  loginTitle: { color: COLORS.ink, fontSize: 32, fontWeight: '800', marginTop: 10 },
  loginIntro: { color: COLORS.muted, fontSize: 15, lineHeight: 22, marginTop: 10, maxWidth: 350 },
  form: { marginTop: 30, gap: 12 },
  loginFootnote: { color: COLORS.muted, fontSize: 12, marginTop: 30 },
  field: { marginBottom: 12 },
  fieldLabel: { color: COLORS.ink, fontSize: 13, fontWeight: '700', marginBottom: 7 },
  input: { minHeight: 50, borderWidth: 1, borderColor: COLORS.line, borderRadius: 10, backgroundColor: COLORS.white, paddingHorizontal: 14, color: COLORS.ink, fontSize: 15 },
  multiline: { minHeight: 90, paddingTop: 12, textAlignVertical: 'top' },
  button: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: COLORS.green, paddingHorizontal: 16, marginTop: 4 },
  buttonText: { color: COLORS.white, fontSize: 15, fontWeight: '800' },
  secondaryButton: { backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.line },
  secondaryButtonText: { color: COLORS.ink },
  pressed: { opacity: 0.78 },
  disabled: { opacity: 0.45 },
  errorText: { color: COLORS.coral, fontSize: 13, lineHeight: 19 },
  errorBanner: { color: COLORS.coral, backgroundColor: '#fcebe7', paddingHorizontal: 18, paddingVertical: 10, fontSize: 13 },
  topBar: { minHeight: 78, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, borderBottomWidth: 1, borderColor: COLORS.line },
  topTitle: { color: COLORS.ink, fontSize: 24, fontWeight: '800', marginTop: 3 },
  signOut: { color: COLORS.green, fontSize: 14, fontWeight: '700' },
  listTools: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 16 },
  searchInput: { flex: 1, height: 48, borderRadius: 10, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.white, paddingHorizontal: 14, fontSize: 15, color: COLORS.ink },
  addButton: { minWidth: 72, borderRadius: 10, backgroundColor: COLORS.green, alignItems: 'center', justifyContent: 'center' },
  addButtonText: { color: COLORS.white, fontWeight: '800', fontSize: 14 },
  resultCount: { color: COLORS.muted, fontSize: 12, paddingHorizontal: 18, paddingTop: 13, paddingBottom: 8 },
  listContent: { paddingHorizontal: 12, paddingBottom: 24 },
  memberRow: { minHeight: 78, backgroundColor: COLORS.white, borderBottomWidth: 1, borderColor: COLORS.line, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 12 },
  memberInitial: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.paleGreen },
  memberInitialText: { color: COLORS.green, fontSize: 17, fontWeight: '800' },
  memberCopy: { flex: 1 },
  memberName: { color: COLORS.ink, fontSize: 15, fontWeight: '700' },
  memberMeta: { color: COLORS.muted, fontSize: 12, marginTop: 4 },
  statusTag: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 7 },
  statusGood: { backgroundColor: COLORS.paleGreen },
  statusQuiet: { backgroundColor: '#e9eeeb' },
  statusText: { fontSize: 10, fontWeight: '800', textTransform: 'capitalize' },
  statusGoodText: { color: COLORS.green },
  statusQuietText: { color: COLORS.muted },
  emptyText: { color: COLORS.muted, textAlign: 'center', paddingVertical: 30, fontSize: 14 },
  formPage: { padding: 18, paddingBottom: 40 },
  sectionTitle: { color: COLORS.ink, fontSize: 18, fontWeight: '800', marginBottom: 14 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 26, marginBottom: 8 },
  inlineAction: { color: COLORS.green, fontSize: 14, fontWeight: '800' },
  infoRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: COLORS.line, gap: 10 },
  balance: { color: COLORS.green, fontSize: 12, fontWeight: '700', marginTop: 5 },
  paymentRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: COLORS.line },
  paymentAmount: { color: COLORS.ink, fontSize: 14, fontWeight: '800' },
  choiceRow: { padding: 14, borderRadius: 10, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.white, marginBottom: 8 },
  choiceSelected: { borderColor: COLORS.green, backgroundColor: COLORS.paleGreen },
  methodOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 18 },
  methodOption: { borderWidth: 1, borderColor: COLORS.line, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 11, backgroundColor: COLORS.white },
  methodSelected: { backgroundColor: COLORS.green, borderColor: COLORS.green },
  methodText: { color: COLORS.ink, fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  methodTextSelected: { color: COLORS.white },
});
