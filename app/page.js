'use client';

import { useEffect, useState } from 'react';

const FY_START = new Date('2026-06-01');
const FY_END = new Date('2027-05-31');
const EB_TARGET = 2568205;
const ACCRUED_TARGET = 968205;

const WON_STAGES = new Set(['991972440', '1232737356', '1232737357']);
const LIVE_STAGES = new Set(['1232737356', '1232737357']); // Live/In Progress + Complete
const COMPLETE_STAGE = '1232737357';
const LIVE_STAGE = '1232737356';
const WON_CONTRACTED = '991972440';
const LOST_STAGES = new Set(['1333036975', '1313733002', '1333995120', '1333995121', '1333995122']);

const STAGE_LABELS = {
  '991972440': 'Won / Contracted',
  '1232737356': 'Live / In Progress',
  '1232737357': 'Complete',
  '991972439': 'Final Round',
  '991972438': 'Awaiting Feedback',
  '991972437': 'Brief Received',
  '991972436': 'Brief Expected',
  '991972435': 'Warm',
  '991972434': 'Speculative',
  '1237244825': 'Meeting Booked',
  '1333036975': 'Lost',
  '1313733002': 'Closed Lost',
};

const QUARTERS = [
  { label: 'Q1', period: 'Jun–Aug 2026', start: new Date('2026-06-01'), end: new Date('2026-08-31'), target: Math.round(EB_TARGET * 0.15) },
  { label: 'Q2', period: 'Sep–Nov 2026', start: new Date('2026-09-01'), end: new Date('2026-11-30'), target: Math.round(EB_TARGET * 0.25) },
  { label: 'Q3', period: 'Dec–Feb 2027', start: new Date('2026-12-01'), end: new Date('2027-02-28'), target: Math.round(EB_TARGET * 0.35) },
  { label: 'Q4', period: 'Mar–May 2027', start: new Date('2027-03-01'), end: new Date('2027-05-31'), target: Math.round(EB_TARGET * 0.25) },
];

const fmt = (n) => '£' + Math.round(n).toLocaleString('en-GB');
const fmtK = (n) => n >= 1000000 ? '£' + (n / 1000000).toFixed(1) + 'm' : n === 0 ? '£0' : '£' + Math.round(n / 1000) + 'k';

const today = new Date();
const fyDays = (FY_END - FY_START) / 86400000;
const elapsed = Math.max(0, (today - FY_START) / 86400000);
const timePct = Math.min(Math.round((elapsed / fyDays) * 100), 100);

function RAGBar({ current, target }) {
  const pct = Math.min(Math.round((current / target) * 100), 100);
  const color = pct >= timePct ? '#4a7c2f' : pct >= timePct * 0.6 ? '#b87d1a' : '#c0392b';
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#888', marginBottom: 4 }}>
        <span>{fmtK(current)}</span><span>{fmtK(target)}</span>
      </div>
      <div style={{ background: '#eeede8', borderRadius: 4, height: 7, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, background: color, height: '100%', borderRadius: 4, transition: 'width 0.8s ease' }} />
      </div>
      <div style={{ fontSize: 11, color, marginTop: 3, fontWeight: 600 }}>{pct}% of target</div>
    </div>
  );
}

const stageBadgeStyle = (stageId) => {
  const map = {
    won: { background: '#eaf3de', color: '#3a6b10' },
    live: { background: '#d4edfc', color: '#0d5fa0' },
    final: { background: '#e3eefb', color: '#1a5fa5' },
    brief: { background: '#fdf0e0', color: '#8a520c' },
    warm: { background: '#fce8f0', color: '#993356' },
    spec: { background: '#f0efea', color: '#666' },
    lost: { background: '#fceaea', color: '#a32d2d' },
  };
  const cls = stageId === LIVE_STAGE || stageId === COMPLETE_STAGE ? 'live'
    : stageId === WON_CONTRACTED ? 'won'
    : LOST_STAGES.has(stageId) ? 'lost'
    : ['991972439'].includes(stageId) ? 'final'
    : ['991972438','991972437','991972436'].includes(stageId) ? 'brief'
    : ['991972435'].includes(stageId) ? 'warm' : 'spec';
  return { ...map[cls], fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 500, display: 'inline-block' };
};

export default function Dashboard() {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [expandedBrand, setExpandedBrand] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');

  const fetchData = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/deals');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setDeals(data.deals || []);
      setLastUpdated(new Date());
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const fyDeals = deals.filter(d => {
    const close = new Date(d.properties.closedate);
    return close >= FY_START && close <= FY_END && !LOST_STAGES.has(d.properties.dealstage);
  });

  const wonDeals = fyDeals.filter(d => WON_STAGES.has(d.properties.dealstage));
  const pipelineDeals = fyDeals.filter(d => !WON_STAGES.has(d.properties.dealstage));
  const liveDeals = fyDeals.filter(d => LIVE_STAGES.has(d.properties.dealstage));

  const wonTotal = wonDeals.reduce((s, d) => s + (parseFloat(d.properties.amount) || 0), 0);
  const pipeTotal = pipelineDeals.reduce((s, d) => s + (parseFloat(d.properties.amount) || 0), 0);
  const remaining = Math.max(0, EB_TARGET - wonTotal);

  // Group by brand
  const brandMap = {};
  fyDeals.forEach(d => {
    const brand = d.companyName || 'Unassigned';
    if (!brandMap[brand]) brandMap[brand] = { won: 0, pipeline: 0, deals: [], isLiveOrComplete: false };
    const amt = parseFloat(d.properties.amount) || 0;
    if (WON_STAGES.has(d.properties.dealstage)) brandMap[brand].won += amt;
    else brandMap[brand].pipeline += amt;
    if (LIVE_STAGES.has(d.properties.dealstage)) brandMap[brand].isLiveOrComplete = true;
    brandMap[brand].deals.push(d);
  });

  const brands = Object.entries(brandMap)
    .map(([name, data]) => ({ name, ...data, total: data.won + data.pipeline }))
    .sort((a, b) => b.total - a.total);

  const liveOrCompleteBrands = brands.filter(b => b.isLiveOrComplete);
  const otherBrands = brands.filter(b => !b.isLiveOrComplete);

  // Quarter data
  const quarterData = QUARTERS.map(q => {
    const qWon = wonDeals.filter(d => { const c = new Date(d.properties.closedate); return c >= q.start && c <= q.end; });
    const qPipe = pipelineDeals.filter(d => { const c = new Date(d.properties.closedate); return c >= q.start && c <= q.end; });
    return {
      ...q,
      wonVal: qWon.reduce((s, d) => s + (parseFloat(d.properties.amount) || 0), 0),
      pipeVal: qPipe.reduce((s, d) => s + (parseFloat(d.properties.amount) || 0), 0),
      isActive: today >= q.start && today <= q.end,
    };
  });

  // Deal table filter
  const filteredDeals = fyDeals.filter(d => {
    if (activeFilter === 'live') return LIVE_STAGES.has(d.properties.dealstage);
    if (activeFilter === 'won') return d.properties.dealstage === WON_CONTRACTED;
    if (activeFilter === 'pipeline') return !WON_STAGES.has(d.properties.dealstage);
    return true;
  }).sort((a, b) => (parseFloat(b.properties.amount) || 0) - (parseFloat(a.properties.amount) || 0));

  const s = {
    page: { minHeight: '100vh', background: '#f7f7f5', fontFamily: "'Inter', -apple-system, sans-serif", padding: '2rem' },
    inner: { maxWidth: 1000, margin: '0 auto' },
    sectionLabel: { fontSize: 11, fontWeight: 600, color: '#aaa', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 },
    card: { background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '1.1rem 1.25rem' },
    cardLabel: { fontSize: 12, color: '#999', marginBottom: 4 },
    cardValue: { fontSize: 28, fontWeight: 600, color: '#1a1a18', lineHeight: 1.1 },
    cardSub: { fontSize: 12, color: '#bbb', marginTop: 5 },
    divider: { border: 'none', borderTop: '1px solid #eee', margin: '24px 0' },
    grid4: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 },
    grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28 },
    filterBtn: (active) => ({
      fontSize: 12, padding: '4px 12px', border: '1px solid', borderRadius: 20, cursor: 'pointer',
      borderColor: active ? '#1a1a18' : '#ddd', background: active ? '#1a1a18' : '#fff',
      color: active ? '#fff' : '#666', fontWeight: active ? 500 : 400,
    }),
    table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
    th: { fontSize: 11, fontWeight: 500, color: '#aaa', textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid #eee' },
    td: { padding: '9px 10px', borderBottom: '1px solid #f0f0ee', color: '#333', verticalAlign: 'middle' },
  };

  if (loading) return (
    <div style={{ ...s.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: '#888' }}>
        <div style={{ fontSize: 16, marginBottom: 6 }}>Loading dashboard...</div>
        <div style={{ fontSize: 13, color: '#bbb' }}>Fetching live HubSpot data</div>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ ...s.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 16, color: '#c0392b', marginBottom: 8 }}>Failed to load data</div>
        <div style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>{error}</div>
        <button onClick={fetchData} style={{ fontSize: 13, padding: '8px 16px', borderRadius: 8, border: '1px solid #ddd', cursor: 'pointer' }}>Try again</button>
      </div>
    </div>
  );

  return (
    <div style={s.page}>
      <div style={s.inner}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 600, color: '#1a1a18' }}>Existing Business Performance</div>
            <div style={{ fontSize: 13, color: '#aaa', marginTop: 4 }}>
              The Department &nbsp;·&nbsp; FY Jun 2026 – May 2027 &nbsp;·&nbsp; Target: {fmtK(EB_TARGET)}
              {lastUpdated && ` · Updated ${lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`}
            </div>
          </div>
          <button onClick={fetchData} style={{ fontSize: 12, padding: '6px 14px', border: '1px solid #ddd', borderRadius: 8, background: '#fff', cursor: 'pointer', color: '#555' }}>↻ Refresh</button>
        </div>

        {/* Overview metrics */}
        <div style={s.sectionLabel}>Overview</div>
        <div style={s.grid4}>
          <div style={s.card}>
            <div style={s.cardLabel}>EB revenue this FY</div>
            <div style={s.cardValue}>{fmtK(wonTotal)}</div>
            <div style={{ marginTop: 12 }}><RAGBar current={wonTotal} target={EB_TARGET} /></div>
          </div>
          <div style={s.card}>
            <div style={s.cardLabel}>Accrued / confirmed</div>
            <div style={s.cardValue}>{fmtK(ACCRUED_TARGET)}</div>
            <div style={s.cardSub}>carrying into FY</div>
          </div>
          <div style={s.card}>
            <div style={s.cardLabel}>Still to generate</div>
            <div style={s.cardValue}>{fmtK(remaining)}</div>
            <div style={s.cardSub}>to hit {fmtK(EB_TARGET)} target</div>
          </div>
          <div style={s.card}>
            <div style={s.cardLabel}>EB pipeline</div>
            <div style={s.cardValue}>{fmtK(pipeTotal)}</div>
            <div style={s.cardSub}>{pipelineDeals.length} active deals</div>
          </div>
        </div>

        <hr style={s.divider} />

        {/* Live / Complete brands — focus area */}
        {liveOrCompleteBrands.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={s.sectionLabel}>Live &amp; in-progress brands</div>
              <div style={{ fontSize: 12, color: '#aaa' }}>Brands to focus on for more revenue</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 28 }}>
              {liveOrCompleteBrands.map(brand => (
                <div key={brand.name}
                  onClick={() => setExpandedBrand(expandedBrand === brand.name ? null : brand.name)}
                  style={{ ...s.card, borderTop: '3px solid #1a7fc1', cursor: 'pointer', transition: 'box-shadow 0.15s' }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a18', marginBottom: 10 }}>{brand.name}</div>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 11, color: '#aaa', marginBottom: 2 }}>Won</div>
                      <div style={{ fontSize: 18, fontWeight: 600, color: '#4a7c2f' }}>{fmtK(brand.won)}</div>
                    </div>
                    {brand.pipeline > 0 && (
                      <div>
                        <div style={{ fontSize: 11, color: '#aaa', marginBottom: 2 }}>Pipeline</div>
                        <div style={{ fontSize: 18, fontWeight: 600, color: '#b87d1a' }}>{fmtK(brand.pipeline)}</div>
                      </div>
                    )}
                  </div>
                  {expandedBrand === brand.name && (
                    <div style={{ marginTop: 12, borderTop: '1px solid #f0f0ee', paddingTop: 10 }}>
                      {brand.deals.map(d => (
                        <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6, color: '#555' }}>
                          <span style={{ flex: 1, marginRight: 8 }}>{d.properties.dealname}</span>
                          <span style={{ fontWeight: 500 }}>{fmtK(parseFloat(d.properties.amount) || 0)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* All brand cards */}
        <div style={s.sectionLabel}>All existing business brands</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 28 }}>
          {brands.map(brand => (
            <div key={brand.name}
              onClick={() => setExpandedBrand(expandedBrand === brand.name ? null : brand.name)}
              style={{ ...s.card, cursor: 'pointer', borderTop: brand.isLiveOrComplete ? '3px solid #1a7fc1' : '3px solid #eee' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a18' }}>{brand.name}</div>
                {brand.isLiveOrComplete && (
                  <span style={{ fontSize: 10, background: '#d4edfc', color: '#0d5fa0', borderRadius: 10, padding: '1px 6px', fontWeight: 600, whiteSpace: 'nowrap' }}>Live</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#aaa', marginBottom: 2 }}>Won</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: '#4a7c2f' }}>{fmtK(brand.won)}</div>
                </div>
                {brand.pipeline > 0 && (
                  <div>
                    <div style={{ fontSize: 11, color: '#aaa', marginBottom: 2 }}>Pipeline</div>
                    <div style={{ fontSize: 18, fontWeight: 600, color: '#b87d1a' }}>{fmtK(brand.pipeline)}</div>
                  </div>
                )}
              </div>
              {expandedBrand === brand.name && (
                <div style={{ marginTop: 12, borderTop: '1px solid #f0f0ee', paddingTop: 10 }}>
                  {brand.deals.map(d => (
                    <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6, color: '#555' }}>
                      <span style={{ flex: 1, marginRight: 8 }}>{d.properties.dealname}</span>
                      <span style={{ fontWeight: 500 }}>{fmtK(parseFloat(d.properties.amount) || 0)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <hr style={s.divider} />

        {/* Quarterly breakdown */}
        <div style={s.sectionLabel}>Quarterly EB targets</div>
        <div style={{ ...s.card, marginBottom: 28 }}>
          {quarterData.map(q => (
            <div key={q.label} style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: q.isActive ? '#1a1a18' : '#555' }}>{q.label}</span>
                  <span style={{ fontSize: 11, color: '#aaa', marginLeft: 6 }}>{q.period}</span>
                  {q.isActive && <span style={{ fontSize: 10, background: '#d4edfc', color: '#0d5fa0', borderRadius: 10, padding: '1px 6px', marginLeft: 6, fontWeight: 600 }}>Current</span>}
                </div>
                <span style={{ fontSize: 12, color: '#888' }}>target {fmtK(q.target)}</span>
              </div>
              <div style={{ background: '#f5f5f3', borderRadius: 6, height: 30, overflow: 'hidden', position: 'relative' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${Math.min((q.wonVal / q.target) * 100, 100)}%`, background: '#4a7c2f', borderRadius: 6 }} />
                <div style={{ position: 'absolute', left: `${Math.min((q.wonVal / q.target) * 100, 100)}%`, top: 0, height: '100%', width: `${Math.min((q.pipeVal / q.target) * 100, 100 - Math.min((q.wonVal / q.target) * 100, 100))}%`, background: '#c8ddb8', borderRadius: '0 6px 6px 0' }} />
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', padding: '0 10px', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: q.wonVal > 0 ? '#fff' : '#888' }}>{fmtK(q.wonVal)} won</span>
                  {q.pipeVal > 0 && <span style={{ fontSize: 11, color: '#444' }}>{fmtK(q.pipeVal)} in pipe</span>}
                </div>
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
            <span style={{ fontSize: 11, color: '#888', display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, background: '#4a7c2f', borderRadius: 2, display: 'inline-block' }} /> Won</span>
            <span style={{ fontSize: 11, color: '#888', display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, background: '#c8ddb8', borderRadius: 2, display: 'inline-block' }} /> Pipeline</span>
          </div>
        </div>

        <hr style={s.divider} />

        {/* Deal table */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={s.sectionLabel}>All deals</div>
          <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
            {[['all', 'All'], ['live', 'Live / Complete'], ['won', 'Won / Contracted'], ['pipeline', 'Pipeline']].map(([val, label]) => (
              <button key={val} onClick={() => setActiveFilter(val)} style={s.filterBtn(activeFilter === val)}>{label}</button>
            ))}
          </div>
        </div>
        <div style={{ ...s.card, padding: 0, overflow: 'hidden' }}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Deal</th>
                <th style={s.th}>Brand</th>
                <th style={s.th}>Stage</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Value</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Close date</th>
              </tr>
            </thead>
            <tbody>
              {filteredDeals.map(d => (
                <tr key={d.id}>
                  <td style={s.td}>{d.properties.dealname}</td>
                  <td style={{ ...s.td, color: '#888' }}>{d.companyName || '—'}</td>
                  <td style={s.td}><span style={stageBadgeStyle(d.properties.dealstage)}>{STAGE_LABELS[d.properties.dealstage] || d.properties.dealstage}</span></td>
                  <td style={{ ...s.td, textAlign: 'right', fontWeight: 500 }}>{d.properties.amount ? fmt(parseFloat(d.properties.amount)) : '—'}</td>
                  <td style={{ ...s.td, textAlign: 'right', color: '#888' }}>{d.properties.closedate ? new Date(d.properties.closedate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'}</td>
                </tr>
              ))}
              {filteredDeals.length === 0 && <tr><td colSpan={5} style={{ ...s.td, textAlign: 'center', color: '#aaa', padding: 32 }}>No deals found</td></tr>}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 24, fontSize: 11, color: '#ccc', textAlign: 'center' }}>
          The Department · Existing Business Dashboard · Data refreshes on page load
        </div>
      </div>
    </div>
  );
}
