const BALANCE_IDS = {
  all: 'balance-all',
  Kosli_Bill: 'balance-kosli',
  Jajjhar_Bill: 'balance-jhajjar',
  Bahadurgarh_Bill: 'balance-bahadurgarh',
  JK_Super: 'balance-jksuper',
  Dump: 'balance-jkl-dump',
  JK_Lakshmi: 'balance-jkl',
};

const CHALLAN_IDS = {
  kosli: 'challans-kosli',
  jhajjar: 'challans-jhajjar',
  bahadurgarh: 'challans-bahadurgarh',
  jkl: 'challans-jkl',
};

export const balanceSheetId = type => BALANCE_IDS[type] || null;
export const challanSheetId = brand => CHALLAN_IDS[brand] || null;
export const openSheet = id => id && window.open(`/sheet/${id}`, '_blank', 'noopener,noreferrer');
