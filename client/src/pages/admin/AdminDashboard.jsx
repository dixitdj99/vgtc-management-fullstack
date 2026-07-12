import React, { useState, useEffect } from 'react';
import { Users, Truck, Server, HardDrive, ShieldCheck, Activity, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import ax from '../../api';

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    users: 0,
    labour: 0,
    vehicles: 0,
    selfVehiclesList: [],
    loading: true
  });

  const parseJson = (str) => {
    try {
      return typeof str === 'string' ? JSON.parse(str) : (str || {});
    } catch {
      return {};
    }
  };

  const getElapsedMonths = (startStr, dayVal) => {
    if (!startStr) return 0;
    const start = new Date(startStr);
    if (isNaN(start.getTime())) return 0;
    const today = new Date();
    let m = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth());
    const dVal = parseInt(dayVal) || start.getDate();
    if (today.getDate() < dVal) m--;
    return Math.max(0, m);
  };

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [uRes, lRes, vRes] = await Promise.all([
          ax.get('/users').catch(() => ({ data: [] })),
          ax.get('/labour/workers').catch(() => ({ data: [] })),
          ax.get('/vehicles').catch(() => ({ data: [] }))
        ]);
        const allVehicles = vRes.data || [];
        const selfList = allVehicles.filter(v => v.ownershipType === 'self');
        setStats({
          users: uRes.data.length || 0,
          labour: lRes.data.length || 0,
          vehicles: allVehicles.length || 0,
          selfVehiclesList: selfList,
          loading: false
        });
      } catch (err) {
        setStats(s => ({ ...s, loading: false }));
      }
    };
    fetchStats();
  }, []);

  const StatCard = ({ icon: Icon, label, value, color, delay }) => (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }} style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', padding: '24px',
      display: 'flex', alignItems: 'center', gap: '20px', position: 'relative', overflow: 'hidden'
    }}>
      <div style={{
        position: 'absolute', top: '-20%', right: '-10%', width: '150px', height: '150px',
        background: `radial-gradient(circle, ${color}25 0%, transparent 70%)`, filter: 'blur(20px)'
      }} />
      <div style={{
        width: '56px', height: '56px', borderRadius: '16px', background: `${color}15`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: color, flexShrink: 0,
        boxShadow: `inset 0 0 20px ${color}10`
      }}>
        <Icon size={26} />
      </div>
      <div>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>{label}</div>
        <div style={{ fontSize: '32px', fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.03em', lineHeight: 1 }}>
          {stats.loading ? <span style={{ opacity: 0.2 }}>--</span> : value}
        </div>
      </div>
    </motion.div>
  );

  return (
    <div style={{ paddingBottom: '40px' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 900, color: 'var(--text)', margin: '0 0 8px 0', letterSpacing: '-0.02em' }}>System Overview</h1>
        <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-muted)' }}>Real-time statistics and system health indicators.</p>
      </div>

      {/* Top Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px', marginBottom: '32px' }}>
        <StatCard icon={Users} label="Total Accounts" value={stats.users} color="#6366f1" delay={0.1} />
        <StatCard icon={Truck} label="Total Vehicles" value={stats.vehicles} color="#06b6d4" delay={0.2} />
        <StatCard icon={Truck} label="Self Owned Fleet" value={stats.selfVehiclesList.length} color="#f59e0b" delay={0.3} />
        <StatCard icon={ShieldCheck} label="System Status" value="Online" color="#10b981" delay={0.4} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
        {/* Activity or Info Panel */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--text)' }}>System Information</h3>
            <Activity size={16} color="var(--primary)" />
          </div>
          <div style={{ padding: '24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {[
                { l: 'Environment', v: 'Production Serverless' },
                { l: 'Database', v: 'Firestore / Firebase' },
                { l: 'Auth Provider', v: 'JWT & Local Config' },
                { l: 'Backup Driver', v: 'Google Drive API' }
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '16px', borderBottom: i === 3 ? 'none' : '1px solid var(--border)' }}>
                  <div style={{ fontSize: '14px', color: 'var(--text-muted)', fontWeight: 600 }}>{item.l}</div>
                  <div style={{ fontSize: '14px', color: 'var(--text)', fontWeight: 800 }}>{item.v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--text)' }}>System Logs</h3>
          </div>
          <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>
              No critical alerts reported.
              <br /><br />
              <ShieldCheck size={32} color="#10b981" style={{ opacity: 0.5 }} />
            </div>
          </div>
        </div>
      </div>

      {/* Self Owned Fleet section */}
      <div style={{ marginTop: '32px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text)' }}>Self-Owned Fleet & Financing Overview</h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>EMI repayments, outstanding loans, and vehicle details.</p>
          </div>
          <Truck size={18} color="var(--primary)" />
        </div>
        <div style={{ padding: '24px' }}>
          {stats.loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '13px' }}>Loading fleet data...</div>
          ) : stats.selfVehiclesList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '13px' }}>No self-owned vehicles registered.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px', minWidth: '700px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Vehicle Details</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Brand / Model</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Monthly EMI</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>EMI Progress</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Outstanding Loan</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Loan Bank</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.selfVehiclesList.map((v, idx) => {
                    const emi = parseJson(v.emiDetails);
                    const schedule = emi.schedule || [];
                    const todayStr = new Date().toISOString().slice(0, 10);
                    
                    const elapsed = getElapsedMonths(emi.startDate, emi.emiDay);
                    const schedulePaid = schedule.filter(item => item.status === 'paid' || item.dueDate <= todayStr).length;
                    const paidCount = schedule.length > 0
                      ? schedulePaid
                      : Math.max(elapsed, (emi.paidEmis || []).length);
                      
                    const totalTenure = parseInt(emi.tenure) || 0;
                    const pendingEmis = Math.max(0, totalTenure - paidCount);
                    const monthlyEmi = parseFloat(emi.due) || 0;
                    const outstanding = pendingEmis * monthlyEmi;

                    const hasLoan = !!emi.loanNo;

                    return (
                      <tr key={v.id} style={{ borderBottom: idx === stats.selfVehiclesList.length - 1 ? 'none' : '1px solid var(--border)', background: idx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                        <td style={{ padding: '14px 16px', fontWeight: 800, color: 'var(--text)' }}>
                          <span style={{ background: 'var(--primary-light)', color: 'var(--primary)', padding: '4px 8px', borderRadius: '6px', fontSize: '12.5px', fontFamily: 'monospace', border: '1px solid var(--border)' }}>
                            {v.truckNo}
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px', color: 'var(--text-sub)', fontWeight: 600 }}>
                          {v.make ? `${v.make} ${v.model || ''}` : '—'}
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 700, color: '#3b82f6' }}>
                          {hasLoan && monthlyEmi > 0 ? `₹${monthlyEmi.toLocaleString()}` : '—'}
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                          {hasLoan && totalTenure > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                              <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text)' }}>
                                {paidCount} / {totalTenure} EMI
                              </span>
                              <div style={{ width: '80px', height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ width: `${(paidCount / totalTenure) * 100}%`, height: '100%', background: '#10b981', borderRadius: '3px' }} />
                              </div>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>No Active Loan</span>
                          )}
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 800, color: pendingEmis > 0 ? '#ef4444' : 'var(--text-muted)' }}>
                          {hasLoan && outstanding > 0 ? `₹${outstanding.toLocaleString()}` : '—'}
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'center', color: 'var(--text-sub)', fontWeight: 700 }}>
                          {hasLoan ? (emi.bankName || 'N/A') : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
