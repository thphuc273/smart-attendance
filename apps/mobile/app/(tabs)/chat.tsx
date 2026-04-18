import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { getApi } from '../../lib/api';
import { colors, radius } from '../../lib/theme';

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
}

const API_BASE_URL =
  (Constants.expoConfig?.extra?.EXPO_PUBLIC_API_BASE_URL as string | undefined) ??
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  'http://localhost:3000/api/v1';

export default function ChatTab() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const listRef = useRef<FlatList<ChatMsg>>(null);

  const loadHistory = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getApi()
        .get('ai/chat/history?limit=30')
        .json<{ data: Array<{ id: string; role: ChatMsg['role']; content: string }> }>();
      setMessages(res.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');
    const userMsg: ChatMsg = { id: `u-${Date.now()}`, role: 'user', content: text };
    const pendingId = `a-${Date.now()}`;
    setMessages((prev) => [...prev, userMsg, { id: pendingId, role: 'assistant', content: '' }]);
    setStreaming(true);

    try {
      const token = await SecureStore.getItemAsync('access_token');
      const res = await fetch(`${API_BASE_URL}/ai/chat`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'text/event-stream',
          authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          try {
            const json = JSON.parse(payload) as { delta?: string; done?: boolean; error?: string };
            if (json.delta) {
              setMessages((prev) =>
                prev.map((m) => (m.id === pendingId ? { ...m, content: m.content + json.delta } : m)),
              );
            }
            if (json.error) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === pendingId ? { ...m, content: `⚠️ ${json.error}` } : m,
                ),
              );
            }
          } catch {
            /* ignore malformed chunk */
          }
        }
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingId ? { ...m, content: `⚠️ ${(err as Error).message}` } : m,
        ),
      );
    } finally {
      setStreaming(false);
    }
  }, [input, streaming]);

  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}
    >
      <View style={styles.header}>
        <Text style={styles.title}>HR Assistant</Text>
        <Text style={styles.subtitle}>Hỏi về ca làm, phép, chấm công…</Text>
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} />
      ) : messages.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Chào bạn 👋</Text>
          <Text style={styles.emptyText}>
            Thử hỏi: "Tuần này tôi đã đi làm bao nhiêu ca?" hoặc "Còn bao nhiêu ngày phép?"
          </Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => (
            <View style={[styles.bubble, item.role === 'user' ? styles.bubbleUser : styles.bubbleBot]}>
              <Text style={item.role === 'user' ? styles.textUser : styles.textBot}>
                {item.content || '…'}
              </Text>
            </View>
          )}
        />
      )}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Nhập câu hỏi…"
          placeholderTextColor={colors.slate400}
          editable={!streaming}
          onSubmitEditing={send}
        />
        <Pressable
          onPress={send}
          disabled={streaming || !input.trim()}
          style={[styles.sendBtn, (streaming || !input.trim()) && { opacity: 0.4 }]}
        >
          <Text style={styles.sendTxt}>{streaming ? '…' : 'Gửi'}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  header: { padding: 20, paddingBottom: 12 },
  title: { fontSize: 22, fontWeight: '700', color: colors.slate900 },
  subtitle: { fontSize: 13, color: colors.slate500, marginTop: 2 },
  list: { padding: 16, gap: 10 },
  bubble: {
    maxWidth: '85%',
    padding: 12,
    borderRadius: radius.lg,
    marginBottom: 4,
  },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: colors.brand500 },
  bubbleBot: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  textUser: { color: '#fff', fontSize: 15 },
  textBot: { color: colors.slate700, fontSize: 15 },
  emptyState: { flex: 1, justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: colors.slate700, textAlign: 'center' },
  emptyText: { marginTop: 8, color: colors.slate500, textAlign: 'center' },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.slate900,
  },
  sendBtn: {
    backgroundColor: colors.brand600,
    borderRadius: radius.md,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  sendTxt: { color: '#fff', fontWeight: '700' },
});
