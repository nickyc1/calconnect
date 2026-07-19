import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase-server'

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600&display=swap');

.landing {
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
  --serif: 'Instrument Serif', 'Iowan Old Style', Georgia, serif;
  --sans: 'Inter', system-ui, sans-serif;

  background: var(--bg);
  color: var(--text);
  font-family: var(--sans);
  font-size: 15px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}

.landing *, .landing *::before, .landing *::after { box-sizing: border-box; margin: 0; padding: 0; }
.landing a { color: inherit; text-decoration: none; }

.landing .container { max-width: 1200px; margin: 0 auto; padding: 0 24px; }

.landing nav { padding: 20px 0; background: var(--bg); }
.landing .nav-inner { display: flex; justify-content: space-between; align-items: center; max-width: 1200px; margin: 0 auto; padding: 0 24px; }
.landing .brand { font-family: var(--serif); font-size: 22px; font-weight: 400; letter-spacing: -0.005em; color: var(--text); }
.landing .brand em { font-style: italic; color: var(--accent); }
.landing .nav-menu { display: none; gap: 32px; font-size: 14px; color: var(--text-2); font-weight: 500; }
@media (min-width: 800px) { .landing .nav-menu { display: flex; } }
.landing .btn { font-family: var(--sans); font-size: 14px; font-weight: 500; padding: 8px 16px; background: transparent; color: var(--text); border: 0.5px solid var(--border-strong); border-radius: 999px; cursor: pointer; transition: background 150ms; display: inline-block; }
.landing .btn:hover { background: var(--tint); }
.landing .btn-solid { background: var(--deep); color: var(--bg); border-color: var(--deep); padding: 10px 20px; }
.landing .btn-solid:hover { background: #2a2a20; color: var(--bg); }
.landing .btn-accent { background: var(--accent); color: white; border-color: var(--accent); }
.landing .btn-accent:hover { background: #c14b1e; color: white; }

.landing .hero { padding: 40px 0 32px; display: grid; grid-template-columns: 1fr; gap: 40px; align-items: center; }
@media (min-width: 900px) { .landing .hero { grid-template-columns: minmax(0, 340px) 1fr; gap: 56px; padding: 72px 0 56px; } }

.landing .h-status { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-2); margin-bottom: 24px; font-weight: 500; }
.landing .h-status::before { content: ''; width: 7px; height: 7px; background: #10b981; border-radius: 50%; box-shadow: 0 0 0 3px rgba(16,185,129,0.15); }

.landing h1 { font-family: var(--serif); font-size: clamp(44px, 6vw, 76px); line-height: 1.02; letter-spacing: -0.02em; font-weight: 400; margin-bottom: 20px; color: var(--deep); }
.landing h1 em { font-style: italic; color: var(--accent); }

.landing .lede { font-size: 18px; color: var(--text-2); line-height: 1.55; margin-bottom: 32px; max-width: 460px; }
.landing .h-cta { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 20px; }
.landing .h-note { font-size: 13px; color: var(--text-3); }

.landing .cal-stage { position: relative; padding: 20px; background: var(--panel); border: 0.5px solid var(--border); border-radius: 16px; box-shadow: 0 1px 0 rgba(0,0,0,0.02), 0 40px 60px -20px rgba(0,0,0,0.06); }
.landing .cal-stage-head { display: flex; justify-content: space-between; align-items: center; padding: 0 4px 12px; border-bottom: 0.5px solid var(--border); margin-bottom: 12px; }
.landing .cal-title { font-size: 12px; font-weight: 500; color: var(--text-2); letter-spacing: 0.03em; text-transform: uppercase; }
.landing .cal-live { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text-3); }
.landing .cal-live::before { content: ''; width: 5px; height: 5px; background: #10b981; border-radius: 50%; }
.landing .cal-triple { display: grid; grid-template-columns: 1fr; gap: 10px; }
@media (min-width: 640px) { .landing .cal-triple { grid-template-columns: repeat(3, 1fr); } }
.landing .cal-mini { background: var(--bg); border: 0.5px solid var(--border); border-radius: 10px; padding: 10px 12px; font-size: 12px; }
.landing .cal-mini-head { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 500; color: var(--text); padding-bottom: 8px; border-bottom: 0.5px solid var(--border); margin-bottom: 8px; }
.landing .cal-mini-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.landing .cal-mini .row { display: grid; grid-template-columns: 26px 1fr; padding: 3px 0; align-items: center; min-height: 22px; }
.landing .rt { font-size: 9px; color: var(--text-3); font-variant-numeric: tabular-nums; }
.landing .ev { padding: 2px 6px; font-size: 10px; font-weight: 500; border-radius: 3px; display: inline-block; }
.landing .ev.w { background: #dbeafe; color: #1e40af; }
.landing .ev.p { background: #fee2e2; color: #991b1b; }
.landing .ev.a { background: #fef3c7; color: #78350f; }
.landing .ev.b { background: repeating-linear-gradient(-45deg, transparent, transparent 2px, rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 3px); color: var(--text-2); border: 0.5px dashed var(--border-strong); }

.landing section { padding: 72px 0; }
@media (min-width: 720px) { .landing section { padding: 96px 0; } }
.landing section.dark { background: var(--deep); color: var(--bg); }
.landing section.dark .lede, .landing section.dark h2, .landing section.dark p { color: var(--bg); }
.landing section.dark .text-mute { color: rgba(247,245,238,0.6); }

.landing h2 { font-family: var(--serif); font-size: clamp(34px, 5vw, 54px); line-height: 1.05; letter-spacing: -0.02em; font-weight: 400; margin-bottom: 20px; max-width: 720px; color: var(--deep); }
.landing h2 em { font-style: italic; color: var(--accent); }
.landing h2 .m { color: var(--text-3); }

.landing .sec-lede { font-size: 18px; line-height: 1.55; color: var(--text-2); max-width: 560px; margin-bottom: 56px; }

.landing .grid-3 { display: grid; grid-template-columns: 1fr; gap: 12px; }
@media (min-width: 720px) { .landing .grid-3 { grid-template-columns: repeat(3, 1fr); gap: 20px; } }
.landing .f-card { background: var(--panel); border: 0.5px solid var(--border); border-radius: 14px; padding: 28px; }
.landing .f-glyph { font-family: var(--serif); font-size: 40px; font-style: italic; color: var(--accent); line-height: 1; margin-bottom: 20px; font-weight: 400; }
.landing .f-card h3 { font-family: var(--sans); font-size: 17px; font-weight: 600; letter-spacing: -0.01em; margin-bottom: 8px; }
.landing .f-card p { font-size: 14px; color: var(--text-2); line-height: 1.55; }

.landing .showcase { display: grid; grid-template-columns: 1fr; gap: 40px; }
@media (min-width: 720px) { .landing .showcase { grid-template-columns: 340px 1fr; gap: 56px; align-items: start; } }
.landing .sc-copy h3 { font-family: var(--serif); font-size: 28px; line-height: 1.15; letter-spacing: -0.015em; font-weight: 400; margin-bottom: 12px; }
.landing .sc-copy h3 em { font-style: italic; }
.landing .sc-copy p { color: var(--text-2); font-size: 15px; line-height: 1.6; margin-bottom: 16px; }
.landing .sc-visual { background: var(--panel); border: 0.5px solid var(--border); border-radius: 14px; padding: 20px; }
.landing .showcase-tabs { display: flex; gap: 6px; padding-bottom: 14px; border-bottom: 0.5px solid var(--border); margin-bottom: 14px; }
.landing .st-tab { padding: 5px 10px; font-size: 11px; background: var(--bg); border-radius: 999px; color: var(--text-2); font-weight: 500; border: 0.5px solid var(--border); }
.landing .st-tab.on { background: var(--deep); color: var(--bg); border-color: var(--deep); }

.landing .flow { padding: 8px 0; }
.landing .flow-row { display: grid; grid-template-columns: 100px 1fr 100px; padding: 10px 0; align-items: center; gap: 12px; border-top: 0.5px solid var(--border); font-size: 13px; }
.landing .flow-row:first-child { border-top: none; }
.landing .flow-side { text-align: center; font-size: 11px; color: var(--text-2); padding: 6px 8px; background: var(--bg); border-radius: 6px; border: 0.5px solid var(--border); font-weight: 500; }
.landing .flow-arrow { text-align: center; color: var(--accent); font-size: 14px; font-weight: 500; }
.landing .flow-note { text-align: center; font-size: 10px; color: var(--text-3); font-family: var(--serif); font-style: italic; }

.landing .privacy-hero { display: grid; grid-template-columns: 1fr; gap: 32px; align-items: center; }
@media (min-width: 720px) { .landing .privacy-hero { grid-template-columns: 1.2fr 1fr; gap: 48px; } }
.landing .p-copy p { font-size: 17px; color: rgba(247,245,238,0.75); line-height: 1.55; }
.landing .p-list-dark { background: rgba(255,255,255,0.03); border: 0.5px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 24px; font-family: var(--sans); }
.landing .p-list-dark h4 { font-size: 11px; color: rgba(247,245,238,0.5); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px; font-weight: 500; }
.landing .p-list-dark ul { list-style: none; padding: 0; margin-bottom: 24px; }
.landing .p-list-dark ul:last-child { margin-bottom: 0; }
.landing .p-list-dark li { padding: 6px 0; font-size: 15px; color: var(--bg); border-top: 0.5px solid rgba(255,255,255,0.06); }
.landing .p-list-dark li:first-child { border-top: none; }
.landing .p-list-dark .neg li { color: rgba(247,245,238,0.4); text-decoration: line-through; }

.landing .price-wrap { display: grid; grid-template-columns: 1fr; gap: 40px; align-items: center; }
@media (min-width: 720px) { .landing .price-wrap { grid-template-columns: 1fr 1fr; gap: 56px; } }
.landing .price-copy h2 { margin-bottom: 16px; }
.landing .price-copy p { color: var(--text-2); font-size: 17px; line-height: 1.55; margin-bottom: 12px; }
.landing .plan-card { background: var(--panel); border: 1px solid var(--deep); border-radius: 16px; padding: 32px; }
.landing .plan-eyebrow { font-size: 12px; color: var(--text-2); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 16px; font-weight: 500; }
.landing .plan-price { display: flex; align-items: baseline; gap: 10px; margin-bottom: 6px; }
.landing .plan-was { font-family: var(--serif); color: var(--text-3); text-decoration: line-through; font-size: 24px; }
.landing .plan-num { font-family: var(--serif); font-size: 60px; font-weight: 400; letter-spacing: -0.02em; line-height: 1; }
.landing .plan-per { color: var(--text-2); font-size: 15px; }
.landing .plan-note { font-size: 14px; color: var(--text-2); margin-bottom: 20px; }
.landing .plan-list { list-style: none; padding: 0; margin-bottom: 24px; }
.landing .plan-list li { padding: 6px 0; font-size: 14px; display: flex; align-items: center; gap: 8px; }
.landing .plan-list li::before { content: ''; display: inline-block; width: 5px; height: 9px; border-right: 1.5px solid var(--accent); border-bottom: 1.5px solid var(--accent); transform: rotate(45deg); margin-top: -3px; }

.landing .qs { max-width: 720px; }
.landing .q { padding: 24px 0; border-top: 0.5px solid var(--border); }
.landing .q:first-child { border-top: 0.5px solid var(--border); }
.landing .q:last-child { border-bottom: 0.5px solid var(--border); }
.landing .q h3 { font-family: var(--serif); font-size: 22px; line-height: 1.2; letter-spacing: -0.015em; font-weight: 400; margin-bottom: 8px; }
.landing .q p { color: var(--text-2); font-size: 15px; line-height: 1.6; }
.landing .q a { color: var(--accent); text-decoration: underline; }

.landing .closer { padding: 96px 0; text-align: center; max-width: 640px; margin: 0 auto; }
.landing .closer h2 { text-align: center; margin: 0 auto 16px; max-width: none; }
.landing .closer p { color: var(--text-2); margin-bottom: 24px; font-size: 17px; }

.landing footer { padding: 40px 0; border-top: 0.5px solid var(--border); font-size: 13px; color: var(--text-3); }
.landing .foot-inner { display: flex; flex-direction: column; gap: 12px; max-width: 1200px; margin: 0 auto; padding: 0 24px; }
@media (min-width: 720px) { .landing .foot-inner { flex-direction: row; justify-content: space-between; align-items: center; } }
.landing .foot-links a { color: var(--text-3); margin-right: 20px; }
.landing .foot-links a:hover { color: var(--text); }
`

export default async function Home() {
  const user = await getUser()
  if (user) redirect('/dashboard')

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <div className="landing">
        <nav>
          <div className="nav-inner">
            <div className="brand">Cal<em>Connect</em></div>
            <div className="nav-menu">
              <a href="#how">How</a>
              <a href="#privacy">Privacy</a>
              <a href="#pricing">Pricing</a>
              <a href="#faq">FAQ</a>
            </div>
            <a href="/login"><button className="btn btn-solid">Sign in</button></a>
          </div>
        </nav>

        <div className="container">
          <div className="hero">
            <div>
              <div className="h-status">Live. Public beta.</div>
              <h1>Google Calendars, <em>synchronized.</em></h1>
              <p className="lede">One place blocks time on the others. Real-time. Privacy-preserving. Zero manual work after 90 seconds of setup.</p>
              <div className="h-cta">
                <a href="/login"><button className="btn btn-accent">Sign in with Google</button></a>
                <a href="#how"><button className="btn">See how it works</button></a>
              </div>
              <div className="h-note">Free during beta · Grandfathered rate at launch</div>
            </div>

            <div className="cal-stage">
              <div className="cal-stage-head">
                <span className="cal-title">Wed, Jul 22 · Your day</span>
                <span className="cal-live">Mirroring active</span>
              </div>
              <div className="cal-triple">
                <div className="cal-mini">
                  <div className="cal-mini-head"><span className="cal-mini-dot" style={{ background: '#1e40af' }}></span>Work</div>
                  <div className="row"><span className="rt">9a</span><span className="ev w">Standup</span></div>
                  <div className="row"><span className="rt">10a</span></div>
                  <div className="row"><span className="rt">11a</span><span className="ev b">Busy</span></div>
                  <div className="row"><span className="rt">12p</span></div>
                  <div className="row"><span className="rt">1p</span><span className="ev w">Design</span></div>
                  <div className="row"><span className="rt">2p</span><span className="ev b">Busy</span></div>
                  <div className="row"><span className="rt">3p</span></div>
                  <div className="row"><span className="rt">4p</span><span className="ev b">Busy</span></div>
                </div>
                <div className="cal-mini">
                  <div className="cal-mini-head"><span className="cal-mini-dot" style={{ background: '#991b1b' }}></span>Personal</div>
                  <div className="row"><span className="rt">9a</span><span className="ev b">Busy</span></div>
                  <div className="row"><span className="rt">10a</span></div>
                  <div className="row"><span className="rt">11a</span><span className="ev p">Doctor</span></div>
                  <div className="row"><span className="rt">12p</span></div>
                  <div className="row"><span className="rt">1p</span><span className="ev b">Busy</span></div>
                  <div className="row"><span className="rt">2p</span><span className="ev p">Pickup</span></div>
                  <div className="row"><span className="rt">3p</span></div>
                  <div className="row"><span className="rt">4p</span><span className="ev b">Busy</span></div>
                </div>
                <div className="cal-mini">
                  <div className="cal-mini-head"><span className="cal-mini-dot" style={{ background: '#78350f' }}></span>Agency</div>
                  <div className="row"><span className="rt">9a</span><span className="ev b">Busy</span></div>
                  <div className="row"><span className="rt">10a</span></div>
                  <div className="row"><span className="rt">11a</span><span className="ev b">Busy</span></div>
                  <div className="row"><span className="rt">12p</span></div>
                  <div className="row"><span className="rt">1p</span><span className="ev b">Busy</span></div>
                  <div className="row"><span className="rt">2p</span><span className="ev b">Busy</span></div>
                  <div className="row"><span className="rt">3p</span></div>
                  <div className="row"><span className="rt">4p</span><span className="ev a">Client call</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <section>
          <div className="container">
            <h2>Built for people running <em>more than one life.</em></h2>
            <p className="sec-lede">If you have a day job and a side hustle, or a career and a family, or an agency and a solo practice, you already know the pain. Here&apos;s what CalConnect handles.</p>

            <div className="grid-3">
              <div className="f-card">
                <div className="f-glyph">R</div>
                <h3>Recurring events</h3>
                <p>Weekly standups, monthly reviews, every-other-Friday therapy. CalConnect expands each recurring rule and mirrors every instance. Deleting one instance only removes that mirror.</p>
              </div>
              <div className="f-card">
                <div className="f-glyph">⌁</div>
                <h3>Real-time sync</h3>
                <p>Google pushes calendar changes to CalConnect the moment they happen. No polling. Move a meeting from 2pm to 3pm and the mirror follows within seconds.</p>
              </div>
              <div className="f-card">
                <div className="f-glyph">◍</div>
                <h3>Bidirectional</h3>
                <p>Mark multiple calendars as sources and events flow both ways. Work meetings block personal time. Doctor appointments block work slots. Everyone&apos;s happy.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="how" style={{ background: 'var(--tint)' }}>
          <div className="container">
            <h2>The whole thing runs in <em>ninety seconds.</em></h2>

            <div className="showcase">
              <div className="sc-copy">
                <h3><em>1.</em> Connect your Google Calendars.</h3>
                <p>Sign in once with Google. Then connect each account you want in the sync loop, up to five. Every connection uses Google&apos;s own OAuth consent screen, so credentials never touch our servers.</p>
                <p style={{ color: 'var(--text-3)', fontSize: 14 }}>Scopes requested: calendar.readonly, calendar.events, email, profile.</p>
              </div>
              <div className="sc-visual">
                <div className="showcase-tabs">
                  <span className="st-tab on">Connected · 3</span>
                  <span className="st-tab">Available slots · 2</span>
                </div>
                <div className="flow">
                  <div className="flow-row">
                    <span className="flow-side">nick@work</span>
                    <span className="flow-note">connected</span>
                    <span className="flow-side">Source</span>
                  </div>
                  <div className="flow-row">
                    <span className="flow-side">nick@personal</span>
                    <span className="flow-note">connected</span>
                    <span className="flow-side">Source</span>
                  </div>
                  <div className="flow-row">
                    <span className="flow-side">nick@agency</span>
                    <span className="flow-note">connected</span>
                    <span className="flow-side">Destination</span>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ height: 40 }}></div>

            <div className="showcase">
              <div className="sc-copy">
                <h3><em>2.</em> Pick which calendars hold real events.</h3>
                <p>Check the &quot;Source&quot; box on any calendar that has your actual meetings on it. Everything else becomes a destination for privacy-preserving &quot;Busy&quot; blocks. Set multiple sources for two-way mirroring.</p>
              </div>
              <div className="sc-visual">
                <div className="flow">
                  <div className="flow-row">
                    <span className="flow-side">Work event</span>
                    <span className="flow-arrow">→</span>
                    <span className="flow-side">Busy on 2</span>
                  </div>
                  <div className="flow-row">
                    <span className="flow-side">Personal event</span>
                    <span className="flow-arrow">→</span>
                    <span className="flow-side">Busy on 2</span>
                  </div>
                  <div className="flow-row">
                    <span className="flow-side">Agency event</span>
                    <span className="flow-arrow">→</span>
                    <span className="flow-side">Busy on 2</span>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ height: 40 }}></div>

            <div className="showcase">
              <div className="sc-copy">
                <h3><em>3.</em> Turn it on. Forget it exists.</h3>
                <p>CalConnect registers push notification watch channels with Google. From here it runs on its own. New events mirror in real time. Deletes and updates cascade automatically. Recurring events expand cleanly.</p>
              </div>
              <div className="sc-visual" style={{ padding: 32, textAlign: 'center', background: 'var(--deep)' }}>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>System status</div>
                <div style={{ color: 'white', fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 28, marginBottom: 8 }}>Mirroring.</div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>3 calendars · last event: 4 seconds ago</div>
              </div>
            </div>
          </div>
        </section>

        <section id="privacy" className="dark">
          <div className="container">
            <div className="privacy-hero">
              <div className="p-copy">
                <h2 style={{ color: 'white' }}>The mirror only says <em>&quot;Busy.&quot;</em></h2>
                <p>Nothing else from your source events ever touches your other calendars. No titles. No attendees. No links. No context. Just an opaque time block your scheduling tool can see.</p>
                <p style={{ marginTop: 16 }} className="text-mute">Your work never sees the therapy. Your clients never see the school pickup. Your agency never sees the board meeting.</p>
              </div>

              <div className="p-list-dark">
                <h4>Mirrored across calendars</h4>
                <ul>
                  <li>Word &quot;Busy&quot;</li>
                  <li>Start time</li>
                  <li>End time</li>
                </ul>
                <h4>Never mirrored</h4>
                <ul className="neg">
                  <li>Event title</li>
                  <li>Attendees</li>
                  <li>Description</li>
                  <li>Meeting links</li>
                  <li>Location</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section id="pricing">
          <div className="container">
            <div className="price-wrap">
              <div className="price-copy">
                <h2>Free while we&apos;re in <em>beta.</em></h2>
                <p>Sign up now, keep your rate when we launch. No credit card during beta.</p>
                <p>When v1 ships (after Google finishes OAuth verification), the plan becomes $6/mo for individuals. Beta users get grandfathered to that rate forever.</p>
              </div>

              <div className="plan-card">
                <div className="plan-eyebrow">Individual · Beta pricing</div>
                <div className="plan-price">
                  <span className="plan-was">$8</span>
                  <span className="plan-num">$0</span>
                  <span className="plan-per">/mo</span>
                </div>
                <p className="plan-note">Full product, no ads, no upsells. Cancel anytime once billing begins.</p>
                <ul className="plan-list">
                  <li>Up to 5 connected Google Calendars</li>
                  <li>Real-time push notification sync</li>
                  <li>Recurring event support</li>
                  <li>Bidirectional mirroring</li>
                  <li>Privacy-preserving &quot;Busy&quot; blocks</li>
                </ul>
                <a href="/login" style={{ display: 'block' }}><button className="btn btn-accent" style={{ width: '100%', padding: '12px 20px', fontSize: 15 }}>Start free</button></a>
              </div>
            </div>
          </div>
        </section>

        <section id="faq" style={{ background: 'var(--tint)' }}>
          <div className="container">
            <h2>Questions worth <em>asking.</em></h2>

            <div className="qs">
              <div className="q">
                <h3>Do you read my calendar events?</h3>
                <p>Only start time, end time, and recurrence rule of events on source calendars. Titles, attendees, notes, and links stay on Google&apos;s servers.</p>
              </div>
              <div className="q">
                <h3>Why not just share my calendar with my other account?</h3>
                <p>Sharing reveals details unless every calendar is &quot;free/busy only&quot; (and you never forget). Shared calendars also don&apos;t block time in Calendly, Cal.com, or Google&apos;s &quot;find a time.&quot; A real event on your primary calendar does.</p>
              </div>
              <div className="q">
                <h3>What if I turn it off?</h3>
                <p>Watch channels close. No new mirrors are created. Existing mirrors stay in case you want them. Bulk-delete in Google Calendar takes a few clicks.</p>
              </div>
              <div className="q">
                <h3>Is CalConnect Google verified?</h3>
                <p>Not yet. The app runs in Google&apos;s testing mode with a 100-user cap. Sign up in that window and we&apos;ll add you as a test user manually. Verification typically takes four to six weeks.</p>
              </div>
              <div className="q">
                <h3>Who built this?</h3>
                <p>Nick Christensen. Ran into the three-calendar problem myself and got tired of the workarounds. RAX Digital LLC. Reach me at <a href="mailto:nick@raxdigital.com">nick@raxdigital.com</a>.</p>
              </div>
            </div>
          </div>
        </section>

        <div className="container">
          <div className="closer">
            <h2>Stop double-booking <em>yourself.</em></h2>
            <p>Ninety seconds to connect. Free during beta.</p>
            <a href="/login"><button className="btn btn-accent" style={{ padding: '12px 24px', fontSize: 15 }}>Sign in with Google</button></a>
          </div>
        </div>

        <footer>
          <div className="foot-inner">
            <div>© 2026 RAX Digital LLC · CalConnect</div>
            <div className="foot-links">
              <a href="/privacy">Privacy</a>
              <a href="/terms">Terms</a>
              <a href="mailto:nick@raxdigital.com">Contact</a>
            </div>
          </div>
        </footer>
      </div>
    </>
  )
}
