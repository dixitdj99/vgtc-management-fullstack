import React from 'react';
import { motion } from 'framer-motion';
import { 
  Receipt, FileText, BarChart3, BookOpen, Package, 
  Truck, Fuel, LayoutDashboard, ChevronRight, ArrowRight
} from 'lucide-react';

const MODULES = [
  {
    title: 'JK Super (General)',
    plant: 'jksuper',
    color: '#6366f1',
    items: [
      { id: 'lr_dump', label: 'Loading Receipt', Icon: Receipt, desc: 'Manage truck loading & LR entries' },
      { id: 'voucher_dump', label: 'Vouchers', Icon: FileText, desc: 'Expense & payment vouchers', sub: ['Dump', 'JK_Super'] },
      { id: 'balance_dump', label: 'Balance Sheets', Icon: BarChart3, desc: 'Vehicle-wise payment tracking', sub: ['Dump', 'JK_Super'] },
      { id: 'stock_dump', label: 'Dump Stock', Icon: Package, desc: 'Inventory & challan management', sub: ['overview', 'history'] },
      { id: 'cashbook_dump', label: 'Cashbook', Icon: BookOpen, desc: 'Ledgers & online advances', sub: ['ledger', 'online'] },
      { id: 'vehicles_dump', label: 'Vehicles', Icon: Truck, desc: 'Fleet information' },
      { id: 'diesel_dump', label: 'Diesel Control', Icon: Fuel, desc: 'Fuel reconciliation' },
    ]
  },
  {
    title: 'JK Lakshmi',
    plant: 'jklakshmi',
    color: '#f59e0b',
    items: [
      { id: 'lr_jkl', label: 'Loading Receipt', Icon: Receipt, desc: 'Manage truck loading & LR entries' },
      { id: 'voucher_jkl', label: 'Vouchers', Icon: FileText, desc: 'Expense & payment vouchers', sub: ['Dump', 'JK_Lakshmi'] },
      { id: 'balance_jkl', label: 'Balance Sheets', Icon: BarChart3, desc: 'Vehicle-wise payment tracking', sub: ['Dump', 'JK_Lakshmi'] },
      { id: 'stock_jkl', label: 'JKL Stock', Icon: Package, desc: 'Inventory & challan management', sub: ['overview', 'history'] },
      { id: 'cashbook_jkl', label: 'Cashbook', Icon: BookOpen, desc: 'Ledgers & online advances', sub: ['ledger', 'online'] },
      { id: 'vehicles_jkl', label: 'Vehicles', Icon: Truck, desc: 'Fleet information' },
      { id: 'diesel_jkl', label: 'Diesel Control', Icon: Fuel, desc: 'Fuel reconciliation' },
    ]
  }
];

export default function DashboardModule({ onNavigate }) {
  return (
    <div className="page-container" style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div className="page-hd" style={{ marginBottom: '30px' }}>
        <div>
          <h1><LayoutDashboard size={22} color="#6366f1" /> System Dashboard</h1>
          <p>Centralized access to all plant modules and operations</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
        {MODULES.map((section) => (
          <div key={section.plant}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '12px', 
              marginBottom: '20px',
              paddingBottom: '10px',
              borderBottom: `2px solid ${section.color}20`
            }}>
              <div style={{ 
                width: '10px', 
                height: '10px', 
                borderRadius: '50%', 
                background: section.color 
              }} />
              <h2 style={{ fontSize: '18px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text)' }}>
                {section.title}
              </h2>
            </div>

            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
              gap: '16px' 
            }}>
              {section.items.map((m) => (
                <motion.div 
                  key={m.id}
                  whileHover={{ y: -4, boxShadow: '0 12px 30px rgba(0,0,0,0.12)' }}
                  onClick={() => onNavigate(section.plant, m.id, m.sub ? m.sub[0] : '')}
                  style={{ 
                    background: 'var(--bg-card)', 
                    border: '1px solid var(--border)', 
                    borderRadius: '16px', 
                    padding: '20px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                >
                  <div style={{ 
                    width: '40px', 
                    height: '40px', 
                    borderRadius: '12px', 
                    background: `${section.color}15`, 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center' 
                  }}>
                    <m.Icon size={20} color={section.color} />
                  </div>

                  <div>
                    <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)', marginBottom: '4px' }}>{m.label}</h3>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.4 }}>{m.desc}</p>
                  </div>

                  {m.sub && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                      {m.sub.map(s => (
                        <span key={s} style={{ 
                          fontSize: '10px', 
                          fontWeight: 700, 
                          background: 'var(--bg-th)', 
                          color: 'var(--text-sub)', 
                          padding: '2px 8px', 
                          borderRadius: '4px',
                          textTransform: 'capitalize'
                        }}>
                          {s.replace('_', ' ')}
                        </span>
                      ))}
                    </div>
                  )}

                  <div style={{ 
                    position: 'absolute', 
                    right: '20px', 
                    top: '20px', 
                    opacity: 0.3 
                  }}>
                    <ArrowRight size={16} />
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
