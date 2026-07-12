import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  TrendingUp, TrendingDown, DollarSign, Calendar, ArrowUpRight, 
  ArrowDownRight, Download, RefreshCw, Info, List, 
  PieChart, BarChart3, ChevronRight, HelpCircle, Truck, MapPin, Landmark
} from 'lucide-react';
import ax from '../../api';

// Local currency formatter helper
const fmtRs = (val) => {
  return '₹' + Math.round(val || 0).toLocaleString('en-IN');
};

export default function ProfitLossSheet() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  
  // Data States
  const [vouchers, setVouchers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [cashbook, setCashbook] = useState([]);
  const [maintenance, setMaintenance] = useState([]);

  // Active filters
  const [selectedMonth, setSelectedMonth] = useState('All'); // 'YYYY-MM' or 'All'
  const [selectedVehicle, setSelectedVehicle] = useState('All'); // 'TRUCK_NO' or 'All'
  const [selectedLocation, setSelectedLocation] = useState('All'); // 'All', 'Kosli', 'Bahadurgarh', 'Jhajjar', 'Jharli'
  const [activeDrilldown, setActiveDrilldown] = useState(null); // { category, type }
  
  // Hover states for tooltips
  const [hoveredTrend, setHoveredTrend] = useState(null);
  const [hoveredDonut, setHoveredDonut] = useState(null);

  const fetchAllData = async () => {
    setRefreshing(true);
    try {
      const [
        vRes, invRes, payRes, vehRes, cashRes, maintRes
      ] = await Promise.all([
        ax.get('/vouchers').catch(() => ({ data: [] })),
        ax.get('/invoices').catch(() => ({ data: [] })),
        ax.get('/payments').catch(() => ({ data: [] })),
        ax.get('/vehicles').catch(() => ({ data: [] })),
        ax.get('/cashbook').catch(() => ({ data: [] })),
        ax.get('/maintenance').catch(() => ({ data: [] }))
      ]);

      setVouchers(vRes.data || []);
      setInvoices(invRes.data || []);
      setPayments(payRes.data || []);
      setVehicles(vehRes.data || []);
      setCashbook(cashRes.data || []);
      setMaintenance(maintRes.data || []);
      setError('');
    } catch (err) {
      console.error(err);
      setError('Failed to fetch financial data elements.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // Helper date parsing to 'YYYY-MM'
  const toYYYYMM = (dateStr) => {
    if (!dateStr) return null;
    if (dateStr instanceof Date) {
      const y = dateStr.getFullYear();
      const m = String(dateStr.getMonth() + 1).padStart(2, '0');
      return `${y}-${m}`;
    }
    // Match YYYY-MM-DD
    let m = dateStr.match(/^(\d{4})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}`;
    // Match DD.MM.YYYY or DD/MM/YYYY
    m = dateStr.match(/^(\d{2})[./-](\d{2})[./-](\d{4})/);
    if (m) return `${m[3]}-${m[2]}`;
    
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      return `${y}-${m}`;
    }
    return null;
  };

  // Human readable month name formatter (e.g. "Jul 2026")
  const formatMonthLabel = (yyyyMm) => {
    if (!yyyyMm || yyyyMm === 'All') return 'All Time';
    const [y, m] = yyyyMm.split('-');
    const date = new Date(parseInt(y), parseInt(m) - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  // List of only SELF-OWNED vehicle numbers sorted alphabetically
  const selfVehicles = useMemo(() => {
    const list = new Set();
    vehicles.forEach(v => {
      if (v.ownershipType === 'self' && v.truckNo) {
        list.add(v.truckNo.trim().toUpperCase());
      }
    });
    return Array.from(list).sort();
  }, [vehicles]);

  // Compile all transaction records with normalized categories, months, types, vehicles, and locations
  const financialData = useMemo(() => {
    const records = [];

    // 1. Build truck-to-location mapping based on historical vouchers
    const truckLocations = {};
    const truckCounts = {};
    vouchers.forEach(v => {
      if (!v.truckNo) return;
      const truck = v.truckNo.trim().toUpperCase();
      if (!truckCounts[truck]) {
        truckCounts[truck] = { Kosli: 0, Bahadurgarh: 0, Jhajjar: 0, Jharli: 0 };
      }
      if (v.type === 'Kosli_Bill') truckCounts[truck].Kosli++;
      else if (v.type === 'Bahadurgarh_Bill') truckCounts[truck].Bahadurgarh++;
      else if (v.type === 'Jajjhar_Bill') truckCounts[truck].Jhajjar++;
      else if (v.type === 'JK_Super' || v.type === 'JK_Lakshmi') truckCounts[truck].Jharli++;
    });

    Object.entries(truckCounts).forEach(([truck, locCounts]) => {
      let maxLoc = 'Jharli'; // Default fallback
      let maxVal = 0;
      Object.entries(locCounts).forEach(([loc, val]) => {
        if (val > maxVal) {
          maxVal = val;
          maxLoc = loc;
        }
      });
      if (maxVal > 0) {
        truckLocations[truck] = maxLoc;
      }
    });

    // Helper match filters
    const isSelfTruck = (truckNo) => {
      if (!truckNo) return false;
      const clean = truckNo.trim().toUpperCase();
      return selfVehicles.includes(clean);
    };

    const getRecordLocation = (source, typeVal, plantKeyVal, truckNoVal, remarkVal) => {
      // Direct Voucher type mapping
      if (source === 'voucher') {
        if (typeVal === 'Kosli_Bill') return 'Kosli';
        if (typeVal === 'Bahadurgarh_Bill') return 'Bahadurgarh';
        if (typeVal === 'Jajjhar_Bill') return 'Jhajjar';
        if (typeVal === 'JK_Super' || typeVal === 'JK_Lakshmi') return 'Jharli';
      }
      // Direct Invoice plantKey mapping
      if (source === 'invoice') {
        const pk = (plantKeyVal || '').toLowerCase();
        if (pk.includes('kosli')) return 'Kosli';
        if (pk.includes('bahadurgarh')) return 'Bahadurgarh';
        if (pk.includes('jhajjar')) return 'Jhajjar';
        if (pk.includes('jharli') || pk.includes('jksuper') || pk.includes('jklakshmi')) return 'Jharli';
      }
      // Match by remark text
      const remarkText = (remarkVal || '').toUpperCase();
      if (remarkText.includes('KOSLI')) return 'Kosli';
      if (remarkText.includes('BAHADURGARH')) return 'Bahadurgarh';
      if (remarkText.includes('JHAJJAR')) return 'Jhajjar';
      if (remarkText.includes('JHARLI')) return 'Jharli';
      
      // Match by truck association
      if (truckNoVal) {
        const truck = truckNoVal.trim().toUpperCase();
        if (truckLocations[truck]) return truckLocations[truck];
      }
      return 'Jharli'; // Default fallback location
    };

    const isOfficeExpense = (remark) => {
      const r = (remark || '').toUpperCase();
      return r.includes('OFFICE') || r.includes('RENT') || r.includes('ELECTRICITY') || 
             r.includes('STATIONERY') || r.includes('WATER') || r.includes('INTERNET') || 
             r.includes('TEA') || r.includes('COFFEE') || r.includes('STAFF FOOD') || 
             r.includes('MISC') || r.includes('CLEANING') || r.includes('OFFICE EXP');
    };

    // --- REVENUES (INFLOWS) ---

    // 1. Voucher Commissions (Consolidated)
    vouchers.forEach(v => {
      const comm = parseFloat(v.commission) || 0;
      if (comm > 0) {
        const month = toYYYYMM(v.date);
        records.push({
          id: `v-comm-${v.id || Math.random()}`,
          date: v.date,
          month,
          type: 'income',
          category: 'Trip Commissions',
          description: `Trip commission for ${v.truckNo || 'Market Fleet'} (LR: ${v.lrNo || 'N/A'})`,
          amount: comm,
          ref: v.lrNo || 'Voucher',
          truckNo: v.truckNo,
          location: getRecordLocation('voucher', v.type, null, v.truckNo, v.lrNo)
        });
      }
    });

    // 2. Passed / Paid Invoices (Client billings with GST details)
    invoices.forEach(inv => {
      const isPassedOrPaid = inv.status === 'passed' || inv.status === 'paid' || inv.status === 'Passed' || inv.status === 'Paid';
      if (isPassedOrPaid) {
        const items = inv.items || [];
        const month = toYYYYMM(inv.billDate);
        const totalFreight = parseFloat(inv.totalFreight) || 0;
        const totalWithGST = parseFloat(inv.totalWithGST) || 0;
        const gstAmount = Math.max(0, totalWithGST - totalFreight);
        const loc = getRecordLocation('invoice', null, inv.plantKey, null, inv.billNo);

        if (selectedVehicle === 'All') {
          records.push({
            id: `inv-${inv.id}`,
            date: inv.billDate,
            month,
            type: 'income',
            category: 'Passed Client Bills',
            description: `Tax Invoice Bill #${inv.billNo} (${inv.type || 'Freight'})`,
            amount: totalWithGST,
            gstAmount,
            ref: `Bill #${inv.billNo}`,
            truckNo: items.map(it => it.truckNo).filter(Boolean).join(', '),
            location: loc
          });
        } else {
          // Proportional share for selected self-owned truck
          const matchingItems = items.filter(it => (it.truckNo || '').trim().toUpperCase() === selectedVehicle);
          if (matchingItems.length > 0) {
            const vehicleFreight = matchingItems.reduce((s, it) => s + (parseFloat(it.billedQty) || 0) * (parseFloat(it.ratePMT) || 0), 0);
            const overallFreight = items.reduce((s, it) => s + (parseFloat(it.billedQty) || 0) * (parseFloat(it.ratePMT) || 0), 0);
            const proportion = overallFreight > 0 ? vehicleFreight / overallFreight : 0;
            
            records.push({
              id: `inv-${inv.id}-${selectedVehicle}`,
              date: inv.billDate,
              month,
              type: 'income',
              category: 'Passed Client Bills',
              description: `Tax Invoice Bill #${inv.billNo} - proportional share for ${selectedVehicle}`,
              amount: proportion * totalWithGST,
              gstAmount: proportion * gstAmount,
              ref: `Bill #${inv.billNo}`,
              truckNo: selectedVehicle,
              location: loc
            });
          }
        }
      }
    });

    // 3. Cashbook Inflows
    cashbook.forEach(cb => {
      if (cb.type === 'deposit' && !cb.isRefundEntry) {
        const amount = parseFloat(cb.amount) || 0;
        const month = toYYYYMM(cb.date);
        records.push({
          id: `cb-dep-${cb.id}`,
          date: cb.date,
          month,
          type: 'income',
          category: 'Other Inflows / Deposits',
          description: cb.remark || 'General Cashbook Deposit',
          amount,
          ref: 'Cashbook',
          truckNo: cb.truckNo,
          location: getRecordLocation('cashbook', null, null, cb.truckNo, cb.remark)
        });
      }
    });

    // --- EXPENSES (OUTFLOWS - ONLY FOR SELF-OWNED FLEET & OFFICE) ---

    // 1. Vehicle EMIs (Financing - exclusively self-owned fleet)
    vehicles.forEach(veh => {
      const truck = (veh.truckNo || '').trim().toUpperCase();
      if (veh.ownershipType === 'self' && veh.emiDetails) {
        let emi = {};
        try {
          emi = typeof veh.emiDetails === 'string' ? JSON.parse(veh.emiDetails) : veh.emiDetails;
        } catch {
          return;
        }
        const schedule = emi.schedule || [];
        const emiVal = parseFloat(emi.due) || 0;
        const loc = getRecordLocation('vehicle', null, null, veh.truckNo, emi.bankName);

        if (schedule.length > 0) {
          schedule.forEach(item => {
            if (item.status === 'paid') {
              const payDate = item.paymentDate || item.dueDate;
              const month = toYYYYMM(payDate);
              records.push({
                id: `emi-${veh.id}-${item.installmentNo}`,
                date: payDate,
                month,
                type: 'expense',
                category: 'Vehicle Loan EMIs',
                description: `EMI Installment #${item.installmentNo} for ${veh.truckNo} (${emi.bankName || 'Finance Bank'})`,
                amount: parseFloat(item.amount) || emiVal,
                ref: emi.loanNo || 'EMI',
                truckNo: veh.truckNo,
                location: loc
              });
            }
          });
        } else {
          const paidMonths = emi.paidEmis || [];
          paidMonths.forEach(mStr => {
            records.push({
              id: `emi-simple-${veh.id}-${mStr}`,
              date: `${mStr}-05`,
              month: mStr,
              type: 'expense',
              category: 'Vehicle Loan EMIs',
              description: `EMI payment for ${veh.truckNo} (${emi.bankName || 'Finance Bank'})`,
              amount: emiVal,
              ref: emi.loanNo || 'EMI',
              truckNo: veh.truckNo,
              location: loc
            });
          });
        }
      }
    });

    // 2. Staff Salaries & Driver Payments (Filtered for self-owned trucks only, except office profiles)
    payments.forEach(p => {
      const isSalaryOrAdv = p.category === 'Salary' || p.category === 'Advance';
      if (isSalaryOrAdv) {
        const isOffice = isOfficeExpense(p.remark);
        const matchesTruck = p.truckNo ? isSelfTruck(p.truckNo) : true; // Keep office salaries / general staff
        
        if (matchesTruck) {
          const amount = parseFloat(p.amount) || 0;
          const month = toYYYYMM(p.date);
          records.push({
            id: `pay-staff-${p.id}`,
            date: p.date,
            month,
            type: 'expense',
            category: isOffice ? 'Office Expenses' : 'Staff & Driver Salaries',
            description: `${p.category} payment to ${p.profileName || 'Staff Member'}`,
            amount,
            ref: p.paymentMethod || 'Salary',
            truckNo: p.truckNo,
            location: getRecordLocation('payment', null, null, p.truckNo, p.remark)
          });
        }
      }
    });

    cashbook.forEach(cb => {
      if (cb.type === 'cash_out' && (cb.entityType === 'driver' || cb.entityType === 'staff')) {
        const matchesTruck = (cb.truckNo || cb.vehicleNo) ? isSelfTruck(cb.truckNo || cb.vehicleNo) : true;
        if (matchesTruck) {
          const amount = parseFloat(cb.amount) || 0;
          const month = toYYYYMM(cb.date);
          const isOffice = isOfficeExpense(cb.remark) || cb.entityType === 'office';
          records.push({
            id: `cb-staff-${cb.id}`,
            date: cb.date,
            month,
            type: 'expense',
            category: isOffice ? 'Office Expenses' : 'Staff & Driver Salaries',
            description: cb.remark || `Cash advance to ${cb.entityName || 'Staff'}`,
            amount,
            ref: 'Cashbook',
            truckNo: cb.truckNo || cb.vehicleNo,
            location: getRecordLocation('cashbook', null, null, cb.truckNo || cb.vehicleNo, cb.remark)
          });
        }
      }
    });

    // 3. Fuel Stations & Diesel Pump Payments (Self-owned fleet only)
    payments.forEach(p => {
      if (p.category === 'Pump' && isSelfTruck(p.truckNo)) {
        const amount = parseFloat(p.amount) || 0;
        const month = toYYYYMM(p.date);
        records.push({
          id: `pay-pump-${p.id}`,
          date: p.date,
          month,
          type: 'expense',
          category: 'Diesel & Fuel Stations',
          description: `Fuel Station settlement: ${p.remark || p.profileName}`,
          amount,
          ref: p.paymentMethod || 'Pump Pay',
          truckNo: p.truckNo,
          location: getRecordLocation('payment', null, null, p.truckNo, p.remark)
        });
      }
    });

    vouchers.forEach(v => {
      const diesel = parseFloat(v.diesel) || 0;
      if (diesel > 0 && isSelfTruck(v.truckNo)) {
        const month = toYYYYMM(v.date);
        records.push({
          id: `v-diesel-${v.id || Math.random()}`,
          date: v.date,
          month,
          type: 'expense',
          category: 'Diesel & Fuel Stations',
          description: `Trip Diesel Advance for ${v.truckNo} (LR: ${v.lrNo || 'N/A'})`,
          amount: diesel,
          ref: v.dieselStation || 'Trip Advance',
          truckNo: v.truckNo,
          location: getRecordLocation('voucher', v.type, null, v.truckNo, v.dieselStation)
        });
      }
    });

    // 4. Vehicle Maintenance & Lubrication (Self-owned fleet only)
    maintenance.forEach(m => {
      const cost = (parseFloat(m.cost) || 0) + (parseFloat(m.labourCost) || 0);
      if (cost > 0 && isSelfTruck(m.truckNo)) {
        const month = toYYYYMM(m.date);
        records.push({
          id: `maint-rec-${m.id}`,
          date: m.date,
          month,
          type: 'expense',
          category: 'Maintenance & Lubrication',
          description: `Changed ${m.partName || 'Parts'} on vehicle ${m.truckNo} (Lab: ${fmtRs(m.labourCost)})`,
          amount: cost,
          ref: m.vendor || 'Repair Log',
          truckNo: m.truckNo,
          location: getRecordLocation('maintenance', null, null, m.truckNo, m.partName)
        });
      }
    });

    payments.forEach(p => {
      if (p.category === 'Maintenance' && isSelfTruck(p.truckNo)) {
        const amount = parseFloat(p.amount) || 0;
        const month = toYYYYMM(p.date);
        records.push({
          id: `pay-maint-${p.id}`,
          date: p.date,
          month,
          type: 'expense',
          category: 'Maintenance & Lubrication',
          description: `Maintenance settlement: ${p.remark || p.profileName}`,
          amount,
          ref: p.paymentMethod || 'Maintenance Pay',
          truckNo: p.truckNo,
          location: getRecordLocation('payment', null, null, p.truckNo, p.remark)
        });
      }
    });

    // 5. Tyre Purchases & Repairs (Self-owned fleet only)
    payments.forEach(p => {
      if (p.category === 'Tyre' && isSelfTruck(p.truckNo)) {
        const amount = parseFloat(p.amount) || 0;
        const month = toYYYYMM(p.date);
        records.push({
          id: `pay-tyre-${p.id}`,
          date: p.date,
          month,
          type: 'expense',
          category: 'Tyre Purchases & Repairs',
          description: `Tyre purchase/repair settlement: ${p.remark || p.profileName}`,
          amount,
          ref: p.paymentMethod || 'Tyre Pay',
          truckNo: p.truckNo,
          location: getRecordLocation('payment', null, null, p.truckNo, p.remark)
        });
      }
    });

    // 6. Labour & Handling Pay (Self-owned fleet only)
    payments.forEach(p => {
      const isLab = p.category === 'Labour' || p.category === 'Handling' || p.category === 'Labour & Handling';
      if (isLab && isSelfTruck(p.truckNo)) {
        const amount = parseFloat(p.amount) || 0;
        const month = toYYYYMM(p.date);
        records.push({
          id: `pay-labour-${p.id}`,
          date: p.date,
          month,
          type: 'expense',
          category: 'Labour & Handling Pay',
          description: `Labour/Handling payroll: ${p.remark || p.profileName}`,
          amount,
          ref: p.paymentMethod || 'Labour Pay',
          truckNo: p.truckNo,
          location: getRecordLocation('payment', null, null, p.truckNo, p.remark)
        });
      }
    });

    cashbook.forEach(cb => {
      if (cb.type === 'cash_out') {
        const remarkUpper = (cb.remark || '').toUpperCase();
        const isLab = remarkUpper.includes('LABOUR') || remarkUpper.includes('HANDLING') || remarkUpper.includes('HAMALI') || remarkUpper.includes('LOADING') || remarkUpper.includes('UNLOADING');
        const matchesTruck = (cb.truckNo || cb.vehicleNo) ? isSelfTruck(cb.truckNo || cb.vehicleNo) : true;
        
        if (isLab && matchesTruck) {
          const amount = parseFloat(cb.amount) || 0;
          const month = toYYYYMM(cb.date);
          records.push({
            id: `cb-labour-${cb.id}`,
            date: cb.date,
            month,
            type: 'expense',
            category: 'Labour & Handling Pay',
            description: cb.remark || 'Labour / Hamali Outflow',
            amount,
            ref: 'Cashbook',
            truckNo: cb.truckNo || cb.vehicleNo,
            location: getRecordLocation('cashbook', null, null, cb.truckNo || cb.vehicleNo, cb.remark)
          });
        }
      }
    });

    // 7. General & Office Expenses
    payments.forEach(p => {
      if (p.category === 'Other') {
        const matchesTruck = p.truckNo ? isSelfTruck(p.truckNo) : true;
        if (matchesTruck) {
          const amount = parseFloat(p.amount) || 0;
          const month = toYYYYMM(p.date);
          const isOffice = isOfficeExpense(p.remark);
          
          records.push({
            id: `pay-gen-${p.id}`,
            date: p.date,
            month,
            type: 'expense',
            category: isOffice ? 'Office Expenses' : 'General & Other Expenses',
            description: `General payment: ${p.remark || 'General Pay'}`,
            amount,
            ref: p.paymentMethod || 'Firm Pay',
            truckNo: p.truckNo,
            location: getRecordLocation('payment', null, null, p.truckNo, p.remark)
          });
        }
      }
    });

    cashbook.forEach(cb => {
      if (cb.type === 'cash_out' && !cb.entityType && !cb.isReturned) {
        const remarkUpper = (cb.remark || '').toUpperCase();
        const isLab = remarkUpper.includes('LABOUR') || remarkUpper.includes('HANDLING') || remarkUpper.includes('HAMALI') || remarkUpper.includes('LOADING') || remarkUpper.includes('UNLOADING');
        const matchesTruck = (cb.truckNo || cb.vehicleNo) ? isSelfTruck(cb.truckNo || cb.vehicleNo) : true;
        const isOffice = isOfficeExpense(cb.remark);
        
        if (!isLab && matchesTruck) {
          const amount = parseFloat(cb.amount) || 0;
          const month = toYYYYMM(cb.date);
          records.push({
            id: `cb-gen-${cb.id}`,
            date: cb.date,
            month,
            type: 'expense',
            category: isOffice ? 'Office Expenses' : 'General & Other Expenses',
            description: cb.remark || 'General Cashbook Outflow',
            amount,
            ref: 'Cashbook',
            truckNo: cb.truckNo || cb.vehicleNo,
            location: getRecordLocation('cashbook', null, null, cb.truckNo || cb.vehicleNo, cb.remark)
          });
        }
      }
    });

    vouchers.forEach(v => {
      const cash = parseFloat(v.cash) || 0;
      const online = parseFloat(v.online) || 0;
      const munshi = parseFloat(v.munshi) || 0;
      const month = toYYYYMM(v.date);

      if (isSelfTruck(v.truckNo)) {
        const loc = getRecordLocation('voucher', v.type, null, v.truckNo, v.lrNo);
        if (cash > 0) {
          records.push({
            id: `v-cash-${v.id || Math.random()}`,
            date: v.date,
            month,
            type: 'expense',
            category: 'General & Other Expenses',
            description: `Trip Cash Advance to driver for ${v.truckNo}`,
            amount: cash,
            ref: 'Driver Cash',
            truckNo: v.truckNo,
            location: loc
          });
        }
        if (online > 0) {
          records.push({
            id: `v-online-${v.id || Math.random()}`,
            date: v.date,
            month,
            type: 'expense',
            category: 'General & Other Expenses',
            description: `Trip Online/UPI Advance for ${v.truckNo}`,
            amount: online,
            ref: 'Driver UPI',
            truckNo: v.truckNo,
            location: loc
          });
        }
        if (munshi > 0) {
          records.push({
            id: `v-munshi-${v.id || Math.random()}`,
            date: v.date,
            month,
            type: 'expense',
            category: 'General & Other Expenses',
            description: `Munshi / Broker charges: trip ${v.truckNo}`,
            amount: munshi,
            ref: 'Munshi Pay',
            truckNo: v.truckNo,
            location: loc
          });
        }
      }
    });

    return records.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [vouchers, invoices, payments, vehicles, cashbook, maintenance, selfVehicles, selectedVehicle]);

  // List of all unique months sorted chronologically
  const availableMonths = useMemo(() => {
    const months = new Set();
    financialData.forEach(r => {
      if (r.month) months.add(r.month);
    });
    return Array.from(months).sort((a, b) => b.localeCompare(a));
  }, [financialData]);

  // Filtered Financial Records based on location, month, and vehicle selectors
  const filteredRecords = useMemo(() => {
    return financialData.filter(r => {
      const matchesMonth = selectedMonth === 'All' || r.month === selectedMonth;
      const matchesVehicle = selectedVehicle === 'All' || (r.truckNo && r.truckNo.trim().toUpperCase() === selectedVehicle);
      const matchesLocation = selectedLocation === 'All' || r.location === selectedLocation;
      return matchesMonth && matchesVehicle && matchesLocation;
    });
  }, [financialData, selectedMonth, selectedVehicle, selectedLocation]);

  // Calculate aggregates and tax details
  const aggregates = useMemo(() => {
    let income = 0;
    let expense = 0;
    let gstOutward = 0;
    
    // Inflow Category Sums
    const incomeCats = {
      'Passed Client Bills': 0,
      'Trip Commissions': 0,
      'Other Inflows / Deposits': 0
    };

    // Outflow Category Sums
    const expenseCats = {
      'Vehicle Loan EMIs': 0,
      'Staff & Driver Salaries': 0,
      'Diesel & Fuel Stations': 0,
      'Maintenance & Lubrication': 0,
      'Tyre Purchases & Repairs': 0,
      'Labour & Handling Pay': 0,
      'Office Expenses': 0,
      'General & Other Expenses': 0
    };

    filteredRecords.forEach(r => {
      if (r.type === 'income') {
        income += r.amount;
        if (incomeCats[r.category] !== undefined) {
          incomeCats[r.category] += r.amount;
        }
        if (r.category === 'Passed Client Bills' && r.gstAmount) {
          gstOutward += r.gstAmount;
        }
      } else {
        expense += r.amount;
        if (expenseCats[r.category] !== undefined) {
          expenseCats[r.category] += r.amount;
        }
      }
    });

    // Inward GST ITC Estimation (typical standard 18% inclusive GST on maintenance parts, tyres & office expenses)
    const gstInward = filteredRecords
      .filter(r => r.category === 'Maintenance & Lubrication' || r.category === 'Tyre Purchases & Repairs' || r.category === 'Office Expenses')
      .reduce((s, r) => s + (r.amount * 18 / 118), 0);

    const netGstPayable = gstOutward - gstInward;

    const netProfit = income - expense;
    const profitMargin = income > 0 ? (netProfit / income) * 100 : 0;

    return {
      totalIncome: income,
      totalExpense: expense,
      netProfit,
      profitMargin,
      incomeCats,
      expenseCats,
      gstOutward,
      gstInward,
      netGstPayable
    };
  }, [filteredRecords]);

  // Aggregate monthly data for the trends chart
  const monthlyTrends = useMemo(() => {
    const monthlyMap = {};
    
    // Sort months chronologically for left-to-right display
    const chronologicalMonths = [...availableMonths].reverse();
    
    // Initialize structure
    chronologicalMonths.forEach(m => {
      monthlyMap[m] = { month: m, label: formatMonthLabel(m), income: 0, expense: 0 };
    });

    filteredRecords.forEach(r => {
      if (r.month && monthlyMap[r.month]) {
        if (r.type === 'income') {
          monthlyMap[r.month].income += r.amount;
        } else {
          monthlyMap[r.month].expense += r.amount;
        }
      }
    });

    return Object.values(monthlyMap);
  }, [filteredRecords, availableMonths]);

  // SVG Coordinates for Revenue vs Expense Trend Chart
  const trendChartData = useMemo(() => {
    if (monthlyTrends.length === 0) return { lines: [], points: [], labels: [] };
    
    const width = 680;
    const height = 180;
    const padding = 30;
    
    const maxVal = Math.max(...monthlyTrends.map(t => Math.max(t.income, t.expense)), 10000) * 1.1;
    
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;
    
    const pointsIncome = [];
    const pointsExpense = [];
    
    monthlyTrends.forEach((t, i) => {
      const x = padding + (i / Math.max(monthlyTrends.length - 1, 1)) * chartWidth;
      const yIncome = height - padding - (t.income / maxVal) * chartHeight;
      const yExpense = height - padding - (t.expense / maxVal) * chartHeight;
      
      pointsIncome.push({ x, y: yIncome, val: t.income, month: t.month });
      pointsExpense.push({ x, y: yExpense, val: t.expense, month: t.month });
    });

    const incomePath = pointsIncome.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const expensePath = pointsExpense.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    
    return {
      width,
      height,
      padding,
      maxVal,
      pointsIncome,
      pointsExpense,
      incomePath,
      expensePath,
      chartHeight,
      chartWidth
    };
  }, [monthlyTrends]);

  // Donut segment calculations for Expenses Pie
  const donutSegments = useMemo(() => {
    const cats = aggregates.expenseCats;
    const total = aggregates.totalExpense;
    if (total === 0) return [];
    
    let accumulatedAngle = 0;
    const colors = {
      'Vehicle Loan EMIs': '#f59e0b',
      'Staff & Driver Salaries': '#8b5cf6',
      'Diesel & Fuel Stations': '#06b6d4',
      'Maintenance & Lubrication': '#34d399',
      'Tyre Purchases & Repairs': '#e11d48',
      'Labour & Handling Pay': '#10b981',
      'Office Expenses': '#ec4899',
      'General & Other Expenses': '#64748b'
    };

    return Object.entries(cats).map(([name, val]) => {
      const percentage = (val / total) * 100;
      const angle = (val / total) * 360;
      const startAngle = accumulatedAngle;
      accumulatedAngle += angle;
      
      // Arc coordinates
      const radius = 65;
      const cx = 85;
      const cy = 85;
      
      const x1 = cx + radius * Math.cos((startAngle - 90) * Math.PI / 180);
      const y1 = cy + radius * Math.sin((startAngle - 90) * Math.PI / 180);
      const x2 = cx + radius * Math.cos((startAngle + angle - 90) * Math.PI / 180);
      const y2 = cy + radius * Math.sin((startAngle + angle - 90) * Math.PI / 180);
      
      const largeArc = angle > 180 ? 1 : 0;
      
      const pathData = `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
      
      return {
        name,
        value: val,
        percentage: percentage.toFixed(1),
        pathData,
        color: colors[name] || '#94a3b8'
      };
    }).filter(s => s.value > 0);
  }, [aggregates]);

  // Export to CSV helper
  const handleExportCSV = () => {
    let headers = ['Date', 'Month', 'Location', 'Vehicle', 'Type', 'Category', 'Description', 'Amount (INR)', 'Reference'];
    let rows = filteredRecords.map(r => [
      r.date, r.month, r.location || 'Jharli', r.truckNo || 'N/A', r.type.toUpperCase(), r.category, 
      r.description.replace(/,/g, ';'), r.amount, r.ref
    ]);
    
    let csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `P_and_L_Statement_${selectedLocation}_${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Set drilldown details based on category clicked
  const handleDrilldownClick = (category, type) => {
    setActiveDrilldown({
      category,
      type,
      records: filteredRecords.filter(r => r.category === category && r.type === type)
    });
  };

  return (
    <div style={{ paddingBottom: '50px' }}>
      
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 900, color: 'var(--text)', margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>Profit & Loss Sheet</h1>
          <p style={{ margin: 0, fontSize: '13.5px', color: 'var(--text-muted)' }}>
            Self-Owned Fleet operations accounting details (Commissions, EMIs, Maintenance, Tyres, Fuel, Office, and Inward/Outward GST Ledgers).
          </p>
        </div>

        {/* Filters and Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          
          {/* Location Selector Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-card)', padding: '6px 12px', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <MapPin size={15} color="var(--primary)" />
            <select 
              value={selectedLocation} 
              onChange={(e) => { setSelectedLocation(e.target.value); setActiveDrilldown(null); }}
              style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontWeight: 800, fontSize: '13.5px', padding: '2px 8px', cursor: 'pointer', outline: 'none' }}
            >
              <option value="All" style={{ background: '#1e293b' }}>All Locations (Firm)</option>
              <option value="Kosli" style={{ background: '#1e293b' }}>Kosli</option>
              <option value="Bahadurgarh" style={{ background: '#1e293b' }}>Bahadurgarh</option>
              <option value="Jhajjar" style={{ background: '#1e293b' }}>Jhajjar</option>
              <option value="Jharli" style={{ background: '#1e293b' }}>Jharli / JKL</option>
            </select>
          </div>

          {/* Vehicle Selector Dropdown (Only Self Vehicles) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-card)', padding: '6px 12px', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <Truck size={15} color="var(--primary)" />
            <select 
              value={selectedVehicle} 
              onChange={(e) => { setSelectedVehicle(e.target.value); setActiveDrilldown(null); }}
              style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontWeight: 800, fontSize: '13.5px', padding: '2px 8px', cursor: 'pointer', outline: 'none', maxWidth: '160px' }}
            >
              <option value="All" style={{ background: '#1e293b' }}>All Self Trucks</option>
              {selfVehicles.map(vehNo => (
                <option key={vehNo} value={vehNo} style={{ background: '#1e293b' }}>{vehNo}</option>
              ))}
            </select>
          </div>

          {/* Month Selector Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-card)', padding: '6px 12px', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <Calendar size={15} color="var(--primary)" />
            <select 
              value={selectedMonth} 
              onChange={(e) => { setSelectedMonth(e.target.value); setActiveDrilldown(null); }}
              style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontWeight: 800, fontSize: '13.5px', padding: '2px 8px', cursor: 'pointer', outline: 'none' }}
            >
              <option value="All" style={{ background: '#1e293b' }}>All Months</option>
              {availableMonths.map(m => (
                <option key={m} value={m} style={{ background: '#1e293b' }}>{formatMonthLabel(m)}</option>
              ))}
            </select>
          </div>

          <button className="btn btn-g" onClick={fetchAllData} disabled={refreshing} style={{ padding: '9px 12px', borderRadius: '12px' }}>
            <RefreshCw size={14} className={refreshing ? 'ani-spin' : ''} />
          </button>

          <button className="btn btn-p" onClick={handleExportCSV} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 16px', borderRadius: '12px' }}>
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '16px', background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.2)', borderRadius: '14px', color: '#fb7185', marginBottom: '24px', fontSize: '13px', display: 'flex', gap: '10px' }}>
          <Info size={16} /> {error}
        </div>
      )}

      {/* Main Aggregates Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '28px' }}>
        
        {/* Total Revenues Card */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', padding: '20px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Inflows / Revenue</span>
            <div style={{ background: 'rgba(52,211,153,0.1)', color: '#34d399', padding: '4px', borderRadius: '8px' }}><ArrowUpRight size={16} /></div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--text)', marginBottom: '4px' }}>
            {loading ? '...' : fmtRs(aggregates.totalIncome)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Includes passed bills, commissions & cash receipts.
          </div>
        </div>

        {/* Total Expenses Card */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', padding: '20px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Outflows / Expenses</span>
            <div style={{ background: 'rgba(244,63,94,0.1)', color: '#fb7185', padding: '4px', borderRadius: '8px' }}><ArrowDownRight size={16} /></div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--text)', marginBottom: '4px' }}>
            {loading ? '...' : fmtRs(aggregates.totalExpense)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Includes EMIs, payroll, tyres, office bills & fuel settlements.
          </div>
        </div>

        {/* Net Profit Card */}
        <div style={{ 
          background: 'var(--bg-card)', 
          border: '1px solid var(--border)', 
          borderRadius: '20px', 
          padding: '20px', 
          position: 'relative', 
          overflow: 'hidden',
          boxShadow: aggregates.netProfit >= 0 ? 'inset 0 0 20px rgba(52,211,153,0.03)' : 'inset 0 0 20px rgba(244,63,94,0.03)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net Business Profit</span>
            <div style={{ 
              background: aggregates.netProfit >= 0 ? 'rgba(52,211,153,0.1)' : 'rgba(244,63,94,0.1)', 
              color: aggregates.netProfit >= 0 ? '#34d399' : '#fb7185', 
              padding: '4px', 
              borderRadius: '8px' 
            }}>
              <DollarSign size={16} />
            </div>
          </div>
          <div style={{ 
            fontSize: '28px', 
            fontWeight: 900, 
            color: aggregates.netProfit >= 0 ? '#34d399' : '#fb7185', 
            marginBottom: '4px' 
          }}>
            {loading ? '...' : fmtRs(aggregates.netProfit)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Net profit/loss margin for selected period.
          </div>
        </div>

        {/* Profit Margin Card */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Profit Margin Percentage</span>
            <div style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1', padding: '4px', borderRadius: '8px' }}><TrendingUp size={16} /></div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 900, color: '#8b5cf6', marginBottom: '4px' }}>
            {loading ? '...' : `${aggregates.profitMargin.toFixed(1)}%`}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Percentage efficiency of operations.
          </div>
        </div>

      </div>

      {/* Visual Analytics / Charts Section */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', marginBottom: '28px' }}>
          
          {/* Revenue vs Expense Area Chart */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', padding: '20px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <BarChart3 size={16} color="var(--primary)" />
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800 }}>Inflows vs Outflows Trend</h3>
              </div>
              <div style={{ display: 'flex', gap: '12px', fontSize: '11px', fontWeight: 800 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#34d399' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#34d399' }} /> Inflow
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#fb7185' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#fb7185' }} /> Outflow
                </span>
              </div>
            </div>
            
            {/* SVG Render Container */}
            <div style={{ flex: 1, position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '180px' }}>
              {monthlyTrends.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No monthly trend data available.</div>
              ) : (
                <svg width="100%" height="180" viewBox={`0 0 ${trendChartData.width} ${trendChartData.height}`} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
                  <defs>
                    <linearGradient id="glowInflow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity="0.25"/>
                      <stop offset="100%" stopColor="#34d399" stopOpacity="0.0"/>
                    </linearGradient>
                    <linearGradient id="glowOutflow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#fb7185" stopOpacity="0.2"/>
                      <stop offset="100%" stopColor="#fb7185" stopOpacity="0.0"/>
                    </linearGradient>
                  </defs>

                  {/* Horizontal grid lines */}
                  {[0, 0.25, 0.5, 0.75, 1].map((ratio, index) => {
                    const y = trendChartData.padding + ratio * trendChartData.chartHeight;
                    const valLabel = Math.round((1 - ratio) * trendChartData.maxVal);
                    return (
                      <g key={index}>
                        <line x1={trendChartData.padding} y1={y} x2={trendChartData.width - trendChartData.padding} y2={y} stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                        <text x={trendChartData.padding - 5} y={y + 4} fill="var(--text-muted)" fontSize="9" fontWeight="700" textAnchor="end">{fmtRs(valLabel)}</text>
                      </g>
                    );
                  })}

                  {/* Gradient Area below paths */}
                  {trendChartData.pointsIncome.length > 0 && (
                    <path 
                      d={`${trendChartData.incomePath} L ${trendChartData.pointsIncome[trendChartData.pointsIncome.length - 1].x} ${trendChartData.height - trendChartData.padding} L ${trendChartData.pointsIncome[0].x} ${trendChartData.height - trendChartData.padding} Z`}
                      fill="url(#glowInflow)"
                    />
                  )}
                  {trendChartData.pointsExpense.length > 0 && (
                    <path 
                      d={`${trendChartData.expensePath} L ${trendChartData.pointsExpense[trendChartData.pointsExpense.length - 1].x} ${trendChartData.height - trendChartData.padding} L ${trendChartData.pointsExpense[0].x} ${trendChartData.height - trendChartData.padding} Z`}
                      fill="url(#glowOutflow)"
                    />
                  )}

                  {/* Trend Lines */}
                  <path d={trendChartData.incomePath} fill="none" stroke="#34d399" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d={trendChartData.expensePath} fill="none" stroke="#fb7185" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

                  {/* Dots & Interactivity */}
                  {trendChartData.pointsIncome.map((p, idx) => (
                    <g key={`dots-${idx}`}>
                      <circle 
                        cx={p.x} cy={p.y} r="5" fill="#1e293b" stroke="#34d399" strokeWidth="2.5" 
                        style={{ cursor: 'pointer' }}
                        onMouseEnter={() => setHoveredTrend({ ...p, type: 'Inflow' })}
                        onMouseLeave={() => setHoveredTrend(null)}
                      />
                      <circle 
                        cx={p.x} cy={trendChartData.pointsExpense[idx].y} r="5" fill="#1e293b" stroke="#fb7185" strokeWidth="2.5" 
                        style={{ cursor: 'pointer' }}
                        onMouseEnter={() => setHoveredTrend({ ...trendChartData.pointsExpense[idx], type: 'Outflow' })}
                        onMouseLeave={() => setHoveredTrend(null)}
                      />
                      {/* Month Label */}
                      <text x={p.x} y={trendChartData.height - 8} fill="var(--text-muted)" fontSize="9" fontWeight="700" textAnchor="middle">
                        {formatMonthLabel(p.month).split(' ')[0]}
                      </text>
                    </g>
                  ))}
                </svg>
              )}

              {/* Tooltip Overlay */}
              <AnimatePresence>
                {hoveredTrend && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    style={{
                      position: 'absolute',
                      background: '#0f172a',
                      border: `1px solid ${hoveredTrend.type === 'Inflow' ? '#34d399' : '#fb7185'}`,
                      borderRadius: '8px',
                      padding: '8px 12px',
                      left: `${(hoveredTrend.x / trendChartData.width) * 100}%`,
                      top: `${(hoveredTrend.y / trendChartData.height) * 100 - 30}%`,
                      transform: 'translate(-50%, -100%)',
                      boxShadow: '0 8px 16px rgba(0,0,0,0.4)',
                      zIndex: 100,
                      pointerEvents: 'none',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    <div style={{ fontSize: '9px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      {formatMonthLabel(hoveredTrend.month)}
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 900, color: hoveredTrend.type === 'Inflow' ? '#34d399' : '#fb7185', marginTop: '2px' }}>
                      {hoveredTrend.type}: {fmtRs(hoveredTrend.val)}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Expense Breakdown Donut Chart */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', padding: '20px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
              <PieChart size={16} color="var(--primary)" />
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800 }}>Outflow Allocations</h3>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flex: 1, minHeight: '180px' }}>
              {donutSegments.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', width: '100%' }}>No expenses registered for this period.</div>
              ) : (
                <>
                  {/* SVG Donut */}
                  <div style={{ position: 'relative', width: '150px', height: '150px', flexShrink: 0 }}>
                    <svg width="150" height="150" viewBox="0 0 170 170" style={{ overflow: 'visible' }}>
                      {donutSegments.map((s, idx) => (
                        <path 
                          key={idx} 
                          d={s.pathData} 
                          fill="none" 
                          stroke={s.color} 
                          strokeWidth="20"
                          style={{ cursor: 'pointer', transition: 'stroke-width 0.2s' }}
                          onMouseEnter={() => setHoveredDonut(s)}
                          onMouseLeave={() => setHoveredDonut(null)}
                        />
                      ))}
                    </svg>

                    {/* Total inside Donut */}
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', pointerEvents: 'none' }}>
                      <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase' }}>Expenses</span>
                      <span style={{ fontSize: '13.5px', fontWeight: 900, color: 'white', marginTop: '2px' }}>
                        {fmtRs(aggregates.totalExpense)}
                      </span>
                    </div>
                  </div>

                  {/* Legend */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', maxHeight: '170px', paddingRight: '4px' }}>
                    {donutSegments.map((s, idx) => (
                      <div 
                        key={idx} 
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '8px', 
                          fontSize: '11px', 
                          cursor: 'pointer',
                          opacity: hoveredDonut && hoveredDonut.name !== s.name ? 0.4 : 1,
                          transition: 'opacity 0.2s'
                        }}
                        onMouseEnter={() => setHoveredDonut(s)}
                        onMouseLeave={() => setHoveredDonut(null)}
                      >
                        <div style={{ width: '8px', height: '8px', borderRadius: '3px', background: s.color, flexShrink: 0 }} />
                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                          <span style={{ fontWeight: 800, color: 'var(--text-sub)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px' }} title={s.name}>{s.name}</span>
                          <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{fmtRs(s.value)} ({s.percentage}%)</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Donut Segment Detail Hover info */}
            {hoveredDonut && (
              <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.02)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)', textAlign: 'center', marginTop: '12px' }}>
                <strong style={{ color: hoveredDonut.color }}>{hoveredDonut.name}</strong> represents <strong>{hoveredDonut.percentage}%</strong> of total outflows.
              </div>
            )}
          </div>

        </div>
      )}

      {/* GST Accounting ledger section */}
      {!loading && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', padding: '20px 24px', marginBottom: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Landmark size={18} color="var(--primary)" />
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>GST Ledger Account (Inward / Outward details)</h3>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>GST Outward (Collected)</div>
              <div style={{ fontSize: '20px', fontWeight: 900, color: '#34d399' }}>{fmtRs(aggregates.gstOutward)}</div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>CGST+SGST liability from Passed Invoices.</div>
            </div>
            
            <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>GST Inward (ITC Claimed)</div>
              <div style={{ fontSize: '20px', fontWeight: 900, color: '#fb7185' }}>{fmtRs(aggregates.gstInward)}</div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>ITC tax credit on maintenance, office & tyres.</div>
            </div>

            <div style={{ 
              background: aggregates.netGstPayable >= 0 ? 'rgba(52,211,153,0.03)' : 'rgba(244,63,94,0.03)', 
              border: '1px solid var(--border)', 
              borderRadius: '14px', 
              padding: '16px' 
            }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>Net GST Payable</div>
              <div style={{ fontSize: '20px', fontWeight: 900, color: aggregates.netGstPayable >= 0 ? '#f59e0b' : '#34d399' }}>
                {fmtRs(aggregates.netGstPayable)}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                {aggregates.netGstPayable >= 0 ? 'Net tax due to GST department.' : 'Refundable / Carry forward credit.'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* detailed Profit and Loss Statement */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', overflow: 'hidden', marginBottom: '28px' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>
            P&L Consolidated Sheet - {formatMonthLabel(selectedMonth)} 
            {selectedLocation !== 'All' && <span style={{ color: 'var(--primary)', marginLeft: '8px' }}>[Location: {selectedLocation}]</span>}
            {selectedVehicle !== 'All' && <span style={{ color: '#8b5cf6', marginLeft: '8px' }}>[Truck: {selectedVehicle}]</span>}
          </h3>
        </div>
        
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
          <thead>
            <tr style={{ background: 'var(--bg-th)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '12px 24px', textAlign: 'left', fontWeight: 800, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Category Description</th>
              <th style={{ padding: '12px 24px', textAlign: 'right', fontWeight: 800, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Income (Inflows)</th>
              <th style={{ padding: '12px 24px', textAlign: 'right', fontWeight: 800, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Expenses (Outflows)</th>
              <th style={{ padding: '12px 24px', textAlign: 'center', fontWeight: 800, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Details</th>
            </tr>
          </thead>
          <tbody>
            
            {/* --- INCOMES SECTION --- */}
            <tr style={{ borderBottom: '1px solid var(--border-row)', background: 'rgba(255,255,255,0.01)' }}>
              <td style={{ padding: '14px 24px', fontWeight: 800, color: '#34d399' }} colSpan={4}>REVENUES / CREDITS</td>
            </tr>
            {Object.entries(aggregates.incomeCats).map(([cat, val]) => (
              <tr key={cat} style={{ borderBottom: '1px solid var(--border-row)' }}>
                <td style={{ padding: '12px 24px', paddingLeft: '40px', color: 'var(--text-sub)', fontWeight: 600 }}>{cat}</td>
                <td style={{ padding: '12px 24px', textAlign: 'right', fontWeight: 700, color: 'var(--text)' }}>{fmtRs(val)}</td>
                <td style={{ padding: '12px 24px', textAlign: 'right', color: 'var(--text-muted)' }}>—</td>
                <td style={{ padding: '12px 24px', textAlign: 'center' }}>
                  <button 
                    onClick={() => handleDrilldownClick(cat, 'income')} 
                    style={{ border: 'none', background: 'transparent', color: '#8b5cf6', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', fontWeight: 800 }}
                  >
                    <List size={13} /> View Logs
                  </button>
                </td>
              </tr>
            ))}
            
            {/* --- EXPENSES SECTION --- */}
            <tr style={{ borderBottom: '1px solid var(--border-row)', background: 'rgba(255,255,255,0.01)' }}>
              <td style={{ padding: '14px 24px', fontWeight: 800, color: '#fb7185' }} colSpan={4}>EXPENSES / DEBITS</td>
            </tr>
            {Object.entries(aggregates.expenseCats).map(([cat, val]) => (
              <tr key={cat} style={{ borderBottom: '1px solid var(--border-row)' }}>
                <td style={{ padding: '12px 24px', paddingLeft: '40px', color: 'var(--text-sub)', fontWeight: 600 }}>{cat}</td>
                <td style={{ padding: '12px 24px', textAlign: 'right', color: 'var(--text-muted)' }}>—</td>
                <td style={{ padding: '12px 24px', textAlign: 'right', fontWeight: 700, color: 'var(--text)' }}>{fmtRs(val)}</td>
                <td style={{ padding: '12px 24px', textAlign: 'center' }}>
                  <button 
                    onClick={() => handleDrilldownClick(cat, 'expense')} 
                    style={{ border: 'none', background: 'transparent', color: '#8b5cf6', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', fontWeight: 800 }}
                  >
                    <List size={13} /> View Logs
                  </button>
                </td>
              </tr>
            ))}

            {/* --- SUMMARY TOTALS ROW --- */}
            <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg-th)' }}>
              <td style={{ padding: '14px 24px', fontWeight: 900, color: 'white' }}>Total Business Summary</td>
              <td style={{ padding: '14px 24px', textAlign: 'right', fontWeight: 900, color: '#34d399' }}>{fmtRs(aggregates.totalIncome)}</td>
              <td style={{ padding: '14px 24px', textAlign: 'right', fontWeight: 900, color: '#fb7185' }}>{fmtRs(aggregates.totalExpense)}</td>
              <td style={{ padding: '14px 24px', textAlign: 'center', fontWeight: 800, color: aggregates.netProfit >= 0 ? '#34d399' : '#fb7185' }}>
                Profit: {fmtRs(aggregates.netProfit)}
              </td>
            </tr>

          </tbody>
        </table>
      </div>

      {/* Transaction Drill-down Lists Overlay/Card */}
      <AnimatePresence>
        {activeDrilldown && (
          <motion.div 
            initial={{ opacity: 0, y: 15 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: 15 }}
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', overflow: 'hidden' }}
          >
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.01)' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>
                  Drill Down Logs: <span style={{ color: activeDrilldown.type === 'income' ? '#34d399' : '#fb7185' }}>{activeDrilldown.category}</span>
                </h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                  Showing {activeDrilldown.records.length} individual items found for {formatMonthLabel(selectedMonth)} 
                  {selectedLocation !== 'All' && ` [Location: ${selectedLocation}]`}
                  {selectedVehicle !== 'All' && ` [Truck: ${selectedVehicle}]`}.
                </p>
              </div>
              <button 
                onClick={() => setActiveDrilldown(null)}
                style={{ border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700 }}
              >
                Close Logs
              </button>
            </div>

            <div style={{ overflowX: 'auto', maxHeight: '400px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-th)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '10px 24px', textAlign: 'left', fontWeight: 800, color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase' }}>Date</th>
                    <th style={{ padding: '10px 24px', textAlign: 'left', fontWeight: 800, color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase' }}>Location</th>
                    <th style={{ padding: '10px 24px', textAlign: 'left', fontWeight: 800, color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase' }}>Vehicle</th>
                    <th style={{ padding: '10px 24px', textAlign: 'left', fontWeight: 800, color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase' }}>Description Details</th>
                    <th style={{ padding: '10px 24px', textAlign: 'left', fontWeight: 800, color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase' }}>Reference</th>
                    <th style={{ padding: '10px 24px', textAlign: 'right', fontWeight: 800, color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {activeDrilldown.records.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>No records matches criteria</td>
                    </tr>
                  ) : (
                    activeDrilldown.records.map((rec, idx) => (
                      <tr key={rec.id} style={{ borderBottom: idx === activeDrilldown.records.length - 1 ? 'none' : '1px solid var(--border-row)', background: idx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                        <td style={{ padding: '12px 24px', color: 'var(--text)', fontWeight: 600 }}>
                          {new Date(rec.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td style={{ padding: '12px 24px', color: 'var(--primary)', fontWeight: 800, fontSize: '11px' }}>
                          {rec.location || 'Jharli'}
                        </td>
                        <td style={{ padding: '12px 24px', color: 'var(--text-sub)', fontWeight: 800, fontSize: '11px' }}>
                          <span style={{ padding: '2px 6px', background: 'rgba(99,102,241,0.1)', color: '#8b5cf6', borderRadius: '6px' }}>
                            {rec.truckNo || 'General/Firm'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 24px', color: 'var(--text-sub)', fontWeight: 600 }}>{rec.description}</td>
                        <td style={{ padding: '12px 24px', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '11.5px' }}>{rec.ref}</td>
                        <td style={{ padding: '12px 24px', textAlign: 'right', fontWeight: 800, color: activeDrilldown.type === 'income' ? '#34d399' : '#fb7185' }}>
                          {fmtRs(rec.amount)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
    </div>
  );
}
