const yaml = require('js-yaml');
const fs = require('fs');
const data = require('./data');
const file = data.joinPath('configuration.yaml');
const objectAssignDeep = require(`object-assign-deep`);
const path = require('path');

const onChangeHandlers = [];

const defaults = {
    permit_join: false,
    mqtt: {
        include_device_information: false,
    },
    groups: {},
    device_options: {},
    experimental: {
        livolo: false,
    },
    advanced: {
        log_directory: path.join(data.getPath(), 'log', '%TIMESTAMP%'),
        log_level: process.env.DEBUG ? 'debug' : 'info',
        soft_reset_timeout: 0,
        pan_id: 0x1a62,
        ext_pan_id: [0xDD, 0xDD, 0xDD, 0xDD, 0xDD, 0xDD, 0xDD, 0xDD],
        channel: 11,
        baudrate: 115200,
        rtscts: true,

        // Availability timeout in seconds, disabled by default.
        availability_timeout: 0,
        availability_blacklist: [],

        /**
         * Home Assistant requires ALL attributes to be present in ALL MQTT messages send by the device.
         * https://community.home-assistant.io/t/missing-value-with-mqtt-only-last-data-set-is-shown/47070/9
         *
         * Therefore zigbee2mqtt BY DEFAULT caches all values and resend it with every message.
         * advanced.cache_state in configuration.yaml allows to configure this.
         * https://www.zigbee2mqtt.io/configuration/configuration.html
         */
        cache_state: true,

        /**
         * Add a last_seen attribute to mqtt messages, contains date/time of zigbee message arrival
         * "ISO_8601": ISO 8601 format
         * "epoch": milliseconds elapsed since the UNIX epoch
         * "disable": no last_seen attribute (default)
         */
        last_seen: 'disable',

        // Optional: Add an elapsed attribute to MQTT messages, contains milliseconds since the previous msg
        elapsed: false,

        /**
         * https://github.com/Koenkk/zigbee2mqtt/issues/685#issuecomment-449112250
         *
         * Network key will serve as the encryption key of your network.
         * Changing this will require you to repair your devices.
         */
        network_key: [1, 3, 5, 7, 9, 11, 13, 15, 0, 2, 4, 6, 8, 10, 12, 13],
    },
};

let settings = read();

function writeRead() {
    write();
    settings = read();
    onChangeHandlers.forEach((handler) => handler());
}

function write() {
    fs.writeFileSync(file, yaml.safeDump(settings));
}

function read() {
    return yaml.safeLoad(fs.readFileSync(file, 'utf8'));
}

function set(path, value) {
    let obj = settings;

    for (let i = 0; i < path.length; i++) {
        const key = path[i];
        if (i === path.length - 1) {
            obj[key] = value;
        } else {
            if (!obj[key]) {
                obj[key] = {};
            }

            obj = obj[key];
        }
    }

    writeRead();
}

function addDevice(ieeeAddr) {
    if (!settings.devices) {
        settings.devices = {};
    }

    settings.devices[ieeeAddr] = {friendly_name: ieeeAddr, retain: false};
    writeRead();
}

function removeDevice(ieeeAddr) {
    if (settings.devices && settings.devices[ieeeAddr]) {
        delete settings.devices[ieeeAddr];
        writeRead();
    }
}

function getIeeeAddrByFriendlyName(friendlyName) {
    if (!settings.devices) {
        return null;
    }

    return Object.keys(settings.devices).find((ieeeAddr) =>
        settings.devices[ieeeAddr].friendly_name === friendlyName
    );
}

function getGroupIDByFriendlyName(friendlyName) {
    if (!settings.groups) {
        return null;
    }

    return Object.keys(settings.groups).find((ID) =>
        settings.groups[ID].friendly_name === friendlyName
    );
}

function changeDeviceOptions(ieeeAddr, newOptions) {
    const currentOptions = settings.devices[ieeeAddr];

    if (!currentOptions) {
        return;
    }

    Object.keys(currentOptions).forEach((key) => {
        if (newOptions[key]) {
            currentOptions[key] = newOptions[key];
        }
    });

    writeRead();
}

function changeFriendlyName(old, new_) {
    const ieeeAddr = getIeeeAddrByFriendlyName(old);

    if (!ieeeAddr) {
        return false;
    }

    settings.devices[ieeeAddr].friendly_name = new_;
    writeRead();
    return true;
}

module.exports = {
    get: () => objectAssignDeep.noMutate(defaults, settings),
    write: () => write(),
    set: (path, value) => set(path, value),

    getDevice: (ieeeAddr) => settings.devices ? settings.devices[ieeeAddr] : null,
    getGroup: (ID) => settings.groups ? settings.groups[ID]: null,
    getDevices: () => settings.devices ? settings.devices : [],
    addDevice: (ieeeAddr) => addDevice(ieeeAddr),
    removeDevice: (ieeeAddr) => removeDevice(ieeeAddr),

    getIeeeAddrByFriendlyName: (friendlyName) => getIeeeAddrByFriendlyName(friendlyName),
    getGroupIDByFriendlyName: (friendlyName) => getGroupIDByFriendlyName(friendlyName),
    changeFriendlyName: (old, new_) => changeFriendlyName(old, new_),
    changeDeviceOptions: (ieeeAddr, options) => changeDeviceOptions(ieeeAddr, options),

    addOnChangeHandler: (handler) => onChangeHandlers.push(handler),
};
