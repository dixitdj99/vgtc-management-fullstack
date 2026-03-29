import React, { useState, useEffect } from 'react';
import { Cloud, AlertCircle, CheckCircle2, Loader2, Info, ExternalLink, Key } from 'lucide-react';
import ax from '../api';
import Pagination from '../components/Pagination';

const PAGE_SIZE = 20;

const AdminModule = () => {
    const [loading, setLoading] = useState(false);
    const [authStatus, setAuthStatus] = useState(null); // { authorized: boolean, configured: boolean }
    const [authUrl, setAuthUrl] = useState('');
    const [code, setCode] = useState('');
    const [status, setStatus] = useState(null);
    const [logs, setLogs] = useState([]);
    const [logsLoading, setLogsLoading] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);

    const fetchStatus = async () => {
        setLoading(true);
        setStatus(null);
        try {
            const res = await ax.get('backup/auth-status');
            setAuthStatus(res.data);
            if (res.data.authorized) fetchLogs();
        } catch (e) {
            const statusText = e.response ? `[${e.response.status}] ${e.response.statusText}` : e.message;
            const fullUrl = e.config ? `${e.config.baseURL}/${e.config.url}` : 'unknown';
            console.error('API Error (auth-status):', statusText, fullUrl);
            setAuthStatus({ authorized: false, configured: false, error: true, details: `${statusText} while hitting ${fullUrl}` });
        } finally {
            setLoading(false);
        }
    };

    const fetchLogs = async () => {
        setLogsLoading(true);
        try {
            const res = await ax.get('backup/logs');
            setLogs(res.data);
        } catch (e) {
            console.error('Failed to fetch logs');
        } finally {
            setLogsLoading(false);
        }
    };

    useEffect(() => {
        fetchStatus();
    }, []);

    const handleConnect = async () => {
        setLoading(true);
        try {
            const res = await ax.get('backup/auth-url');
            window.open(res.data.url, '_blank');
            setAuthUrl(res.data.url);
            setStatus({ type: 'info', msg: 'Please authorize on the new tab and paste the code below.' });
        } catch (e) {
            console.error('API Error (auth-url):', e.message);
            setStatus({ type: 'error', msg: e.response?.data?.error || e.message || 'Failed to get auth URL' });
        } finally {
            setLoading(false);
        }
    };

    const handleSubmitCode = async () => {
        setLoading(true);
        try {
            await ax.post('backup/submit-code', { code });
            setStatus({ type: 'success', msg: 'Authorized successfully!' });
            fetchStatus();
            setAuthUrl('');
            setCode('');
        } catch (e) {
            console.error('API Error (submit-code):', e.message);
            setStatus({ type: 'error', msg: e.response?.data?.error || e.message || 'Authorization failed' });
        } finally {
            setLoading(false);
        }
    };

    const triggerBackup = async () => {
        setLoading(true);
        setStatus({ type: 'info', msg: 'Backup requested. Please wait...' });
        try {
            const backupRes = await ax.post('backup/now');
            setStatus({ type: 'success', msg: backupRes.data.message });
            fetchLogs();
        } catch (e) {
            console.error('API Error (backup/now):', e.message);
            setStatus({ type: 'error', msg: e.response?.data?.error || e.message || 'Backup request failed' });
        } finally {
            setLoading(false);
        }
    };

    if (authStatus === null) return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '50px' }}>
            <Loader2 className="spin" size={32} color="var(--accent)" />
        </div>
    );

    const paginatedLogs = (logs || []).slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    return (
        <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ marginBottom: '32px' }}>
                <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-main)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Shield size={28} color="var(--accent)" /> System Administration
                </h1>
                <p style={{ color: 'var(--text-muted)' }}>Manage system backups and Google Drive connectivity.</p>
            </div>

            <div className="card" style={{ padding: '24px', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Cloud size={24} color="#6366f1" />
                    </div>
                    <div>
                        <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-main)' }}>Google Drive Backup</h3>
                        <p style={{ fontSize: '14px', color: 'var(--text-sub)' }}>
                            {authStatus.authorized ? 'Connected to Google Drive' : 'Drive connection required for weekly backups.'}
                        </p>
                    </div>
                </div>

                {authStatus.error && (
                    <div style={{ marginBottom: '20px', padding: '12px 16px', background: 'rgba(244, 63, 94, 0.1)', color: '#f43f5e', borderRadius: '8px', fontSize: '13px', border: '1px solid rgba(244, 63, 94, 0.2)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <AlertCircle size={14} /> System unable to reach backup services.
                        </div>
                        {authStatus.details && (
                            <div style={{ fontSize: '11px', opacity: 0.8, fontFamily: 'monospace', wordBreak: 'break-all', marginTop: '4px' }}>
                                Error: {authStatus.details}
                            </div>
                        )}
                        <span style={{ cursor: 'pointer', textDecoration: 'underline', marginTop: '4px', fontWeight: '700' }} onClick={fetchStatus}>Retry Connection</span>
                    </div>
                )}

                {authStatus && !authStatus.configured && (
                    <div style={{ marginBottom: '20px', padding: '16px', background: 'rgba(244, 63, 94, 0.05)', borderRadius: '12px', border: '1px solid rgba(244, 63, 94, 0.2)' }}>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <AlertCircle size={20} color="#f43f5e" />
                            <div>
                                <strong style={{ color: 'var(--text-main)', fontSize: '14px' }}>Google Configuration Missing</strong>
                                <p style={{ color: 'var(--text-sub)', fontSize: '13px', margin: '4px 0 0 0', lineHeight: '1.5' }}>
                                    The system cannot find your <code>credentials.json</code> file or <code>GOOGLE_CREDENTIALS</code> environment variable. 
                                    Please ensure you have pasted the <b>full JSON</b> into your production dashboard.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {authStatus.configured && (
                    <>
                        {!authStatus.authorized ? (
                            <div style={{ background: 'var(--bg-th)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                                    <Key size={20} color="var(--accent)" />
                                    <div style={{ fontSize: '14px', lineHeight: '1.6' }}>
                                        <strong style={{ color: 'var(--text-main)' }}>Step 1: Link your Account</strong>
                                        <p style={{ color: 'var(--text-sub)', margin: '4px 0 12px 0' }}>Click the button below to sign in with Google and grant permission to upload backups.</p>
                                        <button className="btn btn-p" onClick={handleConnect} disabled={loading} style={{ height: '36px', fontSize: '13px' }}>
                                            Connect Google Drive <ExternalLink size={14} style={{ marginLeft: '6px' }} />
                                        </button>
                                    </div>
                                </div>

                                {authUrl && (
                                    <div style={{ marginTop: '24px', borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
                                        <strong style={{ color: 'var(--text-main)', fontSize: '14px' }}>Step 2: Paste Authorization Code</strong>
                                        <p style={{ color: 'var(--text-sub)', fontSize: '13px', margin: '4px 0 12px 0' }}>Paste the code you received from Google after signing in:</p>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <input 
                                                type="text" 
                                                className="input" 
                                                placeholder="Paste code here..." 
                                                value={code} 
                                                onChange={(e) => setCode(e.target.value)}
                                                style={{ flex: 1, height: '36px', fontSize: '13px' }}
                                            />
                                            <button className="btn btn-s" onClick={handleSubmitCode} disabled={!code || loading} style={{ height: '36px', padding: '0 20px' }}>
                                                Verify Code
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div style={{ background: 'rgba(16, 185, 129, 0.05)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                                <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                                    <CheckCircle2 size={20} color="#10b981" />
                                    <div style={{ fontSize: '14px', lineHeight: '1.6' }}>
                                        <strong style={{ color: 'var(--text-main)' }}>Automatic Backup is ACTIVE</strong>
                                        <p style={{ color: 'var(--text-sub)', margin: '4px 0 0 0' }}>Files are uploaded every Sunday at 00:00 to <code>VGTC_Backups/</code></p>
                                    </div>
                                </div>
                                <button className="btn btn-p" onClick={triggerBackup} disabled={loading} style={{ width: '100%', height: '40px', fontWeight: '600' }}>
                                    {loading ? <Loader2 className="spin" size={16} /> : 'Run Manual Backup Now'}
                                </button>
                            </div>
                        )}
                    </>
                )}

                {status && (
                    <div style={{ 
                        marginTop: '20px',
                        padding: '12px 16px', 
                        borderRadius: '8px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '10px',
                        fontSize: '13px',
                        background: status.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : status.type === 'error' ? 'rgba(244, 63, 94, 0.1)' : 'rgba(99, 102, 241, 0.1)',
                        color: status.type === 'success' ? '#10b981' : status.type === 'error' ? '#f43f5e' : '#6366f1',
                    }}>
                        {status.type === 'success' ? <CheckCircle2 size={14} /> : status.type === 'error' ? <AlertCircle size={14} /> : <Loader2 size={14} className="spin" />}
                        {status.msg}
                    </div>
                )}

                {!authStatus.authorized && (
                    <div style={{ marginTop: '24px', padding: '16px', background: 'rgba(245, 158, 11, 0.05)', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <Info size={16} color="#f59e0b" style={{ marginTop: '2px' }} />
                            <div style={{ fontSize: '12px', color: 'var(--text-sub)', lineHeight: '1.5' }}>
                                <strong>Production Hint:</strong> If you are deploying to Render/Netlify, ensure you have added the <code>GOOGLE_CREDENTIALS</code> environment variable with the content of your JSON file.
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {authStatus.authorized && (
                <div style={{ marginTop: '32px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-main)' }}>Backup History</h3>
                        <button 
                            className="btn btn-s" 
                            onClick={fetchLogs} 
                            disabled={logsLoading}
                            style={{ padding: '6px 12px', fontSize: '12px' }}
                        >
                            {logsLoading ? <Loader2 size={12} className="spin" /> : 'Refresh Logs'}
                        </button>
                    </div>

                    <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                        <div className="tbl-wrap">
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                <thead style={{ background: 'var(--bg-th)', borderBottom: '1px solid var(--border)' }}>
                                    <tr>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: 'var(--text-sub)' }}>Timestamp</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: 'var(--text-sub)' }}>Module</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: 'var(--text-sub)' }}>Status</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: 'var(--text-sub)' }}>Details</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {logs.length === 0 ? (
                                        <tr>
                                            <td colSpan="4" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>No backup activity recorded yet.</td>
                                        </tr>
                                    ) : (
                                        paginatedLogs.map(log => (
                                            <tr key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                                <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                                                    {new Date(log.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                                </td>
                                                <td style={{ padding: '12px 16px' }}>
                                                    <span style={{ fontWeight: '600' }}>{log.moduleName}</span>
                                                </td>
                                                <td style={{ padding: '12px 16px' }}>
                                                    <span style={{ 
                                                        padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase',
                                                        background: log.status === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)',
                                                        color: log.status === 'success' ? '#10b981' : '#f43f5e'
                                                    }}>
                                                        {log.status}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '12px 16px', color: 'var(--text-sub)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {log.details || (log.error ? `Error: ${log.error}` : '-')}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <Pagination 
                            currentPage={currentPage}
                            totalItems={logs.length}
                            pageSize={PAGE_SIZE}
                            onPageChange={setCurrentPage}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

const Shield = ({ size, color }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
);

export default AdminModule;
