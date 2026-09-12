const settingsHelper = require('../config/settingsHelper');

module.exports = (req, res, next) => {
  const settings = settingsHelper.getSettings();
  if (settings.maintenance_mode) {
    return res.status(503).json({
      message: 'Scheduled Maintenance: We are currently performing system infrastructure upgrades. The Miner Cockpit will be back online shortly. Thank you for your patience!'
    });
  }
  next();
};
