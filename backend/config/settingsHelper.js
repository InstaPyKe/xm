const fs = require('fs');
const path = require('path');
const settingsPath = path.join(__dirname, 'settings.json');

exports.getSettings = () => {
  try {
    const raw = fs.readFileSync(settingsPath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return { registration_enabled: true, maintenance_mode: false };
  }
};

exports.saveSettings = (settings) => {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Failed to write settings file:', err);
    return false;
  }
};
