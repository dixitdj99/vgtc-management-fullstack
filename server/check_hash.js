const b = require('bcryptjs');
const hash = '$2b$10$r2H680VR5GKau6uG3pOG9udvDOmAATimLqAYuV8rzQd4HBVdAYqAq';
console.log('admin123  matches:', b.compareSync('admin123', hash));
console.log('admin1234 matches:', b.compareSync('admin1234', hash));
console.log('admin     matches:', b.compareSync('admin', hash));
