const { EventEmitter } = require('events');

// A small process-local fan-out channel for browser clients. The client also
// keeps an uncached polling fallback, so updates still arrive when a deployment
// routes the terminal and browser to different server instances.
const bus = new EventEmitter();
bus.setMaxListeners(250);

const publishAttendanceChange = (payload = {}) => {
    bus.emit('change', {
        type: 'attendance.changed',
        occurredAt: new Date().toISOString(),
        ...payload,
    });
};

const subscribeToAttendance = (listener) => {
    bus.on('change', listener);
    return () => bus.off('change', listener);
};

module.exports = { publishAttendanceChange, subscribeToAttendance };
