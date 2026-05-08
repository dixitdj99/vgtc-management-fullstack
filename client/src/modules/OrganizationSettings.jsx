import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Check, ChevronDown, ChevronUp, Clock, Database, Edit3, Globe, Image, Info, Layout, Lock, Mail, MapPin, Palette, Phone, Plus, RefreshCw, Save, ShieldCheck, Tag, ToggleLeft, ToggleRight, Trash2, Type, UserPlus, Users, X, History, Eye, Pencil, AlertTriangle } from 'lucide-react';
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

const PERMISSION_KEYS = ['lr', 'voucher', 'balance', 'stock', 'cashbook', 'pay', 'invoice', 'vehicle', 'diesel', 'mileage', 'sell', 'loading_status'];
const PERMISSION_LABELS = {
    allowedPlants: 'Allowed Plants',
    allowedGodowns: 'Allowed Godowns',
    lr: 'LR',
    voucher: 'Voucher',
    balance: 'Balance',
    stock: 'Stock',
    cashbook: 'Cashbook',
    pay: 'Pay',
    invoice: 'Invoice',
    vehicle: 'Vehicle',
    diesel: 'Diesel',
    mileage: 'Mileage',
    sell: 'Sell',
    loading_status: 'Loading Status'
};

const CLEAN_PERMISSIONS = {
    lr: 'edit',
    voucher: 'edit',
    balance: 'edit',
    stock: 'edit',
    cashbook: 'edit',
    pay: 'edit',
    invoice: 'edit',
    vehicle: 'edit',
    diesel: 'edit',
    mileage: 'edit',
    sell: 'edit',
    loading_status: 'edit'
};

const emptyCreateForm = () => ({
    id: '',
    name: '',
    domain: '',
    logoUrl: '',
    status: 'active',
    config: {
        businessType: 'transport',
        contactEmail: '',
        contactPhone: '',
        address: '',
        primaryColor: '#8b5cf6',
        accentColor: '#6366f1',
        defaultPermissions: { ...CLEAN_PERMISSIONS },
        locations: []
    },
    admin: {
        name: '',
        username: '',
        password: '',
        email: '',
        isOtpEnabled: false,
        permissions: { ...CLEAN_PERMISSIONS }
    }
});

const asList = (value) => Array.isArray(value) ? value.join(', ') : value;
const slugify = (value) => String(value || '').toLowerCase().trim().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');

function SectionHeader({ icon: Icon, title, subtitle, color = '#8b5cf6', right }) {
    return (
        <div className="card-header">
            <div className="card-title-block">
                <div className="card-icon" style={{ background: `${color}18`, color }}><Icon size={17} /></div>
                <div className="card-title-text">
                    <h3>{title}</h3>
                    {subtitle && <p>{subtitle}</p>}
                </div>
            </div>
            {right}
        </div>
    );
}

function IconInput({ icon: Icon, children }) {
    return (
        <div style={{ position: 'relative' }}>
            {children}
            <Icon size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.45, pointerEvents: 'none' }} />
        </div>
    );
}

function PermissionSelect({ value, onChange }) {
    return (
        <select className="fi" value={value || ''} onChange={e => onChange(e.target.value || null)} style={{ height: '34px', padding: '6px 8px' }}>
            <option value="">None</option>
            <option value="view">View</option>
            <option value="edit">Edit</option>
        </select>
    );
}

function PermissionEditor({ permissions = {}, onChange, plants = [], godowns = [] }) {
    const setPerm = (key, value) => onChange({ ...permissions, [key]: value });
    const toggleArrayValue = (key, value) => {
        const current = Array.isArray(permissions[key]) ? permissions[key] : [];
        const next = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
        setPerm(key, next);
    };

    const hasLocations = plants.length > 0 || godowns.length > 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {hasLocations && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    {plants.length > 0 && (
                        <div style={{ padding: '12px', borderRadius: '12px', background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 800, marginBottom: '8px' }}>Plants</div>
                            {plants.map(([value, label]) => (
                                <label key={value} style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '12px', marginBottom: '6px' }}>
                                    <input type="checkbox" checked={(permissions.allowedPlants || []).includes(value)} onChange={() => toggleArrayValue('allowedPlants', value)} />
                                    {label}
                                </label>
                            ))}
                        </div>
                    )}
                    {godowns.length > 0 && (
                        <div style={{ padding: '12px', borderRadius: '12px', background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 800, marginBottom: '8px' }}>Godowns</div>
                            {godowns.map(([value, label]) => (
                                <label key={value} style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '12px', marginBottom: '6px' }}>
                                    <input type="checkbox" checked={(permissions.allowedGodowns || []).includes(value)} onChange={() => toggleArrayValue('allowedGodowns', value)} />
                                    {label}
                                </label>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px' }}>
                {PERMISSION_KEYS.map(key => (
                    <div key={key} style={{ padding: '10px', borderRadius: '10px', background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '6px' }}>{PERMISSION_LABELS[key]}</div>
                        <PermissionSelect value={permissions[key]} onChange={value => setPerm(key, value)} />
                    </div>
                ))}
            </div>
        </div>
    );
}

function PermissionChips({ permissions = {} }) {
    const entries = Object.entries(permissions).filter(([, value]) => value !== undefined && value !== null && value !== '');
    if (!entries.length) return <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>No custom permissions</span>;

    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {entries.map(([key, value]) => (
                <span key={key} style={{
                    fontSize: '10px',
                    fontWeight: 800,
                    color: value === 'edit' ? '#10b981' : '#8b5cf6',
                    background: value === 'edit' ? 'rgba(16,185,129,0.1)' : 'rgba(139,92,246,0.1)',
                    border: `1px solid ${value === 'edit' ? 'rgba(16,185,129,0.2)' : 'rgba(139,92,246,0.2)'}`,
                    borderRadius: '999px',
                    padding: '4px 8px'
                }}>
                    {PERMISSION_LABELS[key] || key}: {asList(value)}
                </span>
            ))}
        </div>
    );
}

export default function OrganizationSettings({ orgOnly = false }) {
    const { user, refreshUser } = useAuth();
    const [orgs, setOrgs] = useState([]);
    const [selectedId, setSelectedId] = useState('vgtc');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [creating, setCreating] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });
    const [form, setForm] = useState({ name: '', domain: '', logoUrl: '', status: 'active', moduleLabels: {}, config: {} });
    const [createForm, setCreateForm] = useState(emptyCreateForm);

    // User management state
    const [editingUser, setEditingUser] = useState(null);
    const [showUserCreate, setShowUserCreate] = useState(false);
    const [userForm, setUserForm] = useState({ name: '', username: '', password: '', email: '', role: 'user', permissions: {}, isOtpEnabled: false, isSandbox: false });
    const [userSaving, setUserSaving] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    // Role template state
    const [newRoleName, setNewRoleName] = useState('');
    const [editingRole, setEditingRole] = useState(null);

    // Audit trail state
    const [auditLog, setAuditLog] = useState([]);
    const [auditLoading, setAuditLoading] = useState(false);
    const [auditOffset, setAuditOffset] = useState(0);
    const [auditHasMore, setAuditHasMore] = useState(false);
    const [expandedAudit, setExpandedAudit] = useState(null);

    const selectedOrg = useMemo(() => orgs.find(o => o.id === selectedId) || orgs[0] || null, [orgs, selectedId]);

    useEffect(() => { fetchOverview(); }, []);

    useEffect(() => {
        if (!selectedOrg) return;
        setForm({
            name: selectedOrg.name || '',
            domain: selectedOrg.domain || '',
            logoUrl: selectedOrg.logoUrl || '',
            status: selectedOrg.status || 'active',
            moduleLabels: selectedOrg.moduleLabels || {},
            config: {
                businessType: selectedOrg.config?.businessType || 'transport',
                contactEmail: selectedOrg.config?.contactEmail || '',
                contactPhone: selectedOrg.config?.contactPhone || '',
                address: selectedOrg.config?.address || '',
                primaryColor: selectedOrg.config?.primaryColor || '#8b5cf6',
                accentColor: selectedOrg.config?.accentColor || '#6366f1',
                defaultPermissions: selectedOrg.config?.defaultPermissions || {},
                enabledModules: selectedOrg.config?.enabledModules || {},
                roleTemplates: selectedOrg.config?.roleTemplates || {},
                locations: selectedOrg.config?.locations || [],
                plan: selectedOrg.config?.plan || ''
            }
        });
    }, [selectedOrg?.id]);

    const fetchOverview = async () => {
        setLoading(true);
        setMessage({ type: '', text: '' });
        try {
            if (orgOnly) {
                // Org admin: fetch only their own org + users
                const [orgRes, usersRes] = await Promise.all([
                    ax.get('/org/'),
                    ax.get('/users')
                ]);
                const org = orgRes.data;
                const users = usersRes.data || [];
                const enriched = {
                    ...org,
                    users,
                    data: {},
                    permissionSummary: {
                        admins: users.filter(u => u.role === 'admin').length,
                        standardUsers: users.filter(u => u.role !== 'admin').length,
                        otpEnabled: users.filter(u => u.isOtpEnabled).length,
                        sandboxUsers: users.filter(u => u.isSandbox).length
                    }
                };
                setOrgs([enriched]);
                setSelectedId(org.id);
            } else {
                const res = await ax.get('/org/admin/overview');
                const list = res.data || [];
                setOrgs(list);
                const hasVgtc = list.some(org => org.id === 'vgtc');
                setSelectedId(prev => prev || (hasVgtc ? 'vgtc' : user?.orgId || list[0]?.id || 'vgtc'));
            }
        } catch (e) {
            setMessage({ type: 'error', text: e.response?.data?.error || 'Failed to load organizations' });
        } finally {
            setLoading(false);
        }
    };

    const patchConfig = (patch) => setForm(f => ({ ...f, config: { ...f.config, ...patch } }));
    const patchCreate = (patch) => setCreateForm(f => ({ ...f, ...patch }));
    const patchCreateConfig = (patch) => setCreateForm(f => ({ ...f, config: { ...f.config, ...patch } }));
    const patchCreateAdmin = (patch) => setCreateForm(f => ({ ...f, admin: { ...f.admin, ...patch } }));

    // Get available roles from org's roleTemplates + defaults
    const getOrgRoles = () => {
        const templates = form.config.roleTemplates || {};
        const roles = ['admin', 'user'];
        Object.keys(templates).forEach(r => { if (!roles.includes(r)) roles.push(r); });
        return roles;
    };

    // Derive plants/godowns for the selected org
    // VGTC uses hardcoded values; other orgs use their config.locations
    const VGTC_PLANTS = [['jksuper', 'JK Super'], ['jklakshmi', 'JK Lakshmi']];
    const VGTC_GODOWNS = [['kosli', 'Kosli'], ['jhajjar', 'Jhajjar']];

    const getOrgPlants = () => {
        if (selectedOrg?.id === 'vgtc') return VGTC_PLANTS;
        const locs = form.config.locations || [];
        const plants = locs.filter(l => l.type === 'plant').map(l => [l.id, l.label]);
        return plants;
    };
    const getOrgGodowns = () => {
        if (selectedOrg?.id === 'vgtc') return VGTC_GODOWNS;
        const locs = form.config.locations || [];
        const godowns = locs.filter(l => l.type === 'godown').map(l => [l.id, l.label]);
        return godowns;
    };

    // User management handlers
    const startEditUser = (u) => {
        setEditingUser(u.id);
        setUserForm({ name: u.name || '', username: u.username || '', password: '', email: u.email || '', role: u.role || 'user', permissions: u.permissions || {}, isOtpEnabled: !!u.isOtpEnabled, isSandbox: !!u.isSandbox });
        setShowUserCreate(false);
    };

    const startCreateUser = () => {
        setEditingUser(null);
        setUserForm({ name: '', username: '', password: '', email: '', role: 'user', permissions: form.config.defaultPermissions || {}, isOtpEnabled: false, isSandbox: false });
        setShowUserCreate(true);
    };

    const handleUserSave = async () => {
        setUserSaving(true);
        setMessage({ type: '', text: '' });
        try {
            if (editingUser) {
                const payload = { name: userForm.name, email: userForm.email, role: userForm.role, permissions: userForm.permissions, isOtpEnabled: userForm.isOtpEnabled, isSandbox: userForm.isSandbox };
                if (userForm.password) payload.password = userForm.password;
                await ax.patch(`/users/${editingUser}`, payload);
                setMessage({ type: 'success', text: 'User updated successfully' });
            } else {
                if (!userForm.username || !userForm.password || !userForm.name) {
                    setMessage({ type: 'error', text: 'Name, username, and password are required' });
                    setUserSaving(false);
                    return;
                }
                await ax.post('/users', userForm);
                setMessage({ type: 'success', text: 'User created successfully' });
            }
            setEditingUser(null);
            setShowUserCreate(false);
            await fetchOverview();
        } catch (e) {
            setMessage({ type: 'error', text: e.response?.data?.error || 'Failed to save user' });
        } finally {
            setUserSaving(false);
        }
    };

    const handleUserDelete = async (id) => {
        try {
            await ax.delete(`/users/${id}`);
            setMessage({ type: 'success', text: 'User deleted' });
            setDeleteConfirm(null);
            await fetchOverview();
        } catch (e) {
            setMessage({ type: 'error', text: e.response?.data?.error || 'Failed to delete user' });
        }
    };

    // Role template handlers
    const addRoleTemplate = () => {
        const name = newRoleName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
        if (!name || name === 'admin') return;
        const templates = { ...(form.config.roleTemplates || {}), [name]: {} };
        patchConfig({ roleTemplates: templates });
        setNewRoleName('');
        setEditingRole(name);
    };

    const updateRoleTemplate = (role, perms) => {
        const templates = { ...(form.config.roleTemplates || {}), [role]: perms };
        patchConfig({ roleTemplates: templates });
    };

    const deleteRoleTemplate = (role) => {
        const templates = { ...(form.config.roleTemplates || {}) };
        delete templates[role];
        patchConfig({ roleTemplates: templates });
        if (editingRole === role) setEditingRole(null);
    };

    // Audit trail
    const fetchAuditLog = async (offset = 0) => {
        setAuditLoading(true);
        try {
            const res = await ax.get(`/audit?limit=30&offset=${offset}`);
            const entries = res.data.entries || [];
            if (offset === 0) setAuditLog(entries); else setAuditLog(prev => [...prev, ...entries]);
            setAuditOffset(offset + entries.length);
            setAuditHasMore(entries.length >= 30);
        } catch (e) {
            // audit not available yet — silent fail
        } finally {
            setAuditLoading(false);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!selectedOrg) return;
        setSaving(true);
        setMessage({ type: '', text: '' });
        try {
            const res = await ax.patch(`/org/${selectedOrg.id}`, form);
            setOrgs(prev => prev.map(o => o.id === selectedOrg.id ? { ...o, ...res.data } : o));
            setMessage({ type: 'success', text: 'Organization updated successfully' });
            if (selectedOrg.id === user?.orgId && refreshUser) await refreshUser();
            await fetchOverview();
        } catch (e) {
            setMessage({ type: 'error', text: e.response?.data?.error || 'Failed to save organization' });
        } finally {
            setSaving(false);
        }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        setCreating(true);
        setMessage({ type: '', text: '' });
        try {
            const payload = {
                ...createForm,
                id: slugify(createForm.id || createForm.name),
                defaultPermissions: createForm.config.defaultPermissions,
                admin: createForm.admin.username ? createForm.admin : undefined
            };
            const res = await ax.post('/org', payload);
            setMessage({ type: 'success', text: `Organization ${res.data.org.name} created successfully` });
            setCreateForm(emptyCreateForm());
            setShowCreate(false);
            await fetchOverview();
            setSelectedId(res.data.org.id);
        } catch (e) {
            setMessage({ type: 'error', text: e.response?.data?.error || 'Failed to create organization' });
        } finally {
            setCreating(false);
        }
    };

    const setLabel = (key, value) => setForm(f => ({ ...f, moduleLabels: { ...f.moduleLabels, [key]: value } }));

    if (loading) return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px', color: 'var(--text-muted)' }}>
            <RefreshCw size={24} className="ani-spin" />
        </div>
    );

    // Determine which MODULE_KEYS to show (VGTC-specific vs generic)
    const isVgtcOrg = selectedOrg?.id === 'vgtc';
    const displayModuleKeys = isVgtcOrg ? MODULE_KEYS : PERMISSION_KEYS.map(k => ({ id: k, default: PERMISSION_LABELS[k] }));

    return (
        <div style={{ maxWidth: '1440px', margin: '0 auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: orgOnly ? '1fr' : '330px 1fr', gap: '24px', alignItems: 'start' }}>
                {!orgOnly && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div className="card" style={{ overflow: 'hidden' }}>
                        <SectionHeader
                            icon={Building2}
                            title="Organizations"
                            subtitle={`${orgs.length} configured`}
                            color="#f59e0b"
                            right={<button type="button" className="btn btn-p btn-sm" onClick={() => setShowCreate(v => !v)}><Plus size={13} /> New</button>}
                        />
                        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {orgs.map(org => {
                                const active = org.id === selectedOrg?.id;
                                return (
                                    <button key={org.id} type="button" onClick={() => setSelectedId(org.id)} style={{
                                        textAlign: 'left',
                                        padding: '14px',
                                        borderRadius: '12px',
                                        border: `1px solid ${active ? 'rgba(139,92,246,0.45)' : 'var(--border)'}`,
                                        background: active ? 'rgba(139,92,246,0.14)' : 'var(--bg-input)',
                                        color: 'var(--text)',
                                        cursor: 'pointer'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            {org.logoUrl ? <img src={org.logoUrl} alt="" style={{ width: '28px', height: '28px', objectFit: 'contain', borderRadius: '6px' }} /> : <Building2 size={22} />}
                                            <div style={{ minWidth: 0, flex: 1 }}>
                                                <div style={{ fontWeight: 900, fontSize: '13px', marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{org.name || org.id}</div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>ID: {org.id}</div>
                                            </div>
                                        </div>
                                        <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <input readOnly value={`${window.location.origin}/org/${org.id}`} onClick={e => { e.stopPropagation(); e.target.select(); navigator.clipboard?.writeText(e.target.value); }} style={{
                                                flex: 1, fontSize: '10px', fontFamily: 'monospace', padding: '5px 8px', borderRadius: '6px',
                                                background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-muted)',
                                                cursor: 'pointer', outline: 'none', minWidth: 0
                                            }} title="Click to copy" />
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {message.text && (
                        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} style={{
                            padding: '12px',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: 700,
                            background: message.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)',
                            color: message.type === 'success' ? '#10b981' : 'var(--danger)',
                            border: `1px solid ${message.type === 'success' ? 'rgba(16,185,129,0.2)' : 'rgba(244,63,94,0.2)'}`,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            {message.type === 'success' ? <Check size={14} /> : <Info size={14} />}
                            {message.text}
                        </motion.div>
                    )}
                </div>
                )}

                {/* Message for orgOnly mode */}
                {orgOnly && message.text && (
                    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} style={{
                        padding: '12px', borderRadius: '12px', fontSize: '12px', fontWeight: 700, marginBottom: '16px',
                        background: message.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)',
                        color: message.type === 'success' ? '#10b981' : 'var(--danger)',
                        border: `1px solid ${message.type === 'success' ? 'rgba(16,185,129,0.2)' : 'rgba(244,63,94,0.2)'}`,
                        display: 'flex', alignItems: 'center', gap: '8px'
                    }}>
                        {message.type === 'success' ? <Check size={14} /> : <Info size={14} />}
                        {message.text}
                    </motion.div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    {showCreate && !orgOnly && (
                        <form onSubmit={handleCreate} className="card">
                            <SectionHeader icon={Plus} title="Create Organization" subtitle="Provision branding, default access, and an optional first admin" color="#10b981" />
                            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                    <div className="field"><label>Organization Name *</label><IconInput icon={Type}><input className="fi" style={{ paddingLeft: '34px' }} value={createForm.name} onChange={e => patchCreate({ name: e.target.value, id: createForm.id || slugify(e.target.value) })} required /></IconInput></div>
                                    <div className="field"><label>Organization ID *</label><IconInput icon={Tag}><input className="fi" style={{ paddingLeft: '34px' }} value={createForm.id} onChange={e => patchCreate({ id: slugify(e.target.value) })} required /></IconInput></div>
                                    <div className="field"><label>Domain Name</label><IconInput icon={Globe}><input className="fi" style={{ paddingLeft: '34px' }} placeholder="company.com" value={createForm.domain} onChange={e => patchCreate({ domain: e.target.value })} /></IconInput></div>
                                    <div className="field"><label>Logo URL</label><IconInput icon={Image}><input className="fi" style={{ paddingLeft: '34px' }} placeholder="https://..." value={createForm.logoUrl} onChange={e => patchCreate({ logoUrl: e.target.value })} /></IconInput></div>
                                    <div className="field"><label>Contact Email</label><IconInput icon={Mail}><input className="fi" style={{ paddingLeft: '34px' }} value={createForm.config.contactEmail} onChange={e => patchCreateConfig({ contactEmail: e.target.value })} /></IconInput></div>
                                    <div className="field"><label>Contact Phone</label><IconInput icon={Phone}><input className="fi" style={{ paddingLeft: '34px' }} value={createForm.config.contactPhone} onChange={e => patchCreateConfig({ contactPhone: e.target.value })} /></IconInput></div>
                                    <div className="field" style={{ gridColumn: '1 / -1' }}><label>Address</label><IconInput icon={MapPin}><input className="fi" style={{ paddingLeft: '34px' }} value={createForm.config.address} onChange={e => patchCreateConfig({ address: e.target.value })} /></IconInput></div>
                                    <div className="field"><label>Primary Color</label><IconInput icon={Palette}><input className="fi" style={{ paddingLeft: '34px' }} type="color" value={createForm.config.primaryColor} onChange={e => patchCreateConfig({ primaryColor: e.target.value })} /></IconInput></div>
                                    <div className="field"><label>Accent Color</label><IconInput icon={Palette}><input className="fi" style={{ paddingLeft: '34px' }} type="color" value={createForm.config.accentColor} onChange={e => patchCreateConfig({ accentColor: e.target.value })} /></IconInput></div>
                                </div>

                                <div>
                                    <div style={{ fontSize: '13px', fontWeight: 900, marginBottom: '10px' }}>Default Organization Permissions</div>
                                    <PermissionEditor permissions={createForm.config.defaultPermissions} onChange={perms => patchCreateConfig({ defaultPermissions: perms })} plants={[]} godowns={[]} />
                                </div>

                                <div style={{ padding: '16px', borderRadius: '14px', border: '1px solid var(--border)', background: 'var(--bg-input)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 900, marginBottom: '14px' }}><UserPlus size={16} /> First Admin User</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
                                        <div className="field"><label>Name</label><IconInput icon={Users}><input className="fi" style={{ paddingLeft: '34px' }} value={createForm.admin.name} onChange={e => patchCreateAdmin({ name: e.target.value })} /></IconInput></div>
                                        <div className="field"><label>Username</label><IconInput icon={Tag}><input className="fi" style={{ paddingLeft: '34px' }} value={createForm.admin.username} onChange={e => patchCreateAdmin({ username: e.target.value.toLowerCase().replace(/\s/g, '') })} /></IconInput></div>
                                        <div className="field"><label>Password</label><IconInput icon={Lock}><input className="fi" style={{ paddingLeft: '34px' }} type="text" value={createForm.admin.password} onChange={e => patchCreateAdmin({ password: e.target.value })} /></IconInput></div>
                                        <div className="field"><label>Email</label><IconInput icon={Mail}><input className="fi" style={{ paddingLeft: '34px' }} value={createForm.admin.email} onChange={e => patchCreateAdmin({ email: e.target.value })} /></IconInput></div>
                                    </div>
                                    <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '12px', marginTop: '12px' }}>
                                        <input type="checkbox" checked={createForm.admin.isOtpEnabled} onChange={e => patchCreateAdmin({ isOtpEnabled: e.target.checked })} />
                                        Enable email OTP for first admin
                                    </label>
                                </div>

                                <button className="btn btn-p" type="submit" disabled={creating}>{creating ? <><RefreshCw size={15} className="ani-spin" /> Creating...</> : <><Plus size={15} /> Create Organization</>}</button>
                            </div>
                        </form>
                    )}

                    {selectedOrg && !showCreate && (<>
                        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            <div className="card">
                                <SectionHeader icon={Info} title="Organization Details" subtitle="Branding, domain, logo, and business profile" />
                                <div className="card-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 180px', gap: '14px', alignItems: 'end' }}>
                                    <div className="field"><label>Organization Name</label><IconInput icon={Type}><input className="fi" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={{ paddingLeft: '34px' }} required /></IconInput></div>
                                    <div className="field"><label>Domain Name</label><IconInput icon={Globe}><input className="fi" value={form.domain} onChange={e => setForm(f => ({ ...f, domain: e.target.value }))} style={{ paddingLeft: '34px' }} /></IconInput></div>
                                    <div className="field"><label>Status</label><select className="fi" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}><option value="active">Active</option><option value="paused">Paused</option><option value="archived">Archived</option></select></div>
                                    <div className="field" style={{ gridColumn: '1 / 3' }}><label>Logo URL</label><IconInput icon={Image}><input className="fi" value={form.logoUrl} onChange={e => setForm(f => ({ ...f, logoUrl: e.target.value }))} style={{ paddingLeft: '34px' }} /></IconInput></div>
                                    <button className="btn btn-p" type="submit" disabled={saving} style={{ height: '42px' }}>{saving ? <><RefreshCw size={15} className="ani-spin" /> Saving...</> : <><Save size={15} /> Save</>}</button>
                                    <div className="field"><label>Contact Email</label><IconInput icon={Mail}><input className="fi" value={form.config.contactEmail || ''} onChange={e => patchConfig({ contactEmail: e.target.value })} style={{ paddingLeft: '34px' }} /></IconInput></div>
                                    <div className="field"><label>Contact Phone</label><IconInput icon={Phone}><input className="fi" value={form.config.contactPhone || ''} onChange={e => patchConfig({ contactPhone: e.target.value })} style={{ paddingLeft: '34px' }} /></IconInput></div>
                                    <div className="field"><label>Business Type</label><input className="fi" value={form.config.businessType || ''} onChange={e => patchConfig({ businessType: e.target.value })} /></div>
                                    <div className="field"><label>Plan</label><input className="fi" placeholder="e.g. Free, Pro, Enterprise" value={form.config.plan || ''} onChange={e => patchConfig({ plan: e.target.value })} /></div>
                                    <div className="field"><label>Primary Color</label><input className="fi" type="color" value={form.config.primaryColor || '#8b5cf6'} onChange={e => patchConfig({ primaryColor: e.target.value })} /></div>
                                    <div className="field" style={{ gridColumn: '1 / -1' }}><label>Address</label><IconInput icon={MapPin}><input className="fi" value={form.config.address || ''} onChange={e => patchConfig({ address: e.target.value })} style={{ paddingLeft: '34px' }} /></IconInput></div>
                                </div>
                            </div>

                            <div className="card">
                                <SectionHeader icon={Database} title="Organization Data" subtitle="Data is counted separately by organization" color="#10b981" />
                                <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '12px' }}>
                                    {Object.entries(selectedOrg.data || {}).map(([key, item]) => (
                                        <div key={key} style={{ padding: '16px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-input)' }}>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>{item.label}</div>
                                            <div style={{ fontSize: '26px', fontWeight: 900, color: 'var(--text)' }}>{item.count}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Role Templates */}
                            <div className="card">
                                <SectionHeader icon={ShieldCheck} title="Role Templates" subtitle="Define custom roles with preset permissions for this organization" color="#8b5cf6"
                                    right={<div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <input className="fi" placeholder="New role name" value={newRoleName} onChange={e => setNewRoleName(e.target.value)} style={{ height: '32px', fontSize: '12px', width: '140px' }} onKeyDown={e => e.key === 'Enter' && addRoleTemplate()} />
                                        <button type="button" className="btn btn-p btn-sm" onClick={addRoleTemplate} disabled={!newRoleName.trim()}><Plus size={13} /> Add</button>
                                    </div>}
                                />
                                <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {Object.entries(form.config.roleTemplates || {}).length === 0 && (
                                        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>No custom roles defined. Add a role above to get started.</div>
                                    )}
                                    {Object.entries(form.config.roleTemplates || {}).map(([role, perms]) => (
                                        <div key={role} style={{ padding: '16px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-input)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: editingRole === role ? '12px' : 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontSize: '13px', fontWeight: 900, textTransform: 'capitalize' }}>{role}</span>
                                                    <PermissionChips permissions={perms} />
                                                </div>
                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                    <button type="button" onClick={() => setEditingRole(editingRole === role ? null : role)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}>
                                                        {editingRole === role ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                    </button>
                                                    <button type="button" onClick={() => deleteRoleTemplate(role)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '4px' }}><Trash2 size={14} /></button>
                                                </div>
                                            </div>
                                            {editingRole === role && (
                                                <PermissionEditor permissions={perms} onChange={p => updateRoleTemplate(role, p)} plants={getOrgPlants()} godowns={getOrgGodowns()} />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Users & Permissions */}
                            <div className="card">
                                <SectionHeader icon={Users} title="Users & Permissions" subtitle="Manage users for this organization" color="#6366f1"
                                    right={<button type="button" className="btn btn-p btn-sm" onClick={startCreateUser}><UserPlus size={13} /> Add User</button>}
                                />
                                <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(120px, 1fr))', gap: '12px' }}>
                                    {[['Admins', selectedOrg.permissionSummary?.admins || 0], ['Users', selectedOrg.permissionSummary?.standardUsers || 0], ['OTP Enabled', selectedOrg.permissionSummary?.otpEnabled || 0], ['Sandbox', selectedOrg.permissionSummary?.sandboxUsers || 0]].map(([label, count]) => (
                                        <div key={label} style={{ padding: '14px', borderRadius: '12px', background: 'var(--bg-input)', border: '1px solid var(--border)' }}><div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 800 }}>{label}</div><div style={{ fontSize: '22px', fontWeight: 900 }}>{count}</div></div>
                                    ))}
                                </div>
                                <div style={{ padding: '0 24px 24px' }}>
                                    <div style={{ fontSize: '13px', fontWeight: 900, marginBottom: '10px' }}>Default Permissions For New Users</div>
                                    <PermissionEditor permissions={form.config.defaultPermissions || {}} onChange={perms => patchConfig({ defaultPermissions: perms })} plants={getOrgPlants()} godowns={getOrgGodowns()} />
                                </div>

                                {/* User Create/Edit Form */}
                                {(showUserCreate || editingUser) && (
                                    <div style={{ padding: '0 24px 24px' }}>
                                        <div style={{ padding: '20px', borderRadius: '14px', border: '1px solid var(--border)', background: 'var(--bg-input)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                                <div style={{ fontSize: '13px', fontWeight: 900 }}>{editingUser ? 'Edit User' : 'Create New User'}</div>
                                                <button type="button" onClick={() => { setEditingUser(null); setShowUserCreate(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={16} /></button>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                                                <div className="field"><label>Name *</label><input className="fi" value={userForm.name} onChange={e => setUserForm(f => ({ ...f, name: e.target.value }))} required /></div>
                                                <div className="field"><label>Username {editingUser ? '(readonly)' : '*'}</label><input className="fi" value={userForm.username} onChange={e => setUserForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') }))} disabled={!!editingUser} required={!editingUser} /></div>
                                                <div className="field"><label>{editingUser ? 'New Password (leave blank to keep)' : 'Password *'}</label><input className="fi" type="text" value={userForm.password} onChange={e => setUserForm(f => ({ ...f, password: e.target.value }))} required={!editingUser} /></div>
                                                <div className="field"><label>Email</label><input className="fi" value={userForm.email} onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))} /></div>
                                                <div className="field">
                                                    <label>Role</label>
                                                    <select className="fi" value={userForm.role} onChange={e => {
                                                        const newRole = e.target.value;
                                                        const templates = form.config.roleTemplates || {};
                                                        const newPerms = templates[newRole] ? { ...templates[newRole] } : userForm.permissions;
                                                        setUserForm(f => ({ ...f, role: newRole, permissions: newPerms }));
                                                    }}>
                                                        {getOrgRoles().map(r => <option key={r} value={r}>{r}</option>)}
                                                    </select>
                                                </div>
                                                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                                    <label style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '12px' }}>
                                                        <input type="checkbox" checked={userForm.isOtpEnabled} onChange={e => setUserForm(f => ({ ...f, isOtpEnabled: e.target.checked }))} /> OTP
                                                    </label>
                                                    <label style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '12px' }}>
                                                        <input type="checkbox" checked={userForm.isSandbox} onChange={e => setUserForm(f => ({ ...f, isSandbox: e.target.checked }))} /> Sandbox
                                                    </label>
                                                </div>
                                            </div>
                                            {userForm.role !== 'admin' && (
                                                <div style={{ marginBottom: '14px' }}>
                                                    <div style={{ fontSize: '12px', fontWeight: 800, marginBottom: '8px' }}>Custom Permissions</div>
                                                    <PermissionEditor permissions={userForm.permissions} onChange={p => setUserForm(f => ({ ...f, permissions: p }))} plants={getOrgPlants()} godowns={getOrgGodowns()} />
                                                </div>
                                            )}
                                            <button type="button" className="btn btn-p" onClick={handleUserSave} disabled={userSaving} style={{ width: '100%' }}>
                                                {userSaving ? <><RefreshCw size={14} className="ani-spin" /> Saving...</> : <><Save size={14} /> {editingUser ? 'Update User' : 'Create User'}</>}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Users table */}
                                <div style={{ overflowX: 'auto', padding: '0 24px 24px' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '860px' }}>
                                        <thead><tr>{['User', 'Role', 'Email', 'Security', 'Permissions', 'Actions'].map(h => <th key={h} style={{ textAlign: 'left', padding: '12px', color: 'var(--text-muted)', fontSize: '11px', borderBottom: '1px solid var(--border)' }}>{h}</th>)}</tr></thead>
                                        <tbody>
                                            {(selectedOrg.users || []).map(u => (
                                                <tr key={u.id} style={{ background: editingUser === u.id ? 'rgba(139,92,246,0.06)' : 'transparent' }}>
                                                    <td style={{ padding: '12px', borderBottom: '1px solid var(--border-row)' }}><div style={{ fontWeight: 800 }}>{u.name}</div><div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>@{u.username}</div></td>
                                                    <td style={{ padding: '12px', borderBottom: '1px solid var(--border-row)' }}>
                                                        <span style={{ fontSize: '11px', fontWeight: 800, padding: '3px 8px', borderRadius: '6px', background: u.role === 'admin' ? 'rgba(239,68,68,0.1)' : 'rgba(139,92,246,0.1)', color: u.role === 'admin' ? '#ef4444' : '#8b5cf6' }}>{u.role}</span>
                                                    </td>
                                                    <td style={{ padding: '12px', borderBottom: '1px solid var(--border-row)', color: 'var(--text-muted)', fontSize: '12px' }}>{u.email || '-'}</td>
                                                    <td style={{ padding: '12px', borderBottom: '1px solid var(--border-row)', fontSize: '12px' }}>{u.isOtpEnabled ? 'OTP' : 'Password'}{u.isSandbox ? ' / Sandbox' : ''}</td>
                                                    <td style={{ padding: '12px', borderBottom: '1px solid var(--border-row)' }}><PermissionChips permissions={u.permissions} /></td>
                                                    <td style={{ padding: '12px', borderBottom: '1px solid var(--border-row)' }}>
                                                        <div style={{ display: 'flex', gap: '6px' }}>
                                                            <button type="button" onClick={() => startEditUser(u)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8b5cf6', padding: '4px' }} title="Edit"><Pencil size={14} /></button>
                                                            {u.id !== user?.id && (
                                                                deleteConfirm === u.id ? (
                                                                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                                                        <button type="button" onClick={() => handleUserDelete(u.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: '11px', fontWeight: 800 }}>Confirm</button>
                                                                        <button type="button" onClick={() => setDeleteConfirm(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '11px' }}>Cancel</button>
                                                                    </div>
                                                                ) : (
                                                                    <button type="button" onClick={() => setDeleteConfirm(u.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '4px' }} title="Delete"><Trash2 size={14} /></button>
                                                                )
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="card">
                                <SectionHeader icon={ToggleRight} title="Module Toggles" subtitle="Enable or disable modules for this organization" color="#f59e0b" />
                                <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
                                    {PERMISSION_KEYS.map(key => {
                                        const enabled = form.config.enabledModules?.[key] !== false;
                                        return (
                                            <label key={key} style={{
                                                display: 'flex', alignItems: 'center', gap: '10px', padding: '12px',
                                                borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-input)',
                                                cursor: 'pointer', transition: 'all 0.15s',
                                                opacity: enabled ? 1 : 0.5
                                            }}>
                                                <input type="checkbox" checked={enabled} onChange={e => {
                                                    const next = { ...(form.config.enabledModules || {}) };
                                                    if (e.target.checked) delete next[key]; else next[key] = false;
                                                    patchConfig({ enabledModules: next });
                                                }} />
                                                <div>
                                                    <div style={{ fontSize: '12px', fontWeight: 800 }}>{PERMISSION_LABELS[key]}</div>
                                                    <div style={{ fontSize: '10px', color: enabled ? '#10b981' : 'var(--text-muted)' }}>{enabled ? 'Enabled' : 'Disabled'}</div>
                                                </div>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="card">
                                <SectionHeader icon={Layout} title="Module Labels" subtitle="Labels are saved separately for the selected organization" />
                                <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                                    {displayModuleKeys.map(m => (
                                        <div key={m.id} className="field"><label style={{ fontSize: '11px', opacity: 0.7 }}>{m.default}</label><IconInput icon={Tag}><input className="fi" placeholder={m.default} value={form.moduleLabels[m.id] || ''} onChange={e => setLabel(m.id, e.target.value)} style={{ paddingLeft: '34px' }} /></IconInput></div>
                                    ))}
                                </div>
                            </div>
                        </form>

                        {/* Audit Trail — outside form since it's read-only */}
                        <div className="card">
                            <SectionHeader icon={History} title="Audit Trail" subtitle="Recent admin actions with before/after changes" color="#f97316"
                                right={<button type="button" className="btn btn-sm" onClick={() => fetchAuditLog(0)} disabled={auditLoading} style={{ fontSize: '11px' }}>
                                    {auditLoading ? <RefreshCw size={12} className="ani-spin" /> : <RefreshCw size={12} />} Load
                                </button>}
                            />
                            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {auditLog.length === 0 && !auditLoading && (
                                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>Click "Load" to fetch the audit trail, or no entries found.</div>
                                )}
                                {auditLog.map((entry, i) => {
                                    const isExpanded = expandedAudit === i;
                                    const actionColors = {
                                        USER_CREATED: '#10b981', USER_UPDATED: '#6366f1', USER_DELETED: '#ef4444',
                                        ORG_UPDATED: '#f59e0b', PERMISSIONS_CHANGED: '#8b5cf6', ROLE_CHANGED: '#14b8a6', MODULE_TOGGLED: '#f97316'
                                    };
                                    const color = actionColors[entry.action] || '#6366f1';
                                    return (
                                        <div key={entry.id || i} style={{ padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-input)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: entry.diff ? 'pointer' : 'default' }}
                                                onClick={() => entry.diff && setExpandedAudit(isExpanded ? null : i)}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <span style={{ fontSize: '10px', fontWeight: 800, padding: '3px 8px', borderRadius: '6px', background: `${color}18`, color, whiteSpace: 'nowrap' }}>
                                                        {(entry.action || '').replace(/_/g, ' ')}
                                                    </span>
                                                    <span style={{ fontSize: '12px', fontWeight: 700 }}>{entry.performedByName}</span>
                                                    {entry.targetId && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>on {entry.targetType} {entry.targetId.slice(0, 8)}</span>}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{new Date(entry.timestamp).toLocaleString()}</span>
                                                    {entry.diff && (isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                                                </div>
                                            </div>
                                            {isExpanded && entry.diff && (
                                                <div style={{ marginTop: '10px', padding: '10px', borderRadius: '8px', background: 'var(--bg)', fontSize: '11px', fontFamily: 'monospace', overflowX: 'auto' }}>
                                                    {Object.entries(entry.diff).map(([key, { before, after }]) => (
                                                        <div key={key} style={{ marginBottom: '6px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                                            <span style={{ fontWeight: 800, color: 'var(--text)', minWidth: '100px' }}>{key}:</span>
                                                            <span style={{ color: '#ef4444', textDecoration: 'line-through' }}>{typeof before === 'object' ? JSON.stringify(before) : String(before ?? 'null')}</span>
                                                            <span style={{ color: 'var(--text-muted)' }}>&rarr;</span>
                                                            <span style={{ color: '#10b981' }}>{typeof after === 'object' ? JSON.stringify(after) : String(after ?? 'null')}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                                {auditHasMore && (
                                    <button type="button" className="btn btn-sm" onClick={() => fetchAuditLog(auditOffset)} disabled={auditLoading} style={{ alignSelf: 'center', fontSize: '11px', marginTop: '8px' }}>
                                        {auditLoading ? 'Loading...' : 'Load More'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </>)}
                </div>
            </div>
        </div>
    );
}
