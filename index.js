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
  }

  uHooAirQuality.prototype = {
    authenticate: function (callback) {
      if (this.token) {
        callback(null, this.token);
        return;
      }
      this.log('do authenticate');
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
            const authToken = JSON.parse(body).refreshToken; // Parse token from response
            this.token = authToken; // Store token for future use
            callback(null, authToken);
          });
        });
      });
    },

    getAirQuality: function (callback) {
      this.log('do getAirQuality');
      this.authenticate((error, authToken) => {
        if (error) {
          callback(error);
          return;
        }

        // URL for getting air quality data
        this.log(`Login successful`)
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
            this.log('Error fetching air quality:', error);
            callback(error);
          } else {
            // Parse the response and extract the CO2 value
            const data = JSON.parse(body).devices[0].data;

            // Map the CO2 value to HomeKit's air quality characteristic
            const homeKitAirQuality = mapUHooToHomeKitAirQuality(data.co2.value);
            this.serviceAirQuality.setCharacteristic(Characteristic.AirQuality, homeKitAirQuality);
            // Map CO, CO2, NO2, O3, TVOC, Dust(PM2.5) values to HomeKit's corresponding characteristics
            // TODO: check if unit conversion is needed
            this.serviceAirQuality.setCharacteristic(Characteristic.NitrogenDioxideDensity, data.no2.value);
            this.serviceAirQuality.setCharacteristic(Characteristic.OzoneDensity, data.ozone.value);
            this.serviceAirQuality.setCharacteristic(Characteristic.VOCDensity, data.voc.value);
            this.serviceAirQuality.setCharacteristic(Characteristic.PM2_5Density, data.dust.value);
            // Map Temperature, Humidity values to HomeKit's corresponding services/characteristics
            this.serviceCO.setCharacteristic(Characteristic.CarbonMonoxideLevel, data.co.value);
            this.serviceCO.setCharacteristic(Characteristic.CarbonMonoxideDetected, data.co.value > 0 ? 1 : 0);
            this.serviceCO2.setCharacteristic(Characteristic.CarbonDioxideLevel, data.co2.value);
            this.serviceCO2.setCharacteristic(Characteristic.CarbonDioxideDetected, data.co2.value > 1000 ? 1 : 0);
            this.serviceTemp.setCharacteristic(Characteristic.CurrentTemperature, data.temp.value);
            this.serviceHumidity.setCharacteristic(Characteristic.CurrentRelativeHumidity, data.humidity.value);

            callback(null, homeKitAirQuality);
          }
        });
      });
    },

    getServices: function () {
      this.serviceAirQuality
        .getCharacteristic(Characteristic.AirQuality)
        .on('get', this.getAirQuality.bind(this));
      // this.serviceCO
      //   .getCharacteristic(Characteristic.CarbonMonoxideLevel)
      //   .on('get', this.getAirQuality.bind(this));
      // this.serviceCO2
      //   .getCharacteristic(Characteristic.CarbonDioxideLevel)
      //   .on('get', this.getAirQuality.bind(this));
      // this.serviceTemp
      //   .getCharacteristic(Characteristic.CurrentTemperature)
      //   .on('get', this.getAirQuality.bind(this));
      // this.serviceHumidity
      //   .getCharacteristic(Characteristic.CurrentRelativeHumidity)
      //   .on('get', this.getAirQuality.bind(this));

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
