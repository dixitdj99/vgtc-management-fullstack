import React, { useState, useEffect } from 'react';
import { Users, Truck, Server, HardDrive, ShieldCheck, Activity, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import ax from '../../api';

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    users: 0,
    labour: 0,
    vehicles: 0,
    vouchers: 0,
    loading: true
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [uRes, lRes, vRes] = await Promise.all([
          ax.get('/users').catch(() => ({ data: [] })),
          ax.get('/labour/workers').catch(() => ({ data: [] })),
          ax.get('/vehicles/kosli').catch(() => ({ data: [] })) // Approximating total vehicles by fetching one dump, ideally we'd have a global stat endpoint
        ]);
        setStats({
          users: uRes.data.length || 0,
          labour: lRes.data.length || 0,
          vehicles: vRes.data.length || 0,
          vouchers: 0, // Placeholder
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
        <StatCard icon={Truck} label="Labour Workers" value={stats.labour} color="#f59e0b" delay={0.2} />
        <StatCard icon={Server} label="System Status" value="Online" color="#10b981" delay={0.3} />
        <StatCard icon={ShieldCheck} label="Security Level" value="High" color="#8b5cf6" delay={0.4} />
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
    </div>
  );
}
