import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
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
import { getApi, getStoredUser, isAdmin, isManager, StoredUser } from '../../lib/api';
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

function getSuggestions(user: StoredUser | null): string[] {
  if (isAdmin(user)) {
    return [
      'Hôm nay có bao nhiêu nhân viên đi muộn?',
      'Chi nhánh nào có tỉ lệ đúng giờ cao nhất tuần này?',
      'Có bất thường nào cần chú ý không?',
    ];
  }
  if (isManager(user)) {
    return [
      'Ai đang chưa check-in hôm nay?',
      'Top 3 nhân viên đi muộn tuần này?',
      'Có ai có trust score thấp không?',
    ];
  }
  return [
    'Tuần này tôi đi muộn mấy lần?',
    'Ca làm sắp tới của tôi là khi nào?',
    'Tôi còn bao nhiêu ngày phép?',
  ];
}

export default function ChatTab() {
  const [user, setUser] = useState<StoredUser | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const listRef = useRef<FlatList<ChatMsg>>(null);

  useEffect(() => {
    void getStoredUser().then(setUser);
  }, []);

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

  const clearHistory = useCallback(() => {
    if (streaming) return;
    Alert.alert(
      'Đoạn chat mới',
      'Xoá đoạn chat hiện tại và bắt đầu đoạn mới?',
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Xoá',
          style: 'destructive',
          onPress: async () => {
            try {
              await getApi().delete('ai/chat/history');
            } catch {
              /* clear locally anyway */
            }
            setMessages([]);
          },
        },
      ],
    );
  }, [streaming]);

  const send = useCallback(
    async (overrideText?: string) => {
      const text = (overrideText ?? input).trim();
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
          // RN-specific: opt into text streaming so res.body.getReader() yields
          // chunks as they arrive instead of buffering the whole response.
          reactNative: { textStreaming: true },
        } as RequestInit);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const applyFrame = (payload: string) => {
          if (!payload) return;
          try {
            const json = JSON.parse(payload) as { delta?: string; done?: boolean; error?: string };
            if (json.delta) {
              setMessages((prev) =>
                prev.map((m) => (m.id === pendingId ? { ...m, content: m.content + json.delta } : m)),
              );
            }
            if (json.error) {
              setMessages((prev) =>
                prev.map((m) => (m.id === pendingId ? { ...m, content: `⚠️ ${json.error}` } : m)),
              );
            }
          } catch {
            /* malformed chunk — ignore */
          }
        };
        const flushLines = (chunk: string) => {
          for (const line of chunk.split(/\r?\n/)) {
            if (line.startsWith('data:')) applyFrame(line.slice(5).trim());
          }
        };

        // Preferred path: streaming via ReadableStream (dev client with textStreaming).
        // Fallback: Expo Go / RN builds where res.body is null — read full text then parse.
        if (res.body && typeof (res.body as { getReader?: unknown }).getReader === 'function') {
          const reader = (res.body as ReadableStream<Uint8Array>).getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() ?? '';
            flushLines(lines.join('\n'));
          }
          if (buffer) flushLines(buffer);
        } else {
          const fullText = await res.text();
          flushLines(fullText);
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
    },
    [input, streaming],
  );

  const roleLabel = isAdmin(user) ? 'Admin' : isManager(user) ? 'Manager' : 'Nhân viên';

  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>🤖 Trợ lý AI</Text>
          <Text style={styles.subtitle}>{roleLabel} • Hỏi về ca làm, phép, chấm công…</Text>
        </View>
        <Pressable
          onPress={clearHistory}
          disabled={streaming}
          style={[styles.newChatBtn, streaming && { opacity: 0.4 }]}
        >
          <Text style={styles.newChatTxt}>✨ Mới</Text>
        </Pressable>
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} />
      ) : messages.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Chào bạn 👋</Text>
          <Text style={styles.emptyText}>
            Hỏi gì đó về chấm công — trợ lý chỉ truy xuất dữ liệu bạn được phép xem.
          </Text>
          <View style={{ marginTop: 20, gap: 8 }}>
            {getSuggestions(user).map((s) => (
              <Pressable key={s} style={styles.suggestion} onPress={() => send(s)}>
                <Text style={styles.suggestionTxt}>{s}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => {
            const isPending = item.role === 'assistant' && !item.content && streaming;
            if (isPending) return <ThinkingBubble />;
            return (
              <View style={[styles.bubble, item.role === 'user' ? styles.bubbleUser : styles.bubbleBot]}>
                <Text style={item.role === 'user' ? styles.textUser : styles.textBot}>
                  {item.content}
                  {item.role === 'assistant' && streaming && item.content ? (
                    <Text style={styles.cursor}>▍</Text>
                  ) : null}
                </Text>
              </View>
            );
          }}
        />
      )}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={streaming ? 'Đang trả lời…' : 'Nhập câu hỏi…'}
          placeholderTextColor={colors.slate400}
          editable={!streaming}
          onSubmitEditing={() => send()}
        />
        <Pressable
          onPress={() => send()}
          disabled={streaming || !input.trim()}
          style={[styles.sendBtn, (streaming || !input.trim()) && { opacity: 0.4 }]}
        >
          <Text style={styles.sendTxt}>{streaming ? '…' : 'Gửi'}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function ThinkingBubble() {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const bounce = (v: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, { toValue: -4, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 300, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ]),
      );
    const a1 = bounce(dot1, 0);
    const a2 = bounce(dot2, 150);
    const a3 = bounce(dot3, 300);
    a1.start();
    a2.start();
    a3.start();
    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [dot1, dot2, dot3]);

  return (
    <View style={[styles.bubble, styles.bubbleBot, styles.thinking]}>
      <Text style={{ fontSize: 16 }}>🤖</Text>
      <Text style={styles.thinkingTxt}>Đang suy nghĩ</Text>
      <View style={styles.dotsRow}>
        <Animated.View style={[styles.dot, { backgroundColor: colors.brand400, transform: [{ translateY: dot1 }] }]} />
        <Animated.View style={[styles.dot, { backgroundColor: colors.brand500, transform: [{ translateY: dot2 }] }]} />
        <Animated.View style={[styles.dot, { backgroundColor: colors.brand600, transform: [{ translateY: dot3 }] }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 20,
    paddingBottom: 12,
    gap: 12,
  },
  title: { fontSize: 22, fontWeight: '700', color: colors.slate900 },
  subtitle: { fontSize: 13, color: colors.slate500, marginTop: 2 },
  newChatBtn: {
    backgroundColor: colors.brand500,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: 'center',
  },
  newChatTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
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
  cursor: { color: colors.brand500, fontWeight: '700' },
  thinking: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  thinkingTxt: { color: colors.slate500, fontSize: 13 },
  dotsRow: { flexDirection: 'row', gap: 4, marginLeft: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  emptyState: { flex: 1, justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: colors.slate700, textAlign: 'center' },
  emptyText: { marginTop: 8, color: colors.slate500, textAlign: 'center', fontSize: 13 },
  suggestion: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  suggestionTxt: { color: colors.slate700, fontSize: 13 },
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
