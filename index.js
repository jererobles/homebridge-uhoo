const request = require('request');
const Crypto = require('./crypto');

module.exports = function (homebridge) {
  const Service = homebridge.hap.Service;
  const Characteristic = homebridge.hap.Characteristic;
  const headers = {
    'Connection': 'keep-alive',
    'Accept': '*/*',
    'User-Agent': 'uHoo/11.0.19 (iPhone;14.5; iOS 17.0; Scale/3.00)',
    'Accept-Language': 'en-FI;q=1.0, fi-FI;q=0.9, de-FI;q=0.8, sv-FI;q=0.7, es-FI;q=0.6, ko-KR;q=0.5',
    'Accept-Encoding': 'gzip;q=1.0, compress;q=0.5',
  };

  // Register our accessory
  homebridge.registerAccessory('homebridge-uhoo', 'uHooAirQuality', uHooAirQuality);

  function uHooAirQuality(log, config) {
    this.log = log;
    this.name = config.name;

    // Define the services this accessory exposes
    this.serviceAirQuality = new Service.AirQualitySensor(this.name);
    this.serviceCO = new Service.CarbonMonoxideSensor(this.name);
    this.serviceCO2 = new Service.CarbonDioxideSensor(this.name);
    this.serviceTemp = new Service.TemperatureSensor(this.name);
    this.serviceHumidity = new Service.HumiditySensor(this.name);

    this.username = config.username; // Username for uHoo API
    this.password = config.password; // Password for uHoo API
    this.clientId = config.clientId; // Client ID should be provided in the config

    this.token = null; // Token for uHoo API
    this.data = null;
    this.errorCount = 0;
  }

  uHooAirQuality.prototype = {
    authenticate: function (callback) {
      if (this.token) {
        callback(null, this.token);
        return;
      }
      // Step 1: Get UID
      request.get('https://api.uhooinc.com/v1/user', (error, response, body) => {
        const uid = JSON.parse(body).uId; // Parse UID from response

        // Step 2: Get Client Code
        const form = { username: this.username, clientId: this.clientId };
        request.post('https://auth.uhooinc.com/verifyemail', {
          headers,
          form
        }, (error, response, body) => {
          const clientCode = JSON.parse(body).code; // Parse client code from response

          // Step 3: Encrypt Password
          const encryptedPassword = Crypto.getEncryptedPassword(this.password, uid, clientCode);

          // Step 4: Authenticate
          const form = { clientId: this.clientId, password: encryptedPassword, username: this.username };
          request.post('https://auth.uhooinc.com/login', {
            headers,
            form
          }, (error, response, body) => {
            this.log('Login successful');
            const authToken = JSON.parse(body).refreshToken; // Parse token from response
            this.token = authToken; // Store token for future use
            callback(null, authToken);
          });
        });
      });
    },

    getAirQuality: function (callback) {
      this.refreshValuesFromStore(callback); // use cached values immediately
      this.authenticate((error, authToken) => {
        if (error) {
          callback(error);
          return;
        }

        // URL for getting air quality data
        const url = 'https://api.uhooinc.com/v1/allconsumerdata';

        request.get({
          url: url,
          headers: {
            ...headers,
            'Authorization': `Bearer ${authToken}`
          }
        }, (error, response, body) => {
          if (error) {
            // Revoke token if there was an error
            this.token = null;
            callback(error);
          } else {
            // Parse the response and extract the CO2 value
            try {
              this.data = JSON.parse(body).devices[0].data;
              this.refreshValuesFromStore();
              this.errorCount = 0;
            } catch (error) {
              this.errorCount++;
              if (this.errorCount > 3) {
                this.errorCount = 0;
                callback(error);
              } else {
                this.token = null; // session likely expired
                this.refreshValuesFromStore(callback); // use cached values
              }
            }
          }
        });
      });
    },

    refreshValuesFromStore: function (callback) {
      try {
        if (!this.data && callback) {
          callback(null, Characteristic.AirQuality.UNKNOWN);
          return;
        }
        // Map the CO2 value to HomeKit's air quality characteristic
        const homeKitAirQuality = mapUHooToHomeKitAirQuality(this.data.co2.value);
        this.serviceAirQuality.getCharacteristic(Characteristic.AirQuality).updateValue(homeKitAirQuality);
        // Map CO, CO2, NO2, O3, TVOC, Dust(PM2.5) values to HomeKit's corresponding characteristics
        // TODO: check if unit conversion is needed
        this.serviceAirQuality.getCharacteristic(Characteristic.NitrogenDioxideDensity).updateValue(this.data.no2.value);
        this.serviceAirQuality.getCharacteristic(Characteristic.OzoneDensity).updateValue(this.data.ozone.value);
        this.serviceAirQuality.getCharacteristic(Characteristic.VOCDensity).updateValue(this.data.voc.value);
        this.serviceAirQuality.getCharacteristic(Characteristic.PM2_5Density).updateValue(this.data.dust.value);
        // Map Temperature, Humidity values to HomeKit's corresponding services/characteristics
        this.serviceCO.getCharacteristic(Characteristic.CarbonMonoxideLevel).updateValue(this.data.co.value);
        this.serviceCO.getCharacteristic(Characteristic.CarbonMonoxideDetected).updateValue(this.data.co.value > 0 ? 1 : 0);
        this.serviceCO2.getCharacteristic(Characteristic.CarbonDioxideLevel).updateValue(this.data.co2.value);
        this.serviceCO2.getCharacteristic(Characteristic.CarbonDioxideDetected).updateValue(this.data.co2.value > 1000 ? 1 : 0);
        this.serviceTemp.getCharacteristic(Characteristic.CurrentTemperature).updateValue(this.data.temp.value);
        this.serviceHumidity.getCharacteristic(Characteristic.CurrentRelativeHumidity).updateValue(this.data.humidity.value);

        if (callback) callback(null, homeKitAirQuality);
      } catch (error) {
        if (callback) callback(error);
      }
    },

    getServices: function () {
      this.serviceAirQuality
        .getCharacteristic(Characteristic.AirQuality)
        .on('get', this.getAirQuality.bind(this));

      return [
        this.serviceAirQuality,
        this.serviceCO,
        this.serviceCO2,
        this.serviceTemp,
        this.serviceHumidity
      ];
    }
  };

  function mapUHooToHomeKitAirQuality(co2) {
    // Here you can map the CO2 value to HomeKit's air quality characteristic
    // You'll need to define the thresholds according to your preferences
    if (co2 < 650) return Characteristic.AirQuality.EXCELLENT;
    if (co2 < 800) return Characteristic.AirQuality.GOOD;
    if (co2 < 920) return Characteristic.AirQuality.FAIR;
    return Characteristic.AirQuality.POOR;
  }
};
