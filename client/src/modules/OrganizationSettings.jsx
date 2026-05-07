import React, { useState, useEffect } from 'react';
import { Settings, Save, RefreshCw, Info, Type, Tag, Layout, Building2, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import ax from '../api';
import { useAuth } from '../auth/AuthContext';

const MODULE_KEYS = [
    { id: 'lr_kosli', default: 'Kosli LR' },
    { id: 'lr_jhajjar', default: 'Jhajjar LR' },
    { id: 'lr_jkl', default: 'JK Lakshmi LR' },
    { id: 'bill_kosli', default: 'Kosli Bill' },
    { id: 'bill_jhajjar', default: 'Jhajjar Bill' },
    { id: 'voucher_jkl', default: 'JK Lakshmi Voucher' },
    { id: 'voucher_jksuper', default: 'JK Super Voucher' },
    { id: 'stock_kosli', default: 'Kosli Stock' },
    { id: 'stock_jhajjar', default: 'Jhajjar Stock' },
    { id: 'stock_jkl', default: 'JK Lakshmi Stock' },
    { id: 'cashbook', default: 'Cashbook' },
    { id: 'pay', default: 'Pay Vehicles' },
    { id: 'invoice', default: 'Generate Invoice' },
    { id: 'vehicle', default: 'Vehicle Management' },
    { id: 'diesel', default: 'Diesel Module' },
    { id: 'mileage', default: 'Mileage Tracker' },
    { id: 'sell', default: 'Sell Management' },
    { id: 'loading_status', default: 'Loading Realtime' },
];

export default function OrganizationSettings() {
    const { user, refreshUser } = useAuth();
    const [org, setOrg] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    const [form, setForm] = useState({
        name: '',
        moduleLabels: {}
    });

    useEffect(() => {
        fetchOrg();
    }, []);

    const fetchOrg = async () => {
        setLoading(true);
        try {
            const res = await ax.get(`/org/${user.orgId}`);
            setOrg(res.data);
            setForm({
                name: res.data.name || '',
                moduleLabels: res.data.moduleLabels || {}
            });
        } catch (e) {
            setMessage({ type: 'error', text: 'Failed to load organization settings' });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        setMessage({ type: '', text: '' });
        try {
            const res = await ax.patch(`/org/${user.orgId}`, form);
            setOrg(res.data);
            setMessage({ type: 'success', text: 'Settings updated successfully!' });
            // Refresh user context to apply changes immediately across UI
            await refreshUser();
        } catch (e) {
            setMessage({ type: 'error', text: e.response?.data?.error || 'Failed to save settings' });
        } finally {
            setSaving(false);
        }
    };

    const setLabel = (key, val) => {
        setForm(f => ({
            ...f,
            moduleLabels: { ...f.moduleLabels, [key]: val }
        }));
    };

    if (loading) return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px', color: 'var(--text-muted)' }}>
            <RefreshCw size={24} className="ani-spin" />
        </div>
    );

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '32px', alignItems: 'start' }}>
                
                {/* Module Labels */}
                <div className="card">
                    <div className="card-header">
                        <div className="card-title-block">
                            <div className="card-icon ci-indigo"><Layout size={17} /></div>
                            <div className="card-title-text">
                                <h3>Module Labels</h3>
                                <p>Rename system modules to match your business terminology</p>
                            </div>
                        </div>
                    </div>
                    <div className="card-body">
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
                            {MODULE_KEYS.map(m => (
                                <div key={m.id} className="field">
                                    <label style={{ fontSize: '11px', opacity: 0.7 }}>{m.default}</label>
                                    <div style={{ position: 'relative' }}>
                                        <input 
                                            className="fi" 
                                            placeholder={m.default}
                                            value={form.moduleLabels[m.id] || ''}
                                            onChange={e => setLabel(m.id, e.target.value)}
                                            style={{ paddingLeft: '34px' }}
                                        />
                                        <Tag size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Sidebar: General Settings & Save */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div className="card">
                        <div className="card-header">
                            <div className="card-title-block">
                                <div className="card-icon ci-amber"><Building2 size={17} /></div>
                                <div className="card-title-text">
                                    <h3>General Branding</h3>
                                </div>
                            </div>
                        </div>
                        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div className="field">
                                <label>Organization Name</label>
                                <div style={{ position: 'relative' }}>
                                    <input 
                                        className="fi" 
                                        value={form.name}
                                        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                        required
                                        style={{ paddingLeft: '34px' }}
                                    />
                                    <Type size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
                                </div>
                            </div>

                            <div style={{ 
                                padding: '12px', 
                                background: 'rgba(99,102,241,0.05)', 
                                borderRadius: '12px', 
                                border: '1px solid rgba(99,102,241,0.1)',
                                display: 'flex',
                                gap: '12px'
                            }}>
                                <Info size={16} color="#6366f1" style={{ flexShrink: 0, marginTop: '2px' }} />
                                <p style={{ fontSize: '11.5px', color: 'var(--text-sub)', lineHeight: 1.5, margin: 0 }}>
                                    Changes to the organization name will update the branding across the entire application, including print headers.
                                </p>
                            </div>

                            {message.text && (
                                <motion.div 
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    style={{ 
                                        padding: '10px 12px', 
                                        borderRadius: '8px', 
                                        fontSize: '12px', 
                                        fontWeight: 600,
                                        background: message.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)',
                                        color: message.type === 'success' ? '#10b981' : 'var(--danger)',
                                        border: `1px solid ${message.type === 'success' ? 'rgba(16,185,129,0.2)' : 'rgba(244,63,94,0.2)'}`,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px'
                                    }}
                                >
                                    {message.type === 'success' ? <Check size={14} /> : <Info size={14} />}
                                    {message.text}
                                </motion.div>
                            )}

                            <button 
                                className="btn btn-p btn-full" 
                                onClick={handleSave} 
                                disabled={saving}
                                style={{ padding: '12px', marginTop: '10px' }}
                            >
                                {saving ? (
                                    <><RefreshCw size={15} className="ani-spin" /> Saving...</>
                                ) : (
                                    <><Save size={15} /> Save All Changes</>
                                )}
                            </button>
                        </div>
                    </div>

                    <div className="card" style={{ background: 'var(--bg-card-muted)', borderStyle: 'dashed' }}>
                        <div className="card-body" style={{ textAlign: 'center', padding: '30px 20px' }}>
                            <div style={{ color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.6 }}>
                                Need to add a new organization? <br />
                                Contact the system administrator for multi-tenant provisioning.
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
