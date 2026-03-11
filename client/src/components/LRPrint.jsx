import React from 'react';

const LRPrint = ({ lrData }) => {
    return (
        <div className="print-only" id="lr-print-area">
            <style>{`
        @media print {
          body * { visibility: hidden; }
          #lr-print-area, #lr-print-area * { visibility: visible; }
          #lr-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 105mm; /* 1/4 of A4 width approx (A6 size) */
            height: 148mm;
            padding: 10mm;
            border: 1px solid #000;
            color: #000;
            background: #fff;
            font-family: 'serif';
          }
          .print-header { text-align: center; border-bottom: 2px solid #000; margin-bottom: 5mm; }
          .print-title { font-size: 18pt; font-weight: bold; }
          .print-subtitle { font-size: 12pt; margin-bottom: 2mm; }
          .print-row { display: flex; justify-between; margin-bottom: 2mm; font-size: 10pt; }
          .print-label { font-weight: bold; }
          .print-signature { margin-top: 15mm; border-top: 1px solid #000; padding-top: 2mm; text-align: right; }
        }
      `}</style>
            <div className="print-header">
                <div className="print-title">J.K. CEMENT</div>
                <div className="print-subtitle">Loading Receipt</div>
            </div>
            <div className="print-row">
                <span className="print-label">LR No:</span> <span>{lrData.lrNo}</span>
            </div>
            <div className="print-row">
                <span className="print-label">Date:</span> <span>{lrData.date}</span>
            </div>
            <div className="print-row">
                <span className="print-label">Truck No:</span> <span>{lrData.truckNo}</span>
            </div>
            <div className="print-row">
                <span className="print-label">Party Name:</span> <span>{lrData.partyName}</span>
            </div>
            <div style={{ margin: '5mm 0', borderTop: '1px dashed #000' }}></div>
            <div className="print-row">
                <span className="print-label">Material:</span> <span>{lrData.material}</span>
            </div>
            <div className="print-row">
                <span className="print-label">Weight:</span> <span>{lrData.weight} MT</span>
            </div>
            <div className="print-row">
                <span className="print-label">Bags:</span> <span>{lrData.totalBags}</span>
            </div>
            <div className="print-signature">
                Authorized Signatory
            </div>
        </div>
    );
};

export default LRPrint;
