import { useEffect, useState } from 'react';
import { api } from '../api.js';

const LANGS = [['en', 'English', 'en-NG'], ['yo', 'Yoruba', 'yo-NG'], ['ig', 'Igbo', 'ig-NG'], ['ha', 'Hausa', 'ha-NG'], ['pcm', 'Pidgin', 'en-NG']];

export default function Assistant({ user }) {
  const [lang, setLang] = useState('en');
  const [text, setText] = useState('');
  const [chat, setChat] = useState([]);
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState(null); // null = checking
  useEffect(() => {
    api('/ai/status').then((s) => setAvailable(s.available)).catch(() => setAvailable(false));
  }, []);
  const locale = LANGS.find((l) => l[0] === lang)[2];

  function listen() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return alert('Voice input is not supported in this browser. Try Chrome.');
    const rec = new SR(); rec.lang = locale;
    rec.onresult = (e) => setText(e.results[0][0].transcript);
    rec.start();
  }
  const speak = (t) => { const u = new SpeechSynthesisUtterance(t); u.lang = locale; speechSynthesis.speak(u); };

  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    const history = chat.map((m) => ({ role: m.role, content: m.content }));
    const asked = text;
    setChat((c) => [...c, { role: 'user', content: asked }]); setText(''); setBusy(true);
    try {
      const { reply } = await api('/ai/chat', { method: 'POST', body: { message: asked, language: lang, history } });
      setChat((c) => [...c, { role: 'assistant', content: reply }]); speak(reply);
    } catch (err) { setChat((c) => [...c, { role: 'assistant', content: err.message }]); }
    setBusy(false);
  }

  if (available === null) return <p className="muted">Loading…</p>;
  if (!available) return (
    <section className="card narrow">
      <h2>AI farm assistant: coming soon</h2>
      <p>Soon you will be able to ask farming questions by voice or text in English, Yoruba, Igbo, Hausa and Pidgin. For now, use the marketplace, investment and equipment pages.</p>
    </section>
  );
  if (!user) return <p>Please log in to use the AI assistant.</p>;
  return (
    <>
      <h2>Ask the farm assistant</h2>
      <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Language">
        {LANGS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
      </select>
      <div className="chat" aria-live="polite">
        {chat.map((m, i) => <p key={i} className={m.role}>{m.content}</p>)}
        {busy && <p className="assistant muted">Thinking…</p>}
      </div>
      <form className="row" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="When should I spray my maize?" />
        <button type="button" className="ghost" onClick={listen} aria-label="Speak your question">🎤</button>
        <button className="btn">Send</button>
      </form>
    </>
  );
}
