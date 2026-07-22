'use client';

import { useState } from 'react';

export default function TestPage() {
  const [userId] = useState('test-user-123');
  const [connectToken, setConnectToken] = useState('');
  const [connectLinkUrl, setConnectLinkUrl] = useState('');
  const [accountId, setAccountId] = useState('');
  const [calendarId, setCalendarId] = useState('primary');
  const [status, setStatus] = useState('');

  const generateToken = async () => {
    setStatus('Generating token...');
    try {
      const res = await fetch('/api/connect/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      const data = await res.json();
      setConnectToken(data.token);
      setConnectLinkUrl(data.connectLinkUrl);
      setStatus('Token generated! Click the Connect link below.');
    } catch (error: any) {
      setStatus(`Error: ${error.message}`);
    }
  };

  const deploySource = async () => {
    if (!accountId) {
      setStatus('Please enter Account ID first');
      return;
    }
    setStatus('Deploying source...');
    try {
      const res = await fetch('/api/deploy-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, accountId, calendarId })
      });
      const data = await res.json();
      if (data.error) {
        setStatus(`Error: ${data.error}`);
      } else {
        setStatus(`Source deployed! ID: ${data.source.source_id}`);
      }
    } catch (error: any) {
      setStatus(`Error: ${error.message}`);
    }
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace' }}>
      <h1>CalConnect POC Test Interface</h1>

      <div style={{ marginTop: '2rem' }}>
        <h2>Step 1: Generate Connect Token</h2>
        <p>User ID: <strong>{userId}</strong></p>
        <button 
          onClick={generateToken}
          style={{ 
            padding: '0.5rem 1rem', 
            background: '#0070f3', 
            color: 'white', 
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Generate Token
        </button>
        {connectLinkUrl && (
          <div style={{ marginTop: '1rem' }}>
            <p>Connect URL:</p>
            <a
              href={`${connectLinkUrl}&app=google_calendar`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: '#0070f3',
                textDecoration: 'underline',
                wordBreak: 'break-all'
              }}
            >
              {connectLinkUrl}&app=google_calendar
            </a>
            <p style={{ marginTop: '1rem', fontSize: '0.9em', color: '#666' }}>
              After connecting, Pipedream will automatically send the account details to our webhook.
              Check the server logs and database to see the account was saved!
            </p>
          </div>
        )}
      </div>

      <div style={{ marginTop: '2rem' }}>
        <h2>Step 2: Deploy Calendar Source</h2>
        <div>
          <label>
            Account ID (from Connect):
            <input
              type="text"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              style={{ 
                marginLeft: '1rem', 
                width: '300px',
                padding: '0.5rem',
                border: '1px solid #ccc',
                borderRadius: '4px'
              }}
              placeholder="apn_abc123..."
            />
          </label>
        </div>
        <div style={{ marginTop: '1rem' }}>
          <label>
            Calendar ID:
            <input
              type="text"
              value={calendarId}
              onChange={(e) => setCalendarId(e.target.value)}
              style={{ 
                marginLeft: '1rem', 
                width: '300px',
                padding: '0.5rem',
                border: '1px solid #ccc',
                borderRadius: '4px'
              }}
              placeholder="primary"
            />
          </label>
        </div>
        <button 
          onClick={deploySource} 
          style={{ 
            marginTop: '1rem',
            padding: '0.5rem 1rem', 
            background: '#0070f3', 
            color: 'white', 
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Deploy Source
        </button>
      </div>

      <div style={{ 
        marginTop: '2rem', 
        padding: '1rem', 
        background: '#f0f0f0',
        borderRadius: '4px'
      }}>
        <h3>Status:</h3>
        <p>{status || 'Ready'}</p>
      </div>

      <div style={{ marginTop: '2rem', fontSize: '0.9em' }}>
        <h3>Testing Instructions:</h3>
        <ol>
          <li>Click "Generate Token"</li>
          <li>Click the Connect URL to authorize Google Calendar</li>
          <li>Pipedream will automatically POST account details to our webhook</li>
          <li>Check server console - you should see "Account connected successfully"</li>
          <li>Query your Supabase database to find the account_id</li>
          <li>Paste Account ID above and click "Deploy Source"</li>
          <li>Create a test event in your Google Calendar</li>
          <li>Check the webhook logs and database for mirror events</li>
        </ol>

        <h3 style={{ marginTop: '1rem' }}>Current Configuration:</h3>
        <ul>
          <li>Connect webhook: {process.env.NEXT_PUBLIC_WEBHOOK_BASE_URL || 'Not configured'}/api/connect/callback</li>
          <li>Event webhook: {process.env.NEXT_PUBLIC_WEBHOOK_BASE_URL || 'Not configured'}/api/webhook</li>
          <li>ngrok URL should be set in .env.local as WEBHOOK_BASE_URL</li>
        </ul>

        <h3 style={{ marginTop: '1rem' }}>Required Supabase Tables:</h3>
        <ul>
          <li><code>connect_tokens</code> - Stores temporary token→userId mappings</li>
          <li><code>user_accounts</code> - Stores connected Google Calendar accounts</li>
          <li><code>pipedream_sources</code> - Stores deployed calendar sources</li>
          <li><code>webhook_events</code> - Logs incoming webhooks for debugging</li>
        </ul>
      </div>
    </div>
  );
}
