import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase-server'

// FRESH REBUILD — exact 1:1 port of direction-5-product-hero.html
// No scoping prefix. Class names identical to artifact.

const CSS = `
.cc-v5 {
  --bg: #f7f5ee;
  --panel: #ffffff;
  --tint: #efece2;
  --deep: #14140f;
  --text: #1c1b16;
  --text-2: #4e4d47;
  --text-3: #8a887f;
  --border: rgba(28,27,22,0.08);
  --border-strong: rgba(28,27,22,0.16);
  --accent: #de5b28;
  --serif: var(--font-serif-display), 'Iowan Old Style', Georgia, serif;
  --sans: var(--font-inter), 'Inter', system-ui, sans-serif;

  background: var(--bg);
  color: var(--text);
  font-family: var(--sans);
  font-size: 15px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  min-height: 100vh;
}
.cc-v5 *, .cc-v5 *::before, .cc-v5 *::after { box-sizing: border-box; margin: 0; padding: 0; }
.cc-v5 a { color: inherit; text-decoration: none; }

/* CONTAINER */
.cc-v5-container { max-width: 1320px; margin: 0 auto; padding: 0 32px; }

/* NAV */
.cc-v5-nav { padding: 20px 0; background: var(--bg); }
.cc-v5-nav-inner { display: flex; justify-content: space-between; align-items: center; max-width: 1320px; margin: 0 auto; padding: 0 32px; }
.cc-v5-brand { font-family: var(--serif); font-size: 22px; font-weight: 400; letter-spacing: -0.005em; color: var(--text); }
.cc-v5-brand em { font-style: italic; color: var(--accent); }
.cc-v5-nav-menu { display: none; gap: 32px; font-size: 14px; color: var(--text-2); font-weight: 500; }
@media (min-width: 800px) { .cc-v5-nav-menu { display: flex; } }
.cc-v5-btn { font-family: var(--sans); font-size: 14px; font-weight: 500; padding: 8px 16px; background: transparent; color: var(--text); border: 0.5px solid var(--border-strong); border-radius: 999px; cursor: pointer; transition: background 150ms; display: inline-block; }
.cc-v5-btn:hover { background: var(--tint); }
.cc-v5-btn-solid { background: var(--deep); color: #f7f5ee !important; border-color: var(--deep); padding: 10px 20px; }
.cc-v5-btn-solid:hover { background: #2a2a20; color: #f7f5ee !important; }
.cc-v5-btn-accent { background: var(--accent); color: white; border-color: var(--accent); }
.cc-v5-btn-accent:hover { background: #c14b1e; color: white; }

/* HERO — text column matches calendar visual */
.cc-v5-hero { padding: 40px 0 32px; display: grid; grid-template-columns: 1fr; gap: 40px; align-items: center; }
@media (min-width: 900px) {
  .cc-v5-hero {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 56px;
    padding: 72px 0 56px;
  }
}
@media (min-width: 1100px) {
  .cc-v5-hero { grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); gap: 72px; }
}
.cc-v5-h-status { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-2); margin-bottom: 24px; font-weight: 500; }
.cc-v5-h-status::before { content: ''; width: 7px; height: 7px; background: #10b981; border-radius: 50%; box-shadow: 0 0 0 3px rgba(16,185,129,0.15); }
.cc-v5 h1 { font-family: var(--serif); font-size: clamp(44px, 5.6vw, 72px); line-height: 1.05; letter-spacing: -0.02em; font-weight: 400; font-synthesis-weight: none; margin-bottom: 20px; color: var(--deep); }
.cc-v5 h1 em { font-style: italic; color: var(--accent); }
.cc-v5-lede { font-size: 18px; color: var(--text-2); line-height: 1.55; margin-bottom: 32px; }
.cc-v5-h-cta { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 20px; }
.cc-v5-h-note { font-size: 13px; color: var(--text-3); }

/* CAL STAGE */
.cc-v5-cal-stage { position: relative; padding: 20px; background: var(--panel); border: 0.5px solid var(--border); border-radius: 16px; box-shadow: 0 1px 0 rgba(0,0,0,0.02), 0 40px 60px -20px rgba(0,0,0,0.06); }
.cc-v5-cal-stage-head { display: flex; justify-content: space-between; align-items: center; padding: 0 4px 12px; border-bottom: 0.5px solid var(--border); margin-bottom: 12px; }
.cc-v5-cal-title { font-size: 12px; font-weight: 500; color: var(--text-2); letter-spacing: 0.03em; text-transform: uppercase; }
.cc-v5-cal-live { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text-3); }
.cc-v5-cal-live::before { content: ''; width: 5px; height: 5px; background: #10b981; border-radius: 50%; }
.cc-v5-cal-triple { display: grid; grid-template-columns: 1fr; gap: 10px; }
@media (min-width: 640px) { .cc-v5-cal-triple { grid-template-columns: repeat(3, 1fr); } }
.cc-v5-cal-mini { background: var(--bg); border: 0.5px solid var(--border); border-radius: 10px; padding: 10px 12px; font-size: 12px; }
.cc-v5-cal-mini-head { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 500; color: var(--text); padding-bottom: 8px; border-bottom: 0.5px solid var(--border); margin-bottom: 8px; }
.cc-v5-cal-mini-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.cc-v5-cal-mini .cc-v5-row { display: grid; grid-template-columns: 26px 1fr; padding: 3px 0; align-items: center; min-height: 22px; }
.cc-v5-rt { font-size: 9px; color: var(--text-3); font-variant-numeric: tabular-nums; }
.cc-v5-ev { padding: 2px 6px; font-size: 10px; font-weight: 500; border-radius: 3px; display: inline-block; }
.cc-v5-ev-w { background: #dbeafe; color: #1e40af; }
.cc-v5-ev-p { background: #fee2e2; color: #991b1b; }
.cc-v5-ev-a { background: #fef3c7; color: #78350f; }
.cc-v5-ev-b { background: repeating-linear-gradient(-45deg, transparent, transparent 2px, rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 3px); color: var(--text-2); border: 0.5px dashed var(--border-strong); }

/* SECTIONS */
.cc-v5-section { padding: 72px 0; }
@media (min-width: 720px) { .cc-v5-section { padding: 96px 0; } }
.cc-v5-section.cc-v5-dark { background: var(--deep); color: var(--bg); }
.cc-v5-section.cc-v5-dark .cc-v5-lede, .cc-v5-section.cc-v5-dark h2, .cc-v5-section.cc-v5-dark p { color: var(--bg); }
.cc-v5-section.cc-v5-dark .cc-v5-text-mute { color: rgba(247,245,238,0.6); }
.cc-v5-section.cc-v5-tint { background: var(--tint); }

.cc-v5 h2 { font-family: var(--serif); font-size: clamp(34px, 5vw, 54px); line-height: 1.05; letter-spacing: -0.02em; font-weight: 400; font-synthesis-weight: none; margin-bottom: 20px; max-width: 1100px; color: var(--deep); }
.cc-v5 h2 em { font-style: italic; color: var(--accent); }
.cc-v5 h2 .cc-v5-m { color: var(--text-3); }
.cc-v5-sec-lede { font-size: 18px; line-height: 1.55; color: var(--text-2); max-width: 780px; margin-bottom: 56px; }

/* FEATURES */
.cc-v5-grid-3 { display: grid; grid-template-columns: 1fr; gap: 12px; }
@media (min-width: 720px) { .cc-v5-grid-3 { grid-template-columns: repeat(3, 1fr); gap: 20px; } }
.cc-v5-f-card { background: var(--panel); border: 0.5px solid var(--border); border-radius: 14px; padding: 28px; }
.cc-v5-f-glyph { font-family: var(--serif); font-size: 40px; font-style: italic; color: var(--accent); line-height: 1; margin-bottom: 20px; font-weight: 400; }
.cc-v5-f-card h3 { font-family: var(--sans); font-size: 17px; font-weight: 600; letter-spacing: -0.01em; margin-bottom: 8px; }
.cc-v5-f-card p { font-size: 14px; color: var(--text-2); line-height: 1.55; }

/* SHOWCASE */
.cc-v5-showcase { display: grid; grid-template-columns: 1fr; gap: 40px; }
@media (min-width: 720px) { .cc-v5-showcase { grid-template-columns: 340px 1fr; gap: 56px; align-items: start; } }
.cc-v5-sc-copy h3 { font-family: var(--serif); font-size: 28px; line-height: 1.15; letter-spacing: -0.015em; font-weight: 400; margin-bottom: 12px; }
.cc-v5-sc-copy h3 em { font-style: italic; }
.cc-v5-sc-copy p { color: var(--text-2); font-size: 15px; line-height: 1.6; margin-bottom: 16px; }
.cc-v5-sc-visual { background: var(--panel); border: 0.5px solid var(--border); border-radius: 14px; padding: 20px; }
.cc-v5-showcase-tabs { display: flex; gap: 6px; padding-bottom: 14px; border-bottom: 0.5px solid var(--border); margin-bottom: 14px; }
.cc-v5-st-tab { padding: 5px 10px; font-size: 11px; background: var(--bg); border-radius: 999px; color: var(--text-2); font-weight: 500; border: 0.5px solid var(--border); }
.cc-v5-st-tab.cc-v5-on { background: var(--deep); color: var(--bg); border-color: var(--deep); }

.cc-v5-flow { padding: 8px 0; }
.cc-v5-flow-row { display: grid; grid-template-columns: 100px 1fr 100px; padding: 10px 0; align-items: center; gap: 12px; border-top: 0.5px solid var(--border); font-size: 13px; }
.cc-v5-flow-row:first-child { border-top: none; }
.cc-v5-flow-side { text-align: center; font-size: 11px; color: var(--text-2); padding: 6px 8px; background: var(--bg); border-radius: 6px; border: 0.5px solid var(--border); font-weight: 500; }
.cc-v5-flow-arrow { text-align: center; color: var(--accent); font-size: 14px; font-weight: 500; }
.cc-v5-flow-note { text-align: center; font-size: 10px; color: var(--text-3); font-family: var(--serif); font-style: italic; }

/* PRIVACY */
.cc-v5-privacy-hero { display: grid; grid-template-columns: 1fr; gap: 32px; align-items: center; }
@media (min-width: 720px) { .cc-v5-privacy-hero { grid-template-columns: 1.2fr 1fr; gap: 48px; } }
.cc-v5-p-copy p { font-size: 17px; color: rgba(247,245,238,0.75); line-height: 1.55; }
.cc-v5-p-list-dark { background: rgba(255,255,255,0.03); border: 0.5px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 24px; font-family: var(--sans); }
.cc-v5-p-list-dark h4 { font-size: 11px; color: rgba(247,245,238,0.5); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px; font-weight: 500; }
.cc-v5-p-list-dark ul { list-style: none; padding: 0; margin-bottom: 24px; }
.cc-v5-p-list-dark ul:last-child { margin-bottom: 0; }
.cc-v5-p-list-dark li { padding: 6px 0; font-size: 15px; color: var(--bg); border-top: 0.5px solid rgba(255,255,255,0.06); }
.cc-v5-p-list-dark li:first-child { border-top: none; }
.cc-v5-p-list-dark .cc-v5-neg li { color: rgba(247,245,238,0.4); text-decoration: line-through; }

/* PRICING */
.cc-v5-price-head { text-align: center; max-width: 720px; margin: 0 auto 56px; }
.cc-v5-price-head-eyebrow { font-size: 12px; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.14em; font-weight: 600; margin-bottom: 12px; }
.cc-v5-price-head h2 { margin: 0 auto 16px; max-width: none; }
.cc-v5-price-head p { color: var(--text-2); font-size: 17px; line-height: 1.55; }
.cc-v5-price-grid { display: grid; grid-template-columns: 1fr; gap: 20px; max-width: 1120px; margin: 0 auto; }
@media (min-width: 900px) { .cc-v5-price-grid { grid-template-columns: repeat(3, 1fr); gap: 24px; align-items: stretch; } }
.cc-v5-plan-card { background: var(--panel); border: 0.5px solid var(--border-strong); border-radius: 20px; padding: 36px 32px; display: flex; flex-direction: column; position: relative; }
.cc-v5-plan-card.cc-v5-plan-featured { border: 2px solid var(--deep); }
.cc-v5-plan-badge { position: absolute; top: -14px; left: 50%; transform: translateX(-50%); background: var(--deep); color: #f7f5ee; padding: 6px 14px; border-radius: 999px; font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
.cc-v5-plan-name { font-family: var(--sans); font-size: 18px; font-weight: 600; color: var(--deep); margin-bottom: 6px; letter-spacing: -0.01em; }
.cc-v5-plan-sub { font-size: 13px; color: var(--text-3); margin-bottom: 24px; }
.cc-v5-plan-price { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; flex-wrap: wrap; }
.cc-v5-plan-was { font-family: var(--serif); color: var(--text-3); text-decoration: line-through; font-size: 22px; }
.cc-v5-plan-num { font-family: var(--serif); font-size: 60px; font-weight: 400; letter-spacing: -0.02em; line-height: 1; color: var(--deep); }
.cc-v5-plan-per { color: var(--text-2); font-size: 14px; }
.cc-v5-plan-payterm { font-size: 13px; color: var(--text-3); margin-bottom: 24px; }
.cc-v5-plan-list { list-style: none; padding: 0; margin: 0 0 28px; flex: 1; }
.cc-v5-plan-list li { padding: 6px 0; font-size: 14px; display: flex; align-items: flex-start; gap: 10px; color: var(--text-2); line-height: 1.45; }
.cc-v5-plan-list li::before { content: ''; display: inline-block; width: 5px; height: 9px; border-right: 1.5px solid var(--accent); border-bottom: 1.5px solid var(--accent); transform: rotate(45deg); margin-top: 6px; flex-shrink: 0; }
.cc-v5-plan-cta { display: block; text-align: center; padding: 13px 20px; font-size: 15px; font-weight: 500; border-radius: 999px; text-decoration: none; transition: opacity 150ms; }
.cc-v5-plan-cta:hover { opacity: 0.9; }
.cc-v5-plan-cta-appsumo { background: #ffbc00; color: #14140f !important; }
.cc-v5-plan-cta-appsumo::after { content: ' →'; }
.cc-v5-plan-cta-dark { background: var(--deep); color: #f7f5ee !important; }
.cc-v5-plan-cta-outline { background: transparent; color: var(--text) !important; border: 0.5px solid var(--border-strong); }
.cc-v5-plan-cta-outline:hover { background: var(--tint); opacity: 1; }
.cc-v5-price-foot { max-width: 720px; margin: 40px auto 0; text-align: center; padding: 20px 24px; background: var(--tint); border-radius: 12px; font-size: 14px; color: var(--text-2); }
.cc-v5-price-foot strong { color: var(--text); font-weight: 500; }

/* FAQ */
.cc-v5-qs { max-width: 720px; }
.cc-v5-q { padding: 24px 0; border-top: 0.5px solid var(--border); }
.cc-v5-q:first-child { border-top: 0.5px solid var(--border); }
.cc-v5-q:last-child { border-bottom: 0.5px solid var(--border); }
.cc-v5-q h3 { font-family: var(--serif); font-size: 22px; line-height: 1.2; letter-spacing: -0.015em; font-weight: 400; margin-bottom: 8px; }
.cc-v5-q p { color: var(--text-2); font-size: 15px; line-height: 1.6; }
.cc-v5-q a { color: var(--accent); text-decoration: underline; }

/* CLOSER */
.cc-v5-closer { padding: 96px 0; text-align: center; max-width: 640px; margin: 0 auto; }
.cc-v5-closer h2 { text-align: center; margin: 0 auto 16px; max-width: none; }
.cc-v5-closer p { color: var(--text-2); margin-bottom: 24px; font-size: 17px; }

/* FOOTER */
.cc-v5-footer { padding: 40px 0; border-top: 0.5px solid var(--border); font-size: 13px; color: var(--text-3); }
.cc-v5-foot-inner { display: flex; flex-direction: column; gap: 12px; max-width: 1320px; margin: 0 auto; padding: 0 32px; }
@media (min-width: 720px) { .cc-v5-foot-inner { flex-direction: row; justify-content: space-between; align-items: center; } }
.cc-v5-foot-links a { color: var(--text-3); margin-right: 20px; }
.cc-v5-foot-links a:hover { color: var(--text); }
`

export default async function Home() {
  const user = await getUser()
  const isSignedIn = !!user

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="cc-v5">
        <nav className="cc-v5-nav">
          <div className="cc-v5-nav-inner">
            <a href="/" className="cc-v5-brand">Cal<em>Connect</em></a>
            <div className="cc-v5-nav-menu">
              <a href="#how">How</a>
              <a href="#privacy">Privacy</a>
              <a href="#pricing">Pricing</a>
              <a href="#faq">FAQ</a>
            </div>
            {isSignedIn ? (
              <a href="/dashboard" className="cc-v5-btn cc-v5-btn-solid">Dashboard</a>
            ) : (
              <a href="/login" className="cc-v5-btn cc-v5-btn-solid">Login</a>
            )}
          </div>
        </nav>

        <div className="cc-v5-container">
          <div className="cc-v5-hero">
            <div>
              <h1>Google Calendars, <em>synchronized.</em></h1>
              <p className="cc-v5-lede">One place blocks time on the others. Real-time. Privacy-preserving. Zero manual work after 90 seconds of setup.</p>
              <div className="cc-v5-h-cta">
                <a href={isSignedIn ? '/dashboard' : '/signup'} className="cc-v5-btn cc-v5-btn-accent">{isSignedIn ? 'Go to dashboard' : 'Start 7-day free trial'}</a>
                <a href="#how" className="cc-v5-btn">See how it works</a>
              </div>
              <div className="cc-v5-h-note">$9 lifetime on AppSumo · Extra calendars $4/mo</div>
            </div>

            <div className="cc-v5-cal-stage">
              <div className="cc-v5-cal-stage-head">
                <span className="cc-v5-cal-title">Wed, Jul 22 · Your day</span>
                <span className="cc-v5-cal-live">Mirroring active</span>
              </div>
              <div className="cc-v5-cal-triple">
                <div className="cc-v5-cal-mini">
                  <div className="cc-v5-cal-mini-head"><span className="cc-v5-cal-mini-dot" style={{ background: '#1e40af' }}></span>Work</div>
                  <div className="cc-v5-row"><span className="cc-v5-rt">9a</span><span className="cc-v5-ev cc-v5-ev-w">Standup</span></div>
                  <div className="cc-v5-row"><span className="cc-v5-rt">10a</span></div>
                  <div className="cc-v5-row"><span className="cc-v5-rt">11a</span><span className="cc-v5-ev cc-v5-ev-b">Busy</span></div>
                  <div className="cc-v5-row"><span className="cc-v5-rt">12p</span></div>
                  <div className="cc-v5-row"><span className="cc-v5-rt">1p</span><span className="cc-v5-ev cc-v5-ev-w">Design</span></div>
                  <div className="cc-v5-row"><span className="cc-v5-rt">2p</span><span className="cc-v5-ev cc-v5-ev-b">Busy</span></div>
                  <div className="cc-v5-row"><span className="cc-v5-rt">3p</span></div>
                  <div className="cc-v5-row"><span className="cc-v5-rt">4p</span><span className="cc-v5-ev cc-v5-ev-b">Busy</span></div>
                </div>
                <div className="cc-v5-cal-mini">
                  <div className="cc-v5-cal-mini-head"><span className="cc-v5-cal-mini-dot" style={{ background: '#991b1b' }}></span>Personal</div>
                  <div className="cc-v5-row"><span className="cc-v5-rt">9a</span><span className="cc-v5-ev cc-v5-ev-b">Busy</span></div>
                  <div className="cc-v5-row"><span className="cc-v5-rt">10a</span></div>
                  <div className="cc-v5-row"><span className="cc-v5-rt">11a</span><span className="cc-v5-ev cc-v5-ev-p">Doctor</span></div>
                  <div className="cc-v5-row"><span className="cc-v5-rt">12p</span></div>
                  <div className="cc-v5-row"><span className="cc-v5-rt">1p</span><span className="cc-v5-ev cc-v5-ev-b">Busy</span></div>
                  <div className="cc-v5-row"><span className="cc-v5-rt">2p</span><span className="cc-v5-ev cc-v5-ev-p">Pickup</span></div>
                  <div className="cc-v5-row"><span className="cc-v5-rt">3p</span></div>
                  <div className="cc-v5-row"><span className="cc-v5-rt">4p</span><span className="cc-v5-ev cc-v5-ev-b">Busy</span></div>
                </div>
                <div className="cc-v5-cal-mini">
                  <div className="cc-v5-cal-mini-head"><span className="cc-v5-cal-mini-dot" style={{ background: '#78350f' }}></span>Agency</div>
                  <div className="cc-v5-row"><span className="cc-v5-rt">9a</span><span className="cc-v5-ev cc-v5-ev-b">Busy</span></div>
                  <div className="cc-v5-row"><span className="cc-v5-rt">10a</span></div>
                  <div className="cc-v5-row"><span className="cc-v5-rt">11a</span><span className="cc-v5-ev cc-v5-ev-b">Busy</span></div>
                  <div className="cc-v5-row"><span className="cc-v5-rt">12p</span></div>
                  <div className="cc-v5-row"><span className="cc-v5-rt">1p</span><span className="cc-v5-ev cc-v5-ev-b">Busy</span></div>
                  <div className="cc-v5-row"><span className="cc-v5-rt">2p</span><span className="cc-v5-ev cc-v5-ev-b">Busy</span></div>
                  <div className="cc-v5-row"><span className="cc-v5-rt">3p</span></div>
                  <div className="cc-v5-row"><span className="cc-v5-rt">4p</span><span className="cc-v5-ev cc-v5-ev-a">Client call</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <section className="cc-v5-section">
          <div className="cc-v5-container">
            <h2>Built for people running <em>more than one life.</em></h2>
            <p className="cc-v5-sec-lede">If you have a day job and a side hustle, or a career and a family, or an agency and a solo practice, you already know the pain. Here&apos;s what CalConnect handles.</p>
            <div className="cc-v5-grid-3">
              <div className="cc-v5-f-card">
                <div className="cc-v5-f-glyph">R</div>
                <h3>Recurring events</h3>
                <p>Weekly standups, monthly reviews, every-other-Friday therapy. CalConnect expands each recurring rule and mirrors every instance. Deleting one instance only removes that mirror.</p>
              </div>
              <div className="cc-v5-f-card">
                <div className="cc-v5-f-glyph">⌁</div>
                <h3>Real-time sync</h3>
                <p>Google pushes calendar changes to CalConnect the moment they happen. No polling. Move a meeting from 2pm to 3pm and the mirror follows within seconds.</p>
              </div>
              <div className="cc-v5-f-card">
                <div className="cc-v5-f-glyph">◍</div>
                <h3>Bidirectional</h3>
                <p>Mark multiple calendars as sources and events flow both ways. Work meetings block personal time. Doctor appointments block work slots. Everyone&apos;s happy.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="how" className="cc-v5-section cc-v5-tint">
          <div className="cc-v5-container">
            <h2>The whole thing runs in <em>ninety seconds.</em></h2>
            <div className="cc-v5-showcase">
              <div className="cc-v5-sc-copy">
                <h3><em>1.</em> Connect your Google Calendars.</h3>
                <p>Sign in once with Google. Then connect each account you want in the sync loop, up to five. Every connection uses Google&apos;s own OAuth consent screen, so credentials never touch our servers.</p>
                <p style={{ color: 'var(--text-3)', fontSize: 14 }}>Scopes requested: calendar.readonly, calendar.events, email, profile.</p>
              </div>
              <div className="cc-v5-sc-visual">
                <div className="cc-v5-showcase-tabs">
                  <span className="cc-v5-st-tab cc-v5-on">Connected · 3</span>
                  <span className="cc-v5-st-tab">Available slots · 2</span>
                </div>
                <div className="cc-v5-flow">
                  <div className="cc-v5-flow-row">
                    <span className="cc-v5-flow-side">nick@work</span>
                    <span className="cc-v5-flow-note">connected</span>
                    <span className="cc-v5-flow-side">Source</span>
                  </div>
                  <div className="cc-v5-flow-row">
                    <span className="cc-v5-flow-side">nick@personal</span>
                    <span className="cc-v5-flow-note">connected</span>
                    <span className="cc-v5-flow-side">Source</span>
                  </div>
                  <div className="cc-v5-flow-row">
                    <span className="cc-v5-flow-side">nick@agency</span>
                    <span className="cc-v5-flow-note">connected</span>
                    <span className="cc-v5-flow-side">Destination</span>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ height: 40 }}></div>
            <div className="cc-v5-showcase">
              <div className="cc-v5-sc-copy">
                <h3><em>2.</em> Pick which calendars hold real events.</h3>
                <p>Check the &quot;Source&quot; box on any calendar that has your actual meetings on it. Everything else becomes a destination for privacy-preserving &quot;Busy&quot; blocks. Set multiple sources for two-way mirroring.</p>
              </div>
              <div className="cc-v5-sc-visual">
                <div className="cc-v5-flow">
                  <div className="cc-v5-flow-row">
                    <span className="cc-v5-flow-side">Work event</span>
                    <span className="cc-v5-flow-arrow">→</span>
                    <span className="cc-v5-flow-side">Busy on 2</span>
                  </div>
                  <div className="cc-v5-flow-row">
                    <span className="cc-v5-flow-side">Personal event</span>
                    <span className="cc-v5-flow-arrow">→</span>
                    <span className="cc-v5-flow-side">Busy on 2</span>
                  </div>
                  <div className="cc-v5-flow-row">
                    <span className="cc-v5-flow-side">Agency event</span>
                    <span className="cc-v5-flow-arrow">→</span>
                    <span className="cc-v5-flow-side">Busy on 2</span>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ height: 40 }}></div>
            <div className="cc-v5-showcase">
              <div className="cc-v5-sc-copy">
                <h3><em>3.</em> Turn it on. Forget it exists.</h3>
                <p>CalConnect registers push notification watch channels with Google. From here it runs on its own. New events mirror in real time. Deletes and updates cascade automatically. Recurring events expand cleanly.</p>
              </div>
              <div className="cc-v5-sc-visual" style={{ padding: 32, textAlign: 'center', background: 'var(--deep)' }}>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>System status</div>
                <div style={{ color: 'white', fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 28, marginBottom: 8 }}>Mirroring.</div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>3 calendars · last event: 4 seconds ago</div>
              </div>
            </div>
          </div>
        </section>

        <section id="privacy" className="cc-v5-section cc-v5-dark">
          <div className="cc-v5-container">
            <div className="cc-v5-privacy-hero">
              <div className="cc-v5-p-copy">
                <h2 style={{ color: 'white' }}>Your <em>label.</em> Your <em>color.</em> Still 100% private.</h2>
                <p>Pick a custom label for each source calendar (&quot;Busy&quot; is just the default, call them &quot;Personal,&quot; &quot;Focus,&quot; &quot;Kids,&quot; whatever fits) and a color so you know at a glance which calendar a block came from. Event details never leave the source calendar.</p>
                <p style={{ marginTop: 16 }} className="cc-v5-text-mute">Your work never sees the therapy. Your clients never see the school pickup. Your agency never sees the board meeting.</p>
              </div>
              <div className="cc-v5-p-list-dark">
                <h4>Mirrored across calendars</h4>
                <ul>
                  <li>Your custom label</li>
                  <li>Your chosen color</li>
                  <li>Start time</li>
                  <li>End time</li>
                </ul>
                <h4>Never mirrored</h4>
                <ul className="cc-v5-neg">
                  <li>Real event title</li>
                  <li>Attendees</li>
                  <li>Description</li>
                  <li>Meeting links</li>
                  <li>Location</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className="cc-v5-section">
          <div className="cc-v5-container">
            <div className="cc-v5-price-head">
              <div className="cc-v5-price-head-eyebrow">Simple pricing</div>
              <h2>Connect <em>every</em> calendar you own.</h2>
              <p>Two, ten, or every one you own. Add calendars any time for $4/month.</p>
            </div>

            <div className="cc-v5-price-grid">
              {/* Card 1 — LTD via AppSumo */}
              <div className="cc-v5-plan-card">
                <div className="cc-v5-plan-name">Lifetime</div>
                <div className="cc-v5-plan-sub">One-time · 2 calendars</div>
                <div className="cc-v5-plan-price">
                  <span className="cc-v5-plan-num">$9</span>
                  <span className="cc-v5-plan-per">one-time</span>
                </div>
                <div className="cc-v5-plan-payterm">AppSumo launch offer</div>
                <ul className="cc-v5-plan-list">
                  <li>2 connected Google Calendars</li>
                  <li>Real-time push notification sync</li>
                  <li>Recurring &amp; bidirectional mirroring</li>
                  <li>Privacy-preserving &quot;Busy&quot; blocks</li>
                  <li>Custom color and label per source calendar</li>
                  <li>All future updates included</li>
                  <li>Add calendars any time · $4/mo each</li>
                </ul>
                <a href="https://appsumo.com/products/calconnect" target="_blank" rel="noopener noreferrer" className="cc-v5-plan-cta cc-v5-plan-cta-appsumo">Buy on AppSumo</a>
              </div>

              {/* Card 2 — Basic monthly (featured) */}
              <div className="cc-v5-plan-card cc-v5-plan-featured">
                <div className="cc-v5-plan-badge">Most popular</div>
                <div className="cc-v5-plan-name">Basic</div>
                <div className="cc-v5-plan-sub">Monthly · 3 calendars</div>
                <div className="cc-v5-plan-price">
                  <span className="cc-v5-plan-num">$4</span>
                  <span className="cc-v5-plan-per">/ month</span>
                </div>
                <div className="cc-v5-plan-payterm">Or $40/year — save 17%</div>
                <ul className="cc-v5-plan-list">
                  <li>3 connected Google Calendars</li>
                  <li>Real-time push notification sync</li>
                  <li>Recurring &amp; bidirectional mirroring</li>
                  <li>Privacy-preserving &quot;Busy&quot; blocks</li>
                  <li>Custom color and label per source calendar</li>
                  <li>Cancel any time</li>
                  <li>Add calendars any time · $4/mo each</li>
                </ul>
                <a href={isSignedIn ? '/dashboard' : '/signup'} className="cc-v5-plan-cta cc-v5-plan-cta-dark">Start 7-day free trial</a>
              </div>

              {/* Card 3 — Pro monthly */}
              <div className="cc-v5-plan-card">
                <div className="cc-v5-plan-name">Pro</div>
                <div className="cc-v5-plan-sub">Monthly · 10 calendars</div>
                <div className="cc-v5-plan-price">
                  <span className="cc-v5-plan-num">$10</span>
                  <span className="cc-v5-plan-per">/ month</span>
                </div>
                <div className="cc-v5-plan-payterm">Or $100/year — save 17%</div>
                <ul className="cc-v5-plan-list">
                  <li>10 connected Google Calendars</li>
                  <li>Real-time push notification sync</li>
                  <li>Recurring &amp; bidirectional mirroring</li>
                  <li>Privacy-preserving &quot;Busy&quot; blocks</li>
                  <li>Custom color and label per source calendar</li>
                  <li><strong>Mirror only certain days/times</strong> (Pro exclusive)</li>
                  <li><strong>Backfill existing events</strong> (Pro exclusive)</li>
                  <li>Priority email support</li>
                  <li>Add calendars any time · $4/mo each</li>
                </ul>
                <a href={isSignedIn ? '/dashboard' : '/signup'} className="cc-v5-plan-cta cc-v5-plan-cta-outline">Start 7-day free trial</a>
              </div>
            </div>

            <div className="cc-v5-price-foot">
              <strong>All plans include the same core product.</strong> Higher tiers just include more calendars up front. Need more than your plan? <strong>Add any calendar for $4/month, cancel per-calendar any time.</strong>
            </div>
          </div>
        </section>

        <section id="faq" className="cc-v5-section cc-v5-tint">
          <div className="cc-v5-container">
            <h2>Questions worth <em>asking.</em></h2>
            <div className="cc-v5-qs">
              <div className="cc-v5-q">
                <h3>Do you read my calendar events?</h3>
                <p>Only start time, end time, and recurrence rule of events on source calendars. Titles, attendees, notes, and links stay on Google&apos;s servers.</p>
              </div>
              <div className="cc-v5-q">
                <h3>Why not just share my calendar with my other account?</h3>
                <p>Sharing reveals details unless every calendar is &quot;free/busy only&quot; (and you never forget). Shared calendars also don&apos;t block time in Calendly, Cal.com, or Google&apos;s &quot;find a time.&quot; A real event on your primary calendar does.</p>
              </div>
              <div className="cc-v5-q">
                <h3>What if I turn it off?</h3>
                <p>Watch channels close. No new mirrors are created. Existing mirrors stay in case you want them. Bulk-delete in Google Calendar takes a few clicks.</p>
              </div>
              <div className="cc-v5-q">
                <h3>Is CalConnect Google verified?</h3>
                <p>Yes. CalConnect passed Google&apos;s OAuth verification review, which means Google audited our privacy policy, data handling, and scope usage. When you sign in, Google shows CalConnect cleanly with no &quot;unverified app&quot; warning. Same trust bar as apps from established SaaS companies.</p>
              </div>
              <div className="cc-v5-q">
                <h3>Who built this?</h3>
                <p>Nick Christensen. Ran into the three-calendar problem myself and got tired of the workarounds. RAX Digital LLC. Reach me at <a href="mailto:n.christensen4@gmail.com">n.christensen4@gmail.com</a>.</p>
              </div>
            </div>
          </div>
        </section>

        <div className="cc-v5-container">
          <div className="cc-v5-closer">
            <h2>Stop double-booking <em>yourself.</em></h2>
            <p>Two calendars synchronized forever, for $9. Available now on AppSumo.</p>
            <a href="https://appsumo.com/products/calconnect" target="_blank" rel="noopener noreferrer" className="cc-v5-btn cc-v5-btn-accent" style={{ padding: '12px 24px', fontSize: 15 }}>Get it on AppSumo →</a>
          </div>
        </div>

        <footer className="cc-v5-footer">
          <div className="cc-v5-foot-inner">
            <div>© 2026 RAX Digital LLC · CalConnect</div>
            <div className="cc-v5-foot-links">
              <a href="/changelog">Changelog</a>
              <a href="/privacy">Privacy</a>
              <a href="/terms">Terms</a>
              <a href="mailto:n.christensen4@gmail.com">Contact</a>
            </div>
          </div>
        </footer>
      </div>
    </>
  )
}
