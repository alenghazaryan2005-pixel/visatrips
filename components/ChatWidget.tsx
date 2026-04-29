'use client';

import { useState, useRef, useEffect } from 'react';

// ── FAQ Knowledge Base ──
const FAQ_ENTRIES = [
  { keywords: ['how long', 'processing time', 'how fast', 'days', 'time'], answer: 'Standard processing takes 3-5 business days. Rush processing is 1-2 days, and Super Rush is available for urgent applications.' },
  { keywords: ['cost', 'price', 'how much', 'fee', 'pay'], answer: 'Our Tourist eVisa prices start at $25 for 30 days, $40 for 1 year, and $80 for 5 years. Government fees are included — no hidden charges.' },
  { keywords: ['document', 'need', 'require', 'passport', 'photo'], answer: 'You\'ll need: a valid passport (6+ months validity), a digital photo (JPEG, white background), and a scan of your passport bio page.' },
  { keywords: ['refund', 'money back', 'cancel'], answer: 'Service fees are non-refundable once your application has been submitted to authorities. Contact us before submission for a full refund.' },
  { keywords: ['status', 'track', 'check', 'application', 'where'], answer: 'You can check your application status anytime at visatrips.com/login. Use your email and the 6-digit PIN that was sent to you after placing your order.' },
  { keywords: ['tourist', '30 day', 'tourist visa'], answer: 'The Tourist eVisa (30 days) costs $25, allows double entry, and is valid for 30 days from arrival. Perfect for short trips!' },
  { keywords: ['business', 'business visa'], answer: 'We currently only process Tourist eVisas for India. For Business eVisa assistance, please email support@visatrips.com.' },
  { keywords: ['medical', 'medical visa', 'treatment'], answer: 'We currently only process Tourist eVisas for India. For Medical eVisa assistance, please email support@visatrips.com.' },
  { keywords: ['eligible', 'country', 'can i apply', 'nationality'], answer: 'Citizens of 160+ countries are eligible for Indian eVisa. Notable exception: Pakistani nationals must apply through an Indian embassy.' },
  { keywords: ['airport', 'port', 'arrive', 'entry'], answer: 'Indian eVisa is accepted at 33 airports, 33 seaports, and 4 land ports including Delhi, Mumbai, Bengaluru, Chennai, and Kolkata.' },
  { keywords: ['extend', 'extension', 'longer'], answer: 'India eVisas cannot be extended. You would need to apply for a new visa if you wish to stay longer.' },
  { keywords: ['reject', 'denied', 'refused'], answer: 'If your application is rejected, the fee is non-refundable. Common reasons include incorrect information or ineligible nationality. We review everything before submission to maximize approval chances.' },
  { keywords: ['multiple', 'entry', 'entries'], answer: 'The 30-day Tourist eVisa allows double entry. The 1-year and 5-year Tourist eVisas allow multiple entries.' },
  { keywords: ['help', 'support', 'contact', 'phone', 'email'], answer: 'Our support team is available Mon-Fri, 9am-6pm EST. You can reach us via the contact form or email at support@visatrips.com.' },
  { keywords: ['safe', 'secure', 'trust', 'legitimate', 'scam'], answer: 'VisaTrips uses bank-grade encryption (SSL/TLS) for all data. We\'re a legitimate visa processing service with a 98.7% approval rate and 50K+ visas processed.' },
  { keywords: ['pin', 'login', 'forgot', 'password', 'lost'], answer: 'Your PIN was sent to your email when you placed your order. Use the "Lost PIN?" button on the login page to recover it.' },
];

function findAnswer(query: string): string | null {
  const q = query.toLowerCase();
  let bestMatch: { answer: string; score: number } | null = null;

  for (const entry of FAQ_ENTRIES) {
    let score = 0;
    for (const kw of entry.keywords) {
      if (q.includes(kw)) score += kw.length;
    }
    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { answer: entry.answer, score };
    }
  }

  return bestMatch ? bestMatch.answer : null;
}

interface Message {
  id: number;
  sender: 'bot' | 'user';
  text: string;
  time: string;
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: 0, sender: 'bot', text: 'Hi there! 👋 I\'m the VisaTrips assistant. Ask me anything about Indian eVisas, or choose an option below.', time: 'now' },
  ]);
  const [input, setInput] = useState('');
  const [showOptions, setShowOptions] = useState(true);
  const [escalated, setEscalated] = useState(false);
  const [escalateForm, setEscalateForm] = useState(false);
  const [escalateName, setEscalateName] = useState('');
  const [escalateEmail, setEscalateEmail] = useState('');
  const [escalateSending, setEscalateSending] = useState(false);
  const [escalateSent, setEscalateSent] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const now = () => new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const addMessage = (sender: 'bot' | 'user', text: string) => {
    setMessages(prev => [...prev, { id: prev.length, sender, text, time: now() }]);
  };

  const handleSend = () => {
    if (!input.trim()) return;
    const userMsg = input.trim();
    addMessage('user', userMsg);
    setInput('');
    setShowOptions(false);

    // Search FAQ
    setTimeout(() => {
      const answer = findAnswer(userMsg);
      if (answer) {
        addMessage('bot', answer);
        setTimeout(() => {
          addMessage('bot', 'Did that help? You can ask me another question or talk to a real agent.');
        }, 500);
      } else {
        addMessage('bot', 'I\'m not sure about that one. Would you like to speak with a support agent? They can help with specific questions about your application.');
        setEscalated(true);
      }
    }, 800);
  };

  const handleQuickOption = (text: string) => {
    addMessage('user', text);
    setShowOptions(false);

    setTimeout(() => {
      const answer = findAnswer(text);
      if (answer) {
        addMessage('bot', answer);
      }
    }, 600);
  };

  const handleEscalate = async () => {
    if (!escalateName || !escalateEmail) return;
    setEscalateSending(true);

    try {
      // Create a CRM ticket with the chat history
      const chatHistory = messages.map(m => `${m.sender === 'bot' ? 'Bot' : 'Customer'}: ${m.text}`).join('\n');
      await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: escalateName,
          email: escalateEmail,
          message: `[Chat Widget Conversation]\n\n${chatHistory}`,
        }),
      });
      setEscalateSent(true);
      addMessage('bot', `Thanks ${escalateName.split(' ')[0]}! I've connected you with our support team. They'll respond to ${escalateEmail} within 24 hours.`);
      setEscalateForm(false);
    } catch {
      addMessage('bot', 'Sorry, something went wrong. Please try our contact page instead.');
    } finally {
      setEscalateSending(false);
    }
  };

  return (
    <>
      {/* Chat bubble button */}
      <button className="chat-widget-btn" onClick={() => setOpen(!open)} aria-label="Support chat">
        {open ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="chat-widget-panel">
          {/* Header */}
          <div className="chat-widget-header">
            <div className="chat-widget-header-info">
              <div className="chat-widget-avatar">V</div>
              <div>
                <div className="chat-widget-title">VisaTrips Support</div>
                <div className="chat-widget-status">
                  <span className="chat-widget-dot" /> Online — Ask me anything
                </div>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="chat-widget-messages">
            {messages.map(m => (
              <div key={m.id} className={`chat-msg ${m.sender}`}>
                {m.sender === 'bot' && <div className="chat-msg-avatar">V</div>}
                <div className={`chat-msg-bubble ${m.sender}`}>
                  {m.text}
                </div>
              </div>
            ))}

            {/* Quick options */}
            {showOptions && (
              <div className="chat-quick-options">
                <button className="chat-quick-btn" onClick={() => handleQuickOption('How much does an eVisa cost?')}>💰 Pricing</button>
                <button className="chat-quick-btn" onClick={() => handleQuickOption('How long does processing take?')}>⏱️ Processing time</button>
                <button className="chat-quick-btn" onClick={() => handleQuickOption('What documents do I need?')}>📄 Requirements</button>
                <button className="chat-quick-btn" onClick={() => handleQuickOption('How do I check my status?')}>🔍 Check status</button>
              </div>
            )}

            {/* Escalate to agent */}
            {escalated && !escalateForm && !escalateSent && (
              <div className="chat-escalate-prompt">
                <button className="chat-escalate-btn" onClick={() => setEscalateForm(true)}>
                  👤 Talk to a support agent
                </button>
              </div>
            )}

            {/* Escalate form */}
            {escalateForm && !escalateSent && (
              <div className="chat-escalate-form">
                <p className="chat-escalate-label">Enter your details and we'll get back to you:</p>
                <input className="chat-escalate-input" placeholder="Your name" value={escalateName} onChange={e => setEscalateName(e.target.value)} />
                <input className="chat-escalate-input" placeholder="Your email" type="email" value={escalateEmail} onChange={e => setEscalateEmail(e.target.value)} />
                <button className="chat-escalate-submit" onClick={handleEscalate} disabled={escalateSending || !escalateName || !escalateEmail}>
                  {escalateSending ? 'Connecting...' : 'Connect with agent'}
                </button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="chat-widget-input-wrap">
            <input
              className="chat-widget-input"
              placeholder="Type your question..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
            />
            <button className="chat-widget-send" onClick={handleSend} disabled={!input.trim()}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
