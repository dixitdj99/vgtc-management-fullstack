import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowLeft, Download, Pause, Play, RefreshCw, Search, Trash2 } from 'lucide-react';
import ax from '../api';
import './status.css';

const list = value => Array.isArray(value) ? value : [];
const show = value => value === undefined || value === null || value === '' ? '—' : String(value);
const date = value => value ? new Date(value).toLocaleString('en-IN') : '—';
const bucketTime = value => {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
};
const errorText = error => error?.response?.data?.error || error?.message || 'Request failed';
const nav = [['overview', 'Overview'], ['tables', 'Database'], ['api', 'API logs'], ['whatsapp', 'WhatsApp'], ['backups', 'Backups']];
const detail = row => <details><summary>Full recorded detail</summary><pre>{JSON.stringify(row, null, 2)}</pre></details>;
const empty = text => <p className="sp-empty">{text}</p>;
function Metric({ label, value, note }) { return <div className="sp-metric"><small>{label}</small><strong>{show(value)}</strong><small>{note}</small></div>; }
function Table({ headings, rows, cells, emptyText }) {
  return <div className="sp-table-wrap"><table><thead><tr>{headings.map(heading => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={row.id || row.messageId || row.collectionName || i}>{cells(row, i).map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table>{!rows.length && empty(emptyText)}</div>;
}
function Chart({ buckets }) {
  const rows = list(buckets), max = Math.max(1, ...rows.map(item => Number(item.total) || 0));
  return <div className="sp-chart">{rows.length ? rows.map((item, index) => <div className="sp-bar-col" key={index} title={bucketTime(item.time) + ' · ' + ['2xx', '3xx', '4xx', '5xx'].map(code => code + ': ' + (item[code] || 0)).join(' · ')}>
    <div className="sp-bar-stack" style={{ height: (Number(item.total) || 0) / max * 100 + '%' }}>{['2xx', '3xx', '4xx', '5xx'].map(code => <span key={code} className={'sp-bar-' + code} style={{ height: item.total ? (Number(item[code]) || 0) / item.total * 100 + '%' : 0 }} />)}</div><small>{bucketTime(item.time)}</small>
  </div>) : empty('No request history available.')}</div>;
}
export default function StatusPage() {
  const [tab, setTab] = useState('overview');
  const [live, setLive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(null);
  const [status, setStatus] = useState(null);
  const [telemetry, setTelemetry] = useState(null);
  const [database, setDatabase] = useState(null);
  const [apiLogs, setApiLogs] = useState([]);
  const [waLogs, setWaLogs] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [backupStatus, setBackupStatus] = useState(null);
  const [backups, setBackups] = useState([]);
  const [errors, setErrors] = useState({});
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState(null);
  const [tableDetail, setTableDetail] = useState(null);
  const inspectSequence = useRef(0);

  const request = useCallback(async (key, path, setter) => {
    try {
      const response = await ax.get(path);
      setter(response.data);
      setErrors(old => ({ ...old, [key]: null }));
    } catch (error) { setErrors(old => ({ ...old, [key]: errorText(error) })); }
  }, []);
  const refresh = useCallback(async (force = false) => {
    setBusy(true);
    await Promise.all([
      request('status', '/system/status', setStatus),
      request('telemetry', '/system/telemetry', setTelemetry),
      request('database', '/system/database-tables' + (force ? '?refresh=1' : ''), setDatabase),
      request('api', '/system/api-logs?limit=500', data => setApiLogs(list(data.logs))),
      request('whatsapp', '/whatsapp/logs?limit=500', data => setWaLogs(list(data.logs))),
      request('deliveries', '/whatsapp/deliveries?limit=100', data => setDeliveries(list(data.deliveries))),
      request('backupStatus', '/backup/auth-status', setBackupStatus),
      request('backups', '/backup/logs', data => setBackups(list(data))),
    ]);
    setChecked(new Date());
    setBusy(false);
  }, [request]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!live) return undefined;
    const interval = setInterval(() => {
      request('status', '/system/status', setStatus);
      request('telemetry', '/system/telemetry', setTelemetry);
      request('api', '/system/api-logs?limit=500', data => setApiLogs(list(data.logs)));
      request('whatsapp', '/whatsapp/logs?limit=500', data => setWaLogs(list(data.logs)));
      request('deliveries', '/whatsapp/deliveries?limit=100', data => setDeliveries(list(data.deliveries)));
      setChecked(new Date());
    }, 10000);
    return () => clearInterval(interval);
  }, [live, request]);
  const changeTab = next => { setTab(next); setSearch(''); setFilter('all'); setExpanded(null); };
  const clear = async (kind) => {
    if (!window.confirm('Clear ' + (kind === 'api' ? 'buffered API' : 'WhatsApp activity') + ' logs?')) return;
    try {
      await ax.delete(kind === 'api' ? '/system/api-logs' : '/whatsapp/logs');
      if (kind === 'api') setApiLogs([]); else setWaLogs([]);
      setErrors(old => ({ ...old, [kind]: null }));
    } catch (error) { setErrors(old => ({ ...old, [kind]: errorText(error) })); }
  };
  const exportData = (name, data) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
  };
  const inspectTable = async row => {
    const sequence = ++inspectSequence.current;
    if (expanded === row.collectionName) { setExpanded(null); return; }
    setExpanded(row.collectionName); setTableDetail(null);
    try {
      const response = await ax.get('/system/database-tables/' + encodeURIComponent(row.collectionName));
      if (sequence !== inspectSequence.current) return;
      setTableDetail(response.data);
      setErrors(old => ({ ...old, tableDetail: null }));
    } catch (error) {
      if (sequence === inspectSequence.current) setErrors(old => ({ ...old, tableDetail: errorText(error) }));
    }
  };
  const tables = list(database?.tables);
  const visibleTables = useMemo(() => tables.filter(row => (filter === 'all' || row.category?.toLowerCase() === filter) && JSON.stringify(row).toLowerCase().includes(search.toLowerCase())), [tables, filter, search]);
  const visibleApi = useMemo(() => apiLogs.filter(row => (filter === 'all' || Math.floor(Number(row.status) / 100) === Number(filter[0])) && JSON.stringify(row).toLowerCase().includes(search.toLowerCase())), [apiLogs, filter, search]);
  const visibleWa = useMemo(() => waLogs.filter(row => (filter === 'all' || (filter === 'failed' ? row.status === 'failed' || row.error : filter === 'inbound' ? row.type === 'inbound_webhook' : row.type !== 'inbound_webhook')) && JSON.stringify(row).toLowerCase().includes(search.toLowerCase())), [waLogs, filter, search]);
  const categories = [...new Set(tables.map(row => row.category?.toLowerCase()).filter(Boolean))];
  const error = key => errors[key] && <div className="sp-error" role="alert">{errors[key]}</div>;
  const controls = options => <div className="sp-controls"><label><Search size={14} /><input placeholder="Search records" value={search} onChange={event => setSearch(event.target.value)} /></label><select value={filter} onChange={event => setFilter(event.target.value)}>{options.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></div>;
  const panel = (title, subtitle, children, actions) => <section className="sp-panel"><div className="sp-panel-head"><div><h2>{title}</h2><p>{subtitle}</p></div>{actions && <div className="sp-actions">{actions}</div>}</div>{children}</section>;
  return <div className="sp-page">
    <header className="sp-header"><div className="sp-brand"><Activity size={20} /><div><h1>System status</h1><p>Service, database, API and WhatsApp activity</p></div></div><div className="sp-actions"><span>Updated {date(checked)}</span><button onClick={() => setLive(!live)}>{live ? <Pause size={14} /> : <Play size={14} />}{live ? 'Pause live' : 'Resume live'}</button><button onClick={() => refresh(true)} disabled={busy}><RefreshCw size={14} />{busy ? 'Refreshing' : 'Refresh'}</button><a href="/"><ArrowLeft size={14} />Portal</a></div></header>
    <nav className="sp-nav">{nav.map(([id, label]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => changeTab(id)}>{label}</button>)}</nav>
    <main className="sp-main">
      {tab === 'overview' && <>{error('status')}{error('telemetry')}<div className="sp-metrics">
        <Metric label="Service" value={status?.status} note={status?.appEnv} /><Metric label="Database" value={status ? status.firebaseConnected ? 'Connected' : 'Fallback' : null} note={status?.collectionPrefix} /><Metric label="WhatsApp" value={status ? status.whatsapp?.enabled == null ? 'Unknown' : status.whatsapp.enabled ? 'Enabled' : 'Disabled' : null} note={status?.whatsapp?.phoneNumberId} /><Metric label="Requests" value={telemetry?.totalRequests} note={telemetry?.requestsPerMinute != null ? telemetry.requestsPerMinute + '/min' : ''} /><Metric label="5xx error rate" value={telemetry?.errorRate} note={telemetry?.outcomes?.['5xx'] != null ? telemetry.outcomes['5xx'] + ' responses' : ''} /><Metric label="Uptime" value={status?.uptime != null ? Math.floor(status.uptime / 3600) + 'h ' + Math.floor(status.uptime % 3600 / 60) + 'm' : null} note={status?.node} />
      </div>{panel('Request outcomes', '15 one-minute buckets · current server process', <><div className="sp-legend">{['2xx', '3xx', '4xx', '5xx'].map(code => <span key={code}>{code}: {show(telemetry?.outcomes?.[code])}</span>)}</div><Chart buckets={telemetry?.buckets} /></>)}
      <div className="sp-grid">{panel('Latency', 'Recent requests', <div className="sp-facts">{['p50', 'p90', 'p99', 'max'].map(key => <div key={key}><span>{key.toUpperCase()}</span><strong>{telemetry?.latency?.[key] != null ? telemetry.latency[key] + ' ms' : '—'}</strong><i style={{ width: telemetry?.latency?.max ? Math.min(100, Number(telemetry.latency[key] || 0) / telemetry.latency.max * 100) + '%' : 0 }} /></div>)}</div>)}{panel('Runtime', 'Current Node process', <div className="sp-facts">{[['Heap used', telemetry?.memory?.heapUsed], ['Heap allocated', telemetry?.memory?.heapTotal], ['Resident memory', telemetry?.memory?.rss]].map(([label, amount]) => <div key={label}><span>{label}</span><strong>{amount != null ? (amount / 1048576).toFixed(1) + ' MB' : '—'}</strong></div>)}</div>)}</div>
      <div className="sp-grid">{[['Busiest routes', telemetry?.busiestRoutes], ['Slowest routes', telemetry?.slowestRoutes]].map(([title, rows]) => panel(title, 'Observed requests', <Table headings={['Route', 'Calls', '5xx', 'Average']} rows={list(rows)} cells={row => [<code>{row.method} {row.route}</code>, show(row.calls), show(row.serverErrors), row.avgMs != null ? row.avgMs + ' ms' : '—']} emptyText="No route metrics yet." />))}</div></>}
      {tab === 'tables' && panel('Database collections', show(database?.totalTables) + ' collections · ' + show(database?.totalDocs) + ' documents · ' + show(database?.env) + ' · prefix ' + show(database?.prefix), <>{error('database')}{controls([['all', 'All categories'], ...categories.map(item => [item, item])])}<Table headings={['Collection', 'Category', 'Fields', 'Documents', 'Status', 'Checked']} rows={visibleTables} cells={row => [<button className="sp-link" onClick={() => inspectTable(row)}>{row.name}<small>{row.collectionName}</small></button>, show(row.category), show(row.fields?.length), show(row.count), <span title={row.error}>{show(row.status)}</span>, date(row.checkedAt || row.lastSync)]} emptyText={database ? 'No collections match.' : 'Collection data unavailable.'} />{expanded && <div className="sp-inspector"><h3>{expanded} schema</h3>{error('tableDetail')}{tableDetail && <><p>{show(tableDetail.count)} documents · {show(tableDetail.sampledDocuments)} sampled · {show(tableDetail.engine)} · {show(tableDetail.status)}</p>{tableDetail.error && <div className="sp-error">{tableDetail.error}</div>}<Table headings={['Field path', 'Observed types']} rows={list(tableDetail.fields)} cells={field => [<code>{field.name}</code>, list(field.types).join(', ')]} emptyText="No fields found in sampled documents." />{detail(tableDetail)}</>}{!tableDetail && !errors.tableDetail && <p>Loading metadata…</p>}</div>}<p className="sp-note">Counts come from active server environment. Field types come from up to five sampled documents; values are not included.</p></>, <button onClick={() => exportData('collections.json', database)} disabled={!database}><Download size={14} />Export</button>)}
      {tab === 'api' && panel('API request logs', apiLogs.length + ' buffered requests · current server process', <>{error('api')}{controls([['all', 'All responses'], ['2xx', '2xx'], ['3xx', '3xx'], ['4xx', '4xx'], ['5xx', '5xx']])}<Table headings={['Time', 'Method', 'Path', 'HTTP', 'Duration', 'IP', 'Response / trace']} rows={visibleApi} cells={row => [date(row.timestamp), row.method, <code>{row.path}</code>, show(row.status), row.durationMs != null ? row.durationMs + ' ms' : '—', <code>{show(row.ip)}</code>, detail(row)]} emptyText="No recorded API requests match." /><p className="sp-note">Responses show safe server-recorded metadata and redacted errors. Full response bodies are unavailable unless server records them.</p></>, <><button onClick={() => exportData('api-logs.json', visibleApi)} disabled={!visibleApi.length}><Download size={14} />Export</button><button onClick={() => clear('api')} disabled={!apiLogs.length}><Trash2 size={14} />Clear</button></>)}
      {tab === 'whatsapp' && <><div className="sp-metrics"><Metric label="Activity records" value={waLogs.length} /><Metric label="Delivery records" value={deliveries.length} /><Metric label="Latest delivery" value={deliveries[0]?.status} note={deliveries[0]?.messageId} /><Metric label="Failed activity" value={waLogs.filter(row => row.status === 'failed' || row.error).length} /></div>{panel('WhatsApp activity', 'Recent instance activity; durable delivery records below', <>{error('whatsapp')}{controls([['all', 'All events'], ['outbound', 'Outbound'], ['inbound', 'Inbound'], ['failed', 'Failed']])}<Table headings={['Time', 'Direction', 'Phone', 'Event', 'Status', 'Message ID', 'Detail']} rows={visibleWa} cells={row => [date(row.timestamp), row.type === 'inbound_webhook' ? 'Inbound' : 'Outbound', <code>{show(row.phone)}</code>, show(row.title || row.category || row.type), show(row.status), <code>{show(row.messageId)}</code>, detail(row)]} emptyText="No WhatsApp activity matches." /></>, <><button onClick={() => exportData('whatsapp-activity.json', visibleWa)} disabled={!visibleWa.length}><Download size={14} />Export</button><button onClick={() => clear('whatsapp')} disabled={!waLogs.length}><Trash2 size={14} />Clear activity</button></>)}{panel('Delivery responses', 'Meta delivery callbacks and failure detail', <>{error('deliveries')}<Table headings={['Message ID', 'Phone', 'Status', 'Updated', 'Error code', 'Detail']} rows={deliveries} cells={row => [<code>{show(row.messageId)}</code>, show(row.phone || row.to), show(row.status), date(row.statusUpdatedAt || row.acceptedAt), show(row.errorCode), detail(row)]} emptyText="No delivery records available." /></>, <button onClick={() => exportData('whatsapp-deliveries.json', deliveries)} disabled={!deliveries.length}><Download size={14} />Export</button>)}</>}
      {tab === 'backups' && <><div className="sp-metrics"><Metric label="Drive configured" value={backupStatus ? backupStatus.configured ? 'Yes' : 'No' : null} /><Metric label="Drive authorized" value={backupStatus ? backupStatus.authorized ? 'Yes' : 'No' : null} /><Metric label="Recorded runs" value={backups.length} /></div>{panel('Backup history', 'Google Drive snapshot records', <>{error('backupStatus')}{error('backups')}<Table headings={['Time', 'File', 'Size', 'Status', 'Drive ID', 'Detail']} rows={backups} cells={row => [date(row.timestamp || row.createdAt), show(row.fileName), show(row.fileSize), show(row.status), <code>{show(row.driveFileId)}</code>, detail(row)]} emptyText="No backup records available." /></>, <button onClick={() => exportData('backups.json', backups)} disabled={!backups.length}><Download size={14} />Export</button>)}</>}
    </main>
  </div>;
}
