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
            width: 100mm;
            height: 113mm;
            padding: 4mm;
            border: 1px solid #000;
            color: #000;
            background: #fff;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 11pt;
            line-height: 1.3;
            box-sizing: border-box;
            word-break: break-word;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
          }
          @page {
            size: 100mm 113mm;
            margin: 0;
          }
          .print-header { text-align: center; border-bottom: 2px solid #000; margin-bottom: 3mm; padding-bottom: 2mm; }
          .print-title { font-size: 14pt; font-weight: bold; text-transform: uppercase; }
          .print-subtitle { font-size: 10pt; margin-bottom: 1mm; font-weight: bold; }
          .print-row { display: flex; justify-content: space-between; margin-bottom: 2mm; font-size: 10.5pt; gap: 6px; word-break: break-word; }
          .print-label { font-weight: bold; flex-shrink: 0; }
          .print-signature { margin-top: auto; border-top: 1.5px solid #000; padding-top: 2mm; text-align: right; font-size: 9pt; font-weight: bold; }
        }
      `}</style>
            <div>
                <div className="print-header">
                    <div className="print-title">J.K. CEMENT</div>
                    <div className="print-subtitle">Loading Receipt</div>
                </div>
                <div className="print-row">
                    <span className="print-label">LR No:</span> <span style={{ fontWeight: 900 }}>{lrData.lrNo}</span>
                </div>
                <div className="print-row">
                    <span className="print-label">Date:</span> <span>{lrData.date}</span>
                </div>
                <div className="print-row">
                    <span className="print-label">Truck No:</span> <span style={{ fontWeight: 900, fontSize: '12pt' }}>{lrData.truckNo}</span>
                </div>
                <div className="print-row">
                    <span className="print-label">Party Name:</span> <span>{lrData.partyName}</span>
                </div>
                <div style={{ margin: '3mm 0', borderTop: '1px dashed #000' }}></div>
                <div className="print-row">
                    <span className="print-label">Material:</span> <span>{lrData.material}</span>
                </div>
                <div className="print-row">
                    <span className="print-label">Weight:</span> <span>{lrData.weight} MT</span>
                </div>
                <div className="print-row">
                    <span className="print-label">Bags:</span> <span style={{ fontWeight: 900 }}>{lrData.totalBags}</span>
                </div>
            </div>
            <div className="print-signature">
                Authorized Signatory
            </div>
        </div>
    );
};

export default LRPrint;
