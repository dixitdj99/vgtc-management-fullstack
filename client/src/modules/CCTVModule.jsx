import React, { useState, useEffect } from 'react';
import { Camera, RefreshCw, ShieldAlert, Cpu, Grid, Layout, ChevronRight, Video, Wifi, WifiOff } from 'lucide-react';

const CONFIG = {
  deviceSerial: 'L52878421',
  accessToken: 'at.cjddr8v245rwdda2a8f4pu738tq5bg4j-2rvpjeed1m-011x2lh-9jdn09opj',
};

const CAMERAS = [
  { id: 1, name: 'Office Indoor', ch: 1 },
  { id: 2, name: 'Godown', ch: 2 },
  { id: 3, name: 'camera 20', ch: 20 },
  { id: 4, name: 'Stairs', ch: 3 },
  { id: 5, name: 'Godown Side', ch: 4 },
  { id: 6, name: 'Godown Front', ch: 5 },
  { id: 7, name: 'Parking', ch: 6 },
  { id: 8, name: 'Office Outdoor', ch: 7 },
  { id: 9, name: 'Camera 08', ch: 8 },
  { id: 10, name: 'EZVIZ', ch: 9 },
];

export default function CCTVModule() {
  const [activeCam, setActiveCam] = useState(CAMERAS[0]);
  const [viewMode, setViewMode] = useState('single'); // 'single' or 'grid'
  const [isHD, setIsHD] = useState(true);
  const [server, setServer] = useState('open'); // 'open' or 'open-as'
  const [refreshKey, setRefreshKey] = useState(0);

  const getStreamUrl = (channel) => {
    return `https://${server}.ezvizlife.com/live?deviceSerial=${CONFIG.deviceSerial}&channelNo=${channel}&accessToken=${CONFIG.accessToken}&type=hls&hd=${isHD ? 1 : 0}`;
  };

  const CameraItem = ({ cam, isActive, onClick }) => (
    <button
      onClick={() => onClick(cam)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px',
        borderRadius: '10px', border: '1px solid',
        borderColor: isActive ? 'var(--accent)' : 'transparent',
        background: isActive ? 'var(--accent)15' : 'transparent',
        color: isActive ? 'var(--accent)' : 'var(--text-sub)',
        cursor: 'pointer', transition: 'all 0.2s', textAlign: 'left', marginBottom: '4px'
      }}
    >
      <div style={{ 
        width: '32px', height: '32px', borderRadius: '8px', 
        background: isActive ? 'var(--accent)25' : 'var(--bg-input)',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <Video size={16} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '12.5px', fontWeight: 700 }}>{cam.name}</div>
        <div style={{ fontSize: '10px', opacity: 0.7 }}>Channel {cam.ch}</div>
      </div>
      {isActive && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 8px var(--accent)' }} />}
    </button>
  );

  return (
    <div className="module-content" style={{ padding: '0', display: 'flex', height: 'calc(100vh - 100px)', overflow: 'hidden' }}>
      
      {/* ── Left Sidebar (Camera List) ── */}
      <div style={{ 
        width: '280px', borderRight: '1px solid var(--border)', 
        background: 'var(--bg-card)', padding: '20px', display: 'flex', 
        flexDirection: 'column', gap: '20px', overflowY: 'auto'
      }}>
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text)', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Camera size={18} color="var(--accent)" /> CAMERAS
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {CAMERAS.map(cam => (
              <CameraItem 
                key={cam.id} 
                cam={cam} 
                isActive={activeCam.id === cam.id && viewMode === 'single'} 
                onClick={(c) => { setActiveCam(c); setViewMode('single'); }} 
              />
            ))}
          </div>
        </div>

        <div style={{ marginTop: 'auto', padding: '15px', borderRadius: '12px', background: 'rgba(0,0,0,0.03)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '10px', textTransform: 'uppercase' }}>System Status</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', fontSize: '12px', fontWeight: 700 }}>
                <Wifi size={14} /> Link Ready
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '8px', lineHeight: 1.4 }}>
                Status: Monitoring Active via {server.toUpperCase()}
            </div>
        </div>
      </div>

      {/* ── Main View Area ── */}
      <div style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', background: 'rgba(0,0,0,0.01)' }}>
        
        {/* Header / Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: 'var(--text)' }}>
                {viewMode === 'grid' ? 'Multi-Camera Grid' : activeCam.name}
            </h2>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                {viewMode === 'grid' ? 'Showing top 4 critical feeds' : `Live Monitoring • Device L52878421 • Channel ${activeCam.ch}`}
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ display: 'flex', background: 'var(--bg-input)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                <button 
                  onClick={() => setViewMode('single')}
                  style={{ 
                    padding: '6px 12px', borderRadius: '8px', border: 'none', 
                    background: viewMode === 'single' ? 'var(--bg-card)' : 'transparent',
                    color: viewMode === 'single' ? 'var(--accent)' : 'var(--text-muted)',
                    fontSize: '11px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                  }}>
                    <Layout size={14} /> Single
                </button>
                <button 
                  onClick={() => setViewMode('grid')}
                  style={{ 
                    padding: '6px 12px', borderRadius: '8px', border: 'none', 
                    background: viewMode === 'grid' ? 'var(--bg-card)' : 'transparent',
                    color: viewMode === 'grid' ? 'var(--accent)' : 'var(--text-muted)',
                    fontSize: '11px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                  }}>
                    <Grid size={14} /> Grid
                </button>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-g btn-sm" onClick={() => setServer(s => s === 'open' ? 'open-as' : 'open')} title="Toggle Region">
                    {server === 'open' ? 'Global' : 'Asia'}
                </button>
                <button className={`btn btn-sm ${isHD ? 'btn-p' : 'btn-g'}`} onClick={() => setIsHD(!isHD)}>
                    {isHD ? 'HD' : 'STD'}
                </button>
                <button className="btn btn-g btn-sm" onClick={() => setRefreshKey(k => k + 1)}>
                    <RefreshCw size={14} />
                </button>
            </div>
          </div>
        </div>

        {/* Video Player Area */}
        {viewMode === 'single' ? (
          <div className="card" style={{ flex: 1, padding: '10px', background: '#000', borderRadius: '20px', overflow: 'hidden', position: 'relative' }}>
            <iframe
              key={`${activeCam.ch}-${refreshKey}-${server}`}
              src={getStreamUrl(activeCam.ch)}
              width="100%"
              height="100%"
              style={{ border: 'none', borderRadius: '12px' }}
              allowFullScreen
              allow="autoplay; fullscreen"
            />
          </div>
        ) : (
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: '15px' }}>
            {CAMERAS.slice(0, 4).map(cam => (
              <div key={cam.id} className="card" style={{ padding: '6px', background: '#000', borderRadius: '16px', overflow: 'hidden', position: 'relative' }}>
                <div style={{ position: 'absolute', top: '15px', left: '15px', zIndex: 10, background: 'rgba(0,0,0,0.6)', padding: '4px 10px', borderRadius: '6px', color: 'white', fontSize: '10px', fontWeight: 700, backdropFilter: 'blur(4px)' }}>
                    {cam.name}
                </div>
                <iframe
                  key={`${cam.ch}-${refreshKey}-${server}`}
                  src={getStreamUrl(cam.ch)}
                  width="100%"
                  height="100%"
                  style={{ border: 'none', borderRadius: '10px' }}
                  allow="autoplay; fullscreen"
                />
              </div>
            ))}
          </div>
        )}

        {/* Info Strip */}
        <div style={{ display: 'flex', gap: '15px' }}>
            <div className="card" style={{ flex: 1, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <ShieldAlert size={18} color="var(--accent)" />
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-sub)' }}>
                    Secure Stream: <span style={{ color: 'var(--text)', opacity: 0.6 }}>at.cjdd...q5bg4j</span>
                </div>
                <div style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 800, padding: '4px 10px', borderRadius: '20px', background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
                    ENCRYPTED
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}
