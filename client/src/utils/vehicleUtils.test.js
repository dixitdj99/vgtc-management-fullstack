import {
  isMarketVehicle,
  isOwnFleetVehicle,
  isTestVehicle,
  normalizeMarketLocation,
} from './vehicleUtils.js';

let passed = 0;
const check = (label, condition) => {
  if (!condition) throw new Error(label);
  passed++;
  console.log(`ok    ${label}`);
};

check('explicit self is own fleet', isOwnFleetVehicle({ ownershipType: 'self' }));
check('legacy own is own fleet', isOwnFleetVehicle({ ownershipType: 'own' }));
check('legacy self flag is own fleet', isOwnFleetVehicle({ isSelf: true }));
check('Vikas Goods Transport (Self) is own fleet', isOwnFleetVehicle({ ownerName: 'Vikas Goods Transport (Self)' }));
check('legacy own row never becomes market', !isMarketVehicle({ ownershipType: 'market', ownerName: 'Vikas Transport (Self)' }));
check('normal explicit market row is market', isMarketVehicle({ ownershipType: 'market', ownerName: 'Rajesh Kumar', truckNo: 'HR471234' }));
check('missing ownership is not guessed as market', !isMarketVehicle({ ownerName: 'Rajesh Kumar' }));
check('Test Owner row is recognized as test data', isTestVehicle({ ownerName: 'Test Owner', truckNo: 'TEST0000' }));
check('test row is excluded from market', !isMarketVehicle({ ownershipType: 'market', ownerName: 'Test Owner', truckNo: 'TEST0000' }));
check('Jajjhar alias normalizes to Jhajjar', normalizeMarketLocation('Jajjhar') === 'jhajjar');
check('missing legacy location stays at Jharli', normalizeMarketLocation('') === 'jharli');

console.log(`\n${passed} passed, 0 failed`);
